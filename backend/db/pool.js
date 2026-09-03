const { Pool } = require('pg');

let pool;

const getDatabaseUrl = () => String(process.env.DATABASE_URL || '').trim();

const isDatabaseConfigured = () => Boolean(getDatabaseUrl());

const resolvePoolSsl = (connectionString, env = process.env) => {
  const raw = String(connectionString || '').trim();
  const verifiedTlsRequired = /^(1|true|yes|on)$/i.test(
    String(env.PG_SSL_REQUIRED || '').trim()
  );
  let parsedUrl = null;
  try {
    parsedUrl = new URL(raw);
  } catch {}
  if (
    verifiedTlsRequired && parsedUrl &&
    [...parsedUrl.searchParams.keys()].some((name) => {
      const normalized = String(name || '').trim().toLowerCase();
      return normalized.startsWith('ssl') || normalized === 'uselibpqcompat';
    })
  ) {
    const error = new Error('POSTGRES_TLS_URL_OVERRIDE_FORBIDDEN');
    error.code = 'POSTGRES_TLS_URL_OVERRIDE_FORBIDDEN';
    throw error;
  }
  if (/sslmode=(disable|allow)(?:&|$)/i.test(raw)) {
    if (verifiedTlsRequired) {
      const error = new Error('POSTGRES_VERIFIED_TLS_REQUIRED');
      error.code = 'POSTGRES_VERIFIED_TLS_REQUIRED';
      throw error;
    }
    return undefined;
  }
  const modeRequiresSsl = /sslmode=(require|verify-ca|verify-full|prefer)(?:&|$)/i.test(raw);
  let hostname = '';
  hostname = String(parsedUrl?.hostname || '').toLowerCase();
  if (!modeRequiresSsl && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')) {
    if (verifiedTlsRequired) {
      const error = new Error('POSTGRES_VERIFIED_TLS_REQUIRED');
      error.code = 'POSTGRES_VERIFIED_TLS_REQUIRED';
      throw error;
    }
    return undefined;
  }
  const verificationFlag = String(env.PG_SSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase();
  const rejectUnauthorized = !['0', 'false', 'no'].includes(verificationFlag);
  if (verifiedTlsRequired && !rejectUnauthorized) {
    const error = new Error('POSTGRES_VERIFIED_TLS_REQUIRED');
    error.code = 'POSTGRES_VERIFIED_TLS_REQUIRED';
    throw error;
  }
  let ca = String(env.PG_SSL_CA || '').replace(/\\n/g, '\n').trim();
  const encodedCa = String(env.PG_SSL_CA_BASE64 || '').trim();
  if (!ca && encodedCa) {
    ca = Buffer.from(encodedCa, 'base64').toString('utf8').trim();
  }
  if (
    verifiedTlsRequired && ca &&
    !/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(ca)
  ) {
    const error = new Error('POSTGRES_SSL_CA_INVALID');
    error.code = 'POSTGRES_SSL_CA_INVALID';
    throw error;
  }
  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {})
  };
};

const getPool = () => {
  if (pool) return pool;
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    const error = new Error('DATABASE_NOT_CONFIGURED');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  pool = new Pool({
    connectionString,
    max: Math.max(2, Math.min(30, Number(process.env.PG_POOL_MAX || 10) || 10)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: resolvePoolSsl(connectionString)
  });
  pool.on('error', (error) => console.error('PostgreSQL pool error', error));
  return pool;
};

const withTransaction = async (callback) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { getPool, isDatabaseConfigured, resolvePoolSsl, withTransaction };
