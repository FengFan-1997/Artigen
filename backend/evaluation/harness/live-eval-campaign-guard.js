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
    this.lockClient = null;
    this.deadlineAt = null;
    this.deadlineController = null;
    this.deadlineTimer = null;
  }

  async initialize() {
    if (this.lockClient) return this.snapshot();
    const client = await this.pool.connect();
    try {
      const locked = await client.query(
        `SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked`,
        [`agent-live-eval-campaign:${this.campaignHash}`]
      );
      if (locked.rows[0]?.locked !== true) {
        throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_ALREADY_RUNNING');
      }
      await client.query('BEGIN');
      const selected = await client.query(
        `SELECT id,metrics,created_at
           FROM agent_quality_checks
          WHERE check_kind=$1 AND metrics->>'campaignHash'=$2
          ORDER BY id
          FOR UPDATE`,
        [CAMPAIGN_CHECK_KIND, this.campaignHash]
      );
      if (selected.rowCount > 1) throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_DUPLICATE');
      let metrics;
      if (!selected.rowCount) {
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
               'startedAt',clock_timestamp(),
               'deadlineAt',clock_timestamp()+($7::bigint * interval '1 millisecond')
             ),
             clock_timestamp()+interval '30 days')
           RETURNING metrics`,
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
        metrics = inserted.rows[0].metrics;
      } else {
        metrics = selected.rows[0].metrics;
      }
      if (
        String(metrics?.commitSha || '').toLowerCase() !== this.commitSha ||
        String(metrics?.matrixHash || '').toLowerCase() !== this.matrixHash ||
        Number(metrics?.maxQwenCalls) !== this.maxQwenCalls ||
        Number(metrics?.maxKolorsCalls) !== this.maxKolorsCalls
      ) {
        throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_PROFILE_MISMATCH');
      }
      const deadline = new Date(metrics?.deadlineAt);
      if (!Number.isFinite(deadline.getTime())) {
        throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_DEADLINE_INVALID');
      }
      const now = await client.query('SELECT clock_timestamp() AS now');
      if (deadline.getTime() <= new Date(now.rows[0].now).getTime()) {
        throw new Error('AGENT_LIVE_EVAL_WALL_CLOCK_LIMIT');
      }
      await client.query('COMMIT');
      this.lockClient = client;
      this.deadlineAt = deadline.toISOString();
      this.deadlineController = new AbortController();
      this.deadlineTimer = setTimeout(() => {
        this.deadlineController.abort(new Error('AGENT_LIVE_EVAL_WALL_CLOCK_LIMIT'));
      }, Math.max(1, deadline.getTime() - Date.now()));
      this.deadlineTimer.unref?.();
      return this.snapshot();
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      await client.query(
        `SELECT pg_advisory_unlock(hashtextextended($1,0))`,
        [`agent-live-eval-campaign:${this.campaignHash}`]
      ).catch(() => {});
      client.release();
      throw error;
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

  async reserveDispatch(kind, { runId = null } = {}) {
    if (!ALLOWED_DISPATCH_KINDS.has(kind)) {
      throw new TypeError('AGENT_LIVE_EVAL_DISPATCH_KIND_INVALID');
    }
    if (!this.lockClient) throw new Error('AGENT_LIVE_EVAL_CAMPAIGN_NOT_INITIALIZED');
    if (this.signal.aborted) throw new Error('AGENT_LIVE_EVAL_WALL_CLOCK_LIMIT');
    const client = this.lockClient;
    await client.query('BEGIN');
    try {
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
             'runIdHash',$5::text
           ),
           clock_timestamp()+interval '30 days')
         RETURNING id,created_at`,
        [
          DISPATCH_CHECK_KIND,
          this.campaignHash,
          kind,
          count + 1,
          runId ? sha256(runId) : ''
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
    }
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
      maxKolorsCalls: this.maxKolorsCalls
    });
  }

  async close() {
    if (!this.lockClient) return;
    clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    this.deadlineController?.abort(new Error('AGENT_LIVE_EVAL_CAMPAIGN_CLOSED'));
    const client = this.lockClient;
    this.lockClient = null;
    await client.query(
      `SELECT pg_advisory_unlock(hashtextextended($1,0))`,
      [`agent-live-eval-campaign:${this.campaignHash}`]
    ).catch(() => {});
    client.release();
  }
}

module.exports = {
  ALLOWED_DISPATCH_KINDS,
  CAMPAIGN_CHECK_KIND,
  DISPATCH_CHECK_KIND,
  LiveEvalCampaignGuard,
  sha256
};
