const net = require('node:net');
const { fetchWithTimeout } = require('./fetch-utils');

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_TIMEOUT_MS = 5000;

const enabled = (value) => /^(1|true)$/i.test(String(value || '').trim());

class TurnstileError extends Error {
  constructor(code, { status = 400, retryable = false } = {}) {
    super(code);
    this.name = 'TurnstileError';
    this.code = code;
    this.status = status;
    this.retryable = Boolean(retryable);
  }
}

const turnstileEnabled = (env = process.env) =>
  enabled(env.TURNSTILE_REQUIRED) ||
  Boolean(String(env.TURNSTILE_SECRET_KEY || '').trim()) ||
  (
    String(env.NODE_ENV || '').trim().toLowerCase() === 'production' &&
    enabled(env.AUTH_EMAIL_OTP_ENABLED)
  );

const hostnameEntries = (env = process.env) =>
  String(env.TURNSTILE_HOSTNAMES || env.TURNSTILE_HOSTNAME || '')
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

const allowedHostnames = (env = process.env) => new Set(hostnameEntries(env));

const isProduction = (env = process.env) =>
  String(env.NODE_ENV || '').trim().toLowerCase() === 'production';

const isValidProductionHostname = (hostname) => {
  const host = String(hostname || '').trim().toLowerCase();
  if (
    !host ||
    host.length > 253 ||
    host.includes('://') ||
    /[/:*?#@\[\]]/.test(host) ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    net.isIP(host) ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }
  const labels = host.split('.');
  return (
    labels.length >= 2 &&
    labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    )
  );
};

const checkTurnstileHostnameConfiguration = (
  env = process.env,
  { required = isProduction(env) && turnstileEnabled(env) } = {}
) => {
  const entries = hostnameEntries(env);
  const uniqueHostnames = [...new Set(entries)];
  if (!required) {
    return { ok: true, required: false, hostnames: uniqueHostnames };
  }
  if (!uniqueHostnames.length) {
    return {
      ok: false,
      required: true,
      code: 'TURNSTILE_HOSTNAMES_NOT_CONFIGURED'
    };
  }
  if (
    uniqueHostnames.some((hostname) => !isValidProductionHostname(hostname))
  ) {
    return {
      ok: false,
      required: true,
      code: 'TURNSTILE_HOSTNAMES_INVALID'
    };
  }

  const appOriginValue = String(env.APP_ORIGIN || '').trim();
  let appOrigin = null;
  try {
    appOrigin = new URL(appOriginValue);
  } catch {
    appOrigin = null;
  }
  const appHostname = String(appOrigin?.hostname || '').trim().toLowerCase();
  const validOrigin = Boolean(
    appOrigin &&
    appOrigin.protocol === 'https:' &&
    !appOrigin.username &&
    !appOrigin.password &&
    !appOrigin.port &&
    appOrigin.pathname === '/' &&
    !appOrigin.search &&
    !appOrigin.hash &&
    isValidProductionHostname(appHostname) &&
    uniqueHostnames.includes(appHostname)
  );
  if (!validOrigin) {
    return {
      ok: false,
      required: true,
      code: 'TURNSTILE_APP_ORIGIN_MISMATCH'
    };
  }
  return {
    ok: true,
    required: true,
    hostnames: uniqueHostnames,
    appHostname
  };
};

const verifyTurnstileToken = async ({
  token,
  remoteIp,
  expectedAction,
  env = process.env,
  fetchRequest
} = {}) => {
  if (!turnstileEnabled(env)) return { ok: true, skipped: true };
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) {
    throw new TurnstileError('TURNSTILE_NOT_CONFIGURED', {
      status: 503,
      retryable: false
    });
  }
  const hostnameConfiguration = checkTurnstileHostnameConfiguration(env);
  if (!hostnameConfiguration.ok) {
    throw new TurnstileError(hostnameConfiguration.code, {
      status: 503,
      retryable: false
    });
  }
  const responseToken = String(token || '').trim();
  if (!responseToken || responseToken.length > 2048) {
    throw new TurnstileError('TURNSTILE_REQUIRED', {
      status: 400,
      retryable: true
    });
  }
  const timeoutMs = Math.max(
    2000,
    Math.min(
      15_000,
      Number(env.TURNSTILE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
    )
  );
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', responseToken);
  const ip = String(remoteIp || '').trim();
  if (ip && ip !== 'unknown') form.set('remoteip', ip);

  let response;
  try {
    const request = fetchRequest || ((url, options, timeout) =>
      fetchWithTimeout(url, { ...options, disableProxy: true }, timeout));
    response = await request(
      TURNSTILE_VERIFY_URL,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: form.toString()
      },
      timeoutMs
    );
  } catch {
    throw new TurnstileError('TURNSTILE_UNAVAILABLE', {
      status: 503,
      retryable: true
    });
  }
  if (!response?.ok) {
    throw new TurnstileError('TURNSTILE_UNAVAILABLE', {
      status: 503,
      retryable: true
    });
  }
  const payload = await response.json().catch(() => null);
  if (!payload?.success) {
    throw new TurnstileError('TURNSTILE_FAILED', {
      status: 400,
      retryable: true
    });
  }
  const expected = String(expectedAction || '').trim();
  if (expected && String(payload.action || '').trim() !== expected) {
    throw new TurnstileError('TURNSTILE_ACTION_MISMATCH', {
      status: 400,
      retryable: true
    });
  }
  const hosts = allowedHostnames(env);
  const hostname = String(payload.hostname || '').trim().toLowerCase();
  if (hosts.size && (!hostname || !hosts.has(hostname))) {
    throw new TurnstileError('TURNSTILE_HOSTNAME_MISMATCH', {
      status: 400,
      retryable: true
    });
  }
  return {
    ok: true,
    skipped: false,
    hostname,
    action: String(payload.action || '').trim()
  };
};

module.exports = {
  DEFAULT_TIMEOUT_MS,
  TURNSTILE_VERIFY_URL,
  TurnstileError,
  allowedHostnames,
  checkTurnstileHostnameConfiguration,
  isValidProductionHostname,
  turnstileEnabled,
  verifyTurnstileToken
};
