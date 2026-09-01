const {
  assertDirectPostgresUrl,
  assertSamePostgresDatabaseOrigin,
  createClient
} = require('./postgres-ops');
const { resolvePoolSsl } = require('../../db/pool');

const DEV_DATABASE_NAME = 'dev_artigen';
const DEV_MIGRATION_USER = 'artigen_migrator';
const DEV_RUNTIME_USER = 'artigen_runtime';
const DEV_POOL_PROFILE = Object.freeze({
  PG_POOL_MAX: '3',
  PGBOSS_POOL_MAX: '2',
  AGENT_PGBOSS_POOL_MAX: '2'
});

const decodeUrlPart = (value, label) => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    const error = new Error(`${label} contains invalid URL encoding`);
    error.code = 'DEV_DATABASE_URL_INVALID';
    throw error;
  }
};

const normalizedHost = (value) => String(value || '')
  .replace(/^\[|\]$/g, '')
  .toLowerCase()
  .replace(/\.$/, '');

const assertDevDatabaseUrlProfile = ({
  migrationUrl,
  runtimeUrl,
  env = process.env
} = {}) => {
  if (String(env.APP_ENV || '').trim().toLowerCase() !== 'dev') return null;
  if (!String(migrationUrl || '').trim() || !String(runtimeUrl || '').trim()) {
    throw Object.assign(new Error(
      'DEV requires both DATABASE_MIGRATION_URL and DATABASE_URL'
    ), { code: 'DEV_DATABASE_URLS_REQUIRED' });
  }
  const identity = assertSamePostgresDatabaseOrigin(migrationUrl, runtimeUrl);
  if (!/^(1|true|yes|on)$/i.test(String(env.PG_SSL_REQUIRED || '').trim())) {
    throw Object.assign(new Error('DEV database requires verified TLS'), {
      code: 'DEV_DATABASE_VERIFIED_TLS_REQUIRED'
    });
  }
  for (const [name, expected] of Object.entries(DEV_POOL_PROFILE)) {
    if (String(env[name] || '').trim() !== expected) {
      throw Object.assign(new Error(`DEV database pool profile requires ${name}=${expected}`), {
        code: 'DEV_DATABASE_POOL_PROFILE_FORBIDDEN'
      });
    }
  }
  resolvePoolSsl(migrationUrl, env);
  resolvePoolSsl(runtimeUrl, env);
  const expectedHost = normalizedHost(env.DEV_DATABASE_EXPECTED_HOST);
  if (!expectedHost) {
    throw Object.assign(new Error('DEV_DATABASE_EXPECTED_HOST is required'), {
      code: 'DEV_DATABASE_EXPECTED_HOST_REQUIRED'
    });
  }
  if (identity.database !== DEV_DATABASE_NAME || identity.hostname !== expectedHost) {
    throw Object.assign(new Error('DEV database target is not the approved Aiven dev_artigen host'), {
      code: 'DEV_DATABASE_TARGET_FORBIDDEN'
    });
  }
  const migration = assertDirectPostgresUrl(migrationUrl, 'DATABASE_MIGRATION_URL');
  const runtime = assertDirectPostgresUrl(runtimeUrl, 'DATABASE_URL');
  const migrationUser = decodeUrlPart(migration.username, 'DATABASE_MIGRATION_URL');
  const runtimeUser = decodeUrlPart(runtime.username, 'DATABASE_URL');
  if (migrationUser !== DEV_MIGRATION_USER || runtimeUser !== DEV_RUNTIME_USER) {
    throw Object.assign(new Error('DEV database roles do not match the approved migration/runtime split'), {
      code: 'DEV_DATABASE_ROLE_FORBIDDEN'
    });
  }
  if (migrationUser === runtimeUser) {
    throw Object.assign(new Error('DEV migration and runtime roles must be distinct'), {
      code: 'DEV_DATABASE_ROLE_COLLISION'
    });
  }
  return Object.freeze({
    databaseName: identity.database,
    hostname: identity.hostname,
    migrationUser,
    runtimeUser
  });
};

const inspectIdentity = async ({
  connectionString,
  expectedUser,
  env,
  createClientImpl
}) => {
  const client = createClientImpl(connectionString, env);
  try {
    await client.connect();
    const result = await client.query(
      `SELECT current_database() AS database_name,
              current_user AS database_user,
              current_setting('server_version_num')::int AS server_version_num,
              (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public')
                AS public_owner,
              (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='pgboss')
                AS pgboss_owner,
              has_schema_privilege(current_user,'public','USAGE') AS public_usage,
              has_schema_privilege(current_user,'public','CREATE') AS public_create`
    );
    const row = result.rows?.[0] || {};
    if (
      String(row.database_name || '') !== DEV_DATABASE_NAME ||
      String(row.database_user || '') !== expectedUser ||
      Math.floor(Number(row.server_version_num || 0) / 10_000) !== 16
    ) {
      throw Object.assign(new Error('DEV database runtime identity is not approved'), {
        code: 'DEV_DATABASE_IDENTITY_FORBIDDEN'
      });
    }
    return row;
  } finally {
    await client.end().catch(() => {});
  }
};

const assertDevDatabaseBoundary = async ({
  migrationUrl,
  runtimeUrl,
  env = process.env,
  createClientImpl = createClient
} = {}) => {
  const profile = assertDevDatabaseUrlProfile({ migrationUrl, runtimeUrl, env });
  if (!profile) return null;
  const migration = await inspectIdentity({
    connectionString: migrationUrl,
    expectedUser: DEV_MIGRATION_USER,
    env,
    createClientImpl
  });
  const runtime = await inspectIdentity({
    connectionString: runtimeUrl,
    expectedUser: DEV_RUNTIME_USER,
    env,
    createClientImpl
  });
  if (String(migration.public_owner || '') !== DEV_MIGRATION_USER) {
    throw Object.assign(new Error('DEV public schema must be owned by artigen_migrator'), {
      code: 'DEV_DATABASE_PUBLIC_OWNER_FORBIDDEN'
    });
  }
  if (
    String(runtime.pgboss_owner || '') !== DEV_RUNTIME_USER ||
    runtime.public_usage !== true ||
    runtime.public_create !== false
  ) {
    throw Object.assign(new Error('DEV runtime schema privileges are not least-privilege'), {
      code: 'DEV_DATABASE_RUNTIME_PRIVILEGES_FORBIDDEN'
    });
  }
  return profile;
};

module.exports = {
  DEV_DATABASE_NAME,
  DEV_MIGRATION_USER,
  DEV_POOL_PROFILE,
  DEV_RUNTIME_USER,
  assertDevDatabaseBoundary,
  assertDevDatabaseUrlProfile
};
