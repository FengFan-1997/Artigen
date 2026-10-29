import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMAIL_OTP_TURNSTILE_ACTION,
  loadTurnstile,
  PASSWORD_RESET_TURNSTILE_ACTION,
  resetTurnstileLoader
} from './turnstile';

type ScriptStub = {
  dataset: Record<string, string>;
  onload: null | (() => void);
  onerror: null | (() => void);
  addEventListener: (type: string, listener: () => void) => void;
  remove: () => void;
  src: string;
  async: boolean;
  defer: boolean;
};

let activeScript: ScriptStub | null;

const createScript = (): ScriptStub => {
  const listeners = new Map<string, () => void>();
  const script: ScriptStub = {
    dataset: {},
    onload: null,
    onerror: null,
    addEventListener: (type, listener) => listeners.set(type, listener),
    remove: () => {
      if (activeScript === script) activeScript = null;
    },
    src: '',
    async: false,
    defer: false
  };
  return script;
};

beforeEach(() => {
  activeScript = null;
  vi.stubGlobal('window', { turnstile: null });
  vi.stubGlobal('document', {
    querySelector: () => activeScript,
    createElement: () => createScript(),
    head: {
      appendChild: (script: ScriptStub) => {
        activeScript = script;
      }
    }
  });
  resetTurnstileLoader();
});

afterEach(() => {
  resetTurnstileLoader();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Turnstile loader', () => {
  it('uses the same server-approved action names across login surfaces', () => {
    expect(EMAIL_OTP_TURNSTILE_ACTION).toBe('email_otp');
    expect(PASSWORD_RESET_TURNSTILE_ACTION).toBe('password_reset_otp');
  });

  it('removes a failed script and creates a fresh script on retry', async () => {
    const firstLoad = loadTurnstile();
    const firstScript = activeScript;
    expect(firstScript?.dataset.artigenTurnstileState).toBe('loading');

    const firstResult = expect(firstLoad).rejects.toThrow('TURNSTILE_LOAD_FAILED');
    firstScript?.onerror?.();
    await firstResult;
    expect(activeScript).toBeNull();

    const secondLoad = loadTurnstile();
    const secondScript = activeScript;
    expect(secondScript).not.toBe(firstScript);
    secondScript?.onload?.();

    await expect(secondLoad).resolves.toBeUndefined();
    expect(secondScript?.dataset.artigenTurnstileState).toBe('loaded');
  });

  it('does not let a stale failed load remove the active retry script', async () => {
    const staleLoad = loadTurnstile();
    const staleScript = activeScript;
    const staleResult = expect(staleLoad).rejects.toThrow('TURNSTILE_LOAD_FAILED');

    resetTurnstileLoader();
    const retryLoad = loadTurnstile();
    const retryScript = activeScript;
    expect(retryScript).not.toBe(staleScript);
    expect(retryScript?.src).not.toBe(staleScript?.src);

    staleScript?.onerror?.();
    await staleResult;
    expect(activeScript).toBe(retryScript);

    retryScript?.onload?.();
    await expect(retryLoad).resolves.toBeUndefined();
  });

  it('times out a stalled script, shares the failure, and permits a clean retry', async () => {
    vi.useFakeTimers();
    const first = loadTurnstile();
    const shared = loadTurnstile();
    expect(shared).toBe(first);
    const staleScript = activeScript;
    const rejected = expect(first).rejects.toThrow('TURNSTILE_LOAD_FAILED');
    await vi.advanceTimersByTimeAsync(12_000);
    await rejected;
    expect(activeScript).toBeNull();

    const retry = loadTurnstile();
    const retryScript = activeScript;
    expect(retryScript).not.toBe(staleScript);
    staleScript?.onload?.();
    staleScript?.onerror?.();
    expect(activeScript).toBe(retryScript);
    retryScript?.onload?.();
    await expect(retry).resolves.toBeUndefined();
  });

  it('does not let a stale timeout remove a newer script', async () => {
    vi.useFakeTimers();
    const stale = loadTurnstile();
    const rejected = expect(stale).rejects.toThrow('TURNSTILE_LOAD_FAILED');
    await vi.advanceTimersByTimeAsync(5_000);
    resetTurnstileLoader();
    const retry = loadTurnstile();
    const retryScript = activeScript;
    await vi.advanceTimersByTimeAsync(7_000);
    await rejected;
    expect(activeScript).toBe(retryScript);
    retryScript?.onload?.();
    await expect(retry).resolves.toBeUndefined();
  });
});
