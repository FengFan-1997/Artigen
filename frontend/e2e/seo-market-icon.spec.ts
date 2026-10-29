import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('tools SEO market feature uses the shared SVG icon language', async ({ page }, testInfo) => {
  const phase = process.env.ARTIGEN_SEO_MARKET_ICON_PHASE ?? 'after';
  expect(['before', 'after']).toContain(phase);

  const viewport = testInfo.project.use.viewport;
  const isMobile = viewport?.width === 390;
  const device = isMobile ? 'mobile-390' : 'desktop-1440';
  const outputDir = join(process.cwd(), '..', 'ui-review', 'seo-market-icon-20261029', phase, device);
  await mkdir(outputDir, { recursive: true });

  await page.addInitScript(() => localStorage.setItem('app_lang', 'zh'));
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/artigen/tools-seo');

  const marketCard = page.locator('.features-grid a.feature-card[href="/artigen/market"]');
  const icon = marketCard.locator('.card-icon');
  await expect(marketCard).toBeVisible();
  await expect(icon).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  if (phase === 'before') {
    await expect(icon).toContainText('🔋');
    await expect(icon.locator('svg')).toHaveCount(0);
  } else {
    await expect(icon.locator('svg')).toHaveCount(1);
    await expect(icon.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24');
    await expect(icon.locator('svg rect')).toHaveAttribute('x', '3');
    await expect(icon.locator('svg path')).toHaveAttribute('d', 'M21 10v4M11 8l-2 4h4l-2 4');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon).not.toContainText('🔋');
  }

  await page.screenshot({
    path: join(outputDir, 'page-default.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await marketCard.scrollIntoViewIfNeeded();
  await marketCard.screenshot({ path: join(outputDir, 'icon-default.png'), animations: 'disabled' });

  if (!isMobile) {
    await marketCard.hover();
    await marketCard.screenshot({ path: join(outputDir, 'icon-hover.png'), animations: 'disabled' });
  }

  await page.mouse.move((viewport?.width ?? 1440) - 2, (viewport?.height ?? 960) - 2);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await marketCard.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(marketCard).toBeFocused();
  await expect(marketCard).toHaveCSS('outline-style', 'solid');
  await marketCard.screenshot({ path: join(outputDir, 'icon-keyboard-focus.png'), animations: 'disabled' });

  const geometry = await icon.evaluate((element) => {
    const card = element.closest('.feature-card');
    if (!card) throw new Error('Market icon is not inside its feature card');
    const iconRect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const svgRect = element.querySelector('svg')?.getBoundingClientRect();
    return {
      iconBox: { x: iconRect.x, y: iconRect.y, width: iconRect.width, height: iconRect.height },
      svgBox: svgRect && { x: svgRect.x, y: svgRect.y, width: svgRect.width, height: svgRect.height },
      cardBox: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.iconBox.height).toBe(48);
  if (geometry.svgBox) {
    expect(Math.abs(geometry.svgBox.x + geometry.svgBox.width / 2 - (geometry.iconBox.x + geometry.iconBox.width / 2)))
      .toBeLessThanOrEqual(0.5);
    expect(Math.abs(geometry.svgBox.y + geometry.svgBox.height / 2 - (geometry.iconBox.y + geometry.iconBox.height / 2)))
      .toBeLessThanOrEqual(0.5);
  }
  await writeFile(join(outputDir, 'geometry.json'), JSON.stringify({ viewport, geometry }, null, 2));

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/artigen\/market(?:\?.*)?$/);
});
