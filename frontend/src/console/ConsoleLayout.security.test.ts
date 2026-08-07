import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('console login surface', () => {
  it('only exposes the server-validated username and password login path', async () => {
    const source = await readFile(new URL('./ConsoleLayout.vue', import.meta.url), 'utf8');

    expect(source).toContain('consoleStore.adminLogin({ username: u, password: p })');
    expect(source).not.toContain('adminKeyInput');
    expect(source).not.toContain('setAdminApiKey');
    expect(source).not.toContain('ADMIN_KEY');
    expect(source).not.toContain('Zeabur');
  });
});
