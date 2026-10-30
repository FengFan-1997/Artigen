import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

test('editor theme switches without losing edits, history, selection or scroll', async ({ page }) => {
  const fixture = await installWorkspaceFixture(page, 'dark');
  fixture.workspace.files[0].text = Array.from({ length: 200 }, (_, i) => `第 ${i + 1} 行 Example content`).join('\n');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  const tree = page.getByRole('complementary', { name: '文件目录', exact: true });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const content = page.getByRole('textbox', { name: '文件编辑器', exact: true });
  const scroller = page.locator('.workspace-code-editor .cm-scroller');
  await content.focus(); await content.press('ControlOrMeta+End'); await page.keyboard.type(' NEW');
  await expect(content).toContainText('NEW');
  await content.press('Shift+ArrowLeft');
  const before = await content.evaluate(el => {
    (window as unknown as { savedEditor: Element }).savedEditor = el;
    return window.getSelection()?.toString();
  });
  const beforeScroll = await scroller.evaluate(el => el.scrollTop);
  expect(beforeScroll).toBeGreaterThan(0);
  const appearance = page.locator('.workspace-rail').getByRole('button', { name: /^外观：/ });
  await appearance.click();
  await expect(page.locator('.agent-workspace-shell')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.workspace-code-editor .cm-editor')).not.toHaveClass(/cm-dark/);
  expect(await content.evaluate(el => el === (window as unknown as { savedEditor: Element }).savedEditor)).toBe(true);
  expect(await scroller.evaluate(el => el.scrollTop)).toBeCloseTo(beforeScroll, 0);
  await content.focus(); expect(await content.evaluate(() => window.getSelection()?.toString())).toBe(before);
  await content.press('ControlOrMeta+z'); await expect(content).not.toContainText('NEW');
  await appearance.click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.agent-workspace-shell')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.workspace-code-editor .cm-editor')).toHaveCSS('background-color', 'rgb(30, 30, 30)');
  expect(await content.evaluate(el => el === (window as unknown as { savedEditor: Element }).savedEditor)).toBe(true);
  expect(fixture.workspace.saves).toHaveLength(0);
});

test('read-only difference panes use and switch the resolved theme', async ({ page }) => {
  const fixture = await installWorkspaceFixture(page, 'dark');
  await page.setViewportSize({ width: 1440, height: 960 }); await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const nav = page.getByRole('navigation', { name: '资源面板', exact: true }); await nav.getByRole('button', { name: '文件', exact: true }).click();
  const tree = page.getByRole('complementary', { name: '文件目录', exact: true }); await tree.getByRole('button', { name: 'docs', exact: true }).click(); await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await nav.getByRole('button', { name: '变更', exact: true }).click(); await page.locator('.comparison-picker select').selectOption(fixture.workspace.files[2].id);
  const editors = page.locator('.workspace-code-editor .cm-editor');
  const panelWidth = await page.locator('.workspace-code-editor').evaluate(el => el.clientWidth);
  await expect(editors).toHaveCount(panelWidth < 720 ? 1 : 2);
  for (const editor of await editors.all()) await expect(editor).toHaveCSS('background-color', 'rgb(30, 30, 30)');
  await page.locator('.workspace-rail').getByRole('button', { name: /^外观：/ }).click();
  for (const editor of await editors.all()) await expect(editor).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.workspace-code-editor [contenteditable="true"]')).toHaveCount(0);
  expect(fixture.workspace.saves).toHaveLength(0);
});

test('difference view switches at the panel width without allowing edits or applying changes', async ({ page }) => {
  const fixture = await installWorkspaceFixture(page, 'dark');
  await page.setViewportSize({ width: 1920, height: 960 });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  const tree = page.getByRole('complementary', { name: '文件目录', exact: true });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await nav.getByRole('button', { name: '变更', exact: true }).click();
  await page.locator('.comparison-picker select').selectOption(fixture.workspace.files[2].id);
  const resizer = page.getByRole('separator', { name: '调整右栏宽度' });
  await resizer.focus(); await resizer.press('End');
  await expect(page.locator('.cm-mergeView .cm-content')).toHaveCount(2);
  await resizer.focus(); await resizer.press('Home');
  const host = page.locator('.workspace-code-editor');
  await expect(host.locator('.cm-mergeView')).toHaveCount(0);
  const content = host.locator('.cm-content'); await expect(content).toHaveCount(1);
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await expect(host.locator('.cm-deletedChunk')).not.toHaveCount(0);
  await expect(host.locator('.cm-mergeControls')).toHaveCount(0);
  await content.focus(); await content.press('x');
  expect(fixture.workspace.saves).toHaveLength(0);
  await resizer.focus(); await resizer.press('End');
  await expect(host.locator('.cm-mergeView .cm-content')).toHaveCount(2);
  expect(fixture.workspace.saves).toHaveLength(0);
});

test('language changes update editor name without losing edit state', async ({ page }) => {
  const fixture = await installWorkspaceFixture(page, 'dark');
  fixture.workspace.files[0].text = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}: sample text`).join('\n');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  const tree = page.getByRole('complementary', { name: '文件目录', exact: true });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const content = page.locator('.workspace-code-editor .cm-content[contenteditable=true]');
  await expect(content).toHaveAttribute('aria-label', '文件编辑器');
  await content.focus(); await content.press('ControlOrMeta+End'); await page.keyboard.type(' NEW');
  await content.press('Shift+ArrowLeft');
  const selection = await content.evaluate(el => { (window as unknown as { savedEditor: Element }).savedEditor = el; return window.getSelection()?.toString(); });
  const scroller = page.locator('.workspace-code-editor .cm-scroller');
  const scrollTop = await scroller.evaluate(el => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  // Exercise the same Pinia store as the product language control without navigating away.
  await page.evaluate(() => {
    type AppRoot = HTMLElement & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { setLanguage: (lang: string) => void }> } } } } };
    (document.querySelector('#app') as AppRoot).__vue_app__.config.globalProperties.$pinia._s.get('language')!.setLanguage('en');
  });
  await expect(content).toHaveAttribute('aria-label', 'File editor');
  expect(await content.evaluate(el => el === (window as unknown as { savedEditor: Element }).savedEditor)).toBe(true);
  expect(await scroller.evaluate(el => el.scrollTop)).toBeCloseTo(scrollTop, 0);
  await expect(content).toContainText('NEW');
  expect(await content.evaluate(() => window.getSelection()?.toString())).toBe(selection);
  await content.press('ControlOrMeta+z'); await expect(content).not.toContainText('NEW');
  expect(fixture.workspace.saves).toHaveLength(0);
});
