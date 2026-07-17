const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const { installFrontendHosting } = require('../lib/frontend-hosting');
const {
  SESSION_MIDDLEWARE_PATHS,
  installSessionMiddleware
} = require('../middleware/session-auth');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

test('database sessions hydrate only API and private file requests', async () => {
  const distDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-session-scope-'));
  const assetsDir = path.join(distDir, 'assets');
  await fs.promises.mkdir(assetsDir, { recursive: true });
  await fs.promises.writeFile(path.join(distDir, 'index.html'), '<!doctype html><main>Artigen SPA</main>');
  await fs.promises.writeFile(path.join(assetsDir, 'app-AbCdEf12.js'), 'export default true');

  let lookups = 0;
  const app = express();
  installSessionMiddleware(app, {
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://session-scope.test/artigen'
    },
    authService: {
      async resolveSession(token) {
        lookups += 1;
        return { ok: true, token, userId: 'user_scope' };
      }
    }
  });
  app.get('/api/probe', (req, res) => res.json(req.authResolution));
  app.get('/files/probe', (req, res) => res.json(req.authResolution));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', (_req, res) => res.json({ ok: true }));
  installFrontendHosting(app, { distDir });

  const server = await listen(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  const authenticated = {
    headers: {
      Accept: 'text/html',
      Cookie: 'auth_token=opaque-session-token'
    }
  };
  try {
    assert.deepEqual(SESSION_MIDDLEWARE_PATHS, ['/api', '/files']);
    for (const pathname of [
      '/',
      '/artigen/ai',
      '/assets/app-AbCdEf12.js',
      '/healthz',
      '/readyz',
      '/apix',
      '/filesx'
    ]) {
      assert.equal((await fetch(`${base}${pathname}`, authenticated)).status, 200);
    }
    assert.equal(lookups, 0);

    const api = await fetch(`${base}/api/probe`, authenticated);
    assert.equal(api.status, 200);
    assert.equal((await api.json()).userId, 'user_scope');
    assert.equal(lookups, 1);

    const file = await fetch(`${base}/files/probe`, authenticated);
    assert.equal(file.status, 200);
    assert.equal((await file.json()).userId, 'user_scope');
    assert.equal(lookups, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.promises.rm(distDir, { recursive: true, force: true });
  }
});
