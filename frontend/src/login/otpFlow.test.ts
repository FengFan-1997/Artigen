import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OTP_FLOW_TTL_MS,
  beginOtpSend,
  clearOtpFlow,
  completeOtpSend,
  failOtpSend,
  getOtpCooldownSeconds,
  readOtpFlow
} from './otpFlow';

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('otpFlow', () => {
  it('reuses a pending or delivery-unknown idempotency key', () => {
    const storage = createStorage();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    );
    const first = beginOtpSend('login', 'Friend@Example.com', { storage, now: 100 });
    const pendingRetry = beginOtpSend('login', 'friend@example.com', { storage, now: 200 });
    expect(pendingRetry.idempotencyKey).toBe(first.idempotencyKey);

    completeOtpSend(
      'login',
      {
        email: first.email,
        idempotencyKey: first.idempotencyKey,
        deliveryStatus: 'unknown'
      },
      { storage, now: 300 }
    );
    const unknownRetry = beginOtpSend('login', first.email, { storage, now: 400 });
    expect(unknownRetry.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('restores cooldown state and creates a new key for an explicit resend after it ends', () => {
    const storage = createStorage();
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
    const first = beginOtpSend('login', 'friend@example.com', { storage, now: 1_000 });
    completeOtpSend(
      'login',
      {
        email: first.email,
        idempotencyKey: first.idempotencyKey,
        deliveryStatus: 'unknown',
        cooldownSec: 60
      },
      { storage, now: 1_000 }
    );

    const restored = readOtpFlow('login', { storage, now: 31_000 });
    expect(restored?.deliveryStatus).toBe('unknown');
    expect(getOtpCooldownSeconds(restored, 31_000)).toBe(30);

    const resend = beginOtpSend('login', first.email, {
      storage,
      now: 61_000,
      forceNew: true
    });
    expect(resend.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('creates a new key after an accepted or definite failed attempt', () => {
    const storage = createStorage();
    const randomUuid = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003');
    const first = beginOtpSend('login', 'friend@example.com', { storage, now: 100 });
    completeOtpSend(
      'login',
      {
        email: first.email,
        idempotencyKey: first.idempotencyKey,
        challengeId: 'challenge-1',
        deliveryStatus: 'accepted'
      },
      { storage, now: 200 }
    );
    const second = beginOtpSend('login', first.email, { storage, now: 300 });
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    failOtpSend('login', second.idempotencyKey, { storage, now: 400 });
    const third = beginOtpSend('login', first.email, { storage, now: 500 });
    expect(third.idempotencyKey).not.toBe(second.idempotencyKey);
    randomUuid.mockRestore();
  });

  it('expires verification state after ten minutes and clears it explicitly', () => {
    const storage = createStorage();
    const state = beginOtpSend('password-reset', 'friend@example.com', {
      storage,
      now: 1_000
    });
    expect(
      readOtpFlow('password-reset', {
        storage,
        now: 1_000 + OTP_FLOW_TTL_MS - 1
      })?.email
    ).toBe('friend@example.com');
    expect(
      readOtpFlow('password-reset', {
        storage,
        now: 1_000 + OTP_FLOW_TTL_MS
      })
    ).toBeNull();

    beginOtpSend('password-reset', state.email, { storage, now: 2_000 });
    clearOtpFlow('password-reset', storage);
    expect(readOtpFlow('password-reset', { storage, now: 2_001 })).toBeNull();
  });

  it('keeps the active flow in memory when sessionStorage is unavailable', () => {
    const unavailableStorage = {
      get length() {
        throw new Error('storage unavailable');
      },
      clear: () => {
        throw new Error('storage unavailable');
      },
      getItem: () => {
        throw new Error('storage unavailable');
      },
      key: () => {
        throw new Error('storage unavailable');
      },
      removeItem: () => {
        throw new Error('storage unavailable');
      },
      setItem: () => {
        throw new Error('storage unavailable');
      }
    } as unknown as Storage;

    const state = beginOtpSend('password-reset', 'friend@example.com', {
      storage: unavailableStorage,
      now: 1_000
    });

    expect(
      readOtpFlow('password-reset', {
        storage: unavailableStorage,
        now: 2_000
      })
    ).toMatchObject({
      email: 'friend@example.com',
      idempotencyKey: state.idempotencyKey,
      deliveryStatus: 'pending'
    });

    clearOtpFlow('password-reset', unavailableStorage);
    expect(
      readOtpFlow('password-reset', {
        storage: unavailableStorage,
        now: 2_001
      })
    ).toBeNull();
  });
});
