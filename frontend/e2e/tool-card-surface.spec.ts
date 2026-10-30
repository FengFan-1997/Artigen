import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type CardSurface = {
  backgroundColor: string;
  borderColor: string;
  borderRadius: string;
  borderWidth: string;
  boxShadow: string;
  outlineColor: string;
  outlineStyle: string;
  outlineWidth: string;
  transform: string;
};

async function cardSurface(page: Page): Promise<CardSurface> {
  return page.locator('.tools-grid .tool-card').first().evaluate((card) => {
    const style = getComputedStyle(card);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      borderWidth: style.borderWidth,
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      transform: style.transform
    };
  });
}

async function focusToolCardByKeyboard(page: Page, cardButton: Locator): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (await cardButton.evaluate((button) => button === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(cardButton).toBeFocused();
}

test('tool cards keep a neutral surface on hover and a clear keyboard focus', async ({ page }, testInfo) => {
  const phase = process.env.ARTIGEN_TOOL_CARD_PHASE ?? 'after';
  if (phase !== 'before' && phase !== 'after') throw new Error(`Unsupported capture phase: ${phase}`);

  const viewport = testInfo.project.use.viewport;
  const device = viewport?.width === 390 ? 'mobile-390' : 'desktop-1440';
  const artifactDir = join(process.cwd(), '..', 'ui-review', 'tool-card-surface-20261028', phase, device);
  await mkdir(artifactDir, { recursive: true });

  await page.goto('/artigen/tools');
  await expect(page.locator('.tools-grid .tool-card')).toHaveCount(15);
  await page.evaluate(() => document.fonts.ready);

  const card = page.locator('.tools-grid .tool-card').first();
  const openButton = card.locator('.tool-card-open');
  await card.scrollIntoViewIfNeeded();

  const states: Record<string, CardSurface> = {};
  states.default = await cardSurface(page);
  await page.screenshot({ path: join(artifactDir, 'default.png'), animations: 'disabled' });

  await card.hover();
  await page.waitForTimeout(350);
  states.hover = await cardSurface(page);
  await page.screenshot({ path: join(artifactDir, 'hover.png'), animations: 'disabled' });

  await page.mouse.move((viewport?.width ?? 1440) - 2, (viewport?.height ?? 960) - 2);
  await focusToolCardByKeyboard(page, openButton);
  await expect(openButton).toBeFocused();
  await page.waitForTimeout(350);
  states.focus = await cardSurface(page);
  await page.screenshot({ path: join(artifactDir, 'keyboard-focus.png'), animations: 'disabled' });
  await writeFile(join(artifactDir, 'computed-styles.json'), JSON.stringify({ viewport, states }, null, 2));

  if (phase === 'after') {
    expect(states.default.borderRadius).toBe('10px');
    expect(states.default.borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(states.hover.borderColor).toBe('rgba(0, 0, 0, 0)');
    expect(states.hover.transform).toBe('none');
    expect(states.hover.boxShadow).toBe('none');
    expect(states.focus.backgroundColor).toBe(states.default.backgroundColor);
    expect(states.focus.outlineStyle).toBe('solid');
    expect(states.focus.outlineWidth).toBe('3px');
    expect(states.focus.outlineColor).toBe('rgb(204, 255, 0)');
  }
});
