import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';

for (const language of ['zh', 'en']) test(`desktop language menu supports keyboard and selection ${language}`, async ({ page }) => {
  await installWorkspaceFixture(page);
  await page.addInitScript(value => localStorage.setItem('app_lang', value), language);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/artigen/image-workshop');
  const trigger = page.locator('.lang-switch');
  await trigger.focus(); await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const options = page.locator('.lang-dropdown button');
  await expect(options).toHaveCount(2);
  await expect(options.nth(language === 'zh' ? 0 : 1)).toHaveAttribute('aria-pressed', 'true');
  await options.first().focus(); await options.first().press('Escape');
  await expect(trigger).toBeFocused(); await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.press('Enter');
  const target = page.locator('.lang-dropdown button').nth(language === 'zh' ? 1 : 0);
  await target.focus(); await target.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.lang-label')).toHaveText(language === 'zh' ? 'EN' : 'ZH');
});

test('mobile navigation icon and menu remain operable by keyboard', async ({ page }) => {
  await installWorkspaceFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/image-workshop');
  const toggle = page.locator('.nav-toggle');
  await toggle.focus(); await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.mobile-menu')).toBeVisible();
  await expect(toggle.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  const inset = await toggle.evaluate(element => {
    const box = element.getBoundingClientRect(); const icon = element.querySelector('svg')!.getBoundingClientRect();
    return Math.min(icon.left - box.left, box.right - icon.right, icon.top - box.top, box.bottom - icon.bottom);
  });
  expect(inset).toBeGreaterThanOrEqual(8);
  await toggle.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
