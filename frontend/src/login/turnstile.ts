const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SCRIPT_SELECTOR = 'script[data-artigen-turnstile]';

let scriptPromise: Promise<void> | null = null;

export const EMAIL_OTP_TURNSTILE_ACTION = 'email_otp';
export const PASSWORD_RESET_TURNSTILE_ACTION = 'password_reset_otp';

export const turnstileSiteKey = () =>
  String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

export const isTurnstileConfigured = () => Boolean(turnstileSiteKey());

const removeTurnstileScript = () => {
  try {
    document.querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR)?.remove();
  } catch {}
};

export const resetTurnstileLoader = () => {
  scriptPromise = null;
  removeTurnstileScript();
};

export const loadTurnstile = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('TURNSTILE_BROWSER_REQUIRED'));
  const existingApi = (window as any).turnstile;
  if (existingApi?.render) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  const pending = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR);
    if (existing) {
      if (existing.dataset.artigenTurnstileState === 'loaded') {
        existing.remove();
        scriptPromise = null;
        void loadTurnstile().then(resolve, reject);
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          existing.remove();
          reject(new Error('TURNSTILE_LOAD_FAILED'));
        },
        { once: true }
      );
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.artigenTurnstile = '1';
    script.dataset.artigenTurnstileState = 'loading';
    script.onload = () => {
      script.dataset.artigenTurnstileState = 'loaded';
      resolve();
    };
    script.onerror = () => {
      script.dataset.artigenTurnstileState = 'failed';
      script.remove();
      reject(new Error('TURNSTILE_LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });
  scriptPromise = pending;
  void pending.catch(() => {
    if (scriptPromise !== pending) return;
    scriptPromise = null;
    removeTurnstileScript();
  });
  return pending;
};
