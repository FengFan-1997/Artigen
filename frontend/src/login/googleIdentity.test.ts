import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGoogleIdentityScript, resetGoogleIdentityScript } from './googleIdentity';

type ScriptStub = {
  dataset: Record<string, string>;
  onload: null | (() => void);
  onerror: null | (() => void);
  remove: () => void;
  src: string;
  async: boolean;
  defer: boolean;
};

let activeScript: ScriptStub | null;

const createScript = (): ScriptStub => {
  const script: ScriptStub = {
    dataset: {},
    onload: null,
    onerror: null,
    remove: () => {
      if (activeScript === script) activeScript = null;
    },
    src: '',
    async: false,
    defer: false
  };
  return script;
};

describe('Google Identity script loader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    activeScript = null;
    vi.stubGlobal('window', {
      google: null,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });
    vi.stubGlobal('document', {
      querySelector: () => activeScript,
      querySelectorAll: () => (activeScript ? [activeScript] : []),
      createElement: () => createScript(),
      head: {
        appendChild: (script: ScriptStub) => {
          activeScript = script;
        }
      }
    });
    resetGoogleIdentityScript();
  });

  afterEach(() => {
    resetGoogleIdentityScript();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves immediately when Google Identity is already available', async () => {
    (window as any).google = { accounts: { id: {} } };

    await expect(loadGoogleIdentityScript()).resolves.toBeUndefined();
    expect(activeScript).toBeNull();
  });

  it('loads the Google script directly without blocking the page shell', async () => {
    const pending = loadGoogleIdentityScript();
    const script = activeScript;

    expect(script?.src).toBe('https://accounts.google.com/gsi/client');
    expect(script?.async).toBe(true);
    script?.onload?.();

    await expect(pending).resolves.toBeUndefined();
  });

  it('times out, removes the failed script, and permits a retry', async () => {
    const first = loadGoogleIdentityScript(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(first).rejects.toThrow('GOOGLE_SCRIPT_TIMEOUT');
    expect(activeScript).toBeNull();

    const second = loadGoogleIdentityScript(1000);
    const retryScript = activeScript;
    retryScript?.onload?.();

    await expect(second).resolves.toBeUndefined();
  });
});
