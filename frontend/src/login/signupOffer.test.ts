import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/services/serverState';
import { getSignupOfferCredits } from './signupOffer';

vi.mock('@/utils/api', () => ({ buildApiUrl: (path: string) => path }));

const publicOffer = (credits: unknown = 275) => ({
  ok: true,
  capabilities: { publicSignup: true },
  signupOffer: { available: true, credits }
});

describe('signup offer configuration', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    queryClient.clear();
    queryClient.setQueryDefaults(['public', 'signup-offer'], { retry: false });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it('reads the public amount without sending account credentials and reuses its cache', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(publicOffer())));
    await expect(getSignupOfferCredits()).resolves.toBe(275);
    await expect(getSignupOfferCredits()).resolves.toBe(275);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/meta', {
      credentials: 'omit',
      signal: expect.any(AbortSignal)
    });
  });

  it.each([
    null,
    {},
    { ...publicOffer(), ok: false },
    { ...publicOffer(), capabilities: { publicSignup: false } },
    { ...publicOffer(), capabilities: {} },
    { ...publicOffer(), signupOffer: { available: false, credits: 275 } },
    publicOffer(0),
    publicOffer(-5),
    publicOffer('275'),
    publicOffer(0.5),
    publicOffer(Number.MAX_SAFE_INTEGER + 1)
  ])('does not promise signup credits for unavailable or malformed metadata: %j', async (metadata) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(metadata)));
    await expect(getSignupOfferCredits()).resolves.toBeNull();
  });

  it('hides the offer after a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getSignupOfferCredits()).resolves.toBeNull();
  });

  it('hides the offer for an unsuccessful metadata response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(publicOffer()), { status: 503 }));
    await expect(getSignupOfferCredits()).resolves.toBeNull();
  });

  it('hides the offer for a non-JSON metadata response', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Unavailable</html>'));
    await expect(getSignupOfferCredits()).resolves.toBeNull();
  });
});
