const { Pool } = require('pg');

const { createModelCallService } = require('../../services/agent-model-runtime-service');
const { createAgentRunService } = require('../../services/agent-run-service');

const stableCode = (error) => (/^[A-Z][A-Z0-9_]{2,100}$/.test(String(error?.code || ''))
  ? String(error.code)
  : 'AGENT_CROSS_PROCESS_RECOVERY_PROBE_FAILED');

const main = async () => {
  const runId = String(process.env.AGENT_CROSS_PROCESS_RUN_ID || '');
  const workerId = String(process.env.AGENT_CROSS_PROCESS_WORKER_ID || '');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const runService = createAgentRunService({ pool, env: process.env });
    const modelCalls = createModelCallService({ pool, env: process.env });
    const claimed = await runService.claimRun({ runId, workerId });
    if (!claimed) throw Object.assign(new Error('not claimed'), {
      code: 'AGENT_CROSS_PROCESS_RECOVERY_NOT_CLAIMED'
    });
    const leaseEpoch = Number(claimed.lease_epoch || 0);
    const lease = { runId, workerId, leaseEpoch };
    await runService.transitionRun({
      ...lease,
      toStatus: 'running',
      eventType: 'run.started',
      summary: '真实子进程恢复探针开始'
    });
    const reservationKey = `model:cross-process:${runId}`;
    await runService.reserveRuntimeBudget({
      ...lease,
      component: 'actor',
      reservationKey,
      maximumCredits: 2
    });
    const call = await modelCalls.start({
      ...lease,
      provider: 'siliconflow',
      modelName: 'Qwen/Qwen3-8B',
      phase: 'actor',
      turn: 1,
      promptProfile: 'cross-process-recovery-probe',
      promptHash: 'ab'.repeat(32),
      estimatedInputTokens: 100,
      reservationKey,
      intent: { kind: 'synthetic-cross-process-recovery-probe' }
    });
    await modelCalls.markDispatched(call);
    process.send?.({ event: 'dispatched', callId: call.id, leaseEpoch });
    // The parent deliberately SIGKILLs this process. Keeping the event loop
    // alive here makes process death—not an in-process exception—the only way
    // to leave the dispatched receipt unresolved.
    setInterval(() => {}, 60_000);
  } catch (error) {
    process.send?.({ event: 'failed', code: stableCode(error) });
    await pool.end().catch(() => {});
    process.disconnect?.();
  }
};

main();
