#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const {
  assertDirectPostgresUrl,
  assertPathOutsideRepo,
  assertPostgresBinaryMajor,
  assertServerMajor,
  createClient,
  hasFlag,
  parseOption,
  pruneBackupGroups,
  quoteIdentifier,
  redactDatabaseUrl,
  runProcess,
  sha256File,
  withPgCliEnvironment
} = require('./lib/postgres-ops');

const HELP = `
Create a consistent PostgreSQL 16 custom-format backup and verification manifest.

Usage:
  pnpm --filter backend db:backup:neon
  pnpm --filter backend db:backup:neon -- --output-dir /secure/path
  pnpm --filter backend db:backup:neon -- --dry-run

Connection precedence:
  NEON_DATABASE_URL -> DATABASE_MIGRATION_URL -> DATABASE_URL

The URL is passed to pg_dump through its environment and is never printed.
The output directory must be outside the repository.
`.trim();

const safeTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const readMigrationNames = async (client) => {
  const exists = await client.query(`SELECT to_regclass('public.pgmigrations') AS table_name`);
  if (!exists.rows[0]?.table_name) return [];
  const result = await client.query('SELECT name FROM public.pgmigrations ORDER BY run_on, name');
  return result.rows.map((row) => String(row.name));
};

const readTableCounts = async (client) => {
  const tablesResult = await client.query(
    `SELECT tablename
       FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename`
  );
  const counts = {};
  for (const row of tablesResult.rows) {
    const table = String(row.tablename);
    const result = await client.query(`SELECT count(*)::text AS count FROM public.${quoteIdentifier(table)}`);
    counts[table] = String(result.rows[0]?.count || '0');
  }
  return counts;
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    console.log(HELP);
    return;
  }

  const sourceUrl = String(
    process.env.NEON_DATABASE_URL ||
      process.env.DATABASE_MIGRATION_URL ||
      process.env.DATABASE_URL ||
      ''
  ).trim();
  const requestedOutputDirectory = path.resolve(
    parseOption(argv, '--output-dir') ||
      process.env.NEON_BACKUP_DIR ||
      path.join(os.homedir(), 'Library', 'Application Support', 'Artigen', 'backups')
  );
  const outputDirectory = assertPathOutsideRepo(requestedOutputDirectory);
  if (sourceUrl) assertDirectPostgresUrl(sourceUrl, 'Neon backup source URL');
  if (hasFlag(argv, '--dry-run')) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          source: sourceUrl ? redactDatabaseUrl(sourceUrl) : '(NEON_DATABASE_URL not set)',
          outputDirectory,
          retentionGroups: 14,
          command: 'pg_dump --format=custom --no-owner --no-acl --snapshot=<exported-snapshot>'
        },
        null,
        2
      )
    );
    return;
  }
  if (!sourceUrl) {
    throw new Error('NEON_DATABASE_URL, DATABASE_MIGRATION_URL, or DATABASE_URL is required');
  }

  const pgDump = await assertPostgresBinaryMajor('pg_dump');
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  assertPathOutsideRepo(outputDirectory);
  fs.chmodSync(outputDirectory, 0o700);
  const baseName = `artigen-neon-${safeTimestamp()}`;
  const dumpPath = path.join(outputDirectory, `${baseName}.dump`);
  const manifestPath = path.join(outputDirectory, `${baseName}.manifest.json`);
  const checksumPath = path.join(outputDirectory, `${baseName}.sha256`);

  const source = createClient(sourceUrl);
  let transactionOpen = false;
  let backupComplete = false;
  try {
    await source.connect();
    const server = await assertServerMajor(source);
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionOpen = true;
    const snapshotResult = await source.query('SELECT pg_export_snapshot() AS snapshot');
    const snapshot = String(snapshotResult.rows[0]?.snapshot || '');
    if (!snapshot) throw new Error('PostgreSQL did not return an exported snapshot');

    const [tableCounts, migrations] = await Promise.all([
      readTableCounts(source),
      readMigrationNames(source)
    ]);

    await withPgCliEnvironment(sourceUrl, (env) =>
      runProcess(
        pgDump.command,
        [
          '--format=custom',
          '--no-owner',
          '--no-acl',
          '--compress=9',
          `--snapshot=${snapshot}`,
          `--file=${dumpPath}`
        ],
        { env }
      )
    );
    await source.query('COMMIT');
    transactionOpen = false;

    fs.chmodSync(dumpPath, 0o600);
    const checksum = await sha256File(dumpPath);
    const dumpStat = fs.statSync(dumpPath);
    const manifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      source: redactDatabaseUrl(sourceUrl),
      postgres: {
        major: server.major,
        version: server.version,
        pgDumpVersion: pgDump.version
      },
      dump: {
        file: path.basename(dumpPath),
        bytes: dumpStat.size,
        sha256: checksum,
        format: 'custom'
      },
      migrations,
      tableCounts
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(dumpPath)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    backupComplete = true;
    const removedGroups = pruneBackupGroups(outputDirectory, 14);

    console.log(
      JSON.stringify(
        {
          ok: true,
          dumpPath,
          manifestPath,
          checksumPath,
          bytes: dumpStat.size,
          tables: Object.keys(tableCounts).length,
          retainedGroups: 14,
          removedGroups
        },
        null,
        2
      )
    );
  } catch (error) {
    if (transactionOpen) {
      try {
        await source.query('ROLLBACK');
      } catch {}
    }
    if (!backupComplete) {
      for (const filePath of [dumpPath, manifestPath, checksumPath]) {
        try {
          fs.rmSync(filePath, { force: true });
        } catch {}
      }
    }
    throw error;
  } finally {
    await source.end().catch(() => {});
  }
};

main().catch((error) => {
  console.error(`[db:backup:neon] ${error.message}`);
  process.exitCode = 1;
});
