import type { Page } from '@playwright/test';
import type { AgentRun } from '../../src/agentImg/services/agentRuns';

export const inputRunId = '11111111-1111-4111-8111-111111111111';
export const inputConversationId = '77777777-7777-4777-8777-777777777777';
const stamp = '2026-10-15T03:00:00.000Z';

export const inputRun = (): AgentRun => ({
  runId: inputRunId,
  projectId: null,
  objective: '调研品牌网站的视觉和使用流程，交付带证据的报告与可编辑提案。',
  objectivePreview: '品牌网站研究与提案',
  status: 'running',
  model: { provider: 'cloudflare', name: '@cf/openai/gpt-oss-120b' },
  sandbox: { provider: 'cua', version: 'fixture-v1', takeoverAvailable: false },
  capabilities: { browser: true, files: true, shell: true },
  browserConfig: { allowedOrigins: ['https://brand.example'] },
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
    stepCount: 24,
    maxSteps: 120,
    replanCount: 0,
    pauseRequested: false,
    cancelRequested: false,
    checklist: {},
    planExplanation: '先记录证据，再整理问题并制作报告。',
    durableCheckpointSaved: true,
    plan: [
      { label: '记录官网页面证据', status: 'completed' },
      { label: '分析视觉和使用流程', status: 'in_progress' },
      { label: '制作并验证报告', status: 'pending' }
    ]
  },
  approvals: [],
  artifacts: [],
  subagents: [],
  error: null,
  expiresAt: '2099-10-15T03:00:00.000Z',
  createdAt: stamp,
  queuedAt: stamp,
  startedAt: stamp,
  finishedAt: null,
  updatedAt: stamp
});

export const activityEvents = (count = 20) => {
  const result: Array<{
    eventId: string;
    runId: string;
    subagentId: string | null;
    type: string;
    phase: string;
    summary: string;
    data: Record<string, unknown>;
    createdAt: string;
  }> = [];
  const add = (
    type: string,
    summary: string,
    data: Record<string, unknown>,
    subagentId: string | null = null
  ) => {
    result.push({
      eventId: String(result.length + 1),
      runId: inputRunId,
      subagentId,
      type,
      phase: 'production',
      summary,
      data,
      createdAt: new Date(Date.parse(stamp) + result.length * 1000).toISOString()
    });
  };
  add('plan.compiled', '计划已编译：先记录证据，再整理问题。', {});
  for (let i = 0; i < count; i++) {
    const toolName = i % 3 === 0 ? 'sandbox_shell' : 'browser_dom';
    const callId = `fixture-call-${i}`;
    add('tool.call.started', `开始第 ${i + 1} 次操作`, { toolName, callId });
    if (i !== count - 1)
      add('tool.call.completed', `第 ${i + 1} 次操作已返回`, {
        toolName,
        callId,
        ok: i !== count - 3
      });
    if (i === 5) add('context.compacted', '上下文已整理，保留页面证据和当前计划。', {});
  }
  return result;
};

export const installAgentInputFixture = async (
  page: Page,
  options: { theme?: string; events?: ReturnType<typeof activityEvents>; inspector?: boolean } = {}
) => {
  const run = inputRun();
  const state = {
    run,
    quotes: [] as Record<string, unknown>[],
    creates: [] as Record<string, unknown>[],
    inputs: [] as Record<string, unknown>[],
    designMessages: [] as Record<string, unknown>[],
    uploads: 0,
    uploadDelay: 0,
    inputDelay: 0,
    designDelay: 0,
    quoteDelay: 0,
    inputFail: false,
    uploadFail: false,
    createDelay: 0,
    createFail: false,
    unknown: [] as string[]
  };
  const conversation = {
    conversationId: inputConversationId,
    projectId: null,
    title: '品牌网站设计需求',
    status: 'active',
    autoCreditCap: 50,
    clarificationRounds: 0,
    expiresAt: '2099-10-15T03:00:00.000Z',
    createdAt: stamp,
    updatedAt: stamp,
    messages: [] as Record<string, unknown>[],
    executions: [],
    uploads: []
  };
  let conversationCreated = false;
  await page.clock.setFixedTime(new Date('2026-10-15T07:00:00.000Z'));
  await page.addInitScript(
    ({ theme, inspector }) => {
      localStorage.setItem('app_user_id', 'input-fixture');
      localStorage.setItem(
        'artigen-workspace-preferences',
        JSON.stringify({
          version: 2,
          theme,
          ...(inspector ? {resourceMode:'task'} : {}),
          ...(inspector === undefined ? {} : { rightCollapsed: !inspector })
        })
      );
      const sources: Array<EventTarget & { url: string; closed: boolean }> = [];
      class FixtureEventSource extends EventTarget {
        url: string;
        closed = false;
        constructor(url: string) {
          super();
          this.url = url;
          sources.push(this);
        }
        close() {
          this.closed = true;
        }
      }
      Object.assign(window, { EventSource: FixtureEventSource, inputFixtureSources: sources });
    },
    { theme: options.theme || 'dark', inspector: options.inspector }
  );
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const p = url.pathname;
    const method = route.request().method();
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (p === '/api/workspace/navigation') return json({ok:true,projects:[],sessions:[],nextCursor:null});
    if (/\/api\/agent-runs\/[^/]+\/messages$/.test(p)) return json({ok:true,messages:[],nextCursor:null});
    if (/\/api\/agent-runs\/[^/]+\/(?:activity|history)$/.test(p)) return json({ok:true,events:[]});
    if (p === '/api/auth/session')
      return json({
        ok: true,
        authenticated: true,
        userId: 'input-fixture',
        csrfToken: 'fixture-csrf'
      });
    if (p === '/api/collection/event') return json({ ok: true }, 202);
    if (p === '/api/credits/balance') return json({ ok: true, balance: 120 });
    if (p === '/api/agent/status')
      return json({
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
          subagentsEnabled: true,
          subagentMaxConcurrent: 3
        }
      });
    if (p === '/api/agent-browser-profiles') return json({ ok: true, profiles: [] });
    if (p === '/api/agent-runs/quote') {
      const body = route.request().postDataJSON();
      state.quotes.push(body);
      await wait(state.quoteDelay);
      return json({
        ok: true,
        quote: {
          currency: 'credits',
          freeCreditsRemaining: 120,
          estimatedCredits: { minimum: 18, maximum: 42 },
          maximumCredits: body.maxCredits,
          hardMaximumCredits: 500,
          requiredPaidHold: 30,
          canStart: true,
          limits: { minutes: 45, steps: 120, memoryMb: 4096, diskGb: 10, concurrentRuns: 1 },
          requirements: {
            database: true,
            payloadEncryption: true,
            modelProvider: true,
            sandboxProvider: true
          }
        }
      });
    }
    if (p === '/api/agent-assets') {
      state.uploads += 1;
      await wait(state.uploadDelay);
      if (state.uploadFail) return json({ ok: false, error: { code: 'UPLOAD_FAILED' } }, 503);
      const count = (
        route
          .request()
          .postDataBuffer()
          ?.toString()
          .match(/name="files"; filename=/g) || []
      ).length;
      return json(
        {
          ok: true,
          assets: Array.from({ length: count }, (_, i) => ({
            assetId: `90000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
          }))
        },
        201
      );
    }
    if (p === '/api/agent-runs' && method === 'GET') return json({ ok: true, runs: [state.run] });
    if (p === '/api/agent-runs' && method === 'POST') {
      state.creates.push(route.request().postDataJSON());
      await wait(state.createDelay);
      if (state.createFail) return json({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
      return json({ ok: true, run: state.run }, 201);
    }
    if (p === `/api/agent-runs/${inputRunId}/input`) {
      state.inputs.push(route.request().postDataJSON());
      await wait(state.inputDelay);
      return state.inputFail
        ? json({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } }, 503)
        : json({ ok: true });
    }
    if (p === `/api/agent-runs/${inputRunId}`) return json({ ok: true, run: state.run });
    if (p === '/api/design-assistant/status')
      return json({
        ok: true,
        status: {
          enabled: true,
          workerEnabled: true,
          plannerReady: true,
          model: '@cf/openai/gpt-oss-120b',
          imageModel: 'Kwai-Kolors/Kolors',
          autoCreditCap: 50,
          queued: 0,
          running: 0
        }
      });
    if (p === '/api/design-conversations') {
      if (method === 'POST') {
        conversationCreated = true;
        return json({ ok: true, conversation }, 201);
      }
      return json({ ok: true, conversations: conversationCreated ? [conversation] : [] });
    }
    if (p === `/api/design-conversations/${inputConversationId}/messages`) {
      const body = route.request().postDataJSON();
      state.designMessages.push(body);
      await wait(state.designDelay);
      const message = {
        messageId: `message-${state.designMessages.length}`,
        sequence: state.designMessages.length,
        role: 'user',
        kind: 'text',
        status: 'complete',
        text: body.message,
        attachments: body.attachments || [],
        questions: [],
        assumptions: [],
        memoryCandidates: [],
        createdAt: stamp
      };
      conversation.messages.push(message);
      return json({ ok: true, message }, 201);
    }
    if (p === `/api/design-conversations/${inputConversationId}`)
      return json({ ok: true, conversation });
    if (p.endsWith('/authorizations')) return json({ ok: true, authorizations: [] });
    if (p.endsWith('/events')) return route.abort();
    state.unknown.push(`${method} ${p}`);
    return json({ ok: false, error: { code: 'FIXTURE_UNEXPECTED_API' } }, 404);
  });
  const emit = async (events = options.events || activityEvents()) => {
    await page.waitForFunction((id) => {
      const sources = (
        window as unknown as { inputFixtureSources?: Array<{ url: string; closed: boolean }> }
      ).inputFixtureSources;
      return sources?.some(
        (source) => source.url.includes(`/agent-runs/${id}/events`) && !source.closed
      );
    }, inputRunId);
    await page.evaluate(
      ({ id, events }) => {
        const sources = (
          window as unknown as {
            inputFixtureSources: Array<EventTarget & { url: string; closed: boolean }>;
          }
        ).inputFixtureSources;
        const source = sources.find((s) => s.url.includes(`/agent-runs/${id}/events`) && !s.closed);
        if (!source) throw new Error('Run event source was not opened');
        events.forEach((event) =>
          source.dispatchEvent(new MessageEvent(event.type, { data: JSON.stringify(event) }))
        );
      },
      { id: inputRunId, events }
    );
  };
  return { state, emit };
};
