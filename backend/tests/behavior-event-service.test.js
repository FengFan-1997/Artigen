const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getBehaviorSummary,
  insertBehaviorEvent,
  listBehaviorEvents,
  normalizeBehaviorInput,
  purgeExpiredBehaviorEvents,
  purgeBatchSize,
  retentionDays
} = require('../services/behavior-event-service');

const DB_USER_ID = '16c07d40-bbb0-4d65-9d4f-7bc6f9c9e63b';

test('behavior events retain useful click metadata without private content', () => {
  const event = normalizeBehaviorInput({
    req: {
      authResolution: { dbUserId: DB_USER_ID, userId: 'customer-42' },
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' }
    },
    getClientIp: () => '203.0.113.9',
    body: {
      eventType: 'ui_click',
      userId: 'forged-user',
      requestId: 'request-secret',
      sessionId: 'session-secret',
      projectId: 'project-secret',
      path: '/artigen/ai?token=private&mode=quick',
      payload: {
        category: 'interaction',
        action: 'generate_image',
        element: 'button',
        toolId: 'ai-design',
        prompt: 'a private product prompt',
        password: 'hunter2',
        imageUrl: 'https://cdn.example/private.png'
      }
    }
  });

  assert.equal(event.actorUserId, DB_USER_ID);
  assert.match(event.userRef, /^user_[0-9a-f]{24}$/);
  assert.equal(event.eventType, 'ui_click');
  assert.equal(event.category, 'interaction');
  assert.equal(event.action, 'generate_image');
  assert.equal(event.element, 'button');
  assert.equal(event.path, '/artigen/ai');
  assert.equal(event.deviceCategory, 'mobile');
  assert.match(event.ipHash, /^[0-9a-f]{64}$/);
  assert.match(event.sessionRef, /^session_[0-9a-f]{24}$/);
  assert.equal(JSON.stringify(event).includes('private product prompt'), false);
  assert.equal(JSON.stringify(event).includes('hunter2'), false);
  assert.equal(JSON.stringify(event).includes('cdn.example'), false);
  assert.equal(JSON.stringify(event).includes('forged-user'), false);
});

test('behavior insert uses an idempotent sanitized PostgreSQL contract', async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/DELETE FROM behavior_events/.test(sql)) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          id: '1',
          event_id: values[0],
          event_type: values[5],
          occurred_at: values[14]
        }]
      };
    }
  };

  const result = await insertBehaviorEvent({
    pool,
    req: { headers: {} },
    body: {
      eventType: 'page_view',
      requestId: 'same-request',
      path: '/artigen/tools',
      payload: { pagePath: '/artigen/tools', text: 'private text' }
    }
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.item.event_type, 'page_view');
  assert.match(calls[0].sql, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.equal(JSON.stringify(calls[0].values).includes('private text'), false);
});

test('behavior list maps PostgreSQL rows and applies every filter', async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/count\(\*\)::bigint AS count/.test(sql)) {
        return { rows: [{ count: '1' }] };
      }
      return {
        rows: [{
          id: '9',
          eventId: 'event_ref',
          eventType: 'ui_click',
          category: 'interaction',
          path: '/artigen/ai',
          action: 'generate_image',
          element: 'button',
          properties: {},
          userId: 'customer-42',
          occurredAt: new Date('2026-07-23T00:00:00.000Z')
        }]
      };
    }
  };

  const result = await listBehaviorEvents({
    pool,
    userId: 'customer-42',
    eventType: 'ui_click',
    path: '/artigen/ai',
    action: 'generate_image',
    from: '2026-07-01',
    to: '2026-07-31',
    limit: 20,
    offset: 40
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].ts, Date.parse('2026-07-23T00:00:00.000Z'));
  assert.equal(calls[0].values[2], 'ui_click');
  assert.equal(calls[0].values[3], '/artigen/ai');
  assert.equal(calls[0].values[4], 'generate_image');
  assert.equal(calls[0].values[7], 20);
  assert.equal(calls[0].values[8], 40);
});

test('behavior summary returns dashboard-ready aggregates', async () => {
  const responses = [
    { rows: [{ events: '12', page_views: '5', clicks: '6', active_users: '3' }] },
    { rows: [{ day: '2026-07-23', events: '12', page_views: '5', clicks: '6', active_users: '3' }] },
    { rows: [{ path: '/artigen', count: '5' }] },
    { rows: [{ action: 'open_ai', count: '4' }] }
  ];
  const pool = { query: async () => responses.shift() };
  const summary = await getBehaviorSummary({ days: 14, pool });

  assert.deepEqual(summary.totals, {
    events: 12,
    pageViews: 5,
    clicks: 6,
    activeUsers: 3
  });
  assert.deepEqual(summary.topPages, [{ key: '/artigen', count: 5 }]);
  assert.deepEqual(summary.topActions, [{ key: 'open_ai', count: 4 }]);
});

test('behavior retention is bounded and purges only expired rows', async () => {
  assert.equal(retentionDays({ BEHAVIOR_EVENT_RETENTION_DAYS: '1' }), 7);
  assert.equal(retentionDays({ BEHAVIOR_EVENT_RETENTION_DAYS: '999' }), 365);
  assert.equal(purgeBatchSize({ BEHAVIOR_EVENT_PURGE_BATCH_SIZE: '1' }), 100);
  assert.equal(purgeBatchSize({ BEHAVIOR_EVENT_PURGE_BATCH_SIZE: '999999' }), 50_000);
  let values = null;
  const result = await purgeExpiredBehaviorEvents({
    env: { BEHAVIOR_EVENT_RETENTION_DAYS: '120' },
    pool: {
      query: async (_sql, input) => {
        values = input;
        return { rowCount: 8 };
      }
    }
  });
  assert.deepEqual(values, ['120', 5_000]);
  assert.deepEqual(result, { deleted: 8, retentionDays: 120 });
});
