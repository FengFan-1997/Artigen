import { expect, test, type Page } from '@playwright/test';

const baseRun = {
  runId: '11111111-1111-4111-8111-111111111111',
  projectId: null,
  objective: '调研独立香氛趋势，并交付报告和演示文稿。',
  objectivePreview: '调研独立香氛趋势，并交付报告和演示文稿。',
  status: 'running',
  model: { provider: 'openai', name: 'gpt-5.6' },
  sandbox: { provider: 'cua', version: 'pinned-v1', displayUrl: null },
  capabilities: { research: true, browser: true, files: true },
  browserConfig: { allowedOrigins: [], profileId: null, persistSession: false },
  budget: {
    maximum: 100,
    freeReserved: 20,
    used: 12.5,
    charged: 0,
    refunded: 0,
    frozen: 80,
    released: 0
  },
  progress: {
    stepCount: 6,
    maxSteps: 120,
    replanCount: 0,
    pauseRequested: false,
    cancelRequested: false,
    checklist: {},
    planExplanation: '先研究，再制作和验证。',
    plan: [
      { label: '查找并核对权威来源', status: 'completed' },
      { label: '整理洞察和引用', status: 'in_progress' },
      { label: '制作并验证交付物', status: 'pending' }
    ]
  },
  approvals: [],
  artifacts: [],
  error: null,
  expiresAt: '2026-08-23T00:00:00.000Z',
  createdAt: '2026-07-24T00:00:00.000Z',
  queuedAt: '2026-07-24T00:00:00.000Z',
  startedAt: '2026-07-24T00:00:10.000Z',
  finishedAt: null,
  updatedAt: '2026-07-24T00:01:00.000Z'
};

const installAgentApi = async (
  page: Page,
  options: {
    onCreate?: (body: Record<string, unknown>) => void;
    imageGenerationPublicEnabled?: boolean;
  } = {}
) => {
  await page.route('**/api/agent/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      status: {
        enabled: true,
        workerOnline: true,
        queueDepth: 0,
        oldestQueuedAt: null,
        concurrency: 1,
        modelFamily: 'Qwen/Qwen3-8B',
        sandboxMode: 'local',
        browserReady: true,
        egressVerified: true,
        desktopRelayReady: true,
        sandboxImageRef: 'artigen/cua-xfce:0.1.15-tools-v2',
        browserPublicEnabled: true,
        imageGenerationPublicEnabled: options.imageGenerationPublicEnabled !== false,
        availabilityNote: 'ready'
      }
    })
  }));
  await page.route('**/api/agent-runs/quote', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      quote: {
        currency: 'credits',
        freeCreditsRemaining: 20,
        estimatedCredits: { minimum: 18, maximum: 64 },
        maximumCredits: 100,
        hardMaximumCredits: 500,
        requiredPaidHold: 80,
        canStart: true,
        limits: {
          minutes: 45,
          steps: 120,
          memoryMb: 4096,
          diskGb: 10,
          concurrentRuns: 1
        },
        requirements: {}
      }
    })
  }));
  await page.route('**/api/agent-runs', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, runs: [baseRun] })
      });
    }
    if (route.request().method() === 'POST' && options.onCreate) {
      options.onCreate(route.request().postDataJSON());
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, run: { ...baseRun, status: 'queued' } })
      });
    }
    return route.fallback();
  });
  await page.route('**/api/integrations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, integrations: [] })
  }));
  await page.route('**/api/agent-browser-profiles', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, profiles: [] })
  }));
};

test('Agent workbench makes output, capability and current-task choices explicit', async ({ page }) => {
  await installAgentApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/agent');

  await page.locator('.nav-toggle').click();
  await expect(page.locator('#artigen-mobile-nav a[href="/artigen/agent"]')).toHaveCount(1);
  await expect(page.locator('#artigen-mobile-nav a[href="/artigen/agent"]')).toBeVisible();
  await page.locator('.nav-toggle').click();

  await expect(page.getByRole('heading', { name: /^说出你想完成的事/ })).toBeVisible();
  await expect(page.locator('.deliverable-options label')).toHaveCount(5);
  await expect(page.locator('.advanced-settings')).toContainText('浏览器需要 HTTPS 白名单');
  await expect(page.locator('.browser-session')).toHaveCount(0);
  await page.locator('.advanced-settings > summary').click();
  const browserCapability = page.locator('.capability-grid label').filter({ hasText: '安全浏览器 Beta' });
  await expect(browserCapability).toContainText('登录接管');
  await browserCapability.click();
  await page.locator('.browser-session label').filter({ hasText: '加密保存' }).click();
  await expect(page.locator('.browser-session')).toContainText('密码、OTP 和验证码仍必须由你接管输入');
  await expect(page.locator('.browser-session input[type="text"]')).toHaveAttribute('placeholder', /https:\/\/example\.com/);
  await page.locator('.browser-session input[type="text"]').fill('https://example.com');
  await expect(page.locator('.run-card')).toContainText(baseRun.objectivePreview);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);

  await page.locator('.objective textarea').fill('制作一份带引用的市场报告');
  await page.locator('.deliverable-options label').filter({ hasText: 'PDF' }).click();
  await page.getByRole('button', { name: '估算费用' }).click();
  await expect(page.locator('.quote')).toContainText('18–64');
  await expect(page.locator('.quote')).toContainText('80');
});

test('starting a run requires a visible current quote and one explicit confirmation', async ({ page }) => {
  const created: Array<Record<string, unknown>> = [];
  await installAgentApi(page, { onCreate: (body) => created.push(body) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/agent');
  await page.locator('.objective textarea').fill('制作一张品牌主视觉设计稿');
  const imageDeliverable = page.locator('.deliverable-options label').filter({ hasText: 'IMAGE' });
  await expect(imageDeliverable.locator('input')).toBeEnabled();
  await imageDeliverable.click();
  await page.locator('.advanced-settings > summary').click();
  const imageCapability = page.locator('.capability-grid label').filter({ hasText: 'AI 图片生成' });
  await expect(imageCapability.locator('input')).toBeChecked();

  await page.getByRole('button', { name: '先查看费用' }).click();
  await expect(page.locator('.quote')).toContainText('18–64');
  await expect(page.getByRole('button', { name: '确认并启动' })).toBeVisible();
  expect(created).toHaveLength(0);

  await page.getByRole('button', { name: '确认并启动' }).click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0].deliverables).toEqual(['image']);
  expect((created[0].capabilities as Record<string, boolean>).generate_images).toBe(true);
  await expect(page).toHaveURL(`/artigen/agent/runs/${baseRun.runId}`);
});

test('IMAGE deliverable and image capability fail closed when production generation is unavailable', async ({ page }) => {
  await installAgentApi(page, { imageGenerationPublicEnabled: false });
  await page.goto('/artigen/agent');
  const imageDeliverable = page.locator('.deliverable-options label').filter({ hasText: 'IMAGE' });
  await expect(imageDeliverable).toContainText('生产生图尚未开放');
  await expect(imageDeliverable.locator('input')).toBeDisabled();
  await page.locator('.advanced-settings > summary').click();
  const imageCapability = page.locator('.capability-grid label').filter({ hasText: 'AI 图片生成' });
  await expect(imageCapability.locator('input')).toBeDisabled();
  await expect(imageCapability).toContainText('当前环境尚未开放');
});

test('desktop navigation exposes one Agent entry without a duplicate mobile link', async ({ page }) => {
  await installAgentApi(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/artigen/agent');

  await expect(page.locator('.nav-links a[href="/artigen/agent"]')).toHaveCount(1);
  await expect(page.locator('.nav-links a[href="/artigen/agent"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
});

test('Agent run detail shows the owner objective and the real durable plan', async ({ page }) => {
  await page.route(`**/api/agent-runs/${baseRun.runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run: baseRun })
  }));
  await page.route(`**/api/agent-runs/${baseRun.runId}/events`, (route) => route.abort());
  await page.goto(`/artigen/agent/runs/${baseRun.runId}`);

  await expect(page.locator('.objective-card')).toContainText(baseRun.objective);
  await expect(page.locator('.plan')).toContainText('查找并核对权威来源');
  await expect(page.locator('.plan')).toContainText('整理洞察和引用');
  await expect(page.locator('.plan > div.active')).toContainText('正在执行');
  await expect(page.locator('.plan > div.done')).toContainText('已完成');
  await expect(page.locator('.budget-bar')).toContainText('12.5');
});

test('blocked approvals offer takeover instead of a false one-click approval', async ({ page }) => {
  const takeoverRun = {
    ...baseRun,
    status: 'waiting_user',
    sandbox: {
      ...baseRun.sandbox,
      displayUrl: 'https://desktop.example.test/session'
    },
    approvals: [{
      approvalId: '22222222-2222-4222-8222-222222222222',
      actionType: 'captcha',
      recipient: 'example.test',
      riskLevel: 'blocked',
      changeSummary: '请接管并完成人机验证。',
      evidenceSummary: '页面显示了需要真人完成的人机验证。',
      impactSummary: '你将在隔离云电脑中亲自完成人机验证。',
      rollbackSummary: '接管前 Agent 不会点击或输入；可直接拒绝。',
      status: 'pending',
      expiresAt: '2026-08-23T00:00:00.000Z',
      decidedAt: null,
      createdAt: '2026-07-24T00:01:00.000Z'
    }]
  };
  await page.route(`**/api/agent-runs/${baseRun.runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run: takeoverRun })
  }));
  await page.route(`**/api/agent-runs/${baseRun.runId}/events`, (route) => route.abort());
  await page.goto(`/artigen/agent/runs/${baseRun.runId}`);

  await expect(page.getByRole('button', { name: '接管云电脑' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '批准这一次' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '恢复' })).toHaveCount(0);
  await expect(page.locator('.approval')).toContainText('完成人机验证');
  await expect(page.locator('.approval')).toContainText('为什么需要');
  await expect(page.locator('.approval')).toContainText('批准后会发生');
  await expect(page.locator('.approval')).toContainText('撤销方式');
  await expect(page.locator('.approval')).toContainText('仅批准这一次');
});

test('high-risk approval explains the exact action and preserves a denial reason', async ({ page }) => {
  const approvalId = '33333333-3333-4333-8333-333333333333';
  const approvalRun = {
    ...baseRun,
    status: 'waiting_user',
    approvals: [{
      approvalId,
      actionType: 'publish',
      recipient: 'github:repos/artigen/site/pages',
      riskLevel: 'high',
      changeSummary: '发布已经验证的静态网站。',
      evidenceSummary: 'dist/index.html 已构建，桌面和移动截图均通过。',
      impactSummary: 'GitHub Pages 将公开新版本，访问者会立即看到。',
      rollbackSummary: '可通过一次新的审批将 Pages 回滚到上一部署版本。',
      status: 'pending',
      expiresAt: '2026-08-23T00:00:00.000Z',
      decidedAt: null,
      createdAt: '2026-07-24T00:01:00.000Z'
    }]
  };
  let submitted: Record<string, unknown> | null = null;
  await page.route(`**/api/agent-runs/${baseRun.runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run: approvalRun })
  }));
  await page.route(`**/api/agent-runs/${baseRun.runId}/input`, (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });
  await page.route(`**/api/agent-runs/${baseRun.runId}/events`, (route) => route.abort());
  await page.goto(`/artigen/agent/runs/${baseRun.runId}`);

  const approval = page.locator('.approval');
  await expect(approval).toContainText('发布内容');
  await expect(approval).toContainText('dist/index.html 已构建');
  await expect(approval).toContainText('访问者会立即看到');
  await expect(approval).toContainText('回滚到上一部署版本');
  await expect(approval).toContainText('到期未处理会停止任务');
  await approval.locator('.approval-reason').fill('先让我核对域名和公开范围');
  await approval.getByRole('button', { name: '拒绝' }).click();
  await expect.poll(() => submitted).not.toBeNull();
  expect(submitted).toEqual({
    approvalId,
    decision: 'denied',
    decisionReason: '先让我核对域名和公开范围'
  });
});

test('stopping an Agent run requires a second explicit click and explains settlement', async ({ page }) => {
  let cancelRequests = 0;
  await page.route(`**/api/agent-runs/${baseRun.runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run: baseRun })
  }));
  await page.route(`**/api/agent-runs/${baseRun.runId}/cancel`, (route) => {
    cancelRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        run: { ...baseRun, status: 'cancelled', error: { code: 'AGENT_CANCELLED' } }
      })
    });
  });
  await page.route(`**/api/agent-runs/${baseRun.runId}/events`, (route) => route.abort());
  await page.goto(`/artigen/agent/runs/${baseRun.runId}`);

  await page.locator('.controls .danger').click();
  expect(cancelRequests).toBe(0);
  await expect(page.locator('.controls .danger')).toContainText('再次点击');
  await expect(page.locator('.notice')).toContainText('未使用冻结点数会释放');

  await page.locator('.controls .danger').click();
  await expect.poll(() => cancelRequests).toBe(1);
});
