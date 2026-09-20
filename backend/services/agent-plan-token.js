const crypto = require('node:crypto');
const { ApiError } = require('../lib/api-error');

const TOKEN_TTL_MS = 30 * 60 * 1000;

const secretFor = (env) => String(
  env?.AGENT_PLAN_TOKEN_SECRET || env?.AGENT_PAYLOAD_ENCRYPTION_KEY || ''
).trim();

const digest = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const sign = (payload, secret) => crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('base64url');

const issueAgentPlanToken = ({ env, userId, objective, revision = 1 }) => {
  const secret = secretFor(env);
  if (!secret) throw new ApiError(503, 'AGENT_PLAN_TOKEN_SECRET_MISSING', { retryable: false });
  const body = Buffer.from(JSON.stringify({
    userId: String(userId),
    objectiveHash: digest(objective),
    revision: Number(revision) || 1,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS
  })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
};

const verifyAgentPlanToken = ({ env, token, userId, objective, revision = 1 }) => {
  const secret = secretFor(env);
  const [body, signature] = String(token || '').split('.');
  if (!secret || !body || !signature) throw new ApiError(409, 'AGENT_PLAN_TOKEN_INVALID');
  const expected = sign(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new ApiError(409, 'AGENT_PLAN_TOKEN_INVALID');
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch {
    throw new ApiError(409, 'AGENT_PLAN_TOKEN_INVALID');
  }
  if (
    parsed.userId !== String(userId) ||
    parsed.objectiveHash !== digest(objective) ||
    Number(parsed.revision) !== Number(revision) ||
    !Number.isFinite(Number(parsed.expiresAt)) ||
    Number(parsed.expiresAt) <= Date.now()
  ) throw new ApiError(409, 'AGENT_PLAN_TOKEN_EXPIRED_OR_STALE');
  return parsed;
};

module.exports = { issueAgentPlanToken, verifyAgentPlanToken };
