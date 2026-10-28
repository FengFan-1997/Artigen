const { ApiError } = require('../lib/api-error');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const validateId = (value, code) => {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, code);
  return value;
};

// Changes the durable ownership scope only at a safe boundary. Merely viewing a
// different project's GitHub panel never calls this service.
const createAgentProjectAssociationService = ({ pool }) => {
  const transaction = async (operation) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (['40001', '40P01'].includes(error.code)) {
        throw new ApiError(409, 'AGENT_PROJECT_STATE_CHANGED', { retryable: true });
      }
      throw error;
    } finally { client.release(); }
  };

  const readScope = async (client, { userId, runId }) => {
    validateId(runId, 'AGENT_RUN_ID_INVALID');
    const initial = await client.query(
      'SELECT id,user_id,idempotency_key FROM agent_runs WHERE id=$1 AND user_id=$2', [runId, userId]
    );
    if (!initial.rowCount) throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    // The browser creates a design Run before attaching its execution target.
    // Include that creation identity so the short gap is never treated as an
    // unrelated standalone Run that could change projects independently.
    const executionId = /^design:([0-9a-f-]{36})$/i.exec(initial.rows[0].idempotency_key || '')?.[1];
    const pendingExecutionId = executionId && UUID.test(executionId) ? executionId : null;
    const links = await client.query(
      `SELECT DISTINCT conversation_id FROM design_executions WHERE agent_run_id=$1 OR id=$2::uuid`, [runId, pendingExecutionId]
    );
    if (pendingExecutionId && !links.rowCount) throw new ApiError(409, 'AGENT_PROJECT_CONVERSATION_BUSY');
    if (links.rowCount > 1) throw new ApiError(409, 'AGENT_PROJECT_SCOPE_AMBIGUOUS');
    const conversationId = links.rows[0]?.conversation_id || null;
    let conversation = null;
    let executions = [];
    if (conversationId) {
      const result = await client.query(
        'SELECT id,project_id,user_id FROM design_conversations WHERE id=$1 AND user_id=$2 FOR UPDATE',
        [conversationId, userId]
      );
      if (!result.rowCount) throw new ApiError(404, 'DESIGN_CONVERSATION_NOT_FOUND');
      conversation = result.rows[0];
      executions = (await client.query(
        'SELECT id,agent_run_id,status FROM design_executions WHERE conversation_id=$1 ORDER BY id FOR UPDATE',
        [conversationId]
      )).rows;
    }
    const ids = [...new Set([runId, ...executions.map((item) => item.agent_run_id).filter(Boolean)])].sort();
    const runs = (await client.query(
      `SELECT id,user_id,project_id,status,worker_id,lease_expires_at,checkpoint
         FROM agent_runs WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids]
    )).rows;
    if (runs.length !== ids.length || runs.some((run) => run.user_id !== userId)) {
      throw new ApiError(404, 'AGENT_RUN_NOT_FOUND');
    }
    const current = runs.find((run) => run.id === runId);
    const projects = new Set([conversation?.project_id, ...runs.map((run) => run.project_id)].filter(Boolean));
    let blockedReason = projects.size > 1 ? 'AGENT_PROJECT_CONFLICT' : null;
    const active = runs.filter((run) => !TERMINAL.has(run.status));
    if (!blockedReason && active.some((run) => run.status === 'verifying')) blockedReason = 'AGENT_PROJECT_VERIFYING';
    if (!blockedReason && executions.some((item) => !item.agent_run_id && !['succeeded','failed','cancelled'].includes(item.status))) {
      blockedReason = 'AGENT_PROJECT_CONVERSATION_BUSY';
    }
    if (!blockedReason && conversationId) {
      const jobs = await client.query(
        `SELECT 1 FROM design_planning_jobs WHERE conversation_id=$1 AND status IN ('queued','running') LIMIT 1`, [conversationId]
      );
      if (jobs.rowCount) blockedReason = 'AGENT_PROJECT_CONVERSATION_BUSY';
    }
    if (!blockedReason && active.length) {
      const activeIds = active.map((run) => run.id);
      const pending = await client.query(
        `SELECT
           EXISTS(SELECT 1 FROM agent_subagents WHERE run_id=ANY($1::uuid[]) AND status NOT IN ('succeeded','failed','cancelled')) AS children,
           EXISTS(SELECT 1 FROM agent_tool_call_receipts WHERE run_id=ANY($1::uuid[]) AND state IN ('dispatched','ambiguous')) AS tools,
           (EXISTS(SELECT 1 FROM agent_model_call_receipts WHERE run_id=ANY($1::uuid[]) AND state <> 'consumed') OR EXISTS(SELECT 1 FROM agent_model_calls WHERE run_id=ANY($1::uuid[]) AND outcome='running')) AS models`, [activeIds]
      );
      if (pending.rows[0]?.children) blockedReason = 'AGENT_PROJECT_CHILDREN_ACTIVE';
      else if (pending.rows[0]?.tools || pending.rows[0]?.models || active.some((run) =>
        Object.values(run.checkpoint?.toolReceipts || {}).some((receipt) => ['dispatched','ambiguous'].includes(receipt?.state))
      )) blockedReason = 'AGENT_PROJECT_CALL_PENDING';
    }
    const requiresPause = active.some((run) => !['draft','queued','paused'].includes(run.status));
    if (!blockedReason && requiresPause) blockedReason = 'AGENT_PROJECT_PAUSE_REQUIRED';
    if (!blockedReason && active.some((run) => run.worker_id || run.lease_expires_at)) blockedReason = 'AGENT_PROJECT_WORKER_ACTIVE';
    const projectId = conversation?.project_id || current.project_id || [...projects][0] || null;
    return {
      runs, conversation,
      summary: {
        runId, projectId, scope: conversationId ? 'conversation' : 'run', conversationId,
        affectedRunCount: runs.length, canAssociate: !blockedReason && !projectId,
        requiresPause, pausableRunIds: active.filter((run) => ['provisioning','running','waiting_user'].includes(run.status)).map((run) => run.id), requiresPausedConfirmation: active.some((run) => run.status === 'paused'),
        blockedReason
      }
    };
  };

  const getScope = (input) => transaction(async (client) => (await readScope(client, input)).summary);
  const associate = (input) => transaction(async (client) => {
    const projectId = validateId(input.projectId, 'AGENT_PROJECT_ID_INVALID');
    const project = await client.query(
      `SELECT id FROM creative_projects WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE`,
      [projectId, input.userId]
    );
    if (!project.rowCount) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    const { runs, conversation, summary } = await readScope(client, input);
    const existing = [conversation?.project_id, ...runs.map((run) => run.project_id)].filter(Boolean);
    if (existing.some((id) => id !== projectId)) throw new ApiError(409, 'AGENT_PROJECT_CONFLICT');
    if (existing.length === runs.length + (conversation ? 1 : 0)) return { ...summary, projectId, changed: false };
    if (summary.blockedReason) throw new ApiError(409, summary.blockedReason);
    if (conversation && input.confirmConversation !== true) throw new ApiError(409, 'AGENT_PROJECT_CONVERSATION_CONFIRM_REQUIRED');
    if (summary.requiresPausedConfirmation && input.confirmPaused !== true) throw new ApiError(409, 'AGENT_PROJECT_PAUSED_CONFIRM_REQUIRED');
    const ids = runs.map((run) => run.id);
    await client.query(
      'UPDATE agent_runs SET project_id=$2,updated_at=now() WHERE id=ANY($1::uuid[]) AND project_id IS NULL', [ids, projectId]
    );
    if (conversation) await client.query(
      'UPDATE design_conversations SET project_id=$2,updated_at=now() WHERE id=$1 AND project_id IS NULL', [conversation.id, projectId]
    );
    await client.query(
      `INSERT INTO agent_events (run_id,event_type,phase,summary,data)
       SELECT id,'run.project_associated',status,'已关联项目',$2::jsonb FROM agent_runs WHERE id=ANY($1::uuid[])`,
      [ids, JSON.stringify({ projectId, scope: summary.scope })]
    );
    return { ...summary, projectId, canAssociate: false, changed: true };
  });
  return { getScope, associate };
};
module.exports = { createAgentProjectAssociationService };
