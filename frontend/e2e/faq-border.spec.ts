import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';

const routes = [
  ['workshop', '/artigen/image-workshop'], ['landing', '/artigen'],
  ['tools', '/artigen/tools'], ['seo', '/artigen/tools-seo'], ['market', '/artigen/market']
] as const;
for (const [name, route] of routes) for (const width of [390, 1440]) test(`${name} FAQ retains a visible full outline and keyboard operation at ${width}px`, async ({ page }) => {
  await installWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem('app_lang', 'en'));
  await page.setViewportSize({ width, height: 900 });
  await page.goto(route);
  const item = page.locator('.faq-item').first();
  const summary = item.locator('summary');
  await expect(item).toBeVisible();
  await summary.focus(); await expect(summary).toBeFocused();
  await expect(summary).toHaveCSS('outline-style', 'solid');
  await summary.press('Enter'); await expect(item).toHaveAttribute('open', '');
  await expect.poll(() => item.evaluate(element => {
    const s = getComputedStyle(element);
    return new Set([s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor]).size;
  })).toBe(1);
  const geometry = await item.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const question = element.querySelector('summary')!.getBoundingClientRect();
    return {
      widths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      colors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
      questionInset: Math.min(question.left - box.left, box.right - question.right),
      height: question.height
    };
  });
  expect(geometry.widths).toEqual(['1px', '1px', '1px', '1px']);
  expect(new Set(geometry.colors).size).toBe(1);
  expect(geometry.colors[0]).not.toBe('rgba(0, 0, 0, 0)');
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  await expect(item.locator('.faq-a')).toBeVisible();
  await summary.press('Enter'); await expect(item).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('open FAQ outline remains visible in forced-colors mode', async ({ page }) => {
  await installWorkspaceFixture(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/image-workshop');
  const item = page.locator('.faq-item').first();
  await item.locator('summary').click();
  await expect(item).toHaveAttribute('open', '');
  const borders = await item.evaluate(element => {
    const s = getComputedStyle(element);
    return { color: s.borderTopColor, background: s.backgroundColor, sides: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth] };
  });
  expect(borders.sides).toEqual(['1px', '1px', '1px', '1px']);
  expect(borders.color).not.toBe(borders.background);
});
