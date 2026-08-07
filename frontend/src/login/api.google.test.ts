import { beforeEach, describe, expect, it, vi } from 'vitest';

const authFetchMock = vi.hoisted(() => vi.fn());

vi.mock('./authFetch', () => ({
  authFetch: authFetchMock,
  setCsrfToken: vi.fn()
}));

vi.mock('./session', () => ({
  getOrCreateProjectId: () => 'project-1',
  getOrCreateSessionId: () => 'session-1'
}));

vi.mock('../utils/api', () => ({
  buildApiUrl: (path: string) => path
}));

vi.mock('@/utils/pageContext', () => ({
  getPageContext: () => ({ route: '/login' })
}));

import { loginWithGoogleIdToken, resolveGoogleClientId } from './api';

describe('Google login API client', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => (key === 'app_user_id' ? 'guest_preview' : 'zh')
      }
    });
  });

  it('uses the backend client ID as the Google Identity Services source of truth', async () => {
    authFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, clientId: 'server-client.apps.googleusercontent.com' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    );

    await expect(resolveGoogleClientId()).resolves.toBe('server-client.apps.googleusercontent.com');
    expect(authFetchMock).toHaveBeenCalledWith('/api/auth/google/config', { method: 'GET' });
  });

  it('posts the Google credential with guest migration context', async () => {
    authFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          userId: 'google-user-1',
          email: 'friend@example.com'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(loginWithGoogleIdToken('google-id-token')).resolves.toMatchObject({
      ok: true,
      userId: 'google-user-1',
      email: 'friend@example.com'
    });
    const [, init] = authFetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      idToken: 'google-id-token',
      fromUserId: 'guest_preview',
      requestSource: 'login_google'
    });
  });
});
