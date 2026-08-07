import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('console credential storage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears legacy persistent credentials and keeps new credentials in memory only', async () => {
    const values = new Map<string, string>([
      ['console_auth_v1', JSON.stringify({ authHash: 'legacy-token' })],
      ['console_admin_key_v1', 'legacy-admin-key'],
      ['console_admin_auth_mode_v1', 'bearer']
    ]);
    const localStorageStub = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key))
    };
    vi.stubGlobal('localStorage', localStorageStub);

    const store = await import('./console');

    expect(values.has('console_auth_v1')).toBe(false);
    expect(values.has('console_admin_key_v1')).toBe(false);
    expect(values.has('console_admin_auth_mode_v1')).toBe(false);

    store.setConsoleAdminKey('memory-admin-token');
    store.setConsoleAdminAuthMode('bearer');
    store.setConsoleAuthSession({
      userId: 'admin',
      authHash: 'memory-session-token',
      expiresAt: Date.now() + 60_000
    });

    expect(store.getConsoleAdminKey()).toBe('memory-admin-token');
    expect(store.getConsoleAuthSession()?.authHash).toBe('memory-session-token');
    expect(localStorageStub.setItem).not.toHaveBeenCalled();
  });

  it('discards legacy browser-only balances, orders and generated content', async () => {
    const values = new Map<string, string>([
      [
        'console_store_v1',
        JSON.stringify({
          users: [{ userId: 'fake-admin', points: 100000 }],
          transactions: [{ id: 'fake-order', amount: 100000, type: 'recharge' }],
          logs: [{ id: 'fake-log' }],
          generatedContent: [{ id: 'picsum-placeholder' }],
          trafficStats: []
        })
      ]
    ]);
    const localStorageStub = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key))
    };
    vi.stubGlobal('localStorage', localStorageStub);
    const { createPinia, setActivePinia } = await import('pinia');
    setActivePinia(createPinia());
    const module = await import('./console');
    const store = module.useConsoleStore();
    store.init();

    expect(store.users).toEqual([]);
    expect(store.transactions).toEqual([]);
    expect(store.generatedContent).toEqual([]);
    const persisted = JSON.parse(values.get('console_store_v1') || '{}');
    expect(persisted.users).toBeUndefined();
    expect(persisted.transactions).toBeUndefined();
    expect(persisted.generatedContent).toBeUndefined();
  });
});
