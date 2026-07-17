export type AuthFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl?: typeof fetch
) => Promise<Response>;

let csrfToken = '';
let csrfEpoch = 0;
let csrfRefreshPromise: Promise<string> | null = null;

export const getCsrfToken = () => csrfToken;

export const setCsrfToken = (raw: unknown) => {
  csrfEpoch += 1;
  csrfToken = String(raw || '').trim();
};

export const clearCsrfToken = () => {
  csrfEpoch += 1;
  csrfToken = '';
};

const requestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const requestPath = (input: RequestInfo | URL) => {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://app.invalid';
    return new URL(requestUrl(input), base).pathname;
  } catch {
    return '';
  }
};

const isUnsafeMethod = (method: string | undefined) =>
  !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').trim().toUpperCase());

const requestMethod = (input: RequestInfo | URL, init: RequestInit) => {
  if (init.method) return init.method;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
  return 'GET';
};

const CSRF_EXEMPT_AUTH_PATHS = new Set([
  '/api/login/send-code',
  '/api/login/verify',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google/verify',
  '/api/auth/password-reset/send-code',
  '/api/auth/password-reset/reset'
]);

const isCsrfExemptAuthRequest = (input: RequestInfo | URL) =>
  CSRF_EXEMPT_AUTH_PATHS.has(requestPath(input));

const sessionUrlForRequest = (input: RequestInfo | URL) => {
  try {
    const raw = requestUrl(input);
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://app.invalid';
    const url = new URL(raw, base);
    const apiIndex = url.pathname.indexOf('/api/');
    url.pathname = `${apiIndex >= 0 ? url.pathname.slice(0, apiIndex) : ''}/api/auth/session`;
    url.search = '';
    url.hash = '';
    const wasAbsolute = /^(?:https?:)?\/\//i.test(raw);
    return wasAbsolute ? url.toString() : `${url.pathname}${url.search}`;
  } catch {
    return '/api/auth/session';
  }
};

const refreshCsrfToken = (input: RequestInfo | URL, fetchImpl: typeof fetch) => {
  if (csrfRefreshPromise) return csrfRefreshPromise;
  const epoch = csrfEpoch;
  const pending = (async () => {
    try {
      const response = await fetchImpl(sessionUrlForRequest(input), {
        method: 'GET',
        credentials: 'include'
      });
      if (!response.ok) return '';
      const json: any = await response.json().catch(() => null);
      const token = String(json?.csrfToken || '').trim();
      if (token && epoch === csrfEpoch) csrfToken = token;
      return token;
    } catch {
      return '';
    }
  })();
  csrfRefreshPromise = pending;
  void pending.finally(() => {
    if (csrfRefreshPromise === pending) csrfRefreshPromise = null;
  });
  return pending;
};

export const authFetch: AuthFetch = async (input, init = {}, fetchImpl = fetch) => {
  let requestCsrfToken = csrfToken;
  const unsafe = isUnsafeMethod(requestMethod(input, init));
  if (unsafe && !requestCsrfToken && !isCsrfExemptAuthRequest(input)) {
    requestCsrfToken = await refreshCsrfToken(input, fetchImpl);
  }

  let headers = init.headers;
  if (unsafe && requestCsrfToken) {
    const nextHeaders = new Headers(init.headers);
    if (!nextHeaders.has('X-CSRF-Token')) nextHeaders.set('X-CSRF-Token', requestCsrfToken);
    headers = nextHeaders;
  }

  const response = await fetchImpl(input, {
    ...init,
    ...(headers ? { headers } : {}),
    credentials: 'include'
  });
  const responseCsrfToken = String(response.headers.get('X-CSRF-Token') || '').trim();
  if (responseCsrfToken) setCsrfToken(responseCsrfToken);
  return response;
};

export const isSameOriginRequest = (input: RequestInfo | URL, origin?: string) => {
  try {
    const base =
      String(origin || '').trim() ||
      (typeof window !== 'undefined' ? window.location.origin : 'https://app.invalid');
    return new URL(requestUrl(input), base).origin === new URL(base).origin;
  } catch {
    return false;
  }
};

export const resourceFetch: AuthFetch = (input, init = {}, fetchImpl = fetch) =>
  fetchImpl(input, {
    ...init,
    credentials: isSameOriginRequest(input) ? 'include' : 'omit'
  });
