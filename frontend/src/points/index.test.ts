import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock('@/login/authFetch', () => ({ authFetch }));
vi.mock('@/login/session', () => ({
  getCurrentUserId: () => 'user_cookie',
  isLocalLoggedIn: () => true
}));
vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }));

import { createPayOrder, getPayOrder, getPayPackages, verifyPayOrder } from './index';

describe('secure payment order client', () => {
  beforeEach(() => authFetch.mockReset());

  it('sends only the selected package reference and trusts server-owned order values', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      orderId: 'order-uuid',
      packageId: 'package-uuid',
      packageSku: 'credits.starter.v1',
      amountMinor: 990,
      amountCny: 9.9,
      credits: 400,
      payUrl: 'https://afdian.example/order'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const packageUuid = '6cc16978-55a7-452a-ab16-c610ff986328';
    const result = await createPayOrder('starter', packageUuid);
    const init = authFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ packageId: packageUuid });
    expect(result).toMatchObject({
      ok: true,
      packageId: 'starter',
      packageUuid: 'package-uuid',
      packageSku: 'credits.starter.v1',
      credits: 400
    });
  });

  it('reads the unified nested API error code', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: 'PAID_FEATURES_DISABLED', retryable: true }
    }), { status: 503, headers: { 'Content-Type': 'application/json' } }));

    await expect(
      createPayOrder('starter', '6cc16978-55a7-452a-ab16-c610ff986328')
    ).resolves.toEqual({
      ok: false,
      error: 'PAID_FEATURES_DISABLED'
    });
  });

  it('uses only valid CNY packages from the server-owned catalogue', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      packages: [
        {
          packageId: '6cc16978-55a7-452a-ab16-c610ff986328',
          sku: 'credits.pro.v2',
          title: 'Pro',
          amountMinor: 5290,
          currency: 'CNY',
          credits: 3200
        },
        {
          packageId: 'bad-package',
          sku: 'credits.unknown.v1',
          amountMinor: 1,
          currency: 'CNY',
          credits: 1
        },
        {
          packageId: 'foreign-package',
          sku: 'credits.starter.v1',
          amountMinor: 990,
          currency: 'USD',
          credits: 400
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(getPayPackages()).resolves.toEqual([{
      packageId: 'pro',
      packageUuid: '6cc16978-55a7-452a-ab16-c610ff986328',
      packageSku: 'credits.pro.v2',
      title: 'Pro',
      amountMinor: 5290,
      amountCny: 52.9,
      currency: 'CNY',
      credits: 3200
    }]);
  });

  it('fails the catalogue closed on malformed responses', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({ packages: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    await expect(getPayPackages()).resolves.toBeNull();
  });

  it('polls the authenticated local order status instead of inferring payment from balance changes', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      order: {
        orderId: 'order-uuid',
        packageId: 'package-uuid',
        packageSku: 'credits.standard.v1',
        amountMinor: 1990,
        currency: 'CNY',
        credits: 1000,
        status: 'paid'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(getPayOrder('order-uuid')).resolves.toMatchObject({
      orderId: 'order-uuid',
      status: 'paid',
      credits: 1000
    });
    expect(String(authFetch.mock.calls[0][0])).toContain('/api/pay/orders/order-uuid');
  });

  it('verifies a provider order through the authenticated local order only', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      orderId: 'local-order-uuid',
      credited: true,
      replayed: false,
      credits: 400
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(
      verifyPayOrder('local-order-uuid', '202607171234567890123456789')
    ).resolves.toEqual({
      ok: true,
      orderId: 'local-order-uuid',
      credited: true,
      replayed: false,
      credits: 400
    });
    expect(String(authFetch.mock.calls[0][0])).toContain(
      '/api/pay/orders/local-order-uuid/verify'
    );
    expect(JSON.parse(String(authFetch.mock.calls[0][1]?.body))).toEqual({
      providerOrderId: '202607171234567890123456789'
    });
  });
});
