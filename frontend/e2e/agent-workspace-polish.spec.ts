import { expect, test, type Page, type Route } from '@playwright/test';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const executionId = '44444444-4444-4444-8444-444444444444';
const taskId = '55555555-5555-4555-8555-555555555555';
const stamp = '2026-08-14T08:00:00Z';
const msg = (id: string, text: string, role = 'user') => ({
  messageId: id,
  sequence: 1,
  role,
  kind: 'text',
  status: 'complete',
  text,
  attachments: [],
  questions: [],
  assumptions: [],
  memoryCandidates: [],
  createdAt: stamp
});
const session = (id: string, title: string) => ({
  conversationId: id,
  projectId: null,
  title,
  status: 'active',
  autoCreditCap: 50,
  clarificationRounds: 0,
  expiresAt: '2099-01-01T00:00:00Z',
  createdAt: stamp,
  updatedAt: stamp,
  messages: [msg(`${id}-message`, `${title}的正文`)],
  executions: [] as Record<string, unknown>[],
  uploads: []
});
const run = (status = 'running') => ({
  runId,
  projectId: null,
  objective: '审计品牌网站并交付可编辑提案。',
  objectivePreview: '品牌网站审计',
  status,
  model: { provider: 'cloudflare', name: '@cf/openai/gpt-oss-120b' },
  sandbox: { provider: 'cua', version: 'fixture-v1', takeoverAvailable: false },
  capabilities: { files: true, shell: true, browser: true },
  browserConfig: { allowedOrigins: ['https://example.invalid'] },
  budget: {
    maximum: 50,
    freeReserved: 20,
    used: 12.5,
    charged: 7,
    refunded: 2,
    frozen: 0,
    released: 23
  },
  progress: {
    stepCount: 8,
    maxSteps: 120,
    replanCount: 0,
    pauseRequested: false,
    cancelRequested: false,
    checklist: {},
    plan: [
      { label: '记录网站证据', status: 'completed' },
      { label: '制作与验证提案', status: status === 'succeeded' ? 'completed' : 'pending' }
    ],
    planExplanation: '先取证，再制作。',
    durableCheckpointSaved: true
  },
  approvals: [] as Record<string, unknown>[],
  subagents: [],
  error: status === 'failed' ? { code: 'AGENT_BUDGET_EXCEEDED' } : null,
  artifacts: [
    {
      artifactId: 'fixture-artifact',
      assetId: null,
      parentArtifactId: null,
      role: 'pdf',
      filename: 'partial-report.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      sha256: null,
      version: 1,
      verificationStatus: 'passed',
      verification: {},
      sources: [],
      costCredits: 0,
      url: '/api/fixture-file',
      expiresAt: '2099-01-01T00:00:00Z',
      createdAt: stamp
    }
  ],
  expiresAt: '2099-01-01T00:00:00Z',
  createdAt: stamp,
  queuedAt: stamp,
  startedAt: stamp,
  finishedAt: null,
  updatedAt: stamp
});
const execution = (id: string, kind = 'agent_run') => ({
  executionId,
  conversationId: id,
  sourceMessageId: `${id}-message`,
  routeKind: kind,
  status: 'running',
  toolId: kind === 'tool_task' ? 'image' : null,
  operation: kind === 'tool_task' ? 'generate' : null,
  toolTaskId: kind === 'tool_task' ? taskId : null,
  agentRunId: kind === 'agent_run' ? runId : null,
  localRoute: null,
  maxCredits: 50,
  quotedCredits: 10,
  plan: { label: '网站提案', steps: ['取证', '交付'] },
  error: null,
  createdAt: stamp,
  updatedAt: stamp,
  finishedAt: null
});
const json = (route: Route, value: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const setup = async (
  page: Page,
  options: {
    initialOwner?: string;
    sessions?: ReturnType<typeof session>[];
    currentRun?: ReturnType<typeof run>;
    intercept?: (route: Route, path: string) => Promise<boolean>;
  } = {}
) => {
  const sessions = options.sessions || [session(a, '任务 A'), session(b, '任务 B')];
  const currentRun = options.currentRun || run();
  await page.addInitScript(
    (owner) => localStorage.setItem('app_user_id', owner),
    options.initialOwner || 'polish-fixture'
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (await options.intercept?.(route, path)) return;
    if (path === '/api/auth/session')
      return json(route, {
        ok: true,
        authenticated: true,
        userId: 'polish-fixture',
        csrfToken: 'fixture-csrf'
      });
    if (path === '/api/collection/event') return json(route, { ok: true }, 202);
    if (path === '/api/design-assistant/status')
      return json(route, {
        ok: true,
        status: {
          enabled: true,
          workerEnabled: true,
          plannerReady: true,
          autoCreditCap: 50,
          queued: 0,
          running: 0,
          model: '@cf/openai/gpt-oss-120b',
          imageModel: 'Kwai-Kolors/Kolors'
        }
      });
    if (path === '/api/agent/status')
      return json(route, {
        ok: true,
        status: {
          enabled: true,
          workerOnline: true,
          queueDepth: 0,
          concurrency: 2,
          modelFamily: '@cf/openai/gpt-oss-120b',
          sandboxMode: 'local',
          browserReady: true,
          egressVerified: true,
          desktopRelayReady: true,
          browserPublicEnabled: true,
          imageGenerationPublicEnabled: true,
          subagentsEnabled: true
        }
      });
    if (path === '/api/agent-browser-profiles')
      return json(route, {
        ok: true,
        profiles: [
          { profileId: 'fixture-profile', siteOrigin: 'https://example.invalid', label: '测试会话' }
        ]
      });
    if (path === '/api/agent-runs') return json(route, { ok: true, runs: [currentRun] });
    if (path === `/api/agent-runs/${runId}`) return json(route, { ok: true, run: currentRun });
    if (path.endsWith('/events')) return route.abort();
    if (path.endsWith('/authorizations')) return json(route, { ok: true, authorizations: [] });
    if (path === '/api/design-conversations')
      return json(route, { ok: true, conversations: sessions });
    const found = sessions.find(
      (item) => path === `/api/design-conversations/${item.conversationId}`
    );
    if (found) return json(route, { ok: true, conversation: found });
    if (path === '/api/credits/balance') return json(route, { ok: true, balance: 120 });
    return json(route, { ok: false, error: { code: 'FIXTURE_UNEXPECTED_API' } }, 404);
  });
};
const select = async (page: Page, id: string) => {
  const panel = page.locator('#workspace-history-panel');
  if ((page.viewportSize()?.width || 1440) < 1440 && !(await panel.isVisible())) {
    await page.getByRole('button', { name: '打开历史', exact: true }).click();
  }
  await page
    .locator('.history-item')
    .filter({ hasText: id === a ? '任务 A' : '任务 B' })
    .click();
};

const installEventSources = async (page: Page) =>
  page.addInitScript(() => {
    const sources: Array<EventTarget & { url: string; closed: boolean }> = [];
    class FixtureEventSource extends EventTarget {
      closed = false;
      constructor(public url: string) {
        super();
        sources.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    Object.assign(window, { EventSource: FixtureEventSource, fixtureEventSources: sources });
  });
const emitSource = async (page: Page, path: string, type: string, data: unknown) =>
  page.evaluate(
    ({ path, type, data }) => {
      const sources = (
        window as unknown as {
          fixtureEventSources: Array<EventTarget & { url: string; closed: boolean }>;
        }
      ).fixtureEventSources;
      const source = sources.find((item) => item.url.endsWith(path) && !item.closed);
      if (!source) throw new Error(`Fixture stream missing: ${path}`);
      source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
    },
    { path, type, data }
  );
const quote = () => ({
  currency: 'credits',
  freeCreditsRemaining: 120,
  estimatedCredits: { minimum: 18, maximum: 42 },
  maximumCredits: 50,
  hardMaximumCredits: 500,
  requiredPaidHold: 30,
  canStart: true,
  limits: { minutes: 45, steps: 120 },
  requirements: {
    database: true,
    payloadEncryption: true,
    modelProvider: true,
    sandboxProvider: true
  }
});
const tool = (status = 'running') => ({
  taskId,
  toolId: 'image',
  operation: 'generate',
  status,
  assets: [],
  warnings: [],
  result: null,
  error: null,
  receipt: { sku: null, quotedCredits: 10, chargedCredits: 10, refundedCredits: 0 }
});

test('first-load 503 is visible and retry recovers without creating a run', async ({ page }) => {
  let reads = 0,
    creates = 0;
  await setup(page, {
    intercept: async (route, path) => {
      if (path === '/api/agent-runs' && route.request().method() === 'POST') creates += 1;
      if (path !== `/api/agent-runs/${runId}`) return false;
      reads += 1;
      await json(
        route,
        reads === 1
          ? { ok: false, error: { code: 'AGENT_RUN_LOAD_FAILED' } }
          : { ok: true, run: run() },
        reads === 1 ? 503 : 200
      );
      return true;
    }
  });
  await page.goto(`/artigen/agent/runs/${runId}`);
  await expect(page.getByRole('heading', { name: '任务暂时无法打开' })).toBeVisible();
  await page.getByRole('button', { name: '重新读取任务' }).click();
  await expect(page.locator('.user-message')).toContainText('审计品牌网站');
  expect(creates).toBe(0);
});
for (const status of [401, 404])
  test(`${status} load failure has a specific next action`, async ({ page }) => {
    await setup(page, {
      intercept: async (route, path) => {
        if (path !== `/api/agent-runs/${runId}`) return false;
        await json(
          route,
          { ok: false, error: { code: status === 401 ? 'LOGIN_REQUIRED' : 'AGENT_RUN_NOT_FOUND' } },
          status
        );
        return true;
      }
    });
    await page.goto(`/artigen/agent/runs/${runId}`);
    await expect(page.locator('.run-load-state')).toBeVisible();
    await expect(
      page.getByRole('link', { name: status === 401 ? '重新登录' : '返回任务历史', exact: true })
    ).toBeVisible();
  });
test('history-list failure does not hide the readable current run', async ({ page }) => {
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== '/api/agent-runs') return false;
      await json(route, { ok: false }, 503);
      return true;
    }
  });
  await page.goto(`/artigen/agent/runs/${runId}`);
  await expect(page.locator('.user-message')).toContainText('审计品牌网站');
});
for (const status of ['failed', 'cancelled', 'succeeded', 'paused', 'waiting_user'])
  test(`${status} shows real recorded steps and truthful results`, async ({ page }) => {
    await setup(page, { currentRun: run(status) });
    await page.goto(`/artigen/agent/runs/${runId}`);
    await page.locator('.run-progress-header').click();
    await expect(page.locator('.phase-track .done')).toHaveCount(status === 'succeeded' ? 2 : 1);
    await expect(page.getByText('计划已建立，正在按步骤推进。', { exact: true })).toHaveCount(0);
    if (['failed', 'cancelled'].includes(status)) {
      await expect(page.locator('.delivery-summary')).toContainText('已保留的成果');
      await expect(page.locator('.delivery-summary')).not.toContainText('交付完成');
    }
    if (status === 'succeeded')
      await expect(page.locator('.delivery-summary')).toContainText('交付完成');
  });
test('late history response cannot replace the last selected conversation', async ({ page }) => {
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== `/api/design-conversations/${a}`) return false;
      await sleep(850);
      await json(route, { ok: true, conversation: session(a, '任务 A') });
      return true;
    }
  });
  await page.goto('/artigen/create');
  await expect(page.locator('.history-item')).toHaveCount(2);
  await select(page, a);
  await select(page, b);
  await expect(page.locator('.conversation-heading')).toContainText('任务 B');
  await page.waitForTimeout(950);
  await expect(page).toHaveURL(new RegExp(`c=${b}`));
});
test('late refresh from A cannot replace B', async ({ page }) => {
  let reads = 0;
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== `/api/design-conversations/${a}`) return false;
      reads += 1;
      if (reads > 1) await sleep(800);
      await json(route, { ok: true, conversation: session(a, '任务 A') });
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await expect(page.locator('.message-body')).toContainText('任务 A的正文');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => reads).toBeGreaterThan(1);
  await select(page, b);
  await page.waitForTimeout(900);
  await expect(page.locator('.conversation-heading')).toContainText('任务 B');
});
test('late send stays in A and does not clear a new draft in B', async ({ page }) => {
  let sent = false;
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== `/api/design-conversations/${a}/messages`) return false;
      sent = true;
      await sleep(800);
      await json(route, { ok: true, message: msg('sent-a', '给 A 的补充') }, 202);
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await expect(page.locator('.conversation-heading')).toContainText('任务 A');
  await page.getByRole('textbox', { name: '设计需求' }).fill('给 A 的补充');
  await page.getByRole('button', { name: '发送需求', exact: true }).click();
  await expect.poll(() => sent).toBe(true);
  await select(page, b);
  await expect(page.locator('.conversation-heading')).toContainText('任务 B');
  await page.getByRole('textbox', { name: '设计需求' }).fill('给 B 的草稿');
  await page.waitForTimeout(900);
  await expect(page.getByRole('textbox', { name: '设计需求' })).toHaveValue('给 B 的草稿');
  await expect(page.locator('.message-scroll')).not.toContainText('给 A 的补充');
});
test('typing during an in-flight send survives its acknowledgement', async ({ page }) => {
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== `/api/design-conversations/${a}/messages`) return false;
      await sleep(600);
      await json(route, { ok: true, message: msg('sent-a', '已发送的要求') }, 202);
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  const input = page.getByRole('textbox', { name: '设计需求' });
  await input.fill('已发送的要求');
  await page.getByRole('button', { name: '发送需求', exact: true }).click();
  await input.fill('接下来的新想法');
  await expect(page.locator('.message-scroll')).toContainText('已发送的要求');
  await expect(input).toHaveValue('接下来的新想法');
});
test('task drafts survive switching and reload', async ({ page }) => {
  await setup(page);
  await page.goto(`/artigen/create?c=${a}`);
  const input = page.getByRole('textbox', { name: '设计需求' });
  await input.fill('A 的草稿');
  await select(page, b);
  await expect(page.locator('.conversation-heading')).toContainText('任务 B');
  await input.fill('B 的草稿');
  await page.reload();
  await expect(input).toHaveValue('B 的草稿');
  await select(page, a);
  await expect(input).toHaveValue('A 的草稿');
});
for (const refreshFails of [false, true])
  test(`success stops polling with final refresh failure=${refreshFails}`, async ({ page }) => {
    const current = session(a, '任务 A');
    current.executions = [execution(a, 'tool_task')];
    let reads = 0,
      sessionReads = 0;
    await setup(page, {
      sessions: [current],
      intercept: async (route, path) => {
        if (path === `/api/design-conversations/${a}`) {
          sessionReads += 1;
          const failed = refreshFails && sessionReads > 1;
          await json(
            route,
            failed ? { ok: false } : { ok: true, conversation: current },
            failed ? 503 : 200
          );
          return true;
        }
        if (path !== `/api/tool-tasks/${taskId}`) return false;
        reads += 1;
        await json(route, {
          ok: true,
          task: {
            taskId,
            toolId: 'image',
            operation: 'generate',
            status: 'success',
            assets: [],
            warnings: [],
            result: null,
            error: null,
            receipt: { sku: null, quotedCredits: 10, chargedCredits: 10, refundedCredits: 0 }
          }
        });
        return true;
      }
    });
    await page.goto(`/artigen/create?c=${a}`);
    await expect(page.locator('.execution-card')).toContainText('已完成');
    await page.waitForTimeout(3500);
    expect(reads).toBe(1);
  });
test('background updates preserve reading position and offer a jump', async ({ page }) => {
  const current = session(a, '任务 A');
  current.messages = Array.from({ length: 35 }, (_, i) =>
    msg(`long-${i}`, `${i} ${'需要回头检查这段需求。'.repeat(16)}`, i % 2 ? 'assistant' : 'user')
  );
  await setup(page, { sessions: [current] });
  await page.goto(`/artigen/create?c=${a}`);
  const area = page.locator('.message-scroll');
  await expect(area).toBeVisible();
  await area.evaluate((el) => {
    el.scrollTop = 180;
  });
  await page.waitForTimeout(80);
  current.messages.push(msg('latest', '最新回答', 'assistant'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('button', { name: '有新内容 · 回到底部' })).toBeVisible();
  expect(await area.evaluate((el) => el.scrollTop)).toBeCloseTo(180, 0);
  await page.getByRole('button', { name: '有新内容 · 回到底部' }).click();
  await expect
    .poll(() => area.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThan(10);
});
test('mobile inspector reaches summary and correctly labels scope and profile', async ({
  page
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/agent');
  const opener = page.getByRole('button', { name: '打开检查器', exact: true });
  await opener.click();
  await page
    .getByRole('navigation', { name: '资源面板' })
    .getByRole('button', { name: '任务', exact: true })
    .click();
  await page.getByText('运行设置', { exact: true }).click();
  await page.getByLabel('网页操作 Beta', { exact: true }).check();
  await expect(page.getByRole('textbox', { name: '允许访问的站点', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '恢复已保存的会话', exact: true })).toBeVisible();
  await page.getByRole('slider', { name: '最高预算点数' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('summary').filter({ hasText: '技术详情' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('navigation', { name: '资源面板' })
      .getByRole('button', { name: '文件', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
test('command search has its correct name and focus outline is visible', async ({ page }) => {
  await setup(page);
  await page.goto('/artigen/agent');
  const input = page.getByRole('textbox', { name: '任务目标' });
  await input.focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('searchbox', { name: '搜索页面或动作', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  const opener = page.getByRole('button', { name: '打开检查器', exact: true });
  await opener.focus();
  expect(await opener.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
});
test('empty Agent groups its input and suggestions and collapses unused inspector', async ({
  page
}) => {
  await setup(page);
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
    await page.goto('/artigen/agent');
    await expect(page.locator('.agent-workspace-shell')).toHaveClass(/right-collapsed/);
    const h = await page.getByRole('heading', { name: '今天要一起完成什么？' }).boundingBox(),
      c = await page.locator('.objective-composer').boundingBox(),
      s = await page.locator('.prompt-suggestions').boundingBox();
    expect(c!.y - h!.y - h!.height).toBeLessThan(64);
    expect(s!.y).toBeGreaterThan(c!.y + c!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
  }
});
test('task identity state and cost remain visible at main viewport widths', async ({ page }) => {
  await setup(page, { currentRun: run('waiting_user') });
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/artigen/agent/runs/${runId}`);
    await expect(page.locator('.task-heading strong')).toContainText('品牌网站审计');
    await expect(page.locator('.task-heading strong')).toBeVisible();
    await expect(page.locator('.workspace-topbar .runtime-pill')).toContainText('等待你确认');
    await expect(page.locator('.workspace-topbar .task-cost')).toContainText('已用 12.5 / 50 点');
    await expect(page.locator('.task-cost')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
  }
});
test('expiry removes approvals without requiring another server response', async ({ page }) => {
  const now = new Date('2026-10-14T09:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  const currentRun = run('waiting_user');
  currentRun.approvals = [
    {
      approvalId: 'fixture-approval',
      actionType: 'publish',
      recipient: 'https://example.invalid/publish',
      riskLevel: 'high',
      changeSummary: '发布提案',
      evidenceSummary: '已有最终稿',
      impactSummary: '公开页面改变',
      rollbackSummary: '可以恢复上一版',
      status: 'pending',
      expiresAt: new Date(now.getTime() + 60000).toISOString(),
      createdAt: stamp,
      decidedAt: null
    }
  ];
  const current = session(a, '任务 A');
  current.executions = [execution(a)];
  await setup(page, { sessions: [current], currentRun });
  await page.goto(`/artigen/create?c=${a}`);
  await expect(page.getByRole('button', { name: '仅批准这一次', exact: true })).toBeVisible();
  await expect(page.locator('.approval-evidence')).toContainText('可以恢复上一版');
  await page.clock.runFor(61000);
  await expect(page.getByRole('button', { name: '仅批准这一次', exact: true })).toHaveCount(0);
});
test('an in-flight decision disables conflicting approval buttons', async ({ page }) => {
  const currentRun = run('waiting_user');
  currentRun.approvals = [
    {
      approvalId: 'fixture-approval',
      actionType: 'publish',
      recipient: 'https://example.invalid/publish',
      riskLevel: 'high',
      changeSummary: '发布提案',
      evidenceSummary: '',
      impactSummary: '',
      rollbackSummary: '',
      status: 'pending',
      expiresAt: '2099-01-01T00:00:00Z',
      createdAt: stamp,
      decidedAt: null
    }
  ];
  const current = session(a, '任务 A');
  current.executions = [execution(a)];
  let decisions = 0;
  await setup(page, {
    sessions: [current],
    currentRun,
    intercept: async (route, path) => {
      if (path !== `/api/agent-runs/${runId}/input`) return false;
      decisions += 1;
      await sleep(700);
      currentRun.approvals[0]!.status = 'approved';
      await json(route, { ok: true, run: currentRun });
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await page.getByRole('button', { name: '仅批准这一次', exact: true }).click();
  await expect(page.getByRole('button', { name: '拒绝', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '30 分钟内仅自动批准该站点的发布操作' })
  ).toBeDisabled();
  await page.waitForTimeout(850);
  expect(decisions).toBe(1);
});
test('an existing task never exposes the new-task composer during its first load', async ({
  page
}) => {
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== `/api/design-conversations/${a}`) return false;
      await sleep(500);
      await json(route, { ok: true, conversation: session(a, '任务 A') });
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await expect(page.getByRole('heading', { name: '正在读取对话…' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '设计需求' })).toHaveCount(0);
  await expect(page.locator('.conversation-heading')).toContainText('任务 A');
  await expect(page.getByRole('textbox', { name: '设计需求' })).toBeVisible();
});
test('authentication bootstrap keeps an existing task in its loading state', async ({ page }) => {
  await setup(page, {
    initialOwner: 'guest_polish',
    intercept: async (route, path) => {
      if (path !== `/api/design-conversations/${a}`) return false;
      await sleep(650);
      await json(route, { ok: true, conversation: session(a, '任务 A') });
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await page.waitForTimeout(120);
  await expect(page.getByRole('heading', { name: '正在读取对话…' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '设计需求' })).toHaveCount(0);
  await expect(page.locator('.conversation-heading')).toContainText('任务 A');
  await expect(page.getByRole('textbox', { name: '设计需求' })).toBeVisible();
});
test('A to B to A uses the newest selection even when the first A reply is last', async ({
  page
}) => {
  let reads = 0;
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== `/api/design-conversations/${a}`) return false;
      reads += 1;
      const snapshot = session(a, '任务 A');
      snapshot.messages[0]!.text = reads === 1 ? '过时的 A 快照' : '最新的 A 快照';
      if (reads === 1) await sleep(850);
      await json(route, { ok: true, conversation: snapshot });
      return true;
    }
  });
  await page.goto('/artigen/create');
  await expect(page.locator('.history-item')).toHaveCount(2);
  await select(page, a);
  await select(page, b);
  await expect(page.locator('.conversation-heading')).toContainText('任务 B');
  await select(page, a);
  await expect(page.locator('.message-body')).toContainText('最新的 A 快照');
  await page.waitForTimeout(900);
  await expect(page.locator('.message-scroll')).not.toContainText('过时的 A 快照');
});
test('switching tasks and unmounting stop unfinished tool polling', async ({ page }) => {
  const current = session(a, '任务 A');
  current.executions = [execution(a, 'tool_task')];
  let reads = 0;
  await setup(page, {
    sessions: [current, session(b, '任务 B')],
    intercept: async (route, path) => {
      if (path !== `/api/tool-tasks/${taskId}`) return false;
      reads += 1;
      await json(route, { ok: true, task: tool() });
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await expect.poll(() => reads).toBe(1);
  await select(page, b);
  await expect(page.locator('.conversation-heading')).toContainText('任务 B');
  await page.waitForTimeout(1800);
  expect(reads).toBe(1);
  await select(page, a);
  await expect.poll(() => reads).toBe(2);
  await page.goto('/artigen/agent');
  await page.waitForTimeout(1800);
  expect(reads).toBe(2);
});
test('a newer successful run reply cannot be overwritten by an older running reply', async ({
  page
}) => {
  const current = session(a, '任务 A');
  current.executions = [execution(a)];
  let reads = 0;
  await installEventSources(page);
  await setup(page, {
    sessions: [current],
    intercept: async (route, path) => {
      if (path !== `/api/agent-runs/${runId}`) return false;
      reads += 1;
      const snapshot = run(reads === 1 ? 'running' : 'succeeded');
      if (reads === 1) await sleep(700);
      await json(route, { ok: true, run: snapshot });
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await expect.poll(() => reads).toBe(1);
  await emitSource(page, `/api/agent-runs/${runId}/events`, 'step.recorded', {
    runId,
    eventId: 'fixture-event',
    type: 'step.recorded',
    data: {},
    createdAt: stamp
  });
  await expect(page.locator('.workspace-topbar .runtime-pill')).toContainText('已完成');
  await page.waitForTimeout(800);
  await expect(page.locator('.workspace-topbar .runtime-pill')).toContainText('已完成');
});
test('an execution-ready event survives an overlapping refresh and starts exactly once', async ({
  page
}) => {
  const current = session(a, '任务 A');
  current.executions = [
    {
      ...execution(a),
      status: 'queued',
      agentRunId: null,
      plan: {
        label: '网站提案',
        steps: ['取证', '交付'],
        objective: '制作网站提案',
        capabilities: { files: true },
        deliverables: ['report']
      }
    }
  ];
  let reads = 0,
    creates = 0;
  await installEventSources(page);
  await setup(page, {
    sessions: [current],
    intercept: async (route, path) => {
      if (path === `/api/design-conversations/${a}`) {
        reads += 1;
        const snapshot = structuredClone(current);
        if (reads === 2) await sleep(700);
        await json(route, { ok: true, conversation: snapshot });
        return true;
      }
      if (path.endsWith(`/executions/${executionId}/agent-quote`)) {
        await json(route, { ok: true, quote: quote(), execution: current.executions[0] });
        return true;
      }
      if (path === '/api/agent-runs' && route.request().method() === 'POST') {
        creates += 1;
        await json(route, { ok: true, run: run() }, 202);
        return true;
      }
      if (path.endsWith(`/executions/${executionId}/target`)) {
        current.executions[0]!.agentRunId = runId;
        current.executions[0]!.status = 'running';
        await json(route, { ok: true, execution: current.executions[0] });
        return true;
      }
      return false;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await expect(page.locator('.conversation-heading')).toContainText('任务 A');
  await emitSource(page, `/api/design-conversations/${a}/events`, 'execution.ready', {
    conversationId: a,
    type: 'execution.ready',
    data: { executionId }
  });
  await expect.poll(() => reads).toBe(2);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => creates).toBe(1);
  await page.waitForTimeout(900);
  expect(creates).toBe(1);
});
test('the header follows the latest tool execution rather than a completed historical run', async ({
  page
}) => {
  const current = session(a, '任务 A');
  current.executions = [
    { ...execution(a), executionId: 'historical-execution', status: 'succeeded' },
    execution(a, 'tool_task')
  ];
  await setup(page, {
    sessions: [current],
    currentRun: run('succeeded'),
    intercept: async (route, path) => {
      if (path !== `/api/tool-tasks/${taskId}`) return false;
      await json(route, { ok: true, task: tool() });
      return true;
    }
  });
  await page.goto(`/artigen/create?c=${a}`);
  await expect(page.locator('.workspace-topbar .runtime-pill')).toHaveText('运行中');
  await expect(page.locator('.workspace-topbar .task-cost')).toContainText('报价 10 / 50');
});
test('typing during Agent creation survives in the new-task draft after navigation', async ({
  page
}) => {
  let creates = 0;
  await setup(page, {
    intercept: async (route, path) => {
      if (path === '/api/agent-runs/quote') {
        await json(route, { ok: true, quote: quote() });
        return true;
      }
      if (path !== '/api/agent-runs' || route.request().method() !== 'POST') return false;
      creates += 1;
      await sleep(600);
      await json(route, { ok: true, run: run() }, 202);
      return true;
    }
  });
  await page.goto('/artigen/agent');
  const input = page.getByRole('textbox', { name: '任务目标' });
  await input.fill('已确认的原任务');
  await page.getByRole('button', { name: '发送任务目标' }).click();
  await expect(page.locator('.quote-summary')).toBeVisible();
  await page.getByRole('button', { name: '确认并运行', exact: true }).click();
  await expect.poll(() => creates).toBe(1);
  await input.fill('等待期间写下的新想法');
  await expect(page).toHaveURL(`/artigen/agent/runs/${runId}`);
  await page.goto('/artigen/agent');
  await expect(input).toHaveValue('等待期间写下的新想法');
});
test('changing accounts discards a late quote while preserving the other account draft', async ({
  page
}) => {
  let quotes = 0;
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== '/api/agent-runs/quote') return false;
      quotes += 1;
      await sleep(650);
      await json(route, { ok: true, quote: quote() });
      return true;
    }
  });
  await page.goto('/artigen/agent');
  const input = page.getByRole('textbox', { name: '任务目标' });
  await input.fill('账号 A 的任务');
  await page.getByRole('button', { name: '发送任务目标' }).click();
  await expect.poll(() => quotes).toBe(1);
  await page.evaluate(() => {
    localStorage.setItem('artigen:workspace-draft:v1:polish-other:agent%3Anew', '账号 B 的草稿');
    localStorage.setItem('app_user_id', 'polish-other');
    window.dispatchEvent(new Event('app-auth-changed'));
  });
  await expect(input).toHaveValue('账号 B 的草稿');
  await page.waitForTimeout(750);
  await expect(page.locator('.quote-summary')).toHaveCount(0);
  await expect(input).toHaveValue('账号 B 的草稿');
});
test('failure copy does not infer refunds or released credits from an error code', async ({
  page
}) => {
  const currentRun = run('failed');
  currentRun.budget.refunded = 0;
  currentRun.budget.released = 0;
  await setup(page, { currentRun });
  await page.goto(`/artigen/agent/runs/${runId}`);
  const summary = page.locator('.agent-message').first().locator('p');
  await expect(summary).toHaveText('任务达到最高预算，已安全停止。');
  await expect(
    page.locator('.settlement-summary div').filter({ hasText: '已退还' }).locator('dd')
  ).toHaveText('0 点');
  await expect(
    page.locator('.settlement-summary div').filter({ hasText: '已释放冻结' }).locator('dd')
  ).toHaveText('0 点');
  await expect(page.locator('.run-notice')).toHaveCount(0);
});
test('light-theme input focus remains visible on Create and Run', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'artigen-workspace-preferences',
      JSON.stringify({ version: 2, theme: 'light' })
    )
  );
  for (const [url, name, selector] of [
    ['/artigen/create', '设计需求', '.composer-box'],
    [`/artigen/agent/runs/${runId}`, '补充要求', '.composer-box']
  ]) {
    await page.goto(url!);
    await page.getByRole('textbox', { name: name! }).focus();
    await expect(page.locator(selector!)).toHaveCSS('outline-color', 'rgb(66, 100, 0)');
    await expect(page.locator(selector!)).toHaveCSS('outline-width', '2px');
    await expect(page.locator(selector!)).toHaveCSS('outline-style', 'solid');
  }
});
test('rapid run approval sends once and locks conflicting actions until acknowledgement', async ({
  page
}) => {
  const currentRun = run('waiting_user');
  currentRun.approvals = [
    {
      approvalId: 'run-approval',
      actionType: 'publish',
      recipient: 'https://example.invalid',
      riskLevel: 'high',
      changeSummary: '发布已确认的提案',
      status: 'pending',
      expiresAt: '2099-01-01T00:00:00Z',
      createdAt: stamp
    }
  ];
  let decisions = 0;
  await setup(page, {
    currentRun,
    intercept: async (route, path) => {
      if (path !== `/api/agent-runs/${runId}/input`) return false;
      decisions += 1;
      await sleep(650);
      currentRun.approvals[0]!.status = 'approved';
      await json(route, { ok: true });
      return true;
    }
  });
  await page.goto(`/artigen/agent/runs/${runId}`);
  await page.getByRole('button', { name: '仅批准这一次', exact: true }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => decisions).toBe(1);
  await expect(page.getByRole('button', { name: '拒绝', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '仅批准这一次', exact: true })).toHaveCount(0);
  expect(decisions).toBe(1);
});
test('Run input preserves a draft edited during submission and restores it after reload', async ({
  page
}) => {
  let submissions = 0;
  await setup(page, {
    intercept: async (route, path) => {
      if (path !== `/api/agent-runs/${runId}/input`) return false;
      submissions += 1;
      expect(route.request().postDataJSON().message).toBe('已经发出的补充要求');
      await sleep(600);
      await json(route, { ok: true });
      return true;
    }
  });
  await page.goto(`/artigen/agent/runs/${runId}`);
  const input = page.getByRole('textbox', { name: '补充要求' });
  await input.fill('已经发出的补充要求');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => submissions).toBe(1);
  await expect(input).toBeEnabled();
  await input.fill('尚未发送的下一条要求');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  await expect(input).toHaveValue('尚未发送的下一条要求');
  await page.reload();
  await expect(input).toHaveValue('尚未发送的下一条要求');
  expect(submissions).toBe(1);
});
