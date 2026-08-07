const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  CANCEL_CHANNEL,
  TaskLeaseQueue,
  claimNextTask,
  claimUnrecoverableTask,
  createLeaseOwner,
  heartbeatTaskLease,
  markProviderDispatched
} = require('../services/task-queue-service');

const TASK_ID = '11111111-1111-4111-8111-111111111111';

test('lease claim is atomic, skip-locked and bounded to one reclaim', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [{ id: TASK_ID, attempt_count: 1 }] };
    }
  };
  const row = await claimNextTask({
    pool,
    leaseOwner: 'worker-a',
    leaseMs: 45_000,
    taskId: TASK_ID
  });
  assert.equal(row.id, TASK_ID);
  assert.match(queries[0].sql, /FOR UPDATE OF task SKIP LOCKED/);
  assert.match(queries[0].sql, /inputs_ready=true/);
  assert.match(queries[0].sql, /hold\.expires_at > clock_timestamp\(\)/);
  assert.match(queries[0].sql, /provider_dispatched_at IS NULL/);
  assert.match(queries[0].sql, /attempt_count < \$3/);
  assert.match(queries[0].sql, /attempt_count=task\.attempt_count \+ 1/);
  assert.deepEqual(queries[0].params, ['worker-a', 45_000, 2, TASK_ID]);
});

test('expired dispatched or twice-attempted leases are claimed only for refund', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{ id: TASK_ID, failure_code: 'PROVIDER_RESULT_UNKNOWN' }]
      };
    }
  };
  const row = await claimUnrecoverableTask({
    pool,
    leaseOwner: 'worker-b',
    taskId: TASK_ID
  });
  assert.equal(row.failure_code, 'PROVIDER_RESULT_UNKNOWN');
  assert.match(queries[0].sql, /provider_dispatched_at IS NOT NULL/);
  assert.match(queries[0].sql, /hold\.expires_at <= clock_timestamp\(\)/);
  assert.match(queries[0].sql, /attempt_count >= \$3/);
  assert.match(queries[0].sql, /PROVIDER_RESULT_UNKNOWN/);
  assert.match(queries[0].sql, /TASK_RETRY_EXHAUSTED/);
  assert.match(queries[0].sql, /TASK_TIMEOUT/);
});

test('heartbeat and provider dispatch both require the live lease owner', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{ provider_dispatched_at: new Date('2030-01-01T00:00:00Z') }]
      };
    }
  };
  assert.equal(await heartbeatTaskLease({
    pool,
    taskId: TASK_ID,
    leaseOwner: 'worker-a',
    leaseMs: 60_000
  }), true);
  await markProviderDispatched({ pool, taskId: TASK_ID, leaseOwner: 'worker-a' });
  assert.match(queries[0].sql, /lease_owner=\$2/);
  assert.match(queries[0].sql, /cancel_requested_at IS NULL/);
  assert.match(queries[0].sql, /hold\.expires_at > clock_timestamp\(\)/);
  assert.match(queries[1].sql, /provider_dispatched_at IS NULL/);
  assert.match(queries[1].sql, /lease_expires_at > clock_timestamp\(\)/);
  assert.match(queries[1].sql, /hold\.expires_at > clock_timestamp\(\)/);
});

test('provider dispatch reports an expired hold as TASK_TIMEOUT', async () => {
  let call = 0;
  const pool = {
    query: async () => {
      call += 1;
      if (call === 1) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          lease_owner: 'worker-a',
          lease_live: true,
          cancel_requested_at: null,
          provider_dispatched_at: null,
          hold_status: 'held',
          hold_live: false
        }]
      };
    }
  };
  await assert.rejects(
    markProviderDispatched({ pool, taskId: TASK_ID, leaseOwner: 'worker-a' }),
    { code: 'TASK_TIMEOUT' }
  );
});

test('an expired worker cannot reuse an earlier dispatch marker to call the provider again', async () => {
  let call = 0;
  const pool = {
    query: async () => {
      call += 1;
      if (call === 1) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          lease_owner: 'stale-worker',
          lease_live: false,
          cancel_requested_at: null,
          provider_dispatched_at: new Date()
        }]
      };
    }
  };
  await assert.rejects(
    markProviderDispatched({ pool, taskId: TASK_ID, leaseOwner: 'stale-worker' }),
    { code: 'TASK_LEASE_LOST' }
  );
});

test('lease owner identity is process-unique and contains no unsafe SQL/channel characters', () => {
  const first = createLeaseOwner();
  const second = createLeaseOwner();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_.:-]+$/);
});

test('cross-instance cancellation notifications abort the active provider signal', async () => {
  class ListenerClient extends EventEmitter {
    constructor() {
      super();
      this.queries = [];
      this.released = false;
    }

    async query(sql) {
      this.queries.push(sql);
      return { rowCount: 0, rows: [] };
    }

    release() {
      this.released = true;
    }
  }
  const listener = new ListenerClient();
  const queue = new TaskLeaseQueue({
    pool: { connect: async () => listener },
    releaseTask: async () => ({}),
    requestTaskCancellation: async () => ({ status: 'running' })
  });
  const controller = new AbortController();
  queue.active.set(TASK_ID, { controller });
  await queue.startListener();
  listener.emit('notification', { channel: CANCEL_CHANNEL, payload: TASK_ID });
  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason?.code, 'TASK_CANCELLED');
  assert.ok(listener.queries.some((sql) => String(sql).includes(`LISTEN ${CANCEL_CHANNEL}`)));
  await queue.stop();
  assert.equal(listener.released, true);
});

test('LISTEN connection errors discard the dead client and reconnect automatically', async () => {
  class ListenerClient extends EventEmitter {
    constructor() {
      super();
      this.queries = [];
      this.released = false;
    }

    async query(sql) {
      this.queries.push(sql);
      return { rowCount: 0, rows: [] };
    }

    release() {
      this.released = true;
    }
  }
  const clients = [new ListenerClient(), new ListenerClient()];
  let connects = 0;
  const queue = new TaskLeaseQueue({
    pool: { connect: async () => clients[connects++] },
    listenerReconnectMs: 25,
    releaseTask: async () => ({})
  });
  queue.started = true;
  await queue.startListener();
  clients[0].emit('error', Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(clients[0].released, true);
  assert.equal(connects, 2);
  assert.equal(queue.listener, clients[1]);
  assert.ok(clients[1].queries.some((sql) => String(sql).includes(`LISTEN ${CANCEL_CHANNEL}`)));
  await queue.stop();
});

test('DELETE-style cancellation persists first, aborts locally and refunds once', async () => {
  const order = [];
  const queue = new TaskLeaseQueue({
    pool: { query: async () => ({ rowCount: 0, rows: [] }) },
    requestTaskCancellation: async () => {
      order.push('persist-cancel');
      return { status: 'running' };
    },
    releaseTask: async () => {
      order.push('refund');
      return { status: 'cancelled' };
    }
  });
  const controller = new AbortController();
  controller.signal.addEventListener('abort', () => order.push('abort-local'), { once: true });
  queue.active.set(TASK_ID, { controller });
  const result = await queue.requestCancel({ taskId: TASK_ID, userId: 'user' });
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(order, ['persist-cancel', 'abort-local', 'refund']);
});
