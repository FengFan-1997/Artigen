import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';

for (const width of [390, 1440]) for (const language of ['zh', 'en']) {
  test(`workshop icons and native FAQ remain usable ${width} ${language}`, async ({ page }) => {
    await installWorkspaceFixture(page);
    await page.addInitScript(value => localStorage.setItem('app_lang', value), language);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/artigen/image-workshop');
    const cards = page.locator('.tool-card');
    await expect(cards).toHaveCount(5);
    for (const card of await cards.all()) {
      const icon = card.locator('.tool-icon svg');
      await expect(icon).toBeVisible();
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
      const geometry = await icon.evaluate(element => {
        const iconBox = element.getBoundingClientRect();
        const cardBox = element.closest('button')!.getBoundingClientRect();
        return { width: iconBox.width, left: iconBox.left - cardBox.left, right: cardBox.right - iconBox.right };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(32);
      expect(geometry.left).toBeGreaterThanOrEqual(8);
      expect(geometry.right).toBeGreaterThanOrEqual(8);
      await expect(card.locator('.tool-icon')).toHaveCSS('border-top-width', '0px');
    }
    const faq = page.locator('.faq-item').first();
    const summary = faq.locator('summary');
    await summary.focus(); await expect(summary).toBeFocused();
    await summary.press('Enter'); await expect(faq).toHaveAttribute('open', '');
    await summary.hover();
    for (const side of ['top', 'right', 'bottom', 'left']) await expect(faq).toHaveCSS(`border-${side}-width`, '1px');
    const inset = await summary.evaluate(element => {
      const r = element.getBoundingClientRect();
      const icon = element.querySelector('svg')!.getBoundingClientRect();
      return r.right - icon.right;
    });
    expect(inset).toBeGreaterThanOrEqual(8);
    await summary.press('Enter'); await expect(faq).not.toHaveAttribute('open', '');
    await cards.first().focus(); await expect(cards.first()).toBeFocused();
    await cards.first().press('Enter');
    await expect(page.locator('.standard-photo-dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
