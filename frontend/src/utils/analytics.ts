import { buildApiUrl } from '@/utils/api';
import { ensureGuestUserId } from '@/login/session';

export const initAnalytics = () => {
  console.log('[Analytics] Initialized');
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

/**
 * Mock Backend Data Collection
 * In a real app, this would be a fetch/axios call to your backend API.
 */
export const trackBackendEvent = async (eventType: string, payload: Record<string, any>) => {
  const url = buildApiUrl('/api/collection/event');
  const userId = ensureGuestUserId();
  const body: Record<string, any> = {
    eventType: String(eventType || '').trim() || 'event',
    payload: payload && typeof payload === 'object' ? payload : {},
    ts: Date.now(),
    userId,
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
