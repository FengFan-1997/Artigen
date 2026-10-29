import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('Chinese landing headline remains fully visible across desktop and narrow mobile widths', async ({ page }, testInfo) => {
  const phase = process.env.ARTIGEN_LANDING_HEADLINE_PHASE ?? 'after';
  expect(['before', 'after']).toContain(phase);

  const viewport = testInfo.project.use.viewport;
  const isMobile = viewport?.width === 390;
  const device = isMobile ? 'mobile-390' : 'desktop-1440';
  const outputDir = join(process.cwd(), '..', 'ui-review', 'landing-headline-wrap-20261029', phase, device);
  await mkdir(outputDir, { recursive: true });

  await page.addInitScript(() => localStorage.setItem('app_lang', 'zh'));
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/artigen');

  const headline = page.locator('.hero-section .headline');
  const tail = headline.locator('.headline-tail');
  await expect(headline).toBeVisible();
  await expect(tail).toHaveText('从生成到编辑与多尺寸交付');
  await page.evaluate(() => document.fonts.ready);

  const measureTail = async () => tail.evaluate((element) => {
    const headlineElement = element.closest('.headline');
    if (!headlineElement) throw new Error('Landing headline is missing');
    const range = document.createRange();
    range.selectNodeContents(element);
    const textRects = Array.from(range.getClientRects()).map(({ left, right, top, bottom }) => ({
      left,
      right,
      top,
      bottom
    }));
    const headlineRect = headlineElement.getBoundingClientRect();
    return {
      whiteSpace: getComputedStyle(element).whiteSpace,
      headline: { left: headlineRect.left, right: headlineRect.right, width: headlineRect.width },
      textRects,
      maxTextRight: Math.max(...textRects.map((rect) => rect.right))
    };
  });

  const saveState = async (name: string) => {
    await page.screenshot({
      path: join(outputDir, `${name}-page.png`),
      animations: 'disabled'
    });
    await headline.screenshot({
      path: join(outputDir, `${name}-headline.png`),
      animations: 'disabled'
    });
  };

  const defaultGeometry = await measureTail();
  await saveState('default');

  if (phase === 'before') {
    expect(defaultGeometry.maxTextRight).toBeGreaterThan(defaultGeometry.headline.right + 1);
  } else {
    expect(defaultGeometry.maxTextRight).toBeLessThanOrEqual(defaultGeometry.headline.right + 1);
    expect(defaultGeometry.whiteSpace).not.toBe('nowrap');
  }

  const measurements = [{ viewport, geometry: defaultGeometry }];
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 780 });
    const narrowGeometry = await measureTail();
    measurements.push({ viewport: { width: 320, height: 780 }, geometry: narrowGeometry });
    if (phase === 'before') {
      expect(narrowGeometry.maxTextRight).toBeGreaterThan(narrowGeometry.headline.right + 1);
    } else {
      expect(narrowGeometry.maxTextRight).toBeLessThanOrEqual(narrowGeometry.headline.right + 1);
    }
    await saveState('narrow-320');
  }

  await writeFile(join(outputDir, 'geometry.json'), JSON.stringify(measurements, null, 2));
});
