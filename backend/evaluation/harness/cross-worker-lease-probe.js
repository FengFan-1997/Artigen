const { Pool } = require('pg');

const { createAgentRunService } = require('../../services/agent-run-service');

const stableCode = (error) => (/^[A-Z][A-Z0-9_]{2,100}$/.test(String(error?.code || ''))
  ? String(error.code)
  : 'AGENT_CROSS_WORKER_PROBE_FAILED');

const main = async () => {
  const runId = String(process.env.AGENT_CROSS_WORKER_RUN_ID || '');
  const workerId = String(process.env.AGENT_CROSS_WORKER_ID || '');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const runService = createAgentRunService({ pool, env: process.env });
  try {
    const claimed = await runService.claimRun({ runId, workerId });
    if (!claimed) throw Object.assign(new Error('not claimed'), { code: 'AGENT_CROSS_WORKER_NOT_CLAIMED' });
    const leaseEpoch = Number(claimed.lease_epoch || 0);
    await runService.transitionRun({
      runId,
      workerId,
      leaseEpoch,
      toStatus: 'running',
      eventType: 'run.started',
      summary: '独立进程租约探针开始'
    });
    process.send?.({ event: 'claimed', workerId, leaseEpoch });
    process.once('message', async (message) => {
      if (message?.command !== 'append') return;
      try {
        await runService.appendRuntimeEvent({
          runId,
          workerId,
          leaseEpoch,
          type: 'harness.cross_worker_probe',
          phase: 'running',
          summary: '独立进程租约写入探针'
        });
        process.send?.({ event: 'append', workerId, leaseEpoch, ok: true });
      } catch (error) {
        process.send?.({
          event: 'append',
          workerId,
          leaseEpoch,
          ok: false,
          code: stableCode(error)
        });
      } finally {
        await pool.end().catch(() => {});
        process.disconnect?.();
      }
    });
  } catch (error) {
    process.send?.({ event: 'failed', workerId, code: stableCode(error) });
    await pool.end().catch(() => {});
    process.disconnect?.();
  }
};

main();
