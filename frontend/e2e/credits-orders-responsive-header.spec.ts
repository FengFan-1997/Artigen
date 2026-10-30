import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const orders = [
  {
    afdianOrderId: 'order-20261028-0123456789',
    userId: 'user_visual',
    credits: 120,
    packageId: 'starter',
    createdAt: 1793184000000
  }
];

const readHeaderGeometry = async (page: Page) =>
  page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const container = rect('.orders-container');
    const actions = Array.from(document.querySelectorAll<HTMLElement>('.orders-actions > *')).map((el) => {
      const box = el.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    });
    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      header: rect('.orders-header'),
      title: rect('.orders-title'),
      titleTextAlign: getComputedStyle(document.querySelector<HTMLElement>('.orders-title')!).textAlign,
      actions: rect('.orders-actions'),
      container,
      actionItems: actions
    };
  });

test('credits orders header keeps mobile actions in a separate, aligned row', async ({ page }, testInfo) => {
  const phase = process.env.ARTIGEN_ORDER_HEADER_PHASE ?? 'after';
  if (phase !== 'before' && phase !== 'after') {
    throw new Error(`Unsupported capture phase: ${phase}`);
  }

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
    window.localStorage.setItem('app_lang', 'zh');
    window.localStorage.setItem('app_user_id', 'user_visual');
    window.localStorage.setItem('agent_user_id', 'user_visual');
  });

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        authenticated: true,
        userId: 'user_visual',
        user: { id: 'user_visual', userId: 'user_visual', name: 'Visual Tester' },
        csrfToken: 'csrf-user-visual'
      })
    });
  });
  await page.route('**/api/credits/orders**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, orders })
    });
  });
  await page.route('**/api/credits/balance**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, balance: 120 })
    });
  });
  await page.route('**/api/collection/event', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto('/artigen/orders');
  await expect(page.getByText('我的订单', { exact: true })).toBeVisible();
  await expect(page.getByText('order-20261028-0123456789', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const viewport = testInfo.project.use.viewport;
  const width = viewport?.width ?? 1440;
  const device = width <= 390 ? `mobile-${width}` : `desktop-${width}`;
  const artifactDir = join(
    process.cwd(),
    '..',
    'ui-review',
    'credits-orders-responsive-header-20261028',
    phase,
    device
  );
  await mkdir(artifactDir, { recursive: true });

  const geometry = await readHeaderGeometry(page);
  await page.screenshot({ path: join(artifactDir, 'default.png'), animations: 'disabled' });

  const marketLink = page.getByRole('link', { name: '去点数商城' });
  await marketLink.hover();
  await page.screenshot({ path: join(artifactDir, 'hover.png'), animations: 'disabled' });
  await marketLink.focus();
  await expect(marketLink).toBeFocused();
  await page.screenshot({ path: join(artifactDir, 'keyboard-focus.png'), animations: 'disabled' });

  if (phase === 'after' && width <= 390) {
    expect(geometry.documentWidth, 'mobile page must not overflow horizontally').toBeLessThanOrEqual(width);
    expect(geometry.title?.bottom).toBeLessThanOrEqual((geometry.actions?.y ?? 0) + 1);
    expect(geometry.titleTextAlign).toBe('left');
    for (const item of geometry.actionItems) {
      expect(item.x).toBeGreaterThanOrEqual((geometry.container?.x ?? 0) - 1);
      expect(item.right).toBeLessThanOrEqual((geometry.container?.right ?? width) + 1);
      expect(item.height).toBeGreaterThanOrEqual(44);
    }
  }

  if (phase === 'after' && width >= 1440) {
    expect(Math.abs((geometry.title?.y ?? 0) - (geometry.actions?.y ?? 0))).toBeLessThanOrEqual(2);
  }

  await writeFile(join(artifactDir, 'geometry.json'), JSON.stringify(geometry, null, 2));
});
