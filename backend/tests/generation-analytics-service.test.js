const assert = require('node:assert/strict');
const test = require('node:test');

const {
  insertGenerationEvent,
  normalizeEventInput,
  recordGenerationTaskEvent,
  sanitizeGenerationProperties
} = require('../services/generation-analytics-service');

test('generation analytics keeps only aggregate, enum and opaque reference metadata', () => {
  const input = normalizeEventInput({
    eventType: 'task_success',
    req: { authResolution: { dbUserId: '16c07d40-bbb0-4d65-9d4f-7bc6f9c9e63b' } },
    body: {
      ts: Date.now(),
      sessionId: 'browser-session-secret',
      projectId: 'product-launch-secret',
      requestId: 'request-secret',
      payload: {
        taskId: 'dd44e50b-1e0b-4e47-8aa3-d1008f30eb39',
        quoteId: 'd4325dca-3b12-4f11-a625-96851419bdd2',
        operation: 'generate',
        mode: 'quick',
        aspectRatio: '4:5',
        promptLength: 72,
        referenceCount: 2,
        providerMs: 1234,
        promptHash: 'a'.repeat(64),
        prompt: 'private product launch copy',
        fileName: 'private-product.png',
        imageUrl: 'https://cdn.example/private.png',
        token: 'secret'
      }
    }
  });

  assert.equal(input.eventType, 'task_success');
  assert.equal(input.actorUserId, '16c07d40-bbb0-4d65-9d4f-7bc6f9c9e63b');
  assert.match(input.sessionRef, /^session_[0-9a-f]{24}$/);
  assert.deepEqual(input.properties, {
    operation: 'generate',
    mode: 'quick',
    aspectRatio: '4:5',
    promptLength: 72,
    referenceCount: 2,
    providerMs: 1234,
    promptHash: 'a'.repeat(64)
  });
  const serialized = JSON.stringify(input);
  assert.equal(serialized.includes('private product launch copy'), false);
  assert.equal(serialized.includes('private-product.png'), false);
  assert.equal(serialized.includes('cdn.example'), false);
  assert.equal(serialized.includes('secret'), false);
});

test('generation analytics rejects unknown events and clamps numeric metadata', () => {
  assert.equal(normalizeEventInput({ eventType: 'raw_prompt_dump', body: {}, req: {} }), null);
  assert.deepEqual(sanitizeGenerationProperties({
    promptLength: 99_999,
    referenceCount: 99,
    durationMs: -5,
    operation: 'provider-specific-secret-operation',
    aspectRatio: '2:3'
  }), {
    promptLength: 20_000,
    referenceCount: 3,
    durationMs: 0
  });
});

test('generation analytics inserts only the sanitized event contract', async () => {
  let captured = null;
  const pool = {
    query: async (sql, values) => {
      captured = { sql, values };
      return {
        rows: [{ id: '1', event_type: values[0], properties: JSON.parse(values[7]) }]
      };
    }
  };
  const item = await insertGenerationEvent({
    pool,
    eventType: 'quote_shown',
    req: {},
    body: {
      sessionId: 'session-value',
      payload: {
        operation: 'directions',
        quotedCredits: 5,
        prompt: 'must never reach postgres'
      }
    }
  });

  assert.equal(item.event_type, 'quote_shown');
  assert.deepEqual(item.properties, { operation: 'directions', quotedCredits: 5 });
  assert.equal(JSON.stringify(captured).includes('must never reach postgres'), false);
});

test('server task lifecycle events remain useful when the browser closes', async () => {
  let values = null;
  const pool = {
    query: async (_sql, input) => {
      values = input;
      return { rows: [{ id: '2', event_type: input[0], properties: JSON.parse(input[7]) }] };
    }
  };
  const item = await recordGenerationTaskEvent({
    pool,
    eventType: 'task_success',
    actorUserId: '16c07d40-bbb0-4d65-9d4f-7bc6f9c9e63b',
    taskId: 'dd44e50b-1e0b-4e47-8aa3-d1008f30eb39',
    quoteId: 'd4325dca-3b12-4f11-a625-96851419bdd2',
    operation: 'generate',
    status: 'success',
    durationMs: 4321,
    properties: { providerMs: 3000, outputCount: 1, prompt: 'private' }
  });
  assert.deepEqual(item.properties, {
    operation: 'generate',
    status: 'success',
    durationMs: 4321,
    providerMs: 3000,
    outputCount: 1
  });
  assert.equal(values[5], 'dd44e50b-1e0b-4e47-8aa3-d1008f30eb39');
  assert.equal(JSON.stringify(values).includes('private'), false);
});
