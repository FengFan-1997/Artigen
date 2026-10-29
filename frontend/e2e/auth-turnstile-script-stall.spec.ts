import { expect, test } from '@playwright/test';

test('stalled security script reports an error and can be retried', async ({ page }) => {
  test.skip(process.env.ARTIGEN_E2E_WITH_TURNSTILE !== '1', 'Requires a test Turnstile site key.');
  let requests = 0;
  let releaseFirst: (() => void) | undefined;
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 401, json: { ok: false } }));
  await page.route('**/api/auth/google/config', (route) => route.fulfill({ json: { clientId: '' } }));
  await page.route('**/api/collection/event', (route) => route.fulfill({ status: 202, json: { ok: true } }));
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', async (route) => {
    requests += 1;
    if (requests === 1) {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      await route.abort().catch(() => {});
      return;
    }
    await route.fulfill({ contentType: 'application/javascript', body: `window.turnstile = {
      render: (_element, options) => { window.__retryTurnstile = options; return 'retry-widget'; },
      reset: () => {}, remove: () => {}
    };` });
  });
  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
    await page.locator('input[type=email]').fill('friend@example.com');
    await expect.poll(() => requests).toBe(1);
    await expect(page.getByRole('alert')).toContainText('安全验证未完成', { timeout: 20_000 });
    await expect(page.locator('button.primary')).toBeDisabled();
    await page.getByRole('button', { name: '重新加载' }).click();
    await page.waitForFunction(() => Boolean((window as any).__retryTurnstile));
    await page.evaluate(() => (window as any).__retryTurnstile.callback('test-token'));
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('button.primary')).toBeEnabled();
  } finally {
    releaseFirst?.();
  }
});
