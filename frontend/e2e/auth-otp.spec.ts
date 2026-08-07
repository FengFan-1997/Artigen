import { expect, test } from '@playwright/test';

test.describe('email OTP flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'AUTH_REQUIRED' })
      })
    );
    await page.route('**/api/collection/event', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      })
    );
    await page.route('**/api/auth/google/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clientId: '' })
      })
    );
  });

  test('keeps email out of the URL and restores an accepted verification session', async ({
    page
  }) => {
    let sendHeaders: Record<string, string> = {};
    let sendBody: Record<string, unknown> = {};
    await page.route('**/api/login/send-code', async (route) => {
      sendHeaders = await route.request().allHeaders();
      sendBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challengeId: 'challenge-e2e-1',
          cooldownSec: 60,
          deliveryStatus: 'accepted'
        })
      });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
    await page.locator('input[type="email"]').fill('friend@example.com');
    await page.locator('button.primary').click();

    await expect(page).toHaveURL(/\/login\/verify(?:\?.*)?$/);
    expect(new URL(page.url()).searchParams.has('email')).toBe(false);
    expect(sendHeaders['idempotency-key']).toMatch(/^otp:/);
    expect(sendBody).toMatchObject({
      email: 'friend@example.com',
      turnstileToken: ''
    });
    await expect(page.locator('.sub')).toContainText('friend@example.com');

    await page.reload();
    await expect(page.locator('.sub')).toContainText('friend@example.com');
    await expect(page.locator('button.primary')).toBeDisabled();
    await page.locator('input[autocomplete="one-time-code"]').fill('123456');
    await expect(page.locator('button.primary')).toBeEnabled();
  });

  test('keeps a delivery-unknown challenge usable after a response-loss style result', async ({
    page
  }) => {
    await page.route('**/api/login/send-code', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challengeId: 'challenge-e2e-unknown',
          cooldownSec: 60,
          deliveryStatus: 'unknown'
        })
      })
    );

    await page.goto('/login');
    await page.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
    await page.locator('input[type="email"]').fill('friend@example.com');
    await page.locator('button.primary').click();

    await expect(page).toHaveURL(/\/login\/verify(?:\?.*)?$/);
    await expect(page.locator('.hint')).toContainText(/可能|may have been submitted/i);
    await page.locator('input[autocomplete="one-time-code"]').fill('123456');
    await expect(page.locator('button.primary')).toBeEnabled();
  });

  test('resets registration state before returning to modal email login', async ({ page }) => {
    await page.route('**/api/login/send-code', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challengeId: 'challenge-modal-login',
          cooldownSec: 60,
          deliveryStatus: 'accepted'
        })
      })
    );

    await page.goto('/artigen/ai');
    await page
      .getByRole('button', { name: /登录.*注册|Login.*Register/i })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /账号密码登录|Password Login/i }).click();
    await dialog
      .getByRole('button', { name: /没有账号.*注册|No account.*Register/i })
      .click();
    await expect(dialog.locator('input[autocomplete="new-password"]')).toBeVisible();

    await dialog
      .getByRole('button', { name: /返回登录方式|Back to methods/i })
      .click();
    await dialog.getByRole('button', { name: /邮箱登录|Email Login/i }).click();

    await expect(dialog.locator('input[autocomplete="new-password"]')).toHaveCount(0);
    await dialog.locator('input[autocomplete="email"]').fill('friend@example.com');
    await dialog.locator('button.primary').click();
    await expect(dialog.locator('input[autocomplete="one-time-code"]')).toBeVisible();
  });

  test('restores password-reset cooldown and uses a new key for explicit resend', async ({
    page
  }) => {
    const idempotencyKeys: string[] = [];
    await page.route('**/api/auth/password-reset/send-code', async (route) => {
      const headers = await route.request().allHeaders();
      idempotencyKeys.push(headers['idempotency-key']);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challengeId: `challenge-reset-${idempotencyKeys.length}`,
          cooldownSec: 1,
          deliveryStatus: 'accepted'
        })
      });
    });

    await page.goto('/login/reset');
    await page.locator('input[autocomplete="email"]').fill('friend@example.com');
    await page.locator('button.primary').click();
    await expect(page.locator('input[autocomplete="new-password"]').first()).toBeVisible();

    await page.reload();
    await expect(page.locator('input[autocomplete="email"]')).toBeDisabled();
    await expect(page.locator('input[autocomplete="new-password"]').first()).toBeVisible();

    const resend = page.locator('.reset-resend-btn');
    await expect(resend).toBeEnabled({ timeout: 5_000 });
    await resend.click();
    await expect.poll(() => idempotencyKeys.length).toBe(2);
    expect(idempotencyKeys[0]).toMatch(/^otp:/);
    expect(idempotencyKeys[1]).toMatch(/^otp:/);
    expect(idempotencyKeys[1]).not.toBe(idempotencyKeys[0]);
  });
});
