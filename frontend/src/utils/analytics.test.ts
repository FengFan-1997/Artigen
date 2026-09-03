import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCsrfToken } from '../login/authFetch';
import {
  isSensitiveAnalyticsQueryKey,
  sanitizeAnalyticsPayload,
  sanitizeAnalyticsUrl,
  shouldRecordClickSignature,
  trackBackendEvent
} from './analytics';

afterEach(() => {
  clearCsrfToken();
  vi.unstubAllGlobals();
});

describe('analytics privacy guards', () => {
  it('recognizes encoded and differently formatted credential query keys', () => {
    expect(isSensitiveAnalyticsQueryKey('access_token')).toBe(true);
    expect(isSensitiveAnalyticsQueryKey('%74oken')).toBe(true);
    expect(isSensitiveAnalyticsQueryKey('image-url')).toBe(true);
    expect(isSensitiveAnalyticsQueryKey('img_url')).toBe(true);
    expect(isSensitiveAnalyticsQueryKey('signature')).toBe(true);
    expect(isSensitiveAnalyticsQueryKey('signature_v2')).toBe(true);
    expect(isSensitiveAnalyticsQueryKey('authorization')).toBe(true);
    expect(isSensitiveAnalyticsQueryKey('tool')).toBe(false);
  });

  it('keeps only a relative path and non-sensitive scalar query values', () => {
    const value = sanitizeAnalyticsUrl(
      'https://private.example/editor?tool=crop&img=https%3A%2F%2Fcdn.example%2Fa.png&token=secret&signature=signed#private'
    );

    expect(value).toBe('/editor?tool=crop');
    expect(value).not.toContain('private.example');
    expect(value).not.toContain('#');
    expect(value).not.toContain('secret');
    expect(value).not.toContain('cdn.example');
  });

  it('drops nested credentials, raw text, filenames, and image sources', () => {
    const value = sanitizeAnalyticsPayload({
      pagePath: 'https://app.example/workshop?tool=restore&sig=abc',
      location: 'https://app.example/workshop?image=data&lang=zh#draft',
      token: 'bearer-secret',
      prompt: 'private user prompt',
      fileName: 'private-name.png',
      error: 'Failed to read private-name.png from /Users/private/',
      message: 'private free-form message',
      nested: {
        authorization: 'Bearer secret',
        imageUrl: 'https://cdn.example/private.png',
        status: 'ok'
      },
      pageContext: [{ tag: 'button', text: 'private label', selector: 'text:private label' }]
    });

    expect(value).toEqual({
      pagePath: '/workshop?tool=restore',
      location: '/workshop?lang=zh',
      nested: { status: 'ok' },
      pageContext: [{ tag: 'button' }]
    });
  });

  it('removes nested URL-valued query parameters', () => {
    expect(
      sanitizeAnalyticsUrl('/login?mode=account&redirect=https%3A%2F%2Fapp.example%2Fcb%3Ftoken%3Dx')
    ).toBe('/login?mode=account');
  });

  it('sanitizes referrers without retaining their origin or sensitive query values', () => {
    expect(
      sanitizeAnalyticsPayload({
        referrer:
          'https://search.example/results?utm_source=test&image=https%3A%2F%2Fcdn.example%2Fprivate.png&signature=secret#fragment'
      })
    ).toEqual({ referrer: '/results?utm_source=test' });
  });

  it('records anonymous product behavior by default without reading visible button text', async () => {
    const source = await readFile(new URL('./analytics.ts', import.meta.url), 'utf8');

    expect(source).toContain("VITE_ANALYTICS_ENABLED || '1'");
    expect(source).not.toContain('VITE_LAZY_BACKEND');
    expect(source).not.toContain('el as any).innerText');
    expect(source).not.toContain('el as any).textContent');
    expect(source).not.toContain("el.getAttribute('aria-label')");
    expect(source).toContain("el.getAttribute('data-analytics-action')");
    expect(source).not.toContain('navigator as any)?.sendBeacon');
    expect(source).toContain('const resp = await authFetch(url');
  });

  it('refreshes CSRF before an analytics write when only the HttpOnly session remains', async () => {
    const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    vi.stubGlobal('window', {
      location: {
        origin: 'https://app.example',
        hostname: 'app.example',
        host: 'app.example',
        pathname: '/artigen/agent',
        search: ''
      },
      localStorage: storage,
      sessionStorage: storage
    });
    vi.stubGlobal('document', { querySelectorAll: () => [], referrer: '' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: 'csrf-restored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await trackBackendEvent('page_view', { pagePath: '/artigen/agent' });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/session');
    const write = fetchMock.mock.calls[1];
    expect(write?.[0]).toBe('/api/collection/event');
    expect(new Headers((write?.[1] as RequestInit)?.headers).get('X-CSRF-Token')).toBe('csrf-restored');
  });

  it('deduplicates only a short burst and records the same control again later', () => {
    expect(
      shouldRecordClickSignature({
        signature: 'button|generate||workspace',
        now: 1_200,
        previousSignature: 'button|generate||workspace',
        previousTimestamp: 1_000
      })
    ).toBe(false);

    expect(
      shouldRecordClickSignature({
        signature: 'button|generate||workspace',
        now: 1_500,
        previousSignature: 'button|generate||workspace',
        previousTimestamp: 1_000
      })
    ).toBe(true);

    expect(
      shouldRecordClickSignature({
        signature: 'button|download||workspace',
        now: 1_100,
        previousSignature: 'button|generate||workspace',
        previousTimestamp: 1_000
      })
    ).toBe(true);
  });
});
