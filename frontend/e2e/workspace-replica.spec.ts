import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
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
