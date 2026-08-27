const crypto = require('node:crypto');

const CAMPAIGN_CHECK_KIND = 'agent-live-eval-campaign-v1';
const DISPATCH_CHECK_KIND = 'agent-live-eval-dispatch-v1';
const ALLOWED_DISPATCH_KINDS = new Set(['qwen', 'kolors']);

const sha256 = (value) => crypto
  .createHash('sha256')
  .update(String(value || ''), 'utf8')
  .digest('hex');

const isSha256 = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));
const isCommitSha = (value) => /^[a-f0-9]{40}$/i.test(String(value || ''));

class LiveEvalCampaignGuard {
  constructor({
    pool,
    campaignId,
    commitSha,
    matrixHash,
    maxQwenCalls = 200,
    maxKolorsCalls = 16,
    maxWallClockMs = 8 * 60 * 60 * 1000
  } = {}) {
    if (!pool || typeof pool.connect !== 'function') {
      throw new TypeError('AGENT_LIVE_EVAL_CAMPAIGN_POOL_REQUIRED');
    }
    if (!/^[a-f0-9-]{16,80}$/i.test(String(campaignId || ''))) {
      throw new TypeError('AGENT_LIVE_EVAL_CAMPAIGN_ID_INVALID');
    }
    if (!isCommitSha(commitSha) || !isSha256(matrixHash)) {
      throw new TypeError('AGENT_LIVE_EVAL_CAMPAIGN_PROFILE_INVALID');
    }
    this.pool = pool;
    this.campaignId = String(campaignId);
    this.campaignHash = sha256(this.campaignId);
    this.commitSha = String(commitSha).toLowerCase();
    this.matrixHash = String(matrixHash).toLowerCase();
    this.maxQwenCalls = Math.max(1, Math.min(200, Number(maxQwenCalls) || 200));
    this.maxKolorsCalls = Math.max(1, Math.min(16, Number(maxKolorsCalls) || 16));
    this.maxWallClockMs = Math.max(
      60_000,
      Math.min(8 * 60 * 60 * 1000, Number(maxWallClockMs) || 8 * 60 * 60 * 1000)
    );
    this.claimed = false;
    this.campaignCheckId = null;
    this.deadlineAt = null;
    this.deadlineController = null;
    this.deadlineTimer = null;
  }

  assertActive() {
    if (!this.deadlineController) {
      throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_NOT_INITIALIZED');
    }
    if (this.deadlineController.signal.aborted) {
      const reason = this.deadlineController.signal.reason;
      throw reason instanceof Error
        ? reason
        : new Error('AGENT_LIVE_EVAL_CAMPAIGN_ABORTED');
    }
    if (!this.claimed || !Number.isSafeInteger(this.campaignCheckId)) {
      throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_NOT_INITIALIZED');
    }
  }

  async initialize() {
    if (this.claimed) {
      this.assertActive();
      return this.snapshot();
    }
    const client = await this.pool.connect();
    let destroyClient = false;
    try {
      await client.query('BEGIN');
      // The transaction lock only serializes the one-time claim. The durable
      // quality-check row is the global claim, so a multi-hour campaign never
      // depends on one fragile PostgreSQL session staying connected.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`agent-live-eval-campaign:${this.campaignHash}`]
      );
      const selected = await client.query(
        `SELECT id,metrics,created_at
           FROM agent_quality_checks
          WHERE check_kind=$1 AND metrics->>'campaignHash'=$2
          ORDER BY id
          FOR UPDATE`,
        [CAMPAIGN_CHECK_KIND, this.campaignHash]
      );
      if (selected.rowCount > 1) throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_DUPLICATE');
      if (selected.rowCount) throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_ALREADY_CLAIMED');
      const inserted = await client.query(
        `INSERT INTO agent_quality_checks
          (check_kind,status,score,codes,metrics,expires_at)
         VALUES ($1,'passed',100,'[]'::jsonb,
           jsonb_build_object(
             'campaignHash',$2::text,
             'commitSha',$3::text,
             'matrixHash',$4::text,
             'maxQwenCalls',$5::integer,
             'maxKolorsCalls',$6::integer,
             'claimMode','durable-once-v1',
             'startedAt',clock_timestamp(),
             'deadlineAt',clock_timestamp()+($7::bigint * interval '1 millisecond')
           ),
           clock_timestamp()+interval '30 days')
         RETURNING id,metrics`,
        [
          CAMPAIGN_CHECK_KIND,
          this.campaignHash,
          this.commitSha,
          this.matrixHash,
          this.maxQwenCalls,
          this.maxKolorsCalls,
          this.maxWallClockMs
        ]
      );
      const metrics = inserted.rows[0].metrics;
      const deadline = new Date(metrics?.deadlineAt);
      if (!Number.isFinite(deadline.getTime())) {
        throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_DEADLINE_INVALID');
      }
      const now = await client.query('SELECT clock_timestamp() AS now');
      if (deadline.getTime() <= new Date(now.rows[0].now).getTime()) {
        throw new Error('AGENT_LIVE_EVAL_WALL_CLOCK_LIMIT');
      }
      await client.query('COMMIT');
      this.deadlineAt = deadline.toISOString();
      this.deadlineController = new AbortController();
      this.claimed = true;
      this.campaignCheckId = Number(inserted.rows[0].id);
      this.deadlineTimer = setTimeout(() => {
        this.deadlineController.abort(new Error('AGENT_LIVE_EVAL_WALL_CLOCK_LIMIT'));
      }, Math.max(1, deadline.getTime() - Date.now()));
      this.deadlineTimer.unref?.();
      return this.snapshot();
    } catch (error) {
      destroyClient = true;
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release(destroyClient);
    }
  }

  get signal() {
    if (!this.deadlineController) throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_NOT_INITIALIZED');
    return this.deadlineController.signal;
  }

  combinedSignal(signal) {
    if (!signal) return this.signal;
    return AbortSignal.any([signal, this.signal]);
  }

  async reserveDispatch(kind, {
    runId = null,
    slotId = null,
    runtimeVersion = null,
    phase = null
  } = {}) {
    if (!ALLOWED_DISPATCH_KINDS.has(kind)) {
      throw new TypeError('AGENT_LIVE_EVAL_DISPATCH_KIND_INVALID');
    }
    this.assertActive();
    // The durable campaign row proves that this signed campaign was claimed.
    // Physical Provider calls can arrive concurrently from parent/child
    // Agents, so each reservation gets an independent transaction and a
    // campaign-scoped xact lock.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`agent-live-eval-dispatch:${this.campaignHash}`]
      );
      const campaign = await client.query(
        `SELECT metrics,clock_timestamp() AS now
           FROM agent_quality_checks
          WHERE check_kind=$1 AND metrics->>'campaignHash'=$2
          ORDER BY id
          LIMIT 1
          FOR UPDATE`,
        [CAMPAIGN_CHECK_KIND, this.campaignHash]
      );
      if (!campaign.rowCount) throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_NOT_FOUND');
      const deadline = new Date(campaign.rows[0].metrics?.deadlineAt).getTime();
      const now = new Date(campaign.rows[0].now).getTime();
      if (!Number.isFinite(deadline) || now >= deadline) {
        throw new Error('AGENT_LIVE_EVAL_WALL_CLOCK_LIMIT');
      }
      const counted = await client.query(
        `SELECT count(*)::integer AS count
           FROM agent_quality_checks
          WHERE check_kind=$1
            AND metrics->>'campaignHash'=$2
            AND metrics->>'kind'=$3`,
        [DISPATCH_CHECK_KIND, this.campaignHash, kind]
      );
      const count = Number(counted.rows[0]?.count || 0);
      const limit = kind === 'qwen' ? this.maxQwenCalls : this.maxKolorsCalls;
      if (count >= limit) {
        throw new Error(kind === 'qwen'
          ? 'AGENT_LIVE_EVAL_QWEN_CALL_LIMIT'
          : 'AGENT_LIVE_EVAL_KOLORS_CALL_LIMIT');
      }
      const inserted = await client.query(
        `INSERT INTO agent_quality_checks
          (run_id,check_kind,status,score,codes,metrics,expires_at)
         VALUES (NULL,$1,'passed',100,'[]'::jsonb,
           jsonb_build_object(
             'campaignHash',$2::text,
             'kind',$3::text,
             'sequence',$4::integer,
             'runIdHash',$5::text,
             'slotHash',$6::text,
             'runtimeVersion',$7::integer,
             'phase',$8::text,
             'dispatchStatus','dispatched',
             'inputTokens',0,
             'outputTokens',0,
             'latencyMs',0
           ),
           clock_timestamp()+interval '30 days')
         RETURNING id,created_at`,
        [
          DISPATCH_CHECK_KIND,
          this.campaignHash,
          kind,
          count + 1,
          runId ? sha256(runId) : '',
          slotId ? sha256(slotId) : '',
          [1, 2].includes(Number(runtimeVersion)) ? Number(runtimeVersion) : 0,
          String(phase || '').slice(0, 80)
        ]
      );
      await client.query('COMMIT');
      return Object.freeze({
        dispatchId: Number(inserted.rows[0].id),
        kind,
        sequence: count + 1,
        deadlineAt: this.deadlineAt
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async recordDispatchResult(dispatch, {
    status,
    inputTokens = 0,
    outputTokens = 0,
    latencyMs = 0,
    errorCode = null
  } = {}) {
    const dispatchId = Number(dispatch?.dispatchId || 0);
    if (!Number.isSafeInteger(dispatchId) || dispatchId <= 0) {
      throw new TypeError('AGENT_LIVE_EVAL_DISPATCH_ID_INVALID');
    }
    const normalizedStatus = ['succeeded', 'failed', 'cancelled'].includes(status)
      ? status
      : 'failed';
    const normalizedError = /^[A-Z][A-Z0-9_]{2,100}$/.test(String(errorCode || ''))
      ? String(errorCode)
      : '';
    const result = await this.pool.query(
      `UPDATE agent_quality_checks
          SET status=CASE WHEN $3='succeeded' THEN 'passed' ELSE 'failed' END,
              metrics=metrics || jsonb_build_object(
                'dispatchStatus',$3::text,
                'inputTokens',$4::integer,
                'outputTokens',$5::integer,
                'latencyMs',$6::integer,
                'errorCode',$7::text,
                'finishedAt',clock_timestamp()
              )
        WHERE id=$1 AND check_kind=$2
          AND metrics->>'campaignHash'=$8
          AND metrics->>'dispatchStatus'='dispatched'
        RETURNING id`,
      [
        dispatchId,
        DISPATCH_CHECK_KIND,
        normalizedStatus,
        Math.max(0, Math.ceil(Number(inputTokens) || 0)),
        Math.max(0, Math.ceil(Number(outputTokens) || 0)),
        Math.max(0, Math.ceil(Number(latencyMs) || 0)),
        normalizedError,
        this.campaignHash
      ]
    );
    if (!result.rowCount) throw new Error('AGENT_LIVE_EVAL_DISPATCH_RESULT_CONFLICT');
    return true;
  }

  async dispatchMetrics({ runId = null, slotId = null } = {}) {
    if (!runId && !slotId) throw new TypeError('AGENT_LIVE_EVAL_DISPATCH_SCOPE_REQUIRED');
    const result = await this.pool.query(
      `SELECT id,metrics,created_at
         FROM agent_quality_checks
        WHERE check_kind=$1 AND metrics->>'campaignHash'=$2
          AND (
            ($3::text<>'' AND metrics->>'runIdHash'=$3)
            OR ($4::text<>'' AND metrics->>'slotHash'=$4)
          )
        ORDER BY (metrics->>'sequence')::integer,id`,
      [
        DISPATCH_CHECK_KIND,
        this.campaignHash,
        runId ? sha256(runId) : '',
        slotId ? sha256(slotId) : ''
      ]
    );
    const calls = result.rows.map((row) => ({
      id: Number(row.id),
      kind: String(row.metrics?.kind || ''),
      sequence: Number(row.metrics?.sequence || 0),
      runtimeVersion: Number(row.metrics?.runtimeVersion || 0),
      phase: String(row.metrics?.phase || ''),
      status: String(row.metrics?.dispatchStatus || 'dispatched'),
      inputTokens: Number(row.metrics?.inputTokens || 0),
      outputTokens: Number(row.metrics?.outputTokens || 0),
      latencyMs: Number(row.metrics?.latencyMs || 0),
      errorCode: String(row.metrics?.errorCode || '')
    }));
    return {
      calls,
      qwenCalls: calls.filter((call) => call.kind === 'qwen').length,
      kolorsCalls: calls.filter((call) => call.kind === 'kolors').length,
      inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
      outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
      latencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
      incomplete: calls.filter((call) => call.status === 'dispatched').length
    };
  }

  async counts() {
    const result = await this.pool.query(
      `SELECT metrics->>'kind' AS kind,count(*)::integer AS count
         FROM agent_quality_checks
        WHERE check_kind=$1 AND metrics->>'campaignHash'=$2
        GROUP BY metrics->>'kind'`,
      [DISPATCH_CHECK_KIND, this.campaignHash]
    );
    const counts = Object.fromEntries(result.rows.map((row) => [row.kind, Number(row.count)]));
    return { qwen: counts.qwen || 0, kolors: counts.kolors || 0 };
  }

  snapshot() {
    return Object.freeze({
      campaignHash: this.campaignHash,
      commitSha: this.commitSha,
      matrixHash: this.matrixHash,
      deadlineAt: this.deadlineAt,
      maxQwenCalls: this.maxQwenCalls,
      maxKolorsCalls: this.maxKolorsCalls,
      claimMode: 'durable-once-v1',
      campaignCheckId: this.campaignCheckId
    });
  }

  abort(reason = new Error('AGENT_LIVE_EVAL_CAMPAIGN_ABORTED')) {
    this.deadlineController?.abort(reason);
  }

  async close() {
    if (!this.claimed) return;
    clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    this.deadlineController?.abort(new Error('AGENT_LIVE_EVAL_CAMPAIGN_CLOSED'));
    this.claimed = false;
  }
}

module.exports = {
  ALLOWED_DISPATCH_KINDS,
  CAMPAIGN_CHECK_KIND,
  DISPATCH_CHECK_KIND,
  LiveEvalCampaignGuard,
  sha256
};
