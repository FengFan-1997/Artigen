#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ENV_PATH = path.resolve(__dirname, '../.env');
const ENV_EXAMPLE_PATH = path.resolve(__dirname, '../.env.example');
require('dotenv').config({ path: ENV_PATH, quiet: true });

const {
  assertSafeIdentifier,
  assertServerMajor,
  createClient,
  hasFlag,
  quoteIdentifier,
  quoteLiteral,
  redactDatabaseUrl,
  runMigrations
} = require('./lib/postgres-ops');

const HELP = `
Create Artigen development, test, and restore-verification databases on an already-running local PostgreSQL 16 server.

Usage:
  pnpm --filter backend db:local:setup
  pnpm --filter backend db:local:setup -- --no-migrate

Environment:
  LOCAL_PG_ADMIN_URL   Admin connection (default: postgresql://localhost/postgres?sslmode=disable)
  LOCAL_PG_USER        Development role (default: artigen)
  LOCAL_PG_PASSWORD    Development password (default: artigen_dev)
  LOCAL_PG_DATABASE    Development database (default: artigen_dev)
  LOCAL_PG_TEST_DATABASE    Test database (default: artigen_test)
  LOCAL_PG_VERIFY_DATABASE  Restore drill database (default: artigen_restore_verify)

This command never installs PostgreSQL. It creates backend/.env when absent and only fills missing/blank
local database URLs, setup values, security defaults, and the worker gate in an existing file;
non-empty values are never overwritten.
`.trim();

const setEnvValue = (content, name, value) => {
  const line = `${name}=${value}`;
  const expression = new RegExp(`^${name}=.*$`, 'm');
  return expression.test(content)
    ? content.replace(expression, line)
    : `${content.replace(/\s*$/, '\n')}${line}\n`;
};

const connectionForDatabase = (adminUrl, role, password, database) => {
  const connection = new URL(adminUrl);
  connection.username = role;
  connection.password = password;
  connection.pathname = `/${database}`;
  if (!connection.searchParams.has('sslmode')) {
    connection.searchParams.set('sslmode', 'disable');
  }
  return connection.toString();
};

const readEnvValue = (content, name) => {
  const match = String(content || '').match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) return null;
  const raw = String(match[1] || '').trim();
  if (
    !raw ||
    (raw.startsWith('"') && raw.endsWith('"') && raw.slice(1, -1).trim() === '') ||
    (raw.startsWith("'") && raw.endsWith("'") && raw.slice(1, -1).trim() === '')
  ) {
    return '';
  }
  return raw;
};

const prepareLocalEnvContent = (
  content,
  {
    initialValues = {},
    overwriteInitialValues = false,
    randomBytes = crypto.randomBytes
  } = {}
) => {
  let next = String(content || '');
  const filledValueNames = [];
  for (const [name, value] of Object.entries(initialValues)) {
    if (!overwriteInitialValues && readEnvValue(next, name)) continue;
    next = setEnvValue(next, name, value);
    filledValueNames.push(name);
  }
  const generatedSecretNames = [];
  const secretNames = [
    'OTP_HMAC_SECRET',
    'SESSION_TOKEN_HASH_SECRET',
    'CSRF_SECRET',
    'AGENT_PAYLOAD_ENCRYPTION_KEY'
  ];
  const usedSecrets = new Set(
    secretNames
      .map((name) => readEnvValue(next, name))
      .filter(Boolean)
  );
  for (const name of secretNames) {
    if (readEnvValue(next, name)) continue;
    let secret = '';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      secret = randomBytes(32).toString('hex');
      if (
        Buffer.byteLength(secret, 'utf8') >= 32 &&
        new Set(secret).size >= 12 &&
        !usedSecrets.has(secret)
      ) {
        break;
      }
      secret = '';
    }
    if (!secret) throw new Error(`Unable to generate a strong independent ${name}`);
    usedSecrets.add(secret);
    next = setEnvValue(next, name, secret);
    generatedSecretNames.push(name);
  }
  if (!readEnvValue(next, 'TASK_WORKER_ENABLED')) {
    next = setEnvValue(next, 'TASK_WORKER_ENABLED', '0');
  }
  return {
    content: next,
    changed: next !== content,
    filledValueNames,
    generatedSecretNames
  };
};

const writeLocalEnv = ({
  databaseUrl,
  testDatabaseUrl,
  verifyDatabaseUrl,
  role,
  password,
  databases
}) => {
  const existed = fs.existsSync(ENV_PATH);
  const current = existed
    ? fs.readFileSync(ENV_PATH, 'utf8')
    : fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  const initialValues = {
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    RESTORE_VERIFY_DATABASE_URL: verifyDatabaseUrl,
    NEON_VERIFY_DATABASE_URL: verifyDatabaseUrl,
    LOCAL_PG_USER: role,
    LOCAL_PG_PASSWORD: JSON.stringify(password),
    LOCAL_PG_DATABASE: databases.development,
    LOCAL_PG_TEST_DATABASE: databases.test,
    LOCAL_PG_VERIFY_DATABASE: databases.verify,
    TASK_WORKER_ENABLED: '0'
  };
  const prepared = prepareLocalEnvContent(current, {
    initialValues,
    overwriteInitialValues: !existed
  });
  if (!existed) {
    fs.writeFileSync(ENV_PATH, prepared.content, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
  } else if (prepared.changed) {
    const temporaryPath = `${ENV_PATH}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    try {
      fs.writeFileSync(temporaryPath, prepared.content, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx'
      });
      fs.renameSync(temporaryPath, ENV_PATH);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
  fs.chmodSync(ENV_PATH, 0o600);
  return {
    created: !existed,
    updated: existed && prepared.changed,
    filledValueNames: prepared.filledValueNames,
    generatedSecretNames: prepared.generatedSecretNames
  };
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    console.log(HELP);
    return;
  }

  const adminUrl = String(
    process.env.LOCAL_PG_ADMIN_URL || 'postgresql://localhost/postgres?sslmode=disable'
  ).trim();
  const adminHost = new URL(adminUrl).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(adminHost)) {
    throw new Error('LOCAL_PG_ADMIN_URL must point to localhost; this script refuses remote database setup');
  }
  const role = assertSafeIdentifier(process.env.LOCAL_PG_USER || 'artigen', 'LOCAL_PG_USER');
  const password = String(process.env.LOCAL_PG_PASSWORD || 'artigen_dev');
  const databases = {
    development: assertSafeIdentifier(
      process.env.LOCAL_PG_DATABASE || 'artigen_dev',
      'LOCAL_PG_DATABASE'
    ),
    test: assertSafeIdentifier(
      process.env.LOCAL_PG_TEST_DATABASE || 'artigen_test',
      'LOCAL_PG_TEST_DATABASE'
    ),
    verify: assertSafeIdentifier(
      process.env.LOCAL_PG_VERIFY_DATABASE || 'artigen_restore_verify',
      'LOCAL_PG_VERIFY_DATABASE'
    )
  };
  if (password.length < 8) throw new Error('LOCAL_PG_PASSWORD must be at least 8 characters');
  if (/[\r\n\u0000]/.test(password)) {
    throw new Error('LOCAL_PG_PASSWORD must not contain line breaks or NUL bytes');
  }
  if (new Set(Object.values(databases)).size !== 3) {
    throw new Error('Local development, test, and restore verification database names must be distinct');
  }

  const admin = createClient(adminUrl);
  await admin.connect();
  try {
    await assertServerMajor(admin);

    const roleResult = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (!roleResult.rowCount) {
      await admin.query(
        `CREATE ROLE ${quoteIdentifier(role)} LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`
      );
    } else {
      await admin.query(`ALTER ROLE ${quoteIdentifier(role)} LOGIN PASSWORD ${quoteLiteral(password)}`);
    }

    for (const database of Object.values(databases)) {
      const databaseResult = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
      if (!databaseResult.rowCount) {
        await admin.query(
          `CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(role)} ENCODING 'UTF8' TEMPLATE template0`
        );
      } else {
        await admin.query(`ALTER DATABASE ${quoteIdentifier(database)} OWNER TO ${quoteIdentifier(role)}`);
      }
    }
  } finally {
    await admin.end();
  }

  const databaseUrl = connectionForDatabase(adminUrl, role, password, databases.development);
  const testDatabaseUrl = connectionForDatabase(adminUrl, role, password, databases.test);
  const verifyDatabaseUrl = connectionForDatabase(adminUrl, role, password, databases.verify);
  const databaseConnection = new URL(databaseUrl);
  const host = databaseConnection.hostname || '127.0.0.1';
  const port = databaseConnection.port || '5432';

  if (!hasFlag(argv, '--no-migrate')) {
    for (const connectionString of [databaseUrl, testDatabaseUrl, verifyDatabaseUrl]) {
      await runMigrations({ connectionString });
    }
  }
  const envResult = writeLocalEnv({
    databaseUrl,
    testDatabaseUrl,
    verifyDatabaseUrl,
    role,
    password,
    databases
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        postgres: 16,
        migrated: !hasFlag(argv, '--no-migrate'),
        databases: {
          development: redactDatabaseUrl(databaseUrl),
          test: redactDatabaseUrl(testDatabaseUrl),
          restoreVerify: redactDatabaseUrl(verifyDatabaseUrl)
        },
        env: {
          path: ENV_PATH,
          created: envResult.created,
          updatedMissingSecurityDefaults: envResult.updated,
          filledValueNames: envResult.filledValueNames,
          generatedSecretNames: envResult.generatedSecretNames,
          preservedNonEmptyValues: true
        },
        next: envResult.created
          ? 'Run pnpm dev. Paid features, email OTP, and the task worker remain disabled locally.'
          : `Existing non-empty env values were preserved; ensure DATABASE_URL targets ${host}:${port}/${databases.development}`
      },
      null,
      2
    )
  );
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:local:setup] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  prepareLocalEnvContent,
  readEnvValue,
  setEnvValue
};
