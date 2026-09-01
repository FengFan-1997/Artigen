const LIMITS = Object.freeze({
  PG_POOL_MAX: Object.freeze({ dev: 3, production: 10, maximum: 30 }),
  PGBOSS_POOL_MAX: Object.freeze({ dev: 2, production: 5, maximum: 20 }),
  AGENT_PGBOSS_POOL_MAX: Object.freeze({ dev: 2, production: 3, maximum: 10 })
});

const resolveAgentWorkerPoolProfile = ({ profile, env = process.env } = {}) => {
  if (!['dev', 'production'].includes(profile)) {
    throw new TypeError('AGENT_WORKER_POOL_PROFILE_INVALID');
  }
  return Object.freeze(Object.fromEntries(Object.entries(LIMITS).map(([name, limits]) => {
    const fallback = limits[profile];
    const raw = String(env[name] ?? fallback).trim();
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 2 || value > limits.maximum) {
      throw new TypeError(`${name}_INVALID`);
    }
    if (profile === 'dev' && value !== limits.dev) {
      throw new TypeError(`${name}_DEV_FIXED`);
    }
    return [name, String(value)];
  })));
};

module.exports = { LIMITS, resolveAgentWorkerPoolProfile };
