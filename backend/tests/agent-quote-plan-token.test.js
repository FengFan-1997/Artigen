const assert = require('node:assert/strict');
const test = require('node:test');
const { createAgentRunService } = require('../services/agent-run-service');
const { issueAgentPlanToken } = require('../services/agent-plan-token');

const userId = '11111111-1111-4111-8111-111111111111';
const objective = 'Create a downloadable coffee-menu.csv with three menu items.';
const env = {
  AGENT_FEATURE_ENABLED: 'true',
  AGENT_RUNTIME_DRIVER: 'fixture',
  AGENT_SANDBOX_PROVIDER: 'fixture',
  AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}`,
  AGENT_DAILY_FREE_CREDITS: '20'
};
const request = {
  userId,
  objective,
  capabilities: { files: true, browser: false },
  maxCredits: 10,
  idempotencyKey: 'quote-plan-regression'
};

for (const [walletAvailable, canStart] of [[15, true], [0, false]]) {
  test(`ordinary quote succeeds without a plan token and preserves affordability (${canStart})`, async () => {
    const statements = [];
    const client = {
      release() {},
      async query(sql) {
        statements.push(sql);
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
        if (sql.includes('SELECT id FROM users')) return { rows: [{ id: userId }], rowCount: 1 };
        if (sql.includes('FROM agent_daily_free_usage')) {
          return { rows: [{ reserved_credits: 5, consumed_credits: 10 }] };
        }
        if (sql.includes('FROM agent_trial_usage')) return { rows: [] };
        if (sql.includes('FROM wallets')) return { rows: [{ available_credits: walletAvailable }] };
        throw new Error('Unexpected quote query');
      }
    };
    const service = createAgentRunService({ pool: { connect: async () => client }, env });
    const quote = await service.quote(request);
    assert.equal(quote.maximumCredits, 10);
    assert.equal(quote.freeCreditsRemaining, 5);
    assert.equal(quote.requiredPaidHold, 5);
    assert.equal(quote.canStart, canStart);
    assert.equal(statements.some(sql => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql)), false);
  });
}

const tokenFor = (overrides = {}) => issueAgentPlanToken({
  env, userId, objective, revision: 1, ...overrides
});
const invalidCases = [
  ['invalid signature', () => 'invalid.signature', 'AGENT_PLAN_TOKEN_INVALID'],
  ['different user', () => tokenFor({ userId: '22222222-2222-4222-8222-222222222222' }), 'AGENT_PLAN_TOKEN_EXPIRED_OR_STALE'],
  ['changed objective', () => tokenFor({ objective: 'Create a different file.' }), 'AGENT_PLAN_TOKEN_EXPIRED_OR_STALE'],
  ['changed revision', () => tokenFor({ revision: 2 }), 'AGENT_PLAN_TOKEN_EXPIRED_OR_STALE']
];
for (const [name, makeToken, code] of invalidCases) {
  test(`createRun rejects ${name} before accessing the database or reserving credits`, async () => {
    let databaseCalls = 0;
    const service = createAgentRunService({
      env,
      pool: { connect: async () => { databaseCalls += 1; throw new Error('Database must not be accessed'); } }
    });
    await assert.rejects(service.createRun({ ...request, planToken: makeToken(), planRevision: 1 }), { code });
    assert.equal(databaseCalls, 0);
  });
}

test('createRun rejects an expired plan before accessing the database', async (t) => {
  const now = Date.now();
  const clock = t.mock.method(Date, 'now', () => now - 31 * 60 * 1000);
  const planToken = tokenFor();
  clock.mock.restore();
  const service = createAgentRunService({
    env,
    pool: { connect: async () => { assert.fail('Expired plan reached the database'); } }
  });
  await assert.rejects(service.createRun({ ...request, planToken, planRevision: 1 }), {
    code: 'AGENT_PLAN_TOKEN_EXPIRED_OR_STALE'
  });
});

for (const name of ['valid plan', 'legacy request without a plan']) {
  test(`createRun admits ${name} to normal database validation`, async () => {
    const reachedDatabase = new Error('Normal database validation reached');
    let calls = 0;
    const service = createAgentRunService({
      env,
      pool: { connect: async () => { calls += 1; throw reachedDatabase; } }
    });
    const plan = name === 'valid plan' ? { planToken: tokenFor(), planRevision: 1 } : {};
    await assert.rejects(service.createRun({ ...request, ...plan }), error => error === reachedDatabase);
    assert.equal(calls, 1);
  });
}
