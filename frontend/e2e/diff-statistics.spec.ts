import { test, expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

async function comparison(page: Page, zh: boolean, installModuleRoute: () => Promise<void>) {
  const fixture = await installWorkspaceFixture(page);
  await installModuleRoute();
  if (!zh) await page.addInitScript(() => localStorage.setItem('app_lang', 'en'));
  for (const [index, text] of [[0, 'first\nsecond\n'], [2, 'first\nsecond\nthird\n']] as const) Object.assign(fixture.workspace.files[index], { text, byteSize: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') });
  const newer = { ...fixture.workspace.files[2], id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', path: 'outputs/newer.md', text: 'first\nsecond\nthird\nfourth\n' };
  Object.assign(newer, { byteSize: Buffer.byteLength(newer.text), sha256: createHash('sha256').update(newer.text).digest('hex') });
  fixture.workspace.files.push(newer);
  await page.goto(`/artigen/agent/runs/${inputRunId}`); await expect(page.locator('.workspace-topbar')).toBeVisible();
  const nav = page.getByRole('navigation', { name: zh ? '资源面板' : 'Resources', exact: true });
  await nav.getByRole('button', { name: zh ? '文件' : 'Files', exact: true }).click();
  const tree = page.getByRole('complementary', { name: zh ? '文件目录' : 'File explorer', exact: true });
  await tree.getByRole('button', { name: 'docs', exact: true }).click(); await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await expect(page.locator('.document-preview')).toContainText('first');
  await nav.getByRole('button', { name: zh ? '变更' : 'Changes', exact: true }).click();
  const panel = page.locator('.changes-panel');
  await panel.getByRole('combobox').selectOption(fixture.workspace.files[2].id);
  await expectComparisonLayout(panel);
  return { fixture, nav, panel, header: panel.locator(':scope > header'), newer };
}

async function expectComparisonLayout(panel: Locator) {
  const editor = panel.locator('.workspace-code-editor');
  await expect(editor).toBeVisible();
  const width = await editor.evaluate((element) => element.clientWidth);
  const expectedPanes = width < 720 ? 1 : 2;
  await expect(editor.locator('.cm-content')).toHaveCount(expectedPanes);
  if (expectedPanes === 1) await expect(panel.locator('.cm-mergeView')).toHaveCount(0);
  else await expect(panel.locator('.cm-mergeView')).toBeVisible();
}

for (const language of ['zh', 'en']) {
  test(`unknown totals stay absent and late calculations follow the latest source ${language}`, async ({ page }) => {
    let release = () => {}, requested = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const installModuleRoute = () => page.route('**/src/agentImg/services/workspaceChanges.ts*', async route => { requested = true; await gate; await route.continue(); });
    try {
      const zh = language === 'zh'; const { fixture, nav, panel, header, newer } = await comparison(page, zh, installModuleRoute);
      await expect.poll(() => requested).toBe(true);
      expect(await header.locator('.added,.removed').count()).toBe(0);
      await panel.getByRole('combobox').selectOption(newer.id);
      await expect(panel.getByRole('combobox')).toHaveValue(newer.id);
      expect(await header.locator('.added,.removed').count()).toBe(0);
      await nav.getByRole('button', { name: zh ? '文件' : 'Files', exact: true }).click();
      await nav.getByRole('button', { name: zh ? '变更' : 'Changes', exact: true }).click();
      expect(await header.locator('.added,.removed').count()).toBe(0);
      release(); await expect(header.locator('.added')).toHaveText('+2'); await expect(header.locator('.removed')).toHaveText('−0');
      await panel.getByRole('combobox').selectOption(fixture.workspace.files[2].id);
      await expect(header.locator('.added')).toHaveText('+1');
      await panel.getByRole('combobox').selectOption('');
      await expect(panel.getByRole('status')).toContainText(zh ? '两份内容一致' : 'Contents are identical');
      await expect(header.locator('.added,.removed')).toHaveCount(0);
      expect(fixture.workspace.saves).toHaveLength(0); expect(fixture.workspace.files[0].text).toBe('first\nsecond\n');
    } finally { release(); }
  });

  test(`failed optional totals keep comparison and explicit application usable ${language}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    let failed = false;
    const installModuleRoute = () => page.route('**/src/agentImg/services/workspaceChanges.ts*', async route => {
      await route.fulfill({ status: 503, contentType: 'text/javascript', body: '/* synthetic statistics module failure */' }); failed = true;
    });
    const zh = language === 'zh'; const { fixture, panel, header } = await comparison(page, zh, installModuleRoute);
    await expect.poll(() => failed).toBe(true);
    await expect(header.locator('.added,.removed')).toHaveCount(0);
    for (const content of await panel.locator('.cm-content').all()) await expect(content).toHaveAttribute('contenteditable', 'false');
    expect(fixture.workspace.saves).toHaveLength(0);
    await panel.getByRole('button', { name: zh ? '应用到当前文件' : 'Apply to current file', exact: true }).click();
    await expect.poll(() => fixture.workspace.saves.length).toBe(1);
    await expect(panel.getByRole('status')).toContainText(zh ? '两份内容一致' : 'Contents are identical');
    expect(fixture.workspace.files[0].text).toBe('first\nsecond\nthird\n');
    expect(errors).toEqual([]);
  });
}
