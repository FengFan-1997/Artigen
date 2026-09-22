const test = require('node:test');
const assert = require('node:assert/strict');
const { SiliconFlowAgentModelProvider } = require('../services/agent-model-provider');
const { createAgentRunService } = require('../services/agent-run-service');
const { encryptAgentPayload } = require('../services/agent-payload-service');

const env = { AGENT_FEATURE_ENABLED: 'true', AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}` };
const runId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const payloadId = '33333333-3333-4333-8333-333333333333';
const row = { id: runId, user_id: userId, status: 'running', worker_id: 'test-worker', lease_epoch: 1, lease_expires_at: new Date(Date.now() + 60_000) };
const message = '把价格改成 20 元，保留三行。\n上一版的名称不变。';
const encrypted = encryptAgentPayload({ runId, payloadId, kind: 'user_input', value: { message }, env });
const record = { id: payloadId, kind: 'user_input', algorithm: encrypted.algorithm, iv: encrypted.iv, auth_tag: encrypted.authTag, ciphertext: encrypted.ciphertext };
const event = { id: '7', run_id: runId, event_type: 'run.input_received', summary: '已收到补充信息', data: { messagePayloadId: payloadId } };
const makeService = (query) => createAgentRunService({ env, pool: { connect: async () => ({ release() {}, query: async (sql, values) => {
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
  return query(sql, values);
} }) } });

test('owned history restores the exact encrypted user message without storing plaintext in events', async () => {
  const service = makeService(async (sql, values) => {
    if (sql.includes('FROM users')) return { rows: [{ id: userId }], rowCount: 1 };
    if (sql.includes('FROM agent_runs run')) return { rows: [row], rowCount: 1 };
    if (sql.includes('FROM agent_events')) return { rows: [event], rowCount: 1 };
    if (sql.includes('FROM agent_run_payloads')) {
      assert.deepEqual(values, [runId, [payloadId]]);
      assert.match(sql, /kind='user_input'/);
      return { rows: [record], rowCount: 1 };
    }
    throw Error(sql);
  });
  const result = await service.listEvents({ userId, runId });
  assert.equal(result[0].data.messageText, message);
  assert.equal(event.data.messageText, undefined);
  assert.ok(!JSON.stringify(record).includes(message));
});

test('history denies a different owner before reading event payloads', async () => {
  const service = makeService(async (sql) => {
    if (sql.includes('FROM users')) return { rows: [{ id: userId }], rowCount: 1 };
    if (sql.includes('FROM agent_runs run')) return { rows: [], rowCount: 0 };
    assert.fail('Private event data read before ownership');
  });
  await assert.rejects(service.listEvents({ userId, runId }), { code: 'AGENT_RUN_NOT_FOUND' });
});

test('worker only reads context with the current lease', async () => {
  const service = makeService(async (sql) => {
    if (sql.includes('FROM agent_runs')) return { rows: [row], rowCount: 1 };
    if (sql.includes('FROM agent_run_payloads')) return { rows: [record], rowCount: 1 };
    throw Error(sql);
  });
  assert.deepEqual(await service.readUserInputs({ runId, workerId: 'test-worker', leaseEpoch: 1 }), [{ id: payloadId, message }]);
  await assert.rejects(service.readUserInputs({ runId, workerId: 'stale-worker', leaseEpoch: 1 }), { code: 'AGENT_LEASE_LOST' });
});

test('model receives mid-run updates once, persists them for resume and publishes only public content', async () => {
  const requests = [], commentary = [], applied = [], states = [];
  let planRan = false;
  const replies = [
    { content: '我先整理菜单，再检查价格。', reasoning_content: 'PRIVATE REASONING', tool_calls: [{ id: 'call-plan', type: 'function', function: { name: 'update_plan', arguments: JSON.stringify({ explanation: '整理菜单', steps: [{ label: '准备', status: 'in_progress' }, { label: '检查', status: 'pending' }] }) } }] },
    { content: '已按补充要求整理。' }
  ];
  const makeProvider = (responses) => new SiliconFlowAgentModelProvider({ env: {
    AGENT_MODEL_PROVIDER: 'siliconflow', AGENT_MODEL_NAME: 'Qwen/Qwen3-8B', SILICONFLOW_API_KEY: 'test-key', AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0'
  }, fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const next = responses.shift(); assert.ok(next, 'unexpected additional model call');
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', ...next } }], usage: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  const callbacks = {
    updatePlan: async () => { planRan = true; return { accepted: true }; },
    readUserInputs: async () => planRan ? [{ id: payloadId, message }] : [],
    inputApplied: async (id) => applied.push(id),
    onCommentary: async (update) => commentary.push(update),
    saveModelState: async (state) => states.push(structuredClone(state)),
    clearModelState: async () => {}, recordUsage: async () => {}
  };
  await makeProvider(replies).execute({ objective: '整理菜单', capabilities: { files: true, shell: true }, maxSteps: 8, callbacks });
  assert.equal(requests[0].messages.some((m) => m.content === message), false);
  assert.equal(requests[1].messages.filter((m) => m.content === message).length, 1);
  assert.deepEqual(applied, [payloadId]);
  assert.equal(commentary[0].text, '我先整理菜单，再检查价格。');
  assert.ok(!JSON.stringify(commentary).includes('PRIVATE REASONING'));
  const resume = states.findLast((state) => state.appliedInputIds?.includes(payloadId));
  assert.ok(resume);
  const resumedUpdates = [];
  await makeProvider([{ content: '继续完成。' }]).execute({ objective: '整理菜单', capabilities: { files: true, shell: true }, maxSteps: 8, resumeState: resume,
    callbacks: { ...callbacks, inputApplied: async (id) => resumedUpdates.push(id) } });
  assert.deepEqual(resumedUpdates, []);
  assert.equal(requests.at(-1).messages.filter((m) => m.content === message).length, 1);
});

test('assistant commentary replay is idempotent and still checks the lease', async () => {
  let inserted = 0;
  const existing = { id: '9', run_id: runId, event_type: 'assistant.message', summary: '正在检查', data: { messageKey: 'stable-key' } };
  const service = makeService(async (sql) => {
    if (sql.includes('SELECT 1 FROM agent_runs')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM agent_events')) return { rows: [existing], rowCount: 1 };
    if (sql.includes('INSERT')) inserted += 1;
    throw Error(sql);
  });
  assert.equal((await service.appendRuntimeEvent({ runId, workerId: 'test-worker', leaseEpoch: 1, type: 'assistant.message', summary: '正在检查', data: { messageKey: 'stable-key' } })).eventId, '9');
  assert.equal(inserted, 0);
});

test('finalization cannot pass over a user update that arrived after the last model request', async () => {
  const service = makeService(async (sql) => {
    if (sql.includes('SELECT 1 FROM agent_runs')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM agent_run_payloads')) return { rows: [record], rowCount: 1 };
    assert.fail('Finalization written before all accepted input was applied');
  });
  await assert.rejects(service.appendRuntimeEvent({ runId, workerId: 'test-worker', leaseEpoch: 1,
    type: 'run.ready_to_finalize', data: { appliedInputIds: [] } }), { code: 'AGENT_INPUT_PENDING' });
});


test('a resumed V2 final answer is invalidated by a newly accepted requirement', async () => {
  const { normalizeTaskSpec, createWorkingState } = require('../services/agent-runtime-v2');
  const taskSpec = normalizeTaskSpec({ goal: '整理菜单', deliverables: [], plan: [
    { id: 'answer', label: '整理答案', phase: 'production' },
    { id: 'verify', label: '核对答案', phase: 'verification' }
  ] }, { maxCredits: 50 });
  const requests = [], states = [];
  let verifications = 0;
  const provider = new SiliconFlowAgentModelProvider({ env: {
    AGENT_MODEL_PROVIDER: 'siliconflow', AGENT_MODEL_NAME: 'Qwen/Qwen3-8B', SILICONFLOW_API_KEY: 'test-key', AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0'
  }, fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '三行菜单价格均为 20 元。' } }], usage: {} }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  const result = await provider.execute({ objective: taskSpec.goal, capabilities: {}, deliverables: [], maxSteps: 10,
    runtimeContext: { runtimeVersion: 2, runId, userId, taskSpec, maxCredits: 50 },
    resumeState: { version: 3, provider: 'siliconflow', messages: [{ role: 'assistant', content: '旧版菜单' }], taskSpec,
      workingState: createWorkingState({ taskSpec }), totalCredits: 1, turns: 1, planPublished: true,
      text: '旧版菜单', semanticVerificationPassed: true, semanticVerificationResult: { passed: true },
      readyToFinalize: { kind: 'text', text: '旧版菜单', responseId: 'old-response' },
      pendingVerifierResult: { result: { passed: true }, credits: 0, usage: {} }
    }, callbacks: {
      readUserInputs: async () => [{ id: payloadId, message }],
      saveModelState: async (state) => states.push(structuredClone(state)),
      verifyDraft: async () => { verifications++; return { result: { passed: true, score: 100, issues: [], repairInstructions: [] }, credits: 0, usage: {} }; },
      checkControl: async () => {}, recordUsage: async () => {}, clearModelState: async () => {}
    }
  });
  assert.equal(requests.length, 1);
  assert.ok(JSON.stringify(requests[0].messages).includes('把价格改成 20 元'));
  assert.equal(result.text, '三行菜单价格均为 20 元。');
  assert.equal(verifications, 1);
  const updated = states.find((state) => state.appliedInputIds?.includes(payloadId));
  assert.equal(updated.pendingVerifierResult, null);
  assert.equal(updated.semanticVerificationResult, null);
  assert.equal(updated.readyToFinalize, null);
});
