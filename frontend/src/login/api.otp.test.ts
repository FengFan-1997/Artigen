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

import { sendLoginCode, sendPasswordResetCode } from './api';

describe('email OTP API client', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    vi.stubGlobal('window', {
      localStorage: { getItem: () => 'zh' }
    });
  });

  it('sends the durable idempotency key and Turnstile token', async () => {
    authFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          challengeId: 'challenge-1',
          cooldownSec: 60,
          deliveryStatus: 'accepted'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const result = await sendLoginCode('friend@example.com', {
      idempotencyKey: 'otp:durable-1',
      turnstileToken: 'turnstile-token'
    });
    const [, init] = authFetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('otp:durable-1');
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: 'friend@example.com',
      turnstileToken: 'turnstile-token'
    });
    expect(result).toMatchObject({
      ok: true,
      challengeId: 'challenge-1',
      deliveryStatus: 'accepted'
    });
  });

  it('treats HTTP 202 as delivery unknown while keeping the verification flow usable', async () => {
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, challengeId: 'challenge-2', cooldownSec: 60 }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(
      sendPasswordResetCode('friend@example.com', {
        idempotencyKey: 'otp:durable-2',
        turnstileToken: 'turnstile-token'
      })
    ).resolves.toMatchObject({
      ok: true,
      challengeId: 'challenge-2',
      deliveryStatus: 'unknown'
    });
  });

  it('maps quota failures without exposing provider details', async () => {
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'OTP_DAILY_BUDGET_EXHAUSTED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(
      sendLoginCode('friend@example.com', {
        idempotencyKey: 'otp:durable-3',
        turnstileToken: 'turnstile-token'
      })
    ).resolves.toEqual({
      ok: false,
      errorCode: 'OTP_DAILY_BUDGET_EXHAUSTED',
      message: '今日验证码额度已用完，请明天再试',
      cooldownSec: undefined
    });
  });

  it('maps an upstream outage even when the proxy returns a non-JSON body', async () => {
    authFetchMock.mockResolvedValue(
      new Response('<html>Service Suspended</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' }
      })
    );

    await expect(
      sendLoginCode('friend@example.com', {
        idempotencyKey: 'otp:durable-outage',
        turnstileToken: 'turnstile-token'
      })
    ).resolves.toMatchObject({
      ok: false,
      message: '服务暂时不可用，请稍后重试'
    });
  });

  it('prioritizes the stable error code over provider text and keeps retry cooldowns', async () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => 'en' }
    });
    authFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: 'OTP_EXPIRED',
          message: 'SMTP provider internal diagnostic should not be shown',
          retryAfterSec: 17
        }),
        { status: 410, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(
      sendLoginCode('friend@example.com', {
        idempotencyKey: 'otp:durable-4',
        turnstileToken: 'turnstile-token'
      })
    ).resolves.toEqual({
      ok: false,
      errorCode: 'OTP_EXPIRED',
      message: 'Code expired, please resend.',
      cooldownSec: 17
    });
  });

  it('humanizes reset enumeration-safe and idempotency contract errors', async () => {
    authFetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'OTP_INVALID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      );

    await expect(
      sendPasswordResetCode('friend@example.com', {
        idempotencyKey: 'otp:durable-5',
        turnstileToken: 'turnstile-token'
      })
    ).resolves.toMatchObject({
      ok: false,
      message: '验证码错误'
    });
    await expect(
      sendLoginCode('friend@example.com', {
        idempotencyKey: 'otp:durable-6',
        turnstileToken: 'turnstile-token'
      })
    ).resolves.toMatchObject({
      ok: false,
      message: '请求状态已变化，请重新发送'
    });
  });
});
