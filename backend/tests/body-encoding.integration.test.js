const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const freePort = () => new Promise((resolve, reject) => {
  const server = http.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});

test('public parsers handle compressed bodies and survive trailing invalid bytes', { timeout: 30000 }, async () => {
  const port = await freePort();
  const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-body-test-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../server.js')], {
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', PORT: String(port),
      MEMORY_DIR: memoryDir, DATABASE_URL: '', DATABASE_MIGRATION_URL: '',
      AGENT_FEATURE_ENABLED: 'false', PAID_FEATURES_ENABLED: 'false'
    },
    stdio: 'ignore'
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error('test server exited before readiness');
      try {
        if ((await fetch(`${origin}/healthz`)).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true);
    for (const [url, type, payload] of [
      ['/api/body-parser-audit-missing', 'application/json', '{"value":"test"}'],
      ['/api/body-parser-audit-missing', 'application/x-www-form-urlencoded', 'value=test'],
      ['/api/workspace/projects/test/files', 'application/json', '{"name":"test"}']
    ]) {
      const valid = zlib.gzipSync(payload);
      const headers = { 'content-type': type, 'content-encoding': 'gzip' };
      const accepted = await fetch(origin + url, { method: 'POST', headers, body: valid });
      assert.notEqual(accepted.status, 415, `${url} should accept gzip`);
      assert.ok(accepted.status < 500, `${url} should not error`);
      const body = Buffer.concat([valid, Buffer.from('trailing-invalid-frame')]);
      const response = await fetch(origin + url, { method: 'POST', headers, body });
      assert.ok(response.status < 500, `${url} ${type}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal((await fetch(`${origin}/healthz`)).status, 200);
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000).unref();
    });
    fs.rmSync(memoryDir, { recursive: true, force: true });
  }
});
