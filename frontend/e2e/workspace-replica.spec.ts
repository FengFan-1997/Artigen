import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { installWorkspaceFixture, projectA, projectB } from './helpers/workspaceReplicaFixtures';
import { activityEvents, inputRunId } from './helpers/agentInputFixtures';
const runPath = `/artigen/agent/runs/${inputRunId}`;
async function resources(page: Page, mode = '文件') {
  await expect(page.locator('.workspace-topbar')).toBeVisible();
  const navigation = page.getByRole('navigation', { name: '资源面板' });
  // Fixtures explicitly expand desktop resources; wait for mounting instead of
  // racing isVisible() and accidentally toggling an already-expanded panel.
  if ((page.viewportSize()?.width || 1440) < 1440 && !(await navigation.isVisible()))
    await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await expect(navigation).toBeVisible();
  await page
    .getByRole('navigation', { name: '资源面板' })
    .getByRole('button', { name: mode, exact: true })
    .click();
}
async function openBrief(page: Page) {
  await resources(page);
  const tree = page.getByRole('complementary', { name: '文件目录' });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await expect(page.locator('.file-toolbar')).toContainText('docs/brief.md');
}

for (const theme of ['dark', 'light']) {
  for (const width of [1440, 390]) {
    test(`file filtering explains empty results and clears before closing the inspector ${theme} ${width}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, isMobile: width === 390, hasTouch: width === 390 });
      try {
        const page = await context.newPage();
        await installWorkspaceFixture(page, theme);
        await page.goto(runPath);
        await resources(page);
        const tree = page.getByRole('complementary', { name: '文件目录' });
        const search = tree.getByRole('textbox', { name: '筛选文件', exact: true });
        await search.fill('not-a-matching-project-file');
        await page.mouse.move(0, 0);
        const capture = process.env.ARTIGEN_FILE_FILTER_CAPTURE;
        if (capture) {
          await page.screenshot({ path: `${capture}/${theme}-${width}.png`, animations: 'disabled' });
          await tree.screenshot({ path: `${capture}/${theme}-${width}-tree.png`, animations: 'disabled' });
        }
        await expect(tree.getByRole('status')).toContainText('没有匹配的项目文件');
        await expect(tree.getByRole('status')).toContainText('仅筛选已加载的项目文件');
        await search.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true, bubbles: true });
        await expect(search).toHaveValue('not-a-matching-project-file');
        await expect(tree).toBeVisible();
        await search.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 229, bubbles: true });
        await expect(search).toHaveValue('not-a-matching-project-file');
        await expect(tree).toBeVisible();
        await search.press('Escape');
        await expect(search).toHaveValue('');
        await expect(search).toBeFocused();
        await expect(tree).toBeVisible();
        await expect(tree.getByRole('button', { name: 'docs', exact: true })).toBeVisible();
        await search.fill('not-a-matching-project-file');
        const clear = tree.getByRole('button', { name: '清除文件筛选', exact: true });
        expect(await clear.evaluate((element) => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
        if (width === 390) { const rect = await clear.boundingBox(); expect(rect!.width).toBeGreaterThanOrEqual(44); expect(rect!.height).toBeGreaterThanOrEqual(44); }
        await clear.focus();
        await clear.press('Enter');
        await expect(search).toHaveValue('');
        await expect(search).toBeFocused();
        await expect(clear).toHaveCount(0);
        await expect(tree.getByRole('status')).toHaveCount(0);
        await expect(tree.getByRole('button', { name: 'docs', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
        if (width === 390) {
          await search.press('Escape');
          await expect(tree).toBeHidden();
          await expect(page.getByRole('button', { name: '打开检查器', exact: true })).toBeFocused();
        }
      } finally {
        await context.close();
      }
    });
  }
}

for (const theme of ['dark', 'light']) {
  for (const width of [1440, 390]) {
    test(`user bubbles share readable geometry for objectives and saved messages ${theme} ${width}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, isMobile: width === 390, hasTouch: width === 390 });
      try {
        const page = await context.newPage();
        const fixture = await installWorkspaceFixture(page, theme);
        const request = '请整理这次品牌发布的资料，检查标题层级、移动端布局和文件内容。\n保留原有输入与证据，完成后交付可以继续编辑的报告，不要只给一段结论。';
        fixture.state.run.objective = request;
        await page.route(`**/api/agent-runs/${inputRunId}/messages*`, (route) => route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, nextCursor: null, messages: [{ id: 'user-geometry', role: 'user', kind: 'text', text: request, createdAt: '2026-10-15T03:00:01Z' }] })
        }));
        await page.goto(runPath);
        const objective = page.locator('.conversation-scroll > .user-message');
        const saved = page.locator('.timeline-message.user');
        await expect(saved.locator('.workspace-markdown')).toContainText('不要只给一段结论');
        const area = page.locator('.conversation-scroll');
        await area.evaluate((element) => { element.scrollTop = 0; });
        await expect.poll(() => area.evaluate((element) => element.scrollTop)).toBe(0);
        await page.mouse.move(0, 0);
        const capture = process.env.ARTIGEN_USER_BUBBLE_CAPTURE;
        if (capture) {
          await page.screenshot({ path: `${capture}/${theme}-${width}-run.png`, animations: 'disabled' });
          await objective.screenshot({ path: `${capture}/${theme}-${width}-objective.png`, animations: 'disabled' });
        }
        for (const bubble of [objective, saved]) {
          const geometry = await bubble.evaluate((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return { radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius], padding: style.padding, right: rect.right, width: rect.width, overflow: element.scrollWidth > element.clientWidth + 1 };
          });
          expect.soft(geometry.radii).toEqual(['18px', '18px', '18px', '18px']);
          expect.soft(geometry.padding).toBe(width === 390 ? '12px 14px' : '14px 18px');
          expect.soft(geometry.overflow).toBe(false);
          expect.soft(geometry.width).toBeLessThanOrEqual(640);
          const parentRight = await area.evaluate((element) => element.getBoundingClientRect().right);
          expect.soft(Math.abs(geometry.right - parentRight)).toBeLessThanOrEqual(1);
        }
        const paragraph = saved.locator('.workspace-markdown > p').last();
        expect.soft(await paragraph.evaluate((element) => getComputedStyle(element).marginBottom)).toBe('0px');
        await expect(objective.locator('p')).toHaveText(request);
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as Window & { bubbleCopy?: string }).bubbleCopy = text; } } }));
        const copy = saved.getByRole('button', { name: '复制消息', exact: true });
        await copy.focus();
        await copy.press('Enter');
        expect(await page.evaluate(() => (window as Window & { bubbleCopy?: string }).bubbleCopy)).toBe(request);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
}

for (const theme of ['dark', 'light']) {
  for (const width of [1440, 1024, 390]) {
    test(`file view switch groups modes and preserves unsaved edits ${theme} ${width}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, isMobile: width === 390, hasTouch: width < 1440 });
      try {
        const page = await context.newPage();
        const { workspace } = await installWorkspaceFixture(page, theme);
        await page.goto(runPath);
        await openBrief(page);
        const toolbar = page.locator('.file-toolbar');
        const preview = toolbar.getByRole('button', { name: '预览', exact: true });
        const source = toolbar.getByRole('button', { name: '源码', exact: true });
        await expect(page.locator('.document-preview')).toContainText('品牌网站审查');
        await page.mouse.move(0, 0);
        const capture = width === 1024 ? '' : process.env.ARTIGEN_FILE_VIEW_CAPTURE;
        if (capture) await toolbar.screenshot({ path: `${capture}/${theme}-${width}-toolbar.png`, animations: 'disabled' });
        await source.click();
        const editor = page.getByRole('textbox', { name: '文件编辑器' });
        await expect(editor).toBeVisible();
        await page.mouse.move(0, 0);
        if (capture) await page.screenshot({ path: `${capture}/${theme}-${width}-source.png`, animations: 'disabled' });
        const group = toolbar.getByRole('group', { name: '文件显示方式' });
        await expect(group).toBeVisible({ timeout: 500 });
        await expect(group.getByRole('button')).toHaveCount(2);
        await expect(group.getByRole('button', { pressed: true })).toHaveCount(1);
        await expect(source).toHaveAttribute('aria-pressed', 'true');
        const [previewBox, sourceBox] = await Promise.all([preview.boundingBox(), source.boundingBox()]);
        expect(Math.abs(previewBox!.y + previewBox!.height / 2 - sourceBox!.y - sourceBox!.height / 2)).toBeLessThanOrEqual(0.5);
        expect(previewBox!.height).toBe(sourceBox!.height);
        if (width < 1440) {
          expect(sourceBox!.height).toBeGreaterThanOrEqual(44);
          expect(previewBox!.width).toBeGreaterThanOrEqual(44);
        }
        const [selected, inactive] = await Promise.all([
          source.evaluate((element) => getComputedStyle(element).backgroundColor),
          preview.evaluate((element) => getComputedStyle(element).backgroundColor)
        ]);
        expect(selected).not.toBe(inactive);
        expect(await source.evaluate((element) => Number(getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(500);
        await editor.fill('# 未保存的检查结果\n\n保留这段中文草稿。');
        await preview.focus();
        await preview.press('Enter');
        await expect(preview).toBeFocused();
        await expect(preview).toHaveAttribute('aria-pressed', 'true');
        await expect(group.getByRole('button', { pressed: true })).toHaveCount(1);
        await expect(page.locator('.document-preview')).toContainText('保留这段中文草稿。');
        await source.focus();
        await source.press('Space');
        await expect(source).toBeFocused();
        await expect(source).toHaveAttribute('aria-pressed', 'true');
        await expect(editor.locator('.cm-line')).toHaveText(['# 未保存的检查结果', '', '保留这段中文草稿。']);
        expect(await source.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return target !== null && element.contains(target);
        })).toBe(true);
        expect(workspace.saves).toHaveLength(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
}

for (const theme of ['dark', 'light']) {
  for (const width of [1440, 1024, 390]) {
    test(`technical disclosures use a quiet leading caret and unique targets ${theme} ${width}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, isMobile: width === 390, hasTouch: width < 1440 });
      try {
        const page = await context.newPage();
        await installWorkspaceFixture(page, theme);
        await page.goto('/artigen/agent');
        await resources(page, '任务');
        const summary = page.locator('.technical-details > summary').filter({ hasText: /^技术详情$/ });
        const panel = summary.locator('..');
        await expect(summary).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        const capture = width === 1024 ? '' : process.env.ARTIGEN_TECHNICAL_DISCLOSURE_CAPTURE;
        if (capture) await page.screenshot({ path: `${capture}/${theme}-${width}-closed.png`, animations: 'disabled' });
        await summary.click();
        await expect(summary).toHaveAttribute('aria-expanded', 'true');
        await expect(panel.locator('.technical-details-content')).toContainText('@cf/openai/gpt-oss-120b');
        await panel.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        if (capture) await page.screenshot({ path: `${capture}/${theme}-${width}-open.png`, animations: 'disabled' });
        const ids = await page.locator('.technical-details-content').evaluateAll((elements) => elements.map((element) => element.id));
        expect.soft(ids.length).toBeGreaterThanOrEqual(2);
        expect.soft(new Set(ids).size, 'each disclosure must own its content target').toBe(ids.length);
        expect.soft(await summary.locator(':scope > :first-child').getAttribute('class')).toContain('workspace-icon');
        expect.soft(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        const controls = await summary.getAttribute('aria-controls');
        expect.soft(await panel.locator('.technical-details-content').getAttribute('id')).toBe(controls);
        const alignment = await panel.evaluate((element) => {
          const label = element.querySelector('summary span')!.getBoundingClientRect();
          const content = element.querySelector('.technical-details-content')!;
          return Math.abs(label.left - content.getBoundingClientRect().left - parseFloat(getComputedStyle(content).paddingLeft));
        });
        expect.soft(alignment).toBeLessThanOrEqual(1);
        const size = await summary.boundingBox();
        if (width < 1440) expect.soft(size!.height).toBeGreaterThanOrEqual(44);
        await summary.focus();
        await summary.press('Space');
        await expect(summary).toHaveAttribute('aria-expanded', 'false');
        await expect(summary).toBeFocused();
        await expect(panel.locator('.technical-details-content')).toBeHidden();
        await summary.press('Enter');
        await expect(summary).toHaveAttribute('aria-expanded', 'true');
        await expect(panel.locator('.technical-details-content')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
}

for (const theme of ['dark', 'light']) {
  test(`narrow English file status keeps the save state together ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      const { workspace } = await installWorkspaceFixture(page, theme);
      await page.addInitScript(() => localStorage.setItem('app_lang', 'en'));
      await page.goto(runPath);
      await page.getByRole('button', { name: 'Open inspector', exact: true }).click();
      await page.getByRole('navigation', { name: 'Resources' }).getByRole('button', { name: 'Files', exact: true }).click();
      const tree = page.getByRole('complementary', { name: 'File explorer' });
      await tree.getByRole('button', { name: 'docs', exact: true }).click();
      await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
      await page.getByRole('button', { name: 'Source', exact: true }).click();
      await page.getByRole('textbox', { name: '文件编辑器' }).fill('# 保留未保存内容');
      const footer = page.locator('.file-status');
      await expect(footer).toContainText('Unsaved · v1');
      const stateLines = await footer.locator(':scope > span').evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size;
      });
      expect(stateLines).toBe(1);
      await expect(footer.getByRole('button', { name: 'Add to chat context' })).toBeDisabled();
      await expect(footer.getByRole('combobox', { name: 'View file versions' })).toBeVisible();
      expect(workspace.saves).toHaveLength(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } finally {
      await context.close();
    }
  });
}

test('capabilities expose enabled and disabled values without grant controls', async ({ page }) => {
  const { state } = await installWorkspaceFixture(page);
  state.run.capabilities = { browser: true, files: false, shell: true };
  await page.goto(runPath);
  await resources(page, '任务');
  await page.getByRole('tab', { name: '环境', exact: true }).click();
  const list = page.locator('dl.grant-list');
  await expect(list.locator('dt')).toHaveText(['网页操作', '文档与文件', '离线处理']);
  await expect(list.locator('dd')).toHaveText(['已启用', '未启用', '已启用']);
  await expect(list.locator('button,input,select')).toHaveCount(0);
  state.run.capabilities.files = true;
  await page.reload();
  await expect(list.locator('dd')).toHaveText(['已启用', '已启用', '已启用']);
  expect(state.inputs).toHaveLength(0);
  expect(state.quotes).toHaveLength(0);
});

test('project tree, file tabs, cloud save/conflict, proposals and read-only GitHub', async ({
  page
}) => {
  const { workspace } = await installWorkspaceFixture(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(runPath);
  await expect(page.getByText('夏日视觉', { exact: true })).toBeVisible();
  await expect(page.locator('.run-conversation-stream')).toContainText('本轮重点');
  await openBrief(page);
  await expect(page.locator('.document-preview')).toContainText('品牌网站审查');
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '文件编辑器' });
  await expect(editor).toBeVisible();
  await editor.fill('# 修改后的标题\n\n保存这份报告。');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('文件已保存');
  expect(workspace.saves).toHaveLength(1);
  workspace.conflict = true;
  await editor.fill('# 保留冲突草稿');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('文件已在其他位置修改');
  await expect(editor).toContainText('保留冲突草稿');
  workspace.conflict = false;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await resources(page, '变更');
  await page.getByLabel('选择 Agent 候选文件').selectOption('66666666-6666-4666-8666-666666666666');
  await expect(page.locator('.cm-mergeView')).toBeVisible();
  await page.getByRole('button', { name: '应用到当前文件', exact: true }).click();
  await expect(page.getByRole('button', { name: '撤销最近一次应用' })).toBeVisible();
  await page.getByRole('button', { name: '撤销最近一次应用' }).click();
  await resources(page, 'GitHub');
  await page.getByRole('button', { name: /完善首页按钮/ }).click();
  await page.getByText('src/Home.vue', { exact: false }).click();
  await expect(page.locator('.github-workspace pre')).toContainText('开始创作');
  expect(workspace.githubRequests.every((m) => m === 'GET')).toBe(true);
  expect(errors).toEqual([]);
});

for (const theme of ['dark', 'light']) {
  for (const width of [1440, 390]) {
    test(`file tabs preserve unsaved state and quiet close affordances ${theme} ${width}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, isMobile: width === 390, hasTouch: width === 390 });
      try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const { workspace } = await installWorkspaceFixture(page, theme);
      const name = 'brand-launch-review-and-delivery-checklist.md';
      workspace.files[0].path = `docs/${name}`;
      await page.goto(runPath);
      await resources(page);
      const tree = page.getByRole('complementary', { name: '文件目录' });
      await tree.getByRole('button', { name: 'docs', exact: true }).click();
      await tree.getByRole('button', { name, exact: true }).click();
      await page.getByRole('button', { name: '源码', exact: true }).click();
      const draft = '# 已检查首页\n\n这份修改尚未保存。';
      await page.getByRole('textbox', { name: '文件编辑器' }).fill(draft);
      if (!(await tree.isVisible())) await page.getByRole('button', { name: '显示目录树' }).click();
      await tree.getByRole('button', { name: 'src', exact: true }).click();
      await tree.getByRole('button', { name: 'theme.css', exact: true }).click();
      const tabs = page.getByRole('tablist', { name: '已打开文件' });
      const dirtyTab = tabs.getByRole('tab', { name: new RegExp(name) });
      const dirtyRow = dirtyTab.locator('..');
      const cleanTab = tabs.getByRole('tab', { name: 'theme.css', exact: true });
      await expect(cleanTab).toHaveAttribute('aria-selected', 'true');
      await page.mouse.move(0, 0);
      const capture = process.env.ARTIGEN_FILE_TABS_CAPTURE;
      if (capture) {
        await page.screenshot({ path: `${capture}/${theme}-${width}.png`, animations: 'disabled' });
        await page.locator('.file-tabs-bar').screenshot({ path: `${capture}/${theme}-${width}-detail.png`, animations: 'disabled' });
      }
      // Capture each unchanged baseline before asserting the new state contract.
      const activeClose = cleanTab.locator('..').getByRole('button', { name: '关闭 theme.css', exact: true });
      expect(await activeClose.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return rect.left >= 0 && rect.right <= innerWidth && hit !== null && element.contains(hit);
      })).toBe(true);
      await expect(dirtyTab).toHaveAttribute('title', `docs/${name}`);
      await expect(dirtyTab).toHaveAccessibleName(`${name}（未保存）`);
      await expect(dirtyRow.locator('.file-tab-dirty')).toBeVisible();
      const close = dirtyRow.getByRole('button', { name: new RegExp(`关闭 ${name}`) });
      const label = dirtyTab.locator('.file-tab-name');
      expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      const marker = await dirtyRow.locator('.file-tab-dirty').boundingBox();
      const closeBox = await close.boundingBox();
      expect(marker).not.toBeNull();
      expect(closeBox).not.toBeNull();
      expect(Math.abs(marker!.y + marker!.height / 2 - closeBox!.y - closeBox!.height / 2)).toBeLessThanOrEqual(0.5);
      if (width === 390) {
        expect(closeBox!.width).toBeGreaterThanOrEqual(44);
        expect(closeBox!.height).toBeGreaterThanOrEqual(44);
        expect(await close.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
      } else {
        expect(await close.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
        await dirtyTab.hover();
        expect(await close.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
        await expect(dirtyRow.locator('.file-tab-dirty')).toBeVisible();
      }
      // An inactive clean tab stays quiet, but keyboard focus reveals its close button.
      await dirtyTab.click();
      const cleanClose = cleanTab.locator('..').getByRole('button', { name: '关闭 theme.css', exact: true });
      await page.mouse.move(0, 0);
      if (width !== 390) expect(await cleanClose.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
      await cleanClose.focus();
      await expect(cleanClose).toBeFocused();
      expect(await cleanClose.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
      await cleanClose.press('Enter');
      await expect(tabs.getByRole('tab')).toHaveCount(1);
      await expect(dirtyTab).toBeFocused();
      await expect(page.getByRole('textbox', { name: '文件编辑器' }).locator('.cm-line')).toHaveText(draft.split('\n'));
      // Rejecting discard must retain both the file and its exact draft.
      page.once('dialog', (dialog) => dialog.dismiss());
      await dirtyTab.press('Delete');
      await expect(dirtyTab).toBeVisible();
      await expect(page.getByRole('textbox', { name: '文件编辑器' }).locator('.cm-line')).toHaveText(draft.split('\n'));
      page.once('dialog', (dialog) => dialog.accept());
      await close.focus();
      await close.press('Enter');
      await expect(tabs.getByRole('tab')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /目录树/ })).toBeFocused();
      expect(workspace.saves).toHaveLength(0);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
}

test('file tree separates folder disclosure from its icon and marks the active file', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installWorkspaceFixture(page);
  await page.goto(runPath);
  await expect(page.locator('.run-conversation-stream')).toContainText('本轮重点');
  await openBrief(page);

  const tree = page.getByRole('complementary', { name: '文件目录' });
  const folder = tree.getByRole('button', { name: 'docs', exact: true });
  const file = tree.getByRole('button', { name: 'brief.md', exact: true });

  await expect(folder).toHaveAttribute('aria-expanded', 'true');
  await expect(folder.locator('.workspace-icon')).toHaveCount(2);
  await expect(file).toHaveAttribute('aria-current', 'page');
  await expect(file.locator('.file-tree-caret')).toBeEmpty();
  await expect(file.locator('.file-tree-kind')).toBeVisible();
  expect(await file.evaluate((element) => getComputedStyle(element).display)).toBe('grid');
  const [activeIconColor, folderIconColor] = await Promise.all([
    file.locator('.file-tree-kind').evaluate((element) => getComputedStyle(element).color),
    folder.locator('.file-tree-kind').evaluate((element) => getComputedStyle(element).color)
  ]);
  expect(activeIconColor).not.toBe(folderIconColor);
});

test('selected project history item is visible and announced in light desktop and dark mobile history', async ({
  browser
}) => {
  for (const [theme, viewport] of [
    ['light', { width: 1440, height: 960 }],
    ['dark', { width: 390, height: 844 }]
  ] as const) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await installWorkspaceFixture(page, theme);
    await page.goto(runPath);
    if (viewport.width < 800) await page.getByRole('button', { name: '打开历史' }).click();

    const row = page.locator('.project-navigation .session-row.selected');
    const link = row.getByRole('link', { name: '整理网站审查报告' });
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(link).toHaveAttribute('title', '整理网站审查报告');
    expect(await link.evaluate((element) => getComputedStyle(element).fontWeight)).toBe('560');
    const [rowBackground, panelBackground] = await Promise.all([
      row.evaluate((element) => getComputedStyle(element).backgroundColor),
      page.locator('.workspace-left').evaluate((element) => getComputedStyle(element).backgroundColor)
    ]);
    expect(rowBackground).not.toBe(panelBackground);
    await context.close();
  }
});

test('Markdown table headings stay distinct in dark desktop and light mobile workspaces', async ({
  browser
}) => {
  for (const [theme, viewport] of [
    ['dark', { width: 1440, height: 960 }],
    ['light', { width: 390, height: 844 }]
  ] as const) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const fixture = await installWorkspaceFixture(page, theme);
    await page.goto(runPath);
    await fixture.emit();
    await openBrief(page);

    const table = page.locator('.document-preview .workspace-markdown table');
    const heading = table.locator('thead th').first();
    const cell = table.locator('tbody td').first();
    await expect(heading).toBeVisible();
    const styles = await heading.evaluate((element) => {
      const foreground = getComputedStyle(element).color;
      const background = getComputedStyle(element).backgroundColor;
      const bodyBackground = getComputedStyle(
        element.closest('table')!.querySelector('tbody td')!
      ).backgroundColor;
      const luminance = (color: string) => {
        const [r, g, b] = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return {
        background,
        bodyBackground,
        fontWeight: Number(getComputedStyle(element).fontWeight),
        contrast:
          (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      };
    });
    expect(styles.background).not.toBe(styles.bodyBackground);
    expect(styles.fontWeight).toBeGreaterThanOrEqual(600);
    expect(styles.contrast).toBeGreaterThanOrEqual(4.5);
    await expect(cell).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
    await context.close();
  }
});

test('Markdown code stays readable while long paths wrap and fenced lines scroll locally', async ({ browser }) => {
  const longPath = `projects/${'brand-launch-'.repeat(8)}report.md`;
  const command = 'const report = await generateReport({ projectId: "brand-launch", outputPath: "outputs/delivery/report.md", includeEvidence: true });';
  const text = ['# 文件与执行参数', '', '继续使用 `projectId` 和 `draftVersion` 关联本次任务。保存后运行 `pnpm run build`，再打开产物检查结果。', '', `产物路径：\`${longPath}\`。`, '', '```ts', command, '```', '', '代码中的空格和换行应保持原样；长代码行在代码区域内滚动。'].join('\n');
  for (const theme of ['dark', 'light']) {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const { workspace } = await installWorkspaceFixture(page, theme);
      Object.assign(workspace.files[0], { text, byteSize: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') });
      await page.goto(runPath);
      await openBrief(page);
      const markdown = page.locator('.document-preview .workspace-markdown');
      await expect(markdown).toContainText('文件与执行参数');
      await expect(markdown.locator('p code')).toHaveText(['projectId', 'draftVersion', 'pnpm run build', longPath]);
      const fenced = markdown.locator('pre code');
      expect(await fenced.textContent()).toBe(`${command}\n`);
      await page.mouse.move(0, 0);
      if (process.env.ARTIGEN_INLINE_CODE_CAPTURE) await page.screenshot({ path: `${process.env.ARTIGEN_INLINE_CODE_CAPTURE}/${theme}-${viewport.width}.png`, animations: 'disabled' });
      const pre = markdown.locator('pre');
      const scrollLeft = await pre.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        const offset = element.scrollLeft;
        element.scrollLeft = 0;
        return offset;
      });
      expect(scrollLeft).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const documentOverflow = await page.locator('.document-preview').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
      expect(documentOverflow).toBe(false);
      expect.soft(await fenced.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), `${theme} ${viewport.width}px fenced code must remain readable`).toBeGreaterThanOrEqual(12);
      await context.close();
    }
  }
});

test('image zoom controls remain reachable while the enlarged canvas scrolls', async ({ browser }) => {
  for (const theme of ['dark', 'light']) {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await installWorkspaceFixture(page, theme);
      await page.goto(runPath);
      await resources(page);
      const tree = page.getByRole('complementary', { name: '文件目录' });
      await tree.getByRole('button', { name: 'outputs', exact: true }).click();
      await tree.getByRole('button', { name: 'preview.png', exact: true }).click();
      const viewer = page.locator('.image-viewer');
      const image = viewer.locator('img');
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const increase = viewer.getByRole('button', { name: '放大图片', exact: true });
      const decrease = viewer.getByRole('button', { name: '缩小图片', exact: true });
      const reset = viewer.getByRole('button').nth(1);
      for (let i = 0; i < 12; i++) await increase.click();
      await expect(reset).toHaveText('400%');
      const canvas = viewer.locator('.image-canvas');
      const scroll = await canvas.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.scrollLeft = element.scrollWidth;
        return { top: element.scrollTop, left: element.scrollLeft };
      });
      expect(scroll.top).toBeGreaterThan(0);
      expect(scroll.left).toBeGreaterThan(0);
      await page.mouse.move(0, 0);
      if (process.env.ARTIGEN_IMAGE_ZOOM_CAPTURE) await page.screenshot({ path: `${process.env.ARTIGEN_IMAGE_ZOOM_CAPTURE}/${theme}-${viewport.width}.png`, animations: 'disabled' });
      const reachable = await reset.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      });
      expect.soft(reachable, `${theme} ${viewport.width}px zoom reset remains reachable after scrolling`).toBe(true);
      expect.soft(await increase.isDisabled(), '400% disables zoom in').toBe(true);
      await reset.click();
      await expect(reset).toHaveText('100%');
      await expect(reset).toHaveAccessibleName('适合宽度，当前 100%');
      await expect.poll(() => canvas.evaluate((element) => element.scrollLeft)).toBe(0);
      await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBe(0);
      for (let i = 0; i < 3; i++) await decrease.click();
      await expect(reset).toHaveText('25%');
      expect.soft(await decrease.isDisabled(), '25% disables zoom out').toBe(true);
      await reset.click();
      await expect(reset).toHaveText('100%');
      if (viewport.width < 800) for (const button of [increase, decrease, reset]) {
        const rect = await button.boundingBox();
        expect(rect!.width).toBeGreaterThanOrEqual(44);
        expect(rect!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await context.close();
    }
  }
});

test('GitHub record rows keep long titles compact with hover feedback and keyboard return', async ({ browser }) => {
  const title = '完善项目首页、移动端购买流程与登录后草稿恢复，保留用户上下文并补齐完整回归证据'.repeat(3);
  for (const theme of ['dark', 'light']) {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await installWorkspaceFixture(page, theme);
      const requests: string[] = [];
      await page.route('**/github/pulls?*', (route) => {
        requests.push(route.request().method());
        return route.fulfill({ json: { items: [
          { number: 12, title, state: 'open', url: 'https://github.com/example/brand-site/pull/12', updatedAt: '2026-10-15T03:00:10Z' },
          { number: 11, title: '修复移动端菜单与文件预览', state: 'closed', url: 'https://github.com/example/brand-site/pull/11', updatedAt: '2026-10-14T03:00:10Z' }
        ], hasMore: false } });
      });
      await page.goto(runPath);
      await resources(page, 'GitHub');
      const row = page.locator('.git-record').first();
      const heading = row.locator('b');
      await expect(heading).toHaveText(title);
      const idle = await row.evaluate((element) => getComputedStyle(element).backgroundColor);
      await row.hover();
      const hover = await row.evaluate((element) => getComputedStyle(element).backgroundColor);
      if (process.env.ARTIGEN_GITHUB_ROW_CAPTURE) await page.screenshot({ path: `${process.env.ARTIGEN_GITHUB_ROW_CAPTURE}/${theme}-${viewport.width}.png`, animations: 'disabled' });
      expect.soft(hover, `${theme} ${viewport.width}px record hover must be visible`).not.toBe(idle);
      expect.soft(await heading.getAttribute('title'), 'truncated record keeps complete native title').toBe(title);
      const geometry = await row.evaluate((element) => {
        const heading = element.querySelector('b')!;
        const icon = element.querySelector('svg')!.getBoundingClientRect();
        const text = heading.getBoundingClientRect();
        return { height: element.getBoundingClientRect().height, titleHeight: text.height, lineHeight: parseFloat(getComputedStyle(heading).lineHeight), alignment: Math.abs((icon.y + icon.height / 2) - (text.y + text.height / 2)) };
      });
      expect.soft(geometry.height).toBeLessThanOrEqual(68);
      expect.soft(geometry.titleHeight).toBeLessThanOrEqual(geometry.lineHeight + 1);
      expect.soft(geometry.alignment).toBeLessThanOrEqual(1);
      await row.focus();
      await expect(row).toBeFocused();
      await page.keyboard.press('Enter');
      const back = page.getByRole('button', { name: '返回记录', exact: true });
      await expect(back).toBeFocused();
      await back.click();
      await expect(page.locator('.git-record').first()).toBeFocused();
      expect(requests).toEqual(['GET']);
      await page.locator('.github-records nav').getByRole('button', { name: '提交', exact: true }).click();
      await expect(page.locator('.git-record b')).toHaveText(['修复登录后草稿恢复']);
      await expect(page.locator('.git-record small')).toContainText('aaaaaaaa');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (viewport.width < 800) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await context.close();
    }
  }
});

test('history search recovers from no results without closing the mobile drawer', async ({ browser }) => {
  for (const theme of ['dark', 'light']) {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await installWorkspaceFixture(page, theme);
      await page.goto(runPath);
      if (viewport.width < 1440) await page.getByRole('button', { name: '打开历史', exact: true }).click();
      const history = page.locator('#workspace-history-panel');
      const search = history.locator('input[name="workspace-search"]');
      await expect(search).toHaveAccessibleName('搜索任务');
      const current = history.getByRole('link', { name: '整理网站审查报告', exact: true });
      await expect(current).toBeVisible();
      await search.fill('没有匹配的任务');
      await expect(current).toHaveCount(0);
      await page.mouse.move(0, 0);
      if (process.env.ARTIGEN_HISTORY_SEARCH_CAPTURE) await page.screenshot({ path: `${process.env.ARTIGEN_HISTORY_SEARCH_CAPTURE}/${theme}-${viewport.width}.png`, animations: 'disabled' });
      expect.soft(await history.getByText('已加载内容中没有匹配项', { exact: true }).count()).toBe(1);
      const clear = history.getByRole('button', { name: '清除任务搜索', exact: true });
      expect.soft(await clear.count(), 'explicit accessible clear action exists').toBe(1);
      await expect(clear).toBeVisible();
      if (viewport.width < 800) {
        const rect = await clear.boundingBox();
        expect(rect!.width).toBeGreaterThanOrEqual(44);
        expect(rect!.height).toBeGreaterThanOrEqual(44);
      }
      await clear.click();
      await expect(search).toHaveValue('');
      await expect(search).toBeFocused();
      await expect(current).toBeVisible();
      await expect(clear).toHaveCount(0);
      await search.fill('另一个不存在的任务');
      await search.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true, bubbles: true });
      await expect(search).toHaveValue('另一个不存在的任务');
      await expect(search).toBeFocused();
      await search.press('Escape');
      expect.soft(await search.inputValue(), 'first Escape clears the search').toBe('');
      expect.soft(await search.evaluate((element) => document.activeElement === element), 'first Escape keeps search focus').toBe(true);
      expect.soft(await history.evaluate((element) => !element.inert), 'first Escape keeps history available').toBe(true);
      if (viewport.width < 1440) {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: '打开历史', exact: true })).toBeFocused();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await context.close();
    }
  }
});

test('run plan reads as a numbered checklist with aligned markers and a completion summary', async ({ browser }) => {
  const labels = ['阅读品牌资料并确认交付范围', '整理官网页面与竞品参考画面', '检查移动端从商品详情、购物车到确认订单的完整购买路径，并记录每个关键步骤的证据', '制作可编辑提案与设计说明', '验证报告和交付文件'];
  for (const theme of ['dark', 'light']) {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const fixture = await installWorkspaceFixture(page, theme);
      fixture.state.run.progress.plan = labels.map((label, index) => ({ label, status: index < 2 ? 'completed' : index === 2 ? 'in_progress' : 'pending' }));
      await page.goto(runPath);
      await fixture.emit();
      await resources(page, '任务');
      await page.getByRole('tab', { name: '计划', exact: true }).click();
      const panel = page.getByRole('tabpanel', { name: '计划', exact: true });
      const plan = panel.locator('.execution-plan');
      await expect(plan.locator('b').filter({ hasText: labels[0] })).toBeVisible();
      await page.mouse.move(0, 0);
      if (process.env.ARTIGEN_PLAN_LIST_CAPTURE) await page.screenshot({ path: `${process.env.ARTIGEN_PLAN_LIST_CAPTURE}/${theme}-${viewport.width}.png`, animations: 'disabled' });
      expect.soft(await plan.getByRole('list', { name: '执行计划', exact: true }).count(), 'plan has ordered list semantics').toBe(1);
      expect.soft(await plan.getByText('2 / 5 已完成', { exact: true }).count()).toBe(1);
      expect.soft(await plan.locator('.plan-marker .workspace-icon').count(), 'completed and current steps use shared icons').toBe(3);
      const current = plan.locator('[aria-current="step"]');
      expect.soft(await current.count(), 'current step is announced').toBe(1);
      await expect(current).toBeVisible();
      {
        await expect(current).toContainText(labels[2]);
        await expect(current).toContainText('正在执行');
        const alignment = await current.evaluate((element) => {
          const marker = element.querySelector('.plan-marker')!.getBoundingClientRect();
          const title = element.querySelector('b')!.getBoundingClientRect();
          return Math.abs(marker.y - title.y);
        });
        expect(alignment).toBeLessThanOrEqual(1);
      }
      const last = plan.locator('li').last();
      await expect(last).toContainText(labels[4]);
      await expect(last).toContainText('待执行');
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.locator('.audit-details > summary').click();
      await expect(page.locator('.audit-details article').first()).toBeVisible();
      await context.close();
    }
  }
});

test('stop confirmation stays explicit and readable without submitting before confirmation', async ({ browser }) => {
  for (const theme of ['dark', 'light']) {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const fixture = await installWorkspaceFixture(page, theme);
      let cancellations = 0;
      await page.route(`**/api/agent-runs/${inputRunId}/cancel`, (route) => {
        expect(route.request().method()).toBe('POST');
        cancellations++;
        fixture.state.run.status = 'cancelled';
        return route.fulfill({ json: { ok: true, run: fixture.state.run } });
      });
      await page.goto(runPath);
      await page.getByRole('button', { name: '停止', exact: true }).click();
      const confirm = page.getByRole('button', { name: '确认停止', exact: true });
      await expect(confirm).toBeVisible();
      expect(cancellations).toBe(0);
      await expect(page.locator('.run-notice')).toContainText('再次点击确认停止');
      await page.mouse.move(0, 0);
      if (process.env.ARTIGEN_STOP_CONFIRM_CAPTURE && viewport.width !== 360) await page.screenshot({ path: `${process.env.ARTIGEN_STOP_CONFIRM_CAPTURE}/${theme}-${viewport.width}.png`, animations: 'disabled' });
      expect.soft(await confirm.locator('span').isVisible(), `${theme} ${viewport.width}px confirmation must use visible words`).toBe(true);
      const contrast = await confirm.evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const foreground = luminance(style.color), background = luminance(style.backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
      expect.soft(contrast, `${theme} ${viewport.width}px confirm text contrast`).toBeGreaterThanOrEqual(4.5);
      expect(await confirm.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
      if (viewport.width < 800) {
        const rect = await confirm.boundingBox();
        expect(rect!.height).toBeGreaterThanOrEqual(44);
        expect(rect!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await confirm.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.run-ended-bar')).toContainText('任务已停止');
      expect(cancellations).toBe(1);
      await context.close();
    }
  }
});

for (const theme of ['dark', 'light']) {
  for (const width of [1440, 390]) {
    test(`conversation jump floats without shifting the composer ${theme} ${width}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, isMobile: width === 390, hasTouch: width === 390 });
      try {
        const page = await context.newPage();
        const fixture = await installWorkspaceFixture(page, theme);
        await page.route(`**/api/agent-runs/${inputRunId}/messages*`, (route) => route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, nextCursor: null, messages: Array.from({ length: 8 }, (_, index) => ({
            id: `jump-message-${index}`, role: 'assistant', kind: 'commentary',
            text: `## 第 ${index + 1} 轮检查\n\n已核对页面结构、文件内容与交付条件。保留当前工作成果，继续检查移动端布局。\n\n- 检查标题与操作的层级\n- 确保键盘可以完成所有操作\n- 保留任务范围和原有文件`,
            createdAt: new Date(Date.UTC(2026, 9, 15, 3, 0, index)).toISOString()
          })) })
        }));
        await page.goto(runPath);
        await expect(page.locator('.timeline-message')).toHaveCount(8);
        await expect(page.locator('.timeline-message').last()).toContainText('确保键盘可以完成所有操作');
        await page.evaluate(() => document.fonts.ready);
        const area = page.locator('.conversation-scroll');
        const composer = page.locator('.run-composer .composer-box');
        const input = page.getByRole('textbox', { name: '补充要求' });
        // Keep the composer untouched while a background update arrives.
        await area.evaluate((element) => { element.scrollTop = 240; });
        await expect.poll(() => area.evaluate((element) => element.scrollTop)).toBe(240);
        const before = await composer.boundingBox();
        const readingHeight = await area.evaluate((element) => element.clientHeight);
        const event = activityEvents(1)[0]!;
        await fixture.emit([{ ...event, eventId: '901', type: 'verification.started', summary: '开始核验交付文件。' }]);
        const jump = page.getByRole('button', { name: '有新内容 · 回到底部', exact: true });
        await expect(jump).toBeVisible();
        await page.mouse.move(0, 0);
        const capture = process.env.ARTIGEN_CONVERSATION_JUMP_CAPTURE;
        if (capture) {
          await page.screenshot({ path: `${capture}/${theme}-${width}.png`, animations: 'disabled' });
          const center = await page.locator('.workspace-main').boundingBox();
          await page.screenshot({ path: `${capture}/${theme}-${width}-detail.png`, clip: { x: center!.x, y: center!.y + center!.height - 300, width: center!.width, height: 300 }, animations: 'disabled' });
        }
        await expect(jump).toHaveCSS('position', 'absolute', { timeout: 500 });
        const after = await composer.boundingBox();
        expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
        expect(await area.evaluate((element) => element.clientHeight)).toBe(readingHeight);
        expect(await area.evaluate((element) => element.scrollTop)).toBe(240);
        await expect(jump.locator('.workspace-icon')).toBeVisible();
        const box = await jump.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(await jump.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return target !== null && element.contains(target);
        })).toBe(true);
        await jump.focus();
        await jump.press('Enter');
        await expect.poll(() => area.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(10);
        await expect(jump).toHaveCount(0);
        await area.evaluate((element) => { element.scrollTop = 240; });
        const plain = page.getByRole('button', { name: '回到底部', exact: true });
        await expect(plain).toBeVisible();
        await expect(plain.locator('span')).toHaveCount(0);
        const round = await plain.boundingBox();
        expect(round!.width).toBe(round!.height);
        if (capture) {
          const center = await page.locator('.workspace-main').boundingBox();
          await page.screenshot({ path: `${capture}/reading-${theme}-${width}.png`, clip: { x: center!.x, y: center!.y + center!.height - 300, width: center!.width, height: 300 }, animations: 'disabled' });
        }
        await plain.focus();
        await plain.press('Space');
        await expect(plain).toHaveCount(0);
        await expect(input).toHaveValue('');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
}

test('public run messages expose a keyboard and touch friendly copy action with honest feedback', async ({ page, browser }) => {
  await installWorkspaceFixture(page);
  await page.goto(runPath);
  const messages = page.locator('.run-conversation-stream .timeline-message.assistant');
  await expect(messages).toHaveCount(2);
  const copy = page.getByRole('button', { name: '复制消息' }).nth(1);
  await copy.focus();
  await expect(copy).toBeFocused();
  await expect.poll(() => copy.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copiedMessage?: string }).copiedMessage = text;
        }
      }
    });
  });
  await copy.click();
  await expect(page.locator('.copy-announcement')).toHaveText('消息已复制');
  expect(await page.evaluate(() => (window as Window & { copiedMessage?: string }).copiedMessage)).toBe(
    '已整理初稿。可以在右侧阅读 [审查报告](brief.md)，查看源码或对比下一版。\n\n| 优先级 | 问题 |\n| --- | --- |\n| P1 | 登录后恢复当前任务 |\n| P2 | 主按钮层级不清晰 |'
  );

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('clipboard denied'); } }
    });
  });
  await copy.click();
  await expect(page.locator('.copy-announcement')).toHaveText(
    '复制失败，请检查剪贴板权限后重试'
  );

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobileContext.newPage();
  await installWorkspaceFixture(mobilePage, 'light');
  await mobilePage.goto(runPath);
  const mobileCopy = mobilePage.getByRole('button', { name: '复制消息' }).first();
  await expect(mobileCopy).toBeVisible();
  const target = await mobileCopy.boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);
  await expect.poll(() => mobileCopy.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  await mobileContext.close();
});

test('project new chats keep project scope and account changes remove private messages', async ({
  page
}) => {
  await installWorkspaceFixture(page);
  await page.goto(runPath);
  await expect(page.locator('.run-conversation-stream')).toContainText('本轮重点');
  await page.route('**/api/agent-runs/*/messages*', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: '{"error":{"code":"FORBIDDEN"}}'
    })
  );
  await page.evaluate(() => {
    localStorage.setItem('app_user_id', 'other-fixture');
    window.dispatchEvent(new Event('app-auth-changed'));
  });
  await expect(page.locator('.timeline-message')).toHaveCount(0);
  await page.goto(`/artigen/create?projectId=${projectA}`);
  await page.locator('textarea').last().fill('项目A私有草稿');
  await page.goto(`/artigen/create?projectId=${projectB}`);
  await expect(page.locator('textarea').last()).not.toHaveValue('项目A私有草稿');
});

test('static HTML cannot navigate, execute script or retain active embeds', async ({ page }) => {
  await installWorkspaceFixture(page);
  await page.goto(runPath);
  const result = await page.evaluate(async () => {
    const { staticFileHtml } = await import('/src/agentImg/services/workspacePreview.ts');
    return staticFileHtml(
      '<meta http-equiv="refresh" content="0;url=https://evil.invalid"><script>parent.hacked=1</script><iframe src="https://evil.invalid"></iframe><a href="https://evil.invalid">go</a><h1>Safe content</h1>'
    );
  });
  expect(result).toContain('Safe content');
  expect(result).not.toContain('evil.invalid');
  expect(result).not.toContain('<script');
  expect(result).not.toContain('<iframe');
});
const scenes = [
  ['full', '完整三栏'],
  ['left-hidden', '隐藏项目栏'],
  ['right-hidden', '隐藏资源栏'],
  ['task', '任务与计划'],
  ['files', '项目目录'],
  ['markdown', 'Markdown预览'],
  ['editor', '文本编辑器'],
  ['diff', '文件差异'],
  ['github', 'GitHub真实结构'],
  ['tabs', '多文件标签'],
  ['light', '浅色主题'],
  ['mobile', '手机资源面板'],
  ['image', '图片预览'],
  ['create', '创建页'],
  ['workbench', 'Agent工作台'],
  ['mobile-editor', '手机编辑器']
];
test('capture actual before and after application surfaces', async ({ browser }) => {
  test.skip(!process.env.ARTIGEN_WORKSPACE_GALLERY, 'Explicit gallery capture only');
  test.setTimeout(240000);
  const dir = process.env.ARTIGEN_WORKSPACE_GALLERY!;
  await mkdir(dir, { recursive: true });
  for (const [side, base] of [
    ['before', 'http://127.0.0.1:51738'],
    ['after', 'http://127.0.0.1:51731']
  ])
    for (let i = 0; i < scenes.length; i++) {
      const [scene] = scenes[i];
      const context = await browser.newContext({
        viewport: scene.startsWith('mobile')
          ? { width: 390, height: 844 }
          : { width: 1680, height: 1050 }
      });
      const page = await context.newPage();
      const fixture = await installWorkspaceFixture(page, scene === 'light' ? 'light' : 'dark');
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(
        base +
          (scene === 'create'
            ? '/artigen/create'
            : scene === 'workbench'
              ? '/artigen/agent'
              : runPath)
      );
      await expect(page.locator('.agent-workspace-shell')).toBeVisible();
      await page.waitForTimeout(180);
      if (!['create', 'workbench'].includes(scene)) await fixture.emit();
      if (side === 'after') {
        if (['full', 'markdown', 'editor', 'diff', 'tabs', 'mobile-editor'].includes(scene)) {
          await openBrief(page);
          if (scene === 'editor' || scene === 'mobile-editor')
            await page.getByRole('button', { name: '源码', exact: true }).click();
          if (scene === 'diff') {
            await resources(page, '变更');
            await page
              .getByLabel('选择 Agent 候选文件')
              .selectOption('66666666-6666-4666-8666-666666666666');
            await expect(page.locator('.cm-mergeView')).toBeVisible();
          }
          if (scene === 'tabs') {
            const show = page.getByRole('button', { name: '显示目录树' });
            if (await show.isVisible()) await show.click();
            const tree = page.getByRole('complementary', { name: '文件目录' });
            await tree.getByRole('button', { name: 'src', exact: true }).click();
            await tree.getByRole('button', { name: 'theme.css', exact: true }).click();
          }
        } else if (scene === 'image') {
          await resources(page);
          const tree = page.getByRole('complementary', { name: '文件目录' });
          await tree.getByRole('button', { name: 'outputs', exact: true }).click();
          await tree.getByRole('button', { name: 'preview.png', exact: true }).click();
          await expect(page.locator('.image-viewer img')).toBeVisible();
        } else if (scene === 'left-hidden')
          await page.getByRole('button', { name: '折叠左栏', exact: true }).click();
        else if (scene === 'right-hidden')
          await page
            .getByRole('navigation', { name: '资源面板' })
            .getByRole('button', { name: '关闭资源区' })
            .click();
        else if (scene === 'github') {
          await resources(page, 'GitHub');
          await page.getByRole('button', { name: /完善首页按钮/ }).click();
          await page.getByText('src/Home.vue', { exact: false }).click();
        } else if (scene === 'task') await resources(page, '任务');
        else await resources(page);
      } else {
        if (scene === 'left-hidden')
          await page.getByRole('button', { name: '折叠左栏', exact: true }).click();
        if (!['full', 'task', 'left-hidden', 'right-hidden'].includes(scene)) {
          const tab = page.getByRole('tab', { name: '文件', exact: false });
          if (await tab.isVisible()) await tab.click();
        }
        if (scene === 'right-hidden') {
          const button = page.getByRole('button', { name: '收起右栏', exact: true });
          if (await button.isVisible()) await button.click();
        }
      }
      await page.waitForTimeout(200);
      if (side === 'after') {
        expect(errors).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true);
      }
      await page.screenshot({
        path: `${dir}/${String(i + 1).padStart(2, '0')}-${scene}-${side}.jpg`,
        type: 'jpeg',
        quality: 68
      });
      await context.close();
    }
});

test('PDF preview uses the real PDF.js worker and releases its tab cleanly', async ({ page }) => {
  await installWorkspaceFixture(page);
  await page.goto(runPath);
  await resources(page);
  const tree = page.getByRole('complementary', { name: '文件目录' });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'report.pdf', exact: true }).click();
  await expect(page.locator('.pdf-controls')).toContainText('1 / 1');
  await expect
    .poll(() =>
      page.locator('.pdf-document canvas').evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4)
          if (data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] < 300) return true;
        return false;
      })
    )
    .toBe(true);
  await page.getByRole('button', { name: '关闭 report.pdf' }).click();
  await expect(page.locator('.pdf-document')).toHaveCount(0);
});

test('PDF page controls show the count, touch sizing and single-page bounds', async ({ page }) => {
  await installWorkspaceFixture(page, page.viewportSize()!.width < 600 ? 'light' : 'dark');
  await page.goto(runPath);
  await resources(page);
  const tree = page.getByRole('complementary', { name: '文件目录' });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'report.pdf', exact: true }).click();
  const controls = page.getByRole('group', { name: 'PDF 页面导航' });
  await expect(controls.locator('output')).toHaveText('1 / 1');
  await expect(controls.getByRole('button', { name: '上一页' })).toBeDisabled();
  await expect(controls.getByRole('button', { name: '下一页' })).toBeDisabled();
  await expect(controls.locator('.pdf-page-step').first()).toHaveCSS(
    'width',
    page.viewportSize()!.width < 600 ? '44px' : '32px'
  );
  await expect(page.locator('.pdf-document canvas')).toBeVisible();

  const gallery =
    page.viewportSize()!.width >= 600 ? process.env.ARTIGEN_PDF_GALLERY_DIR : undefined;
  if (gallery) {
    await mkdir(`${gallery}/${process.env.ARTIGEN_PDF_GALLERY_SIDE || 'after'}`, {
      recursive: true
    });
    await page.locator('.pdf-document').screenshot({
      path: `${gallery}/${process.env.ARTIGEN_PDF_GALLERY_SIDE || 'after'}/pdf-page-controls.jpg`,
      type: 'jpeg',
      quality: 84
    });
  }
});

test('PDF preview failure does not present an invalid page count', async ({ page }) => {
  await installWorkspaceFixture(page);
  await page.route('**/api/assets/80000000-0000-4000-8000-000000000005', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: 'not a PDF' })
  );
  await page.goto(runPath);
  await resources(page);
  const tree = page.getByRole('complementary', { name: '文件目录' });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'report.pdf', exact: true }).click();

  const controls = page.getByRole('group', { name: 'PDF 页面导航' });
  await expect(page.locator('p[role="status"]')).toContainText('PDF 暂时无法预览');
  await expect(controls.locator('output')).toHaveAttribute('aria-label', 'PDF 预览不可用');
  await expect(controls.locator('output')).toHaveText('— / —');
  await expect(controls.getByRole('button', { name: '上一页' })).toBeDisabled();
  await expect(controls.getByRole('button', { name: '下一页' })).toBeDisabled();
});
test('a stale candidate cannot be applied to a different file', async ({ page }) => {
  const { workspace } = await installWorkspaceFixture(page);
  Object.assign(workspace.files[2], { editTarget: { id: 'another-file', sha256: 'a'.repeat(64) } });
  await page.goto(runPath);
  await openBrief(page);
  await resources(page, '变更');
  await page.getByLabel('选择 Agent 候选文件').selectOption('66666666-6666-4666-8666-666666666666');
  await expect(page.getByRole('status')).toContainText('候选基于另一个文件或旧版本');
  await expect(page.getByRole('button', { name: '应用到当前文件' })).toHaveCount(0);
  expect(workspace.saves).toHaveLength(0);
});
test('editing during a file save preserves and restores the newer draft', async ({ page }) => {
  const { workspace } = await installWorkspaceFixture(page);
  workspace.saveDelay = 300;
  await page.goto(runPath);
  await openBrief(page);
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '文件编辑器' });
  await editor.fill('submitted version');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => workspace.saves.length).toBe(1);
  await editor.fill('newer unsaved text');
  await expect(page.getByRole('status')).toContainText('文件已保存');
  await expect(editor).toContainText('newer unsaved text');
  await page.waitForTimeout(500);
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await openBrief(page);
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '文件编辑器' })).toContainText(
    'newer unsaved text'
  );
});

test('a project file enters a new chat once without uploading before send', async ({ page }) => {
  const { workspace } = await installWorkspaceFixture(page);
  await page.goto(runPath);
  await openBrief(page);
  await page.getByRole('button', { name: '加入会话上下文', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/artigen/create\\?projectId=${projectA}`));
  await expect(page.locator('.composer-box')).toContainText('brief.md');
  await expect(page.locator('textarea').last()).toHaveValue(/brief.md/);
  expect(workspace.saves).toHaveLength(0);
  // A duplicate file event is acknowledged and does not append a second reference.
  const accepted = await page.evaluate(
    async ({ projectA }) => {
      const attachment = {
        owner: localStorage.getItem('app_user_id'),
        project: projectA,
        file: new File(['# report'], 'report.md', { type: 'text/plain' }),
        reference: {
          source: 'local',
          id: 'fixture-report',
          name: 'report.md',
          projectId: projectA,
          sha256: 'a'.repeat(64)
        },
        accepted: false
      };
      window.dispatchEvent(new CustomEvent('workspace:attach-file', { detail: attachment }));
      const first = attachment.accepted;
      attachment.accepted = false;
      window.dispatchEvent(new CustomEvent('workspace:attach-file', { detail: attachment }));
      return [first, attachment.accepted];
    },
    { projectA }
  );
  expect(accepted).toEqual([true, true]);
  await expect(page.locator('.composer-box')).toContainText('report.md');
});

test('authorized inline images open a resource tab while external image sources stay blocked', async ({
  page,
  browser
}) => {
  const fixture = await installWorkspaceFixture(page);
  const image = fixture.workspace.files.find((file) => file.mimeType === 'image/png')!;
  fixture.state.run.artifacts.push({
    artifactId: image.id,
    assetId: image.assetId,
    parentArtifactId: null,
    role: 'image',
    filename: 'preview.png',
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    sha256: image.sha256,
    version: 1,
    verificationStatus: 'passed',
    verification: {},
    sources: [],
    costCredits: 0,
    url: image.url,
    expiresAt: '2099-10-15T03:00:00.000Z',
    createdAt: '2026-10-15T03:00:00.000Z'
  });
  let externalRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('blocked-image.invalid')) externalRequests++;
  });
  await page.route('**/api/agent-runs/*/messages*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            id: 'inline-fixture',
            role: 'assistant',
            kind: 'process',
            createdAt: '2026-10-15T03:01:00.000Z',
            text: '## 图片与文件一起交付\n\n![生成结果](preview.png)\n\n![外部图片](https://blocked-image.invalid/private.png)\n\n<script>window.injected = true</script>\n\n[不安全链接](javascript:alert(1))'
          }
        ],
        nextCursor: null
      })
    })
  );
  await page.goto(runPath);
  const inline = page.locator('.run-conversation-stream .inline-image img');
  await expect(inline).toBeVisible();
  await expect
    .poll(() => inline.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(externalRequests).toBe(0);
  expect(
    await page.evaluate(() => (window as Window & { injected?: boolean }).injected)
  ).toBeUndefined();
  await inline.click();
  await expect(page.locator('.image-viewer img')).toBeVisible();
  if (process.env.ARTIGEN_WORKSPACE_GALLERY) {
    const dir = process.env.ARTIGEN_WORKSPACE_GALLERY;
    await page.screenshot({ path: `${dir}/17-inline-image-after.jpg`, type: 'jpeg', quality: 68 });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const before = await context.newPage();
    const baseline = await installWorkspaceFixture(before);
    baseline.state.run.artifacts = fixture.state.run.artifacts;
    await before.goto('http://127.0.0.1:51738' + runPath);
    await expect(before.locator('.agent-workspace-shell')).toBeVisible();
    await before.screenshot({
      path: `${dir}/17-inline-image-before.jpg`,
      type: 'jpeg',
      quality: 68
    });
    await context.close();
  }
});
