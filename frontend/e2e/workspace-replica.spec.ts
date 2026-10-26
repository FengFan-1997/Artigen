import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { installWorkspaceFixture, projectA, projectB } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';
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
