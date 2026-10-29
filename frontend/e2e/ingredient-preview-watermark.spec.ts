import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type ColorReadability = {
  color: string;
  opacity: number;
  contrastAgainstWhite: number;
};

function contrastAgainstWhite(color: string): ColorReadability {
  const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) throw new Error(`Unexpected watermark color: ${color}`);
  const alpha = channels[3] ?? 1;
  const luminance = channels.slice(0, 3).reduce((sum, channel, index) => {
    const composite = (channel * alpha + 255 * (1 - alpha)) / 255;
    const linear = composite <= 0.04045 ? composite / 12.92 : ((composite + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);

  return {
    color,
    opacity: alpha,
    contrastAgainstWhite: 1.05 / (luminance + 0.05)
  };
}

test('ingredient label empty-preview watermark is readable and disappears after layout', async ({ page }, testInfo) => {
  const viewport = testInfo.project.use.viewport;
  if (!viewport) throw new Error('A fixed viewport is required for the screenshot audit.');
  const device = viewport.width === 390 ? 'mobile-390' : `desktop-${viewport.width}`;
  const phase = process.env.ARTIGEN_INGREDIENT_PREVIEW_PHASE ?? 'after';
  if (phase !== 'before' && phase !== 'after') throw new Error(`Unsupported capture phase: ${phase}`);
  const artifactDir = join(
    process.cwd(),
    '..',
    'ui-review',
    'ingredient-preview-watermark-20261028',
    phase,
    device
  );
  await mkdir(artifactDir, { recursive: true });

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => window.localStorage.setItem('app_lang', 'zh'));
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
  );
  await page.route('**/api/collection/event', (route) =>
    route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  );

  await page.goto('/artigen/image-workshop/ingredient-label');
  const dialog = page.locator('.ingredient-modal-container');
  const preview = page.locator('.preview-inner');
  const watermark = page.locator('.demo-watermark');
  const textarea = page.locator('.product-textarea');
  const localLayout = page.locator('.local-layout-button');
  await expect(dialog).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(watermark).toHaveText('预览');
  await expect.poll(() => watermark.evaluate((element) => getComputedStyle(element).display)).toBe('flex');
  await page.evaluate(() => document.fonts.ready);

  const readability = await watermark.evaluate((element) => {
    const color = getComputedStyle(element).color;
    const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
    if (channels.length < 3) throw new Error(`Unexpected watermark color: ${color}`);
    const alpha = channels[3] ?? 1;
    const luminance = channels.slice(0, 3).reduce((sum, channel, index) => {
      const composite = (channel * alpha + 255 * (1 - alpha)) / 255;
      const linear = composite <= 0.04045 ? composite / 12.92 : ((composite + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    return {
      color,
      opacity: alpha,
      contrastAgainstWhite: 1.05 / (luminance + 0.05)
    };
  });

  if (phase === 'after') expect(readability.contrastAgainstWhite).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: join(artifactDir, 'default.png'), animations: 'disabled' });
  await preview.screenshot({ path: join(artifactDir, 'preview-default.png'), animations: 'disabled' });

  if (!testInfo.project.use.isMobile) {
    await preview.hover();
    await page.screenshot({ path: join(artifactDir, 'hover.png'), animations: 'disabled' });
    await preview.screenshot({ path: join(artifactDir, 'preview-hover.png'), animations: 'disabled' });
  }

  await textarea.fill('Water, glycerin');
  await expect(localLayout).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(localLayout).toBeFocused();
  const focusVisible = await localLayout.evaluate((element) => element.matches(':focus-visible'));
  expect(focusVisible).toBe(true);
  await page.screenshot({ path: join(artifactDir, 'keyboard-focus.png'), animations: 'disabled' });

  await localLayout.click();
  await expect(dialog.locator('.editorBox')).toHaveClass(/generated/);
  await expect(watermark).toHaveCSS('display', 'none');

  const result = {
    viewport,
    device,
    phase,
    readability: contrastAgainstWhite(readability.color),
    focusVisible,
    generatedWatermarkDisplay: await watermark.evaluate((element) => getComputedStyle(element).display)
  };
  await writeFile(join(artifactDir, 'computed-styles.json'), JSON.stringify(result, null, 2));
});
