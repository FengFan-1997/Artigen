import { expect, test, type Page } from '@playwright/test';

const runId = '11111111-1111-4111-8111-111111111111';
const childIds = [
  '21111111-1111-4111-8111-111111111111',
  '31111111-1111-4111-8111-111111111111',
  '41111111-1111-4111-8111-111111111111'
];
const now = '2026-08-14T08:00:00.000Z';

const child = (ordinal: number, status: 'running' | 'succeeded' | 'failed' | 'cancelled' = 'running') => ({
  subagentId: childIds[ordinal - 1],
  runId,
  ordinal,
  role: ['品牌研究', '视觉分析', '体验起草'][ordinal - 1],
  label: ['竞品定位', '视觉系统', '体验建议'][ordinal - 1],
  status,
  progress: { stepCount: status === 'running' ? 7 : 12, maxSteps: 20, cancelRequested: false },
  usage: { credits: ordinal * 1.25, inputTokens: 600, outputTokens: 320, provider: 'siliconflow' },
  summary: status === 'running' ? '正在整理独立上下文。' : '已返回可合并的结构化摘要。',
  outputFiles: status === 'running' ? [] : [{ path: `notes-${ordinal}.md`, byteSize: 1024, sha256: 'a'.repeat(64) }],
  error: status === 'failed' ? { code: 'AGENT_SUBAGENT_FAILED' } : null,
  expiresAt: '2026-09-14T08:00:00.000Z',
  createdAt: now,
  startedAt: now,
  finishedAt: status === 'running' ? null : now,
  updatedAt: now
});

const baseRun = {
  runId,
  projectId: null,
  objective: '调研三个设计产品，分别分析品牌定位、视觉系统与产品体验，交付报告和演示文稿。',
  objectivePreview: '三路并行设计产品审计',
  status: 'running',
  model: { provider: 'siliconflow', name: 'Qwen/Qwen3-8B' },
  sandbox: { provider: 'cua', version: 'pinned-v1', takeoverAvailable: false },
  capabilities: { research: true, browser: true, files: true, shell: true, subagents: true },
  browserConfig: { allowedOrigins: ['https://example.com'], profileId: null, persistSession: false },
  budget: {
    maximum: 50,
    freeReserved: 20,
    used: 12.5,
    charged: 0,
    refunded: 0,
    frozen: 30,
    released: 0
  },
  progress: {
    stepCount: 18,
    maxSteps: 120,
    replanCount: 0,
    pauseRequested: false,
    cancelRequested: false,
    checklist: {},
    planExplanation: '先并行分析，再由父 Agent 汇总并验证。',
    plan: [
      { label: '建立三路独立分析上下文', status: 'completed' },
      { label: '汇总品牌、视觉与体验结论', status: 'in_progress' },
      { label: '制作并验证报告与演示文稿', status: 'pending' }
    ],
    durableCheckpointSaved: true
  },
  approvals: [],
  artifacts: [{
    artifactId: '51111111-1111-4111-8111-111111111111',
    assetId: null,
    parentArtifactId: null,
    role: 'pdf',
    filename: 'artigen-design-audit.pdf',
    mimeType: 'application/pdf',
    byteSize: 245760,
    sha256: 'b'.repeat(64),
    version: 1,
    verificationStatus: 'passed',
    verification: {},
    sources: [],
    costCredits: 0,
    url: `/api/agent-runs/${runId}/artifacts/51111111-1111-4111-8111-111111111111`,
    expiresAt: '2026-09-14T08:00:00.000Z',
    createdAt: now
  }],
  subagents: [child(1), child(2, 'succeeded'), child(3)],
  error: null,
  expiresAt: '2026-09-14T08:00:00.000Z',
  createdAt: now,
  queuedAt: now,
  startedAt: now,
  finishedAt: null,
  updatedAt: now
};

const installSharedApi = async (
  page: Page,
  options: {
    onCreate?: (body: Record<string, unknown>) => void;
    imageGenerationPublicEnabled?: boolean;
    subagentsEnabled?: boolean;
  } = {}
) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, authenticated: true, userId: 'agent-e2e', csrfToken: 'csrf-e2e' })
  }));
  await page.route('**/api/collection/event', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));
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
        concurrency: 2,
        modelFamily: 'Qwen/Qwen3-8B',
        sandboxMode: 'local',
        browserReady: true,
        egressVerified: true,
        desktopRelayReady: true,
        sandboxImageRef: 'artigen/cua-xfce:0.1.15-tools-v2',
        browserPublicEnabled: true,
        imageGenerationPublicEnabled: options.imageGenerationPublicEnabled !== false,
        subagentsEnabled: options.subagentsEnabled !== false,
        subagentMaxConcurrent: 3,
        subagentSandboxMode: 'shared-v1',
        accessMode: 'authenticated-v1',
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
        freeCreditsRemaining: 120,
        estimatedCredits: { minimum: 18, maximum: 42 },
        maximumCredits: 50,
        hardMaximumCredits: 500,
        requiredPaidHold: 30,
        canStart: true,
        limits: { minutes: 45, steps: 120, memoryMb: 4096, diskGb: 10, concurrentRuns: 1 },
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

const installRunApi = async (
  page: Page,
  options: {
    run?: typeof baseRun;
    onCancelChild?: (subagentId: string) => void;
    onCancelRun?: () => void;
  } = {}
) => {
  let currentRun = structuredClone(options.run || baseRun);
  await page.route('**/api/auth/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, authenticated: true, userId: 'agent-e2e', csrfToken: 'csrf-e2e' })
  }));
  await page.route('**/api/collection/event', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true })
  }));
  await page.route('**/api/agent-runs', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, runs: [currentRun] })
  }));
  await page.route(`**/api/agent-runs/${runId}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, run: currentRun })
  }));
  await page.route(`**/api/agent-runs/${runId}/events`, (route) => route.abort());
  await page.route(`**/api/agent-runs/${runId}/subagents/*/cancel`, (route) => {
    const subagentId = new URL(route.request().url()).pathname.split('/').at(-2) || '';
    options.onCancelChild?.(subagentId);
    const target = currentRun.subagents.find((item) => item.subagentId === subagentId)!;
    target.status = 'cancelled';
    target.progress.cancelRequested = true;
    target.finishedAt = now;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, subagent: target })
    });
  });
  await page.route(`**/api/agent-runs/${runId}/cancel`, (route) => {
    options.onCancelRun?.();
    currentRun = { ...currentRun, status: 'cancelled', error: { code: 'AGENT_CANCELLED' } } as typeof currentRun;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, run: currentRun })
    });
  });
};

test('computer Agent uses the unified three-lane workspace and five live inspector tabs', async ({ page, browserName }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/agent');

  await expect(page.locator('.agent-workspace-shell')).toBeVisible();
  await expect(page.locator('.workspace-left')).toContainText('Artigen');
  await expect(page.getByRole('heading', { name: '告诉我最终要交付什么。' })).toBeVisible();
  await expect(page.locator('.inspector-tabs').getByRole('tab')).toHaveCount(5);
  await expect(page.getByRole('tab', { name: '环境' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#workspace-panel-environment')).toContainText('Qwen/Qwen3-8B');
  await expect(page.locator('#workspace-panel-environment')).toContainText('Kwai-Kolors/Kolors');
  await expect(page.locator('.history-run')).toContainText('三路并行设计产品审计');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (process.env.ARTIGEN_CAPTURE_REVIEW && browserName === 'chromium') {
    await page.screenshot({ path: '.impeccable/review/agent-workbench-1440-dark.png', fullPage: true });
  }
});

test('command palette is global, keyboard trapped, and returns focus on Escape', async ({ page }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/agent');

  const newTask = page.locator('.new-task');
  await newTask.focus();
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: '命令面板' });
  await expect(palette).toBeVisible();
  await expect(palette.getByPlaceholder('搜索页面或动作…')).toBeFocused();
  await expect(palette).toContainText('电脑 Agent');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(newTask).toBeFocused();
});

test('image delivery auto-grants Kolors, preserves Qwen and subagent locks, and starts only after a current quote', async ({ page }) => {
  const created: Array<Record<string, unknown>> = [];
  await installSharedApi(page, { onCreate: (body) => created.push(body) });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/agent');

  await page.locator('.objective-composer textarea').fill('为 Artigen 设计一张克制、专业的品牌主视觉');
  const imageDeliverable = page.locator('.option-grid label').filter({ hasText: 'IMAGE' });
  await imageDeliverable.click();
  const imageCapability = page.locator('.capability-list label').filter({ hasText: 'AI 图片生成' });
  await expect(imageCapability.locator('input')).toBeChecked();
  await expect(page.locator('.capability-list label').filter({ hasText: '真实子 Agent' }).locator('input')).toBeChecked();

  await page.getByRole('button', { name: '检查费用' }).click();
  await expect(page.locator('.quote-bar')).toContainText('18–42');
  await expect(page.getByRole('button', { name: '确认并运行' })).toBeVisible();
  expect(created).toHaveLength(0);

  await page.getByRole('button', { name: '确认并运行' }).click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0].deliverables).toEqual(['image']);
  expect((created[0].capabilities as Record<string, boolean>).generate_images).toBe(true);
  expect((created[0].capabilities as Record<string, boolean>).subagents).toBe(true);
  expect(created[0].maxCredits).toBe(50);
  await expect(page).toHaveURL(`/artigen/agent/runs/${runId}`);
});

test('image and subagent controls fail closed when production flags are unavailable', async ({ page }) => {
  await installSharedApi(page, { imageGenerationPublicEnabled: false, subagentsEnabled: false });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/agent');

  const imageDeliverable = page.locator('.option-grid label').filter({ hasText: 'IMAGE' });
  await expect(imageDeliverable.locator('input')).toBeDisabled();
  const imageCapability = page.locator('.capability-list label').filter({ hasText: 'AI 图片生成' });
  await expect(imageCapability.locator('input')).toBeDisabled();
  const subagentCapability = page.locator('.capability-list label').filter({ hasText: '真实子 Agent' });
  await expect(subagentCapability.locator('input')).toBeDisabled();
  await expect(page.locator('.runtime-pill')).toContainText('单 Agent 就绪');
});

test('run detail exposes parent plus three isolated subagents and cancels one without stopping the parent', async ({ page, browserName }) => {
  const cancelled: string[] = [];
  await installRunApi(page, { onCancelChild: (id) => cancelled.push(id) });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/artigen/agent/runs/${runId}`);

  await expect(page.locator('.user-message')).toContainText(baseRun.objective);
  await page.getByRole('tab', { name: '子 Agent' }).click();
  await expect(page.locator('.parent-agent-card')).toContainText('父 Agent');
  await expect(page.locator('.subagent-card')).toHaveCount(3);
  await expect(page.locator('.subagent-card').nth(0)).toContainText('竞品定位');
  await expect(page.locator('.subagent-card').nth(1)).toContainText('视觉系统');
  await expect(page.locator('.subagent-card').nth(2)).toContainText('体验建议');
  if (process.env.ARTIGEN_CAPTURE_REVIEW && browserName === 'chromium') {
    await page.screenshot({ path: '.impeccable/review/agent-run-detail-1440-dark.png', fullPage: true });
  }

  await page.locator('.subagent-card').nth(0).getByRole('button', { name: '取消这个子 Agent' }).click();
  await expect.poll(() => cancelled).toEqual([childIds[0]]);
  await expect(page.locator('.subagent-card').nth(0)).toContainText('已取消');
  await expect(page.locator('.runtime-pill')).toContainText('执行中');
});

test('run detail keeps real plan, verified files, budget and two-click parent cancellation in one shell', async ({ page }) => {
  let cancelRequests = 0;
  await installRunApi(page, { onCancelRun: () => { cancelRequests += 1; } });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/artigen/agent/runs/${runId}`);

  await page.getByRole('tab', { name: '计划' }).click();
  await expect(page.locator('#workspace-panel-plan')).toContainText('建立三路独立分析上下文');
  await expect(page.locator('#workspace-panel-plan')).toContainText('汇总品牌、视觉与体验结论');
  await page.getByRole('tab', { name: /文件/ }).click();
  await expect(page.locator('#workspace-panel-files')).toContainText('artigen-design-audit.pdf');
  await expect(page.locator('#workspace-panel-files')).toContainText('passed');
  await page.getByRole('tab', { name: '环境' }).click();
  await expect(page.locator('.budget-card')).toContainText('12.5 / 50');

  const stop = page.getByRole('button', { name: '停止' });
  await stop.click();
  expect(cancelRequests).toBe(0);
  await expect(page.getByRole('button', { name: '确认停止' })).toBeVisible();
  await expect(page.locator('.run-notice')).toContainText('未使用冻结点数会释放');
  await page.getByRole('button', { name: '确认停止' }).click();
  await expect.poll(() => cancelRequests).toBe(1);
});

test('mobile workspace uses full-height drawers, restores focus, and never scrolls horizontally', async ({ page, browserName }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/agent');

  const historyButton = page.getByRole('button', { name: '打开历史' });
  await historyButton.click();
  await expect(page.locator('.agent-workspace-shell')).toHaveClass(/left-drawer-open/);
  await expect(page.locator('.workspace-left')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.agent-workspace-shell')).not.toHaveClass(/left-drawer-open/);
  await expect(historyButton).toBeFocused();

  const inspectorButton = page.getByRole('button', { name: '打开检查器' });
  await inspectorButton.click();
  await expect(page.locator('.agent-workspace-shell')).toHaveClass(/right-drawer-open/);
  await expect(page.locator('.workspace-right')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.agent-workspace-shell')).not.toHaveClass(/right-drawer-open/);
  await expect(inspectorButton).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (process.env.ARTIGEN_CAPTURE_REVIEW && browserName === 'chromium') {
    await page.screenshot({ path: '.impeccable/review/agent-workbench-390-dark.png', fullPage: true });
  }
});
