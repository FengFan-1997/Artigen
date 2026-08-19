import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectWorkspaceGeometry, installDevEnvironmentBadge } from './helpers/workspaceLayoutAudit';

const conversationId = '11111111-1111-4111-8111-111111111111';
const userMessageId = '22222222-2222-4222-8222-222222222222';
const assistantMessageId = '33333333-3333-4333-8333-333333333333';
const executionId = '44444444-4444-4444-8444-444444444444';
const runId = '55555555-5555-4555-8555-555555555555';
const now = '2026-08-14T08:00:00.000Z';

const message = (
  messageId: string,
  sequence: number,
  role: 'user' | 'assistant',
  text: string
) => ({
  messageId,
  sequence,
  role,
  kind: role === 'assistant' ? 'execution' : 'text',
  status: 'complete',
  text,
  attachments: [],
  questions: [],
  assumptions: [],
  createdAt: now
});

const runningExecution = {
  executionId,
  conversationId,
  sourceMessageId: assistantMessageId,
  routeKind: 'agent_run',
  status: 'waiting_authorization',
  toolId: null,
  operation: null,
  toolTaskId: null,
  agentRunId: runId,
  localRoute: null,
  maxCredits: 50,
  quotedCredits: 42,
  plan: {
    label: '品牌官网体验审计与多格式提案',
    steps: ['浏览并记录公开页面证据', '整理设计与可访问性问题', '制作并验证 PDF 与演示文稿'],
    executor: 'agent_run',
    uploadRequired: false,
    objective: '审计品牌官网，交付 PDF 与可编辑演示文稿。',
    capabilities: { browser: true, files: true, shell: true },
    deliverables: ['report', 'presentation'],
    browserConfig: { allowedOrigins: ['https://brand.example'], persistSession: false }
  },
  error: null,
  createdAt: now,
  updatedAt: now,
  finishedAt: null
};

const fullConversation = {
  conversationId,
  projectId: null,
  title: '品牌官网体验审计',
  status: 'active',
  autoCreditCap: 50,
  clarificationRounds: 0,
  expiresAt: '2026-09-11T08:00:00.000Z',
  createdAt: now,
  updatedAt: now,
  messages: [
    message(userMessageId, 1, 'user', '审计我的品牌官网，并交付 PDF 报告和可编辑提案。'),
    message(assistantMessageId, 2, 'assistant', '信息已经足够。我会使用电脑 Agent 完成调研、多文件制作和交付验证。')
  ],
  executions: [runningExecution],
  uploads: []
};

const run = {
  runId,
  projectId: null,
  objective: '审计品牌官网，交付 PDF 与可编辑演示文稿。',
  objectivePreview: '审计品牌官网，交付 PDF 与可编辑演示文稿。',
  status: 'waiting_user',
  model: { provider: 'siliconflow', name: 'Qwen/Qwen3-8B' },
  sandbox: { provider: 'cua', version: 'pinned-v1', displayUrl: 'https://desktop.example/session' },
  capabilities: { browser: true, files: true, shell: true },
  browserConfig: { allowedOrigins: ['https://brand.example'], profileId: null, persistSession: false },
  budget: {
    maximum: 50,
    freeReserved: 20,
    used: 14,
    charged: 0,
    refunded: 0,
    frozen: 30,
    released: 0
  },
  progress: {
    stepCount: 18,
    maxSteps: 80,
    replanCount: 0,
    pauseRequested: false,
    cancelRequested: false,
    checklist: {},
    planExplanation: '先取证，再制作并验证交付物。',
    plan: [
      { label: '浏览并记录公开页面证据', status: 'completed' },
      { label: '整理设计与可访问性问题', status: 'in_progress' },
      { label: '制作并验证 PDF 与演示文稿', status: 'pending' }
    ]
  },
  approvals: [{
    approvalId: '66666666-6666-4666-8666-666666666666',
    actionType: 'publish',
    recipient: 'https://brand.example/publish',
    riskLevel: 'high',
    changeSummary: '发布已审核的品牌说明',
    evidenceSummary: '页面已经准备好最终发布动作。',
    impactSummary: '这会改变 brand.example 上的公开内容。',
    rollbackSummary: '可在站点后台恢复上一版本。',
    status: 'pending',
    expiresAt: '2026-09-14T09:00:00.000Z',
    decidedAt: null,
    createdAt: now
  }],
  artifacts: [],
  error: null,
  expiresAt: '2026-09-14T08:00:00.000Z',
  createdAt: now,
  queuedAt: now,
  startedAt: now,
  finishedAt: null,
  updatedAt: now
};

const installCommonApi = async (page: Page, authenticated = true) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({
    status: authenticated ? 200 : 401,
    contentType: 'application/json',
    body: JSON.stringify(authenticated
      ? { ok: true, authenticated: true, userId: 'design-user', csrfToken: 'csrf-e2e' }
      : { ok: false, authenticated: false })
  }));
  await page.route('**/api/design-assistant/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      status: {
        enabled: true,
        workerEnabled: true,
        plannerReady: true,
        model: 'Qwen/Qwen3-8B',
        imageModel: 'Kwai-Kolors/Kolors',
        autoCreditCap: 50,
        retentionDays: 30,
        authorizationIdleMinutes: 30,
        queued: 0,
        running: 0
      }
    })
  }));
  await page.route('**/api/collection/event', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));
  await page.route('**/api/auth/google/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ clientId: '' })
  }));
  await page.route('**/api/credits/balance**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, balance: 120 })
  }));
};

const installExistingConversation = async (page: Page) => {
  await installCommonApi(page, true);
  await page.route('**/api/design-conversations**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/events')) return route.abort();
    if (pathname.endsWith('/authorizations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, authorizations: [] })
      });
    }
    if (pathname === `/api/design-conversations/${conversationId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, conversation: fullConversation })
      });
    }
    if (pathname === '/api/design-conversations' && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, conversations: [fullConversation] })
      });
    }
    return route.fallback();
  });
  await page.route(`**/api/agent-runs/${runId}/events`, (route) => route.abort());
  await page.route(`**/api/agent-runs/${runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run })
  }));
};

const installEmptyConversation = async (page: Page) => {
  await installCommonApi(page, true);
  await page.route('**/api/design-conversations**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/events')) return route.abort();
    if (pathname === '/api/design-conversations' && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, conversations: [] })
      });
    }
    return route.fallback();
  });
};

test('guest draft survives email login and sends automatically after verification', async ({ page }) => {
  let authenticated = false;
  let sentMessage: Record<string, unknown> | null = null;
  await installCommonApi(page, false);
  await page.route('**/api/auth/session', (route) => route.fulfill({
    status: authenticated ? 200 : 401,
    contentType: 'application/json',
    body: JSON.stringify(authenticated
      ? { ok: true, authenticated: true, userId: 'design-user', csrfToken: 'csrf-e2e' }
      : { ok: false, authenticated: false })
  }));
  await page.route('**/api/login/send-code', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, challengeId: 'design-login', cooldownSec: 60, deliveryStatus: 'accepted' })
  }));
  await page.route('**/api/login/verify', (route) => {
    authenticated = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, userId: 'design-user', csrfToken: 'csrf-e2e' })
    });
  });
  await page.route('**/api/design-conversations**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/events')) return route.abort();
    if (pathname.endsWith('/messages') && request.method() === 'POST') {
      sentMessage = request.postDataJSON();
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          message: message(userMessageId, 1, 'user', String(sentMessage?.message || ''))
        })
      });
    }
    if (pathname === '/api/design-conversations' && request.method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, conversation: { ...fullConversation, title: '新设计会话', messages: [], executions: [] } })
      });
    }
    if (pathname === '/api/design-conversations' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, conversations: [] }) });
    }
    return route.fallback();
  });

  await page.goto('/artigen/create');
  await expect(page.getByText('文件会留在当前设备，只有云端任务需要时才上传')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /添加文件: 文件会留在当前设备/ })).toBeVisible();
  const draft = '为新款柚子气泡水设计一张夏日主视觉';
  await page.getByLabel('Design request').fill(draft);
  await page.getByRole('button', { name: 'Send request' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Design request')).toHaveValue(draft);
  await dialog.getByRole('button', { name: /邮箱登录|Email Login/i }).click();
  await dialog.locator('input[autocomplete="email"]').fill('designer@example.com');
  await dialog.locator('button.primary').click();
  await dialog.locator('input[autocomplete="one-time-code"]').fill('972004');
  await dialog.locator('button.primary').click();

  await expect.poll(() => sentMessage).toMatchObject({ message: draft, attachments: [] });
  await expect(page).toHaveURL(new RegExp(`/artigen/create\\?c=${conversationId}`));
  await expect(page.getByLabel('Design request')).toHaveValue('');
  await expect(page.locator('.message.user')).toContainText(draft);
});

test('desktop chat makes the selected executor, plan, budget and scoped approval explicit', async ({ page, browserName }) => {
  await installExistingConversation(page);
  const approvalOrder: string[] = [];
  let activeAuthorization = false;
  await page.route(`**/api/agent-runs/${runId}/input`, (route) => {
    approvalOrder.push('approve-current');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route(`**/api/design-conversations/${conversationId}/authorizations**`, (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      approvalOrder.push('persist-scope');
      activeAuthorization = true;
    }
    if (method === 'DELETE') activeAuthorization = false;
    const authorization = {
      authorizationId: '77777777-7777-4777-8777-777777777777',
      conversationId,
      siteOrigin: 'https://brand.example',
      actionType: 'publish',
      status: activeAuthorization ? 'active' : 'revoked',
      lastUsedAt: null,
      expiresAt: '2026-09-14T09:00:00.000Z',
      createdAt: now
    };
    return route.fulfill({
      status: method === 'DELETE' ? 204 : 200,
      contentType: 'application/json',
      body: method === 'DELETE' ? '' : JSON.stringify(method === 'POST'
        ? { ok: true, authorization }
        : { ok: true, authorizations: activeAuthorization ? [authorization] : [] })
    });
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/artigen/create?c=${conversationId}`);

  await expect(page.locator('.conversation-heading')).toContainText('品牌官网体验审计');
  await expect(page.locator('.execution-card')).toContainText('电脑 Agent');
  await expect(page.locator('.execution-card')).toContainText('42');
  await expect(page.locator('.execution-card')).toContainText('14');
  await expect(page.getByRole('button', { name: '30 分钟内仅自动批准该站点的发布操作' })).toBeVisible();
  await expect(page.locator('.authorization-scope')).toContainText('https://brand.example');
  await expect(page.locator('.authorization-scope')).toContainText('发布');
  await expect(page.locator('.authorization-scope')).toContainText('30 分钟');
  const environment = page.locator('#workspace-panel-environment');
  await expect(environment.getByText('Qwen/Qwen3-8B', { exact: true })).not.toBeVisible();
  await expect(environment.getByText('Kwai-Kolors/Kolors', { exact: true })).not.toBeVisible();
  await expect(environment).toContainText('50');
  await environment.getByText('技术详情', { exact: true }).click();
  await expect(environment).toContainText('Qwen/Qwen3-8B');
  await expect(environment).toContainText('Kwai-Kolors/Kolors');
  await page.getByRole('tab', { name: '计划' }).click();
  await expect(page.locator('#workspace-panel-plan')).toContainText('浏览并记录公开页面证据');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  if (process.env.ARTIGEN_CAPTURE_REVIEW && browserName === 'chromium') {
    await page.screenshot({
      path: path.join(process.cwd(), '.impeccable/review/design-conversation-chat-desktop.png'),
      fullPage: true
    });
  }
  await page.getByRole('button', { name: '30 分钟内仅自动批准该站点的发布操作' }).click();
  await expect.poll(() => approvalOrder).toEqual(['approve-current', 'persist-scope']);
  await expect(page.locator('.authorization-strip')).toContainText('https://brand.example');
  await expect(page.locator('.authorization-strip')).toContainText('发布');
  await page.locator('.authorization-strip').getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.authorization-strip')).toHaveCount(0);
  await page.getByRole('button', { name: '折叠左栏' }).click();
  await expect(page.locator('.agent-workspace-shell')).toHaveClass(/left-collapsed/);
  await expect.poll(() => page.locator('.workspace-left').evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(64);
});

test('mobile chat uses a history drawer and keeps the docked composer reachable', async ({ page, browserName }) => {
  await installExistingConversation(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/artigen/create?c=${conversationId}`);

  await expect(page.locator('.agent-workspace-shell')).not.toHaveClass(/left-drawer-open/);
  await expect(page.getByRole('button', { name: '30 分钟内仅自动批准该站点的发布操作' })).toBeVisible();
  if (process.env.ARTIGEN_CAPTURE_REVIEW && browserName === 'chromium') {
    await page.screenshot({
      path: path.join(process.cwd(), '.impeccable/review/design-conversation-chat-mobile.png'),
      fullPage: true
    });
  }
  const historyButton = page.getByRole('button', { name: '打开历史' });
  await historyButton.click();
  await expect(page.locator('.agent-workspace-shell')).toHaveClass(/left-drawer-open/);
  await expect.poll(() => page.locator('.workspace-left').evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0);
  await expectWorkspaceGeometry(page, { mobile: true });
  await expect(page.locator('.brand-lockup')).toBeFocused();
  await expect(page.locator('.history-item')).toContainText('品牌官网体验审计');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.workspace-account button').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.brand-lockup')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.agent-workspace-shell')).not.toHaveClass(/left-drawer-open/);
  await expect(historyButton).toBeFocused();
  await expect(page.locator('.docked-composer')).toBeVisible();
  await expect(page.getByLabel('Design request')).toBeEditable();
  await expect(page.locator('input[type="file"]')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('input[type="file"]')).toHaveAttribute('aria-label', '添加参考文件');
  await expectWorkspaceGeometry(page, { mobile: true });

});

test('zero state stays scrollable and aligned across desktop, zoom, short and landscape viewports', async ({ page }) => {
  await installEmptyConversation(page);
  const capturePass = process.env.ARTIGEN_CAPTURE_PASS || 'review';
  for (const viewport of [
    { name: 'desktop-1440', width: 1440, height: 960 },
    { name: 'desktop-edge-1439', width: 1439, height: 900 },
    { name: 'desktop-edge-1200', width: 1200, height: 800 },
    { name: 'tablet-edge-1199', width: 1199, height: 800 },
    { name: 'desktop-1180', width: 1180, height: 800 },
    { name: 'tablet-1024-short', width: 1024, height: 700 },
    { name: 'tablet-edge-800', width: 800, height: 700 },
    { name: 'mobile-edge-799', width: 799, height: 700 },
    { name: 'tablet-768', width: 768, height: 900 },
    { name: 'mobile-430', width: 430, height: 932 },
    { name: 'mobile-edge-400', width: 400, height: 844 },
    { name: 'mobile-edge-399', width: 399, height: 844 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-360-short', width: 360, height: 640 },
    { name: 'mobile-landscape-844', width: 844, height: 390 },
    { name: 'mobile-landscape-667', width: 667, height: 375 },
    { name: 'zoom-200', width: 640, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/artigen/create');
    await installDevEnvironmentBadge(page);
    await expect(page.locator('.workspace-zero')).toBeVisible();
    await expectWorkspaceGeometry(page, { mobile: viewport.width < 800 });
    if (process.env.ARTIGEN_CAPTURE_LAYOUT && viewport.height <= 640) {
      await page.screenshot({
        path: path.resolve(process.cwd(), `../.artifacts/workspace-borderless-polish-${capturePass}/create-zero-${viewport.name}-top.png`),
        animations: 'disabled'
      });
    }
    if (viewport.height <= 640) {
      await page.locator('.workspace-zero').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(page.locator('.suggestion-grid > button').last()).toBeInViewport();
    }
    if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
      await page.screenshot({
        path: path.resolve(process.cwd(), `../.artifacts/workspace-borderless-polish-${capturePass}/create-zero-${viewport.name}${viewport.height <= 640 ? '-scrolled' : ''}.png`),
        animations: 'disabled'
      });
    }
  }
});

test('active conversation keeps cards, approvals and dock aligned across extreme viewports', async ({ page }) => {
  await installExistingConversation(page);
  const capturePass = process.env.ARTIGEN_CAPTURE_PASS || 'review';
  for (const viewport of [
    { name: 'desktop-1440', width: 1440, height: 960 },
    { name: 'desktop-edge-1439', width: 1439, height: 900 },
    { name: 'desktop-edge-1200', width: 1200, height: 800 },
    { name: 'tablet-edge-1199', width: 1199, height: 800 },
    { name: 'desktop-1180', width: 1180, height: 800 },
    { name: 'tablet-1024-short', width: 1024, height: 700 },
    { name: 'tablet-edge-800', width: 800, height: 700 },
    { name: 'mobile-edge-799', width: 799, height: 700 },
    { name: 'tablet-768', width: 768, height: 900 },
    { name: 'mobile-430', width: 430, height: 932 },
    { name: 'mobile-edge-400', width: 400, height: 844 },
    { name: 'mobile-edge-399', width: 399, height: 844 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-360-short', width: 360, height: 640 },
    { name: 'mobile-landscape-844', width: 844, height: 390 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/artigen/create?c=${conversationId}`);
    await installDevEnvironmentBadge(page);
    await expect(page.locator('.execution-card')).toBeVisible();
    await expectWorkspaceGeometry(page, { mobile: viewport.width < 800 });
    if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
      await page.screenshot({
        path: path.resolve(process.cwd(), `../.artifacts/workspace-borderless-polish-${capturePass}/create-chat-${viewport.name}.png`),
        animations: 'disabled'
      });
    }
  }
});

test('long messages and verified filenames remain readable without mobile overflow', async ({ page }) => {
  await installExistingConversation(page);
  const longText = '请保留品牌调性并说明每一项设计决策。'.repeat(36);
  const longFilename = `${'artigen-professional-brand-experience-audit-'.repeat(8)}final.pdf`;
  const longConversation = {
    ...fullConversation,
    title: '品牌设计协作与多格式交付验证'.repeat(6),
    messages: [
      message(userMessageId, 1, 'user', longText),
      message(assistantMessageId, 2, 'assistant', longText)
    ]
  };
  const longRun = structuredClone(run) as any;
  longRun.artifacts = [{
    artifactId: '88888888-8888-4888-8888-888888888888',
    role: 'pdf',
    filename: longFilename,
    mimeType: 'application/pdf',
    byteSize: 345678,
    verificationStatus: 'passed',
    url: `/api/agent-runs/${runId}/artifacts/88888888-8888-4888-8888-888888888888`
  }];
  await page.route(`**/api/design-conversations/${conversationId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, conversation: longConversation })
  }));
  await page.route(`**/api/agent-runs/${runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run: longRun })
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/artigen/create?c=${conversationId}`);
  await expect(page.locator('.message-body').first()).toContainText('请保留品牌调性');
  await page.getByRole('button', { name: '打开检查器' }).click();
  await page.getByRole('tab', { name: /文件/ }).click();
  await expect(page.locator('.file-panel')).toContainText(longFilename);
  await expectWorkspaceGeometry(page, { mobile: true });
  await expect.poll(() => page.locator('.workspace-right').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test('failed executions show the error, credit disposition and an editable retry path', async ({ page }) => {
  await installExistingConversation(page);
  const failedRun = {
    ...run,
    status: 'failed',
    error: { code: 'AGENT_ARTIFACT_VERIFICATION_FAILED' },
    approvals: [],
    budget: { ...run.budget, charged: 8, refunded: 2, frozen: 0, released: 20 },
    finishedAt: now
  };
  const failedConversation = {
    ...fullConversation,
    executions: [{ ...runningExecution, status: 'failed' }]
  };
  await page.route(`**/api/design-conversations/${conversationId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, conversation: failedConversation })
  }));
  await page.route(`**/api/agent-runs/${runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run: failedRun })
  }));

  await page.goto(`/artigen/create?c=${conversationId}`);
  const failure = page.getByRole('alert');
  await expect(failure).toContainText('AGENT_ARTIFACT_VERIFICATION_FAILED');
  await expect(failure).toContainText('已扣 8 点');
  await expect(failure).toContainText('已释放 20 点冻结');
  await page.getByRole('button', { name: '载入原要求并修改' }).click();
  await expect(page.getByLabel('Design request')).toHaveValue('审计品牌官网，交付 PDF 与可编辑演示文稿。');
});

test('raising an over-cap quote changes only this execution and still requires an explicit start', async ({ page }) => {
  await installCommonApi(page, true);
  let raised = false;
  let taskRequests = 0;
  let publishBudgetUpdated: (() => void) | undefined;
  const budgetUpdated = new Promise<void>((resolve) => { publishBudgetUpdated = resolve; });
  const budgetExecution = {
    ...runningExecution,
    routeKind: 'tool_task',
    status: 'waiting_budget',
    toolId: 'ai-design',
    operation: 'generate',
    toolTaskId: null,
    agentRunId: null,
    maxCredits: raised ? 72 : 50,
    quotedCredits: 72,
    error: raised ? null : { code: 'DESIGN_EXECUTION_BUDGET_EXCEEDED' },
    plan: {
      label: '夏日主视觉',
      steps: ['取得服务端报价', '创建受控任务', '验证并交付结果'],
      executor: 'tool_task',
      uploadRequired: false,
      options: { prompt: '生成夏日主视觉', profileId: 'standard-v1', aspectRatio: '1:1' }
    }
  };
  await page.route('**/api/tool-tasks**', (route) => {
    taskRequests += 1;
    return route.abort();
  });
  await page.route('**/api/design-conversations**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/events')) {
      return budgetUpdated.then(() => route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `event: execution.budget_updated\ndata: ${JSON.stringify({
          eventId: 'evt-budget-updated',
          conversationId,
          type: 'execution.budget_updated',
          summary: '本次自动预算已更新',
          data: { executionId, maxCredits: 72 },
          createdAt: new Date().toISOString()
        })}\n\n`
      }));
    }
    if (pathname.endsWith('/authorizations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authorizations: [] }) });
    }
    if (pathname.endsWith(`/executions/${executionId}/budget`) && request.method() === 'POST') {
      raised = true;
      publishBudgetUpdated?.();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, execution: { ...budgetExecution, status: 'queued', maxCredits: 72, error: null } })
      });
    }
    if (pathname === `/api/design-conversations/${conversationId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          conversation: {
            ...fullConversation,
            autoCreditCap: 50,
            executions: [{ ...budgetExecution, status: raised ? 'queued' : 'waiting_budget', maxCredits: raised ? 72 : 50, error: raised ? null : budgetExecution.error }]
          }
        })
      });
    }
    if (pathname === '/api/design-conversations' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, conversations: [] }) });
    }
    return route.fallback();
  });

  await page.goto(`/artigen/create?c=${conversationId}`);
  await expect(page.getByRole('button', { name: '将本次上限提高到 72 点' })).toBeVisible();
  await page.getByRole('button', { name: '将本次上限提高到 72 点' }).click();
  await expect(page.locator('.execution-meta')).toContainText('72 点');
  await expect(page.getByRole('button', { name: '启动任务' })).toBeVisible();
  await page.waitForTimeout(350);
  expect(taskRequests).toBe(0);
});
