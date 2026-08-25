const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { createAgentRunService } = require('../services/agent-run-service');
const { checkDatabase } = require('../services/readiness-service');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

test('PostgreSQL subagent counters, ownership and run costs remain isolated and monotonic', {
  skip: !enabled
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const readiness = await checkDatabase(pool);
  assert.equal(readiness.ok, true);
  assert.equal(readiness.migration, '025_agent_runtime_v2_1_durability');
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const users = await pool.query(
    `INSERT INTO users (legacy_user_id,display_name,status)
     VALUES ($1,$2,'active'),($3,$4,'active') RETURNING id`,
    [`agent-hardening-a-${suffix}`, 'Agent hardening A',
      `agent-hardening-b-${suffix}`, 'Agent hardening B']
  );
  const [userA, userB] = users.rows.map((row) => row.id);
  const workerId = `agent-hardening-${suffix}`;
  let runId = null;
  try {
    const run = await pool.query(
      `INSERT INTO agent_runs
        (user_id,status,idempotency_key,request_hash,model_name,sandbox_version,max_credits,
         worker_id,runtime_version,lease_epoch,lease_expires_at)
       VALUES ($1,'running',$2,$3,'Qwen/Qwen3-8B','shared-v1',50,$4,2,1,
         clock_timestamp()+interval '10 minutes')
       RETURNING id`,
      [userA, `agent-hardening:${suffix}`, crypto.randomBytes(32), workerId]
    );
    runId = run.rows[0].id;
    const child = await pool.query(
      `INSERT INTO agent_subagents
        (run_id,ordinal,role,label,status,request_hash)
       VALUES ($1,1,'analyst','Independent analysis','running',$2)
       RETURNING id`,
      [runId, crypto.randomBytes(32)]
    );
    const subagentId = child.rows[0].id;
    const service = createAgentRunService({
      pool,
      env: {
        ...process.env,
        AGENT_BETA_MODE: 'authenticated-v1',
        AGENT_SUBAGENTS_ENABLED: 'true'
      }
    });

    await service.appendStep({
      runId,
      subagentId,
      workerId,
      leaseEpoch: 1,
      role: 'executor',
      status: 'failed',
      toolName: 'sandbox_shell',
      summary: 'First isolated failure'
    });
    await service.appendStep({
      runId,
      subagentId,
      workerId,
      leaseEpoch: 1,
      role: 'executor',
      status: 'failed',
      toolName: 'sandbox_shell',
      summary: 'Second isolated failure'
    });
    await service.appendStep({
      runId,
      workerId,
      leaseEpoch: 1,
      role: 'planner',
      status: 'succeeded',
      toolName: 'update_plan',
      summary: 'Parent continues after the isolated child failure'
    });

    const counters = await pool.query(
      `SELECT run.step_count AS run_steps,run.consecutive_failures AS run_failures,
              child.step_count AS child_steps,child.consecutive_failures AS child_failures
         FROM agent_runs run
         JOIN agent_subagents child ON child.run_id=run.id
        WHERE run.id=$1 AND child.id=$2`,
      [runId, subagentId]
    );
    assert.deepEqual({
      runSteps: Number(counters.rows[0].run_steps),
      runFailures: Number(counters.rows[0].run_failures),
      childSteps: Number(counters.rows[0].child_steps),
      childFailures: Number(counters.rows[0].child_failures)
    }, {
      runSteps: 3,
      runFailures: 0,
      childSteps: 2,
      childFailures: 2
    });

    const firstParentFingerprint = crypto.createHash('sha256')
      .update('missing input conversion')
      .digest();
    const recoveryFingerprint = crypto.createHash('sha256')
      .update('inspect missing input')
      .digest();
    await service.appendStep({
      runId,
      workerId,
      leaseEpoch: 1,
      role: 'executor',
      status: 'failed',
      toolName: 'sandbox_shell',
      summary: 'Conversion failed because the editable source is missing',
      actionFingerprint: firstParentFingerprint
    });
    await service.appendStep({
      runId,
      workerId,
      leaseEpoch: 1,
      role: 'executor',
      status: 'failed',
      toolName: 'sandbox_shell',
      summary: 'A different recovery action checks the missing source',
      actionFingerprint: recoveryFingerprint
    });
    const distinctFailures = await service.getControlState({ runId });
    assert.equal(Number(distinctFailures.consecutive_failures), 1);
    await service.appendStep({
      runId,
      workerId,
      leaseEpoch: 1,
      role: 'executor',
      status: 'failed',
      toolName: 'sandbox_shell',
      summary: 'The same recovery action failed again',
      actionFingerprint: recoveryFingerprint
    });
    const repeatedFailure = await service.getControlState({ runId });
    assert.equal(Number(repeatedFailure.consecutive_failures), 2);
    await service.appendStep({
      runId,
      workerId,
      leaseEpoch: 1,
      role: 'planner',
      status: 'succeeded',
      toolName: 'update_plan',
      summary: 'Parent chooses a new recovery plan'
    });
    const recovered = await service.getControlState({ runId });
    assert.equal(Number(recovered.consecutive_failures), 0);

    assert.equal((await service.recordUsage({
      runId,
      workerId,
      leaseEpoch: 1,
      estimatedCredits: 7,
      items: { source: 'newer' }
    })), 7);
    assert.equal((await service.recordUsage({
      runId,
      workerId,
      leaseEpoch: 1,
      estimatedCredits: 4,
      items: { source: 'stale' }
    })), 7);
    const usage = await pool.query(
      'SELECT estimated_credits_used FROM agent_runs WHERE id=$1',
      [runId]
    );
    assert.equal(Number(usage.rows[0].estimated_credits_used), 7);

    const artifactBytes = Buffer.from('# Verified recovery artifact\n');
    const artifactSha256 = crypto.createHash('sha256').update(artifactBytes).digest('hex');
    const [registeredArtifact, duplicateArtifact] = await Promise.all([
      service.registerArtifact({
        runId,
        workerId,
        leaseEpoch: 1,
        role: 'editable',
        filename: 'recovery.md',
        mimeType: 'text/markdown',
        byteSize: artifactBytes.length,
        sha256: artifactSha256,
        verificationStatus: 'passed'
      }),
      service.registerArtifact({
        runId,
        workerId,
        leaseEpoch: 1,
        role: 'source',
        filename: 'recovery.md',
        mimeType: 'text/markdown',
        byteSize: artifactBytes.length,
        sha256: artifactSha256,
        verificationStatus: 'passed'
      })
    ]);
    assert.equal(duplicateArtifact.artifactId, registeredArtifact.artifactId);
    assert.equal(duplicateArtifact.role, registeredArtifact.role);
    assert.equal(
      [registeredArtifact.alreadyRegistered, duplicateArtifact.alreadyRegistered]
        .filter((value) => value === true).length,
      1
    );
    const artifactCount = await pool.query(
      'SELECT count(*)::int AS count FROM agent_artifacts WHERE run_id=$1',
      [runId]
    );
    assert.equal(artifactCount.rows[0].count, 1);
    const recoveredArtifact = await service.findArtifactByContent({
      runId,
      role: 'source',
      filename: 'recovery.md',
      mimeType: 'text/markdown',
      sha256: artifactSha256
    });
    assert.equal(recoveredArtifact.artifactId, registeredArtifact.artifactId);
    assert.equal(recoveredArtifact.role, registeredArtifact.role);
    assert.equal(recoveredArtifact.alreadyRegistered, true);

    await assert.rejects(
      service.cancelSubagent({ userId: userB, runId, subagentId }),
      { code: 'AGENT_RUN_NOT_FOUND' }
    );
    const cancelled = await service.cancelSubagent({ userId: userA, runId, subagentId });
    assert.equal(cancelled.status, 'cancelled');
  } finally {
    if (runId) {
      await pool.query(
        `UPDATE agent_subagents
            SET status=CASE WHEN status IN ('succeeded','failed','cancelled') THEN status ELSE 'cancelled' END,
                cancel_requested=true,
                error_code=COALESCE(error_code,'INTEGRATION_TEST_CLEANUP'),
                finished_at=COALESCE(finished_at,now()),
                updated_at=now()
          WHERE run_id=$1`,
        [runId]
      );
      await pool.query(
        `UPDATE agent_runs
            SET status='failed',error_code='INTEGRATION_TEST_CLEANUP',
                worker_id=NULL,lease_expires_at=NULL,
                finished_at=COALESCE(finished_at,now()),updated_at=now()
          WHERE id=$1 AND idempotency_key LIKE 'agent-hardening:%'`,
        [runId]
      );
    }
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[userA, userB]]).catch(() => {});
    await pool.end();
  }
});
