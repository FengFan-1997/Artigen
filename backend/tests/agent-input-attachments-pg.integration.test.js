const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
const { createAgentRunService } = require('../services/agent-run-service');
const { createWorkspaceService } = require('../services/workspace-service');
const { createInputAssetStager } = require('../services/agent-worker-service');
const { openAsset, FileAssetAdapter } = require('../services/asset-storage');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

test('PostgreSQL attachment-only inputs serialize retries, enforce access and recover encrypted files', { skip: !enabled }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'artigen-input-test-'));
  const adapter = new FileAssetAdapter(root);
  const env = { AGENT_FEATURE_ENABLED: 'true', AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'72'.repeat(32)}` };
  const bytes = Buffer.from('Private brief with revised price: 20.');
  const userIds = [], runIds = [], assetIds = [];
  try {
    const users = await pool.query("INSERT INTO users(display_name) VALUES('Attachment owner'),('Other owner') RETURNING id");
    userIds.push(...users.rows.map((row) => row.id));
    const [userId, otherUserId] = userIds;
    const run = await pool.query(`INSERT INTO agent_runs
      (user_id,status,idempotency_key,request_hash,model_provider,model_name,sandbox_version,max_credits,worker_id,lease_epoch,lease_expires_at)
      VALUES($1,'running',$2,$3,'cloudflare','fixture','fixture',50,'fixture-worker',1,clock_timestamp()+interval '10 minutes') RETURNING id`,
    [userId, crypto.randomUUID(), crypto.randomBytes(32)]);
    const runId = run.rows[0].id;
    runIds.push(runId);
    const createAsset = async (owner, expired = false) => {
      const stored = await adapter.putBuffer({ key: `${crypto.randomUUID()}.txt`, buffer: bytes });
      const result = await pool.query(`INSERT INTO assets(owner_user_id,storage_driver,uri,mime_type,byte_size,sha256,expires_at)
        VALUES($1,'file',$2,'text/plain',$3,$4,now()+($5 * interval '1 minute')) RETURNING id`,
      [owner, stored.uri, bytes.length, crypto.createHash('sha256').update(bytes).digest(), expired ? -1 : 60]);
      assetIds.push(result.rows[0].id);
      return result.rows[0].id;
    };
    const assetId = await createAsset(userId);
    const foreignAsset = await createAsset(otherUserId);
    const expiredAsset = await createAsset(userId, true);
    const service = createAgentRunService({ pool, env });
    const request = { userId, runId, assetIds: [assetId], assetNames: { [assetId]: 'confidential-brief.txt' }, inputId: crypto.randomUUID() };

    const submitted = await Promise.all([service.submitInput(request), service.submitInput(request)]);
    assert.deepEqual(submitted.sort(), [false, true]);
    await assert.rejects(service.submitInput({ ...request, message: 'Different input' }), { code: 'IDEMPOTENCY_CONFLICT' });
    for (const id of [foreignAsset, expiredAsset]) {
      await assert.rejects(service.submitInput({ ...request, assetIds: [id], assetNames: {}, inputId: crypto.randomUUID() }), { code: 'AGENT_INPUT_ASSET_NOT_FOUND' });
    }
    await assert.rejects(service.submitInput({ ...request, userId: otherUserId }), { code: 'AGENT_RUN_NOT_FOUND' });
    const persisted = await pool.query('SELECT ciphertext FROM agent_run_payloads WHERE run_id=$1', [runId]);
    assert.equal(persisted.rowCount, 1);
    assert.ok(!persisted.rows[0].ciphertext.includes(Buffer.from('confidential-brief.txt')));
    const events = await service.listEvents({ userId, runId });
    const messages = await createWorkspaceService({ pool, env }).messages({ userId, runId });
    assert.equal(events[0].data.messagePayloadId, messages.messages[0].id);
    assert.deepEqual(events[0].data.attachments, messages.messages[0].attachments);
    assert.equal(messages.messages[0].text, '');
    await assert.rejects(createWorkspaceService({ pool, env }).messages({ userId: otherUserId, runId }), { code: 'AGENT_RUN_NOT_FOUND' });

    const lease = { runId, workerId: 'fixture-worker', leaseEpoch: 1 };
    const inputs = await service.readUserInputs(lease);
    assert.deepEqual(inputs[0].assetIds, [assetId]);
    await assert.rejects(service.readUserInputs({ ...lease, leaseEpoch: 2 }), { code: 'AGENT_LEASE_LOST' });
    const sandboxFiles = new Map();
    const stagerOptions = { ownerUserId: userId, pool, sandboxName: 'fixture',
      openAsset: (input) => openAsset({ ...input, adapter }),
      checkControl: () => service.assertWorkerLeaseActive(lease),
      sandbox: { writeFile: async (_name, file, data) => sandboxFiles.set(file, Buffer.from(data)), systemShell: async () => ({ success: true }) } };
    const staged = await createInputAssetStager(stagerOptions).prepareInput(inputs[0]);
    assert.ok(staged.message.includes(`/inputs/${assetId}.txt`));
    assert.deepEqual([...sandboxFiles.values()], [bytes]);
    const restored = await service.loadPrivateContext({ runId });
    assert.deepEqual(restored.payloads.find((payload) => payload.kind === 'user_input').value.assetIds, [assetId]);
    await createInputAssetStager(stagerOptions).prepareInput(inputs[0]);
    await pool.query("UPDATE assets SET expires_at=now()-interval '1 second' WHERE id=$1", [assetId]);
    const expiredStager = createInputAssetStager(stagerOptions);
    await assert.rejects(expiredStager.prepareInput(inputs[0]), { code: 'ASSET_NOT_FOUND' });
    assert.deepEqual(expiredStager.paths, []);
    await pool.query("UPDATE agent_runs SET status='succeeded' WHERE id=$1", [runId]);
    assert.equal(await service.submitInput(request), false, 'committed input remains retryable after completion and asset expiry');
  } finally {
    try {
      // Keep the synthetic audit rows: agent_events is deliberately append-only.
      await pool.query("UPDATE agent_runs SET status='failed',worker_id=NULL,lease_expires_at=NULL,error_code='INTEGRATION_TEST_CLEANUP' WHERE id=ANY($1::uuid[])", [runIds]);
      await pool.query('DELETE FROM assets WHERE id=ANY($1::uuid[])', [assetIds]);
    } finally {
      await pool.end();
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});
