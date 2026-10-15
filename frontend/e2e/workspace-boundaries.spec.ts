import { test, expect, type Page } from '@playwright/test';
import { installWorkspaceFixture, projectA } from './helpers/workspaceReplicaFixtures';

function contrast(a: string, b: string) {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

async function visibleEdge(page: Page, selector: string, side: string, surfaces: string[]) {
  const edge = await page.locator(selector).evaluate(
    (node, { side, surfaces }) => {
      const style = getComputedStyle(node);
      return {
        color: style.getPropertyValue(`border-${side}-color`),
        width: style.getPropertyValue(`border-${side}-width`),
        style: style.getPropertyValue(`border-${side}-style`),
        surfaces: surfaces.map((s) => getComputedStyle(document.querySelector(s)!).backgroundColor)
      };
    },
    { side, surfaces }
  );
  expect(edge.width, `${selector} ${side}`).toBe('1px');
  expect(edge.style, `${selector} ${side}`).toBe('solid');
  for (const surface of edge.surfaces) {
    expect(
      contrast(edge.color, surface),
      `${selector}: ${edge.color} against ${surface}`
    ).toBeGreaterThanOrEqual(3);
  }
}

async function fixture(page: Page, theme: string) {
  await installWorkspaceFixture(page, theme);
  await page.addInitScript((theme) => {
    localStorage.setItem(
      'artigen-workspace-preferences',
      JSON.stringify({
        version: 4,
        theme,
        resourceMode: 'files',
        inspectorVisibility: { compose: false, task: false }
      })
    );
  }, theme);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(`/artigen/agent?projectId=${projectA}`);
  await expect(page.locator('.resource-tree')).toBeVisible();
}

for (const theme of ['light', 'dark']) {
  test(`${theme} workspace boundaries remain visible without hover`, async ({ page }) => {
    await fixture(page, theme);
    await visibleEdge(page, '.file-search', 'top', ['.resource-tree']);
    await visibleEdge(page, '.history-search', 'top', ['.workspace-left']);
    await visibleEdge(page, '.composer-box', 'top', ['.composer-box', '.workspace-main']);
    await visibleEdge(page, '.workspace-rail', 'right', ['.workspace-rail', '.workspace-left']);
    await visibleEdge(page, '.workspace-left', 'right', ['.workspace-left', '.workspace-main']);
    await visibleEdge(page, '.workspace-right', 'left', ['.workspace-main', '.workspace-right']);
    await visibleEdge(page, '.workspace-topbar', 'bottom', ['.workspace-main']);
    await visibleEdge(page, '.resource-tabs', 'bottom', ['.workspace-right']);
    await visibleEdge(page, '.resource-tree', 'left', ['.resource-tree', '.workspace-main']);
    const separator = page.locator('.left-resizer');
    await separator.hover();
    await expect
      .poll(() => separator.evaluate((node) => getComputedStyle(node, '::after').backgroundColor))
      .toMatch(/^rgb\(/);
    const hover = await separator.evaluate((node) => ({
      color: getComputedStyle(node, '::after').backgroundColor,
      bg: getComputedStyle(document.querySelector('.workspace-main')!).backgroundColor
    }));
    expect(contrast(hover.color, hover.bg)).toBeGreaterThanOrEqual(3);
    const tree = page.getByRole('complementary', { name: '文件目录' });
    await tree.getByRole('button', { name: 'docs', exact: true }).click();
    await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
    await expect(page.locator('.document-preview')).toContainText('品牌网站审查');
    await visibleEdge(page, '.file-tabs-bar', 'bottom', ['.file-tabs-bar', '.workspace-main']);
    await visibleEdge(page, '.file-toolbar', 'bottom', ['.workspace-main']);
    await visibleEdge(page, '.file-status', 'top', ['.workspace-main']);
    await page.getByRole('button', { name: '隐藏目录树', exact: true }).click();
    await expect(tree).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1920);
  });
}

test('system appearance updates visible boundaries when the OS theme changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await fixture(page, 'system');
  const shell = page.locator('.agent-workspace-shell');
  await expect(shell).toHaveAttribute('data-theme', 'light');
  await visibleEdge(page, '.workspace-right', 'left', ['.workspace-main']);
  const light = await page
    .locator('.workspace-right')
    .evaluate((node) => getComputedStyle(node).borderLeftColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(shell).toHaveAttribute('data-theme', 'dark');
  await visibleEdge(page, '.workspace-right', 'left', ['.workspace-main']);
  await expect(page.locator('.workspace-right')).not.toHaveCSS('border-left-color', light);
});
