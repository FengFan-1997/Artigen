const { PgBoss } = require('pg-boss');
const { resolvePoolSsl } = require('../db/pool');
const {
  CANCEL_CHANNEL,
  MAX_ATTEMPTS,
  TaskLeaseQueue
} = require('./task-queue-service');

const TASK_QUEUE = 'artigen-tool-task-v1';
const TASK_DEAD_LETTER_QUEUE = 'artigen-tool-task-dlq';
const HOLD_SWEEP_QUEUE = 'artigen-maintenance-credit-holds-v1';
const ASSET_SWEEP_QUEUE = 'artigen-maintenance-assets-v1';
const RECONCILE_QUEUE = 'artigen-maintenance-task-reconcile-v1';
const MAINTENANCE_QUEUES = [HOLD_SWEEP_QUEUE, ASSET_SWEEP_QUEUE, RECONCILE_QUEUE];

const taskQueueDriver = (env = process.env) => {
  const driver = String(env.TASK_QUEUE_DRIVER || 'legacy').trim().toLowerCase();
  if (!['legacy', 'pgboss'].includes(driver)) {
    const error = new Error('INVALID_TASK_QUEUE_DRIVER');
    error.code = 'INVALID_TASK_QUEUE_DRIVER';
    throw error;
  }
  return driver;
};

const bossConfig = (env = process.env) => {
  const connectionString = String(env.DATABASE_URL || '').trim();
  if (!connectionString) {
    const error = new Error('DATABASE_NOT_CONFIGURED');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  return {
    connectionString,
    application_name: 'artigen-pgboss',
    schema: String(env.PGBOSS_SCHEMA || 'pgboss').trim() || 'pgboss',
    // The DEV migrator provisions pgboss and the boundary check proves that
    // artigen_runtime owns it. Skipping CREATE SCHEMA here preserves least
    // privilege without changing production's existing bootstrap behavior.
    createSchema: String(env.APP_ENV || '').trim().toLowerCase() !== 'dev',
    ssl: resolvePoolSsl(connectionString, env),
    max: Math.max(2, Math.min(20, Number(env.PGBOSS_POOL_MAX || 5) || 5)),
    useListenNotify: !['0', 'false', 'no', 'off'].includes(
      String(env.PGBOSS_LISTEN_NOTIFY ?? '1').trim().toLowerCase()
    )
  };
};

const taskQueueOptions = (env = process.env) => ({
  retryLimit: 1,
  retryDelay: Math.max(1, Math.min(300, Number(env.TASK_QUEUE_RETRY_DELAY_SECONDS || 15) || 15)),
  retryBackoff: true,
  expireInSeconds: Math.max(
    60,
    Math.min(60 * 60, Number(env.TASK_QUEUE_EXPIRE_SECONDS || 15 * 60) || 15 * 60)
  ),
  retentionSeconds: 14 * 24 * 60 * 60,
  deleteAfterSeconds: 7 * 24 * 60 * 60,
  deadLetter: TASK_DEAD_LETTER_QUEUE,
  notify: true
});

const createBoss = (env) => new PgBoss(bossConfig(env));

class PgBossTaskQueue {
  constructor({
    pool,
    env = process.env,
    boss = null,
    bossFactory = createBoss,
    runtime = null,
    releaseTask,
    requestTaskCancellation,
    cancelTask,
    recordEvent
  } = {}) {
    this.pool = pool;
    this.env = env;
    this.boss = boss || bossFactory(env);
    this.runtime = runtime || new TaskLeaseQueue({
      pool,
      env,
      releaseTask,
      requestTaskCancellation,
      cancelTask,
      recordEvent
    });
    this.maintenance = null;
    this.started = false;
    this.cancelListener = null;
    this.cancelListenerHandlers = null;
    this.cancelListenerReconnectTimer = null;
    this.cancelListenerReconnectAttempt = 0;
    this.managesMaintenance = true;
    this.startPromise = null;
  }

  register(...args) {
    this.runtime.register(...args);
    return this;
  }

  registerMaintenance(callbacks = {}) {
    this.maintenance = callbacks;
    return this;
  }

  async createQueues() {
    await this.boss.createQueue(TASK_DEAD_LETTER_QUEUE, {
      retryLimit: 0,
      retentionSeconds: 30 * 24 * 60 * 60,
      deleteAfterSeconds: 30 * 24 * 60 * 60
    });
    await this.boss.createQueue(TASK_QUEUE, taskQueueOptions(this.env));
    for (const name of MAINTENANCE_QUEUES) {
      await this.boss.createQueue(name, {
        retryLimit: 1,
        retryDelay: 30,
        retryBackoff: true,
        deleteAfterSeconds: 24 * 60 * 60
      });
    }
  }

  async startCancellationListener() {
    if (this.cancelListener || typeof this.pool?.connect !== 'function') return;
    const client = await this.pool.connect();
    const onNotification = (message) => {
      if (message.channel === CANCEL_CHANNEL) {
        this.runtime.cancelLocal(message.payload, 'TASK_CANCELLED');
      }
    };
    const onError = (error) => {
      console.error('pg-boss cancellation listener failed', error?.code || error?.message || error);
      if (this.cancelListener !== client) return;
      this.cancelListener = null;
      this.cancelListenerHandlers = null;
      client.removeListener('notification', onNotification);
      client.removeListener('error', onError);
      try {
        client.release(error);
      } catch {}
      this.scheduleCancellationListenerReconnect();
    };
    client.on('notification', onNotification);
    client.on('error', onError);
    try {
      await client.query(`LISTEN ${CANCEL_CHANNEL}`);
    } catch (error) {
      client.removeListener('notification', onNotification);
      client.removeListener('error', onError);
      client.release();
      throw error;
    }
    this.cancelListener = client;
    this.cancelListenerHandlers = { onNotification, onError };
    this.cancelListenerReconnectAttempt = 0;
  }

  scheduleCancellationListenerReconnect() {
    if (!this.started || this.cancelListener || this.cancelListenerReconnectTimer) return;
    const delay = Math.min(30_000, 250 * (2 ** Math.min(this.cancelListenerReconnectAttempt, 7)));
    this.cancelListenerReconnectAttempt += 1;
    this.cancelListenerReconnectTimer = setTimeout(() => {
      this.cancelListenerReconnectTimer = null;
      this.startCancellationListener().catch((error) => {
        console.error(
          'pg-boss cancellation listener reconnect failed',
          error?.code || error?.message || error
        );
        this.scheduleCancellationListenerReconnect();
      });
    }, delay);
    if (typeof this.cancelListenerReconnectTimer.unref === 'function') {
      this.cancelListenerReconnectTimer.unref();
    }
  }

  async startWorkers() {
    const concurrency = Math.max(
      1,
      Math.min(8, Number(this.env.TASK_QUEUE_CONCURRENCY || 2) || 2)
    );
    await this.boss.work(TASK_QUEUE, {
      localConcurrency: concurrency,
      pollingIntervalSeconds: 1,
      notifyPollingIntervalSeconds: 30
    }, async (jobs) => {
      const taskId = String(jobs?.[0]?.data?.taskId || '').trim();
      if (!taskId) {
        const error = new Error('INVALID_TASK_JOB_PAYLOAD');
        error.code = 'INVALID_TASK_JOB_PAYLOAD';
        throw error;
      }
      await this.runtime.pollOnce({ taskId });
    });

    await this.boss.work(RECONCILE_QUEUE, async () => this.reconcilePendingTasks());
    await this.boss.work(HOLD_SWEEP_QUEUE, async () => {
      if (typeof this.maintenance?.releaseExpiredHolds === 'function') {
        await this.maintenance.releaseExpiredHolds();
      }
    });
    await this.boss.work(ASSET_SWEEP_QUEUE, async () => {
      if (typeof this.maintenance?.sweepExpiredAssets === 'function') {
        const summary = await this.maintenance.sweepExpiredAssets();
        if (summary?.failed) {
          console.error('Expired asset sweep completed with failures', summary.failed);
        }
      }
      if (typeof this.maintenance?.sweepOrphanedFileAssets === 'function') {
        await this.maintenance.sweepOrphanedFileAssets();
      }
      if (typeof this.maintenance?.sweepExpiredUploadSessions === 'function') {
        await this.maintenance.sweepExpiredUploadSessions();
      }
      if (typeof this.maintenance?.sweepTrashedProjects === 'function') {
        await this.maintenance.sweepTrashedProjects();
      }
    });
  }

  async scheduleMaintenance() {
    await this.boss.schedule(RECONCILE_QUEUE, '* * * * *', null, { key: 'task-reconcile' });
    await this.boss.schedule(HOLD_SWEEP_QUEUE, '* * * * *', null, { key: 'credit-holds' });
    await this.boss.schedule(
      ASSET_SWEEP_QUEUE,
      String(this.env.ASSET_GC_CRON || '*/5 * * * *').trim() || '*/5 * * * *',
      null,
      { key: 'asset-gc' }
    );
  }

  async startInternal() {
    await this.boss.start();
    this.boss.on?.('error', (error) => {
      console.error('pg-boss queue error', error?.code || error?.message || error);
    });
    this.boss.on?.('warning', (warning) => {
      console.warn('pg-boss queue warning', warning?.message || warning);
    });
    await this.createQueues();
    await this.startWorkers();
    await this.scheduleMaintenance();
    await this.startCancellationListener();
    this.started = true;
    await this.reconcilePendingTasks();
    return this;
  }

  async start() {
    if (this.started) return this;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal();
    try {
      return await this.startPromise;
    } catch (error) {
      this.started = false;
      throw error;
    } finally {
      this.startPromise = null;
    }
  }

  async stop() {
    this.started = false;
    if (this.cancelListenerReconnectTimer) clearTimeout(this.cancelListenerReconnectTimer);
    this.cancelListenerReconnectTimer = null;
    this.cancelListenerReconnectAttempt = 0;
    for (const taskId of this.runtime.active.keys()) {
      this.runtime.cancelLocal(taskId, 'TASK_LEASE_LOST');
    }
    if (this.cancelListener) {
      const client = this.cancelListener;
      const handlers = this.cancelListenerHandlers;
      this.cancelListener = null;
      this.cancelListenerHandlers = null;
      client.removeListener('notification', handlers.onNotification);
      client.removeListener('error', handlers.onError);
      await client.query(`UNLISTEN ${CANCEL_CHANNEL}`).catch(() => {});
      client.release();
    }
    await this.runtime.stop();
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }

  async notify(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return null;
    if (!this.started && this.startPromise) await this.startPromise;
    return this.boss.send(TASK_QUEUE, { taskId: id }, {
      id,
      ...taskQueueOptions(this.env)
    });
  }

  async requestCancel(input) {
    const result = await this.runtime.requestCancel(input);
    this.runtime.cancelLocal(input.taskId, 'TASK_CANCELLED');
    await this.boss.cancel(TASK_QUEUE, input.taskId).catch((error) => {
      console.warn('pg-boss job cancellation was deferred', input.taskId, error?.code || error?.message || error);
    });
    return result;
  }

  async reconcilePendingTasks() {
    const result = await this.pool.query(
      `SELECT task.id
         FROM tool_tasks task
         JOIN credit_holds hold ON hold.task_id=task.id
        WHERE task.status IN ('queued','running')
          AND task.inputs_ready=true
          AND task.cancel_requested_at IS NULL
          AND task.provider_dispatched_at IS NULL
          AND task.attempt_count < $1
          AND (task.lease_expires_at IS NULL OR task.lease_expires_at <= clock_timestamp())
          AND hold.status='held'
          AND hold.expires_at > clock_timestamp()
        ORDER BY task.created_at, task.id
        LIMIT 1000`,
      [MAX_ATTEMPTS]
    );
    for (const row of result.rows) await this.notify(row.id);
    return result.rowCount;
  }
}

const createTaskQueue = ({ driver, ...options } = {}) => {
  const selected = driver || taskQueueDriver(options.env);
  if (selected === 'pgboss') return new PgBossTaskQueue(options);
  return new TaskLeaseQueue(options);
};

module.exports = {
  ASSET_SWEEP_QUEUE,
  HOLD_SWEEP_QUEUE,
  PgBossTaskQueue,
  RECONCILE_QUEUE,
  TASK_DEAD_LETTER_QUEUE,
  TASK_QUEUE,
  bossConfig,
  createTaskQueue,
  taskQueueDriver,
  taskQueueOptions
};
