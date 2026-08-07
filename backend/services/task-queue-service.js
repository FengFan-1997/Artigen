const crypto = require('crypto');
const os = require('os');
const { ApiError } = require('../lib/api-error');
const { getPool } = require('../db/pool');
const payloads = require('./task-payload-service');
const generationAnalytics = require('./generation-analytics-service');

const QUEUE_CHANNEL = 'artigen_tool_task_queue';
const CANCEL_CHANNEL = 'artigen_tool_task_cancel';
const DEFAULT_LEASE_MS = 90 * 1000;
const DEFAULT_HEARTBEAT_MS = 20 * 1000;
const DEFAULT_POLL_MS = 1000;
const MAX_ATTEMPTS = 2;

const normalizeDuration = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const createLeaseOwner = () => {
  const host = String(os.hostname() || 'host').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
  return `${host}:${process.pid}:${crypto.randomBytes(8).toString('hex')}`;
};

const queueError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const requireLeaseOwner = (value) => {
  const owner = String(value || '').trim();
  if (!owner || owner.length > 160 || !/^[A-Za-z0-9_.:-]+$/.test(owner)) {
    throw new ApiError(500, 'INVALID_LEASE_OWNER');
  }
  return owner;
};

const errorCategoryForCode = (value) => {
  const code = String(value || '').toUpperCase();
  if (code.includes('CANCEL')) return 'cancelled';
  if (code.includes('TIMEOUT')) return 'timeout';
  if (code.includes('POLICY')) return 'policy';
  if (code.includes('PAYLOAD') || code.includes('INPUT') || code.includes('ASPECT')) return 'input';
  if (code.includes('CREDIT') || code.includes('QUOTE') || code.includes('WALLET')) return 'billing';
  if (code.includes('PERSIST') || code.includes('STORAGE') || code.includes('ASSET')) return 'storage';
  if (code.includes('PROVIDER') || code.includes('MODEL')) return 'provider';
  if (code.includes('LEASE') || code.includes('WORKER')) return 'worker';
  return 'unknown';
};

const claimNextTask = async ({
  pool = getPool(),
  leaseOwner,
  leaseMs = DEFAULT_LEASE_MS,
  taskId = null
}) => {
  leaseOwner = requireLeaseOwner(leaseOwner);
  const boundedLeaseMs = normalizeDuration(leaseMs, DEFAULT_LEASE_MS, 30_000, 10 * 60_000);
  const claimed = await pool.query(
    `WITH candidate AS (
       SELECT task.id
         FROM tool_tasks task
         JOIN credit_holds hold ON hold.task_id=task.id
        WHERE task.status IN ('queued','running')
          AND task.inputs_ready=true
          AND hold.status='held'
          AND hold.expires_at > clock_timestamp()
          AND task.cancel_requested_at IS NULL
          AND task.provider_dispatched_at IS NULL
          AND task.attempt_count < $3
          AND ($4::uuid IS NULL OR task.id=$4::uuid)
          AND (task.lease_expires_at IS NULL OR task.lease_expires_at <= clock_timestamp())
        ORDER BY task.created_at, task.id
        FOR UPDATE OF task SKIP LOCKED
        LIMIT 1
     )
     UPDATE tool_tasks task SET
       status='running',
       lease_owner=$1,
       lease_expires_at=clock_timestamp() + ($2 * interval '1 millisecond'),
       heartbeat_at=clock_timestamp(),
       attempt_count=task.attempt_count + 1,
       started_at=COALESCE(task.started_at,now()),
       updated_at=now()
     FROM candidate
     WHERE task.id=candidate.id
       AND EXISTS (
         SELECT 1 FROM credit_holds hold
          WHERE hold.task_id=task.id
            AND hold.status='held'
            AND hold.expires_at > clock_timestamp()
       )
     RETURNING task.*`,
    [leaseOwner, boundedLeaseMs, MAX_ATTEMPTS, taskId]
  );
  return claimed.rows[0] || null;
};

const claimUnrecoverableTask = async ({
  pool = getPool(),
  leaseOwner,
  leaseMs = DEFAULT_LEASE_MS,
  taskId = null
}) => {
  leaseOwner = requireLeaseOwner(leaseOwner);
  const boundedLeaseMs = normalizeDuration(leaseMs, DEFAULT_LEASE_MS, 30_000, 10 * 60_000);
  const claimed = await pool.query(
    `WITH candidate AS (
       SELECT task.id,
              CASE
                WHEN hold.expires_at <= clock_timestamp() THEN 'TASK_TIMEOUT'
                WHEN task.provider_dispatched_at IS NOT NULL THEN 'PROVIDER_RESULT_UNKNOWN'
                ELSE 'TASK_RETRY_EXHAUSTED'
              END AS failure_code
         FROM tool_tasks task
         JOIN credit_holds hold ON hold.task_id=task.id
        WHERE task.status IN ('queued','running')
          AND hold.status='held'
          AND task.cancel_requested_at IS NULL
          AND ($4::uuid IS NULL OR task.id=$4::uuid)
          AND (
            hold.expires_at <= clock_timestamp()
            OR (
              task.inputs_ready=true
              AND task.lease_expires_at IS NOT NULL
              AND task.lease_expires_at <= clock_timestamp()
              AND (
                task.provider_dispatched_at IS NOT NULL
                OR task.attempt_count >= $3
              )
            )
          )
        ORDER BY LEAST(hold.expires_at, COALESCE(task.lease_expires_at, hold.expires_at)), task.id
        FOR UPDATE OF task SKIP LOCKED
        LIMIT 1
     )
     UPDATE tool_tasks task SET
       lease_owner=$1,
       lease_expires_at=clock_timestamp() + ($2 * interval '1 millisecond'),
       heartbeat_at=clock_timestamp(),
       updated_at=now()
     FROM candidate
     WHERE task.id=candidate.id
     RETURNING task.*, candidate.failure_code`,
    [leaseOwner, boundedLeaseMs, MAX_ATTEMPTS, taskId]
  );
  return claimed.rows[0] || null;
};

const heartbeatTaskLease = async ({
  pool = getPool(),
  taskId,
  leaseOwner,
  leaseMs = DEFAULT_LEASE_MS
}) => {
  leaseOwner = requireLeaseOwner(leaseOwner);
  const boundedLeaseMs = normalizeDuration(leaseMs, DEFAULT_LEASE_MS, 30_000, 10 * 60_000);
  const renew = (client) => client.query(
    `UPDATE tool_tasks SET
       heartbeat_at=clock_timestamp(),
       lease_expires_at=clock_timestamp() + ($3 * interval '1 millisecond'),
       updated_at=now()
     WHERE id=$1
       AND lease_owner=$2
       AND lease_expires_at > clock_timestamp()
       AND status='running'
       AND inputs_ready=true
       AND cancel_requested_at IS NULL
       AND EXISTS (
         SELECT 1 FROM credit_holds hold
          WHERE hold.task_id=tool_tasks.id
            AND hold.status='held'
            AND hold.expires_at > clock_timestamp()
       )
     RETURNING id`,
    [taskId, leaseOwner, boundedLeaseMs]
  );
  // PostgreSQL may evaluate a correlated subquery before waiting on the row
  // lock needed by UPDATE. Take both task and hold locks first, then execute a
  // second statement so every lease/hold timestamp is checked after the wait.
  if (typeof pool.connect !== 'function') {
    const renewed = await renew(pool);
    return renewed.rowCount === 1;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT task.id
         FROM tool_tasks task
         JOIN credit_holds hold ON hold.task_id=task.id
        WHERE task.id=$1
        FOR UPDATE OF task, hold`,
      [taskId]
    );
    if (!locked.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    const renewed = await renew(client);
    await client.query('COMMIT');
    return renewed.rowCount === 1;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const markProviderDispatched = async ({ pool = getPool(), taskId, leaseOwner }) => {
  leaseOwner = requireLeaseOwner(leaseOwner);
  const run = async (client) => {
    const marked = await client.query(
      `UPDATE tool_tasks SET provider_dispatched_at=clock_timestamp(), updated_at=clock_timestamp()
        WHERE id=$1
          AND lease_owner=$2
          AND lease_expires_at > clock_timestamp()
          AND status='running'
          AND inputs_ready=true
          AND cancel_requested_at IS NULL
          AND provider_dispatched_at IS NULL
          AND EXISTS (
            SELECT 1 FROM credit_holds hold
             WHERE hold.task_id=tool_tasks.id
               AND hold.status='held'
               AND hold.expires_at > clock_timestamp()
          )
        RETURNING provider_dispatched_at`,
      [taskId, leaseOwner]
    );
    if (marked.rowCount) return marked.rows[0].provider_dispatched_at;
    const current = await client.query(
      `SELECT task.status, task.lease_owner, task.lease_expires_at,
              (lease_expires_at > clock_timestamp()) AS lease_live,
              task.cancel_requested_at, task.provider_dispatched_at,
              hold.status AS hold_status, hold.expires_at AS hold_expires_at,
              (hold.expires_at > clock_timestamp()) AS hold_live
         FROM tool_tasks task
         JOIN credit_holds hold ON hold.task_id=task.id
        WHERE task.id=$1`,
      [taskId]
    );
    const row = current.rows[0];
    if (row?.hold_status === 'held' && row?.hold_live === false) {
      throw new ApiError(409, 'TASK_TIMEOUT', { retryable: false });
    }
    if (
      row?.provider_dispatched_at &&
      row?.lease_owner === leaseOwner &&
      row?.lease_live === true &&
      !row?.cancel_requested_at
    ) {
      return row.provider_dispatched_at;
    }
    throw new ApiError(409, row?.cancel_requested_at ? 'TASK_CANCELLED' : 'TASK_LEASE_LOST');
  };
  if (typeof pool.connect !== 'function') return run(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock both rows before evaluating time-sensitive dispatch conditions.
    // This prevents a statement that waited on another transaction from
    // dispatching with a timestamp observed before the wait.
    await client.query(
      `SELECT task.id
         FROM tool_tasks task
         JOIN credit_holds hold ON hold.task_id=task.id
        WHERE task.id=$1
        FOR UPDATE OF task, hold`,
      [taskId]
    );
    const dispatchedAt = await run(client);
    await client.query('COMMIT');
    return dispatchedAt;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const notifyTaskQueued = async ({ pool = getPool(), taskId }) => {
  await pool.query('SELECT pg_notify($1,$2)', [QUEUE_CHANNEL, String(taskId || '')]);
};

const loadTaskInputAssetIds = async ({ pool = getPool(), taskId }) => {
  const result = await pool.query(
    `SELECT asset_id
       FROM tool_task_assets
      WHERE task_id=$1 AND role='input'
      ORDER BY position, asset_id`,
    [taskId]
  );
  return result.rows.map((row) => row.asset_id);
};

class TaskLeaseQueue {
  constructor({
    pool = null,
    leaseOwner = createLeaseOwner(),
    leaseMs = Number(process.env.TASK_LEASE_MS || DEFAULT_LEASE_MS),
    heartbeatMs = Number(process.env.TASK_HEARTBEAT_MS || DEFAULT_HEARTBEAT_MS),
    pollMs = Number(process.env.TASK_QUEUE_POLL_MS || DEFAULT_POLL_MS),
    listenerReconnectMs = Number(process.env.TASK_QUEUE_LISTENER_RECONNECT_MS || 250),
    maxConcurrency = Number(process.env.TASK_QUEUE_CONCURRENCY || 2),
    releaseTask,
    requestTaskCancellation,
    cancelTask,
    recordEvent = generationAnalytics.recordGenerationTaskEvent,
    env = process.env
  } = {}) {
    this.pool = pool || getPool();
    this.leaseOwner = leaseOwner;
    this.leaseMs = normalizeDuration(leaseMs, DEFAULT_LEASE_MS, 30_000, 10 * 60_000);
    this.heartbeatMs = normalizeDuration(
      heartbeatMs,
      DEFAULT_HEARTBEAT_MS,
      5_000,
      Math.max(5_000, Math.floor(this.leaseMs / 2))
    );
    this.pollMs = normalizeDuration(pollMs, DEFAULT_POLL_MS, 100, 60_000);
    this.listenerReconnectMs = normalizeDuration(listenerReconnectMs, 250, 25, 30_000);
    this.maxConcurrency = Math.max(1, Math.min(8, Number(maxConcurrency) || 2));
    this.releaseTask = releaseTask;
    this.requestTaskCancellation = requestTaskCancellation;
    this.cancelTask = cancelTask;
    this.recordEvent = recordEvent;
    this.env = env;
    this.handlers = new Map();
    this.active = new Map();
    this.started = false;
    this.pollTimer = null;
    this.polling = null;
    this.listener = null;
    this.listenerHandlers = null;
    this.listenerReconnectTimer = null;
    this.listenerReconnectAttempt = 0;
  }

  register(toolId, operation, handler, options = {}) {
    const key = `${String(toolId || '').trim()}:${String(operation || '').trim()}`;
    if (!key.includes(':') || typeof handler !== 'function') {
      throw new TypeError('INVALID_TASK_HANDLER');
    }
    this.handlers.set(key, {
      execute: handler,
      payloadRequired: Boolean(options.payloadRequired)
    });
    return this;
  }

  cancelLocal(taskId, reasonCode = 'TASK_CANCELLED') {
    const running = this.active.get(String(taskId || '').trim());
    if (!running) return false;
    if (!running.controller.signal.aborted) {
      running.controller.abort(queueError(reasonCode));
    }
    return true;
  }

  async notify(taskId) {
    await notifyTaskQueued({ pool: this.pool, taskId });
    this.schedulePoll(0);
  }

  async requestCancel({ taskId, userId }) {
    if (typeof this.cancelTask === 'function') {
      const cancelled = await this.cancelTask({ taskId, userId });
      this.cancelLocal(taskId);
      if (cancelled?.toolId === 'ai-design' && cancelled.status === 'cancelled' && !cancelled.replayed) {
        await this.recordLifecycle({
          id: cancelled.taskId,
          tool_id: cancelled.toolId,
          operation: cancelled.operation,
          project_id: cancelled.projectId
        }, 'task_cancel', { source: 'server', status: 'cancelled', errorCategory: 'cancelled' });
      }
      return cancelled;
    }
    if (typeof this.requestTaskCancellation !== 'function' || typeof this.releaseTask !== 'function') {
      throw new ApiError(500, 'TASK_RUNNER_NOT_CONFIGURED');
    }
    const requested = await this.requestTaskCancellation({ taskId, userId });
    if (['success', 'failed', 'cancelled'].includes(requested.status)) return requested;
    this.cancelLocal(taskId);
    const released = await this.releaseTask({
      taskId,
      terminalStatus: 'cancelled',
      errorCode: 'TASK_CANCELLED'
    });
    if (released?.toolId === 'ai-design') {
      await this.recordLifecycle({
        id: released.taskId,
        tool_id: released.toolId,
        operation: released.operation,
        project_id: released.projectId
      }, 'task_cancel', { source: 'server', status: 'cancelled', errorCategory: 'cancelled' });
    }
    return released;
  }

  async recordLifecycle(task, eventType, properties = {}) {
    if (task?.tool_id !== 'ai-design' || typeof this.recordEvent !== 'function') return null;
    try {
      return await this.recordEvent({
        pool: this.pool,
        eventType,
        actorUserId: task.user_id,
        taskId: task.id,
        quoteId: task.quote_id,
        projectId: task.project_id,
        operation: task.operation,
        status: properties.status,
        durationMs: properties.durationMs,
        properties
      });
    } catch (error) {
      console.error('Generation lifecycle event failed', task.id, eventType, error?.code || error?.message || error);
      return null;
    }
  }

  async startListener() {
    if (this.listener) return;
    const client = await this.pool.connect();
    const onNotification = (message) => {
      if (message.channel === CANCEL_CHANNEL) this.cancelLocal(message.payload, 'TASK_CANCELLED');
      if (message.channel === QUEUE_CHANNEL) this.schedulePoll(0);
    };
    const onError = (error) => {
      console.error('Task queue listener failed', error?.code || error?.message || error);
      if (this.listener !== client) return;
      this.listener = null;
      this.listenerHandlers = null;
      client.removeListener('notification', onNotification);
      client.removeListener('error', onError);
      try {
        client.release(error);
      } catch {}
      this.scheduleListenerReconnect();
    };
    client.on('notification', onNotification);
    client.on('error', onError);
    try {
      await client.query(`LISTEN ${QUEUE_CHANNEL}`);
      await client.query(`LISTEN ${CANCEL_CHANNEL}`);
    } catch (error) {
      client.removeListener('notification', onNotification);
      client.removeListener('error', onError);
      client.release();
      throw error;
    }
    this.listener = client;
    this.listenerHandlers = { onNotification, onError };
    this.listenerReconnectAttempt = 0;
  }

  scheduleListenerReconnect() {
    if (!this.started || this.listener || this.listenerReconnectTimer) return;
    const attempt = this.listenerReconnectAttempt;
    const delay = Math.min(30_000, this.listenerReconnectMs * (2 ** Math.min(attempt, 7)));
    this.listenerReconnectAttempt += 1;
    this.listenerReconnectTimer = setTimeout(() => {
      this.listenerReconnectTimer = null;
      this.startListener().catch((error) => {
        console.error('Task queue LISTEN reconnect failed', error?.code || error?.message || error);
        this.scheduleListenerReconnect();
      });
    }, delay);
    if (typeof this.listenerReconnectTimer.unref === 'function') this.listenerReconnectTimer.unref();
  }

  schedulePoll(delay = this.pollMs) {
    if (!this.started || this.pollTimer) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.poll().catch((error) => {
        console.error('Task queue poll failed', error?.code || error?.message || error);
      });
    }, Math.max(0, delay));
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref();
  }

  async start() {
    if (this.started) return this;
    this.started = true;
    try {
      await this.startListener();
    } catch (error) {
      console.error('Task queue LISTEN unavailable; polling remains active', error?.code || error?.message || error);
      this.scheduleListenerReconnect();
    }
    this.schedulePoll(0);
    return this;
  }

  async stop() {
    this.started = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (this.listenerReconnectTimer) clearTimeout(this.listenerReconnectTimer);
    this.listenerReconnectTimer = null;
    this.listenerReconnectAttempt = 0;
    for (const taskId of this.active.keys()) this.cancelLocal(taskId, 'TASK_LEASE_LOST');
    if (this.polling) await this.polling.catch(() => {});
    await Promise.all([...this.active.values()].map((entry) => entry.done)).catch(() => {});
    if (this.listener) {
      const client = this.listener;
      const handlers = this.listenerHandlers;
      this.listener = null;
      this.listenerHandlers = null;
      client.removeListener('notification', handlers.onNotification);
      client.removeListener('error', handlers.onError);
      await client.query(`UNLISTEN ${QUEUE_CHANNEL}`).catch(() => {});
      await client.query(`UNLISTEN ${CANCEL_CHANNEL}`).catch(() => {});
      client.release();
    }
  }

  async poll() {
    if (!this.started) return;
    if (this.polling) return this.polling;
    let didWork = false;
    this.polling = this.pollOnce({ background: true })
      .then((result) => {
        didWork = Boolean(result);
        return result;
      })
      .finally(() => {
        this.polling = null;
        this.schedulePoll(didWork && this.active.size < this.maxConcurrency ? 0 : this.pollMs);
      });
    return this.polling;
  }

  async pollOnce({ background = false, taskId = null } = {}) {
    const abandoned = await claimUnrecoverableTask({
      pool: this.pool,
      leaseOwner: this.leaseOwner,
      leaseMs: this.leaseMs,
      taskId
    });
    if (abandoned) {
      await this.releaseClaimedTask(abandoned, abandoned.failure_code);
      return true;
    }
    if (this.active.size >= this.maxConcurrency) return false;
    const task = await claimNextTask({
      pool: this.pool,
      leaseOwner: this.leaseOwner,
      leaseMs: this.leaseMs,
      taskId
    });
    if (!task) return false;
    const execution = this.executeClaimedTask(task).finally(() => {
      this.schedulePoll(0);
    });
    if (background) {
      execution.catch((error) => {
        console.error('Claimed task execution failed', task.id, error?.code || error?.message || error);
      });
    } else {
      await execution;
    }
    return true;
  }

  async releaseClaimedTask(task, errorCode) {
    if (typeof this.releaseTask !== 'function') {
      throw new ApiError(500, 'TASK_RUNNER_NOT_CONFIGURED');
    }
    try {
      const released = await this.releaseTask({
        taskId: task.id,
        terminalStatus: task.cancel_requested_at ? 'cancelled' : 'failed',
        errorCode: errorCode || 'TASK_FAILED',
        leaseOwner: this.leaseOwner
      });
      await this.recordLifecycle(task, task.cancel_requested_at ? 'task_cancel' : 'task_fail', {
        source: 'server',
        status: task.cancel_requested_at ? 'cancelled' : 'failed',
        errorCategory: errorCategoryForCode(errorCode)
      });
      return released;
    } catch (error) {
      if (!['TASK_ALREADY_RESOLVED', 'TASK_LEASE_LOST'].includes(error?.code)) throw error;
    }
  }

  async executeClaimedTask(task) {
    const key = `${task.tool_id}:${task.operation}`;
    const registration = this.handlers.get(key);
    if (!registration) {
      await this.releaseClaimedTask(task, 'TOOL_OPERATION_UNAVAILABLE');
      return;
    }
    const controller = new AbortController();
    const executionStartedAt = Date.now();
    let finishActive;
    const done = new Promise((resolve) => { finishActive = resolve; });
    this.active.set(task.id, { controller, done });
    const heartbeat = setInterval(() => {
      heartbeatTaskLease({
        pool: this.pool,
        taskId: task.id,
        leaseOwner: this.leaseOwner,
        leaseMs: this.leaseMs
      }).then((renewed) => {
        if (!renewed && !controller.signal.aborted) {
          controller.abort(queueError('TASK_LEASE_LOST'));
        }
      }).catch(() => {
        if (!controller.signal.aborted) controller.abort(queueError('TASK_LEASE_LOST'));
      });
    }, this.heartbeatMs);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    try {
      await this.recordLifecycle(task, 'task_running', {
        source: 'server',
        status: 'running',
        queueMs: Math.max(0, Date.now() - new Date(task.created_at || Date.now()).getTime())
      });
      const inputAssetIds = await loadTaskInputAssetIds({ pool: this.pool, taskId: task.id });
      let payload = null;
      const payloadClient = await this.pool.connect();
      try {
        try {
          payload = await payloads.readTaskPayload({
            client: payloadClient,
            taskId: task.id,
            env: this.env
          });
        } catch (error) {
          if (error?.code !== 'TASK_PAYLOAD_EXPIRED' || registration.payloadRequired) throw error;
        }
      } finally {
        payloadClient.release();
      }
      const options = payload?.options || task.options || {};
      const outcome = await registration.execute({
        taskId: task.id,
        ownerUserId: task.user_id,
        operation: task.operation,
        options,
        inputAssetIds,
        payload,
        leaseOwner: this.leaseOwner,
        signal: controller.signal
      });
      const durationMs = Date.now() - executionStartedAt;
      if (outcome?.ok === false) {
        // Lease loss is recoverable queue state, not a terminal task failure.
        // The reclaim/ambiguous policy will emit the eventual terminal event.
        if (outcome.error === 'TASK_LEASE_LOST') return;
        const cancelled = Boolean(outcome.cancelled);
        await this.recordLifecycle(task, cancelled ? 'task_cancel' : 'task_fail', {
          source: 'server',
          status: cancelled ? 'cancelled' : 'failed',
          durationMs,
          errorCategory: errorCategoryForCode(outcome.error)
        });
      } else {
        await this.recordLifecycle(task, 'task_success', {
          source: 'server',
          status: 'success',
          durationMs,
          providerMs: Number.isSafeInteger(outcome?.providerMs) ? outcome.providerMs : undefined,
          persistMs: Number.isSafeInteger(outcome?.persistMs) ? outcome.persistMs : undefined,
          outputCount: Array.isArray(outcome?.outputs) ? outcome.outputs.length : 0,
          costMinor: Number.isSafeInteger(outcome?.providerCostMinor)
            ? outcome.providerCostMinor
            : undefined
        });
      }
    } catch (error) {
      const code = String(error?.code || controller.signal.reason?.code || 'TASK_WORKER_CRASH')
        .replace(/[^A-Z0-9_:-]/gi, '_')
        .slice(0, 100);
      if (code !== 'TASK_LEASE_LOST') {
        await this.releaseClaimedTask(task, code).catch((releaseError) => {
          console.error('Task queue release failed', task.id, releaseError?.code || releaseError?.message || releaseError);
        });
      }
    } finally {
      clearInterval(heartbeat);
      if (this.active.get(task.id)?.controller === controller) this.active.delete(task.id);
      finishActive();
    }
  }
}

module.exports = {
  CANCEL_CHANNEL,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_LEASE_MS,
  DEFAULT_POLL_MS,
  MAX_ATTEMPTS,
  QUEUE_CHANNEL,
  TaskLeaseQueue,
  claimNextTask,
  claimUnrecoverableTask,
  createLeaseOwner,
  errorCategoryForCode,
  heartbeatTaskLease,
  loadTaskInputAssetIds,
  markProviderDispatched,
  normalizeDuration,
  notifyTaskQueued,
  queueError,
  requireLeaseOwner
};
