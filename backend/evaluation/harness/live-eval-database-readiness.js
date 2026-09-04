const EXPECTED_DATABASE_NAME = 'dev_artigen';
const EXPECTED_POSTGRES_MAJOR = 18;
const MIN_AVAILABLE_CONNECTIONS = 4;
const LIVE_EVAL_CAPACITY_MIGRATION = '027_agent_live_eval_capacity_aggregate';

const readinessError = (code) => Object.assign(new Error(code), { code });

const resolveLiveEvalPostgresMajor = (env = process.env) => {
  const raw = String(env.DEV_DATABASE_EXPECTED_MAJOR || '').trim();
  if (raw !== String(EXPECTED_POSTGRES_MAJOR)) {
    throw new TypeError('AGENT_LIVE_EVAL_POSTGRES_MAJOR_PROFILE_INVALID');
  }
  return EXPECTED_POSTGRES_MAJOR;
};

const assertLiveEvalDatabaseReadiness = async ({
  pool,
  expectedDatabaseName = EXPECTED_DATABASE_NAME,
  expectedPostgresMajor,
  minAvailableConnections = MIN_AVAILABLE_CONNECTIONS
} = {}) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('AGENT_LIVE_EVAL_POOL_REQUIRED');
  }
  if (expectedPostgresMajor !== EXPECTED_POSTGRES_MAJOR) {
    throw new TypeError('AGENT_LIVE_EVAL_POSTGRES_MAJOR_PROFILE_INVALID');
  }
  const minimum = Number(minAvailableConnections);
  if (!Number.isInteger(minimum) || minimum < 1) {
    throw new TypeError('AGENT_LIVE_EVAL_DATABASE_HEADROOM_PROFILE_INVALID');
  }
  const result = await pool.query({
    text: `SELECT current_database() AS database_name,
                  current_setting('server_version_num')::int AS server_version_num,
                  current_setting('max_connections')::int AS max_connections,
                  current_setting('superuser_reserved_connections')::int
                    AS superuser_reserved_connections,
                  COALESCE(NULLIF(current_setting('reserved_connections', true), ''), '0')::int
                    AS reserved_connections,
                  public.artigen_live_eval_client_connection_count_aggregate()
                    AS used_connections`,
    query_timeout: 10_000
  });
  const row = result.rows?.[0] || {};
  const databaseName = String(row.database_name || '');
  const serverVersionNumber = Number(row.server_version_num);
  const postgresMajor = Math.floor(serverVersionNumber / 10_000);
  const maxConnections = Number(row.max_connections);
  const superuserReservedConnections = Number(row.superuser_reserved_connections);
  const reservedConnections = Number(row.reserved_connections);
  const usedConnections = Number(row.used_connections);
  if (databaseName !== expectedDatabaseName) {
    throw readinessError('AGENT_LIVE_EVAL_DATABASE_FORBIDDEN');
  }
  if (postgresMajor !== expectedPostgresMajor) {
    throw readinessError('AGENT_LIVE_EVAL_POSTGRES_VERSION_NOT_READY');
  }
  if (
    !Number.isInteger(maxConnections) || maxConnections < 1 ||
    !Number.isInteger(superuserReservedConnections) || superuserReservedConnections < 0 ||
    !Number.isInteger(reservedConnections) || reservedConnections < 0 ||
    !Number.isInteger(usedConnections) || usedConnections < 0 ||
    superuserReservedConnections + reservedConnections >= maxConnections ||
    usedConnections > maxConnections
  ) {
    throw readinessError('AGENT_LIVE_EVAL_DATABASE_CAPACITY_INVALID');
  }
  const effectiveMaxConnections = maxConnections
    - superuserReservedConnections
    - reservedConnections;
  const availableConnections = Math.max(0, effectiveMaxConnections - usedConnections);
  if (availableConnections < minimum) {
    throw readinessError('AGENT_LIVE_EVAL_DATABASE_HEADROOM_INSUFFICIENT');
  }
  return Object.freeze({
    databaseName,
    postgresMajor,
    maxConnections,
    superuserReservedConnections,
    reservedConnections,
    effectiveMaxConnections,
    usedConnections,
    availableConnections,
    requiredAvailableConnections: minimum
  });
};

module.exports = {
  EXPECTED_DATABASE_NAME,
  EXPECTED_POSTGRES_MAJOR,
  LIVE_EVAL_CAPACITY_MIGRATION,
  MIN_AVAILABLE_CONNECTIONS,
  assertLiveEvalDatabaseReadiness,
  resolveLiveEvalPostgresMajor
};
