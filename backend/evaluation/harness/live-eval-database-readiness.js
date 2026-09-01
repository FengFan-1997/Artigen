const EXPECTED_DATABASE_NAME = 'dev_artigen';
const EXPECTED_POSTGRES_MAJOR = 16;
const MIN_AVAILABLE_CONNECTIONS = 4;

const readinessError = (code) => Object.assign(new Error(code), { code });

const assertLiveEvalDatabaseReadiness = async ({
  pool,
  expectedDatabaseName = EXPECTED_DATABASE_NAME,
  expectedPostgresMajor = EXPECTED_POSTGRES_MAJOR,
  minAvailableConnections = MIN_AVAILABLE_CONNECTIONS
} = {}) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('AGENT_LIVE_EVAL_POOL_REQUIRED');
  }
  const minimum = Number(minAvailableConnections);
  if (!Number.isInteger(minimum) || minimum < 1) {
    throw new TypeError('AGENT_LIVE_EVAL_DATABASE_HEADROOM_PROFILE_INVALID');
  }
  const result = await pool.query({
    text: `SELECT current_database() AS database_name,
                  current_setting('server_version_num')::int AS server_version_num,
                  current_setting('max_connections')::int AS max_connections,
                  (SELECT count(*)::int FROM pg_stat_activity) AS used_connections`,
    query_timeout: 10_000
  });
  const row = result.rows?.[0] || {};
  const databaseName = String(row.database_name || '');
  const serverVersionNumber = Number(row.server_version_num);
  const postgresMajor = Math.floor(serverVersionNumber / 10_000);
  const maxConnections = Number(row.max_connections);
  const usedConnections = Number(row.used_connections);
  if (databaseName !== expectedDatabaseName) {
    throw readinessError('AGENT_LIVE_EVAL_DATABASE_FORBIDDEN');
  }
  if (postgresMajor !== expectedPostgresMajor) {
    throw readinessError('AGENT_LIVE_EVAL_POSTGRES_VERSION_NOT_READY');
  }
  if (
    !Number.isInteger(maxConnections) || maxConnections < 1 ||
    !Number.isInteger(usedConnections) || usedConnections < 0 ||
    usedConnections > maxConnections
  ) {
    throw readinessError('AGENT_LIVE_EVAL_DATABASE_CAPACITY_INVALID');
  }
  const availableConnections = maxConnections - usedConnections;
  if (availableConnections < minimum) {
    throw readinessError('AGENT_LIVE_EVAL_DATABASE_HEADROOM_INSUFFICIENT');
  }
  return Object.freeze({
    databaseName,
    postgresMajor,
    maxConnections,
    usedConnections,
    availableConnections,
    requiredAvailableConnections: minimum
  });
};

module.exports = {
  EXPECTED_DATABASE_NAME,
  EXPECTED_POSTGRES_MAJOR,
  MIN_AVAILABLE_CONNECTIONS,
  assertLiveEvalDatabaseReadiness
};
