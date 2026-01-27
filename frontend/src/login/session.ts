const STORAGE_KEY_ID = 'app_user_id';
const STORAGE_KEY_TOKEN = 'app_auth_token';
const LEGACY_STORAGE_KEY_ID = 'agent_user_id';
const LEGACY_STORAGE_KEY_TOKEN = 'agent_auth_token';
const SESSION_ID_KEY = 'agent_session_id_v1';
const PROJECT_ID_KEY = 'agent_project_id_v1';

export const isLocalLoggedIn = (): boolean => {
  try {
    const uid = String(
      window.localStorage.getItem(STORAGE_KEY_ID) ||
        window.localStorage.getItem(LEGACY_STORAGE_KEY_ID) ||
        ''
    ).trim();
    return !!uid && !uid.startsWith('guest_');
  } catch {
    return false;
  }
};

export const getCurrentUserId = (): string => {
  try {
    return String(
      window.localStorage.getItem(STORAGE_KEY_ID) ||
        window.localStorage.getItem(LEGACY_STORAGE_KEY_ID) ||
        ''
    ).trim();
  } catch {
    return '';
  }
};

export const getAuthToken = (): string => {
  try {
    return String(
      window.localStorage.getItem(STORAGE_KEY_TOKEN) ||
        window.localStorage.getItem(LEGACY_STORAGE_KEY_TOKEN) ||
        ''
    ).trim();
  } catch {
    return '';
  }
};

export const ensureGuestUserId = (): string => {
  const existing = getCurrentUserId();
  if (existing) return existing;
  const guest = `guest_${Math.random().toString(36).slice(2, 11)}`;
  try {
    window.localStorage.setItem(STORAGE_KEY_ID, guest);
    window.localStorage.setItem(LEGACY_STORAGE_KEY_ID, guest);
  } catch {}
  return guest;
};

export const setLoggedIn = (input: { userId: string; token?: string }) => {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('MISSING_USER_ID');
  const token = String(input.token || '').trim();
  try {
    window.localStorage.setItem(STORAGE_KEY_ID, userId);
    window.localStorage.setItem(LEGACY_STORAGE_KEY_ID, userId);
    if (token) {
      window.localStorage.setItem(STORAGE_KEY_TOKEN, token);
      window.localStorage.setItem(LEGACY_STORAGE_KEY_TOKEN, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY_TOKEN);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY_TOKEN);
    }
  } catch {}
  try {
    if (typeof document === 'undefined') return;
    const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:';
    if (token) {
      const v = encodeURIComponent(token);
      document.cookie = `auth_token=${v}; Path=/; Max-Age=2592000; SameSite=Lax${secure ? '; Secure' : ''}`;
    } else {
      document.cookie = `auth_token=; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
    }
  } catch {}
};

export const logoutLocal = (opts?: { redirectTo?: string; reload?: boolean }) => {
  try {
    window.localStorage.removeItem(STORAGE_KEY_ID);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY_ID);
    window.localStorage.removeItem(STORAGE_KEY_TOKEN);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY_TOKEN);
  } catch {}
  try {
    if (typeof document !== 'undefined') {
      const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:';
      document.cookie = `auth_token=; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
    }
  } catch {}
  ensureGuestUserId();
  try {
    window.dispatchEvent(new CustomEvent('app-auth-changed'));
  } catch {}
  const redirectTo = String(opts?.redirectTo || '').trim();
  if (redirectTo) {
    const to = /^https?:\/\//i.test(redirectTo)
      ? redirectTo
      : `${window.location.origin}${redirectTo.startsWith('/') ? redirectTo : `/${redirectTo}`}`;
    window.location.assign(to);
    return;
  }
  if (opts?.reload === false) return;
  window.location.reload();
};

export const getOrCreateSessionId = (): string => {
  const make = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {}
  const created = make();
  try {
    window.sessionStorage.setItem(SESSION_ID_KEY, created);
  } catch {}
  return created;
};

const computeDefaultProjectId = () => {
  try {
    const host = String(window.location?.host || '').trim();
    if (host) return host;
  } catch {}
  return 'default';
};

export const getOrCreateProjectId = (): string => {
  try {
    const existing = window.localStorage.getItem(PROJECT_ID_KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {}
  const created = computeDefaultProjectId();
  try {
    window.localStorage.setItem(PROJECT_ID_KEY, created);
  } catch {}
  return created;
};
