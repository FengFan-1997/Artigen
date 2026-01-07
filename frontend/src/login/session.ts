const STORAGE_KEY_ID = 'app_user_id';
const STORAGE_KEY_TOKEN = 'app_auth_token';
const LEGACY_STORAGE_KEY_ID = 'agent_user_id';
const LEGACY_STORAGE_KEY_TOKEN = 'agent_auth_token';

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
};

export const logoutLocal = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY_ID);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY_ID);
    window.localStorage.removeItem(STORAGE_KEY_TOKEN);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY_TOKEN);
  } catch {}
  ensureGuestUserId();
  window.location.reload();
};
