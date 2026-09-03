const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ASSET_SWEEP_QUEUE,
  HOLD_SWEEP_QUEUE,
  PgBossTaskQueue,
  RECONCILE_QUEUE,
  TASK_DEAD_LETTER_QUEUE,
  TASK_QUEUE,
  bossConfig,
  taskQueueDriver
} = require('../services/task-queue-pgboss');

const TASK_ID = '11111111-1111-4111-8111-111111111111';

class FakeBoss {
  constructor() {
    this.created = [];
    this.sent = [];
    this.workers = new Map();
    this.schedules = [];
    this.cancelled = [];
    this.events = [];
  }

  on(event) {
    this.events.push(event);
    return this;
  }

  async start() {
    this.started = true;
  }

  async stop(options) {
    this.stopped = options;
  }

  async createQueue(name, options) {
    this.created.push({ name, options });
  }

  async send(name, data, options) {
    this.sent.push({ name, data, options });
    return options.id || 'job-id';
  }

  async work(name, options, handler) {
    if (typeof options === 'function') {
      handler = options;
      options = {};
    }
    this.workers.set(name, { options, handler });
    return `worker:${name}`;
  }

  async schedule(name, cron, data, options) {
    this.schedules.push({ name, cron, data, options });
  }

  async cancel(name, id) {
    this.cancelled.push({ name, id });
  }
}

const createRuntime = () => ({
  active: new Map(),
  registered: [],
  polled: [],
  cancelled: [],
  register(...args) {
    this.registered.push(args);
    return this;
  },
  async pollOnce(input) {
    this.polled.push(input);
    return true;
  },
  cancelLocal(taskId, reason) {
    this.cancelled.push({ taskId, reason });
    return true;
  },
  async requestCancel(input) {
    return { ...input, status: 'cancelled' };
  },
  async stop() {
    this.stopped = true;
  }
});

test('queue driver defaults to legacy and rejects misspelled rollout flags', () => {
  assert.equal(taskQueueDriver({}), 'legacy');
  assert.equal(taskQueueDriver({ TASK_QUEUE_DRIVER: 'pgboss' }), 'pgboss');
  assert.throws(() => taskQueueDriver({ TASK_QUEUE_DRIVER: 'redis' }), {
    code: 'INVALID_TASK_QUEUE_DRIVER'
  });
});

test('DEV pg-boss startup uses the pre-provisioned schema without database CREATE', () => {
  const databaseUrl = 'postgresql://runtime@localhost:5432/dev_artigen';
  assert.equal(bossConfig({ DATABASE_URL: databaseUrl, APP_ENV: 'dev' }).createSchema, false);
  assert.equal(bossConfig({ DATABASE_URL: databaseUrl, APP_ENV: 'production' }).createSchema, true);
});

test('pg-boss dispatch uses task id as job id and task id as the only payload', async () => {
  const boss = new FakeBoss();
  const runtime = createRuntime();
  const queue = new PgBossTaskQueue({
    boss,
    runtime,
    pool: { query: async () => ({ rowCount: 0, rows: [] }) },
    env: { TASK_QUEUE_CONCURRENCY: '3' }
  });
  await queue.start();
  await queue.notify(TASK_ID);

  assert.deepEqual(boss.sent.at(-1).data, { taskId: TASK_ID });
  assert.equal(boss.sent.at(-1).options.id, TASK_ID);
  assert.equal(boss.sent.at(-1).options.retryLimit, 1);
  assert.equal(boss.sent.at(-1).options.retryBackoff, true);
  assert.equal(boss.sent.at(-1).options.deadLetter, TASK_DEAD_LETTER_QUEUE);
  assert.deepEqual(
    boss.created.map((entry) => entry.name),
    [TASK_DEAD_LETTER_QUEUE, TASK_QUEUE, HOLD_SWEEP_QUEUE, ASSET_SWEEP_QUEUE, RECONCILE_QUEUE]
  );

  await boss.workers.get(TASK_QUEUE).handler([{ data: { taskId: TASK_ID } }]);
  assert.deepEqual(runtime.polled, [{ taskId: TASK_ID }]);
  assert.equal(boss.workers.get(TASK_QUEUE).options.localConcurrency, 3);
  await queue.stop();
  assert.equal(runtime.stopped, true);
  assert.equal(boss.stopped.graceful, true);
});

test('startup reconciliation only scans recoverable undispatched business tasks', async () => {
  const queries = [];
  const boss = new FakeBoss();
  const queue = new PgBossTaskQueue({
    boss,
    runtime: createRuntime(),
    pool: {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rowCount: 1, rows: [{ id: TASK_ID }] };
      }
    },
    env: {}
  });
  await queue.start();
  assert.match(queries[0].sql, /provider_dispatched_at IS NULL/);
  assert.match(queries[0].sql, /attempt_count < \$1/);
  assert.match(queries[0].sql, /hold\.status='held'/);
  assert.match(queries[0].sql, /lease_expires_at <= clock_timestamp\(\)/);
  assert.deepEqual(queries[0].params, [2]);
  assert.equal(boss.sent[0].name, TASK_QUEUE);
  assert.deepEqual(boss.sent[0].data, { taskId: TASK_ID });
  assert.equal(boss.sent[0].options.id, TASK_ID);
});

test('pg-boss cancellation persists/refunds through the runtime before cancelling delivery', async () => {
  const boss = new FakeBoss();
  const runtime = createRuntime();
  const queue = new PgBossTaskQueue({
    boss,
    runtime,
    pool: { query: async () => ({ rowCount: 0, rows: [] }) },
    env: {}
  });
  const result = await queue.requestCancel({ taskId: TASK_ID, userId: 'user-id' });
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(runtime.cancelled, [{ taskId: TASK_ID, reason: 'TASK_CANCELLED' }]);
  assert.deepEqual(boss.cancelled, [{ name: TASK_QUEUE, id: TASK_ID }]);
});

test('maintenance callbacks run from scheduled pg-boss queues', async () => {
  const boss = new FakeBoss();
  const calls = [];
  const queue = new PgBossTaskQueue({
    boss,
    runtime: createRuntime(),
    pool: { query: async () => ({ rowCount: 0, rows: [] }) },
    env: { ASSET_GC_CRON: '*/10 * * * *' }
  });
  queue.registerMaintenance({
    releaseExpiredHolds: async () => calls.push('holds'),
    sweepExpiredAssets: async () => {
      calls.push('assets');
      return { failed: 0 };
    },
    sweepOrphanedFileAssets: async () => calls.push('orphans')
  });
  await queue.start();
  await boss.workers.get(HOLD_SWEEP_QUEUE).handler([{}]);
  await boss.workers.get(ASSET_SWEEP_QUEUE).handler([{}]);
  assert.deepEqual(calls, ['holds', 'assets', 'orphans']);
  assert.equal(
    boss.schedules.find((entry) => entry.name === ASSET_SWEEP_QUEUE).cron,
    '*/10 * * * *'
  );
});
