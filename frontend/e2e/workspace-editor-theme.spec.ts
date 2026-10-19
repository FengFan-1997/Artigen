import { editorTokenContrast } from './helpers/editorContrast';
import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

const examples = {
  json: JSON.stringify(
    {
      project: 'Artigen 工作空间',
      environment: 'development',
      features: { files: true, editor: true },
      budget: 10,
      files: ['menu.csv', 'launch-notes.md'],
      verified: null
    },
    null,
    2
  ),
  ts: '// Keep real work in the same project.\ninterface Project { name: string; budget: number }\nexport async function run(project: Project): Promise<string> {\n  const message = `开始任务：${project.name}`;\n  return project.budget > 0 ? message : "预算不足";\n}\n',
  md: '# 网站体验审查\n\n保留用户填写的内容，再开始下一步。\n\n| 页面 | 结果 |\n| --- | --- |\n| 首页 | 按钮清晰 |\n| 文件 | 可以继续编辑 |\n\n> 每次修改都有记录。\n\n```ts\nconst ready = true;\n```\n',
  html: '<!doctype html>\n<html lang="zh-CN">\n  <head><title>Artigen 工作空间</title></head>\n  <body>\n    <main class="workspace"><h1>继续你的项目</h1></main>\n  </body>\n</html>\n',
  css: '/* Shared workspace surfaces */\n.workspace {\n  display: grid;\n  grid-template-columns: 280px minmax(0, 1fr);\n  color: #e8e8e8;\n  gap: 16px;\n}\n'
};

// Playwright ControlOrMeta follows the runner OS, but an emulated iPad uses Apple's
// editor keymap even on Linux. Drive the platform that the page actually exposes.
async function editorShortcut(page: Page, key: string) {
  const apple = await page.evaluate(
    () =>
      /Mac/.test(navigator.platform) ||
      (/Apple Computer/.test(navigator.vendor) &&
        (/Mobile\/\w+/.test(navigator.userAgent) || navigator.maxTouchPoints > 2))
  );
  return `${apple ? 'Meta' : 'Control'}+${key}`;
}

async function openEditor(
  page: Page,
  theme: string,
  language: keyof typeof examples = 'json',
  text = examples[language]
) {
  page.setDefaultTimeout(15_000);
  const fixture = await installWorkspaceFixture(page, theme);
  const file = fixture.workspace.files[0];
  Object.assign(file, {
    path: `docs/workspace.${language}`,
    text,
    byteSize: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex')
  });
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  await expect(page.locator('.workspace-topbar')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '资源面板' });
  if (
    !(await nav.isVisible()) ||
    (await page.locator('.workspace-right').boundingBox())!.width < 100
  )
    await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  await expect(page.getByRole('button', { name: 'docs', exact: true })).toBeVisible();
  await page.evaluate(
    (file) => window.dispatchEvent(new CustomEvent('workspace:open-file', { detail: file })),
    file
  );
  if (!(await page.getByRole('textbox', { name: '文件编辑器' }).isVisible()))
    await page.getByRole('button', { name: '源码', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '文件编辑器' })).toBeVisible();
  return fixture;
}
async function diff(page: Page, replaceFirstLine = false) {
  const content = page.getByRole('textbox', { name: '文件编辑器' });
  if (replaceFirstLine) {
    await content.press(await editorShortcut(page, 'Home'));
    await content.press('Shift+End');
    await page.keyboard.insertText('// 新增：保存上下文，并保留原有文件。');
  } else {
    await content.press(await editorShortcut(page, 'End'));
    await page.keyboard.insertText('\n// 新增：保存上下文，并保留原有文件。\n');
  }
  await page
    .getByRole('navigation', { name: '资源面板' })
    .getByRole('button', { name: '变更', exact: true })
    .click();
  await expect(page.locator('.workspace-diff-view [data-component="git-diff-view"]')).toBeVisible();
}
async function setFileTreeVisible(page: Page, visible: boolean) {
  const toggle = page.getByRole('button', { name: /^(显示|隐藏)目录树$/ });
  if ((await toggle.getAttribute('aria-pressed')) !== String(visible)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(visible));
}
async function cycleTheme(page: Page) {
  const rail = page.locator('.workspace-rail');
  const appearance = rail.getByRole('button', { name: /^外观：/ });
  if (await appearance.isVisible()) {
    await appearance.click();
    return;
  }
  await page.getByRole('button', { name: '打开历史', exact: true }).click();
  await page
    .getByRole('complementary', { name: '任务历史' })
    .getByRole('button', { name: /^外观：/ })
    .click();
  await page.getByRole('button', { name: '关闭历史', exact: true }).click();
}

test('capture paired upstream theme surfaces', async ({ browser }) => {
  test.skip(!process.env.ARTIGEN_EDITOR_GALLERY, 'Explicit local evidence capture');
  test.setTimeout(240_000);
  const output = process.env.ARTIGEN_EDITOR_GALLERY!;
  await mkdir(output, { recursive: true });
  const scenes = [
    ['01-dark-json', 'dark', 1920, 960, 'json', 'source'],
    ['02-light-json', 'light', 1920, 960, 'json', 'source'],
    ['03-dark-typescript', 'dark', 1440, 960, 'ts', 'source'],
    ['04-light-markdown', 'light', 1440, 960, 'md', 'source'],
    ['05-dark-html', 'dark', 1024, 768, 'html', 'source'],
    ['06-light-css', 'light', 768, 1024, 'css', 'source'],
    ['07-dark-phone', 'dark', 390, 844, 'json', 'source'],
    ['08-light-phone', 'light', 390, 844, 'json', 'source'],
    ['09-dark-split', 'dark', 1920, 960, 'ts', 'diff'],
    ['10-light-split', 'light', 1920, 960, 'ts', 'diff'],
    ['11-dark-compact-diff', 'dark', 1024, 768, 'ts', 'diff'],
    ['12-light-search', 'light', 1440, 960, 'json', 'search']
  ] as const;
  const records = [];
  for (const [id, theme, width, height, language, mode] of scenes) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openEditor(page, theme, language);
    if (mode === 'diff') {
      if (width >= 1440) await page.locator('.right-resizer').press('End');
    }
    const treeVisible = width === 768 || width === 1024 || (width >= 1440 && mode === 'diff');
    await setFileTreeVisible(page, treeVisible);
    if (mode === 'diff') {
      await diff(page);
    }
    if (mode === 'search')
      await page
        .getByRole('textbox', { name: '文件编辑器' })
        .press(await editorShortcut(page, 'f'));
    await page.mouse.move(0, 0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await page.screenshot({ path: `${output}/${id}.jpg`, type: 'jpeg', quality: 78 });
    await page
      .locator('.file-viewer')
      .screenshot({ path: `${output}/${id}-detail.jpg`, type: 'jpeg', quality: 82 });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    const diffMetrics =
      mode === 'diff'
        ? await page.locator('.workspace-diff-view').evaluate((element) => ({
            width: element.clientWidth,
            layout: element.getAttribute('data-comparison-layout')
          }))
        : undefined;
    if (diffMetrics) {
      const expectedLayout = diffMetrics.width < 720 ? 'inline' : 'split';
      await expect(page.locator('.workspace-diff-view')).toHaveAttribute(
        'data-comparison-layout',
        expectedLayout
      );
    }
    records.push({
      id,
      theme,
      width,
      height,
      language,
      mode,
      treeVisible,
      ...(diffMetrics ? { diffMetrics } : {}),
      data: 'synthetic API fixtures; actual Vue UI; no model or DEV evidence',
      contentSha256: createHash('sha256').update(examples[language]).digest('hex')
    });
    await context.close();
  }
  await writeFile(`${output}/scenes.json`, JSON.stringify(records, null, 2));
});

test('upstream theme follows shell without replacing the editable view or undo history', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 960 });
  await openEditor(page, 'dark');
  const content = page.getByRole('textbox', { name: '文件编辑器' });
  const original = await content.textContent();
  const identity = await content.elementHandle();
  await content.press(await editorShortcut(page, 'End'));
  await page.keyboard.insertText('\n编辑器状态保护');
  await cycleTheme(page);
  await expect(page.locator('.agent-workspace-shell')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await content.evaluate((node, before) => node === before, identity)).toBe(true);
  await expect(content).toContainText('编辑器状态保护');
  await content.press(await editorShortcut(page, 'z'));
  await expect(content).toHaveText(original!);
  await page.emulateMedia({ colorScheme: 'dark' });
  await cycleTheme(page); // light → system
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(13, 17, 23)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('theme changes preserve selection and scrolling in a large editable file', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 960 });
  const text =
    Array.from({ length: 5000 }, (_, index) => `// ${index}: ${'workspace '.repeat(18)}`).join(
      '\n'
    ) + 'END_OF_DOC';
  await openEditor(page, 'dark', 'ts', text);
  const content = page.getByRole('textbox', { name: '文件编辑器' });
  await content.press(await editorShortcut(page, 'End'));
  for (let i = 0; i < 'END_OF_DOC'.length; i++) await content.press('Shift+ArrowLeft');
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('END_OF_DOC');
  const scroller = page.locator('.cm-scroller');
  const editorElement = await content.elementHandle();
  await scroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const top = await scroller.evaluate((node) => node.scrollTop);
  expect(top).toBeGreaterThan(1000);
  // Programmatic activation changes the same Vue theme setting without moving focus away from
  // CodeMirror, so this isolates the theme compartment update from browser blur behavior.
  await page
    .locator('.workspace-rail')
    .getByRole('button', { name: /^外观：/ })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await content.evaluate((node, before) => node === before, editorElement)).toBe(true);
  await expect(content).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('END_OF_DOC');
  expect(Math.abs((await scroller.evaluate((node) => node.scrollTop)) - top)).toBeLessThan(3);
  await page.keyboard.insertText('// selection preserved');
  await expect(content).toContainText('// selection preserved');
  await expect(content).not.toContainText('END_OF_DOC');
  await content.press(await editorShortcut(page, 'z'));
  await expect(content).toContainText('END_OF_DOC');
});

test('readonly split and inline reviews use the upstream GitHub diff theme in both modes', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 960 });
  await openEditor(page, 'dark', 'ts');
  await page.locator('.right-resizer').press('End');
  await diff(page);
  const root = page.locator('.workspace-diff-view');
  const view = root.locator('[data-component="git-diff-view"]');
  await expect(root).toHaveAttribute('data-comparison-layout', 'split');
  await expect(view).toHaveAttribute('data-theme', 'dark');
  await expect(root.locator('.diff-line-old-content').first()).toBeVisible();
  await expect(root.locator('.diff-line-new-content').first()).toBeVisible();
  await cycleTheme(page);
  await expect(view).toHaveAttribute('data-theme', 'light');
  await expect(root.locator('[contenteditable=true]')).toHaveCount(0);
  await expect(root.locator('.cm-editor')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await expect(root).toHaveAttribute('data-comparison-layout', 'inline');
  await expect(view).toHaveAttribute('data-theme', 'light');
  // git-diff-view renders both layout variants; the inactive split pane stays in
  // the DOM for responsive resizing, so assert against the currently visible row.
  await expect(root.locator('.diff-line-content:visible').first()).toBeVisible();
  await expect(root.locator('[contenteditable=true]')).toHaveCount(0);
  await expect(root).toContainText('新增：保存上下文');
  // Close the resource drawer to reach appearance controls without bypassing its focus trap.
  await page.getByRole('button', { name: '关闭资源区', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: '打开历史', exact: true }).click();
  await page
    .getByRole('complementary', { name: '任务历史' })
    .getByRole('button', { name: /外观：/ })
    .click(); // light → system
  await page.getByRole('button', { name: '关闭历史', exact: true }).click();
  await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  // Finish a real paint before sampling either direction of a media-driven theme change.
  await page.screenshot();
  await expect(view).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.agent-workspace-shell')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  // Request an actual paint before inspecting media-induced styles (WebKit defers this).
  // No DOM/style mutation, editor remount or artificial theme override.
  await page.screenshot();
  await expect(view).toHaveAttribute('data-theme', 'light');
});

test('upstream search, replace, undo, save and conflict protection remain usable', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 960 });
  const fixture = await openEditor(page, 'light', 'ts');
  const content = page.getByRole('textbox', { name: '文件编辑器' });
  await content.press(await editorShortcut(page, 'f'));
  const search = page.locator('.cm-search');
  await expect(search).toBeVisible();
  await search.locator('input[name=search]').fill('预算不足');
  await search.locator('input[name=replace]').fill('请补充预算');
  await search.getByRole('button', { name: 'replace all', exact: true }).click();
  await search.locator('input[name=search]').press('Escape');
  await expect(content).toContainText('请补充预算');
  await content.press(await editorShortcut(page, 'z'));
  await expect(content).toContainText('预算不足');
  await content.press(await editorShortcut(page, 'Shift+z'));
  await expect(content).toContainText('请补充预算');
  await content.press(await editorShortcut(page, 's'));
  await expect.poll(() => fixture.workspace.saves.length).toBe(1);
  await expect(page.locator('.file-status')).toContainText('v2');
  fixture.workspace.conflict = true;
  await content.press(await editorShortcut(page, 'End'));
  await page.keyboard.insertText('\n// keep this draft on conflict');
  await content.press(await editorShortcut(page, 's'));
  await expect(page.locator('.resource-notice')).toContainText('文件已在其他位置修改');
  await expect(content).toContainText('keep this draft on conflict');
  expect(fixture.workspace.files[0].text).not.toContain('keep this draft on conflict');
});

test('upstream GitHub editor colors keep readable syntax in both themes', async ({ browser }) => {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await openEditor(page, theme, 'ts');
    const colors = await page.locator('.workspace-code-editor').evaluate(editorTokenContrast);
    expect(colors.length).toBeGreaterThan(2);
    expect(
      colors.filter((token) => token.ratio < 4.5),
      `${theme} editor tokens`
    ).toEqual([]);
    await context.close();
  }
});

test('empty files and long lines use local scroll without overflowing the page', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page, 'dark', 'ts', '');
  const content = page.getByRole('textbox', { name: '文件编辑器' });
  await content.fill('const title = "' + '文本'.repeat(2000) + '";');
  await expect(page.locator('.cm-scroller')).toBeVisible();
  const scrolling = await page
    .locator('.cm-scroller')
    .evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
  expect(scrolling.scroll).toBeGreaterThan(scrolling.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('GitHub diff lines use distinct upstream addition and deletion surfaces in light and dark themes', async ({
  browser
}) => {
  for (const theme of ['dark', 'light']) {
    for (const width of [1920, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      const page = await context.newPage();
      await openEditor(page, theme, 'ts');
      if (width === 1920) await page.locator('.right-resizer').press('End');
      await diff(page, true);
      const root = page.locator('.workspace-diff-view');
      const view = root.locator('[data-component="git-diff-view"]');
      await expect(view).toHaveAttribute('data-theme', theme);
      const surfaces = await root.evaluate((element) => {
        const color = (selector: string) => {
          const node = element.querySelector(`tr[data-state="diff"] ${selector}`);
          if (!node) return null;
          return getComputedStyle(node).backgroundColor;
        };
        return {
          deleted: color('.diff-line-old-content'),
          added: color('.diff-line-new-content'),
          content: element.textContent || ''
        };
      });
      expect(surfaces.content).toContain('新增：保存上下文');
      if (width >= 720) {
        expect(surfaces.deleted).not.toBeNull();
        expect(surfaces.added).not.toBeNull();
        expect(surfaces.deleted).not.toBe(surfaces.added);
      } else {
        await expect(
          root.locator('tr[data-state="diff"] .diff-line-content').first()
        ).toBeVisible();
      }
      await context.close();
    }
  }
});

test('GitHub inline diff keeps deleted text visible when the theme changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page, 'dark', 'ts', '// remove this comment\nconst keep = "value";\n');
  const content = page.getByRole('textbox', { name: '文件编辑器' });
  await content.press(await editorShortcut(page, 'a'));
  await page.keyboard.insertText('const keep = "value";\n');
  await page
    .getByRole('navigation', { name: '资源面板' })
    .getByRole('button', { name: '变更', exact: true })
    .click();
  const review = page.locator('.workspace-diff-view');
  const diffView = review.locator('[data-component="git-diff-view"]');
  await expect(review).toHaveAttribute('data-comparison-layout', 'inline');
  await expect(review).toContainText('remove this comment');
  await expect(diffView).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '关闭资源区', exact: true }).click();
  await cycleTheme(page);
  await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await expect(diffView).toHaveAttribute('data-theme', 'light');
  await expect(review).toContainText('remove this comment');
  await expect(review.locator('[contenteditable=true]')).toHaveCount(0);
});
