const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  REPO_ROOT,
  assertDirectPostgresUrl,
  assertPathOutsideRepo,
  assertSafeIdentifier,
  assertSamePostgresDatabaseOrigin,
  parseOption,
  pruneBackupGroups,
  redactDatabaseUrl,
  resolvePostgresBinary,
  withPgCliEnvironment
} = require('../scripts/lib/postgres-ops');
const {
  prepareLocalEnvContent,
  readEnvValue
} = require('../scripts/setup-local-pg16');

const BACKEND_ROOT = path.resolve(__dirname, '..');

const runScript = (script, args, env = {}) =>
  spawnSync(process.execPath, [path.join(BACKEND_ROOT, 'scripts', script), ...args], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: '',
      DATABASE_MIGRATION_URL: '',
      AUDIT_DATABASE_URL: '',
      NEON_DATABASE_URL: '',
      NEON_VERIFY_DATABASE_URL: '',
      RESTORE_VERIFY_DATABASE_URL: '',
      ...env
    },
    encoding: 'utf8'
  });

test('postgres ops redact connection credentials and accept only safe identifiers', () => {
  const summary = redactDatabaseUrl(
    'postgresql://private-user:private-password@db.example.com:5432/artigen?sslmode=verify-full'
  );
  assert.deepEqual(summary, {
    protocol: 'postgresql',
    hostname: 'db.example.com',
    port: '5432',
    database: 'artigen',
    sslmode: 'verify-full'
  });
  assert.equal(JSON.stringify(summary).includes('private-password'), false);
  assert.equal(assertSafeIdentifier('artigen_restore_01', 'database'), 'artigen_restore_01');
  assert.throws(() => assertSafeIdentifier('artigen; DROP DATABASE prod', 'database'));
});

test('postgres ops parse inline and separate CLI values', () => {
  assert.equal(parseOption(['--dump', '/tmp/a.dump'], '--dump'), '/tmp/a.dump');
  assert.equal(parseOption(['--dump=/tmp/b.dump'], '--dump'), '/tmp/b.dump');
  assert.equal(parseOption(['--dump', '--dry-run'], '--dump'), '');
});

test('database operations reject Neon pooler URLs and require one database origin', () => {
  assert.doesNotThrow(() =>
    assertDirectPostgresUrl(
      'postgresql://user:secret@ep-green-field.us-east-2.aws.neon.tech/artigen?sslmode=require'
    )
  );
  assert.throws(
    () =>
      assertDirectPostgresUrl(
        'postgresql://user:secret@ep-green-field-pooler.us-east-2.aws.neon.tech/artigen?sslmode=require'
      ),
    (error) => {
      assert.equal(error.code, 'POSTGRES_DIRECT_URL_REQUIRED');
      assert.equal(error.message.includes('secret'), false);
      return true;
    }
  );
  assert.doesNotThrow(() =>
    assertSamePostgresDatabaseOrigin(
      'postgresql://migrator:one@db.example.com/artigen?sslmode=verify-full',
      'postgresql://runtime:two@DB.EXAMPLE.COM:5432/artigen?application_name=runtime'
    )
  );
  for (const runtimeUrl of [
    'postgresql://runtime:two@other.example.com/artigen',
    'postgresql://runtime:two@db.example.com:6432/artigen',
    'postgresql://runtime:two@db.example.com/another_database'
  ]) {
    assert.throws(
      () =>
        assertSamePostgresDatabaseOrigin(
          'postgresql://migrator:one@db.example.com/artigen',
          runtimeUrl
        ),
      (error) => error.code === 'POSTGRES_DATABASE_ORIGIN_MISMATCH'
    );
  }
});

test('backup output paths must remain outside the repository, including through symlinks', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-backup-path-'));
  try {
    assert.equal(
      assertPathOutsideRepo(path.join(outside, 'nested', 'backups')),
      path.join(fs.realpathSync(outside), 'nested', 'backups')
    );
    assert.throws(
      () => assertPathOutsideRepo(path.join(REPO_ROOT, '.private-backups')),
      (error) => error.code === 'BACKUP_DIRECTORY_INSIDE_REPOSITORY'
    );
    const linkToRepo = path.join(outside, 'repo-link');
    fs.symlinkSync(REPO_ROOT, linkToRepo, 'dir');
    assert.throws(
      () => assertPathOutsideRepo(path.join(linkToRepo, 'backups')),
      (error) => error.code === 'BACKUP_DIRECTORY_INSIDE_REPOSITORY'
    );
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('local env setup fills independent 256-bit secrets and disables a blank worker gate', () => {
  let byte = 1;
  const result = prepareLocalEnvContent(
    [
      'OTP_HMAC_SECRET=',
      'SESSION_TOKEN_HASH_SECRET=""',
      "CSRF_SECRET=''",
      'AGENT_PAYLOAD_ENCRYPTION_KEY=',
      'TASK_WORKER_ENABLED='
    ].join('\n'),
    {
      randomBytes: (length) => Buffer.from(
        Array.from({ length }, (_, index) => (index * 17 + byte++ * 29) % 256)
      )
    }
  );
  const values = [
    readEnvValue(result.content, 'OTP_HMAC_SECRET'),
    readEnvValue(result.content, 'SESSION_TOKEN_HASH_SECRET'),
    readEnvValue(result.content, 'CSRF_SECRET'),
    readEnvValue(result.content, 'AGENT_PAYLOAD_ENCRYPTION_KEY')
  ];
  assert.equal(result.changed, true);
  assert.deepEqual(result.generatedSecretNames, [
    'OTP_HMAC_SECRET',
    'SESSION_TOKEN_HASH_SECRET',
    'CSRF_SECRET',
    'AGENT_PAYLOAD_ENCRYPTION_KEY'
  ]);
  assert.equal(new Set(values).size, 4);
  assert.equal(values.every((value) => /^[0-9a-f]{64}$/.test(value)), true);
  assert.equal(values.every((value) => new Set(value).size >= 12), true);
  assert.equal(readEnvValue(result.content, 'TASK_WORKER_ENABLED'), '0');
});

test('local env setup fills blank database URLs while preserving every non-empty value', () => {
  const original = [
    'DATABASE_URL=',
    'TEST_DATABASE_URL=""',
    'NEON_VERIFY_DATABASE_URL=postgresql://keep.example.com/keep',
    'LOCAL_PG_USER=custom_user',
    `OTP_HMAC_SECRET=${'a1'.repeat(32)}`,
    `SESSION_TOKEN_HASH_SECRET=${'b2'.repeat(32)}`,
    `CSRF_SECRET=${'c3'.repeat(32)}`,
    `AGENT_PAYLOAD_ENCRYPTION_KEY=${'d4'.repeat(32)}`
  ].join('\n');
  const result = prepareLocalEnvContent(original, {
    initialValues: {
      DATABASE_URL: 'postgresql://localhost/artigen_dev',
      TEST_DATABASE_URL: 'postgresql://localhost/artigen_test',
      RESTORE_VERIFY_DATABASE_URL: 'postgresql://localhost/artigen_restore_verify',
      NEON_VERIFY_DATABASE_URL: 'postgresql://localhost/artigen_restore_verify',
      LOCAL_PG_USER: 'artigen'
    }
  });
  assert.equal(readEnvValue(result.content, 'DATABASE_URL'), 'postgresql://localhost/artigen_dev');
  assert.equal(readEnvValue(result.content, 'TEST_DATABASE_URL'), 'postgresql://localhost/artigen_test');
  assert.equal(
    readEnvValue(result.content, 'RESTORE_VERIFY_DATABASE_URL'),
    'postgresql://localhost/artigen_restore_verify'
  );
  assert.equal(
    readEnvValue(result.content, 'NEON_VERIFY_DATABASE_URL'),
    'postgresql://keep.example.com/keep'
  );
  assert.equal(readEnvValue(result.content, 'LOCAL_PG_USER'), 'custom_user');
  assert.deepEqual(result.filledValueNames, [
    'DATABASE_URL',
    'TEST_DATABASE_URL',
    'RESTORE_VERIFY_DATABASE_URL'
  ]);
});

test('local env setup never overwrites non-empty security or worker values', () => {
  const original = [
    `OTP_HMAC_SECRET=${'a'.repeat(64)}`,
    `SESSION_TOKEN_HASH_SECRET=${'b'.repeat(64)}`,
    `CSRF_SECRET=${'c'.repeat(64)}`,
    `AGENT_PAYLOAD_ENCRYPTION_KEY=${'d'.repeat(64)}`,
    'TASK_WORKER_ENABLED=1'
  ].join('\n');
  const result = prepareLocalEnvContent(original, {
    randomBytes: () => {
      throw new Error('randomBytes must not run when values are present');
    }
  });
  assert.equal(result.changed, false);
  assert.equal(result.content, original);
  assert.deepEqual(result.generatedSecretNames, []);
});

test('postgres client binaries honor an explicit keg-only PG_BIN_DIR', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-pg-bin-'));
  const binary = path.join(directory, 'pg_dump');
  try {
    fs.writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    assert.equal(resolvePostgresBinary('pg_dump', { PG_BIN_DIR: directory }), binary);
    assert.throws(
      () => resolvePostgresBinary('pg_restore', { PG_BIN_DIR: directory }),
      /PG_BIN_DIR does not contain an executable pg_restore/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PostgreSQL CLI URLs are split into libpq environment variables instead of process arguments', async () => {
  await withPgCliEnvironment(
    'postgresql://backup%2Buser:p%23ssword@db.example.com:6432/artigen?sslmode=verify-full&channel_binding=require',
    async (env) => {
      assert.equal(env.PGHOST, 'db.example.com');
      assert.equal(env.PGPORT, '6432');
      assert.equal(env.PGUSER, 'backup+user');
      assert.equal(env.PGPASSWORD, 'p#ssword');
      assert.equal(env.PGDATABASE, 'artigen');
      assert.equal(env.PGSSLMODE, 'verify-full');
      assert.equal(env.PGCHANNELBINDING, 'require');
      assert.ok(env.PGSSLROOTCERT);
    },
    {}
  );
});

test('backup retention removes complete old groups and keeps the newest fourteen', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-backup-retention-'));
  try {
    for (let index = 0; index < 16; index += 1) {
      const baseName = `artigen-neon-2026-01-${String(index + 1).padStart(2, '0')}`;
      fs.writeFileSync(path.join(directory, `${baseName}.dump`), 'dump');
      fs.writeFileSync(
        path.join(directory, `${baseName}.manifest.json`),
        JSON.stringify({ createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString() })
      );
      fs.writeFileSync(path.join(directory, `${baseName}.sha256`), 'checksum');
    }
    fs.writeFileSync(
      path.join(directory, 'artigen-neon-2099-12-31.manifest.json'),
      JSON.stringify({ createdAt: '2099-12-31T00:00:00.000Z' })
    );
    const removed = pruneBackupGroups(directory, 14);
    assert.deepEqual(removed.sort(), [
      'artigen-neon-2026-01-01',
      'artigen-neon-2026-01-02'
    ]);
    for (const baseName of removed) {
      for (const suffix of ['.dump', '.manifest.json', '.sha256']) {
        assert.equal(fs.existsSync(path.join(directory, `${baseName}${suffix}`)), false);
      }
    }
    assert.equal(fs.existsSync(path.join(directory, 'artigen-neon-2026-01-16.dump')), true);
    assert.equal(
      fs.existsSync(path.join(directory, 'artigen-neon-2099-12-31.manifest.json')),
      true
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('database operation dry-runs do not require credentials or mutate a database', () => {
  for (const [script, args] of [
    ['audit-postgres.js', ['--dry-run']],
    ['neon-backup.js', ['--dry-run']],
    ['neon-restore-verify.js', ['--dry-run']],
    ['start-production.js', ['--dry-run']]
  ]) {
    const result = runScript(script, args);
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
    assert.match(result.stdout, /"dryRun": true/);
  }
});

test('backup dry-run rejects a repository output directory before writing files', () => {
  const result = runScript('neon-backup.js', [
    '--dry-run',
    '--output-dir',
    path.join(REPO_ROOT, '.private-backups')
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be outside the repository/);
});

test('restore verification refuses to proceed without explicit destructive confirmation', () => {
  const result = runScript(
    'neon-restore-verify.js',
    ['--dump', '/tmp/not-used.dump'],
    {
      NEON_VERIFY_DATABASE_URL:
        'postgresql://user:secret@verify.example.com/artigen_restore?sslmode=require'
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEON_VERIFY_ALLOW_RESET=1 is required/);
  assert.equal(result.stderr.includes('secret'), false);
});

test('production startup rejects pooled or cross-database URLs even in dry-run mode', () => {
  const pooled = runScript('start-production.js', ['--dry-run'], {
    DATABASE_URL:
      'postgresql://runtime:secret@ep-green-field-pooler.us-east-2.aws.neon.tech/artigen'
  });
  assert.equal(pooled.status, 1);
  assert.match(pooled.stderr, /must use a Neon direct hostname/);
  assert.equal(pooled.stderr.includes('secret'), false);

  const mismatch = runScript('start-production.js', ['--dry-run'], {
    DATABASE_MIGRATION_URL: 'postgresql://migrator:secret@db.example.com/artigen',
    DATABASE_URL: 'postgresql://runtime:secret@db.example.com/another'
  });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /same PostgreSQL hostname, port, and database/);
  assert.equal(mismatch.stderr.includes('secret'), false);
});

test('production startup dry-run never exposes database credentials', () => {
  const result = runScript('start-production.js', ['--dry-run'], {
    DATABASE_URL:
      'postgresql://deploy-user:deploy-password@db.example.com/artigen?sslmode=verify-full'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"hostname": "db.example.com"/);
  assert.equal(result.stdout.includes('deploy-user'), false);
  assert.equal(result.stdout.includes('deploy-password'), false);
});
