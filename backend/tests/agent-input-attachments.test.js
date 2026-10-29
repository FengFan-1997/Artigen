const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { ApiError } = require('../lib/api-error');
const { createAgentRunService } = require('../services/agent-run-service');
const { createAgentWorkerService, createInputAssetStager } = require('../services/agent-worker-service');
const { SiliconFlowAgentModelProvider } = require('../services/agent-model-provider');
const { encryptAgentPayload, decryptAgentPayload } = require('../services/agent-payload-service');
const { normalizeInputAttachments } = require('../services/agent-input-attachments');
const { installAgentRoutes } = require('../routes/agent-runs');

const runId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
const inputId = '44444444-4444-4444-8444-444444444444';
const payloadId = '55555555-5555-4555-8555-555555555555';
const env = { AGENT_FEATURE_ENABLED: 'true', AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}` };
const bytes = Buffer.from('Use the updated price: 20.');
const asset = { id: assetId, mime_type: 'text/plain', byte_size: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest(), owner_user_id: userId };
const encryptedRecord = (value, id = payloadId, kind = 'user_input') => {
  const encrypted = encryptAgentPayload({ runId, payloadId: id, kind, value, env });
  return { id, kind, algorithm: encrypted.algorithm, key_version: encrypted.keyVersion,
    iv: encrypted.iv, auth_tag: encrypted.authTag, ciphertext: encrypted.ciphertext };
};

const fixtureService = ({ state = 'running', ownedAssets = [asset], previousPayloads = [], finalizing = false,
  modelProvider = 'cloudflare', otherOwner = false } = {}) => {
  const payloads = [], events = [], published = [];
  const row = { id: runId, user_id: userId, model_provider: modelProvider, status: state,
    worker_id: 'worker', lease_epoch: 1, lease_expires_at: new Date(Date.now() + 60000) };
  const query = async (sql, values) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('pg_notify')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM users')) return { rows: [{ id: userId }], rowCount: 1 };
    if (sql.includes('FROM agent_runs run')) return { rows: otherOwner ? [] : [row], rowCount: otherOwner ? 0 : 1 };
    if (sql.includes('FROM agent_runs')) return { rows: [row], rowCount: 1 };
    if (sql.includes("data->>'inputId'")) {
      const found = events.filter((event) => event.data.inputId === values[1]);
      return { rows: found, rowCount: found.length };
    }
    if (sql.includes("event_type='run.ready_to_finalize'")) return { rows: finalizing ? [{}] : [], rowCount: finalizing ? 1 : 0 };
    if (sql.includes('FROM assets')) {
      assert.match(sql, /owner_user_id=\$1/);
      assert.match(sql, /gc_state='active'/);
      assert.match(sql, /delete_requested_at IS NULL/);
      assert.match(sql, /expires_at>now\(\)/);
      return { rows: ownedAssets, rowCount: ownedAssets.length };
    }
    if (sql.includes('SELECT * FROM agent_run_payloads')) return { rows: [...previousPayloads, ...payloads], rowCount: previousPayloads.length + payloads.length };
    if (sql.includes('INSERT INTO agent_run_payloads')) {
      payloads.push({ id: values[0], kind: 'user_input', algorithm: values[2], key_version: values[3], iv: values[4], auth_tag: values[5], ciphertext: values[6] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO agent_events')) {
      const event = { id: String(events.length + 1), run_id: runId, event_type: values[1], phase: values[2], summary: values[3], data: JSON.parse(values[4]) };
      events.push(event);
      return { rows: [event], rowCount: 1 };
    }
    if (sql.includes('FROM agent_events')) return { rows: events, rowCount: events.length };
    if (sql.includes('FROM agent_approvals')) return { rows: [], rowCount: 0 };
    if (sql.includes('UPDATE agent_runs')) { row.status = 'queued'; return { rows: [row], rowCount: 1 }; }
    if (sql.includes('UPDATE agent_budget_holds')) return { rows: [], rowCount: 1 };
    throw new Error(sql);
  };
  const pool = { connect: async () => ({ query, release() {} }) };
  const service = createAgentRunService({ pool, env, queuePublisher: { publish: async (id) => published.push(id) } });
  return { service, payloads, events, published, row };
};

test('attachment-only input is encrypted, restored in owned history and bound to its idempotency key', async () => {
  const f = fixtureService();
  const request = { userId, runId, message: '', assetIds: [assetId], assetNames: { [assetId]: '../private-brief.txt' }, inputId };
  assert.equal(await f.service.submitInput(request), true);
  const value = decryptAgentPayload({ runId, payloadId: f.payloads[0].id, kind: 'user_input', record: f.payloads[0], env });
  assert.equal(value.attachments[0].filename, 'private-brief.txt');
  assert.deepEqual(value.assetIds, [assetId]);
  assert.equal(value.message, '');
  assert.ok(!JSON.stringify(f.events).includes('private-brief'));
  assert.ok(!f.payloads[0].ciphertext.toString().includes('private-brief'));
  const history = await f.service.listEvents({ userId, runId });
  assert.deepEqual(history[0].data.attachments, value.attachments);
  assert.equal(history[0].data.messageText, '');
  assert.equal(await f.service.submitInput(request), false);
  await assert.rejects(f.service.submitInput({ ...request, message: 'changed' }), { code: 'IDEMPOTENCY_CONFLICT' });
  f.row.status = 'succeeded';
  assert.equal(await f.service.submitInput(request), false, 'a lost success response may be retried after completion');
  assert.equal(f.payloads.length, 1);
});

test('input validates ownership, asset lifetime, type, size and finalization before accepting files', async () => {
  const request = { userId, runId, assetIds: [assetId], inputId };
  for (const [options, code] of [
    [{ otherOwner: true }, 'AGENT_RUN_NOT_FOUND'],
    [{ ownedAssets: [] }, 'AGENT_INPUT_ASSET_NOT_FOUND'],
    [{ ownedAssets: [{ ...asset, mime_type: 'application/x-executable' }] }, 'AGENT_INPUT_ASSET_TYPE_INVALID'],
    [{ ownedAssets: [{ ...asset, byte_size: 40 * 1024 * 1024 + 1 }] }, 'AGENT_INPUT_ASSET_TOO_LARGE'],
    [{ state: 'verifying' }, 'AGENT_INPUT_FINALIZING'],
    [{ finalizing: true }, 'AGENT_INPUT_FINALIZING'],
    [{ state: 'cancelled' }, 'AGENT_RUN_TERMINAL'],
    [{ modelProvider: 'openai' }, 'AGENT_INPUT_ATTACHMENTS_UNSUPPORTED']
  ]) {
    const f = fixtureService(options);
    await assert.rejects(f.service.submitInput(request), { code });
    assert.equal(f.payloads.length, 0);
    assert.equal(f.events.length, 0);
  }
  assert.throws(() => normalizeInputAttachments(Array(11).fill(assetId)), { code: 'AGENT_ASSET_IDS_INVALID' });
  assert.throws(() => normalizeInputAttachments([assetId], { [runId]: 'unrelated.txt' }), { code: 'AGENT_ASSET_NAMES_INVALID' });
});

test('attachment input enforces the cumulative run limit and safely resumes paused work', async () => {
  const ids = Array.from({ length: 40 }, (_, index) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`);
  const f = fixtureService({ previousPayloads: [encryptedRecord({ objective: 'Read files', assetIds: ids }, payloadId, 'objective')] });
  await assert.rejects(f.service.submitInput({ userId, runId, assetIds: [assetId], inputId }), { code: 'AGENT_RUN_INPUT_ASSET_LIMIT' });
  const paused = fixtureService({ state: 'paused' });
  const request = { userId, runId, assetIds: [assetId], inputId };
  await paused.service.submitInput(request);
  assert.equal(paused.row.status, 'queued');
  assert.deepEqual(paused.published, [runId]);
  await paused.service.submitInput(request);
  assert.equal(paused.payloads.length, 1);
  assert.equal(paused.published.length, 2, 'a publish retry must not lose accepted input');
});

const stagerFixture = ({ corrupt = false, scan = true } = {}) => {
  const files = new Map(), opened = [], commands = [];
  const sandbox = {
    writeFile: async (_sandbox, path, data) => { files.set(path, Buffer.from(data)); },
    systemShell: async (_sandbox, command) => { commands.push(command); return { success: command.startsWith('clamscan ') ? scan : true }; }
  };
  const openAsset = async ({ assetId: id, ownerUserId }) => {
    assert.equal(id, assetId); assert.equal(ownerUserId, userId); opened.push(id);
    return { record: asset, contentLength: bytes.length, body: Readable.from([corrupt ? Buffer.from('corrupt') : bytes]) };
  };
  const make = () => createInputAssetStager({ openAsset, ownerUserId: userId, pool: {}, sandbox, sandboxName: 'test', checkControl: async () => {} });
  return { make, files, opened, commands, sandbox, openAsset };
};

test('staging verifies bytes and scan before exposing a new path; recovery restores previously applied files', async () => {
  const f = stagerFixture();
  const input = { id: payloadId, message: '', assetIds: [assetId], attachments: [{ assetId, filename: 'brief.txt' }] };
  const first = f.make();
  const prepared = await first.prepareInput(input);
  const path = `/tmp/artigen-workspace/inputs/${assetId}.txt`;
  assert.ok(prepared.message.includes(path));
  assert.deepEqual(f.files.get(path), bytes);
  assert.match(f.commands[0], /clamscan --no-summary/);
  await first.prepareInput(input);
  assert.equal(f.opened.length, 1);
  await f.make().prepareInput(input);
  assert.equal(f.opened.length, 2, 'a new worker revalidates and restores prior files');
  for (const [options, code] of [[{ corrupt: true }, 'AGENT_INPUT_ASSET_INTEGRITY_FAILED'], [{ scan: false }, 'AGENT_INPUT_ASSET_SCAN_FAILED']]) {
    const bad = stagerFixture(options).make();
    await assert.rejects(bad.prepareInput(input), { code });
    assert.equal(bad.paths.length, 0);
    assert.equal(bad.stagedAssetsByPath.size, 0);
  }
  let checks = 0;
  const interrupted = createInputAssetStager({ openAsset: f.openAsset, ownerUserId: userId, pool: {}, sandbox: f.sandbox, sandboxName: 'test',
    checkControl: async () => { if (++checks === 3) throw new ApiError(409, 'AGENT_LEASE_LOST'); } });
  await assert.rejects(interrupted.prepareInput(input), { code: 'AGENT_LEASE_LOST' });
  assert.deepEqual(interrupted.paths, [], 'a lost lease after scanning must never publish the file to model context');
});

test('an attachment-only update reaches a real provider request once and survives model checkpoint resume', async () => {
  const f = stagerFixture();
  const stager = f.make();
  const requests = [], states = [], applied = [];
  const provider = new SiliconFlowAgentModelProvider({ env: {
    AGENT_MODEL_PROVIDER: 'siliconflow', AGENT_MODEL_NAME: 'Qwen/Qwen3-8B', SILICONFLOW_API_KEY: 'fixture', AGENT_SILICONFLOW_MIN_INTERVAL_MS: '0'
  }, fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '已读取补充文件。' } }], usage: {} }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  } });
  const callbacks = {
    readUserInputs: async () => [await stager.prepareInput({ id: payloadId, message: '', assetIds: [assetId] })],
    inputApplied: async (id) => applied.push(id), saveModelState: async (state) => states.push(structuredClone(state)),
    clearModelState: async () => {}, recordUsage: async () => {}
  };
  await provider.execute({ objective: 'Review the attached brief', capabilities: {}, maxSteps: 5, callbacks });
  const saved = states.findLast((state) => state.appliedInputIds?.includes(payloadId));
  await provider.execute({ objective: 'Review the attached brief', capabilities: {}, maxSteps: 5, callbacks, resumeState: saved });
  assert.deepEqual(applied, [payloadId]);
  for (const request of requests) assert.equal(request.messages.filter((item) => item.content?.includes(`/inputs/${assetId}.txt`)).length, 1);
});

test('Worker delivers live/restored attachments only after validation and settles staging failures without model usage', async () => {
  for (const [resumed, options, errorCode] of [
    [false, {}, null], [true, {}, null],
    [false, { scan: false }, 'AGENT_INPUT_ASSET_SCAN_FAILED'],
    [true, { corrupt: true }, 'AGENT_INPUT_ASSET_INTEGRITY_FAILED'],
    [true, { expired: true }, 'ASSET_NOT_FOUND']
  ]) {
    const f = stagerFixture(options);
    let delivered;
    const failures = [], destroyed = [];
    const input = { id: payloadId, message: 'Read the new brief', assetIds: [assetId], attachments: [{ assetId, filename: 'brief.txt' }] };
    const service = createAgentWorkerService({ pool: {}, workerId: 'worker', env: { AGENT_RUNTIME_DRIVER: 'fixture', AGENT_SANDBOX_PROVIDER: 'fixture', AGENT_WORKER_ID: 'worker' },
      runService: {
        claimRun: async () => ({ id: runId, worker_id: 'worker', lease_epoch: 1, lease_expires_at: new Date(Date.now() + 60000), started_at: new Date(), checkpoint: {}, sandbox_ref: resumed ? 'test' : null }),
        loadPrivateContext: async () => ({ run: { id: runId, user_id: userId, capabilities: { files: true, shell: true }, browser_config: {}, max_credits: 50, expires_at: new Date(Date.now() + 60000) },
          payloads: [{ kind: 'objective', value: { objective: 'Review a brief.', assetIds: [], deliverables: [] } }, ...(resumed ? [{ kind: 'user_input', value: input }] : [])], modelCheckpoint: null }),
        getControlState: async () => ({ status: 'running', step_count: 0, replan_count: 0, consecutive_failures: 0, unchanged_screenshots: 0 }),
        readUserInputs: async () => [input], saveCheckpoint: async () => {}, transitionRun: async () => {}, appendStep: async () => {}, failRun: async (failure) => failures.push(failure), markSandboxDestroyed: async () => {}
      }, assetStorage: { openAsset: options.expired ? async () => { throw new ApiError(404, 'ASSET_NOT_FOUND'); } : f.openAsset },
      sandbox: { ...f.sandbox, provision: async () => ({ name: 'test' }), ensureRunning: async () => {}, destroy: async (name) => destroyed.push(name) },
      model: { execute: async ({ callbacks }) => {
        if (resumed) assert.equal(f.files.size, 1, 'restored files exist before resuming the model');
        delivered = await callbacks.readUserInputs();
        assert.equal(f.files.size, 1);
        throw new ApiError(500, 'FIXTURE_COMPLETE');
      } }, integrationService: {}, imageService: {}
    });
    await assert.rejects(service.processRun(runId), { code: errorCode || 'FIXTURE_COMPLETE' });
    if (errorCode) {
      assert.equal(delivered, undefined);
      assert.equal(failures[0].errorCode, errorCode);
      assert.equal(failures[0].actualCredits, 0);
      assert.equal(failures[0].refundable, true);
    } else {
      assert.ok(delivered[0].message.includes(`/inputs/${assetId}.txt`));
      assert.equal(f.opened.length, 1);
    }
    assert.deepEqual(destroyed, ['test']);
  }
});

test('input route passes asset references and names only after authentication', async () => {
  let handler;
  const calls = [];
  installAgentRoutes({ get() {}, put() {}, delete() {}, post(path, ...handlers) { if (path === '/api/agent-runs/:runId/input') handler = handlers.at(-1); } }, {
    env, pool: {}, queuePublisher: {}, agentIntegrationService: {}, agentRunService: { submitInput: async (input) => calls.push(input) }
  });
  const res = { headersSent: false, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ authResolution: { ok: false, status: 401, error: 'LOGIN_REQUIRED' }, headers: {}, params: { runId }, body: {} }, res);
  assert.equal(calls.length, 0);
  await handler({ authResolution: { ok: true, dbUserId: userId }, headers: { 'idempotency-key': inputId }, params: { runId }, body: { assetIds: [assetId], assetNames: { [assetId]: 'brief.txt' } } }, res);
  assert.deepEqual(calls[0].assetIds, [assetId]);
  assert.deepEqual(calls[0].assetNames, { [assetId]: 'brief.txt' });
  assert.equal(calls[0].inputId, inputId);
});
