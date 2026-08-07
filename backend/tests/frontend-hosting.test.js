const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const express = require('express');

const {
  cacheControlForFrontendFile,
  installFrontendHosting,
  shouldServeSpaFallback
} = require('../lib/frontend-hosting');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

test('frontend hosting serves hashed assets with immutable caching and SPA routes without caching', async () => {
  const distDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-frontend-'));
  const assetsDir = path.join(distDir, 'assets');
  await fs.promises.mkdir(assetsDir, { recursive: true });
  await fs.promises.writeFile(path.join(distDir, 'index.html'), '<!doctype html><main>Artigen SPA</main>');
  await fs.promises.writeFile(path.join(distDir, 'logo.png'), 'logo');
  await fs.promises.writeFile(path.join(assetsDir, 'app-AbCdEf12.js'), 'console.log("asset")');

  const app = express();
  app.get('/api/known', (_req, res) => res.json({ ok: true }));
  assert.equal(installFrontendHosting(app, { distDir }).enabled, true);
  const server = await listen(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const asset = await fetch(`${base}/assets/app-AbCdEf12.js`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(await asset.text(), /console\.log/);

    const staticFile = await fetch(`${base}/logo.png`);
    assert.equal(staticFile.status, 200);
    assert.equal(staticFile.headers.get('cache-control'), 'public, max-age=3600');

    const spa = await fetch(`${base}/artigen/ai`, { headers: { Accept: 'text/html' } });
    assert.equal(spa.status, 200);
    assert.equal(spa.headers.get('cache-control'), 'no-store, max-age=0');
    assert.match(await spa.text(), /Artigen SPA/);

    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.promises.rm(distDir, { recursive: true, force: true });
  }
});

test('SPA fallback excludes service routes, non-GET requests and paths with extensions', () => {
  assert.equal(shouldServeSpaFallback({
    method: 'GET',
    path: '/artigen/editor',
    headers: { accept: 'text/html' }
  }), true);
  for (const pathname of ['/api/unknown', '/files/user/image.png', '/healthz', '/readyz']) {
    assert.equal(shouldServeSpaFallback({
      method: 'GET',
      path: pathname,
      headers: { accept: 'text/html' }
    }), false);
  }
  assert.equal(shouldServeSpaFallback({
    method: 'POST',
    path: '/artigen/editor',
    headers: { accept: 'text/html' }
  }), false);
  assert.equal(shouldServeSpaFallback({
    method: 'GET',
    path: '/assets/missing.js',
    headers: { accept: 'text/html' }
  }), false);
  assert.equal(
    cacheControlForFrontendFile('/tmp/dist/assets/app-AbCdEf12.js', '/tmp/dist'),
    'public, max-age=31536000, immutable'
  );
});
