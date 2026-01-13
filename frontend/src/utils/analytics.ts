type AnyRecord = Record<string, any>;

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    _hmt?: any[];
  }
}

const readEnv = (key: string) => {
  try {
    const env = (import.meta as any)?.env || {};
    const v = env[key];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
};

const ensureScript = (id: string, src: string) => {
  if (!id || !src) return;
  try {
    const existing = document.head.querySelector<HTMLScriptElement>(`script#${CSS.escape(id)}`);
    if (existing) return;
    const s = document.createElement('script');
    s.id = id;
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  } catch {}
};

let inited = false;

export const initAnalytics = () => {
  if (inited) return;
  inited = true;

  const ga4Id = readEnv('VITE_GA4_ID');
  if (ga4Id) {
    ensureScript(
      'ga4-gtag',
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`
    );
    try {
      window.dataLayer = window.dataLayer || [];
      window.gtag =
        window.gtag ||
        function gtag(...args: any[]) {
          window.dataLayer!.push(args);
        };
      window.gtag('js', new Date());
      window.gtag('config', ga4Id, { send_page_view: false });
    } catch {}
  }

  const baiduHmId = readEnv('VITE_BAIDU_HM_ID');
  if (baiduHmId) {
    try {
      window._hmt = window._hmt || [];
    } catch {}
    ensureScript('baidu-hm', `https://hm.baidu.com/hm.js?${encodeURIComponent(baiduHmId)}`);
  }
};

const safeText = (v: any, maxLen = 180) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const buildBaiduLabel = (params: AnyRecord) => {
  const pieces: string[] = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (typeof v === 'object') continue;
    const key = safeText(k, 40);
    const val = safeText(v, 80);
    if (!key || !val) continue;
    pieces.push(`${key}=${val}`);
    if (pieces.length >= 6) break;
  }
  return safeText(pieces.join('&'), 180);
};

export const trackPageView = (input: { path: string; title?: string; location?: string }) => {
  const path = safeText(input?.path, 240) || '/';
  const title = safeText(input?.title, 240);
  const location = safeText(input?.location, 400) || safeText(window.location.href, 400);

  try {
    const ga4Id = readEnv('VITE_GA4_ID');
    if (ga4Id && typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: path,
        page_title: title || undefined,
        page_location: location || undefined
      });
    }
  } catch {}

  try {
    const baiduHmId = readEnv('VITE_BAIDU_HM_ID');
    if (baiduHmId && Array.isArray(window._hmt)) {
      window._hmt.push(['_trackPageview', path]);
    }
  } catch {}
};

export const trackEvent = (name: string, params: AnyRecord = {}) => {
  const eventName = safeText(name, 60);
  if (!eventName) return;

  try {
    const ga4Id = readEnv('VITE_GA4_ID');
    if (ga4Id && typeof window.gtag === 'function') {
      const payload: AnyRecord = {};
      for (const [k, v] of Object.entries(params || {})) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'object') continue;
        payload[k] = typeof v === 'string' ? safeText(v, 120) : v;
      }
      window.gtag('event', eventName, payload);
    }
  } catch {}

  try {
    const baiduHmId = readEnv('VITE_BAIDU_HM_ID');
    if (baiduHmId && Array.isArray(window._hmt)) {
      const category = safeText((params as any)?.category, 40) || 'funnel';
      const label = buildBaiduLabel(params);
      const valueRaw = (params as any)?.value;
      const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : undefined;
      const args: any[] = ['_trackEvent', category, eventName];
      if (label) args.push(label);
      if (value !== undefined) args.push(value);
      window._hmt.push(args);
    }
  } catch {}
};
