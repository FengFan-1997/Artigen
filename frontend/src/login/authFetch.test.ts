import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authFetch,
  clearCsrfToken,
  getCsrfToken,
  isSameOriginRequest,
  resourceFetch,
  setCsrfToken
} from './authFetch';

afterEach(() => {
  clearCsrfToken();
  vi.unstubAllGlobals();
});

describe('authenticated fetch policy', () => {
  it('always includes the HttpOnly session cookie for API requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await authFetch('/api/auth/session', { method: 'GET', credentials: 'omit' }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/session', {
      method: 'GET',
      credentials: 'include'
    });
  });

  it('includes credentials for same-origin resources and omits them for external resources', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example' } });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await resourceFetch('/files/user/image.png', {}, fetchImpl);
    await resourceFetch('https://cdn.example/image.png', {}, fetchImpl);

    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ credentials: 'omit' });
    expect(isSameOriginRequest('https://app.example/api/assets/1', 'https://app.example')).toBe(true);
    expect(isSameOriginRequest('https://evil.example/files/1', 'https://app.example')).toBe(false);
  });

  it('adds the in-memory CSRF token to cookie-authenticated writes', async () => {
    setCsrfToken('csrf-cached');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await authFetch('/api/tool-tasks', { method: 'POST' }, fetchImpl);

    const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.credentials).toBe('include');
    expect(new Headers(requestInit.headers).get('X-CSRF-Token')).toBe('csrf-cached');
  });

  it('bootstraps a missing CSRF token before a protected write', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example' } });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true, csrfToken: 'csrf-fresh' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await authFetch('/api/tool-tasks', { method: 'POST' }, fetchImpl);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/auth/session');
    const writeInit = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(writeInit.headers).get('X-CSRF-Token')).toBe('csrf-fresh');
    expect(getCsrfToken()).toBe('csrf-fresh');
  });

  it('does not require a pre-existing CSRF token to establish a new session', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, userId: 'user_1', csrfToken: 'csrf-new' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await authFetch('/api/auth/login', { method: 'POST' }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/auth/login');
  });
});
