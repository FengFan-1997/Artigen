import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

async function openDocument(page: Page, filename = 'brief.md') {
  await expect(page.locator('.workspace-topbar')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
  if ((page.viewportSize()?.width || 1440) < 1440 && !(await nav.isVisible())) await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  const tree = page.getByRole('complementary', { name: '文件目录', exact: true });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: filename, exact: true }).click();
  return nav;
}

for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
  test(`read-only differences support keyboard search in both panes ${theme} ${width}`, async ({ page }) => {
    const fixture = await installWorkspaceFixture(page, theme);
    await page.setViewportSize({ width, height: 844 }); await page.goto(`/artigen/agent/runs/${inputRunId}`);
    const nav = await openDocument(page);
    await nav.getByRole('button', { name: '变更', exact: true }).click();
    await page.getByRole('combobox', { name: '比较来源', exact: true }).selectOption(fixture.workspace.files[2].id);
    const contents = page.locator('.cm-mergeView .cm-content'); await expect(contents).toHaveCount(2);
    for (const content of await contents.all()) {
      await expect(content).toHaveAttribute('contenteditable', 'false');
      await expect(content).toHaveAttribute('aria-readonly', 'true');
      await expect(content).toHaveAttribute('tabindex', '0');
      const original = await content.textContent();
      await content.focus(); await expect(content).toBeFocused(); await content.press('ControlOrMeta+f');
      const editor = content.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " cm-editor ")][1]');
      const search = editor.locator('.cm-search'); await expect(search).toBeVisible();
      await expect(search.getByRole('textbox', { name: 'Find', exact: true })).toBeFocused();
      await expect(search.locator('input[name="replace"],button[name="replace"],button[name="replaceAll"]')).toHaveCount(0);
      await search.getByRole('textbox', { name: 'Find', exact: true }).fill('品牌');
      await search.getByRole('textbox', { name: 'Find', exact: true }).press('Escape');
      await expect(search).toHaveCount(0); await expect(content).toBeFocused();
      await content.press('x'); await expect(content).toHaveText(original || '');
    }
    expect(fixture.workspace.saves).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

for (const language of ['zh', 'en']) for (const width of [390, 1440]) test(`native portrait choice and keyboard focus preserve the unpaid state ${language} ${width}`, async ({ page }) => {
  const fixture = await installWorkspaceFixture(page);
  await page.addInitScript(language => localStorage.setItem('app_lang', language), language);
  await page.route('**/api/auth/session', route => route.fulfill({ status: 401, json: { ok: false, authenticated: false } }));
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/artigen/image-workshop/id-photo');
  await page.getByRole('button', { name: language === 'zh' ? '打开付费 AI 职业形象' : 'Open paid AI portrait', exact: true }).click();
  const dialog = page.locator('.modal-container');
  const select = dialog.getByRole('combobox'); await expect(select).toHaveAccessibleName(/.+/);
  await expect(select).toHaveValue('finance'); await expect(select.locator('option')).toHaveCount(5);
  const originalDescription = await dialog.locator('.type-desc').textContent();
  await select.focus(); await expect(select).toBeFocused();
  for (const value of ['tech', 'scholar', 'creative', 'leader', 'finance', 'tech']) {
    await select.selectOption(value); await expect(select).toHaveValue(value);
  }
  await select.focus(); await select.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close / 关闭', exact: true })).toBeFocused();
  await expect(select).toHaveValue('tech'); await expect(dialog.locator('.type-desc')).not.toHaveText(originalDescription || '');
  await expect(dialog.locator('.generate-btn')).toBeDisabled();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await select.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await dialog.getByRole('button', { name: 'Close / 关闭', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(fixture.state.creates).toHaveLength(0); expect(fixture.state.uploads).toBe(0);
});


const formats = [
  ['data.json', '{"标题":"中文😀","enabled":true,"count":42}'],
  ['sample.ts', 'export const 标题: string = "中文😀";\n'],
  ['sample.md', '# 中文😀\n\n| 项 | 值 |\n|---|---|\n| 路径 | a/b |\n'],
  ['sample.html', '<!doctype html><html><body><h1>中文😀</h1></body></html>'],
  ['sample.css', ':root { --color: #123456; }\n'],
  ['sample.csv', 'name,price_cny\n中文😀,12.50\n'],
  ['empty.txt', ''],
  ['long.txt', 'long-中文😀 '.repeat(3000)],
  ['many.txt', Array.from({ length: 5000 }, (_, i) => `${i}: 中文😀`).join('\n')],
  ['limit.txt', 'a'.repeat(1024 * 1024)]
];
for (const [filename, text] of formats) test(`file format boundary preserves original bytes: ${filename}`, async ({ page }) => {
  const fixture = await installWorkspaceFixture(page, filename.endsWith('.json') ? 'light' : 'dark');
  const file = fixture.workspace.files[0];
  Object.assign(file, { path: `docs/${filename}`, text, mimeType: 'text/plain', byteSize: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/artigen/agent/runs/${inputRunId}`);
  await openDocument(page, filename);
  if (/\.(md|html)$/.test(filename)) await page.getByRole('button', { name: '源码', exact: true }).click();
  const editor = page.locator('.cm-content'); await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  // CodeMirror supplies the entire selected document, including virtualized lines.
  await editor.focus(); await editor.press('ControlOrMeta+a');
  if (text) {
    await page.evaluate(() => document.addEventListener('copy', event => {
      (window as Window & { auditCopy?: string }).auditCopy = event.clipboardData?.getData('text/plain') || '';
    }, { once: true }));
    await editor.press('ControlOrMeta+c');
    const copied = await page.evaluate(() => (window as Window & { auditCopy?: string }).auditCopy || '');
    expect(Buffer.byteLength(copied)).toBe(file.byteSize);
    expect(createHash('sha256').update(copied).digest('hex')).toBe(file.sha256);
  } else await expect(editor).toHaveText('');
  expect(fixture.workspace.saves).toHaveLength(0); expect(file.text).toBe(text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});


test('a file above the text limit keeps its original download without creating an editor', async ({ page }) => {
  const fixture = await installWorkspaceFixture(page);
  const bytes = Buffer.from('x'.repeat(1024 * 1024 + 1));
  const file = fixture.workspace.files[0];
  Object.assign(file, { path: 'docs/oversize.txt', byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  await page.route(`**/api/workspace/projects/*/files/${file.id}/content`, route => route.fulfill({ status: 413, json: { ok: false, error: { code: 'WORKSPACE_TEXT_TOO_LARGE' } } }));
  await page.route(`**${file.url}`, route => route.fulfill({ body: bytes, contentType: 'text/plain' }));
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/artigen/agent/runs/${inputRunId}`);
  await openDocument(page, 'oversize.txt');
  await expect(page.locator('.binary-preview')).toContainText('此文件暂不支持在线预览');
  await expect(page.locator('.cm-content')).toHaveCount(0);
  const pending = page.waitForEvent('download'); await page.locator('.binary-download').click();
  const download = await pending; expect(download.suggestedFilename()).toBe('oversize.txt');
  const path = await download.path(); expect(path).not.toBeNull();
  const original = await readFile(path!); expect(original.length).toBe(bytes.length);
  expect(createHash('sha256').update(original).digest('hex')).toBe(file.sha256);
  await download.delete(); expect(fixture.workspace.saves).toHaveLength(0);
});

for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
  test(`shared native selects fit long browser profiles and project forms ${theme} ${width}`, async ({ page }) => {
    test.setTimeout(40_000);
    const fixture = await installWorkspaceFixture(page, theme);
    await page.route('**/api/agent-browser-profiles', route => route.fulfill({ json: { ok: true, profiles: [{ profileId: 'profile-fixture', label: '品牌网站已保存的审查会话'.repeat(10), siteOrigin: 'https://brand.example', lastUsedAt: null, createdAt: '2026-10-15T03:00:00Z', expiresAt: '2099-10-15T03:00:00Z' }] } }));
    await page.setViewportSize({ width, height: 844 }); await page.goto('/artigen/agent');
    await expect(page.locator('.workspace-topbar')).toBeVisible();
    const nav = page.getByRole('navigation', { name: '资源面板', exact: true });
    if (width < 1440) await page.getByRole('button', { name: '打开检查器', exact: true }).click();
    await nav.getByRole('button', { name: '任务', exact: true }).click();
    await page.getByRole('tab', { name: '环境', exact: true }).click();
    await page.locator('.workspace-right').getByText('运行设置', { exact: true }).click();
    await page.locator('input[name="capability-browser"]').check();
    const profile = page.getByRole('combobox', { name: '恢复已保存的会话', exact: true });
    await profile.selectOption('profile-fixture'); await expect(profile).toHaveValue('profile-fixture');
    await expect(page.locator('#agent-allowed-origins')).toHaveValue('https://brand.example');
    await profile.focus(); await expect(profile).toBeFocused();
    const metrics = await profile.evaluate(element => {
      const r = element.getBoundingClientRect(), s = getComputedStyle(element);
      return { height: r.height, font: s.fontSize, color: s.color, background: s.backgroundColor, border: s.borderRadius, hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
    });
    expect(metrics.height).toBeGreaterThanOrEqual(width === 390 ? 44 : 36); expect(metrics.hit).toBe(true);
    const capture = process.env.ARTIGEN_UI_EXTRA;
    if (capture) await page.screenshot({ path: `${capture}/profile-${theme}-${width}.png`, animations: 'disabled' });
    await page.goto(`/artigen/agent/runs/${inputRunId}`); await expect(page.locator('.workspace-topbar')).toBeVisible();
    if (width < 1440) await page.getByRole('button', { name: '打开历史', exact: true }).click();
    const edit = page.getByRole('button', { name: '编辑会话 首页体验研究', exact: true }); await edit.click();
    const form = page.getByRole('form', { name: '编辑会话', exact: true });
    const project = form.getByRole('combobox'); await project.focus(); await expect(project).toBeFocused();
    expect(await project.evaluate(element => {
      const r = element.getBoundingClientRect(), s = getComputedStyle(element);
      return { height: r.height, font: s.fontSize, color: s.color, background: s.backgroundColor, border: s.borderRadius, hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
    })).toEqual(metrics);
    await project.selectOption({ label: '夏日视觉' });
    if (capture) await page.screenshot({ path: `${capture}/project-${theme}-${width}.png`, animations: 'disabled' });
    await form.getByRole('button', { name: '取消', exact: true }).click(); await expect(form).toHaveCount(0);
    expect(fixture.workspace.saves).toHaveLength(0); expect(fixture.state.quotes).toHaveLength(0); expect(fixture.state.creates).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
