import { describe, expect, it, vi } from 'vitest';
import {
  LOGIN_PASSWORDS_KEY,
  clearLegacySavedPasswords,
  getSavedPassword,
  setSavedPassword
} from './storage';

describe('login password storage', () => {
  it('removes the legacy plaintext password key', () => {
    const removeItem = vi.fn();
    clearLegacySavedPasswords({ removeItem });
    expect(removeItem).toHaveBeenCalledWith(LOGIN_PASSWORDS_KEY);
  });

  it('never returns or persists a password', () => {
    setSavedPassword('user', 'plaintext-secret');
    expect(getSavedPassword('user')).toBe('');
  });
});
