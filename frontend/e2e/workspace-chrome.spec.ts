import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { installWorkspaceFixture, projectA } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';

const objective =
  '请读取参考资料，在当前项目中创建并交付 menu.csv 和 launch-notes.md。核验三行菜单、价格和 UTF-8 编码，交付前检查两份文件内容与 SHA-256。不要访问外部网站、不要生成图片、不要安装软件。';

test('capture workspace chrome across themes and panel states', async ({ browser }) => {
  test.skip(!process.env.ARTIGEN_CHROME_GALLERY, 'Explicit screenshot capture only');
  test.setTimeout(180_000);
  const root = process.env.ARTIGEN_CHROME_GALLERY!;
  await mkdir(root, { recursive: true });
  for (const scene of [
    { id: '01-light-default', width: 1920, height: 900, theme: 'light', open: false },
    { id: '02-light-resources', width: 1920, height: 900, theme: 'light', open: true },
    { id: '03-light-draft', width: 1920, height: 900, theme: 'light', open: true, draft: true },
    { id: '04-dark-resources', width: 1920, height: 900, theme: 'dark', open: true },
    { id: '05-light-file', width: 1920, height: 900, theme: 'light', open: true, file: true },
    { id: '06-desktop-run', width: 1440, height: 900, theme: 'dark', open: true, run: true },
    { id: '07-mobile-default', width: 390, height: 844, theme: 'light', open: false },
    { id: '08-mobile-files', width: 390, height: 844, theme: 'light', open: true, file: true },
    { id: '09-tablet-resources', width: 1024, height: 768, theme: 'dark', open: true },
    { id: '10-short-draft', width: 844, height: 390, theme: 'light', open: false, draft: true }
  ]) {
    const context = await browser.newContext({
      viewport: { width: scene.width, height: scene.height }
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await installWorkspaceFixture(page, scene.theme);
    await page.route('**/api/agent/status', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: {
            enabled: true,
            workerOnline: true,
            workerModelReady: true,
            browserReady: true,
            egressVerified: true,
            desktopRelayReady: true,
            subagentsEnabled: false
          }
        })
      })
    );
    await page.addInitScript(
      ({ open }) => {
        const pref = JSON.parse(localStorage.getItem('artigen-workspace-preferences') || '{}');
        delete pref.rightCollapsed;
        pref.inspectorVisibility = {};
        pref.resourceMode = 'files';
        if (open) pref.inspectorVisibility = { compose: false, task: false };
        localStorage.setItem('artigen-workspace-preferences', JSON.stringify(pref));
      },
      { open: scene.open }
    );
    await page.goto(
      scene.run ? `/artigen/agent/runs/${inputRunId}` : `/artigen/agent?projectId=${projectA}`
    );
    await expect(page.locator('.workspace-topbar')).toBeVisible();
    if (!scene.run)
      await expect(page.getByRole('textbox', { name: '任务目标', exact: true })).toBeVisible();
    if (scene.draft) {
      await page.getByRole('textbox', { name: '任务目标', exact: true }).fill(objective);
      await expect(page.getByRole('button', { name: '发送任务目标', exact: true })).toBeEnabled();
    }
    if (scene.open) {
      if (scene.width < 1440)
        await page.getByRole('button', { name: '打开检查器', exact: true }).click();
      const nav = page.getByRole('navigation', { name: '资源面板' });
      await expect(nav).toBeVisible();
      await nav.getByRole('button', { name: '文件', exact: true }).click();
      await expect(page.getByRole('complementary', { name: '文件目录' })).toBeVisible();
      if (scene.file) {
        const tree = page.getByRole('complementary', { name: '文件目录' });
        await tree.getByRole('button', { name: 'docs', exact: true }).click();
        await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
        await expect(page.locator('.document-preview')).toContainText('品牌网站审查');
      }
    }
    await expect(page.getByText('Worker 离线', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${root}/${scene.id}.jpg`, type: 'jpeg', quality: 78 });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      scene.width
    );
    await context.close();
  }
});

async function chromeFixture(page: Page, preferences: Record<string, unknown> = {}) {
  await installWorkspaceFixture(page, 'light');
  await page.addInitScript(
    (pref) => localStorage.setItem('artigen-workspace-preferences', JSON.stringify(pref)),
    {
      version: 4,
      theme: 'light',
      resourceMode: 'files',
      ...preferences
    }
  );
  await page.route('**/api/agent/status', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        status: {
          enabled: true,
          workerOnline: true,
          workerModelReady: true,
          subagentsEnabled: false
        }
      })
    })
  );
}

test('legacy open task panel does not reopen an empty composer; explicit choices stay scoped', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await chromeFixture(page, { version: 3, rightCollapsed: false });
  await page.goto(`/artigen/agent?projectId=${projectA}`);
  const shell = page.locator('.agent-workspace-shell');
  await expect(shell).toHaveClass(/right-collapsed/);
  await expect(page.locator('.task-meta')).toHaveCount(0);
  const open = page.getByRole('button', { name: '打开检查器', exact: true });
  await open.click();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: '关闭资源区', exact: true }).click();
  await expect(open).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('artigen-workspace-preferences')!).inspectorVisibility
      )
    )
    .toEqual({ task: false, compose: true });
  await page.locator(`a[href="/artigen/agent/runs/${inputRunId}"]`).click();
  await expect(shell).not.toHaveClass(/right-collapsed/);
  await page.getByRole('button', { name: /新任务/ }).click();
  await expect(page.getByRole('textbox', { name: '任务目标', exact: true })).toBeVisible();
  await expect(shell).toHaveClass(/right-collapsed/);
});

test('shared header, directory focus and pointer versus keyboard focus remain usable', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await chromeFixture(page, { inspectorVisibility: { compose: false, task: false } });
  await page.goto(`/artigen/agent?projectId=${projectA}`);
  const nav = page.getByRole('navigation', { name: '资源面板' });
  await expect(nav).toBeVisible();
  const headerSizes = await page
    .locator('.workspace-brand,.workspace-topbar,.resource-tabs')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top, height: r.height };
      })
    );
  expect(headerSizes).toHaveLength(3);
  expect(headerSizes.every((r) => r.top === 0 && r.height === 56)).toBeTruthy();
  await expect(page.locator('.file-tabs-bar')).toHaveCount(0);
  await nav.getByRole('button', { name: '文件', exact: true }).click();
  await expect(nav.getByRole('button', { name: '文件', exact: true })).toHaveCSS(
    'outline-style',
    'none'
  );
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('button', { name: '变更', exact: true })).toBeFocused();
  await expect(nav.getByRole('button', { name: '变更', exact: true })).toHaveCSS(
    'outline-color',
    'rgb(66, 100, 0)'
  );
  const tree = page.getByRole('complementary', { name: '文件目录' });
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await tree.getByRole('button', { name: 'brief.md', exact: true }).click();
  await expect(page.locator('.document-preview')).toContainText('品牌网站审查');
  const tab = page.getByRole('tab', { name: 'brief.md', exact: true });
  await tab.focus();
  await tab.press('Delete');
  await expect(page.getByRole('button', { name: /目录树/, exact: false })).toBeFocused();
  await expect(page.locator('.file-tabs-bar')).toHaveCount(0);
});

test('draft and attachment actions keep the primary input clear and sendable', async ({ page }) => {
  await chromeFixture(page);
  await page.goto(`/artigen/agent?projectId=${projectA}`);
  const suggestions = page.getByLabel('任务建议');
  await expect(suggestions).toBeVisible();
  await suggestions.getByRole('button').first().click();
  await expect(suggestions).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发送任务目标', exact: true })).toBeEnabled();
  const input = page.getByRole('textbox', { name: '任务目标', exact: true });
  await input.fill('');
  await expect(suggestions).toBeVisible();
  await input.fill(objective.repeat(15));
  await expect(suggestions).toHaveCount(0);
  await expect(page.locator('.composer-box')).toHaveCSS('outline-color', 'rgb(66, 100, 0)');
  await expect(input).toHaveCSS('outline-style', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('offline status remains visible instead of being hidden with the ready state', async ({
  page
}) => {
  await chromeFixture(page);
  await page.route('**/api/agent/status', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, status: { enabled: true, workerOnline: false } })
    })
  );
  await page.goto('/artigen/agent');
  await expect(page.locator('.task-meta')).toContainText('Worker 离线');
});

test('collapsed desktop panels occupy zero width including their functional borders', async ({
  page
}) => {
  await page.setViewportSize({ width: 1920, height: 960 });
  await chromeFixture(page);
  await page.goto('/artigen/agent');
  const width = (selector: string) =>
    page.locator(selector).evaluate((el) => el.getBoundingClientRect().width);
  await expect.poll(() => width('.workspace-right')).toBe(0);
  await page.getByRole('button', { name: '折叠左栏', exact: true }).click();
  await expect.poll(() => width('.workspace-left')).toBe(0);
  await page.getByRole('button', { name: '展开左栏', exact: true }).click();
  await expect.poll(() => width('.workspace-left')).toBeGreaterThan(216);
  await page.getByRole('button', { name: '打开检查器', exact: true }).click();
  await expect.poll(() => width('.workspace-right')).toBeGreaterThan(400);
  await page.getByRole('button', { name: '关闭资源区', exact: true }).click();
  await expect.poll(() => width('.workspace-right')).toBe(0);
});
