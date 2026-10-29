import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const holds = [
  {
    id: 'hold-visual-20261028-001234567890',
    userId: 'user_visual',
    cost: 25,
    reason: 'img2img',
    requestId: 'request-visual-1234567890',
    status: 'confirmed',
    createdAt: 1793184000000,
    updatedAt: 1793184000000
  },
  {
    id: 'hold-visual-20261028-009876543210',
    userId: 'user_visual',
    cost: 10,
    reason: 'agentimg_final',
    requestId: 'request-visual-0987654321',
    status: 'refunded',
    createdAt: 1793187600000,
    updatedAt: 1793187600000
  }
];

const readPageState = (page: Page) => page.evaluate(() => {
  const surface = document.querySelector<HTMLElement>('.usage-page');
  if (!surface) throw new Error('Credits usage surface is missing');
  const style = getComputedStyle(surface);
  return {
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
  };
});

test('credits usage page uses the quiet product surface without changing its record controls', async ({ page }, testInfo) => {
  await page.context().addCookies([
    {
      name: 'auth_token',
      value: 'e2e-http-only-session',
      url: 'http://127.0.0.1:51731',
      httpOnly: true,
      sameSite: 'Lax'
    }
  ]);
  await page.addInitScript(() => {
    localStorage.setItem('app_lang', 'zh');
    localStorage.setItem('app_user_id', 'user_visual');
    localStorage.setItem('agent_user_id', 'user_visual');
  });

  await page.route('**/api/auth/session', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      authenticated: true,
      userId: 'user_visual',
      user: { id: 'user_visual', userId: 'user_visual', name: 'Visual Tester' },
      csrfToken: 'csrf-user-visual'
    })
  }));
  await page.route('**/api/credits/holds**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, holds })
  }));
  await page.route('**/api/credits/balance**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, balance: 120 })
  }));
  await page.route('**/api/collection/event', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));

  await page.goto('/artigen/usage');
  await expect(page.getByText('hold-visual-20261028-001234567890', { exact: true })).toBeVisible();
  await expect(page.getByText('hold-visual-20261028-009876543210', { exact: true })).toBeVisible();
  await expect(page.getByText('用户ID：')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const state = await readPageState(page);
  expect(state.backgroundImage).toBe('none');
  expect(state.backgroundColor).toBe('rgb(17, 19, 17)');
  if ((testInfo.project.use.viewport?.width ?? 1440) <= 390) {
    expect(state.documentWidth).toBeLessThanOrEqual(state.viewportWidth);
  }

  const width = testInfo.project.use.viewport?.width ?? 1440;
  const device = width <= 390 ? `mobile-${width}` : `desktop-${width}`;
  const artifactDir = join(process.cwd(), '..', 'ui-review', 'credits-usage-surface-20261028', 'after', device);
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'default.png'), animations: 'disabled' });

  const marketLink = page.getByRole('link', { name: '去点数商城' });
  await marketLink.hover();
  await page.screenshot({ path: join(artifactDir, 'hover.png'), animations: 'disabled' });
  await marketLink.focus();
  await expect(marketLink).toBeFocused();
  await page.screenshot({ path: join(artifactDir, 'keyboard-focus.png'), animations: 'disabled' });

  await page.getByRole('button', { name: /退款/ }).click();
  await expect(page.locator('.usage-card')).toHaveCount(1);
  await expect(page.locator('.usage-card')).toContainText('已退款');

  await writeFile(join(artifactDir, 'state.json'), JSON.stringify(state, null, 2));
});
