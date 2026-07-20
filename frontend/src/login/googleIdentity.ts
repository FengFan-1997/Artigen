const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GOOGLE_IDENTITY_SELECTOR = 'script[data-google-identity="1"]';
const DEFAULT_TIMEOUT_MS = 5000;

let googleIdentityPromise: Promise<void> | null = null;

const hasGoogleIdentity = () => {
  const google = (window as any).google;
  return Boolean(google?.accounts?.id);
};

export const resetGoogleIdentityScript = () => {
  googleIdentityPromise = null;
  document
    .querySelectorAll<HTMLScriptElement>(`${GOOGLE_IDENTITY_SELECTOR}[data-artigen-managed="1"]`)
    .forEach((script) => script.remove());
};

export const loadGoogleIdentityScript = (timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> => {
  if (hasGoogleIdentity()) return Promise.resolve();
  if (googleIdentityPromise) return googleIdentityPromise;

  const pending = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(GOOGLE_IDENTITY_SELECTOR);
    const script = existing || document.createElement('script');
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        if (script.dataset.artigenManaged === '1') script.remove();
        reject(error);
        return;
      }
      resolve();
    };
    const onLoad = () => finish();
    const onError = () => finish(new Error('GOOGLE_SCRIPT_FAILED'));
    const timeout = window.setTimeout(
      () => finish(new Error('GOOGLE_SCRIPT_TIMEOUT')),
      Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
    );

    script.onload = onLoad;
    script.onerror = onError;

    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = '1';
      script.dataset.artigenManaged = '1';
      document.head.appendChild(script);
    }
  });

  googleIdentityPromise = pending;
  void pending.catch(() => {
    if (googleIdentityPromise === pending) googleIdentityPromise = null;
  });
  return pending;
};
