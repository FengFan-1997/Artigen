#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const { runDatabaseAudit } = require('./lib/database-audit');
const {
  assertDirectPostgresUrl,
  assertPostgresBinaryMajor,
  assertServerMajor,
  createClient,
  hasFlag,
  parseOption,
  postgresConnectionIdentity,
  quoteIdentifier,
  redactDatabaseUrl,
  runProcess,
  sha256File,
  withPgCliEnvironment
} = require('./lib/postgres-ops');

const HELP = `
Restore a backup into a disposable PostgreSQL 16 database and verify its manifest.

Usage:
  RESTORE_VERIFY_DATABASE_URL=... NEON_VERIFY_ALLOW_RESET=1 \\
    pnpm --filter backend db:restore:verify -- --dump /secure/path/artigen-neon-....dump

Safety rules:
  - the target database name must contain "verify", "restore", or "drill";
  - NEON_VERIFY_ALLOW_RESET must equal 1;
  - the target must not equal DATABASE_URL or DATABASE_MIGRATION_URL;
  - the target public schema is dropped and recreated.
  - RESTORE_VERIFY_DATABASE_URL is preferred; NEON_VERIFY_DATABASE_URL is a compatibility alias.
`.trim();

const connectionIdentityKey = ({ hostname, port, database }) =>
  `${String(hostname).toLowerCase()}:${String(port || '5432')}/${String(database)}`;

const resolveManifestPath = (dumpPath, explicitPath) => {
  if (explicitPath) return path.resolve(explicitPath);
  if (/\.dump$/i.test(dumpPath)) return dumpPath.replace(/\.dump$/i, '.manifest.json');
  return `${dumpPath}.manifest.json`;
};

const readMigrationNames = async (client) => {
  const exists = await client.query(`SELECT to_regclass('public.pgmigrations') AS table_name`);
  if (!exists.rows[0]?.table_name) return [];
  const result = await client.query('SELECT name FROM public.pgmigrations ORDER BY run_on, name');
  return result.rows.map((row) => String(row.name));
};

const verifyRestoredDatabase = async (client, manifest) => {
  const mismatches = [];
  const tableCounts = {};
  const expectedCounts = manifest.tableCounts && typeof manifest.tableCounts === 'object'
    ? manifest.tableCounts
    : {};

  for (const [table, expectedCount] of Object.entries(expectedCounts)) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(table)) {
      mismatches.push({ type: 'unsafe_manifest_table', table });
      continue;
    }
    const exists = await client.query('SELECT to_regclass($1) AS table_name', [`public.${table}`]);
    if (!exists.rows[0]?.table_name) {
      mismatches.push({ type: 'missing_table', table });
      continue;
    }
    const result = await client.query(`SELECT count(*)::text AS count FROM public.${quoteIdentifier(table)}`);
    const actualCount = String(result.rows[0]?.count || '0');
    tableCounts[table] = actualCount;
    if (actualCount !== String(expectedCount)) {
      mismatches.push({
        type: 'row_count',
        table,
        expected: String(expectedCount),
        actual: actualCount
      });
    }
  }

  const migrations = await readMigrationNames(client);
  const expectedMigrations = Array.isArray(manifest.migrations)
    ? manifest.migrations.map(String)
    : [];
  if (JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)) {
    mismatches.push({
      type: 'migrations',
      expected: expectedMigrations,
      actual: migrations
    });
  }

  const invalidConstraints = await client.query(
    `SELECT conrelid::regclass::text AS table_name, conname
       FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND NOT convalidated`
  );
  if (invalidConstraints.rowCount) {
    mismatches.push({
      type: 'unvalidated_constraints',
      constraints: invalidConstraints.rows
    });
  }

  const requiredTables = ['users', 'wallets', 'wallet_ledger', 'tool_tasks', 'assets', 'pgmigrations'];
  const expectedTableNames = new Set(Object.keys(expectedCounts));
  for (const table of requiredTables) {
    if (expectedTableNames.has(table) && !Object.prototype.hasOwnProperty.call(tableCounts, table)) {
      mismatches.push({ type: 'missing_core_table', table });
    }
  }

  return { mismatches, migrations, tableCounts };
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    console.log(HELP);
    return;
  }

  const dumpArgument = parseOption(argv, '--dump');
  const targetUrl = String(
    process.env.RESTORE_VERIFY_DATABASE_URL ||
      process.env.NEON_VERIFY_DATABASE_URL ||
      ''
  ).trim();
  if (targetUrl) assertDirectPostgresUrl(targetUrl, 'Restore verification database URL');
  if (hasFlag(argv, '--dry-run')) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          dump: dumpArgument ? path.resolve(dumpArgument) : '(--dump not set)',
          target: targetUrl
            ? redactDatabaseUrl(targetUrl)
            : '(RESTORE_VERIFY_DATABASE_URL not set)',
          action: 'drop/recreate public schema, pg_restore, compare checksum/migrations/table counts and financial invariants'
        },
        null,
        2
      )
    );
    return;
  }
  if (!dumpArgument) throw new Error('--dump is required');
  if (!targetUrl) {
    throw new Error('RESTORE_VERIFY_DATABASE_URL or NEON_VERIFY_DATABASE_URL is required');
  }
  if (process.env.NEON_VERIFY_ALLOW_RESET !== '1') {
    throw new Error('NEON_VERIFY_ALLOW_RESET=1 is required because the target public schema will be deleted');
  }

  const target = assertDirectPostgresUrl(targetUrl, 'Restore verification database URL');
  const targetDatabase = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!/(verify|restore|drill)/i.test(targetDatabase)) {
    throw new Error('The verification database name must contain "verify", "restore", or "drill"');
  }
  const targetIdentity = connectionIdentityKey(
    postgresConnectionIdentity(targetUrl, 'Restore verification database URL')
  );
  for (const sourceUrl of [process.env.DATABASE_URL, process.env.DATABASE_MIGRATION_URL]) {
    if (
      sourceUrl &&
      connectionIdentityKey(postgresConnectionIdentity(sourceUrl)) === targetIdentity
    ) {
      throw new Error(
        'RESTORE_VERIFY_DATABASE_URL must not point at DATABASE_URL or DATABASE_MIGRATION_URL'
      );
    }
  }

  const dumpPath = path.resolve(dumpArgument);
  const manifestPath = resolveManifestPath(dumpPath, parseOption(argv, '--manifest'));
  if (!fs.existsSync(dumpPath)) throw new Error(`Backup dump not found: ${dumpPath}`);
  if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest not found: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.dump?.format !== 'custom') {
    throw new Error('Unsupported or invalid backup manifest');
  }
  const sourceIdentity = manifest.source
    ? `${String(manifest.source.hostname || '').toLowerCase()}:${String(
        manifest.source.port || '5432'
      )}/${String(manifest.source.database || '')}`
    : '';
  if (sourceIdentity && sourceIdentity === targetIdentity) {
    throw new Error('The verification target matches the database recorded in the backup manifest');
  }
  const checksum = await sha256File(dumpPath);
  if (checksum !== String(manifest.dump?.sha256 || '')) {
    throw new Error('Backup checksum does not match the manifest');
  }
  const bytes = fs.statSync(dumpPath).size;
  if (bytes !== Number(manifest.dump?.bytes)) {
    throw new Error(`Backup size mismatch: expected ${manifest.dump?.bytes}, got ${bytes}`);
  }

  const pgRestore = await assertPostgresBinaryMajor('pg_restore');
  let targetClient = createClient(targetUrl);
  await targetClient.connect();
  try {
    await assertServerMajor(targetClient);
    await targetClient.query('DROP SCHEMA IF EXISTS public CASCADE');
    await targetClient.query('CREATE SCHEMA public');
    await targetClient.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
    await targetClient.query('GRANT ALL ON SCHEMA public TO PUBLIC');
  } finally {
    await targetClient.end();
  }

  await withPgCliEnvironment(targetUrl, (env) =>
    runProcess(
      pgRestore.command,
      [
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--clean',
        '--if-exists',
        `--dbname=${targetDatabase}`,
        dumpPath
      ],
      { env }
    )
  );

  targetClient = createClient(targetUrl);
  await targetClient.connect();
  try {
    const server = await assertServerMajor(targetClient);
    const verification = await verifyRestoredDatabase(targetClient, manifest);
    const databaseAudit = await runDatabaseAudit(targetClient);
    const result = {
      ok: verification.mismatches.length === 0 && databaseAudit.ok,
      target: redactDatabaseUrl(targetUrl),
      dumpPath,
      manifestPath,
      postgres: {
        major: server.major,
        version: server.version,
        pgRestoreVersion: pgRestore.version
      },
      verifiedTables: Object.keys(verification.tableCounts).length,
      verifiedMigrations: verification.migrations.length,
      mismatches: verification.mismatches,
      databaseAudit
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      const error = new Error(
        `Restore verification found ${verification.mismatches.length} manifest mismatch(es) and ${databaseAudit.failedChecks.length} failed database audit check(s)`
      );
      error.code = 'RESTORE_VERIFICATION_FAILED';
      throw error;
    }
  } finally {
    await targetClient.end();
  }
};

main().catch((error) => {
  console.error(`[db:restore:verify] ${error.message}`);
  process.exitCode = 1;
});
