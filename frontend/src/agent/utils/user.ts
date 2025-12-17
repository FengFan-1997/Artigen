const STORAGE_KEY_ID = 'agent_user_id';
const STORAGE_KEY_TOKEN = 'agent_auth_token';
const API_URL = 'http://localhost:8080/api/auth';

export const getUserId = (): string => {
  let userId = localStorage.getItem(STORAGE_KEY_ID);
  if (!userId) {
    // Generate temporary ID for guests
    userId = 'guest_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(STORAGE_KEY_ID, userId);
  }
  return userId;
};

export const isLoggedIn = (): boolean => {
  const userId = localStorage.getItem(STORAGE_KEY_ID);
  return !!userId && !userId.startsWith('guest_');
};

export const logoutUser = () => {
  localStorage.removeItem(STORAGE_KEY_ID);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  // Reset to guest
  getUserId();
  window.location.reload();
};

export const loginUser = async (username: string, password: string) => {
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Login failed');
  }

  const data = await response.json();
  localStorage.setItem(STORAGE_KEY_ID, data.userId);
  localStorage.setItem(STORAGE_KEY_TOKEN, data.token || 'dummy_token'); // If we had JWT
  return data;
};

export const registerUser = async (username: string, password: string, name: string) => {
  const response = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, name })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Registration failed');
  }

  const data = await response.json();
  localStorage.setItem(STORAGE_KEY_ID, data.userId);
  localStorage.setItem(STORAGE_KEY_TOKEN, data.token || 'dummy_token');
  return data;
};
