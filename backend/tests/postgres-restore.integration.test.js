// Opt-in: RUN_POSTGRES_RESTORE_DRILL=1 node --test backend/tests/postgres-restore.integration.test.js
// Uses only newly created, loopback-bound Docker fixtures. Never reads application DB URLs.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const test = require('node:test');
const { Client } = require('pg');
const { runMigrations } = require('../scripts/lib/postgres-ops');

const exec = promisify(execFile);
const enabled = process.env.RUN_POSTGRES_RESTORE_DRILL === '1';
const majors = [16, 18];
const backendRoot = path.resolve(__dirname, '..');
const docker = (...args) => exec('docker', args, { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });

for (const major of majors) {
  test(`PostgreSQL ${major}: backup, isolated restore, corruption refusal and invariant audit`, {
    skip: !enabled,
    timeout: 240_000
  }, async () => {
    const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'artigen-restore-drill-'));
    fs.chmodSync(directory, 0o700);
    const container = `artigen-restore-${major}-${crypto.randomUUID().slice(0, 8)}`;
    const password = crypto.randomBytes(24).toString('hex');
    let started = false;
    let admin;
    let source;
    let target;
    try {
      // Credentials apply only to this disposable fixture; no volume or application data is mounted.
      await exec('docker', [
        'run', '--detach', '--rm', '--name', container,
        '--publish', '127.0.0.1::5432',
        '--mount', `type=bind,source=${directory},target=${directory}`,
        '--env', 'POSTGRES_PASSWORD', `postgres:${major}-alpine`
      ], { env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 120_000 });
      started = true;
      const binding = JSON.parse((await docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', container)).stdout);
      const port = binding['5432/tcp'][0].HostPort;
      const connection = (database) => ({
        host: '127.0.0.1', port: Number(port), user: 'postgres', password,
        database, ssl: false, connectionTimeoutMillis: 1000
      });
      for (let attempt = 0; attempt < 40; attempt++) {
        admin = new Client(connection('postgres'));
        try { await admin.connect(); break; } catch (error) {
          await admin.end().catch(() => {});
          if (attempt === 39) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      await admin.query('CREATE DATABASE artigen_drill_source');
      await admin.query('CREATE DATABASE artigen_restore_target');
      source = new Client(connection('artigen_drill_source'));
      target = new Client(connection('artigen_restore_target'));
      await source.connect();
      await target.connect();
      await runMigrations({ dbClient: source, log: () => {} });
      const { rows: [user] } = await source.query("INSERT INTO users(display_name) VALUES ('Synthetic restore fixture') RETURNING id");
      await source.query('INSERT INTO wallets(user_id) VALUES ($1)', [user.id]);
      await source.query('CREATE TABLE public.restore_probe (id serial PRIMARY KEY, owner_id uuid REFERENCES users(id), payload text NOT NULL, binary_payload bytea NOT NULL)');
      const payload = '恢复演练 / coffee / ☕ '.repeat(100);
      const binary = Buffer.from([0, 1, 127, 128, 254, 255]);
      await source.query('INSERT INTO restore_probe(owner_id,payload,binary_payload) VALUES ($1,$2,$3)', [user.id, payload, binary]);
      await source.query('CREATE SCHEMA drill_queue');
      await source.query("CREATE TABLE drill_queue.probe AS SELECT 'synthetic queued item'::text AS payload");

      const bin = path.join(directory, 'bin');
      fs.mkdirSync(bin, { mode: 0o700 });
      for (const binaryName of ['pg_dump', 'pg_restore']) {
        // CLI connections run inside the fixture; Node connects through its random loopback port.
        fs.writeFileSync(path.join(bin, binaryName), `#!/bin/sh\nexec docker exec --user ${process.getuid()}:${process.getgid()} -e PGHOST=127.0.0.1 -e PGPORT=5432 -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE ${container} ${binaryName} "$@"\n`, { mode: 0o700 });
      }
      const sourceUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/artigen_drill_source?sslmode=disable`;
      const targetUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/artigen_restore_target?sslmode=disable`;
      const env = {
        PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST,
        PG_BIN_DIR: bin, PG_OPS_EXPECTED_MAJOR: String(major),
        PG_SSL_REQUIRED: '0', PG_SSL_REJECT_UNAUTHORIZED: '1',
        DATABASE_URL: '', DATABASE_MIGRATION_URL: '',
        NEON_DATABASE_URL: sourceUrl, RESTORE_VERIFY_DATABASE_URL: targetUrl,
        NEON_VERIFY_DATABASE_URL: '', NEON_VERIFY_ALLOW_RESET: '1'
      };
      const run = (script, args = [], overrides = {}) => exec(process.execPath, [path.join(backendRoot, 'scripts', script), ...args], {
        cwd: backendRoot, env: { ...env, ...overrides }, timeout: 60_000, maxBuffer: 2 * 1024 * 1024
      });
      const backup = JSON.parse((await run('neon-backup.js', ['--output-dir', path.join(directory, 'backups')])).stdout);
      assert.equal(backup.ok, true);
      const manifest = JSON.parse(fs.readFileSync(backup.manifestPath, 'utf8'));
      assert.equal(manifest.postgres.major, major);
      assert.equal(manifest.tableCounts.restore_probe, '1');
      assert.ok(manifest.migrations.length >= 30);
      assert.equal(fs.statSync(backup.dumpPath).mode & 0o777, 0o600);
      assert.equal(fs.statSync(backup.manifestPath).mode & 0o777, 0o600);
      await source.query("UPDATE restore_probe SET payload = 'changed after backup'");
      const restored = JSON.parse((await run('neon-restore-verify.js', ['--dump', backup.dumpPath])).stdout);
      assert.equal(restored.ok, true);
      assert.equal(restored.databaseAudit.ok, true);
      const { rows: [probe] } = await target.query('SELECT payload,binary_payload FROM restore_probe');
      assert.equal(probe.payload, payload);
      assert.deepEqual(probe.binary_payload, binary);
      assert.equal((await target.query('SELECT payload FROM drill_queue.probe')).rows[0].payload, 'synthetic queued item');
      assert.equal((await target.query('INSERT INTO restore_probe(owner_id,payload,binary_payload) VALUES ($1,$2,$3) RETURNING id', [user.id, 'sequence check', binary])).rows[0].id, 2);
      const audit = JSON.parse((await run('audit-postgres.js', [], { AUDIT_DATABASE_URL: targetUrl })).stdout);
      assert.equal(audit.ok, true);

      // A changed dump must fail without clearing the restored rows.
      fs.appendFileSync(backup.dumpPath, 'corrupt');
      await assert.rejects(run('neon-restore-verify.js', ['--dump', backup.dumpPath]), (error) => /checksum does not match/.test(error.stderr));
      assert.equal((await target.query('SELECT count(*)::int AS n FROM restore_probe')).rows[0].n, 2);

      // Even a checksum-consistent file must be a readable archive before schema reset.
      fs.writeFileSync(backup.dumpPath, 'not a postgres archive');
      manifest.dump.bytes = fs.statSync(backup.dumpPath).size;
      manifest.dump.sha256 = crypto.createHash('sha256').update(fs.readFileSync(backup.dumpPath)).digest('hex');
      fs.writeFileSync(backup.manifestPath, JSON.stringify(manifest));
      await assert.rejects(run('neon-restore-verify.js', ['--dump', backup.dumpPath]), (error) => /pg_restore/.test(error.stderr));
      assert.equal((await target.query('SELECT count(*)::int AS n FROM restore_probe')).rows[0].n, 2);
    } finally {
      await Promise.allSettled([admin?.end(), source?.end(), target?.end()]);
      if (started) await docker('rm', '--force', container);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
