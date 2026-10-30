import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

for (const theme of ['dark', 'light']) for (const width of [390, 1440]) test(`file explorer spacing and filtering ${theme} ${width}`, async ({ page }) => {
  const fixture = await installWorkspaceFixture(page, theme);
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  await expect(page.locator('.workspace-topbar')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
  if (!(await nav.isVisible())) await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  const tree = page.getByRole('complementary', { name: '文件目录', exact: true });
  const search = tree.getByRole('textbox', { name: '筛选文件' });
  await expect(search).toBeVisible();
  const spacing = await tree.locator('.file-search').evaluate(el => {
    const box = el.getBoundingClientRect(), icon = el.querySelector('svg')!.getBoundingClientRect();
    return { left: icon.left - box.left, vertical: Math.abs((icon.top + icon.bottom) / 2 - (box.top + box.bottom) / 2) };
  });
  expect(spacing.left).toBeGreaterThanOrEqual(8);
  expect(spacing.vertical).toBeLessThanOrEqual(1);
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  const file = tree.getByRole('button', { name: 'brief.md', exact: true });
  await expect(file).toBeVisible(); await file.click();
  await expect(page.getByRole('tab', { name: 'brief.md' })).toBeVisible();
  if (!(await tree.isVisible())) await page.getByRole('button', { name: '显示目录树' }).click();
  await search.fill('missing-不存在');
  await expect(tree.getByRole('status')).toContainText('没有匹配的项目文件');
  await tree.getByRole('button', { name: '清除文件筛选' }).click();
  await expect(search).toHaveValue(''); await expect(search).toBeFocused();
  expect(fixture.workspace.saves).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
