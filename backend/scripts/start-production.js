#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const {
  BACKEND_ROOT,
  EXPECTED_POSTGRES_MAJOR,
  assertDirectPostgresUrl,
  assertSamePostgresDatabaseOrigin,
  assertServerMajor,
  createClient,
  hasFlag,
  redactDatabaseUrl,
  runMigrations
} = require('./lib/postgres-ops');
const {
  assertDevDatabaseBoundary,
  assertDevDatabaseUrlProfile
} = require('./lib/dev-database-boundary');

const HELP = `
Run all PostgreSQL migrations under an application-specific advisory lock, then start Artigen.

Usage:
  pnpm --filter backend start:production
  pnpm --filter backend db:migrate:locked
  pnpm --filter backend start:production -- --dry-run

Connection precedence for migrations:
  DATABASE_MIGRATION_URL -> DATABASE_URL

Both URLs must be direct (non-pooler) PostgreSQL URLs and, when both are set,
must target the same hostname, port, and database.

Environment:
  MIGRATION_LOCK_TIMEOUT_MS  Wait timeout (default: 120000)
  MIGRATION_LOCK_POLL_MS     Poll interval (default: 1000)
`.trim();

const LOCK_NAMESPACE = 1_097_591_407;
const LOCK_RESOURCE = 1_907_177_015;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const acquireMigrationLock = async (client) => {
  const timeout = Math.max(1_000, Number(process.env.MIGRATION_LOCK_TIMEOUT_MS || 120_000) || 120_000);
  const poll = Math.max(
    100,
    Math.min(5_000, Number(process.env.MIGRATION_LOCK_POLL_MS || 1_000) || 1_000)
  );
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await client.query(
      'SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired',
      [LOCK_NAMESPACE, LOCK_RESOURCE]
    );
    if (result.rows[0]?.acquired === true) return;
    await delay(Math.min(poll, Math.max(0, deadline - Date.now())));
  }
  const error = new Error(`Timed out after ${timeout}ms waiting for the production migration lock`);
  error.code = 'MIGRATION_LOCK_TIMEOUT';
  throw error;
};

const releaseMigrationLock = async (client) => {
  const result = await client.query(
    'SELECT pg_advisory_unlock($1::integer, $2::integer) AS released',
    [LOCK_NAMESPACE, LOCK_RESOURCE]
  );
  if (result.rows[0]?.released !== true) {
    throw new Error('The production migration advisory lock was not held by this session');
  }
};

const migrate = async (connectionString, {
  expectedPostgresMajor = EXPECTED_POSTGRES_MAJOR
} = {}) => {
  const client = createClient(connectionString);
  await client.connect();
  let lockHeld = false;
  let operationError = null;
  try {
    await assertServerMajor(client, expectedPostgresMajor);
    await acquireMigrationLock(client);
    lockHeld = true;
    const migrations = await runMigrations({ dbClient: client });
    console.log(`[start:production] Applied ${migrations.length} migration(s)`);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    let cleanupError = null;
    if (lockHeld) {
      try {
        await releaseMigrationLock(client);
      } catch (error) {
        cleanupError = error;
      }
    }
    try {
      await client.end();
    } catch (error) {
      cleanupError ||= error;
    }
    if (cleanupError && operationError) {
      console.error(`[start:production] Migration cleanup also failed: ${cleanupError.message}`);
    } else if (cleanupError) {
      throw cleanupError;
    }
  }
};

const startServer = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(BACKEND_ROOT, 'server.js')], {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production'
      },
      stdio: 'inherit'
    });
    let terminating = false;
    const forward = (signal) => {
      if (terminating) return;
      terminating = true;
      if (!child.killed) child.kill(signal);
    };
    const onSigterm = () => forward('SIGTERM');
    const onSigint = () => forward('SIGINT');
    process.once('SIGTERM', onSigterm);
    process.once('SIGINT', onSigint);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      process.removeListener('SIGTERM', onSigterm);
      process.removeListener('SIGINT', onSigint);
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code || 0);
    });
  });

const main = async () => {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    console.log(HELP);
    return;
  }

  const migrationUrl = String(process.env.DATABASE_MIGRATION_URL || '').trim();
  const runtimeUrl = String(process.env.DATABASE_URL || '').trim();
  const connectionString = migrationUrl || runtimeUrl;
  if (migrationUrl && runtimeUrl) {
    assertSamePostgresDatabaseOrigin(migrationUrl, runtimeUrl);
  } else if (connectionString) {
    assertDirectPostgresUrl(
      connectionString,
      migrationUrl ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL'
    );
  }
  const devDatabaseProfile = assertDevDatabaseUrlProfile({
    migrationUrl,
    runtimeUrl,
    env: process.env
  });
  if (hasFlag(argv, '--dry-run')) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          database: connectionString ? redactDatabaseUrl(connectionString) : '(DATABASE_URL not set)',
          migrations: 'backend/migrations/*.js',
          lock: [LOCK_NAMESPACE, LOCK_RESOURCE],
          startServer: !hasFlag(argv, '--migrate-only')
        },
        null,
        2
      )
    );
    return;
  }
  if (!connectionString) {
    throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required; production startup is fail-closed');
  }

  const verifiedDevProfile = await assertDevDatabaseBoundary({
    migrationUrl,
    runtimeUrl,
    env: process.env
  });
  if (
    Boolean(devDatabaseProfile) !== Boolean(verifiedDevProfile) ||
    devDatabaseProfile?.expectedPostgresMajor !== verifiedDevProfile?.expectedPostgresMajor
  ) {
    throw new Error('DEV database profile verification changed during startup');
  }
  await migrate(connectionString, {
    expectedPostgresMajor: verifiedDevProfile?.expectedPostgresMajor || EXPECTED_POSTGRES_MAJOR
  });
  if (hasFlag(argv, '--migrate-only')) return;
  const exitCode = await startServer();
  process.exitCode = exitCode;
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[start:production] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, migrate };
