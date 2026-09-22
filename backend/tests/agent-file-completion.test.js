const assert = require('node:assert/strict');
const test = require('node:test');
const { createAgentRunService } = require('../services/agent-run-service');
const { encryptAgentPayload } = require('../services/agent-payload-service');

const runId = '11111111-1111-4111-8111-111111111111';
const workerId = 'file-completion-test-worker';
const env = { AGENT_FEATURE_ENABLED: '1', AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}` };
const csv = { role: 'editable', mime_type: 'text/plain', verification_status: 'passed', sources: [] };
const cases = [
  { name: 'V1 CSV without a preset deliverable', version: 1, artifacts: [csv], passes: true },
  { name: 'V1 missing file', version: 1, artifacts: [], passes: false },
  { name: 'V1 failed file verification', version: 1, artifacts: [{ ...csv, verification_status: 'failed' }], passes: false },
  { name: 'V1 preview without editable source', version: 1, artifacts: [{ ...csv, role: 'preview' }], passes: false },
  { name: 'CSV cannot satisfy an XLSX requirement', version: 1, artifacts: [csv], required: ['spreadsheet'], passes: false },
  { name: 'V2 verified CSV without a preset deliverable', version: 2, artifacts: [csv], kind: 'artifacts', semanticPassed: true, passes: true },
  { name: 'V2 CSV still requires semantic verification', version: 2, artifacts: [csv], kind: 'artifacts', semanticPassed: false, passes: false },
  { name: 'V2 verified text-only answer', version: 2, artifacts: [], kind: 'text', semanticPassed: true, passes: true },
  { name: 'V2 unverified text-only answer', version: 2, artifacts: [], kind: 'text', semanticPassed: false, passes: false }
];

for (const fixture of cases) {
  test(fixture.name, async () => {
    let status = 'verifying';
    let settlements = 0;
    let checkpoint;
    if (fixture.kind) {
      const id = '33333333-3333-4333-8333-333333333333';
      const encrypted = encryptAgentPayload({
        runId, payloadId: id, kind: 'model_checkpoint', env,
        value: { readyToFinalize: {
          kind: fixture.kind,
          ...(fixture.kind === 'text' ? { finalTextSha256: 'ab'.repeat(32) } : {}),
          semanticVerification: { passed: fixture.semanticPassed }
        } }
      });
      checkpoint = { id, algorithm: encrypted.algorithm, iv: encrypted.iv, auth_tag: encrypted.authTag, ciphertext: encrypted.ciphertext };
    }
    const client = {
      release() {},
      async query(sql) {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT \* FROM agent_runs/.test(sql)) return { rows: [{
          id: runId, status, runtime_version: fixture.version, worker_id: workerId,
          lease_epoch: 1, lease_expires_at: new Date(Date.now() + 60_000),
          max_credits: 10, step_count: 3, replan_count: 0
        }], rowCount: 1 };
        if (/FROM agent_artifacts/.test(sql)) return { rows: fixture.artifacts, rowCount: fixture.artifacts.length };
        if (/FROM agent_steps/.test(sql)) return { rows: [
          { sequence: 1, role: 'planner', status: 'succeeded', tool_name: 'update_plan' },
          { sequence: 2, role: 'executor', status: 'succeeded', tool_name: 'shell' },
          { sequence: 3, role: 'verifier', status: 'succeeded', tool_name: 'declare_artifact' }
        ], rowCount: 3 };
        if (/FROM agent_approvals/.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT \* FROM agent_model_checkpoints/.test(sql)) return { rows: checkpoint ? [checkpoint] : [], rowCount: checkpoint ? 1 : 0 };
        if (/SELECT \* FROM agent_budget_holds/.test(sql)) return { rows: [{
          run_id: runId, user_id: '22222222-2222-4222-8222-222222222222',
          status: 'held', max_credits: 10, free_credits: 10, trial_credits: 0,
          daily_free_credits: 10, paid_credits: 0, created_at: new Date()
        }], rowCount: 1 };
        if (/UPDATE agent_budget_holds\s+SET status=/.test(sql)) { settlements += 1; return { rows: [], rowCount: 1 }; }
        if (/UPDATE agent_runs\s+SET status='succeeded'/.test(sql)) {
          status = 'succeeded';
          return { rows: [{ id: runId, status, charged_credits: 1 }], rowCount: 1 };
        }
        if (/INSERT INTO agent_events/.test(sql)) return { rows: [{ id: '1', run_id: runId }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }
    };
    const service = createAgentRunService({ pool: { connect: async () => client }, env });
    const input = { runId, workerId, leaseEpoch: 1, actualCredits: 1,
      checklist: { requiredArtifactCount: 0, requiredDeliverables: fixture.required || [] } };
    if (fixture.passes) {
      assert.equal((await service.finishRun(input)).status, 'succeeded');
      assert.equal(settlements, 1);
      await assert.rejects(service.finishRun(input), { code: 'AGENT_NOT_VERIFYING' });
      assert.equal(settlements, 1);
    } else {
      await assert.rejects(service.finishRun(input), { code: 'AGENT_VERIFICATION_INCOMPLETE' });
      assert.equal(settlements, 0);
      assert.equal(status, 'verifying');
    }
  });
}
