const policy = require('../config/release-capability-policy.json');

const normalizeEnvironment = ({ appEnv, nodeEnv } = {}) => {
  const raw = String(appEnv || nodeEnv || '').trim().toLowerCase();
  if (['prod', 'production'].includes(raw)) return 'production';
  if (raw === 'dev') return 'dev';
  if (['development', 'local', 'test', ''].includes(raw)) return 'development';
  return raw;
};
const selectedPolicy = (env = process.env) => policy[normalizeEnvironment({
  appEnv: env.APP_ENV, nodeEnv: env.NODE_ENV
})] || policy.production;
const publicSignupEnabled = (env = process.env) => {
  // A platform override may close signup, but cannot expand the release scope.
  if (!selectedPolicy(env).capabilities.publicSignup) return false;
  if (!Object.prototype.hasOwnProperty.call(env, 'ARTIGEN_PUBLIC_SIGNUP_ENABLED')) return true;
  return /^(1|true|yes|on)$/i.test(String(env.ARTIGEN_PUBLIC_SIGNUP_ENABLED || '').trim());
};
const mayCreateAccount = (email, env = process.env) => {
  if (publicSignupEnabled(env)) return true;
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  return String(env.ARTIGEN_INVITE_EMAILS || '').split(',')
    .some((entry) => entry.trim().toLowerCase() === normalized);
};
module.exports = { normalizeEnvironment, selectedPolicy, publicSignupEnabled, mayCreateAccount };
