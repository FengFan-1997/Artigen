const canUseLegacyJsonBilling = ({ isProd = false, env = process.env } = {}) => {
  const production = isProd || String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const databaseConfigured = Boolean(String(env.DATABASE_URL || '').trim());
  return !production && !databaseConfigured &&
    String(env.ENABLE_LEGACY_JSON_BILLING || '').trim() === '1';
};

module.exports = { canUseLegacyJsonBilling };
