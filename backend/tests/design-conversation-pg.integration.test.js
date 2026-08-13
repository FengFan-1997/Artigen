const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const {
  createDesignConversationService
} = require('../services/design-conversation-service');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

test('PostgreSQL conversation lifecycle encrypts, isolates, plans, authorizes and deletes', {
  skip: !enabled
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const users = await pool.query(
    `INSERT INTO users (legacy_user_id,display_name,status)
     VALUES ($1,$2,'active'),($3,$4,'active') RETURNING id`,
    [`design-a-${suffix}`, 'Design conversation A', `design-b-${suffix}`, 'Design conversation B']
  );
  const [userA, userB] = users.rows.map((row) => row.id);
  const env = {
    ...process.env,
    DESIGN_CONVERSATION_ENABLED: 'true',
    DESIGN_CONVERSATION_WORKER_ENABLED: 'true',
    DESIGN_CONVERSATION_RETENTION_DAYS: '30',
    AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'73'.repeat(32)}`
  };
  const service = createDesignConversationService({
    pool,
    env,
    chatGenerate: async () => ({
      text: JSON.stringify({
        routeKind: 'tool_task',
        toolId: 'ai-design',
        operation: 'generate',
        reply: '信息已经足够，我会直接生成主视觉。'
      })
    })
  });
  let conversationId = null;
  try {
    const created = await service.createConversation({ userId: userA });
    conversationId = created.conversationId;
    await assert.rejects(
      service.getConversation({ userId: userB, conversationId }),
      { code: 'DESIGN_CONVERSATION_NOT_FOUND' }
    );

    const userMessage = await service.addMessage({
      userId: userA,
      conversationId,
      message: '为新款柚子气泡水生成一张夏日主视觉',
      attachments: []
    });
    let hydrated = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      hydrated = await service.getConversation({ userId: userA, conversationId });
      if (hydrated.executions.length) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(hydrated.messages.length, 2, JSON.stringify({
      messages: hydrated.messages.map((item) => ({
        messageId: item.messageId,
        role: item.role,
        kind: item.kind,
        status: item.status
      })),
      executions: hydrated.executions.map((item) => ({
        executionId: item.executionId,
        sourceMessageId: item.sourceMessageId,
        status: item.status,
        routeKind: item.routeKind
      }))
    }));
    assert.equal(hydrated.messages[0].messageId, userMessage.messageId);
    assert.equal(hydrated.messages[0].text, '为新款柚子气泡水生成一张夏日主视觉');
    assert.equal(hydrated.executions.length, 1);
    assert.equal(hydrated.executions[0].routeKind, 'tool_task');
    assert.equal(hydrated.executions[0].toolId, 'ai-design');
    assert.equal(hydrated.executions[0].sourceMessageId, hydrated.messages[1].messageId);
    const raised = await service.increaseExecutionBudget({
      userId: userA,
      conversationId,
      executionId: hydrated.executions[0].executionId,
      maxCredits: 80
    });
    assert.equal(raised.maxCredits, 80);
    const afterRaise = await service.getConversation({ userId: userA, conversationId });
    assert.equal(afterRaise.autoCreditCap, 50);
    assert.equal(afterRaise.executions[0].maxCredits, 80);

    const storedMessage = await pool.query(
      'SELECT ciphertext FROM design_messages WHERE id=$1',
      [userMessage.messageId]
    );
    assert.equal(storedMessage.rowCount, 1);
    assert.doesNotMatch(storedMessage.rows[0].ciphertext.toString('utf8'), /柚子|主视觉/u);

    const authorization = await service.grantAuthorization({
      userId: userA,
      conversationId,
      siteOrigin: 'https://brand.example/publish',
      actionType: 'publish'
    });
    assert.equal(authorization.siteOrigin, 'https://brand.example');
    await assert.rejects(
      service.grantAuthorization({
        userId: userA,
        conversationId,
        siteOrigin: 'http://brand.example',
        actionType: 'publish'
      }),
      { code: 'DESIGN_AUTHORIZATION_ORIGIN_INVALID' }
    );

    const event = await pool.query(
      'SELECT id FROM design_conversation_events WHERE conversation_id=$1 LIMIT 1',
      [conversationId]
    );
    await assert.rejects(
      pool.query('DELETE FROM design_conversation_events WHERE id=$1', [event.rows[0].id]),
      { code: '55000' }
    );
    assert.equal(await service.deleteConversation({ userId: userA, conversationId }), true);
    const deleted = await pool.query(
      'SELECT 1 FROM design_conversations WHERE id=$1',
      [conversationId]
    );
    assert.equal(deleted.rowCount, 0);
    conversationId = null;
  } finally {
    service.stopWorker();
    if (conversationId) {
      await pool.query('DELETE FROM design_conversations WHERE id=$1', [conversationId]).catch(() => {});
    }
    await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[userA, userB]]).catch(() => {});
    await pool.end();
  }
});
