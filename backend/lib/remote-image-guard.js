const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');

const { fetchWithTimeout } = require('./fetch-utils');
const { isPublicIp } = require('../agent_runtime/public_network');

const remoteError = (code, status = 502) => {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
};

const normalizeHost = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, '');

// Treat every address outside the globally routable set as unsafe. The shared
// implementation is also baked into the Agent browser's CONNECT proxy so URL
// fetches and live Chromium traffic cannot drift to different SSRF rules.
const isPrivateIp = (raw) => !isPublicIp(raw);

const configuredImageProxyHosts = (env = process.env) => String(
  env.PROXY_IMAGE_ALLOWED_HOSTS ||
  env.IMAGE_PROXY_ALLOWED_HOSTS ||
  env.AI_OUTPUT_ALLOWED_HOSTS ||
  ''
)
  .split(',')
  .map((entry) => normalizeHost(entry.replace(/^\*\./, '')))
  .filter(Boolean);

const isAllowedHost = (hostname, allowedHosts) => {
  const host = normalizeHost(hostname);
  return allowedHosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
};

const createPinnedLookup = (address, family) => (_hostname, _options, callback) => {
  callback(null, String(address), Number(family) === 6 ? 6 : 4);
};

const createPinnedAgent = (url) => {
  const address = String(url?.resolvedAddress || '').trim();
  const family = Number(url?.resolvedFamily || 0);
  if (!address || ![4, 6].includes(family) || isPrivateIp(address)) {
    throw remoteError('FORBIDDEN_HOST', 403);
  }
  const options = { lookup: createPinnedLookup(address, family) };
  return url.protocol === 'https:' ? new https.Agent(options) : new http.Agent(options);
};

const assertPinnedRemoteUrl = async (
  rawUrl,
  {
    env = process.env,
    resolver = dns.promises.lookup,
    allowedHosts = configuredImageProxyHosts(env)
  } = {}
) => {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    throw remoteError('INVALID_URL', 400);
  }
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !production)) {
    throw remoteError('INVALID_PROTOCOL', 400);
  }
  if (url.username || url.password) throw remoteError('INVALID_URL', 400);
  const hostname = normalizeHost(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw remoteError('FORBIDDEN_HOST', 403);
  }
  if (production && allowedHosts.length === 0) {
    throw remoteError('PROXY_IMAGE_HOSTS_NOT_CONFIGURED', 503);
  }
  if (allowedHosts.length > 0 && !isAllowedHost(hostname, allowedHosts)) {
    throw remoteError('FORBIDDEN_HOST', 403);
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) throw remoteError('FORBIDDEN_HOST', 403);

  let addresses;
  try {
    addresses = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    throw remoteError('DNS_FAILED', 502);
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw remoteError('DNS_FAILED', 502);
  }
  if (addresses.some((item) => isPrivateIp(item?.address))) {
    throw remoteError('FORBIDDEN_HOST', 403);
  }
  const selected = addresses[0];
  const family = Number(selected.family || net.isIP(selected.address));
  if (![4, 6].includes(family)) throw remoteError('DNS_FAILED', 502);
  Object.defineProperties(url, {
    resolvedAddress: { value: String(selected.address) },
    resolvedFamily: { value: family }
  });
  return url;
};

const destroyBody = (response) => {
  try {
    response?.body?.cancel?.();
  } catch {}
  try {
    response?.body?.destroy?.();
  } catch {}
};

const fetchRemoteImageWithPinnedDns = async ({
  startUrl,
  options = {},
  timeoutMs = 20_000,
  maxRedirects = 5,
  env = process.env,
  resolver = dns.promises.lookup,
  fetcher = fetchWithTimeout
} = {}) => {
  let current = String(startUrl || '').trim();
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    let url;
    try {
      url = await assertPinnedRemoteUrl(current, { env, resolver });
    } catch (error) {
      return {
        ok: false,
        error: String(error?.code || 'INVALID_URL'),
        status: Number(error?.status || 0) || 502,
        response: null,
        url: current
      };
    }

    let response;
    try {
      response = await fetcher(
        url.toString(),
        {
          ...options,
          redirect: 'manual',
          agent: createPinnedAgent(url),
          // A process-level HTTP(S)_PROXY must not replace the pinned socket.
          disableProxy: true
        },
        timeoutMs
      );
    } catch {
      return { ok: false, error: 'UPSTREAM_FETCH_FAILED', status: 502, response: null, url: current };
    }

    const status = Number(response?.status || 0);
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = String(response.headers?.get('location') || '').trim();
      destroyBody(response);
      if (!location || redirects === maxRedirects) {
        return { ok: false, error: 'TOO_MANY_REDIRECTS', status: 502, response: null, url: current };
      }
      try {
        current = new URL(location, url).toString();
      } catch {
        return { ok: false, error: 'UPSTREAM_REDIRECT', status: 502, response: null, url: current };
      }
      continue;
    }
    return { ok: true, response, url: url.toString() };
  }
  return { ok: false, error: 'TOO_MANY_REDIRECTS', status: 502, response: null, url: current };
};

const sniffSupportedImageMime = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  const head6 = buffer.subarray(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  return '';
};

const validateRemoteImageMime = (declaredMime, buffer) => {
  const declared = String(declaredMime || '').split(';')[0].trim().toLowerCase();
  if (!declared.startsWith('image/')) return '';
  const aliases = {
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
    'image/x-png': 'image/png'
  };
  const normalized = aliases[declared] || declared;
  const detected = sniffSupportedImageMime(buffer);
  return detected && detected === normalized ? detected : '';
};

module.exports = {
  assertPinnedRemoteUrl,
  configuredImageProxyHosts,
  createPinnedAgent,
  createPinnedLookup,
  fetchRemoteImageWithPinnedDns,
  isAllowedHost,
  isPrivateIp,
  sniffSupportedImageMime,
  validateRemoteImageMime
};
