const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  IMAGE_MODEL,
  TEXT_MODEL,
  getDesignConversationConfig,
  normalizePlannerDecision,
  plannerMessages,
  repairPlannerRoute
} = require('../services/design-conversation-service');
const {
  decryptDesignMessage,
  encryptDesignMessage
} = require('../services/agent-payload-service');
const { installDesignConversationRoutes } = require('../routes/design-conversations');
const {
  resolveWorkerConcurrency,
  cleanupProviderSchedulers
} = require('../scripts/start-agent-worker');

const encryptionEnv = {
  AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}`
};

test('design messages are encrypted and bound to conversation, row and role', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const messageId = '22222222-2222-4222-8222-222222222222';
  const encrypted = encryptDesignMessage({
    conversationId,
    messageId,
    role: 'user',
    value: { text: '做一张夏日海报', attachments: [] },
    env: encryptionEnv
  });
  const record = {
    algorithm: encrypted.algorithm,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    ciphertext: encrypted.ciphertext
  };
  assert.deepEqual(decryptDesignMessage({
    conversationId,
    messageId,
    role: 'user',
    record,
    env: encryptionEnv
  }), { text: '做一张夏日海报', attachments: [] });
  assert.throws(() => decryptDesignMessage({
    conversationId,
    messageId,
    role: 'assistant',
    record,
    env: encryptionEnv
  }), { code: 'AGENT_PAYLOAD_DECRYPT_FAILED' });
});

test('planner prompt uses the server-selected text model and keeps Kolors for every image route', () => {
  const messages = plannerMessages({
    history: [],
    message: '生成海报',
    attachmentCount: 0,
    textModel: '@cf/openai/gpt-oss-120b'
  });
  assert.equal(TEXT_MODEL, 'Qwen/Qwen3-8B');
  assert.equal(IMAGE_MODEL, 'Kwai-Kolors/Kolors');
  assert.match(messages[0].content, /@cf\/openai\/gpt-oss-120b/);
  assert.doesNotMatch(messages[0].content, /Qwen\/Qwen3-8B/);
  assert.match(messages[0].content, /Kwai-Kolors\/Kolors/);
  assert.doesNotMatch(messages[0].content, /Qwen-Image-Edit/);
});

test('deterministic route repair keeps simple image tasks in the Kolors workflow', () => {
  const decision = normalizePlannerDecision({
    raw: { routeKind: 'reply', reply: '开始制作' },
    text: '帮我生成一张柚子气泡水夏日海报',
    attachments: [],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.equal(decision.routeKind, 'tool_task');
  assert.equal(decision.toolId, 'ai-design');
  assert.equal(decision.operation, 'generate');
  assert.equal(decision.options.profileId, 'standard-v1');
});

test('reference image generation waits for explicit upload and uses the existing Kolors profile', () => {
  const decision = normalizePlannerDecision({
    raw: { routeKind: 'tool_task', toolId: 'ai-design', operation: 'generate' },
    text: '参考这张图生成新的商品场景',
    attachments: [{ clientId: 'local-1', name: 'product.png', mimeType: 'image/png', byteSize: 100 }],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.equal(decision.status, 'waiting_upload');
  assert.equal(decision.options.profileId, 'product-reference-v1');
  assert.deepEqual(decision.options.referenceRoles, ['product']);
  assert.deepEqual(decision.plan.attachmentClientIds, ['local-1']);
});

test('Kolors cloud workflows select only the first compatible image before upload', () => {
  const decision = normalizePlannerDecision({
    raw: { routeKind: 'tool_task', toolId: 'ai-design', operation: 'generate' },
    text: '参考这些图片生成新的商品场景',
    attachments: [
      { clientId: 'image-1', name: 'product.png', mimeType: 'image/png', byteSize: 100 },
      { clientId: 'image-2', name: 'style.webp', mimeType: 'image/webp', byteSize: 100 },
      { clientId: 'brief-1', name: 'brief.pdf', mimeType: 'application/pdf', byteSize: 100 }
    ],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.equal(decision.options.profileId, 'product-reference-v1');
  assert.deepEqual(decision.options.referenceRoles, ['product']);
  assert.deepEqual(decision.plan.attachmentClientIds, ['image-1']);
  assert.match(decision.assumptions.join(' '), /只使用第一张/u);
});

test('local utility handoff retains attachment identifiers without requesting upload', () => {
  const decision = normalizePlannerDecision({
    raw: { routeKind: 'reply' },
    text: '帮我把这些图片压缩到网页可用',
    attachments: [{ clientId: 'local-1', name: 'hero.png', mimeType: 'image/png', byteSize: 100 }],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.equal(decision.routeKind, 'local_tool');
  assert.equal(decision.localRoute, '/artigen/tools/image-batch');
  assert.equal(decision.plan.uploadRequired, false);
  assert.deepEqual(decision.plan.attachmentClientIds, ['local-1']);
});

test('multiple deliverables route to Computer Agent and never grant implicit third-party origins', () => {
  const repaired = repairPlannerRoute({
    raw: { routeKind: 'tool_task', toolId: 'ai-design', operation: 'generate' },
    text: '调研香氛趋势，给我 PDF 报告和可编辑 PPT 提案'
  });
  const decision = normalizePlannerDecision({
    raw: repaired,
    text: '调研香氛趋势，给我 PDF 报告和可编辑 PPT 提案',
    attachments: [],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.equal(decision.routeKind, 'agent_run');
  assert.equal(decision.capabilities.browser, false);
  assert.equal(decision.browserConfig.allowedOrigins.length, 0);
  assert.ok(decision.deliverables.includes('report'));
  assert.ok(decision.deliverables.includes('presentation'));
});

test('explicit Markdown and PDF output rejects an unsupported planner presentation guess', () => {
  const decision = normalizePlannerDecision({
    raw: {
      routeKind: 'agent_run',
      deliverables: ['report', 'presentation']
    },
    text: '审计官网并交付 Markdown 和 PDF 品牌改进提案',
    attachments: [],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.deepEqual(decision.deliverables, ['report']);
  assert.deepEqual(decision.plan.deliverables, ['report']);
});

test('explicitly rejecting presentation output cannot be mistaken for presentation intent', () => {
  for (const text of [
    '交付 Markdown 和 PDF，不要 PPT、不要 PPTX、不要 PowerPoint、不要幻灯片',
    '交付 Markdown 和 PDF，无需制作演示文稿',
    'Deliver Markdown and PDF without slides or a presentation'
  ]) {
    const decision = normalizePlannerDecision({
      raw: {
        routeKind: 'agent_run',
        deliverables: ['report', 'presentation']
      },
      text,
      attachments: [],
      clarificationRounds: 0,
      creditCap: 50
    });
    assert.deepEqual(decision.deliverables, ['report'], text);
    assert.deepEqual(decision.plan.deliverables, ['report'], text);
  }
});

test('negated image and website outputs cannot override an explicit report-only request', () => {
  const decision = normalizePlannerDecision({
    raw: {
      routeKind: 'agent_run',
      deliverables: ['image', 'report', 'presentation', 'website']
    },
    text: '交付 artigen-design-proposal.md 与 artigen-design-proposal.pdf；不要 PPT/PPTX/PowerPoint/幻灯片/演示文稿，也不要图片或网站原型。',
    attachments: [],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.deepEqual(decision.deliverables, ['report']);
  assert.deepEqual(decision.plan.deliverables, ['report']);
  assert.equal(decision.capabilities.generate_images, false);
  assert.equal(decision.plan.capabilities.generate_images, false);
});

test('Computer Agent plan accepts structured Qwen steps without rendering object coercion', () => {
  const decision = normalizePlannerDecision({
    raw: {
      routeKind: 'agent_run',
      steps: [
        { label: '审计公开页面' },
        { title: '整理可追溯证据' },
        { description: '验证并交付文件' },
        { unsupported: 'ignored' }
      ]
    },
    text: '审计官网并交付 Markdown 和 PDF',
    attachments: [],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.deepEqual(decision.plan.steps, [
    '审计公开页面',
    '整理可追溯证据',
    '验证并交付文件'
  ]);
  assert.doesNotMatch(decision.plan.steps.join(' '), /\[object Object\]/u);
});

test('clarification is limited to one round and at most two questions', () => {
  const first = normalizePlannerDecision({
    raw: {
      routeKind: 'reply',
      needsClarification: true,
      questions: ['目标平台是什么？', '主要受众是谁？', '预算是多少？']
    },
    text: '我还没想好',
    attachments: [],
    clarificationRounds: 0,
    creditCap: 50
  });
  assert.equal(first.status, 'waiting_clarification');
  assert.equal(first.questions.length, 2);
  const second = normalizePlannerDecision({
    raw: {
      routeKind: 'reply',
      needsClarification: true,
      questions: ['再问一次？']
    },
    text: '还是不确定',
    attachments: [],
    clarificationRounds: 1,
    creditCap: 50
  });
  assert.equal(second.status, 'succeeded');
  assert.equal(second.questions, undefined);
});

test('conversation configuration defaults closed with a 50-credit cap and 30-day retention', () => {
  assert.deepEqual(getDesignConversationConfig({}), {
    enabled: false,
    workerEnabled: false,
    autoCreditCap: 50,
    retentionDays: 30,
    authorizationIdleMinutes: 30,
    pollMs: 750,
    planningLeaseSeconds: 90,
    planningLeaseHeartbeatMs: 20_000,
    plannerMaxTokens: 1800,
    model: TEXT_MODEL,
    imageModel: IMAGE_MODEL
  });
});

test('conversation routes register the public contract without touching PostgreSQL when injected', () => {
  const registered = [];
  const app = {
    get(path) { registered.push(['GET', path]); },
    post(path) { registered.push(['POST', path]); },
    delete(path) { registered.push(['DELETE', path]); }
  };
  const service = { startWorker() { return true; } };
  assert.doesNotThrow(() => installDesignConversationRoutes(app, {
    env: { DESIGN_CONVERSATION_ENABLED: 'true' },
    pool: { connect: async () => { throw new Error('not called'); } },
    designConversationService: service,
    rateLimit: () => (_req, _res, next) => next()
  }));
  assert.ok(registered.some(([method, path]) => method === 'POST' && path === '/api/design-conversations'));
  assert.ok(registered.some(([method, path]) => method === 'GET' && path.endsWith('/:conversationId/events')));
  assert.ok(registered.some(([method, path]) => method === 'POST' && path.endsWith('/:executionId/agent-quote')));
  assert.ok(registered.some(([method, path]) => method === 'POST' && path.endsWith('/:conversationId/authorizations')));
});

test('conversation event stream resumes from Last-Event-ID and emits durable event ids', async () => {
  let eventHandler = null;
  const app = {
    get(path, ...handlers) {
      if (path.endsWith('/:conversationId/events')) eventHandler = handlers.at(-1);
    },
    post() {},
    delete() {}
  };
  const observedCursors = [];
  const service = {
    startWorker() { return true; },
    async getConversation() { return { conversationId: 'conversation-1' }; },
    async listEvents({ after }) {
      observedCursors.push(after);
      return [{
        eventId: 42,
        conversationId: 'conversation-1',
        type: 'execution.running',
        data: { executionId: 'execution-1' },
        createdAt: '2026-08-17T00:00:00.000Z'
      }];
    }
  };
  installDesignConversationRoutes(app, {
    env: { DESIGN_CONVERSATION_ENABLED: 'true' },
    pool: {},
    designConversationService: service,
    rateLimit: () => (_req, _res, next) => next()
  });
  assert.equal(typeof eventHandler, 'function');

  const req = new EventEmitter();
  req.headers = { 'last-event-id': '41' };
  req.query = { after: '7' };
  req.params = { conversationId: 'conversation-1' };
  req.authResolution = { ok: true, userId: 'user-1', dbUserId: 'db-user-1' };
  const chunks = [];
  const res = {
    headersSent: false,
    statusCode: 0,
    status(code) { this.statusCode = code; return this; },
    setHeader() {},
    flushHeaders() { this.headersSent = true; },
    write(chunk) { chunks.push(String(chunk)); return true; },
    end() {}
  };
  await eventHandler(req, res);
  req.emit('close');

  assert.deepEqual(observedCursors, [41]);
  assert.equal(res.statusCode, 200);
  assert.match(chunks.join(''), /retry: 1500/);
  assert.match(chunks.join(''), /id: 42\nevent: execution\.running/);
});

test('Mac worker attempts two runs only when CPU, memory and browser relay are ready', () => {
  const readySystem = {
    availableParallelism: () => 8,
    cpus: () => Array.from({ length: 8 }),
    totalmem: () => 32 * 1024 ** 3,
    freemem: () => 12 * 1024 ** 3
  };
  const runtimeReadiness = {
    browserReady: true,
    egressVerified: true,
    desktopRelayReady: true
  };
  assert.deepEqual(resolveWorkerConcurrency({
    env: { AGENT_WORKER_CONCURRENCY: '2' },
    runtimeReadiness,
    system: readySystem
  }), { concurrency: 2, fallbackReason: null });
  assert.deepEqual(resolveWorkerConcurrency({
    env: { AGENT_WORKER_CONCURRENCY: '2' },
    runtimeReadiness: { ...runtimeReadiness, desktopRelayReady: false },
    system: readySystem
  }), { concurrency: 1, fallbackReason: 'RUNTIME_READINESS' });
  assert.deepEqual(resolveWorkerConcurrency({
    env: { AGENT_WORKER_CONCURRENCY: '2' },
    runtimeReadiness,
    system: { ...readySystem, freemem: () => 2 * 1024 ** 3 }
  }), { concurrency: 1, fallbackReason: 'MEMORY_CAPACITY' });
});

test('Mac worker cleanup expires both text and Kolors scheduler queues exactly once', async () => {
  const calls = [];
  const textScheduler = { cleanup: async () => calls.push('text') };
  const imageScheduler = { cleanup: async () => calls.push('image') };
  await cleanupProviderSchedulers([textScheduler, imageScheduler, textScheduler]);
  assert.deepEqual(calls.sort(), ['image', 'text']);
});
