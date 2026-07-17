import {
  ensureGuestUserId,
  getAuthSessionSnapshot,
  getOrCreateProjectId,
  getOrCreateSessionId
} from '../login/session';
import { authFetch } from '../login/authFetch';
import { buildApiUrl } from './api';
import { getPageContext } from './pageContext';

let autoClickInstalled = false;

const ANALYTICS_URL_BASE = 'https://analytics.invalid';
const RAW_CONTENT_FIELDS = new Set([
  'content',
  'dataurl',
  'error',
  'eventlabel',
  'file',
  'filename',
  'filepath',
  'image',
  'imageurl',
  'img',
  'imgurl',
  'input',
  'message',
  'output',
  'placeholder',
  'prompt',
  'rawtext',
  'reason',
  'selector',
  'src',
  'targettext',
  'text',
  'usertext'
]);

const decodeKey = (raw: string) => {
  let value = String(raw || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const isSensitiveAnalyticsQueryKey = (raw: string) => {
  const key = decodeKey(raw);
  if (!key) return false;
  return (
    key === 'auth' ||
    key === 'authorization' ||
    key === 'code' ||
    key === 'otp' ||
    key === 'sig' ||
    key.startsWith('img') ||
    key.startsWith('image') ||
    key.includes('token') ||
    key.includes('signature') ||
    key.endsWith('sig') ||
    key.endsWith('uri') ||
    key.endsWith('url') ||
    key.endsWith('password') ||
    key.endsWith('secret') ||
    key.endsWith('credential') ||
    key.endsWith('apikey')
  );
};

const looksLikeUrlValue = (raw: string) => {
  const value = String(raw || '').trim();
  return (
    /^(?:https?:)?\/\//i.test(value) ||
    /^\//.test(value) ||
    /^(?:data|blob|javascript):/i.test(value)
  );
};

export const sanitizeAnalyticsUrl = (raw: unknown, base = ANALYTICS_URL_BASE) => {
  const value = String(raw || '').trim();
  if (!value || /^(?:data|blob|javascript):/i.test(value)) return '';
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    const params = new URLSearchParams();
    for (const [key, paramValue] of url.searchParams.entries()) {
      if (isSensitiveAnalyticsQueryKey(key) || looksLikeUrlValue(paramValue)) continue;
      params.append(key, String(paramValue || '').slice(0, 160));
    }
    const path = url.pathname.startsWith('/') ? url.pathname : `/${url.pathname}`;
    const search = params.toString();
    return `${path || '/'}${search ? `?${search}` : ''}`;
  } catch {
    return '';
  }
};

const isCredentialField = (key: string) => {
  const normalized = decodeKey(key);
  return (
    normalized === 'authorization' ||
    normalized.includes('token') ||
    normalized.includes('signature') ||
    normalized.endsWith('password') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('credential') ||
    normalized.endsWith('apikey')
  );
};

const shouldDropAnalyticsField = (key: string) => {
  const normalized = decodeKey(key);
  return (
    isCredentialField(key) ||
    RAW_CONTENT_FIELDS.has(normalized) ||
    normalized.startsWith('image') ||
    normalized.startsWith('img')
  );
};

const isUrlField = (key: string) => {
  const normalized = decodeKey(key);
  return (
    normalized === 'href' ||
    normalized === 'location' ||
    normalized === 'path' ||
    normalized === 'referrer' ||
    normalized === 'url' ||
    normalized.endsWith('href') ||
    normalized.endsWith('location') ||
    normalized.endsWith('path') ||
    normalized.endsWith('referrer') ||
    normalized.endsWith('url')
  );
};

const scrubSensitiveQueryFragments = (raw: string) =>
  String(raw || '')
    .replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, _prefix, key) =>
      isSensitiveAnalyticsQueryKey(key) ? '' : match
    )
    .replace(/\?&/g, '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]+$/g, '');

const sanitizeAnalyticsString = (raw: string, key: string) => {
  const value = String(raw || '');
  if (isUrlField(key) || looksLikeUrlValue(value)) return sanitizeAnalyticsUrl(value);
  return scrubSensitiveQueryFragments(value).replace(/https?:\/\/[^\s"'<>]+/gi, (url) =>
    sanitizeAnalyticsUrl(url)
  );
};

export const sanitizeAnalyticsPayload = (input: unknown): Record<string, any> => {
  const seen = new WeakSet<object>();
  const walk = (value: any, key = ''): any => {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return sanitizeAnalyticsString(value, key);
    if (typeof value === 'function') return undefined;
    if (value instanceof URL) return sanitizeAnalyticsUrl(value.toString());
    if (typeof File !== 'undefined' && value instanceof File) {
      return { size: value.size, type: value.type, lastModified: value.lastModified };
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return { size: value.size, type: value.type };
    }
    if (value instanceof Error) return { name: value.name };
    if (typeof Event !== 'undefined' && value instanceof Event) return { type: value.type };
    if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) {
      return { tag: value.tagName, id: value.id, className: value.className };
    }
    if (!value || typeof value !== 'object') return undefined;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((entry) => walk(entry)).filter((entry) => entry !== undefined);
    }
    const output: Record<string, any> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (shouldDropAnalyticsField(entryKey)) continue;
      const next = walk(entryValue, entryKey);
      if (next !== undefined) output[entryKey] = next;
    }
    return output;
  };
  const result = walk(input);
  return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
};

const normalizeText = (raw: any, maxLen = 80) => {
  const s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const safeParseUrl = (raw: any) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    return new URL(s);
  } catch {
    return null;
  }
};

const installAutoClickTracking = () => {
  if (autoClickInstalled) return;
  autoClickInstalled = true;

  const isConsolePath = () => {
    try {
      return String(window.location.pathname || '').startsWith('/console');
    } catch {
      return false;
    }
  };

  let lastSig = '';
  let lastTs = 0;

  document.addEventListener(
    'click',
    (ev) => {
      if (isConsolePath()) return;
      const now = Date.now();
      if (now - lastTs < 400) return;

      const target = (ev?.target || null) as Element | null;
      if (!target) return;
      if (typeof (target as any).closest !== 'function') return;
      const el = (target as any).closest(
        'a,button,[role="button"],input[type="button"],input[type="submit"],.clickable'
      ) as HTMLElement | null;
      if (!el) return;

      const tag = String(el.tagName || '').toLowerCase();
      if (!tag) return;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const aria = normalizeText(el.getAttribute('aria-label'));
      const text = aria || normalizeText((el as any).innerText || (el as any).textContent || '');
      const id = normalizeText((el as any).id || '', 64);
      const cls = normalizeText((el as any).className || '', 120);

      const href = (() => {
        if (tag !== 'a') return '';
        const a = el as HTMLAnchorElement;
        const u = safeParseUrl(a.href);
        if (!u) return sanitizeAnalyticsUrl(a.getAttribute('href') || '');
        return normalizeText(sanitizeAnalyticsUrl(u.toString()), 240);
      })();

      const sig = `${tag}|${id}|${cls}|${href}|${text}`;
      if (sig === lastSig) return;

      lastSig = sig;
      lastTs = now;

      void trackBackendEvent('ui_click', {
        tag,
        targetId: id,
        targetClass: cls,
        targetText: text,
        targetHref: href
      });
    },
    true
  );
};

export const initAnalytics = () => {
  console.log('[Analytics] Initialized');
  try {
    installAutoClickTracking();
  } catch {}
};

const safeJsonStringify = (value: any) => {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'function') return undefined;
      if (v instanceof Error) {
        return { name: v.name };
      }
      if (v instanceof URL) return sanitizeAnalyticsUrl(v.toString());
      if (typeof File !== 'undefined' && v instanceof File) {
        return { size: v.size, type: v.type, lastModified: v.lastModified };
      }
      if (typeof Blob !== 'undefined' && v instanceof Blob) {
        return { size: v.size, type: v.type };
      }
      if (typeof Event !== 'undefined' && v instanceof Event) {
        return { type: v.type };
      }
      if (typeof HTMLElement !== 'undefined' && v instanceof HTMLElement) {
        return { tag: v.tagName, id: v.id, className: v.className };
      }
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
  } catch {
    return '';
  }
};

export const trackEvent = (
  categoryOrName: string,
  actionOrProps?: string | Record<string, any>,
  label?: string,
  value?: number
) => {
  // Check if second arg is object (Project existing style: eventName, properties)
  if (typeof actionOrProps === 'object') {
    const eventName = categoryOrName;
    const props = sanitizeAnalyticsPayload(actionOrProps);
    console.log(`[Analytics] ${eventName}`, props);
    if ((window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: eventName,
        ...props
      });
    }
    void trackBackendEvent(eventName, props);
    return;
  }

  // New style: (Category, Action, Label, Value)
  const category = categoryOrName;
  const action = actionOrProps as string;
  const legacyProps = sanitizeAnalyticsPayload({
    eventCategory: category,
    eventAction: action,
    eventLabel: label,
    eventValue: value
  });
  console.log(`[Analytics] ${category} - ${action}`, legacyProps);
  if ((window as any).dataLayer) {
    (window as any).dataLayer.push({
      event: 'custom_event',
      ...legacyProps
    });
  }
  void trackBackendEvent('custom_event', legacyProps);
};

export const trackPageView = (
  pathOrParams: string | { path: string; title?: string; location?: string }
) => {
  let path = '';
  let props = {};

  if (typeof pathOrParams === 'string') {
    path = sanitizeAnalyticsUrl(pathOrParams);
  } else {
    path = sanitizeAnalyticsUrl(pathOrParams.path);
    props = sanitizeAnalyticsPayload(pathOrParams);
  }

  const now = Date.now();
  const sig = `${String(path || '').trim()}|${String((props as any)?.location || '').trim()}`;
  if (sig && sig === lastPageViewSig && now - lastPageViewTs < 900) return;
  lastPageViewSig = sig;
  lastPageViewTs = now;

  console.log(`[Analytics] Page View: ${path}`, props);
  if ((window as any).dataLayer) {
    (window as any).dataLayer.push({
      event: 'page_view',
      pagePath: path,
      ...props
    });
  }
  void trackBackendEvent('page_view', { pagePath: path, ...props });
};

let lastPageViewSig = '';
let lastPageViewTs = 0;

/**
 * Mock Backend Data Collection
 * In a real app, this would be a fetch/axios call to your backend API.
 */
export const trackBackendEvent = async (eventType: string, payload: Record<string, any>) => {
  const url = buildApiUrl('/api/collection/event');
  const userId = ensureGuestUserId();
  const requestId = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const body: Record<string, any> = {
    eventType: String(eventType || '').trim() || 'event',
    payload: sanitizeAnalyticsPayload(payload),
    ts: Date.now(),
    userId,
    requestId,
    sessionId: getOrCreateSessionId(),
    projectId: getOrCreateProjectId(),
    pageContext: sanitizeAnalyticsPayload({ elements: getPageContext() }).elements || [],
    requestSource: 'site_analytics',
    path: (() => {
      try {
        const { pathname, search } = window.location;
        return sanitizeAnalyticsUrl(`${pathname || ''}${search || ''}`);
      } catch {
        return '';
      }
    })(),
    referrer: (() => {
      try {
        return sanitizeAnalyticsUrl(document.referrer || '');
      } catch {
        return '';
      }
    })()
  };

  const sanitizedBody = sanitizeAnalyticsPayload(body);
  let text = safeJsonStringify(sanitizedBody);
  if (!text) {
    sanitizedBody.payload = {};
    text = safeJsonStringify(sanitizedBody);
  }

  const authSession = getAuthSessionSnapshot();
  const mayHaveCookieSession = authSession.authenticated || !authSession.verified;

  try {
    const beacon = (navigator as any)?.sendBeacon;
    if (!mayHaveCookieSession && typeof beacon === 'function' && text && text.length < 58000) {
      const blob = new Blob([text], { type: 'application/json' });
      const ok = beacon.call(navigator, url, blob);
      if (ok) return { success: true, via: 'beacon' as const };
    }
  } catch {}

  try {
    const request = mayHaveCookieSession ? authFetch : fetch;
    const resp = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: text,
      keepalive: true
    });
    if (!resp.ok) return { success: false, status: resp.status };
    const data = await resp.json().catch(() => ({}));
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: typeof e?.message === 'string' ? e.message : String(e) };
  }
};
