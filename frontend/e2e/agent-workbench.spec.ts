import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectWorkspaceGeometry, installDevEnvironmentBadge } from './helpers/workspaceLayoutAudit';

const auditWorkspaceAccessibility = async (page: Page) => page.locator('.agent-workspace-shell').evaluate((root) => {
  const visible = (element: Element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
  };
  const accessibleName = (element: Element) => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) return labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return element.getAttribute('aria-label') || Array.from(element.labels || []).map((label) => label.textContent || '').join(' ').trim();
    }
    return element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('title') || '';
  };
  const missingNames = Array.from(root.querySelectorAll('button,a[href],input,textarea,select,[role="tab"],[role="separator"]'))
    .filter(visible)
    .filter((element) => !accessibleName(element))
    .map((element) => element.outerHTML.slice(0, 180));

  const rgb = (value: string) => {
    const channels = (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return value.startsWith('color(srgb') ? channels.map((channel) => channel * 255) : channels;
  };
  const luminance = (channels: number[]) => channels.reduce((sum, channel, index) => {
    const normalized = channel / 255;
    const linear = normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  const effectiveBackground = (element: Element) => {
    let current: Element | null = element;
    while (current) {
      const value = getComputedStyle(current).backgroundColor;
      const alpha = Number((value.match(/[\d.]+/g) || [0, 0, 0, 0])[3] ?? 1);
      if (value !== 'transparent' && alpha >= 0.95) return rgb(value);
      current = current.parentElement;
    }
    return [14, 16, 15];
  };
  const lowContrast = Array.from(root.querySelectorAll('p,small,dt,dd,b,strong,label,button,a,span'))
    .filter(visible)
    .filter((element) => element.children.length === 0 && Boolean(element.textContent?.trim()))
    .map((element) => {
      const foregroundColor = getComputedStyle(element).color;
      const backgroundColor = effectiveBackground(element);
      const foreground = luminance(rgb(foregroundColor));
      const background = luminance(backgroundColor);
      const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      return { text: element.textContent?.trim().slice(0, 50), ratio, fontSize: Number.parseFloat(getComputedStyle(element).fontSize), foregroundColor, backgroundColor };
    })
    .filter((entry) => entry.fontSize < 18 && entry.ratio < 4.5);
  return { missingNames, lowContrast };
});

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
    onQuote?: () => void;
    createDelayMs?: number;
    failQuoteAt?: number;
    imageGenerationPublicEnabled?: boolean;
    subagentsEnabled?: boolean;
    quoteRequirements?: Record<string, boolean>;
  } = {}
) => {
  let quoteRequestCount = 0;
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
  await page.route('**/api/agent-runs/quote', async (route) => {
    quoteRequestCount += 1;
    options.onQuote?.();
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (options.failQuoteAt === quoteRequestCount) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'AGENT_REQUEST_FAILED' } })
      });
    }
    return route.fulfill({
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
          requirements: options.quoteRequirements || {
            database: true,
            payloadEncryption: true,
            modelProvider: true,
            sandboxProvider: true
          }
        }
      })
    });
  });
  await page.route('**/api/agent-runs', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, runs: [baseRun] })
      });
    }
    if (route.request().method() === 'POST' && options.onCreate) {
      options.onCreate(route.request().postDataJSON());
      if (options.createDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.createDelayMs));
      }
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
  await expect(page.getByRole('heading', { name: '今天要一起完成什么？' })).toBeVisible();
  await expect(page.locator('.conversation-empty')).toBeVisible();
  await expect(page.locator('.objective-composer')).toBeVisible();
  await expect(page.locator('.objective-composer .composer-box')).toBeVisible();
  await expect(page.locator('.task-presets')).toHaveCount(0);
  await expect(page.locator('.inspector-tabs').getByRole('tab')).toHaveCount(5);
  await expect(page.getByRole('tab', { name: '环境' })).toHaveAttribute('aria-selected', 'true');
  const environment = page.locator('#workspace-panel-environment');
  await expect(environment.getByText('Qwen/Qwen3-8B', { exact: true })).not.toBeVisible();
  await expect(environment.getByText('Kwai-Kolors/Kolors', { exact: true })).not.toBeVisible();
  await environment.getByText('技术详情', { exact: true }).click();
  await expect(environment).toContainText('Qwen/Qwen3-8B');
  await expect(environment).toContainText('Kwai-Kolors/Kolors');
  await expect(page.locator('.history-run')).toContainText('三路并行设计产品审计');
  const inspectorSurface = await page.locator('.workspace-right').evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderRadius: style.borderRadius, marginTop: style.marginTop, marginRight: style.marginRight };
  });
  expect(inspectorSurface).toEqual({ borderRadius: '18px', marginTop: '12px', marginRight: '12px' });
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

test('desktop panel separators expose values and support arrows plus Home and End', async ({ page }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/agent');

  const left = page.getByRole('separator', { name: '调整左栏宽度' });
  await left.focus();
  await page.keyboard.press('End');
  await expect(left).toHaveAttribute('aria-valuenow', '340');
  await page.keyboard.press('Home');
  await expect(left).toHaveAttribute('aria-valuenow', '216');
  await page.keyboard.press('ArrowRight');
  await expect(left).toHaveAttribute('aria-valuenow', '224');

  const right = page.getByRole('separator', { name: '调整右栏宽度' });
  await right.focus();
  await page.keyboard.press('End');
  await expect(right).toHaveAttribute('aria-valuenow', '480');
  await page.keyboard.press('ArrowRight');
  await expect(right).toHaveAttribute('aria-valuenow', '472');
});

test('image delivery auto-grants Kolors, preserves Qwen and subagent locks, and starts only after a current quote', async ({ page }) => {
  const created: Array<Record<string, unknown>> = [];
  await installSharedApi(page, { onCreate: (body) => created.push(body) });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/agent');

  await page.locator('.objective-composer textarea').fill('为 Artigen 设计一张克制、专业的品牌主视觉');
  const imageDeliverable = page.locator('.option-grid label').filter({ hasText: 'IMAGE' });
  await imageDeliverable.click();
  const imageCapability = page.locator('.capability-list label').filter({ hasText: '生成图片' });
  await expect(imageCapability.locator('input')).toBeChecked();
  await expect(page.locator('.capability-list label').filter({ hasText: '并行处理' }).locator('input')).toBeChecked();

  await page.getByRole('button', { name: '发送任务目标' }).click();
  await expect(page.locator('.quote-summary')).toContainText('18–42');
  await expect(page.locator('.conversation-thread')).toContainText('为 Artigen 设计一张克制、专业的品牌主视觉');
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

test('rapid submit produces one quote request before the busy state is painted', async ({ page }) => {
  let quoteRequests = 0;
  await installSharedApi(page, { onQuote: () => { quoteRequests += 1; } });
  await page.goto('/artigen/agent');

  await page.getByRole('textbox', { name: '任务目标' }).fill('生成一份真实报价但不要重复提交');
  await page.getByRole('button', { name: '发送任务目标' }).dblclick({ delay: 10 });

  await expect(page.locator('.quote-summary')).toContainText('18–42');
  expect(quoteRequests).toBe(1);
});

test('quote fails closed when a runtime prerequisite is not ready', async ({ page }) => {
  const created: Array<Record<string, unknown>> = [];
  await installSharedApi(page, {
    onCreate: (body) => created.push(body),
    quoteRequirements: { database: true, payloadEncryption: true, modelProvider: false, sandboxProvider: true }
  });
  await page.goto('/artigen/agent');

  await page.getByRole('textbox', { name: '任务目标' }).fill('运行前先验证模型服务就绪状态');
  await page.getByRole('button', { name: '发送任务目标' }).click();

  await expect(page.getByText('模型服务尚未就绪，请稍后重试。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认并运行' })).toBeDisabled();
  expect(created).toHaveLength(0);
});

test('quote fails closed when a required readiness field is omitted', async ({ page }) => {
  const created: Array<Record<string, unknown>> = [];
  await installSharedApi(page, {
    onCreate: (body) => created.push(body),
    quoteRequirements: { database: true }
  });
  await page.goto('/artigen/agent');

  await page.getByRole('textbox', { name: '任务目标' }).fill('缺少 readiness 字段时不要启动');
  await page.getByRole('button', { name: '发送任务目标' }).click();

  await expect(page.getByRole('button', { name: '确认并运行' })).toBeDisabled();
  await expect(page.getByText('安全载荷服务尚未就绪，请稍后重试。')).toBeVisible();
  expect(created).toHaveLength(0);
});

test('a failed quote refresh invalidates the previous authorization', async ({ page }) => {
  await installSharedApi(page, { failQuoteAt: 2 });
  await page.goto('/artigen/agent');

  const objective = page.getByRole('textbox', { name: '任务目标' });
  await objective.fill('刷新失败后旧报价不得继续使用');
  await page.getByRole('button', { name: '发送任务目标' }).click();
  await expect(page.getByRole('button', { name: '确认并运行' })).toBeEnabled();

  await page.getByRole('button', { name: '发送任务目标' }).click();
  await expect(page.getByText('需要你处理一项问题')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认并运行' })).toHaveCount(0);
});

test('rapid run confirmation creates exactly one task', async ({ page }) => {
  const created: Array<Record<string, unknown>> = [];
  await installSharedApi(page, {
    onCreate: (body) => created.push(body),
    createDelayMs: 120
  });
  await page.goto('/artigen/agent');

  await page.getByRole('textbox', { name: '任务目标' }).fill('确认按钮快速点击也只能创建一次');
  await page.getByRole('button', { name: '发送任务目标' }).click();
  const confirm = page.getByRole('button', { name: '确认并运行' });
  await expect(confirm).toBeEnabled();
  await confirm.dblclick({ delay: 10 });

  await expect(page).toHaveURL(`/artigen/agent/runs/${runId}`);
  expect(created).toHaveLength(1);
});

test('geometry audit does not let vertical scrolling mask horizontal clipping', async ({ page }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/artigen/agent');
  await page.locator('.conversation-empty').evaluate((container) => {
    const scroller = document.createElement('div');
    scroller.style.cssText = 'position:absolute;left:24px;top:80px;width:100px;height:60px;overflow-x:hidden;overflow-y:auto;z-index:20';
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = 'axis-clipped-control';
    control.style.cssText = 'display:block;width:180px;height:44px';
    const filler = document.createElement('div');
    filler.style.height = '120px';
    scroller.append(control, filler);
    container.append(scroller);
  });

  await expect(expectWorkspaceGeometry(page)).rejects.toThrow(/axis-clipped-control/);
});

test('geometry audit does not let outer scrolling mask an inner hard clip', async ({ page }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/artigen/agent');
  await page.locator('.conversation-empty').evaluate((container) => {
    const outer = document.createElement('div');
    outer.style.cssText = 'position:absolute;left:24px;top:80px;width:120px;height:60px;overflow-x:auto;overflow-y:hidden;z-index:20';
    const inner = document.createElement('div');
    inner.style.cssText = 'width:200px;overflow-x:hidden';
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = 'nested-hard-clipped-control';
    control.style.cssText = 'display:block;width:260px;height:44px';
    inner.append(control);
    outer.append(inner);
    container.append(outer);
  });

  await expect(expectWorkspaceGeometry(page)).rejects.toThrow(/nested-hard-clipped-control/);
});

test('geometry audit lets a later hard clip override an inner scrollable clip', async ({ page }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/artigen/agent');
  await page.locator('.conversation-empty').evaluate((container) => {
    const outer = document.createElement('div');
    outer.style.cssText = 'position:absolute;left:24px;top:80px;width:100px;height:60px;overflow-x:hidden;overflow-y:hidden;z-index:20';
    const inner = document.createElement('div');
    inner.style.cssText = 'width:160px;overflow-x:auto';
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = 'outer-hard-clipped-control';
    control.style.cssText = 'display:block;width:260px;height:44px';
    inner.append(control);
    outer.append(inner);
    container.append(outer);
  });

  await expect(expectWorkspaceGeometry(page)).rejects.toThrow(/outer-hard-clipped-control/);
});

test('image and subagent controls fail closed when production flags are unavailable', async ({ page }) => {
  await installSharedApi(page, { imageGenerationPublicEnabled: false, subagentsEnabled: false });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/artigen/agent');

  const imageDeliverable = page.locator('.option-grid label').filter({ hasText: 'IMAGE' });
  await expect(imageDeliverable.locator('input')).toBeDisabled();
  const imageCapability = page.locator('.capability-list label').filter({ hasText: '生成图片' });
  await expect(imageCapability.locator('input')).toBeDisabled();
  const subagentCapability = page.locator('.capability-list label').filter({ hasText: '并行处理' });
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

test('approval denial reason is explicitly labelled and keeps one recommended action', async ({ page }) => {
  const approvalRun = structuredClone(baseRun) as any;
  approvalRun.approvals = [{
    approvalId: '61111111-1111-4111-8111-111111111111',
    runId,
    actionType: 'publish',
    riskLevel: 'high',
    status: 'pending',
    recipient: 'https://example.com',
    changeSummary: '发布一份只读设计审计摘要',
    evidenceSummary: '已生成并验证摘要',
    impactSummary: '会写入第三方站点',
    rollbackSummary: '可以在站点后台删除',
    expiresAt: '2030-09-14T08:00:00.000Z',
    createdAt: now
  }];
  await installRunApi(page, { run: approvalRun });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`/artigen/agent/runs/${runId}`);

  const reason = page.getByLabel('拒绝原因（可选）');
  await expect(reason).toBeVisible();
  await reason.fill('需要先确认品牌团队意见');
  await expect(page.locator('.approval-card .approval-primary')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '拒绝' })).toBeVisible();
});

test('mobile workspace uses full-height drawers, restores focus, and never scrolls horizontally', async ({ page, browserName }) => {
  await installSharedApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/artigen/agent');
  await installDevEnvironmentBadge(page);

  const historyButton = page.getByRole('button', { name: '打开历史' });
  await historyButton.click();
  await expect(page.locator('.agent-workspace-shell')).toHaveClass(/left-drawer-open/);
  await expect(page.locator('.workspace-left')).toBeVisible();
  await expect.poll(() => page.locator('.workspace-left').evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0);
  await expectWorkspaceGeometry(page, { mobile: true });
  const refreshRunsButton = page.getByRole('button', { name: '刷新任务' });
  await expect(refreshRunsButton).toHaveCSS('width', '44px');
  await expect(refreshRunsButton).toHaveCSS('height', '44px');
  await page.keyboard.press('Tab');
  await refreshRunsButton.focus();
  await expect(refreshRunsButton).toBeFocused();
  await expect.poll(() => refreshRunsButton.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  await expect(refreshRunsButton).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Escape');
  await expect(page.locator('.agent-workspace-shell')).not.toHaveClass(/left-drawer-open/);
  await expect(historyButton).toBeFocused();

  const inspectorButton = page.getByRole('button', { name: '打开检查器' });
  await inspectorButton.click();
  await expect(page.locator('.agent-workspace-shell')).toHaveClass(/right-drawer-open/);
  await expect(page.locator('.workspace-right')).toBeVisible();
  await expect.poll(() => page.locator('.workspace-right').evaluate((element) => Math.round(element.getBoundingClientRect().right))).toBe(390);
  await expectWorkspaceGeometry(page, { mobile: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('.agent-workspace-shell')).not.toHaveClass(/right-drawer-open/);
  await expect(inspectorButton).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expectWorkspaceGeometry(page, { mobile: true });
  if (process.env.ARTIGEN_CAPTURE_REVIEW && browserName === 'chromium') {
    await page.screenshot({ path: '.impeccable/review/agent-workbench-390-dark.png', fullPage: true });
  }
});

test('workspace reflows across desktop, tablet, mobile, landscape and 200 percent equivalent width', async ({ page }) => {
  await installSharedApi(page);
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
    await page.goto('/artigen/agent');
    await installDevEnvironmentBadge(page);
    await expect(page.locator('.objective-composer')).toBeVisible();
    await expectWorkspaceGeometry(page, { mobile: viewport.width < 800 });
    if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
      await page.screenshot({
        path: path.resolve(process.cwd(), `../.artifacts/workspace-micro-alignment-${capturePass}/agent-zero-${viewport.name}.png`),
        animations: 'disabled'
      });
    }
  }
});

test('run detail keeps chrome, composer and inspector aligned across extreme viewports', async ({ page }) => {
  await installRunApi(page);
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
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-edge-399', width: 399, height: 844 },
    { name: 'mobile-landscape-844', width: 844, height: 390 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/artigen/agent/runs/${runId}`);
    await installDevEnvironmentBadge(page);
    await expect(page.locator('.message-composer')).toBeVisible();
    await expectWorkspaceGeometry(page, { mobile: viewport.width < 800 });
    if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
      await page.screenshot({
        path: path.resolve(process.cwd(), `../.artifacts/workspace-micro-alignment-${capturePass}/run-detail-${viewport.name}.png`),
        animations: 'disabled'
      });
    }
    if (viewport.width < 1200) {
      await page.getByRole('button', { name: '打开检查器' }).click();
      await page.getByRole('tab', { name: '子 Agent' }).click();
      await expectWorkspaceGeometry(page, { mobile: viewport.width < 800 });
      if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
        await page.screenshot({
          path: path.resolve(process.cwd(), `../.artifacts/workspace-micro-alignment-${capturePass}/run-subagents-${viewport.name}.png`),
          animations: 'disabled'
        });
      }
      await page.keyboard.press('Escape');
    }
  }
});

test('dark, light, system and reduced-motion workspace states keep names and contrast', async ({ page }) => {
  await installSharedApi(page);
  const capturePass = process.env.ARTIGEN_CAPTURE_PASS || 'review';
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/artigen/agent');
  const shell = page.locator('.agent-workspace-shell');
  await expect(shell).toHaveAttribute('data-theme', 'dark');
  let audit = await auditWorkspaceAccessibility(page);
  expect(audit.missingNames).toEqual([]);
  expect(audit.lowContrast).toEqual([]);
  if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
    await page.screenshot({ path: path.resolve(process.cwd(), `../.artifacts/workspace-micro-alignment-${capturePass}/theme-dark-reduced-motion.png`), animations: 'disabled' });
  }

  const themeControl = page.locator('.workspace-account button').nth(1);
  await themeControl.click();
  await expect(shell).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  audit = await auditWorkspaceAccessibility(page);
  expect(audit.missingNames).toEqual([]);
  expect(audit.lowContrast).toEqual([]);
  if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
    await page.screenshot({ path: path.resolve(process.cwd(), `../.artifacts/workspace-micro-alignment-${capturePass}/theme-light.png`), animations: 'disabled' });
  }

  await themeControl.click();
  await expect(shell).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('artigen-workspace-preferences') || '{}').theme)).toBe('system');
  if (process.env.ARTIGEN_CAPTURE_LAYOUT) {
    await page.screenshot({ path: path.resolve(process.cwd(), `../.artifacts/workspace-micro-alignment-${capturePass}/theme-system-dark.png`), animations: 'disabled' });
  }
  const duration = await page.locator('.prompt-suggestions button').first().evaluate((element) =>
    Math.max(...getComputedStyle(element).transitionDuration.split(',').map((value) => {
      const durationValue = value.trim();
      return Number.parseFloat(durationValue) * (durationValue.endsWith('ms') ? 1 : 1000);
    }))
  );
  expect(duration).toBeLessThanOrEqual(0.02);
});
