#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const { runDatabaseAudit } = require('./lib/database-audit');
const {
  assertDirectPostgresUrl,
  assertServerMajor,
  createClient,
  hasFlag,
  redactDatabaseUrl
} = require('./lib/postgres-ops');

const HELP = `
Run a read-only PostgreSQL 16 schema and financial invariant audit.

Usage:
  pnpm --filter backend db:audit
  pnpm --filter backend db:audit -- --dry-run

Connection precedence:
  AUDIT_DATABASE_URL -> RESTORE_VERIFY_DATABASE_URL -> NEON_VERIFY_DATABASE_URL -> DATABASE_URL

The audit checks wallet/ledger continuity, frozen credits versus active holds,
task charging/refund state, payment callback uniqueness, and critical database
triggers/indexes. It never prints credentials, emails, prompts, or entity rows.
`.trim();

const main = async () => {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    console.log(HELP);
    return;
  }

  const connectionString = String(
    process.env.AUDIT_DATABASE_URL ||
      process.env.RESTORE_VERIFY_DATABASE_URL ||
      process.env.NEON_VERIFY_DATABASE_URL ||
      process.env.DATABASE_URL ||
      ''
  ).trim();
  if (connectionString) {
    assertDirectPostgresUrl(connectionString, 'Database audit URL');
  }
  if (hasFlag(argv, '--dry-run')) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          database: connectionString
            ? redactDatabaseUrl(connectionString)
            : '(database audit URL not set)',
          mode: 'repeatable-read, read-only',
          output: 'aggregate invariant counts only'
        },
        null,
        2
      )
    );
    return;
  }
  if (!connectionString) {
    throw new Error(
      'AUDIT_DATABASE_URL, RESTORE_VERIFY_DATABASE_URL, NEON_VERIFY_DATABASE_URL, or DATABASE_URL is required'
    );
  }

  const client = createClient(connectionString);
  await client.connect();
  try {
    const server = await assertServerMajor(client);
    const audit = await runDatabaseAudit(client);
    console.log(
      JSON.stringify(
        {
          ...audit,
          database: redactDatabaseUrl(connectionString),
          postgres: {
            major: server.major,
            version: server.version
          }
        },
        null,
        2
      )
    );
    if (!audit.ok) process.exitCode = 2;
  } finally {
    await client.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:audit] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
