import { buildApiUrl } from '@/utils/api';
import { getPageContext } from '@/utils/pageContext';
import { ensureGuestUserId, getOrCreateProjectId, getOrCreateSessionId } from '@/login/session';

let autoClickInstalled = false;

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
        if (!u) return normalizeText(a.getAttribute('href') || '', 240);
        return normalizeText(`${u.pathname || ''}${u.search || ''}${u.hash || ''}`, 240);
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
        return { name: v.name, message: v.message, stack: v.stack };
      }
      if (v instanceof URL) return v.toString();
      if (typeof File !== 'undefined' && v instanceof File) {
        return { name: v.name, size: v.size, type: v.type, lastModified: v.lastModified };
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
    const props = actionOrProps;
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
  console.log(`[Analytics] ${category} - ${action}`, label, value);
  if ((window as any).dataLayer) {
    (window as any).dataLayer.push({
      event: 'custom_event',
      eventCategory: category,
      eventAction: action,
      eventLabel: label,
      eventValue: value
    });
  }
  void trackBackendEvent('custom_event', {
    eventCategory: category,
    eventAction: action,
    eventLabel: label,
    eventValue: value
  });
};

export const trackPageView = (
  pathOrParams: string | { path: string; title?: string; location?: string }
) => {
  let path = '';
  let props = {};

  if (typeof pathOrParams === 'string') {
    path = pathOrParams;
  } else {
    path = pathOrParams.path;
    props = pathOrParams;
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
    payload: payload && typeof payload === 'object' ? payload : {},
    ts: Date.now(),
    userId,
    requestId,
    sessionId: getOrCreateSessionId(),
    projectId: getOrCreateProjectId(),
    pageContext: getPageContext(),
    requestSource: 'site_analytics',
    path: (() => {
      try {
        const { pathname, search, hash } = window.location;
        return `${pathname || ''}${search || ''}${hash || ''}`;
      } catch {
        return '';
      }
    })(),
    location: (() => {
      try {
        return window.location.href;
      } catch {
        return '';
      }
    })(),
    referrer: (() => {
      try {
        return document.referrer || '';
      } catch {
        return '';
      }
    })()
  };

  let text = safeJsonStringify(body);
  if (!text) {
    body.payload = {};
    text = safeJsonStringify(body);
  }

  try {
    const beacon = (navigator as any)?.sendBeacon;
    if (typeof beacon === 'function' && text && text.length < 58000) {
      const blob = new Blob([text], { type: 'application/json' });
      const ok = beacon.call(navigator, url, blob);
      if (ok) return { success: true, via: 'beacon' as const };
    }
  } catch {}

  try {
    const resp = await fetch(url, {
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
