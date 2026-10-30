import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const phase = process.env.UI_CAPTURE_PHASE === 'before' ? 'before' : 'after';

test('pipeline settings use a neutral full surface across hover and keyboard focus', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('app_lang', 'zh'));
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 401, json: { ok: false, authenticated: false } })
  );
  await page.route('**/api/collection/event', (route) => route.fulfill({ status: 204 }));
  await page.goto('/artigen/tools/image-batch?operation=pipeline');

  const dialog = page.locator('.tool-modal-panel');
  await expect(dialog).toBeVisible();
  const resizeToggle = dialog.locator('.pipeline-step-toggle input[type="checkbox"]').first();
  await resizeToggle.check();

  const settings = dialog.locator('.pipeline-settings').first();
  await expect(settings).toBeVisible();
  await settings.scrollIntoViewIfNeeded();

  const computed = await settings.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderLeftColor: style.borderLeftColor,
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius
    };
  });

  if (phase === 'before') {
    expect(computed.borderLeftWidth).toBe('2px');
    expect(computed.borderLeftColor).toBe('rgb(200, 255, 61)');
  } else {
    expect(computed).toMatchObject({
      borderTopWidth: '0px',
      borderRightWidth: '0px',
      borderBottomWidth: '0px',
      borderLeftWidth: '0px',
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
      borderRadius: '10px'
    });
  }

  const viewport = page.viewportSize();
  const viewportName = viewport && viewport.width <= 500 ? 'mobile-390' : 'desktop-1440';
  const captureDirectory = resolve(
    process.cwd(),
    '../ui-review/format-factory-pipeline-surface-20261029',
    phase,
    viewportName
  );
  await mkdir(captureDirectory, { recursive: true });

  const capture = (state: string) =>
    page.screenshot({ path: resolve(captureDirectory, `${state}.png`), fullPage: false });

  await capture('default');
  await settings.hover();
  await capture('hover');

  const widthInput = settings.locator('input[type="number"]').first();
  await widthInput.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(widthInput).toBeFocused();
  expect(await widthInput.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  await capture('keyboard-focus');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await testInfo.attach(`pipeline-settings-${phase}-${viewportName}`, {
    path: resolve(captureDirectory, 'default.png'),
    contentType: 'image/png'
  });
});
