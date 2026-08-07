const { PgBoss } = require('pg-boss');
const { resolvePoolSsl } = require('../db/pool');
const { getAgentConfig } = require('./agent-config');

const AGENT_QUEUE = 'artigen-agent-run-v1';
const AGENT_DEAD_LETTER_QUEUE = 'artigen-agent-run-dlq';

const bossConfig = (env = process.env) => {
  const connectionString = String(env.DATABASE_URL || '').trim();
  if (!connectionString) {
    const error = new Error('DATABASE_NOT_CONFIGURED');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  return {
    connectionString,
    application_name: 'artigen-agent-pgboss',
    schema: String(env.PGBOSS_SCHEMA || 'pgboss').trim() || 'pgboss',
    ssl: resolvePoolSsl(connectionString, env),
    max: Math.max(2, Math.min(10, Number(env.AGENT_PGBOSS_POOL_MAX || 3) || 3)),
    useListenNotify: true
  };
};

const queueOptions = (env = process.env) => ({
  retryLimit: 2,
  retryDelay: Math.max(5, Math.min(300, Number(env.AGENT_QUEUE_RETRY_DELAY_SECONDS || 30) || 30)),
  retryBackoff: true,
  expireInSeconds: Math.max(
    300,
    Math.min(60 * 60, Number(env.AGENT_QUEUE_EXPIRE_SECONDS || 50 * 60) || 50 * 60)
  ),
  retentionSeconds: 30 * 24 * 60 * 60,
  deleteAfterSeconds: 30 * 24 * 60 * 60,
  deadLetter: AGENT_DEAD_LETTER_QUEUE,
  notify: true
});

class AgentQueuePublisher {
  constructor({ env = process.env, boss = null } = {}) {
    this.env = env;
    this.boss = boss || new PgBoss(bossConfig(env));
    this.started = false;
    this.startPromise = null;
  }

  async start() {
    if (this.started) return this;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      await this.boss.start();
      await this.boss.createQueue(AGENT_DEAD_LETTER_QUEUE, {
        retryLimit: 0,
        retentionSeconds: 30 * 24 * 60 * 60,
        deleteAfterSeconds: 30 * 24 * 60 * 60
      });
      await this.boss.createQueue(AGENT_QUEUE, queueOptions(this.env));
      this.started = true;
      return this;
    })();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async publish(runId) {
    await this.start();
    return this.boss.send(AGENT_QUEUE, { runId: String(runId) }, queueOptions(this.env));
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}

class AgentQueueWorker {
  constructor({
    pool,
    workerService,
    env = process.env,
    boss = null
  } = {}) {
    this.pool = pool;
    this.workerService = workerService;
    this.env = env;
    this.config = getAgentConfig(env);
    this.boss = boss || new PgBoss(bossConfig(env));
    this.started = false;
    this.reconcileTimer = null;
    this.reconcilePromise = null;
    this.heartbeatTimer = null;
  }

  async heartbeat(status = 'online') {
    const workerId = String(this.workerService?.workerId || '').trim();
    if (!workerId) return false;
    const concurrency = Math.max(
      1,
      Math.min(20, Number(this.env.AGENT_WORKER_CONCURRENCY || 1) || 1)
    );
    await this.pool.query(
      `INSERT INTO agent_worker_heartbeats
        (worker_id,status,model_provider,model_name,sandbox_provider,
         sandbox_mode,concurrency,browser_ready,egress_verified,desktop_relay_ready,
         sandbox_image_ref,started_at,last_seen_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now(),now())
       ON CONFLICT (worker_id) DO UPDATE
         SET status=EXCLUDED.status,
             model_provider=EXCLUDED.model_provider,
             model_name=EXCLUDED.model_name,
             sandbox_provider=EXCLUDED.sandbox_provider,
             sandbox_mode=EXCLUDED.sandbox_mode,
             concurrency=EXCLUDED.concurrency,
             browser_ready=EXCLUDED.browser_ready,
             egress_verified=EXCLUDED.egress_verified,
             desktop_relay_ready=EXCLUDED.desktop_relay_ready,
             sandbox_image_ref=EXCLUDED.sandbox_image_ref,
             last_seen_at=now(),updated_at=now()`,
      [
        workerId,
        status,
        this.config.modelProvider,
        this.config.modelName,
        this.config.sandboxProvider,
        this.config.sandboxProvider === 'fixture' ? 'fixture' : this.config.sandboxMode,
        concurrency,
        this.workerService?.readiness?.browserReady === true,
        this.workerService?.readiness?.egressVerified === true,
        this.workerService?.readiness?.desktopRelayReady === true,
        this.workerService?.readiness?.sandboxImageRef || null
      ]
    );
    return true;
  }

  async reconcile() {
    if (this.reconcilePromise) return this.reconcilePromise;
    this.reconcilePromise = this.performReconcile();
    try {
      return await this.reconcilePromise;
    } finally {
      this.reconcilePromise = null;
    }
  }

  async performReconcile() {
    await this.workerService.expireStaleRuns?.({ limit: 100 });
    const client = await this.pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      const recovered = await client.query(
        `UPDATE agent_runs
            SET status='queued',worker_id=NULL,lease_expires_at=NULL,
                queued_at=now(),
                queue_expires_at=clock_timestamp()+($1::text || ' hours')::interval,
                updated_at=now()
          WHERE status IN ('provisioning','running','verifying')
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at<=clock_timestamp()
            AND pause_requested=false
            AND cancel_requested=false
          RETURNING id`,
        [this.config.queueMaxWaitHours]
      );
      if (recovered.rowCount) {
        await client.query(
          `UPDATE agent_budget_holds
              SET expires_at=clock_timestamp()+($2::text || ' minutes')::interval
            WHERE run_id=ANY($1::uuid[]) AND status='held'`,
          [
            recovered.rows.map((row) => row.id),
            this.config.queueMaxWaitHours * 60 + this.config.maxMinutes + 15
          ]
        );
        await client.query(
          `INSERT INTO agent_events (run_id,event_type,phase,summary,data)
           SELECT recovered.id,'run.recovered','queued',
                  'Worker 租约过期，已从最近安全检查点恢复','{}'::jsonb
             FROM unnest($1::uuid[]) AS recovered(id)`,
          [recovered.rows.map((row) => row.id)]
        );
      }
      result = await client.query(
        `SELECT id FROM agent_runs
          WHERE status='queued' AND pause_requested=false AND cancel_requested=false
          ORDER BY created_at
          LIMIT 1000`
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    for (const row of result.rows) {
      await this.boss.send(AGENT_QUEUE, { runId: row.id }, queueOptions(this.env));
    }
    return result.rowCount;
  }

  async start() {
    if (this.started) return this;
    await this.boss.start();
    await this.boss.createQueue(AGENT_DEAD_LETTER_QUEUE, {
      retryLimit: 0,
      retentionSeconds: 30 * 24 * 60 * 60,
      deleteAfterSeconds: 30 * 24 * 60 * 60
    });
    await this.boss.createQueue(AGENT_QUEUE, queueOptions(this.env));
    const concurrency = Math.max(
      1,
      Math.min(20, Number(this.env.AGENT_WORKER_CONCURRENCY || 1) || 1)
    );
    await this.boss.work(AGENT_QUEUE, {
      localConcurrency: concurrency,
      pollingIntervalSeconds: 1,
      notifyPollingIntervalSeconds: 30
    }, async (jobs) => {
      const runId = String(jobs?.[0]?.data?.runId || '').trim();
      if (!runId) {
        const error = new Error('AGENT_JOB_PAYLOAD_INVALID');
        error.code = 'AGENT_JOB_PAYLOAD_INVALID';
        throw error;
      }
      await this.workerService.processRun(runId);
    });
    await this.reconcile();
    this.reconcileTimer = setInterval(() => {
      void this.reconcile().catch((error) => {
        console.error('Agent queue reconciliation failed', error?.code || error?.message);
      });
    }, 30_000);
    this.reconcileTimer.unref?.();
    this.started = true;
    await this.heartbeat('online');
    const heartbeatMs = Math.max(
      5_000,
      Math.min(60_000, Number(this.env.AGENT_WORKER_HEARTBEAT_MS || 15_000) || 15_000)
    );
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat('online').catch((error) => {
        console.error('Agent worker heartbeat failed', error?.code || error?.message);
      });
    }, heartbeatMs);
    this.heartbeatTimer.unref?.();
    return this;
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    await this.heartbeat('stopping').catch(() => {});
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    await this.boss.stop({ graceful: true, timeout: 30_000 });
    await this.heartbeat('offline').catch(() => {});
  }
}

module.exports = {
  AGENT_DEAD_LETTER_QUEUE,
  AGENT_QUEUE,
  AgentQueuePublisher,
  AgentQueueWorker,
  bossConfig,
  queueOptions
};
