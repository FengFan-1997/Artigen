const { ApiError } = require("../lib/api-error");
const { resolveUserId } = require("./billing-service");
const { decryptAgentPayload } = require("./agent-payload-service");
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const assertId = (id) => {
  if (!UUID.test(String(id || "")))
    throw new ApiError(400, "WORKSPACE_ID_INVALID");
  return id;
};
const decodeCursor = (value) => {
  if (!value) return null;
  try {
    const cursor = JSON.parse(
      Buffer.from(String(value), "base64url").toString(),
    );
    if (
      !Number.isFinite(Date.parse(cursor.time)) ||
      !UUID.test(cursor.id) ||
      !["conversation", "run"].includes(cursor.kind)
    )
      throw Error();
    return cursor;
  } catch {
    throw new ApiError(400, "WORKSPACE_CURSOR_INVALID");
  }
};
const createWorkspaceService = ({ pool, env = process.env }) => {
  const transaction = async (userId, work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const owner = await resolveUserId(client, userId);
      const result = await work(client, owner);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  const navigation = ({ userId, cursor, projectId, limit = 50 }) =>
    transaction(userId, async (client, owner) => {
      const after = decodeCursor(cursor);
      const count = Math.max(1, Math.min(100, Number(limit) || 50));
      if (projectId) assertId(projectId);
      const projects = await client.query(
        "SELECT id AS \"projectId\",title FROM creative_projects WHERE user_id=$1 AND status='active' ORDER BY updated_at DESC,id LIMIT 100",
        [owner],
      );
      const result = await client.query(
        `SELECT s.*,s.updated_at::text AS cursor_time FROM (
      SELECT c.id,c.project_id,c.title,c.updated_at,'conversation' AS kind,COALESCE(e.status,c.status) AS status
        FROM design_conversations c LEFT JOIN LATERAL
          (SELECT status FROM design_executions WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) e ON true
        WHERE c.user_id=$1 AND (c.expires_at IS NULL OR c.expires_at>now())
      UNION ALL SELECT r.id,r.project_id,'Agent task' AS title,r.updated_at,'run' AS kind,r.status
        FROM agent_runs r WHERE r.user_id=$1 AND r.expires_at>now()
          AND NOT EXISTS(SELECT 1 FROM design_executions e WHERE e.agent_run_id=r.id)
    ) s WHERE ($2::uuid IS NULL OR s.project_id=$2)
      AND ($3::timestamptz IS NULL OR (s.updated_at,s.id,s.kind)<($3::timestamptz,$4::uuid,$5::text))
    ORDER BY updated_at DESC,id DESC,kind DESC LIMIT $6`,
        [
          owner,
          projectId || null,
          after?.time || null,
          after?.id || null,
          after?.kind || null,
          count + 1,
        ],
      );
      const rows = result.rows.slice(0, count);
      const ids = rows.filter((r) => r.kind === "run").map((r) => r.id);
      const payloads = ids.length
        ? await client.query(
            "SELECT DISTINCT ON(run_id) * FROM agent_run_payloads WHERE run_id=ANY($1::uuid[]) AND kind='objective' AND expires_at>now() ORDER BY run_id,created_at",
            [ids],
          )
        : { rows: [] };
      const titles = new Map();
      for (const record of payloads.rows) {
        const value = decryptAgentPayload({
          runId: record.run_id,
          payloadId: record.id,
          kind: record.kind,
          record,
          env,
        });
        titles.set(
          record.run_id,
          String(value.objective || "Agent task").slice(0, 160),
        );
      }
      const last = rows.at(-1);
      return {
        projects: projects.rows,
        sessions: rows.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          title: titles.get(r.id) || r.title,
          kind: r.kind,
          status: r.status,
          updatedAt: r.updated_at,
        })),
        nextCursor:
          result.rows.length > count && last
            ? Buffer.from(
                JSON.stringify({
                  time: last.cursor_time,
                  id: last.id,
                  kind: last.kind,
                }),
              ).toString("base64url")
            : null,
      };
    });
  const updateConversation = ({ userId, conversationId, title, projectId }) =>
    transaction(userId, async (client, owner) => {
      assertId(conversationId);
      if (
        title !== undefined &&
        (typeof title !== "string" || !title.trim() || title.length > 160)
      )
        throw new ApiError(400, "WORKSPACE_TITLE_INVALID");
      if (projectId !== undefined && projectId !== null) {
        assertId(projectId);
        const owned = await client.query(
          "SELECT 1 FROM creative_projects WHERE id=$1 AND user_id=$2 AND status='active' FOR SHARE",
          [projectId, owner],
        );
        if (!owned.rowCount) throw new ApiError(404, "PROJECT_NOT_FOUND");
      }
      if (projectId !== undefined) {
        const conversation = await client.query(
          "SELECT project_id FROM design_conversations WHERE id=$1 AND user_id=$2 AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE",
          [conversationId, owner],
        );
        if (!conversation.rowCount) throw new ApiError(404, "CONVERSATION_NOT_FOUND");
        if ((conversation.rows[0].project_id || null) !== (projectId || null)) {
          const dependent = await client.query(
            `SELECT 1 WHERE
              EXISTS(SELECT 1 FROM design_executions WHERE conversation_id=$1
                AND (agent_run_id IS NOT NULL OR status NOT IN ('succeeded','failed','cancelled')))
              OR EXISTS(SELECT 1 FROM design_planning_jobs WHERE conversation_id=$1 AND status IN ('queued','running'))`,
            [conversationId],
          );
          if (dependent.rowCount) throw new ApiError(409, "WORKSPACE_CONVERSATION_PROJECT_LOCKED");
        }
      }
      const result = await client.query(
        `UPDATE design_conversations SET title=COALESCE($3,title),project_id=CASE WHEN $4 THEN $5::uuid ELSE project_id END,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND (expires_at IS NULL OR expires_at>now()) RETURNING id`,
        [
          conversationId,
          owner,
          title === undefined ? null : title.trim(),
          projectId !== undefined,
          projectId || null,
        ],
      );
      if (!result.rowCount) throw new ApiError(404, "CONVERSATION_NOT_FOUND");
      return { conversationId };
    });
  const messages = ({ userId, runId, cursor }) =>
    transaction(userId, async (client, owner) => {
      assertId(runId);
      const owned = await client.query(
        "SELECT 1 FROM agent_runs WHERE id=$1 AND user_id=$2 AND expires_at>now()",
        [runId, owner],
      );
      if (!owned.rowCount) throw new ApiError(404, "AGENT_RUN_NOT_FOUND");
      let after = null;
      if (cursor) {
        try {
          after = JSON.parse(
            Buffer.from(String(cursor), "base64url").toString(),
          );
          assertId(after.id);
          if (!Number.isFinite(Date.parse(after.time))) throw Error();
        } catch {
          throw new ApiError(400, "WORKSPACE_CURSOR_INVALID");
        }
      }
      const rows = await client.query(
        `SELECT *,created_at::text AS cursor_time FROM agent_run_payloads WHERE run_id=$1 AND kind IN ('public_message','user_input') AND expires_at>now()
      AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid)) ORDER BY created_at,id LIMIT 101`,
        [runId, after?.time || null, after?.id || null],
      );
      const page = rows.rows.slice(0, 100);
      const last = page.at(-1);
      return {
        messages: page.map((record) => {
          const value = decryptAgentPayload({
            runId,
            payloadId: record.id,
            kind: record.kind,
            record,
            env,
          });
          return {
            id: record.id,
            role: record.kind === "user_input" ? "user" : "assistant",
            kind: value.kind || "text",
            text: value.text || value.message || "",
            ...(Array.isArray(value.attachments) ? { attachments: value.attachments } : {}),
            createdAt: record.created_at,
          };
        }),
        nextCursor:
          rows.rows.length > 100 && last
            ? Buffer.from(
                JSON.stringify({ id: last.id, time: last.cursor_time }),
              ).toString("base64url")
            : null,
      };
    });
  return { navigation, updateConversation, transaction, messages };
};
module.exports = { createWorkspaceService, assertId, decodeCursor };
