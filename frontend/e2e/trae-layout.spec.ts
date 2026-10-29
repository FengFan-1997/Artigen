import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

for (const theme of ['dark', 'light']) test(`wide editor keeps explorer to the left and draft intact ${theme}`, async ({ page }) => {
  const fixture = await installWorkspaceFixture(page, theme);
  await page.setViewportSize({ width: 1920, height: 960 });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  const tree = page.getByRole('complementary', { name: '文件目录', exact: true });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '文件编辑器', exact: true });
  await expect(editor).toBeVisible();
  const treeBox = await tree.boundingBox(), editorBox = await editor.boundingBox();
  expect(treeBox!.x + treeBox!.width).toBeLessThanOrEqual(editorBox!.x);
  expect(await tree.evaluate(el => !!(el.compareDocumentPosition(el.parentElement!.querySelector('.file-viewer')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await editor.fill('未保存的修改');
  await nav.getByRole('button', { name: '任务', exact: true }).click();
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  await expect(editor).toContainText('未保存的修改');
  expect(fixture.workspace.saves).toHaveLength(0);
});
