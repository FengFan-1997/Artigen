export const LOGIN_USERS_KEY = 'login_users_v1';
export const LOGIN_LAST_EMAIL_KEY = 'login_last_email_v1';
export const LOGIN_LAST_USERNAME_KEY = 'login_last_username_v1';
export const LOGIN_PASSWORDS_KEY = 'login_passwords_v1';

export type LocalUser = {
  email: string;
  userId: string;
  createdAt: number;
  lastLoginAt: number;
};

type PasswordRecord = {
  password: string;
  updatedAt: number;
};

type PasswordMap = Record<string, PasswordRecord>;

const safeParse = <T>(text: string | null, fallback: T): T => {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

export const loadUsers = (): LocalUser[] => {
  try {
    const raw = window.localStorage.getItem(LOGIN_USERS_KEY);
    const list = safeParse<LocalUser[]>(raw, []);
    return Array.isArray(list)
      ? list.filter((u) => u && typeof u.email === 'string' && typeof u.userId === 'string')
      : [];
  } catch {
    return [];
  }
};

export const saveUsers = (users: LocalUser[]) => {
  try {
    window.localStorage.setItem(LOGIN_USERS_KEY, JSON.stringify(users));
  } catch {}
};

export const upsertUser = (input: { email: string; userId: string }) => {
  const now = Date.now();
  const email = input.email.trim().toLowerCase();
  const userId = input.userId.trim();
  const users = loadUsers();
  const idx = users.findIndex((u) => u.email === email);
  if (idx >= 0) {
    users[idx] = { ...users[idx], userId, lastLoginAt: now };
  } else {
    users.unshift({ email, userId, createdAt: now, lastLoginAt: now });
  }
  saveUsers(users);
};

export const setLastEmail = (email: string) => {
  try {
    window.localStorage.setItem(
      LOGIN_LAST_EMAIL_KEY,
      String(email || '')
        .trim()
        .toLowerCase()
    );
  } catch {}
};

export const getLastEmail = () => {
  try {
    return String(window.localStorage.getItem(LOGIN_LAST_EMAIL_KEY) || '')
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
};

export const setLastUsername = (username: string) => {
  try {
    window.localStorage.setItem(LOGIN_LAST_USERNAME_KEY, String(username || '').trim());
  } catch {}
};

export const getLastUsername = () => {
  try {
    return String(window.localStorage.getItem(LOGIN_LAST_USERNAME_KEY) || '').trim();
  } catch {
    return '';
  }
};

const loadPasswordMap = (): PasswordMap => {
  try {
    const raw = window.localStorage.getItem(LOGIN_PASSWORDS_KEY);
    const m = safeParse<PasswordMap>(raw, {});
    if (!m || typeof m !== 'object') return {};
    const out: PasswordMap = {};
    for (const [k, v] of Object.entries(m)) {
      const key = String(k || '')
        .trim()
        .toLowerCase();
      const pw = typeof (v as any)?.password === 'string' ? String((v as any).password) : '';
      const updatedAt = Number((v as any)?.updatedAt ?? 0) || 0;
      if (!key || !pw) continue;
      out[key] = { password: pw, updatedAt };
    }
    return out;
  } catch {
    return {};
  }
};

const savePasswordMap = (m: PasswordMap) => {
  try {
    window.localStorage.setItem(LOGIN_PASSWORDS_KEY, JSON.stringify(m || {}));
  } catch {}
};

export const setSavedPassword = (username: string, password: string) => {
  const u = String(username || '')
    .trim()
    .toLowerCase();
  const p = String(password || '');
  if (!u || !p) return;
  const m = loadPasswordMap();
  m[u] = { password: p, updatedAt: Date.now() };
  savePasswordMap(m);
};

export const getSavedPassword = (username: string) => {
  const u = String(username || '')
    .trim()
    .toLowerCase();
  if (!u) return '';
  const m = loadPasswordMap();
  return typeof m[u]?.password === 'string' ? m[u].password : '';
};
