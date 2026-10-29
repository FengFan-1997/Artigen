import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  test.skip(process.env.ARTIGEN_E2E_WITH_TURNSTILE !== '1', 'Requires a test Turnstile site key.');
  await page.addInitScript(() => {
    (window as any).turnstile = {
      render: (_container: HTMLElement, options: Record<string, unknown>) => {
        (window as any).__turnstileOptions = options;
        ((window as any).__turnstileRenders ||= []).push(options);
        return 'test-widget';
      },
      reset: () => {},
      remove: () => {}
    };
  });
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 401, json: { ok: false } }));
  await page.route('**/api/auth/google/config', (route) => route.fulfill({ json: { clientId: '' } }));
  await page.route('**/api/collection/event', (route) => route.fulfill({ status: 202, json: { ok: true } }));
});

test('late callbacks from a removed widget cannot invalidate a retry', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
  await page.locator('input[type=email]').fill('friend@example.com');
  await page.waitForFunction(() => Boolean((window as any).__turnstileOptions));
  await page.evaluate(() => (window as any).__turnstileOptions['timeout-callback']());
  await page.getByRole('button', { name: '重新加载' }).click();
  await page.waitForFunction(() => (window as any).__turnstileRenders.length === 2);
  await page.evaluate(() => {
    const [oldWidget, currentWidget] = (window as any).__turnstileRenders;
    currentWidget.callback('test-token');
    oldWidget['error-callback']();
    oldWidget['expired-callback']();
    oldWidget['timeout-callback']();
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('button.primary')).toBeEnabled();
});

test('timeout exposes retry and explicitly selected email fallback', async ({ page }) => {
  let calls = 0;
  let body: Record<string, unknown> = {};
  await page.route('**/api/login/send-code', async (route) => {
    calls += 1;
    body = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, challengeId: 'test-challenge', cooldownSec: 60, deliveryStatus: 'accepted' } });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
  await page.locator('input[type=email]').fill('friend@example.com');
  const send = page.locator('button.primary');
  await expect(send).toBeDisabled();
  await expect(page.locator('.turnstile-hint')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as any).__turnstileOptions));
  await page.evaluate(() => (window as any).__turnstileOptions['timeout-callback']());
  await expect(page.getByRole('alert')).toContainText('安全验证未完成');
  await expect(send).toBeDisabled();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => (window as any).__turnstileOptions['timeout-callback']());
  await page.getByRole('button', { name: '验证不可用？直接发送验证码' }).click();
  await expect(send).toBeEnabled();
  await send.click();
  expect(body).toMatchObject({ turnstileToken: '', turnstileFallback: true });
});

test('reset verification timeout cannot bypass the challenge', async ({ page }) => {
  await page.goto('/login/reset');
  await page.locator('input[type=email]').fill('friend@example.com');
  await page.waitForFunction(() => Boolean((window as any).__turnstileOptions));
  await page.evaluate(() => (window as any).__turnstileOptions['timeout-callback']());
  await expect(page.getByRole('alert')).toContainText('安全验证未完成');
  await expect(page.locator('button.primary')).toBeDisabled();
  await expect(page.getByRole('button', { name: '验证不可用？直接发送验证码' })).toHaveCount(0);
  await page.getByRole('button', { name: '重新加载' }).click();
  await page.evaluate(() => (window as any).__turnstileOptions.callback('test-token'));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('button.primary')).toBeEnabled();
});

test('expired and error callbacks invalidate a previously verified token', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
  await page.locator('input[type=email]').fill('friend@example.com');
  await page.waitForFunction(() => Boolean((window as any).__turnstileOptions));
  for (const event of ['expired-callback', 'error-callback']) {
    await page.evaluate(() => (window as any).__turnstileOptions.callback('test-token'));
    await expect(page.locator('button.primary')).toBeEnabled();
    await page.evaluate((name) => (window as any).__turnstileOptions[name](), event);
    await expect(page.locator('button.primary')).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('安全验证未完成');
    await page.getByRole('button', { name: '重新加载' }).click();
  }
});

test('in-app login exposes the fallback after timeout', async ({ page }) => {
  await page.goto('/artigen/ai');
  await page.getByRole('button', { name: /登录.*注册|Login.*Register/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
  await dialog.locator('input[type=email]').fill('friend@example.com');
  await page.waitForFunction(() => Boolean((window as any).__turnstileOptions));
  await page.evaluate(() => (window as any).__turnstileOptions['timeout-callback']());
  await expect(dialog.getByRole('alert')).toContainText('安全验证未完成');
  await expect(dialog.locator('button.primary')).toBeDisabled();
  await dialog.getByRole('button', { name: '验证不可用？直接发送验证码' }).click();
  await expect(dialog.locator('button.primary')).toBeEnabled();
});
