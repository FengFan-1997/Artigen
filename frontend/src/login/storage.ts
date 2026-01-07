export const LOGIN_USERS_KEY = 'login_users_v1';
export const LOGIN_LAST_EMAIL_KEY = 'login_last_email_v1';

export type LocalUser = {
  email: string;
  userId: string;
  createdAt: number;
  lastLoginAt: number;
};

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
