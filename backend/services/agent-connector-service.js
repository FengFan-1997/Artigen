const { ApiError } = require('../lib/api-error');
const { inspectUntrustedContent, sanitizeLogValue } = require('./agent-policy-service');

const PROVIDER_BASES = Object.freeze({
  github: 'https://api.github.com',
  google_drive: 'https://www.googleapis.com/drive/v3'
});
const SAFE_METHODS = new Set(['GET']);
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const assertConnectorPath = (provider, rawPath) => {
  const path = String(rawPath || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new ApiError(400, 'AGENT_CONNECTOR_PATH_INVALID');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new ApiError(400, 'AGENT_CONNECTOR_PATH_INVALID');
  }
  if (decoded.includes('..') || /[\u0000-\u001f]/.test(decoded)) {
    throw new ApiError(400, 'AGENT_CONNECTOR_PATH_INVALID');
  }
  const allowed = provider === 'github'
    ? /^\/(?:user|rate_limit|search\/(?:code|issues|repositories)|repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./?=&%:+-]*)?)$/
    : /^\/(?:files|about|changes|drives)(?:\/[A-Za-z0-9_./?=&%:+-]*)?$/;
  if (!allowed.test(path)) throw new ApiError(403, 'AGENT_CONNECTOR_PATH_FORBIDDEN');
  return path;
};

const connectorActionType = ({ provider, method, path }) => {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET') return 'read';
  if (verb === 'DELETE') return 'delete';
  if (/permissions/i.test(path)) return 'change_permissions';
  if (provider === 'github') return 'publish';
  return 'submit';
};

const createAgentConnectorService = ({
  integrationService,
  fetchImpl = globalThis.fetch
} = {}) => {
  if (!integrationService) throw new TypeError('AGENT_CONNECTOR_INTEGRATION_SERVICE_REQUIRED');

  const request = async ({
    userId,
    provider,
    method = 'GET',
    path,
    body = null
  }) => {
    if (!PROVIDER_BASES[provider]) throw new ApiError(404, 'AGENT_INTEGRATION_UNSUPPORTED');
    const verb = String(method || 'GET').trim().toUpperCase();
    if (!SAFE_METHODS.has(verb) && !WRITE_METHODS.has(verb)) {
      throw new ApiError(405, 'AGENT_CONNECTOR_METHOD_FORBIDDEN');
    }
    const safePath = assertConnectorPath(provider, path);
    const token = await integrationService.readTokenForConnector({ userId, provider });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    timer.unref?.();
    let response;
    const sourceUrl = `${PROVIDER_BASES[provider]}${safePath}`;
    try {
      response = await fetchImpl(sourceUrl, {
        method: verb,
        headers: {
          Accept: 'application/json',
          Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
          ...(body === null ? {} : { 'Content-Type': 'application/json' }),
          ...(provider === 'github' ? {
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Artigen-Agent'
          } : {})
        },
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error'
      });
    } catch (error) {
      throw new ApiError(502, 'AGENT_CONNECTOR_UNAVAILABLE', {
        retryable: true,
        cause: String(error?.name || error?.code || '')
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 512 * 1024) {
      throw new ApiError(502, 'AGENT_CONNECTOR_RESPONSE_TOO_LARGE');
    }
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { text: text.slice(0, 20_000) };
    }
    if (!response.ok) {
      throw new ApiError(502, 'AGENT_CONNECTOR_REQUEST_FAILED', {
        retryable: response.status >= 500 || response.status === 429,
        providerStatus: response.status
      });
    }
    const inspection = inspectUntrustedContent(text);
    return {
      status: response.status,
      sourceUrl,
      data: sanitizeLogValue(payload),
      untrusted: true,
      injectionSuspected: inspection.injectionSuspected,
      injectionSignals: inspection.injectionSignals,
      contentHash: inspection.contentHash
    };
  };

  return { request };
};

module.exports = {
  PROVIDER_BASES,
  SAFE_METHODS,
  WRITE_METHODS,
  assertConnectorPath,
  connectorActionType,
  createAgentConnectorService
};
