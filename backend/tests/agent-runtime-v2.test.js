const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { ApiError } = require('../lib/api-error');
const qualityManifest = require('../evaluation/agent-quality-set.json');
const {
  buildContextMessages,
  classifyRuntimeFailure,
  compileAgentPrompt,
  createWorkingState,
  normalizeTaskSpec,
  normalizeVerifierResult,
  observationEnvelope,
  summarizeToolObservation
} = require('../services/agent-runtime-v2');
const {
  compileQualityCase,
  validateCompiledQualityCase
} = require('../services/agent-quality-evaluation');
const {
  SiliconFlowAgentModelProvider
} = require('../services/agent-model-provider');
const { assertAgentRuntimeReady, getAgentConfig } = require('../services/agent-config');
const {
  decodeExecutionPlan,
  normalizeMemoryCandidates,
  sealExecutionPlan
} = require('../services/design-conversation-service');
const {
  contentFreeMetrics,
  createScheduledChatGenerate,
  parseRetryAfterMs,
  schedulerIntervalMs
} = require('../services/agent-model-runtime-service');

const encryptionEnv = {
  AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}`
};

test('Runtime V2 skill compilation cannot grant a capability and crops tools by phase', () => {
  const noBrowser = compileAgentPrompt({
    objective: '调研来源并生成 PDF 报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true, browser: false },
    taskSpec: { skillIds: ['research-sources', 'report'] },
    phase: 'research'
  });
  assert.equal(noBrowser.skills.some((skill) => skill.id === 'research-sources'), false);
  assert.equal(noBrowser.allowedToolNames.includes('browser_dom'), false);

  const research = compileAgentPrompt({
    objective: '调研来源并生成 PDF 报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true, browser: true },
    phase: 'research'
  });
  assert.ok(research.allowedToolNames.includes('browser_dom'));
  assert.equal(research.allowedToolNames.includes('declare_artifact'), false);
  assert.equal(
    research.runtimeProfileSummary.structuredOutputPolicy,
    'adaptive-first-nonthinking-correction-v1'
  );

  const verification = compileAgentPrompt({
    objective: '调研来源并生成 PDF 报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true, browser: true },
    phase: 'verification'
  });
  assert.ok(verification.allowedToolNames.includes('declare_artifact'));
  assert.equal(verification.allowedToolNames.includes('browser_dom'), false);

  const budgetLocked = compileAgentPrompt({
    objective: '制作报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true, browser: true },
    phase: 'verification',
    budgetRatio: 0.91
  });
  assert.deepEqual(budgetLocked.allowedToolNames.sort(), [
    'declare_artifact', 'sandbox_shell', 'update_plan'
  ]);
});

test('Runtime V2 preserves the goal, verification phase and unresolved failure under compaction', () => {
  const taskSpec = normalizeTaskSpec({
    goal: '制作一份带来源的报告',
    deliverables: ['report'],
    plan: [
      { id: 'draft', label: '起草报告', phase: 'production' },
      { id: 'polish', label: '整理内容', phase: 'production' }
    ]
  }, { capabilities: { files: true, shell: true }, maxCredits: 50 });
  assert.ok(taskSpec.plan.some((step) => step.phase === 'verification'));
  const state = createWorkingState({
    taskSpec,
    previous: {
      failures: [{ code: 'PDF_RENDER_FAILED', retryHint: 'repair page 2' }],
      remainingBudget: 14
    }
  });
  const messages = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `old message ${index} ${'x'.repeat(1000)}`
  }));
  const compacted = buildContextMessages({
    instructions: 'constitution',
    taskSpec,
    workingState: state,
    messages,
    tools: [{ name: 'sandbox_shell' }],
    contextTokens: 7000,
    outputReserveTokens: 4096,
    safetyMarginTokens: 1024
  });
  assert.equal(compacted.compacted, true);
  assert.match(compacted.messages[1].content, /制作一份带来源的报告/u);
  assert.match(compacted.messages[1].content, /PDF_RENDER_FAILED/u);
  assert.ok(compacted.contextBudgetTokens <= 1880);
});

test('Runtime V2 preserves durable plan progress instead of restarting the first step', () => {
  const taskSpec = normalizeTaskSpec({
    goal: '继续验证已生成的报告',
    deliverables: ['report'],
    plan: [
      { id: 'draft', label: '生成报告', phase: 'production', status: 'completed' },
      { id: 'verify', label: '验证报告', phase: 'verification', status: 'in_progress' }
    ]
  }, { capabilities: { files: true, shell: true }, maxCredits: 50 });
  assert.deepEqual(taskSpec.plan.map((step) => step.status), ['completed', 'in_progress']);
});

test('Runtime V2 refuses to silently truncate immutable requirements that exceed context', () => {
  const taskSpec = normalizeTaskSpec({
    goal: `${'核心目标'.repeat(900)}TAIL_MUST_BE_COMPACTED`,
    deliverables: ['report'],
    constraints: Array.from({ length: 24 }, (_, index) => `约束${index}:${'内容'.repeat(300)}`),
    acceptanceCriteria: Array.from({ length: 24 }, (_, index) => `验收${index}:${'标准'.repeat(300)}`)
  }, { capabilities: { files: true, shell: true }, maxCredits: 50 });
  assert.throws(() => buildContextMessages({
    instructions: 'constitution',
    taskSpec,
    workingState: createWorkingState({ taskSpec }),
    messages: Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: '历史'.repeat(1000)
    })),
    tools: [{ name: 'sandbox_shell', schema: 'x'.repeat(5000) }],
    contextTokens: 16_384
  }), { code: 'AGENT_CONTEXT_FIXED_BUDGET_EXCEEDED' });
  assert.match(taskSpec.goal, /TAIL_MUST_BE_COMPACTED/u);
  for (let index = 0; index < 24; index += 1) {
    assert.match(taskSpec.constraintRequirements[index].text, new RegExp(`约束${index}:`, 'u'));
    assert.match(taskSpec.acceptanceRequirements[index].text, new RegExp(`验收${index}:`, 'u'));
  }
});

test('Observation envelopes are bounded and failure retry classes are explicit', () => {
  const longObservedUrl = `https://example.com/evidence?token=${'x'.repeat(900)}`;
  const envelope = observationEnvelope({
    ok: false,
    code: 'PDF_RENDER_FAILED',
    summary: 'x'.repeat(5000),
    retryHint: 'repair the failed page',
    evidenceRefs: [longObservedUrl]
  });
  assert.equal(envelope.summary.length, 2000);
  assert.equal(envelope.evidenceRefs[0], longObservedUrl);
  assert.match(envelope.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(classifyRuntimeFailure({ code: 'AGENT_PROVIDER_RATE_LIMITED' }), {
    category: 'transient_provider', retryable: true, maxAttempts: 2
  });
  assert.deepEqual(classifyRuntimeFailure({ code: 'AGENT_CAPABILITY_NOT_GRANTED' }), {
    category: 'security_terminal', retryable: false, maxAttempts: 0
  });
  assert.deepEqual(classifyRuntimeFailure({ code: 'AGENT_REPEATED_ACTION_FAILED' }), {
    category: 'unchanged_state_loop', retryable: false, maxAttempts: 0
  });
  const summary = summarizeToolObservation('sandbox_shell', {
    returnCode: 0,
    stdout: 'created report.md token=do-not-retain',
    stderr: ''
  });
  assert.match(summary, /^UNTRUSTED TOOL DATA/);
  assert.doesNotMatch(summary, /do-not-retain/);
});

test('Actor payload is non-thinking, serial and exposes only phase-authorized tools', () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      AGENT_SILICONFLOW_THINKING_ENABLED: '1'
    }
  });
  const payload = provider.buildChatPayload(
    [{ role: 'user', content: 'create report' }],
    { files: true, shell: true, browser: true, generate_images: true },
    'parent',
    { allowedToolNames: ['sandbox_shell', 'declare_artifact'], thinkingEnabled: false }
  );
  assert.equal(payload.model, 'Qwen/Qwen3-8B');
  assert.equal(payload.enable_thinking, false);
  assert.equal(payload.parallel_tool_calls, false);
  assert.equal(payload.temperature, 0.2);
  assert.equal(payload.top_p, 0.7);
  assert.deepEqual(payload.tools.map((tool) => tool.function.name).sort(), [
    'declare_artifact', 'sandbox_shell'
  ]);
});

test('Runtime V2 Actor sampling only accepts the two reviewed DEV A/B profiles', () => {
  assert.deepEqual(getAgentConfig({
    AGENT_MODEL_PROVIDER: 'siliconflow',
    AGENT_RUNTIME_ACTOR_PROFILE: 'exploratory-v1'
  }).actorSamplingProfile, {
    id: 'exploratory-v1', temperature: 0.4, topP: 0.8
  });
  assert.throws(() => getAgentConfig({
    AGENT_RUNTIME_ACTOR_PROFILE: 'custom-unreviewed'
  }), { code: 'AGENT_RUNTIME_ACTOR_PROFILE_INVALID' });
  assert.throws(() => assertAgentRuntimeReady({
    AGENT_FEATURE_ENABLED: '1',
    AGENT_RUNTIME_V2_ENABLED: 'true',
    AGENT_MODEL_PROVIDER: 'siliconflow',
    SILICONFLOW_API_KEY: 'test-key',
    AGENT_MODEL_CONTEXT_TOKENS: '12288',
    AGENT_SANDBOX_PROVIDER: 'cua',
    AGENT_SANDBOX_MODE: 'local',
    AGENT_CUA_IMAGE_REF: 'artigen/cua-xfce:0.1.15-tools-v1',
    AGENT_CUA_IMAGE_HAS_TOOLCHAIN: 'true'
  }), { code: 'AGENT_RUNTIME_V2_CONTEXT_NOT_READY' });
});

test('Verifier cannot claim image aesthetics without a VLM', () => {
  assert.deepEqual(normalizeVerifierResult({
    passed: true,
    score: 95,
    issues: [],
    unsupportedVisualJudgment: true
  }), {
    version: 2,
    passed: true,
    score: 95,
    issues: [],
    repairInstructions: [],
    unsupportedVisualJudgment: true,
    criteria: []
  });
  assert.equal(normalizeVerifierResult({ passed: true, score: 84, issues: [] }).passed, false);
});

test('TaskSpec is encrypted at rest inside a design execution plan', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    conversation_id: '22222222-2222-4222-8222-222222222222'
  };
  row.plan = sealExecutionPlan({
    conversationId: row.conversation_id,
    executionId: row.id,
    publicPlan: { steps: ['调研', '验证'], complexity: 'high' },
    privatePlan: {
      objective: '尚未公开的新品策略',
      taskSpec: { goal: '尚未公开的新品策略', deliverables: ['report'] }
    },
    env: encryptionEnv
  });
  assert.equal(JSON.stringify(row.plan).includes('尚未公开的新品策略'), false);
  const decoded = decodeExecutionPlan(row, encryptionEnv);
  assert.equal(decoded.objective, '尚未公开的新品策略');
  assert.deepEqual(decoded.steps, ['调研', '验证']);
  assert.equal(Object.hasOwn(decoded, '_sealed'), false);
});

test('Project memory suggestions only contain literal user-provided text and are capped at three', () => {
  const text = '受众是独立设计师，语气要克制，必须保留原始 Logo。';
  const candidates = normalizeMemoryCandidates([
    { field: 'audience', value: '独立设计师' },
    { field: 'tone', value: ['克制'] },
    { field: 'mustInclude', value: ['原始 Logo'] },
    { field: 'goals', value: ['模型自行推断的增长'] }
  ], text);
  assert.equal(candidates.length, 3);
  assert.equal(candidates.some((candidate) => JSON.stringify(candidate).includes('模型自行推断')), false);
});

test('The 50-case quality manifest compiles into executable routes, skills, tools and validators', () => {
  assert.equal(qualityManifest.version, 3);
  assert.equal(qualityManifest.cases.length, 50);
  const evaluationDir = path.resolve(__dirname, '../evaluation');
  for (const task of qualityManifest.cases) {
    const compiled = compileQualityCase({ manifest: qualityManifest, task, evaluationDir });
    assert.deepEqual(validateCompiledQualityCase(compiled), [], task.id);
    assert.equal(compiled.taskSpec.goal, task.objective);
    assert.ok(compiled.deterministicValidators.length >= 3);
  }
});

test('Quality fixtures cannot escape the synthetic fixture and public-asset roots', () => {
  const evaluationDir = path.resolve(__dirname, '../evaluation');
  const manifest = {
    ...qualityManifest,
    fixtureRules: {
      ...qualityManifest.fixtureRules,
      forbidden_fixture_escape: ['../../backend/.env']
    }
  };
  const task = {
    ...qualityManifest.cases[0],
    acceptance: [...qualityManifest.cases[0].acceptance, 'forbidden_fixture_escape']
  };
  const compiled = compileQualityCase({ manifest, task, evaluationDir });
  assert.equal(
    validateCompiledQualityCase(compiled).includes('fixture path forbidden ../../backend/.env'),
    true
  );
});

test('Provider scheduler derives a shared conservative interval from RPM', () => {
  assert.equal(schedulerIntervalMs({
    AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0',
    AGENT_SILICONFLOW_REQUESTS_PER_MINUTE: '12'
  }), 5000);
  assert.equal(schedulerIntervalMs({
    AGENT_SILICONFLOW_MIN_INTERVAL_MS: '6500',
    AGENT_SILICONFLOW_REQUESTS_PER_MINUTE: '60'
  }), 6500);
});

test('Provider Retry-After accepts seconds and HTTP dates with a bounded delay', () => {
  const now = Date.parse('2026-08-21T00:00:00.000Z');
  assert.equal(parseRetryAfterMs('2.5', { now }), 2500);
  assert.equal(parseRetryAfterMs('Fri, 21 Aug 2026 00:00:05 GMT', { now }), 5000);
  assert.equal(parseRetryAfterMs('600', { now }), 60_000);
  assert.equal(parseRetryAfterMs('not-a-delay', { now }), 0);
});

test('Shared chat scheduling bypasses only the process-local gate and quality metrics reject text', async () => {
  const calls = [];
  const chat = createScheduledChatGenerate({
    scheduler: {
      acquire: async ({ priority }) => {
        calls.push(priority);
        return { mode: 'postgres-v1', queueWaitMs: 12 };
      }
    },
    chatGenerate: async (input) => input,
    defaultPriority: 'actor'
  });
  const result = await chat({ messages: [], schedulerPriority: 'router' });
  assert.deepEqual(calls, ['router']);
  assert.equal(result.skipRateGate, true);
  assert.deepEqual(contentFreeMetrics({
    attempt: 2,
    passed: true,
    userText: 'must never be persisted',
    nested: { secret: 'no' }
  }), { attempt: 2, passed: true });
});

test('Model-call tracing is fail-soft and cannot take down an otherwise valid provider response', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key',
      AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0'
    },
    modelCallService: {
      start: async () => { throw new Error('metrics database unavailable'); },
      finish: async () => { throw new Error('must remain fail-soft'); }
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        id: 'trace-independent',
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 2, completion_tokens: 1 }
      })
    })
  });
  const response = await provider.createChat({
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'test' }]
  }, { phase: 'actor' });
  assert.equal(response.message.content, 'ok');
});

test('An already-cancelled Runtime V2 model call never reaches SiliconFlow', async () => {
  let fetchCalls = 0;
  const controller = new AbortController();
  controller.abort();
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key',
      AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0'
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('cancelled requests must not reach the provider');
    }
  });
  await assert.rejects(provider.createChat({
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'do not send' }]
  }, { phase: 'actor', signal: controller.signal }), { code: 'AGENT_CANCELLED' });
  assert.equal(fetchCalls, 0);
});

test('Planner repairs JSON and strict TaskSpec schema failures without losing usage', async () => {
  const consumedReceipts = [];
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key',
      AGENT_ADAPTIVE_REASONING_ENABLED: 'true'
    },
    modelCallService: {
      async consume(receipt) {
        consumedReceipts.push(receipt.id);
      }
    }
  });
  const validTaskSpec = normalizeTaskSpec({
    goal: '制作报告',
    constraints: ['不得添加未请求的交付物'],
    acceptanceCriteria: ['报告必须通过验证'],
    deliverables: ['report'],
    plan: [
      { id: 'produce', label: '制作', phase: 'production' },
      { id: 'verify', label: '验证', phase: 'verification' }
    ]
  }, {
    objective: '制作报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true },
    maxCredits: 50
  });
  const requests = [];
  provider.createChat = async (payload, metadata) => {
    requests.push({ payload, metadata });
    return {
      modelCallReceipt: { id: `planner-receipt-${requests.length}` },
      message: {
        content: requests.length === 1
          ? 'null'
          : requests.length === 2
            ? JSON.stringify({
                ...validTaskSpec,
                acceptanceCriteria: '必须验证来源',
                goalRequirement: [{
                  ...validTaskSpec.goalRequirement,
                  id: '目标',
                  source: '用户',
                  criticality: '关键'
                }],
                constraintRequirements: validTaskSpec.constraintRequirements.map((entry) => ({
                  ...entry,
                  id: '约束',
                  source: '用户',
                  criticality: '关键'
                })),
                acceptanceRequirements: validTaskSpec.acceptanceRequirements.map((entry) => ({
                  ...entry,
                  id: '验收',
                  source: '规划器',
                  criticality: '必需'
                })),
                plan: validTaskSpec.plan.map((entry) => ({ ...entry, id: '步骤' }))
              })
            : JSON.stringify(validTaskSpec)
      },
      siliconFlowUsage: { prompt_tokens: 10, completion_tokens: 5 }
    };
  };
  const reserved = [];
  const consumed = [];
  const planned = await provider.planTask({
    objective: '制作报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true },
    maxCredits: 50,
    metadata: {
      reserveBudget: async (entry) => reserved.push(entry),
      consumeBudget: async (entry) => consumed.push(entry)
    }
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].payload.enable_thinking, true);
  assert.equal(requests[1].payload.enable_thinking, false);
  assert.equal(requests[2].payload.enable_thinking, false);
  assert.equal(requests[0].payload.tools, undefined);
  assert.equal(requests[1].metadata.turn, 1);
  assert.equal(requests[2].metadata.turn, 2);
  assert.equal(new Set(requests.map((entry) => entry.metadata.promptHash)).size, 3);
  assert.ok(requests.every((entry) => /^[a-f0-9]{64}$/.test(entry.metadata.promptHash)));
  assert.match(requests[1].payload.messages.at(-1).content, /corrected JSON object/);
  assert.match(requests[2].payload.messages.at(-1).content, /Schema errors/);
  assert.equal(planned.usage.inputTokens, 30);
  assert.equal(planned.usage.outputTokens, 15);
  assert.equal(planned.taskSpec.goal, '制作报告');
  assert.equal(reserved.length, 3);
  assert.equal(consumed.length, 3);
  assert.equal(new Set(consumed.map((entry) => entry.reservationKey)).size, 3);
  assert.deepEqual(consumedReceipts, [
    'planner-receipt-1',
    'planner-receipt-2',
    'planner-receipt-3'
  ]);
});

test('Planner accepts a compact strict candidate and server-compiles authoritative fields', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key',
      AGENT_ADAPTIVE_REASONING_ENABLED: 'true'
    }
  });
  const requests = [];
  provider.createChat = async (payload) => {
    requests.push(payload);
    return {
      message: {
        content: JSON.stringify({
          complexity: 'medium',
          confidence: 0.91,
          constraints: ['不得增加未请求的交付物'],
          assumptions: [],
          acceptanceCriteria: ['报告必须通过确定性验证'],
          skillIds: ['report'],
          plan: [
            { id: 'produce-report', label: '制作报告', phase: 'production', status: 'in_progress' },
            { id: 'verify-report', label: '验证报告', phase: 'verification', status: 'pending' }
          ]
        })
      },
      siliconFlowUsage: { prompt_tokens: 10, completion_tokens: 5 }
    };
  };

  const planned = await provider.planTask({
    objective: '制作一份经过验证的报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true },
    allowedOrigins: ['https://www.w3.org'],
    maxCredits: 30
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[0].content, /server owns the exact goal/i);
  assert.equal(planned.taskSpec.goal, '制作一份经过验证的报告');
  assert.equal(planned.taskSpec.goalRequirement.source, 'user');
  assert.match(planned.taskSpec.goalRequirement.id, /^goal-[a-f0-9]{12}$/);
  assert.deepEqual(planned.taskSpec.deliverables, ['report']);
  assert.deepEqual(planned.taskSpec.allowedOrigins, ['https://www.w3.org']);
  assert.equal(planned.taskSpec.budget.maxCredits, 30);
  assert.equal(planned.taskSpec.constraintRequirements[0].source, 'planner');
  assert.equal(planned.taskSpec.acceptanceRequirements[0].source, 'planner');
  assert.ok(planned.taskSpec.skillIds.includes('report'));
});

test('Planner accepts nine steps but server normalizes all unexecuted statuses', () => {
  const taskSpec = normalizeTaskSpec({
    complexity: 'high',
    confidence: 0.9,
    constraints: ['保持原始目标'],
    assumptions: [],
    acceptanceCriteria: ['全部步骤完成后再验证'],
    skillIds: ['report'],
    plan: Array.from({ length: 9 }, (_, index) => ({
      id: `planner-step-${index + 1}`,
      label: `Planner step ${index + 1}`,
      phase: index === 8 ? 'verification' : 'production',
      status: index < 4 ? 'completed' : index === 6 ? 'in_progress' : 'pending'
    }))
  }, {
    objective: '制作九步报告',
    deliverables: ['report'],
    capabilities: { files: true, shell: true },
    allowedOrigins: [],
    maxCredits: 50,
    strictPlannerOutput: true
  });

  assert.equal(taskSpec.plan.length, 9);
  assert.deepEqual(taskSpec.plan.map((step) => step.status), [
    'in_progress',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending',
    'pending'
  ]);
});

test('Planner rejects thirteen steps and unknown fields without truncating or silently repairing them', () => {
  const fallback = {
    objective: '严格验证 Planner 契约',
    deliverables: ['report'],
    capabilities: { files: true, shell: true },
    allowedOrigins: [],
    maxCredits: 50,
    strictPlannerOutput: true
  };
  const candidate = {
    complexity: 'high',
    confidence: 0.9,
    constraints: [],
    assumptions: [],
    acceptanceCriteria: ['必须严格验证'],
    skillIds: ['report'],
    plan: Array.from({ length: 13 }, (_, index) => ({
      id: `strict-step-${index + 1}`,
      label: `Strict step ${index + 1}`,
      phase: index === 12 ? 'verification' : 'production',
      status: 'pending'
    }))
  };

  assert.throws(
    () => normalizeTaskSpec(candidate, fallback),
    { code: 'AGENT_TASK_SPEC_INVALID' }
  );
  assert.throws(
    () => normalizeTaskSpec({ ...candidate, plan: candidate.plan.slice(0, 9), unexpected: true }, fallback),
    { code: 'AGENT_TASK_SPEC_INVALID' }
  );
});

test('Planner preserves the authoritative user objective across a valid model restatement', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key',
      AGENT_ADAPTIVE_REASONING_ENABLED: 'true'
    }
  });
  const authoritativeObjective = '只输出一段中文结论，不创建文件，也不要增加其他交付物。';
  const candidate = normalizeTaskSpec({
    goal: authoritativeObjective,
    constraints: ['不得创建文件'],
    acceptanceCriteria: ['最终文本清晰完整'],
    deliverables: [],
    plan: [
      { id: 'draft-text', label: '起草文本', phase: 'production' },
      { id: 'verify-text', label: '验证文本', phase: 'verification' }
    ]
  }, {
    objective: authoritativeObjective,
    deliverables: [],
    capabilities: {},
    maxCredits: 50
  });
  provider.createChat = async (payload) => ({
    message: {
      content: JSON.stringify({
        ...candidate,
        goal: '模型改写后的目标',
        deliverables: ['image'],
        allowedOrigins: ['https://unapproved.example'],
        budget: { maxCredits: 500 },
        goalRequirement: {
          ...candidate.goalRequirement,
          id: 'planner-authored-goal',
          text: '另一种模型改写',
          source: 'planner',
          criticality: 'optional'
        }
      })
    },
    siliconFlowUsage: { prompt_tokens: 10, completion_tokens: 5 }
  });

  const planned = await provider.planTask({
    objective: authoritativeObjective,
    deliverables: [],
    capabilities: {},
    maxCredits: 50
  });

  assert.equal(planned.taskSpec.goal, authoritativeObjective);
  assert.equal(planned.taskSpec.goalRequirement.text, authoritativeObjective);
  assert.equal(planned.taskSpec.goalRequirement.source, 'user');
  assert.equal(planned.taskSpec.goalRequirement.criticality, 'critical');
  assert.match(planned.taskSpec.goalRequirement.id, /^goal-[a-f0-9]{12}$/);
  assert.deepEqual(planned.taskSpec.deliverables, []);
  assert.deepEqual(planned.taskSpec.allowedOrigins, []);
  assert.equal(planned.taskSpec.budget.maxCredits, 50);
});

test('Runtime V1 records usage without touching Runtime V2 budget reservations', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  provider.createChat = async () => ({
    id: 'runtime-v1-response',
    message: { role: 'assistant', content: '已完成文字答复。' },
    siliconFlowUsage: { prompt_tokens: 10, completion_tokens: 5 }
  });
  let budgetConsumes = 0;
  let usageWrites = 0;
  const result = await provider.execute({
    objective: '只返回一段文字',
    capabilities: {},
    deliverables: [],
    runtimeContext: { runtimeVersion: 1 },
    maxSteps: 10,
    callbacks: {
      recordUsage: async () => { usageWrites += 1; },
      consumeBudget: async () => { budgetConsumes += 1; }
    }
  });
  assert.equal(result.text, '已完成文字答复。');
  assert.equal(usageWrites, 1);
  assert.equal(budgetConsumes, 0);
});

test('Runtime V2 consumes a durably checkpointed model response without calling the provider twice', async () => {
  let fetchCalls = 0;
  let usageWrites = 0;
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('provider must not be called');
    }
  });
  const taskSpec = normalizeTaskSpec({
    goal: '回答一个已完成的设计咨询',
    deliverables: [],
    plan: [
      { id: 'answer', label: '整理答案', phase: 'production' },
      { id: 'verify', label: '核对答案', phase: 'verification' }
    ]
  }, { maxCredits: 50 });
  const result = await provider.execute({
    objective: taskSpec.goal,
    capabilities: {},
    deliverables: [],
    maxSteps: 10,
    runtimeContext: {
      runtimeVersion: 2,
      runId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      taskSpec,
      maxCredits: 50,
      initialModelCredits: 1
    },
    resumeState: {
      version: 3,
      provider: 'siliconflow',
      messages: [],
      taskSpec,
      workingState: createWorkingState({ taskSpec }),
      totalCredits: 1,
      turns: 0,
      planPublished: true,
      pendingModelResponse: {
        id: 'checkpointed-response',
        message: { role: 'assistant', content: '已完成核对。' },
        prompt_eval_count: 100,
        eval_count: 20,
        siliconFlowUsage: { prompt_tokens: 100, completion_tokens: 20 }
      }
    },
    callbacks: {
      checkControl: async () => {},
      recordUsage: async () => { usageWrites += 1; },
      verifyDraft: async () => ({
        result: { passed: true, score: 100, issues: [], repairInstructions: [] },
        credits: 0,
        usage: {}
      }),
      clearModelState: async () => {}
    }
  });
  assert.equal(result.text, '已完成核对。');
  assert.equal(result.credits, 1);
  assert.equal(fetchCalls, 0);
  assert.equal(usageWrites, 1);
});

test('Runtime V2 verifies and repairs a text-only final answer once', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key',
      AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0'
    }
  });
  const answers = ['An unsupported first answer.', 'A corrected grounded answer.'];
  provider.createChat = async () => ({
    id: `text-answer-${answers.length}`,
    message: { role: 'assistant', content: answers.shift() },
    siliconFlowUsage: { prompt_tokens: 1, completion_tokens: 1 }
  });
  const taskSpec = normalizeTaskSpec({
    goal: 'Summarize the verified findings',
    deliverables: []
  }, { maxCredits: 50 });
  let verifierCalls = 0;
  const result = await provider.execute({
    objective: taskSpec.goal,
    capabilities: {},
    deliverables: [],
    maxSteps: 10,
    runtimeContext: {
      runtimeVersion: 2,
      runId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      taskSpec,
      maxCredits: 50
    },
    callbacks: {
      checkControl: async () => {},
      recordUsage: async () => {},
      saveModelState: async () => {},
      clearModelState: async () => {},
      verifyDraft: async ({ text }) => {
        verifierCalls += 1;
        return verifierCalls === 1
          ? {
              result: {
                passed: false,
                score: 70,
                issues: ['Unsupported claim'],
                repairInstructions: ['Remove the unsupported claim']
              },
              credits: 0,
              usage: {}
            }
          : {
              result: {
                passed: text === 'A corrected grounded answer.',
                score: 100,
                issues: [],
                repairInstructions: []
              },
              credits: 0,
              usage: {}
            };
      }
    }
  });
  assert.equal(verifierCalls, 2);
  assert.equal(result.text, 'A corrected grounded answer.');
  assert.equal(answers.length, 0);
});

test('Runtime V2 resumes a paid text verifier result without another Actor call', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  let providerCalls = 0;
  provider.createChat = async () => {
    providerCalls += 1;
    throw new Error('a recovered verified answer must not call the Actor again');
  };
  const taskSpec = normalizeTaskSpec({
    goal: 'Summarize the verified findings',
    deliverables: []
  }, { maxCredits: 50 });
  let cleared = 0;
  const result = await provider.execute({
    objective: taskSpec.goal,
    capabilities: {},
    deliverables: [],
    maxSteps: 10,
    runtimeContext: {
      runtimeVersion: 2,
      runId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      taskSpec,
      maxCredits: 50
    },
    resumeState: {
      version: 3,
      provider: 'siliconflow',
      messages: [{ role: 'assistant', content: 'A verified grounded answer.' }],
      taskSpec,
      workingState: createWorkingState({ taskSpec }),
      totalCredits: 2,
      turns: 1,
      text: 'A verified grounded answer.',
      planPublished: true,
      semanticVerificationAttempts: 1,
      pendingVerifierResult: {
        result: {
          passed: true,
          score: 100,
          issues: [],
          repairInstructions: []
        },
        credits: 1,
        usage: { inputTokens: 10, outputTokens: 2 }
      }
    },
    callbacks: {
      checkControl: async () => {},
      clearModelState: async () => { cleared += 1; }
    }
  });
  assert.equal(providerCalls, 0);
  assert.equal(cleared, 0);
  assert.equal(result.credits, 2);
  assert.equal(result.text, 'A verified grounded answer.');
});

test('Runtime V2 checkpoints a paid model response before a later usage write can fail', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key',
      AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: '1000'
    }
  });
  let persisted = null;
  let calls = 0;
  provider.createChat = async () => {
    calls += 1;
    return {
      id: 'paid-response',
      message: { role: 'assistant', content: '已完成。' },
      prompt_eval_count: 1000,
      eval_count: 0,
      siliconFlowUsage: { prompt_tokens: 1000, completion_tokens: 0 }
    };
  };
  const taskSpec = normalizeTaskSpec({
    goal: '回答设计咨询',
    deliverables: []
  }, { maxCredits: 50 });
  const base = {
    objective: taskSpec.goal,
    capabilities: {},
    deliverables: [],
    maxSteps: 10,
    runtimeContext: {
      runtimeVersion: 2,
      runId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      taskSpec,
      maxCredits: 50
    }
  };
  await assert.rejects(provider.execute({
    ...base,
    callbacks: {
      checkControl: async () => {},
      saveModelState: async (value) => { persisted = structuredClone(value); },
      recordUsage: async () => {
        const error = new Error('simulated crash after durable response');
        error.code = 'SIMULATED_CRASH';
        throw error;
      }
    }
  }), { code: 'SIMULATED_CRASH' });
  assert.equal(calls, 1);
  assert.equal(persisted.pendingModelResponse.id, 'paid-response');
  assert.equal(persisted.totalCredits, 1);

  provider.createChat = async () => {
    throw new Error('provider must not be called after recovery');
  };
  const recoveredUsageSources = [];
  const recovered = await provider.execute({
    ...base,
    resumeState: persisted,
    callbacks: {
      checkControl: async () => {},
      saveModelState: async (value) => { persisted = structuredClone(value); },
      recordUsage: async (_credits, items) => {
        recoveredUsageSources.push(items?.source || 'actor');
        if (items?.source !== 'runtime_v2_verifier') {
          throw new Error('recovered Actor response must not be charged twice');
        }
      },
      verifyDraft: async () => ({
        result: { passed: true, score: 100, issues: [], repairInstructions: [] },
        credits: 0,
        usage: {}
      }),
      clearModelState: async () => {}
    }
  });
  assert.equal(recovered.text, '已完成。');
  assert.equal(recovered.credits, 1);
  assert.deepEqual(recoveredUsageSources, ['runtime_v2_verifier']);
});

test('Runtime V2 restores a paid verifier result without re-verifying or losing the final score', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  provider.createChat = async () => {
    throw new Error('checkpointed verifier and completion response must be reused');
  };
  const taskSpec = normalizeTaskSpec({
    goal: '交付一张图片',
    deliverables: ['image']
  }, { capabilities: { files: true, generate_images: true }, maxCredits: 50 });
  let lastState = null;
  let verifierCalls = 0;
  const result = await provider.execute({
    objective: taskSpec.goal,
    capabilities: { files: true, generate_images: true },
    deliverables: ['image'],
    maxSteps: 10,
    runtimeContext: {
      runtimeVersion: 2,
      taskSpec,
      maxCredits: 50
    },
    resumeState: {
      version: 3,
      provider: 'siliconflow',
      messages: [],
      taskSpec,
      workingState: createWorkingState({ taskSpec }),
      totalCredits: 3,
      turns: 1,
      planPublished: true,
      semanticVerificationAttempts: 1,
      declaredArtifacts: [{
        artifact_id: 'artifact-1',
        role: 'image',
        mime_type: 'image/png',
        filename: 'visual.png',
        verification_status: 'passed',
        path: '/tmp/artigen-workspace/visual.png',
        sources: []
      }],
      pendingVerifierResult: {
        result: {
          passed: true,
          score: 93,
          issues: [],
          repairInstructions: [],
          unsupportedVisualJudgment: true
        },
        usage: { input_tokens: 200, output_tokens: 40 },
        credits: 2
      },
      pendingModelResponse: {
        id: 'completion-response',
        message: { role: 'assistant', content: '已交付并验证 visual.png。' },
        prompt_eval_count: 20,
        eval_count: 10,
        siliconFlowUsage: { prompt_tokens: 20, completion_tokens: 10 }
      }
    },
    callbacks: {
      checkControl: async () => {},
      verifyDraft: async () => { verifierCalls += 1; },
      saveModelState: async (value) => { lastState = structuredClone(value); },
      currentBudgetRatio: async () => 0.1,
      clearModelState: async () => {}
    }
  });
  assert.equal(verifierCalls, 0);
  assert.equal(result.credits, 3);
  assert.equal(lastState.semanticVerificationPassed, true);
  assert.equal(lastState.semanticVerificationResult.score, 93);
});

test('Runtime V2 keeps the server plan after two invalid restatements and continues text work', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  const requests = [];
  provider.createChat = async (payload) => {
    requests.push(payload);
    if (requests.length <= 2) {
      return {
        id: `invalid-plan-${requests.length}`,
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: `invalid-plan-call-${requests.length}`,
            type: 'function',
            function: {
              name: 'update_plan',
              arguments: JSON.stringify({
                explanation: '重复模型自建计划',
                steps: [
                  { id: 'invented-draft', label: '起草', status: 'in_progress' },
                  { id: 'invented-check', label: '检查', status: 'pending' }
                ]
              })
            }
          }]
        },
        siliconFlowUsage: {}
      };
    }
    return {
      id: 'text-after-plan-fallback',
      message: { role: 'assistant', content: '建议聚焦一个清晰目标，并用单一主动作推进。' },
      siliconFlowUsage: {}
    };
  };
  const taskSpec = normalizeTaskSpec({
    goal: '给出一段简洁设计建议',
    deliverables: [],
    plan: [
      { id: 'draft-answer', label: '起草建议', phase: 'production', status: 'in_progress' },
      { id: 'verify-answer', label: '验证建议', phase: 'verification', status: 'pending' }
    ]
  }, { capabilities: {}, maxCredits: 50 });
  let lastState = null;
  const result = await provider.execute({
    objective: taskSpec.goal,
    capabilities: {},
    deliverables: [],
    maxSteps: 10,
    runtimeContext: { runtimeVersion: 2, taskSpec, maxCredits: 50 },
    callbacks: {
      checkControl: async () => {},
      saveModelState: async (value) => { lastState = structuredClone(value); },
      recordUsage: async () => {},
      currentBudgetRatio: async () => 0,
      toolObservation: async () => {},
      verifyDraft: async () => ({
        result: {
          passed: true,
          score: 100,
          issues: [],
          repairInstructions: [],
          unsupportedVisualJudgment: false,
          criteria: []
        },
        credits: 0,
        usage: {}
      })
    }
  });

  assert.equal(requests.length, 3);
  assert.equal(requests[1].tool_choice.function.name, 'update_plan');
  assert.equal(
    requests[2].tools?.some((tool) => tool.function?.name === 'update_plan') || false,
    false
  );
  assert.equal(result.text, '建议聚焦一个清晰目标，并用单一主动作推进。');
  assert.equal(lastState.planUpdateSuppressed, true);
  assert.deepEqual(lastState.taskSpec.plan.map((step) => step.id), [
    'draft-answer',
    'verify-answer'
  ]);
  assert.match(result.readyToFinalize.finalTextSha256, /^[a-f0-9]{64}$/);
});

test('Runtime V2 treats the first exact plan restatement as a server-owned no-op', async () => {
  const taskSpec = normalizeTaskSpec({
    goal: '给出一句简洁设计建议',
    deliverables: [],
    plan: [
      { id: 'draft-answer', label: '起草建议', phase: 'production' },
      { id: 'verify-answer', label: '验证建议', phase: 'verification' }
    ]
  }, { capabilities: {}, maxCredits: 50 });
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  const requests = [];
  provider.createChat = async (payload) => {
    requests.push(payload);
    if (requests.length === 1) {
      return {
        id: 'duplicate-server-plan',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'duplicate-server-plan-call',
            type: 'function',
            function: {
              name: 'update_plan',
              arguments: JSON.stringify({
                explanation: '重复已经发布的计划',
                steps: taskSpec.plan.map(({ id, label, status }) => ({ id, label, status }))
              })
            }
          }]
        },
        siliconFlowUsage: {}
      };
    }
    return {
      id: 'answer-after-server-plan',
      message: { role: 'assistant', content: '聚焦一个主目标，并让每个视觉元素服务于它。' },
      siliconFlowUsage: {}
    };
  };
  let updatePlanCalls = 0;
  let lastState = null;
  const result = await provider.execute({
    objective: taskSpec.goal,
    capabilities: {},
    deliverables: [],
    maxSteps: 10,
    runtimeContext: { runtimeVersion: 2, taskSpec, maxCredits: 50 },
    callbacks: {
      checkControl: async () => {},
      updatePlan: async () => { updatePlanCalls += 1; },
      saveModelState: async (value) => { lastState = structuredClone(value); },
      recordUsage: async () => {},
      currentBudgetRatio: async () => 0,
      toolObservation: async () => {},
      verifyDraft: async () => ({
        result: {
          passed: true,
          score: 100,
          issues: [],
          repairInstructions: [],
          unsupportedVisualJudgment: false,
          criteria: []
        },
        credits: 0,
        usage: {}
      })
    }
  });

  assert.equal(updatePlanCalls, 0);
  assert.equal(requests.length, 2);
  assert.equal(
    requests[1].tools?.some((tool) => tool.function?.name === 'update_plan') || false,
    false
  );
  assert.ok(requests[1].messages.some((message) => (
    message.role === 'tool' &&
    message.content.includes('server already published the initial plan')
  )));
  assert.equal(lastState.planUpdateSuppressed, true);
  assert.equal(result.text, '聚焦一个主目标，并让每个视觉元素服务于它。');
});

test('Runtime V2 stops after one correction when action and observed state repeat unchanged', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  let calls = 0;
  provider.createChat = async () => ({
    id: `response-${++calls}`,
    message: {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: `call-${calls}`,
        type: 'function',
        function: {
          name: 'sandbox_shell',
          arguments: JSON.stringify({ script: 'test -f /tmp/artigen-workspace/missing', purpose: '检查输入' })
        }
      }]
    },
    prompt_eval_count: 0,
    eval_count: 0,
    siliconFlowUsage: {}
  });
  const taskSpec = normalizeTaskSpec({
    goal: '检查工作区中的输入文件',
    deliverables: []
  }, { capabilities: { shell: true }, maxCredits: 50 });
  await assert.rejects(provider.execute({
    objective: taskSpec.goal,
    capabilities: { shell: true },
    deliverables: [],
    maxSteps: 10,
    runtimeContext: { runtimeVersion: 2, taskSpec, maxCredits: 50 },
    callbacks: {
      checkControl: async () => {},
      shell: async () => ({ success: false, returnCode: 1, stdout: '', stderr: 'missing' }),
      saveModelState: async () => {},
      recordUsage: async () => {},
      currentBudgetRatio: async () => 0
    }
  }), { code: 'AGENT_RUNTIME_STATE_LOOP' });
  assert.equal(calls, 2);
});

test('Runtime V2 preserves exact source evidence and blocks Shell detours during declaration repair', async () => {
  const exactUrlPrefix = 'https://www.w3.org/WAI/standards-guidelines/wcag/?__cf_chl_tk=';
  const exactUrl = `${exactUrlPrefix}${'x'.repeat(2000 - exactUrlPrefix.length)}`;
  assert.equal(exactUrl.length, 2000);
  const baseUrl = 'https://www.w3.org/WAI/standards-guidelines/wcag/';
  const taskSpec = normalizeTaskSpec({
    goal: '交付带有精确来源的 Markdown 与 PDF 调研报告',
    deliverables: ['report'],
    plan: [
      { id: 'draft', label: '完成报告内容', phase: 'production', status: 'completed' },
      { id: 'verify', label: '验证并登记报告', phase: 'verification', status: 'in_progress' }
    ]
  }, {
    capabilities: { files: true, shell: true, browser: true },
    maxCredits: 50
  });
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  const toolResponse = (id, name, argumentsValue) => ({
    id: `response-${id}`,
    message: {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: `call-${id}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(argumentsValue) }
      }]
    },
    prompt_eval_count: 0,
    eval_count: 0,
    siliconFlowUsage: {}
  });
  const declaration = ({ path: artifactPath, role, filename, mimeType, url }) => ({
    path: artifactPath,
    role,
    filename,
    mimeType,
    sources: [{ title: 'W3C accessibility guidance', url }]
  });
  const responses = [
    toolResponse('markdown', 'declare_artifact', declaration({
      path: '/tmp/artigen-workspace/report.md',
      role: 'source',
      filename: 'report.md',
      mimeType: 'text/markdown',
      url: exactUrl
    })),
    toolResponse('pdf-base-source', 'declare_artifact', declaration({
      path: '/tmp/artigen-workspace/report.pdf',
      role: 'pdf',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      url: baseUrl
    })),
    toolResponse('forbidden-shell-detour', 'sandbox_shell', {
      script: 'test -f /tmp/artigen-workspace/report.pdf',
      purpose: '再次检查未变化的 PDF'
    }),
    toolResponse('pdf-exact-source', 'declare_artifact', declaration({
      path: '/tmp/artigen-workspace/report.pdf',
      role: 'pdf',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      url: exactUrl
    })),
    {
      id: 'response-final',
      message: { role: 'assistant', content: 'Markdown 与 PDF 均已验证并交付。' },
      prompt_eval_count: 0,
      eval_count: 0,
      siliconFlowUsage: {}
    }
  ];
  const requests = [];
  provider.createChat = async (payload) => {
    requests.push(structuredClone(payload));
    return responses.shift();
  };
  const declarations = [];
  const states = [];
  let shellCalls = 0;
  const result = await provider.execute({
    objective: taskSpec.goal,
    capabilities: { files: true, shell: true, browser: true },
    deliverables: ['report'],
    maxSteps: 12,
    runtimeContext: { runtimeVersion: 2, taskSpec, maxCredits: 50 },
    callbacks: {
      checkControl: async () => {},
      declareArtifact: async (args) => {
        declarations.push(structuredClone(args));
        if (declarations.length === 2) {
          throw new ApiError(422, 'AGENT_ARTIFACT_SOURCE_NOT_OBSERVED', {
            details: { observedUrls: [exactUrl] }
          });
        }
        return {
          artifactId: `artifact-${declarations.length}`,
          role: args.role,
          filename: args.filename,
          mimeType: args.mimeType,
          verificationStatus: 'passed'
        };
      },
      shell: async () => {
        shellCalls += 1;
        return { success: true, returnCode: 0, stdout: '', stderr: '' };
      },
      saveModelState: async (value) => { states.push(structuredClone(value)); },
      recordUsage: async () => {},
      currentBudgetRatio: async () => 0,
      toolObservation: async () => {},
      verifyDraft: async () => ({
        result: {
          passed: true,
          score: 100,
          issues: [],
          repairInstructions: [],
          unsupportedVisualJudgment: false,
          criteria: []
        },
        credits: 0,
        usage: {}
      })
    }
  });

  assert.equal(result.text, 'Markdown 与 PDF 均已验证并交付。');
  assert.equal(shellCalls, 0);
  assert.equal(declarations.length, 3);
  assert.equal(declarations[2].sources[0].url, exactUrl);
  assert.equal(requests[2].tool_choice.function.name, 'declare_artifact');
  assert.equal(requests[3].tool_choice.function.name, 'declare_artifact');
  assert.ok(JSON.stringify(requests[2]).includes(exactUrl));
  assert.ok(JSON.stringify(requests[3]).includes(exactUrl));
  assert.ok(JSON.stringify(requests[3]).includes('AGENT_ARTIFACT_DECLARATION_RETRY_REQUIRED'));
  assert.ok(states.some((state) => (
    state.artifactDeclarationRetryCode === 'AGENT_ARTIFACT_SOURCE_NOT_OBSERVED' &&
    state.artifactDeclarationObservedUrls?.includes(exactUrl)
  )));
  assert.equal(states.at(-1).artifactDeclarationRetryCode, '');
  assert.deepEqual(states.at(-1).artifactDeclarationObservedUrls, []);
});

test('Runtime V2 stops two consecutive identical successful Shell actions', async () => {
  const provider = new SiliconFlowAgentModelProvider({
    env: {
      AGENT_MODEL_PROVIDER: 'siliconflow',
      AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'test-only-key'
    }
  });
  let modelCalls = 0;
  provider.createChat = async () => ({
    id: `response-success-loop-${++modelCalls}`,
    message: {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: `call-success-loop-${modelCalls}`,
        type: 'function',
        function: {
          name: 'sandbox_shell',
          arguments: JSON.stringify({
            script: 'test -f /tmp/artigen-workspace/report.pdf',
            purpose: modelCalls === 1
              ? '验证 PDF 文件是否可以正常打开'
              : '再次确认 PDF 文件仍然存在'
          })
        }
      }]
    },
    prompt_eval_count: 0,
    eval_count: 0,
    siliconFlowUsage: {}
  });
  const taskSpec = normalizeTaskSpec({
    goal: '验证工作区中的 PDF',
    deliverables: []
  }, { capabilities: { shell: true }, maxCredits: 50 });
  let shellCalls = 0;
  const states = [];
  await assert.rejects(provider.execute({
    objective: taskSpec.goal,
    capabilities: { shell: true },
    deliverables: [],
    maxSteps: 10,
    runtimeContext: { runtimeVersion: 2, taskSpec, maxCredits: 50 },
    callbacks: {
      checkControl: async () => {},
      shell: async () => {
        shellCalls += 1;
        return { success: true, returnCode: 0, stdout: '', stderr: '' };
      },
      saveModelState: async (value) => { states.push(structuredClone(value)); },
      recordUsage: async () => {},
      currentBudgetRatio: async () => 0,
      toolObservation: async () => {}
    }
  }), { code: 'AGENT_RUNTIME_STATE_LOOP' });

  assert.equal(modelCalls, 2);
  assert.equal(shellCalls, 1);
  assert.equal(states.at(-1).repeatedSuccessfulShellActions, 2);
  assert.match(states.at(-1).lastSuccessfulShellFingerprint, /^[a-f0-9]{64}$/);
});
