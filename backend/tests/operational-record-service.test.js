const assert = require('node:assert/strict');
const test = require('node:test');

const {
  listOperationalRecords,
  sanitizeOperationalPayload,
  upsertOperationalRecord
} = require('../services/operational-record-service');

test('operational records sanitize private content before PostgreSQL persistence', async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      const payload = JSON.parse(values[4]);
      return { rows: [{ payload, existed: false }] };
    }
  };
  const result = await upsertOperationalRecord({
    kind: 'image_history',
    userId: 'customer-42',
    entry: {
      id: 'private-family-photo.png',
      ts: 1_700_000_000_000,
      type: 'img2img',
      status: 'success',
      prompt: 'draw my private family',
      filename: 'private-family-photo.png',
      images: [{ url: 'https://cdn.example/private.png?token=secret' }]
    },
    pool
  });

  assert.equal(result.ok, true);
  assert.match(calls[0].sql, /ON CONFLICT \(record_kind, record_key\)/);
  assert.match(calls[0].values[3], /^user_[0-9a-f]{24}$/);
  const serialized = JSON.stringify(calls[0].values);
  assert.equal(serialized.includes('draw my private family'), false);
  assert.equal(serialized.includes('private-family-photo.png'), false);
  assert.equal(serialized.includes('cdn.example'), false);
});

test('operational record listing applies user and metadata filters', async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/count\(\*\)::bigint/.test(sql)) return { rows: [{ count: '1' }] };
      return {
        rows: [{
          id: '4',
          actor_user_id: null,
          user_ref: values[1],
          payload: { id: 'audit_ref', biz: 'img2img', kind: 'image', status: 'ok' },
          occurred_at: new Date('2026-07-24T00:00:00.000Z')
        }]
      };
    }
  };

  const result = await listOperationalRecords({
    kind: 'audit_history',
    userId: 'customer-42',
    biz: 'img2img',
    entryKind: 'image',
    status: 'ok',
    limit: 20,
    offset: 40,
    pool
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].userId, 'customer-42');
  assert.equal(result.items[0].ts, Date.parse('2026-07-24T00:00:00.000Z'));
  assert.match(calls[1].sql, /LIMIT \$12 OFFSET \$13/);
  assert.match(calls[0].values[1], /^user_[0-9a-f]{24}$/);
  assert.equal(calls[1].values[8], 'img2img');
  assert.equal(calls[1].values[9], 'image');
  assert.equal(calls[1].values[10], 'ok');
  assert.equal(calls[1].values[11], 20);
  assert.equal(calls[1].values[12], 40);
});

test('usage payloads keep aggregate metadata but not raw inputs or endpoints', () => {
  const payload = sanitizeOperationalPayload('usage', {
    requestId: 'request-secret',
    userId: 'customer-42',
    ts: 1_700_000_000_000,
    tokensIn: 12,
    tokensOut: 8,
    creditsDelta: 1,
    usedUrl: 'https://provider.example/v1/generate?token=secret',
    plan: { userText: 'private prompt', password: 'hunter2' },
    status: 'ok'
  });

  assert.equal(payload.tokensIn, 12);
  assert.equal(payload.tokensOut, 8);
  assert.equal(payload.creditsDelta, 1);
  assert.match(payload.endpointRef, /^endpoint_[0-9a-f]{24}$/);
  assert.equal(JSON.stringify(payload).includes('private prompt'), false);
  assert.equal(JSON.stringify(payload).includes('provider.example'), false);
  assert.equal(JSON.stringify(payload).includes('hunter2'), false);
});
