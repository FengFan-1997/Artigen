import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type CardState = {
  tagName: string;
  tabIndex: number;
  background: string;
  borderColor: string;
  borderRadius: string;
  borderWidth: string;
  padding: string;
  color: string;
  textAlign: string;
  textDecoration: string;
  transform: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
};

async function readCardState(page: Page): Promise<CardState> {
  return page.locator('.features-grid .feature-card').first().evaluate((card) => {
    const style = getComputedStyle(card);
    return {
      tagName: card.tagName,
      tabIndex: (card as HTMLElement).tabIndex,
      background: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      borderWidth: style.borderWidth,
      padding: style.padding,
      color: style.color,
      textAlign: style.textAlign,
      textDecoration: style.textDecorationLine,
      transform: style.transform,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset
    };
  });
}

test('SEO feature cards are keyboard-operable without changing their card surface', async ({ page }, testInfo) => {
  const phase = process.env.ARTIGEN_SEO_FEATURE_KEYBOARD_PHASE ?? 'after';
  if (phase !== 'before' && phase !== 'after') throw new Error(`Unsupported capture phase: ${phase}`);

  const viewport = testInfo.project.use.viewport;
  const device = viewport?.width === 390 ? 'mobile-390' : 'desktop-1440';
  const artifactDir = join(process.cwd(), '..', 'ui-review', 'seo-feature-card-keyboard-20261028', phase, device);
  await mkdir(artifactDir, { recursive: true });

  await page.addInitScript(() => localStorage.setItem('app_lang', 'zh'));
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));
  await page.goto('/artigen/tools-seo');

  const cards = page.locator('.features-grid .feature-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const before = await readCardState(page);
  await page.screenshot({ path: join(artifactDir, 'default.png'), fullPage: true, animations: 'disabled' });

  await cards.first().hover();
  await page.waitForTimeout(350);
  const hover = await readCardState(page);
  await page.screenshot({ path: join(artifactDir, 'hover.png'), fullPage: true, animations: 'disabled' });

  if (phase === 'before') {
    expect(before.tagName).toBe('DIV');
    expect(before.tabIndex).toBe(-1);
    await writeFile(join(artifactDir, 'computed-styles.json'), JSON.stringify({ viewport, before, hover }, null, 2));
    return;
  }

  expect(before.tagName).toBe('A');
  expect(before.tabIndex).toBe(0);
  expect(before.textAlign).toBe('center');
  await expect(page.locator('.features-grid a.feature-card')).toHaveCount(3);
  const baselinePath = join(process.cwd(), '..', 'ui-review', 'seo-feature-card-keyboard-20261028', 'before', device, 'computed-styles.json');
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as { before: CardState; hover: CardState };
  const visualState = ({ background, transform }: CardState) => ({ background, transform });
  expect(visualState(before)).toEqual(visualState(baseline.before));
  expect(visualState(hover)).toEqual(visualState(baseline.hover));

  const firstCard = cards.first();
  await page.mouse.move((viewport?.width ?? 1440) - 2, (viewport?.height ?? 960) - 2);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await firstCard.evaluate((card) => card === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(firstCard).toBeFocused();
  await page.waitForTimeout(350);
  await expect(firstCard).toHaveCSS('outline-style', 'solid');
  const focus = await readCardState(page);
  expect(focus.outlineWidth).toBe('3px');
  expect(focus.outlineOffset).toBe('3px');
  await page.screenshot({ path: join(artifactDir, 'keyboard-focus.png'), animations: 'disabled' });
  await writeFile(join(artifactDir, 'computed-styles.json'), JSON.stringify({ viewport, before, hover, focus }, null, 2));

  await page.keyboard.press('Enter');
  await page.waitForURL('**/artigen/tools');
  await expect(page).toHaveURL(/\/artigen\/tools$/);
});
