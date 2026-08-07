import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapAuthSession,
  clearLegacyClientCredentials,
  clearLegacySensitiveGenerationHistory,
  clearLegacyScriptAuthCookie,
  getAuthSessionSnapshot,
  getCurrentUserId,
  initializeAuthSessionForPageLoad,
  logoutSession,
  setLoggedIn
} from './session';
import { getCsrfToken, setCsrfToken } from './authFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cookie-session client compatibility', () => {
  const createStorage = (entries: Record<string, string> = {}) => {
    const values = new Map(Object.entries(entries));
    return {
      values,
      get length() {
        return values.size;
      },
      key: vi.fn((index: number) => Array.from(values.keys())[index] || null),
      getItem: vi.fn((key: string) => values.get(key) || null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key))
    };
  };

  it('clears every legacy credential key', () => {
    const removeItem = vi.fn();
    clearLegacyClientCredentials({ removeItem });

    expect(removeItem.mock.calls.map(([key]) => key)).toEqual([
      'app_auth_token',
      'agent_auth_token',
      'login_passwords_v1'
    ]);
  });

  it('removes legacy generation histories that contained raw prompts and image URLs', () => {
    const storage = createStorage({
      artigen_history_v1_guest_private: '[{"userText":"secret"}]',
      artigen_history_v1_user_private: '[{"image":"https://private.example/a.png"}]',
      artigen_history_v2_user_private: '{"version":2,"items":[]}',
      app_lang: 'zh'
    });

    clearLegacySensitiveGenerationHistory(storage);

    expect(storage.values.has('artigen_history_v1_guest_private')).toBe(false);
    expect(storage.values.has('artigen_history_v1_user_private')).toBe(false);
    expect(storage.values.has('artigen_history_v2_user_private')).toBe(true);
    expect(storage.values.get('app_lang')).toBe('zh');
  });

  it('expires the legacy script-readable auth cookie without writing a credential', () => {
    const documentStub = { cookie: '' };
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', { location: { protocol: 'https:' } });

    clearLegacyScriptAuthCookie();

    expect(documentStub.cookie).toContain('auth_token=;');
    expect(documentStub.cookie).toContain('Max-Age=0');
    expect(documentStub.cookie).toContain('Secure');
  });

  it('stores the user id but never persists the bearer token', () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal('window', {
      localStorage: { setItem, removeItem },
      location: { protocol: 'https:' }
    });

    setLoggedIn({ userId: 'user_1', token: 'bearer-secret' } as any);

    expect(setItem).toHaveBeenCalledWith('app_user_id', 'user_1');
    expect(setItem).toHaveBeenCalledWith('agent_user_id', 'user_1');
    expect(setItem.mock.calls.some(([key]) => String(key).includes('auth_token'))).toBe(false);
    expect(removeItem).toHaveBeenCalledWith('app_auth_token');
    expect(removeItem).toHaveBeenCalledWith('agent_auth_token');
  });

  it('broadcasts auth changes once for each distinct session snapshot', async () => {
    const localStorage = createStorage();
    const dispatchEvent = vi.fn();
    class CustomEventStub {
      type: string;
      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    }
    vi.stubGlobal('CustomEvent', CustomEventStub);
    vi.stubGlobal('window', {
      localStorage,
      location: { origin: 'https://app.example', protocol: 'https:', host: 'app.example' },
      dispatchEvent
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            authenticated: true,
            userId: 'user_event_once'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    setLoggedIn({ userId: 'user_event_once' });
    await bootstrapAuthSession({ force: true });
    setLoggedIn({ userId: 'user_event_once' });
    await bootstrapAuthSession({ force: true });

    const authEvents = dispatchEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event?.type === 'app-auth-changed');
    expect(authEvents).toHaveLength(1);
    expect(authEvents[0]?.detail).toEqual({
      authenticated: true,
      userId: 'user_event_once',
      verified: true
    });
  });

  it('restores a refreshed page from the HttpOnly cookie session', async () => {
    const localStorage = createStorage({ app_user_id: 'guest_before_refresh' });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      localStorage,
      location: { origin: 'https://app.example', protocol: 'https:', host: 'app.example' },
      dispatchEvent
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          authenticated: true,
          userId: 'user_cookie',
          csrfToken: 'csrf-cookie'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await bootstrapAuthSession({ force: true });

    expect(session).toEqual({ authenticated: true, userId: 'user_cookie', verified: true });
    expect(getCurrentUserId()).toBe('user_cookie');
    expect(getCsrfToken()).toBe('csrf-cookie');
    expect(localStorage.values.get('app_auth_token')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      method: 'GET',
      credentials: 'include'
    });
  });

  it('checks the cookie-backed session for a new anonymous page load', async () => {
    const localStorage = createStorage();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, authenticated: false, userId: null, user: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('window', {
      localStorage,
      location: { origin: 'https://app.example', protocol: 'https:', host: 'app.example' },
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal('fetch', fetchMock);

    initializeAuthSessionForPageLoad();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      method: 'GET',
      credentials: 'include'
    });
    expect(getAuthSessionSnapshot()).toEqual({
      authenticated: false,
      userId: '',
      verified: true
    });
    expect(getCurrentUserId()).toMatch(/^guest_/);
  });

  it('preserves the same guest workspace when the server confirms an anonymous session', async () => {
    const localStorage = createStorage({
      app_user_id: 'guest_persistent',
      agent_user_id: 'guest_persistent',
      artigen_history_v2_guest_persistent: '{"version":2,"items":[]}'
    });
    vi.stubGlobal('window', {
      localStorage,
      location: { origin: 'https://app.example', protocol: 'https:', host: 'app.example' },
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, authenticated: false, userId: null, user: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const session = await bootstrapAuthSession({ force: true });

    expect(session).toEqual({ authenticated: false, userId: '', verified: true });
    expect(getCurrentUserId()).toBe('guest_persistent');
    expect(localStorage.values.get('artigen_history_v2_guest_persistent')).toBe(
      '{"version":2,"items":[]}'
    );
  });

  it('logs out through the server and clears local identity', async () => {
    const localStorage = createStorage({ app_user_id: 'user_cookie', agent_user_id: 'user_cookie' });
    vi.stubGlobal('window', {
      localStorage,
      location: { origin: 'https://app.example', protocol: 'https:', host: 'app.example' },
      dispatchEvent: vi.fn()
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    setLoggedIn({ userId: 'user_cookie' });
    setCsrfToken('csrf-logout');
    await logoutSession();

    expect(getAuthSessionSnapshot().authenticated).toBe(false);
    expect(getCurrentUserId()).toMatch(/^guest_/);
    const logoutCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/logout');
    expect(logoutCall?.[1]).toMatchObject({
      method: 'POST',
      keepalive: true,
      credentials: 'include'
    });
    expect(new Headers((logoutCall?.[1] as RequestInit)?.headers).get('X-CSRF-Token')).toBe(
      'csrf-logout'
    );
  });
});
