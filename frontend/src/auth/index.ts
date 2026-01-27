import { buildApiUrl } from '../utils/api';
import { getPageContext } from '@/agent/utils/pageContext';
import { getOrCreateProjectId, getOrCreateSessionId } from '@/login/session';

const STORAGE_KEY_ID = 'app_user_id';
const STORAGE_KEY_TOKEN = 'app_auth_token';
const LEGACY_STORAGE_KEY_ID = 'agent_user_id';
const LEGACY_STORAGE_KEY_TOKEN = 'agent_auth_token';

const API_URL = buildApiUrl('/api/auth');

const readFirst = (keys: string[]) => {
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.trim()) return v;
  }
  return '';
};

export const getUserId = (): string => {
  let userId = readFirst([STORAGE_KEY_ID, LEGACY_STORAGE_KEY_ID]).trim();
  if (!userId) {
    userId = `guest_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(STORAGE_KEY_ID, userId);
    localStorage.setItem(LEGACY_STORAGE_KEY_ID, userId);
  }
  return userId;
};

export const isLoggedIn = (): boolean => {
  const userId = readFirst([STORAGE_KEY_ID, LEGACY_STORAGE_KEY_ID]).trim();
  return !!userId && !userId.startsWith('guest_');
};

export const getAuthToken = (): string => {
  return readFirst([STORAGE_KEY_TOKEN, LEGACY_STORAGE_KEY_TOKEN]).trim();
};

export const logoutUser = () => {
  localStorage.removeItem(STORAGE_KEY_ID);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(LEGACY_STORAGE_KEY_ID);
  localStorage.removeItem(LEGACY_STORAGE_KEY_TOKEN);
  getUserId();
  window.location.reload();
};

const parseJsonOrTextError = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error ? String(data.error) : '';
  } catch {
    try {
      const text = await response.text();
      return text ? text.slice(0, 300) : '';
    } catch {
      return '';
    }
  }
};

export const loginUser = async (username: string, password: string) => {
  const fromUserId = getUserId();
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : '',
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'auth_login'
    })
  });

  if (!response.ok) {
    const msg = await parseJsonOrTextError(response);
    throw new Error(msg || 'Login failed');
  }

  const data = await response.json();
  const userId = String(data?.userId || '').trim();
  if (!userId) throw new Error('Login failed: missing userId');
  localStorage.setItem(STORAGE_KEY_ID, userId);
  localStorage.setItem(LEGACY_STORAGE_KEY_ID, userId);
  if (data?.token) {
    localStorage.setItem(STORAGE_KEY_TOKEN, String(data.token));
    localStorage.setItem(LEGACY_STORAGE_KEY_TOKEN, String(data.token));
  }
  return data;
};

export const registerUser = async (username: string, password: string, name: string) => {
  const fromUserId = getUserId();
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      name,
      fromUserId: fromUserId.startsWith('guest_') ? fromUserId : '',
      sessionId: getOrCreateSessionId(),
      projectId: getOrCreateProjectId(),
      pageContext: getPageContext(),
      requestSource: 'auth_register'
    })
  });

  if (!response.ok) {
    const msg = await parseJsonOrTextError(response);
    throw new Error(msg || 'Registration failed');
  }

  const data = await response.json();
  const userId = String(data?.userId || '').trim();
  if (!userId) throw new Error('Registration failed: missing userId');
  localStorage.setItem(STORAGE_KEY_ID, userId);
  localStorage.setItem(LEGACY_STORAGE_KEY_ID, userId);
  if (data?.token) {
    localStorage.setItem(STORAGE_KEY_TOKEN, String(data.token));
    localStorage.setItem(LEGACY_STORAGE_KEY_TOKEN, String(data.token));
  }
  return data;
};
