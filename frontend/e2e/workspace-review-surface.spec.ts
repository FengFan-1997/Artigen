import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

async function fixture(page: Page, theme: string, long = false) {
  await installWorkspaceFixture(page, theme);
  if (long)
    await page.route('**/api/agent-runs/*/messages*', (r) =>
      r.fulfill({
        json: {
          messages: Array.from({ length: 30 }, (_, i) => ({
            id: `review-${i}`,
            role: 'assistant',
            kind: 'commentary',
            createdAt: `2026-10-15T03:${String(i).padStart(2, '0')}:00Z`,
            text: `## 第 ${i + 1} 轮检查\n\n已核对页面与购买流程。保留每次检查的证据、问题描述和后续修改建议。\n\n- 检查标题层级与按钮反馈\n- 比较窄屏布局与文件可读性\n- 保存结果并确认用户操作入口`
          })),
          nextCursor: null
        }
      })
    );
  await page.goto(`/artigen/agent/runs/${inputRunId}`);
  await expect(page.locator('.workspace-topbar')).toBeVisible();
}

async function resourceMode(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: '资源面板' });
  if (!(await nav.isVisible()))
    await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await nav.getByRole('button', { name, exact: true }).click();
}

async function source(page: Page) {
  await resourceMode(page, '文件');
  const tree = page.getByRole('complementary', { name: '文件目录' });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await expect(page.locator('.workspace-code-editor .cm-content')).toBeVisible();
}

async function change(page: Page) {
  const content = page.locator('.workspace-code-editor .cm-content');
  await content.press('ControlOrMeta+End');
  await page.keyboard.insertText(
    '\n\n## 新增结论\n优先修复移动端购买按钮，并保留用户已填写的内容。\n'
  );
  await resourceMode(page, '变更');
  await expect(page.locator('.changes-panel .added')).not.toHaveText('+0');
}

test('capture real review surfaces and scrolling at representative sizes', async ({ browser }) => {
  test.skip(!process.env.ARTIGEN_REVIEW_GALLERY, 'Explicit local screenshot capture');
  test.setTimeout(180_000);
  const dir = process.env.ARTIGEN_REVIEW_GALLERY!;
  await mkdir(dir, { recursive: true });
  const scenes = [
    ['01-light-source', 'light', 1920, 900, 'source'],
    ['02-dark-source', 'dark', 1920, 900, 'source'],
    ['03-light-diff', 'light', 1920, 900, 'diff'],
    ['04-dark-diff', 'dark', 1920, 900, 'diff'],
    ['05-light-identical', 'light', 1920, 900, 'identical'],
    ['06-dark-identical', 'dark', 1920, 900, 'identical'],
    ['07-mobile-diff', 'light', 390, 844, 'diff'],
    ['08-tablet-diff', 'dark', 1024, 768, 'diff'],
    ['09-light-scroll', 'light', 1920, 900, 'scroll'],
    ['10-dark-scroll', 'dark', 1440, 900, 'scroll']
  ] as const;
  for (const [id, theme, width, height, mode] of scenes) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await fixture(page, theme, mode === 'scroll');
    if (mode === 'scroll') {
      await page.locator('.conversation-scroll').evaluate((el) => {
        el.scrollTop = 600;
      });
    } else {
      await source(page);
      if (mode === 'diff') await change(page);
      if (mode === 'identical') await resourceMode(page, '变更');
      await expect(page.locator('.changes-panel,.workspace-code-editor').first()).toBeVisible();
    }
    await page.mouse.move(12, 12);
    await page.screenshot({ path: `${dir}/${id}.jpg`, type: 'jpeg', quality: 78 });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    await context.close();
  }
});

test('real differences have named versions and identical content is not painted as changed', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await fixture(page, 'light');
  await source(page);
  await resourceMode(page, '变更');
  await expect(page.locator('.diff-no-changes')).toBeVisible();
  await expect(page.locator('.file-toolbar')).toHaveCount(0);
  await expect(page.getByLabel('选择 Agent 候选文件')).toBeHidden();
  await page.getByText('比较来源', { exact: true }).click();
  await expect(page.getByLabel('选择 Agent 候选文件')).toBeVisible();
  await page.getByLabel('选择 Agent 候选文件').press('Escape');
  await expect(page.getByLabel('选择 Agent 候选文件')).toBeHidden();
  await expect(page.locator('.compare-source > summary')).toBeFocused();
  await expect(page.locator('.cm-mergeView')).toHaveCount(0);
  await resourceMode(page, '文件');
  await change(page);
  await expect(page.locator('.diff-labels')).toContainText('打开时版本');
  await expect(page.locator('.diff-labels')).toContainText('当前编辑');
  await expect(page.locator('.workspace-code-editor')).toHaveAttribute(
    'data-comparison-layout',
    'split'
  );
  await expect(page.locator('.cm-mergeView .cm-editor')).toHaveCount(2);
  await expect(page.locator('.cm-changedLine').first()).toBeVisible();
  await resourceMode(page, '文件');
  await expect(page.locator('.workspace-code-editor .cm-content')).toContainText('新增结论');
});

test('narrow reviews use one readable inline document and resizing keeps the draft', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, 'dark');
  await source(page);
  await change(page);
  const review = page.locator('.workspace-code-editor');
  await expect(review).toHaveAttribute('data-comparison-layout', 'inline');
  await expect(review.locator('.cm-editor')).toHaveCount(1);
  await expect(review.locator('.cm-chunkButtons')).toHaveCount(0);
  await expect(review).toContainText('新增结论');
  await page.getByText('比较来源', { exact: true }).click();
  const popup = await page.locator('.source-options').boundingBox();
  expect(popup!.x).toBeGreaterThanOrEqual(0);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(390);
  await page.getByLabel('选择 Agent 候选文件').press('Escape');
  await expect(page.getByLabel('选择 Agent 候选文件')).toBeHidden();
  await page.locator('.compare-source > summary').press('Escape');
  await expect(page.getByRole('navigation', { name: '资源面板' })).toBeHidden();
  await resourceMode(page, '变更');
  await page.setViewportSize({ width: 1920, height: 900 });
  await resourceMode(page, '变更');
  await page.locator('.right-resizer').press('End');
  await expect(review).toHaveAttribute('data-comparison-layout', 'split');
  await expect(review.locator('.cm-editor')).toHaveCount(2);
  await expect(review).toContainText('新增结论');
  await resourceMode(page, '文件');
  await expect(page.locator('.workspace-code-editor .cm-content')).toContainText('新增结论');
});
