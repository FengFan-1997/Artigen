import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const readTeamGrid = async (page: Page) =>
  page.locator('.team-grid').evaluate((grid) => {
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.team-card'));
    const rowTops: number[] = [];
    const rowCounts: number[] = [];

    for (const card of cards) {
      const top = Math.round(card.getBoundingClientRect().top);
      const rowIndex = rowTops.findIndex((rowTop) => Math.abs(rowTop - top) <= 1);
      if (rowIndex < 0) {
        rowTops.push(top);
        rowCounts.push(1);
      } else {
        rowCounts[rowIndex] += 1;
      }
    }

    return {
      columns: getComputedStyle(grid).gridTemplateColumns,
      cardCount: cards.length,
      rowCounts,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth
    };
  });

test('About team cards stay balanced at desktop and mobile widths', async ({ page }, testInfo) => {
  const phase = process.env.ARTIGEN_ABOUT_TEAM_GRID_PHASE ?? 'after';
  expect(['before', 'after']).toContain(phase);

  const isMobile = testInfo.project.name === 'chromium-mobile-390';
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1200 });
  await page.addInitScript(() => window.localStorage.setItem('app_lang', 'zh'));
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, authenticated: false })
    });
  });
  await page.route('**/api/collection/event', async (route) => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto('/artigen/about');
  await expect(page.getByRole('heading', { name: '团队成员' })).toBeVisible();
  await expect(page.locator('.team-card')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);

  const geometry = await readTeamGrid(page);
  const artifactDir = join(
    process.cwd(),
    '..',
    'ui-review',
    'about-team-grid-balance-20261028',
    phase,
    isMobile ? 'mobile-390' : 'desktop-1440'
  );
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'default.png'), fullPage: true, animations: 'disabled' });

  if (!isMobile) {
    await page.locator('.team-card').first().hover();
    await page.screenshot({ path: join(artifactDir, 'hover.png'), fullPage: true, animations: 'disabled' });
  }

  await writeFile(join(artifactDir, 'geometry.json'), JSON.stringify(geometry, null, 2));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);

  if (phase === 'before') {
    expect(geometry.rowCounts).toEqual(isMobile ? [1, 1, 1, 1, 1, 1] : [5, 1]);
  } else {
    expect(geometry.rowCounts).toEqual(isMobile ? [1, 1, 1, 1, 1, 1] : [3, 3]);
  }
});
