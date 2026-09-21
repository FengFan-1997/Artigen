import { expect, test } from '@playwright/test';

test('restores the header account after refresh without navigating away', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('app_user_id', 'returning-user');
    localStorage.setItem('agent_user_id', 'returning-user');
    localStorage.setItem('app_lang', 'zh');
  });
  // All APIs stay local: this regression exercises session/UI synchronization only.
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200,
    json: { ok: true, items: [], projects: [], assets: [] }
  }));
  let releaseSession = () => {};
  const holdSession = () => new Promise<void>((resolve) => { releaseSession = resolve; });
  let sessionGate = holdSession();
  await page.route('**/api/auth/session', async (route) => {
    await sessionGate;
    await route.fulfill({ status: 200, json: {
      ok: true, authenticated: true, userId: 'returning-user', csrfToken: 'mock-csrf'
    } });
  });

  await page.goto('/artigen/tools');
  const header = page.locator('.titlebar .header');
  const login = header.getByRole('button', { name: /登录.*注册|Login.*Register/i });
  await expect(login).toBeVisible();
  releaseSession();
  await expect(header.locator('.avatar-btn')).toBeVisible();
  await expect(login).toHaveCount(0);
  await expect(page).toHaveURL(/\/artigen\/tools$/);

  sessionGate = holdSession();
  await page.reload();
  await expect(login).toBeVisible();
  releaseSession();
  await expect(header.locator('.avatar-btn')).toBeVisible();
  await expect(login).toHaveCount(0);
  await expect(page).toHaveURL(/\/artigen\/tools$/);
});

for (const scenario of ['URL', 'last conversation', 'temporary read failure', 'new task supersedes restore']) {
  test(`restores saved design messages after delayed session verification (${scenario})`, async ({ page }) => {
    const useDeepLink = scenario !== 'last conversation';
    if (scenario === 'new task supersedes restore') await page.setViewportSize({ width: 1440, height: 960 });
    const id = '11111111-1111-4111-8111-111111111111';
    await page.addInitScript(({ id }) => {
      localStorage.setItem('app_user_id', 'returning-user');
      localStorage.setItem('agent_user_id', 'returning-user');
      localStorage.setItem('app_lang', 'zh');
      localStorage.setItem('artigen:last-design-conversation', id);
    }, { id });
    let releaseSession = () => {};
    let sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
    let detailRequests = 0;
    let releaseDetail = () => {};
    const detailGate = scenario === 'new task supersedes restore'
      ? new Promise<void>((resolve) => { releaseDetail = resolve; }) : Promise.resolve();
    const now = '2026-09-21T08:00:00.000Z';
    const conversation = {
      conversationId: id, title: '已保存的咖啡店咨询', status: 'active', projectId: null,
      autoCreditCap: 50, clarificationRounds: 0, createdAt: now, updatedAt: now, expiresAt: null,
      messages: [{ messageId: '22222222-2222-4222-8222-222222222222', sequence: 1, role: 'assistant',
        kind: 'text', status: 'complete', text: '已保存的活动文案：周末来喝咖啡。',
        attachments: [], questions: [], assumptions: [], createdAt: now }],
      executions: [], uploads: []
    };
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const respond = (data: object) => route.fulfill({ status: 200, json: { ok: true, ...data } });
      if (pathname === '/api/auth/session') {
        await sessionGate;
        return respond({ authenticated: true, userId: 'returning-user', csrfToken: 'mock-csrf' });
      }
      if (pathname === '/api/design-assistant/status') return respond({ status: { enabled: true, workerEnabled: true, plannerReady: true, autoCreditCap: 50 } });
      if (pathname === '/api/design-conversations') return respond({ conversations: [conversation] });
      if (pathname === `/api/design-conversations/${id}`) {
        detailRequests += 1;
        if (scenario === 'temporary read failure' && detailRequests === 1) {
          return route.fulfill({ status: 503, json: { ok: false, code: 'TEMPORARILY_UNAVAILABLE' } });
        }
        await detailGate;
        return respond({ conversation });
      }
      if (pathname.endsWith('/events')) return route.abort();
      if (pathname.endsWith('/authorizations')) return respond({ authorizations: [] });
      return respond({ balance: 120, items: [], projects: [], assets: [] });
    });
    await page.goto(useDeepLink ? `/artigen/create?c=${id}` : '/artigen/create');
    await expect(page.locator('.conversation-heading')).toContainText('新的设计任务');
    await expect(page.getByText('正在检查执行器', { exact: true })).toHaveCount(0);
    releaseSession();
    if (scenario === 'temporary read failure') {
      await expect(page.locator('.workspace-notice')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/artigen/create\\?c=${id}`));
      await page.evaluate(() => window.dispatchEvent(new Event('app-auth-changed')));
    }
    if (scenario === 'new task supersedes restore') {
      await expect.poll(() => detailRequests).toBe(1);
      await page.getByRole('button', { name: /^新任务/ }).click();
      const response = page.waitForResponse((res) => new URL(res.url()).pathname === `/api/design-conversations/${id}`);
      releaseDetail();
      await response;
      // A later auth event exercises recovery after the stale request has settled.
      await page.evaluate(() => window.dispatchEvent(new Event('app-auth-changed')));
      await expect(page.locator('.conversation-heading')).toContainText('新的设计任务');
      await expect(page.locator('.message.assistant')).toHaveCount(0);
      await expect(page).toHaveURL(/\/artigen\/create$/);
      return;
    }
    await expect(page.locator('.message.assistant')).toContainText('已保存的活动文案');
    await expect(page.locator('.conversation-heading')).toContainText('已保存的咖啡店咨询');
    await expect(page).toHaveURL(new RegExp(`/artigen/create\\?c=${id}`));

    sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
    await page.reload();
    await expect(page.locator('.conversation-heading')).toContainText('新的设计任务');
    await expect(page.getByText('正在检查执行器', { exact: true })).toHaveCount(0);
    releaseSession();
    await expect(page.locator('.message.assistant')).toContainText('已保存的活动文案');
    await expect(page).toHaveURL(new RegExp(`/artigen/create\\?c=${id}`));
  });
}
