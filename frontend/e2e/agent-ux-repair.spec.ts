import path from 'node:path';
import { test, expect } from '@playwright/test';
import { installAgentUxFixture, uxRunId, uxProjectId, uxUserId } from './helpers/agentUxFixture';
const runPath = `/artigen/agent/runs/${uxRunId}`;
const outputs = process.env.ARTIGEN_UX_SCREENSHOTS;
const baseline = process.env.ARTIGEN_UX_BASELINE === '1';

test('UX screenshot baseline from unchanged dev source', async ({ page }) => {
  test.skip(!baseline || !outputs);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await installAgentUxFixture(page);
  await page.goto(runPath);
  await expect(page.locator('.user-message')).toBeVisible();
  await page.screenshot({ path: path.join(outputs!, 'before-workspace-dark.png') });
});

test('login baseline from unchanged dev source', async ({ page }) => {
  test.skip(!baseline || !outputs);
  await page.setViewportSize({ width: 1280, height: 960 });
  await installAgentUxFixture(page, { guest: true });
  await page.goto('/artigen');
  await page.locator('.login-btn').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: path.join(outputs!, 'before-login.png') });
});

test.describe('approved Agent workspace repairs', () => {
  test.skip(baseline);
  for (const width of [1280, 390]) test(`login offer is beside entry and hidden inside modal at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await installAgentUxFixture(page, { guest: true });
    await page.goto('/artigen');
    await expect(page.locator('.signup-offer')).toHaveText('新用户赠 175 点');
    const bubble = await page.locator('.signup-offer').boundingBox();
    expect(bubble!.x).toBeGreaterThanOrEqual(0); expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(width);
    if (outputs) await page.screenshot({ path: path.join(outputs, `after-login-entry-${width}.png`) });
    await page.locator('.login-entry .login-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.signup-offer')).toHaveCount(0);
    await expect(page.getByRole('dialog')).not.toContainText('注册赠送');
    await expect(page.getByRole('dialog')).not.toContainText('约可完成');
    if (outputs) await page.screenshot({ path: path.join(outputs, `after-login-modal-${width}.png`) });
  });
  test('an old account pause response cannot restore its run after account switch', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const state = await installAgentUxFixture(page, { offline: false, status: 'running' });
    let started = false;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/agent-runs/${uxRunId}/pause`, async route => {
      started = true; await gate; await route.fulfill({ json: { ok: true, run: { ...state.run, status: 'paused' } } });
    });
    await page.goto(runPath);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await page.route(`**/api/agent-runs/${uxRunId}`, route => route.fulfill({ status: 404, json: { error: { code: 'AGENT_RUN_NOT_FOUND' } } }));
    await page.route('**/api/agent-runs', route => route.fulfill({ json: { ok: true, runs: [] } }));
    await page.evaluate(() => { localStorage.setItem('app_user_id', 'other-verified-account'); window.dispatchEvent(new Event('app-auth-changed')); });
    await expect(page.locator('.run-load-state')).toContainText('任务暂时无法打开');
    release();
    await expect(page.locator('.user-message')).toHaveCount(0);
    await expect(page.locator('.history-run')).toHaveCount(0);
  });
  test('offline screenshot uses the same synthetic run as the unchanged baseline', async ({ page }) => {
    test.skip(!outputs);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await installAgentUxFixture(page);
    await page.goto(runPath);
    await expect(page.locator('.run-state')).toContainText('执行服务暂不可用');
    await expect(page.locator('.account-value')).toContainText('87.38');
    await page.screenshot({ path: path.join(outputs!, 'after-workspace-dark.png') });
  });
  test('truthful service state, real balance, user identity and compact controls', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const state = await installAgentUxFixture(page, { longTitle: true });
    await page.goto(runPath);
    await expect(page.locator('.run-state')).toContainText('执行服务暂不可用');
    await expect(page.locator('.workspace-account')).toContainText('可用 87.38 点');
    await expect(page.locator('.workspace-account')).toContainText('本次已用 <0.01 点');
    await expect(page.locator('.user-message header span')).toHaveText('用户 ux-accou');
    await expect(page.locator('.user-message header span')).toHaveAttribute('title', uxUserId);
    await expect(page.locator('.run-progress-panel')).toHaveCount(0);
    await expect(page.locator('.workspace-topbar')).not.toContainText('DEV');
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toHaveText('');
    state.offline = false;
    await page.getByRole('button', { name: '刷新状态', exact: true }).click();
    await expect(page.locator('.run-state')).toContainText('排队中');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(page.locator('.run-state')).toContainText('已暂停');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect(page.locator('.run-state')).toContainText('排队中');
    await page.getByLabel('更多任务操作', { exact: true }).click();
    await page.getByRole('button', { name: '结束任务并结算', exact: true }).click();
    expect(state.run.status).toBe('queued');
    await page.getByRole('button', { name: '确认结束并结算', exact: true }).click();
    await expect(page.locator('.workspace-account')).toContainText('可用 137.37 点');
    await expect(page.locator('.workspace-account')).toContainText('本次结算 <0.01 点');
  });
  test('attachment-only retry preserves the file, reuses upload and idempotency, and renders receipt', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const state = await installAgentUxFixture(page, { offline: false, status: 'running', inputFailure: true });
    await page.goto(runPath);
    await page.locator('input[type=file]').setInputFiles({ name: '品牌说明.txt', mimeType: 'text/plain', buffer: Buffer.from('保留真实附件，失败后重试。') });
    await expect(page.locator('.composer-box .send')).toBeEnabled();
    await page.locator('.composer-box .send').click();
    await expect(page.locator('.run-notice')).toContainText('没有发送成功');
    await expect(page.locator('.attachment-list')).toContainText('品牌说明.txt');
    await page.locator('.composer-box .send').click();
    await expect(page.locator('.attachment-list')).toHaveCount(0);
    expect(state.uploads).toBe(1); expect(state.inputs).toHaveLength(2);
    expect(state.inputs[0].inputId).toBe(state.inputs[1].inputId);
    expect(state.inputs[1].message).toBe('');
    await expect(page.locator('.message-attachments')).toContainText('品牌说明.txt');
    await expect(page.locator('.timeline-message.user')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.message-attachments')).toContainText('品牌说明.txt');
    await expect(page.locator('.timeline-message.user header span')).toContainText('用户 ux-accou');
  });
  test('upload failure preserves both draft and attachments for retry', async ({ page }) => {
    const state = await installAgentUxFixture(page, { offline: false, status: 'running', uploadFailure: true });
    await page.goto(runPath);
    await page.locator('textarea[name=agent-run-input]').fill('请读取这份附件。');
    await page.locator('input[type=file]').setInputFiles({ name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('brief') });
    await page.locator('.composer-box .send').click();
    await expect(page.locator('.run-notice')).toContainText('未全部上传成功');
    await expect(page.locator('textarea[name=agent-run-input]')).toHaveValue('请读取这份附件。');
    await expect(page.locator('.attachment-list')).toContainText('brief.txt');
    expect(state.inputs).toHaveLength(0);
    await page.locator('.composer-box .send').click();
    await expect(page.locator('.message-attachments')).toContainText('brief.txt');
    expect(state.inputs).toHaveLength(1);
  });
  test('wallet failure has retry and never pretends to be a zero balance', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const state = await installAgentUxFixture(page, { walletFailure: true });
    await page.goto(runPath);
    await expect(page.locator('.account-credit-error')).toContainText('余额暂时无法读取');
    await expect(page.locator('.workspace-account')).not.toContainText('可用 0');
    state.walletFailure = false;
    await page.locator('.account-credit-error button').click();
    await expect(page.locator('.workspace-account')).toContainText('可用 87.38 点');
  });
  test('project browsing is separate from confirmed association', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const state = await installAgentUxFixture(page);
    await page.goto(runPath);
    await expect(page.locator('.user-message')).toBeVisible();
    if (await page.getByRole('button', { name: '打开检查器', exact: true }).getAttribute('aria-expanded') !== 'true') await page.getByRole('button', { name: '打开检查器', exact: true }).click();
    await page.locator('.resource-mode').filter({ hasText: 'GitHub' }).click();
    await page.locator('.project-picker select').selectOption(uxProjectId);
    await expect(page.getByRole('button', { name: '关联仓库', exact: true })).toBeVisible();
    expect(state.run.projectId).toBeNull();
    await page.getByRole('button', { name: '将当前任务关联到此项目', exact: true }).click();
    expect(state.associations).toHaveLength(0);
    await page.getByRole('button', { name: '确认关联', exact: true }).click();
    await expect.poll(() => state.run.projectId).toBe(uxProjectId);
    expect(state.associations).toHaveLength(1);
  });
  test('desktop rail tooltips and keyboard resize remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await installAgentUxFixture(page); await page.goto(runPath);
    for (const name of ['项目与会话', '会话', '项目', '工具', '高级生图', 'GitHub', '账户设置']) {
      const entry = page.locator('.workspace-rail').getByLabel(name, { exact: true });
      await entry.focus(); await expect(page.getByRole('tooltip')).toContainText(name);
      await entry.press('Escape'); await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
    const separator = page.getByRole('separator', { name: '调整左栏宽度' });
    const before = Number(await separator.getAttribute('aria-valuenow'));
    await separator.focus(); await separator.press('ArrowRight');
    await expect(separator).not.toHaveAttribute('aria-valuenow', String(before));
  });
  for (const theme of ['dark', 'light']) for (const [label, width, height] of [['desktop', 1600, 1000], ['tablet', 768, 1024], ['mobile', 390, 844]] as const) {
    test(`layout ${theme} ${label}: multiline and attachments keep send bottom right`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await installAgentUxFixture(page, { theme, longTitle: true, offline: false, status: 'running' });
      await page.goto(runPath);
      await page.locator('textarea[name=agent-run-input]').fill('请沿用品牌说明，保留每个可编辑图层。\n'.repeat(12));
      await page.locator('input[type=file]').setInputFiles(Array.from({ length: 5 }, (_, i) => ({ name: `品牌说明与文件参考-${i + 1}.txt`, mimeType: 'text/plain', buffer: Buffer.from('reference') })));
      await expect(page.locator('.attachment-list > span')).toHaveCount(5);
      const geometry = await page.locator('.composer-box').evaluate(el => {
        const box = el.getBoundingClientRect(), send = el.querySelector('.send')!.getBoundingClientRect(), add = el.querySelector('.attach')!.getBoundingClientRect(), input = el.querySelector('textarea')!.getBoundingClientRect();
        return { right: box.right - send.right, bottom: box.bottom - send.bottom, row: Math.abs(add.bottom - send.bottom), afterInput: send.top >= input.bottom, inside: box.left >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1, overflow: document.documentElement.scrollWidth > innerWidth, animation: getComputedStyle(document.querySelector('.spinning')!).animationName };
      });
      expect(geometry).toMatchObject({ row: 0, afterInput: true, inside: true, overflow: false, animation: 'none' });
      expect(geometry.right).toBeLessThan(25); expect(geometry.bottom).toBeLessThan(25);
      if (outputs) await page.screenshot({ path: path.join(outputs, `after-workspace-${theme}-${label}.png`) });
      await page.getByLabel('更多任务操作', { exact: true }).click();
      const end = page.getByRole('button', { name: '结束任务并结算', exact: true });
      await expect(end).toBeVisible();
      expect(await end.evaluate(button => { const rect = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
      await page.getByLabel('更多任务操作', { exact: true }).press('Escape');
    });
  }
});
