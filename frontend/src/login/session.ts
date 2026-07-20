import { buildApiUrl } from '../utils/api';
import { authFetch, clearCsrfToken, setCsrfToken } from './authFetch';

const STORAGE_KEY_ID = 'app_user_id';
const STORAGE_KEY_TOKEN = 'app_auth_token';
const LEGACY_STORAGE_KEY_ID = 'agent_user_id';
const LEGACY_STORAGE_KEY_TOKEN = 'agent_auth_token';
const LEGACY_PASSWORD_STORAGE_KEY = 'login_passwords_v1';
const LEGACY_GENERATION_HISTORY_PREFIX = 'artigen_history_v1_';
const SESSION_ID_KEY = 'agent_session_id_v1';
const PROJECT_ID_KEY = 'agent_project_id_v1';
const LEGACY_CREDENTIAL_STORAGE_KEYS = [
  STORAGE_KEY_TOKEN,
  LEGACY_STORAGE_KEY_TOKEN,
  LEGACY_PASSWORD_STORAGE_KEY
] as const;

let authSessionStatus: 'unknown' | 'authenticated' | 'guest' = 'unknown';
let authSessionBootstrapPromise: Promise<AuthSessionSnapshot> | null = null;
let authSessionBootstrapStarted = false;
let authStateRevision = 0;
let lastBroadcastAuthSnapshot = '';

type RemovableStorage = Pick<Storage, 'removeItem'>;
type EnumerableStorage = Pick<Storage, 'key' | 'length' | 'removeItem'>;

const getBrowserStorage = (): RemovableStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const getEnumerableBrowserStorage = (): EnumerableStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const clearLegacyClientCredentials = (
  storage: RemovableStorage | null = getBrowserStorage()
) => {
  for (const key of LEGACY_CREDENTIAL_STORAGE_KEYS) {
    try {
      storage?.removeItem(key);
    } catch {}
  }
};

export const clearLegacySensitiveGenerationHistory = (
  storage: EnumerableStorage | null = getEnumerableBrowserStorage()
) => {
  if (!storage) return;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_GENERATION_HISTORY_PREFIX)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {}
  }
};

export const clearLegacyScriptAuthCookie = () => {
  try {
    if (typeof document === 'undefined') return;
    const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:';
    document.cookie = `auth_token=; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
  } catch {}
};

// Old bearer credentials must not survive a reload. New sessions are carried by HttpOnly cookies.
clearLegacyClientCredentials();
clearLegacySensitiveGenerationHistory();
clearLegacyScriptAuthCookie();

export const isLocalLoggedIn = (): boolean => {
  try {
    const uid = String(
      window.localStorage.getItem(STORAGE_KEY_ID) ||
        window.localStorage.getItem(LEGACY_STORAGE_KEY_ID) ||
        ''
    ).trim();
    return !!uid && !uid.startsWith('guest_') && authSessionStatus === 'authenticated';
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

export const setLoggedIn = (input: { userId: string }) => {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('MISSING_USER_ID');
  authStateRevision += 1;
  authSessionStatus = 'authenticated';
  try {
    window.localStorage.setItem(STORAGE_KEY_ID, userId);
    window.localStorage.setItem(LEGACY_STORAGE_KEY_ID, userId);
  } catch {}
  clearLegacyClientCredentials();
  dispatchAuthSnapshotChanged();
  Promise.resolve().then(() => void bootstrapAuthSession({ force: true }));
};

const clearStoredUserIds = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY_ID);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY_ID);
  } catch {}
};

export type AuthSessionSnapshot = {
  authenticated: boolean;
  userId: string;
  verified: boolean;
};

export const getAuthSessionSnapshot = (): AuthSessionSnapshot => {
  const userId = getCurrentUserId();
  return {
    authenticated: isLocalLoggedIn(),
    userId: userId.startsWith('guest_') ? '' : userId,
    verified: authSessionStatus !== 'unknown'
  };
};

const dispatchAuthSnapshotChanged = () => {
  const snapshot = getAuthSessionSnapshot();
  const snapshotKey = JSON.stringify(snapshot);
  if (snapshotKey === lastBroadcastAuthSnapshot) return false;
  lastBroadcastAuthSnapshot = snapshotKey;
  try {
    window.dispatchEvent(new CustomEvent('app-auth-changed', { detail: snapshot }));
  } catch {}
  return true;
};

const applyGuestSession = (bumpRevision = false) => {
  if (bumpRevision) authStateRevision += 1;
  authSessionStatus = 'guest';
  const existingId = getCurrentUserId();
  // Preserve an anonymous workspace across refreshes. Only a stale authenticated
  // identity is replaced when the server confirms that its Cookie session ended.
  if (!existingId.startsWith('guest_')) clearStoredUserIds();
  clearCsrfToken();
  ensureGuestUserId();
  dispatchAuthSnapshotChanged();
};

const parseSessionUserId = (json: any) =>
  String(json?.userId || json?.user?.userId || json?.user?.id || json?.session?.userId || '').trim();

export const bootstrapAuthSession = async (opts?: {
  force?: boolean;
}): Promise<AuthSessionSnapshot> => {
  if (authSessionBootstrapPromise && !opts?.force) return authSessionBootstrapPromise;

  const run = async (): Promise<AuthSessionSnapshot> => {
    const revision = authStateRevision;
    try {
      const response = await authFetch(buildApiUrl('/api/auth/session'), { method: 'GET' });
      const json: any = await response.json().catch(() => null);
      if (revision !== authStateRevision) return getAuthSessionSnapshot();
      if (json?.csrfToken) setCsrfToken(json.csrfToken);
      const userId = parseSessionUserId(json);
      const explicitlyLoggedOut =
        response.status === 401 ||
        response.status === 403 ||
        json?.authenticated === false ||
        json?.loggedIn === false ||
        (response.ok && json?.ok === false && !userId);

      if (explicitlyLoggedOut) {
        applyGuestSession();
        return getAuthSessionSnapshot();
      }
      if (!response.ok || !userId || userId.startsWith('guest_')) {
        return getAuthSessionSnapshot();
      }

      authSessionStatus = 'authenticated';
      try {
        window.localStorage.setItem(STORAGE_KEY_ID, userId);
        window.localStorage.setItem(LEGACY_STORAGE_KEY_ID, userId);
      } catch {}
      clearLegacyClientCredentials();
      dispatchAuthSnapshotChanged();
      return getAuthSessionSnapshot();
    } catch {
      return getAuthSessionSnapshot();
    }
  };

  const pending = run();
  authSessionBootstrapPromise = pending;
  try {
    return await pending;
  } finally {
    if (authSessionBootstrapPromise === pending) authSessionBootstrapPromise = null;
  }
};

export const startAuthSessionBootstrap = () => {
  if (authSessionBootstrapStarted || typeof window === 'undefined') return;
  authSessionBootstrapStarted = true;
  Promise.resolve().then(() => void bootstrapAuthSession());
};

export const initializeAuthSessionForPageLoad = () => {
  if (typeof window === 'undefined') return;
  const storedUserId = getCurrentUserId();
  if (storedUserId && !storedUserId.startsWith('guest_')) {
    startAuthSessionBootstrap();
    return;
  }
  applyGuestSession();
};

export const logoutSession = async () => {
  const request = authFetch(buildApiUrl('/api/auth/logout'), {
    method: 'POST',
    keepalive: true
  });
  applyGuestSession(true);
  clearLegacyClientCredentials();
  clearLegacyScriptAuthCookie();
  try {
    await request;
  } catch {}
};

export const logoutLocal = (opts?: { redirectTo?: string; reload?: boolean }) => {
  const pending = logoutSession();
  const redirectTo = String(opts?.redirectTo || '').trim();
  if (!redirectTo && opts?.reload === false) return;
  const navigate = () => {
    if (redirectTo) {
      const to = /^https?:\/\//i.test(redirectTo)
        ? redirectTo
        : `${window.location.origin}${redirectTo.startsWith('/') ? redirectTo : `/${redirectTo}`}`;
      window.location.assign(to);
      return;
    }
    window.location.reload();
  };
  const maxWait = new Promise<void>((resolve) => window.setTimeout(resolve, 1500));
  void Promise.race([pending, maxWait]).finally(navigate);
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

initializeAuthSessionForPageLoad();
