import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type CardSurface = {
  borderColor: string;
  boxShadow: string;
  cursor: string;
  transform: string;
  cornerBorderColor: string;
};

const readSurface = async (page: Page, index: number): Promise<CardSurface> =>
  page.locator('.pricing-card').nth(index).evaluate((card) => {
    const style = getComputedStyle(card);
    const corner = card.querySelector<HTMLElement>('.card-corner');
    return {
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      cursor: style.cursor,
      transform: style.transform,
      cornerBorderColor: corner ? getComputedStyle(corner).borderTopColor : 'none'
    };
  });

const packages = [
  ['starter', 'Starter', 990, 400],
  ['standard', 'Standard', 1990, 1000],
  ['pro', 'Pro', 4990, 3000],
  ['ultimate', 'Ultimate', 9990, 10000]
] as const;

test('pricing cards do not advertise blank areas as purchase controls', async ({ page }, testInfo) => {
  const phase = process.env.ARTIGEN_MARKET_CARD_PHASE ?? 'after';
  if (phase !== 'before' && phase !== 'after') {
    throw new Error(`Unsupported capture phase: ${phase}`);
  }

  await page.addInitScript(() => window.localStorage.setItem('app_lang', 'zh'));
  await page.route('**/api/pay/packages', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        packages: packages.map(([id, title, amountMinor, credits]) => ({
          packageId: `11111111-1111-4111-8111-${id.padEnd(12, '0')}`,
          sku: `credits.${id}.v1`,
          title,
          amountMinor,
          currency: 'CNY',
          credits
        }))
      })
    });
  });

  await page.goto('/artigen/market');
  const cards = page.locator('.pricing-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.first().getByRole('button')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);

  const viewport = testInfo.project.use.viewport;
  const device = viewport?.width === 390 ? 'mobile-390' : 'desktop-1440';
  const artifactDir = join(
    process.cwd(),
    '..',
    'ui-review',
    'market-card-affordance-20261028',
    phase,
    device
  );
  await mkdir(artifactDir, { recursive: true });

  const states: Array<{ card: string; default: CardSurface; hover: CardSurface }> = [];
  for (let index = 0; index < 4; index += 1) {
    const card = cards.nth(index);
    const title = (await card.locator('h2').innerText()).trim().toLowerCase();
    await card.scrollIntoViewIfNeeded();
    const cardTop = await card.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate((top) => window.scrollBy(0, top - 104), cardTop);
    const resting = await readSurface(page, index);
    if (index === 0) {
      await page.screenshot({
        path: join(artifactDir, 'default.png'),
        animations: 'disabled',
        fullPage: false
      });
    }
    await card.hover();
    await page.waitForTimeout(350);
    const hovered = await readSurface(page, index);
    states.push({ card: title, default: resting, hover: hovered });

    if (index === 0) {
      await page.screenshot({
        path: join(artifactDir, 'hover.png'),
        animations: 'disabled',
        fullPage: false
      });
    }

    if (phase === 'after') {
      expect(hovered.cursor, `${title} blank card cursor`).not.toBe('pointer');
      expect(hovered.transform, `${title} card lift`).toBe('none');
      expect(hovered.boxShadow, `${title} card shadow`).toBe(resting.boxShadow);
      expect(hovered.borderColor, `${title} card border`).toBe(resting.borderColor);
      expect(hovered.cornerBorderColor, `${title} corner decoration`).toBe(resting.cornerBorderColor);
    }
  }

  const firstCard = cards.first();
  const firstCardTop = await firstCard.evaluate((element) => element.getBoundingClientRect().top);
  await page.evaluate((top) => window.scrollBy(0, top - 104), firstCardTop);
  await page.mouse.move((viewport?.width ?? 1440) - 2, (viewport?.height ?? 960) - 2);
  await firstCard.getByRole('button').focus();
  await expect(firstCard.getByRole('button')).toBeFocused();
  await page.screenshot({
    path: join(artifactDir, 'purchase-action-focus.png'),
    animations: 'disabled',
    fullPage: false
  });
  const focusedButtonRemainsEnabled = await firstCard.getByRole('button').isEnabled();
  expect(focusedButtonRemainsEnabled).toBe(true);

  await writeFile(
    join(artifactDir, 'computed-styles.json'),
    JSON.stringify({ viewport, states, focusedButtonRemainsEnabled }, null, 2)
  );
});
