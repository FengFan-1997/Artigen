const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const {
  decryptAgentPayload,
  encryptAgentPayload
} = require('./agent-payload-service');

const PRIORITIES = Object.freeze({
  router: 1,
  planner: 2,
  resumed_parent: 2,
  actor: 3,
  verifier: 4,
  subagent: 5,
  evaluation: 6
});

const enabled = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());
const parseRetryAfterMs = (value, { now = Date.now(), maximumMs = 60_000 } = {}) => {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  const resolved = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(raw) - Number(now);
  return Math.max(0, Math.min(Math.max(0, Number(maximumMs) || 0), resolved || 0));
};
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new ApiError(499, 'AGENT_MODEL_REQUEST_CANCELLED', { retryable: false }));
    return;
  }
  const onAbort = () => {
    clearTimeout(timer);
    reject(new ApiError(499, 'AGENT_MODEL_REQUEST_CANCELLED', { retryable: false }));
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, Math.max(0, ms));
  timer.unref?.();
  signal?.addEventListener('abort', onAbort, { once: true });
});

const schedulerIntervalMs = (env = process.env, providerKey = '') => {
  const normalizedProviderKey = String(providerKey || '').trim().toLowerCase();
  const cloudflare = normalizedProviderKey
    ? normalizedProviderKey.startsWith('cloudflare:')
    : String(env.AGENT_MODEL_PROVIDER || '').trim().toLowerCase() === 'cloudflare';
  const floor = Math.max(0, Number.parseInt(String(
    cloudflare
      ? env.AGENT_CLOUDFLARE_MIN_INTERVAL_MS || '0'
      : env.AGENT_SILICONFLOW_MIN_INTERVAL_MS || '6500'
  ), 10) || 0);
  const rpm = Math.max(1, Math.min(cloudflare ? 120 : 600, Number.parseInt(String(
    cloudflare
      ? env.AGENT_CLOUDFLARE_REQUESTS_PER_MINUTE || '30'
      : env.AGENT_SILICONFLOW_REQUESTS_PER_MINUTE || '9'
  ), 10) || (cloudflare ? 30 : 9)));
  return Math.max(floor, Math.ceil(60_000 / rpm));
};

const createScheduledChatGenerate = ({
  scheduler = null,
  chatGenerate,
  defaultPriority = 'actor'
} = {}) => {
  if (typeof chatGenerate !== 'function') {
    throw new TypeError('AGENT_SCHEDULED_CHAT_GENERATE_REQUIRED');
  }
  return async (input = {}) => {
    if (!scheduler) return chatGenerate(input);
    const slot = await scheduler.acquire({
      priority: input.schedulerPriority || defaultPriority,
      signal: input.signal || null
    });
    return chatGenerate({
      ...input,
      skipRateGate: slot.mode === 'postgres-v1' ? true : input.skipRateGate
    });
  };
};

const createProviderScheduler = ({ pool, env = process.env, providerKey = 'siliconflow:qwen3-8b' } = {}) => {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('AGENT_PROVIDER_SCHEDULER_POOL_REQUIRED');
  }
  const intervalMs = schedulerIntervalMs(env, providerKey);
  const requestTtlMs = Math.max(30_000, Math.min(
    10 * 60_000,
    Number.parseInt(String(env.AGENT_PROVIDER_REQUEST_TTL_MS || '600000'), 10) || 600_000
  ));

  const cancel = async (requestId, status = 'cancelled') => {
    await pool.query(
      `UPDATE agent_provider_requests
          SET status=$2,updated_at=clock_timestamp()
        WHERE id=$1 AND status='queued'`,
      [requestId, status]
    ).catch(() => {});
  };

  const defer = async (delayMs) => {
    if (!enabled(env.AGENT_PROVIDER_SCHEDULER_ENABLED)) return 0;
    const boundedDelayMs = Math.max(0, Math.min(requestTtlMs, Number(delayMs) || 0));
    if (!boundedDelayMs) return 0;
    await pool.query(
      `INSERT INTO agent_provider_scheduler (provider_key)
       VALUES ($1) ON CONFLICT (provider_key) DO NOTHING`,
      [providerKey]
    );
    await pool.query(
      `UPDATE agent_provider_scheduler
          SET next_available_at=GREATEST(
                next_available_at,
                clock_timestamp()+($2::text || ' milliseconds')::interval
              ),
              updated_at=clock_timestamp()
        WHERE provider_key=$1`,
      [providerKey, boundedDelayMs]
    );
    return boundedDelayMs;
  };

  const acquire = async ({ priority = 'actor', signal = null } = {}) => {
    if (!enabled(env.AGENT_PROVIDER_SCHEDULER_ENABLED)) {
      return { requestId: null, queueWaitMs: 0, intervalMs, mode: 'process-local' };
    }
    const priorityValue = PRIORITIES[priority] || PRIORITIES.actor;
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    await pool.query(
      `INSERT INTO agent_provider_scheduler (provider_key)
       VALUES ($1) ON CONFLICT (provider_key) DO NOTHING`,
      [providerKey]
    );
    await pool.query(
      `INSERT INTO agent_provider_requests
        (id,provider_key,priority,expires_at)
       VALUES ($1,$2,$3,clock_timestamp()+($4::text || ' milliseconds')::interval)`,
      [requestId, providerKey, priorityValue, requestTtlMs]
    );

    try {
      while (true) {
        if (signal?.aborted) {
          await cancel(requestId);
          throw new ApiError(499, 'AGENT_MODEL_REQUEST_CANCELLED', { retryable: false });
        }
        const client = await pool.connect();
        let decision = null;
        try {
          await client.query('BEGIN');
          await client.query(
            `UPDATE agent_provider_requests
                SET status='expired',updated_at=clock_timestamp()
              WHERE provider_key=$1 AND status='queued' AND expires_at<=clock_timestamp()`,
            [providerKey]
          );
          const scheduler = await client.query(
            `SELECT *,
                    next_available_at<=clock_timestamp() AS available,
                    GREATEST(50,LEAST(1000,
                      ceil(extract(epoch FROM (next_available_at-clock_timestamp()))*1000)
                    ))::integer AS wait_ms
               FROM agent_provider_scheduler
              WHERE provider_key=$1 FOR UPDATE`,
            [providerKey]
          );
          const head = await client.query(
            `SELECT id,priority,
                    GREATEST(
                      1,
                      priority-FLOOR(EXTRACT(EPOCH FROM (clock_timestamp()-requested_at))/30)::integer
                    ) AS effective_priority
               FROM agent_provider_requests
              WHERE provider_key=$1 AND status='queued'
              ORDER BY
                CASE WHEN priority=6 AND EXISTS(
                  SELECT 1 FROM agent_provider_requests interactive
                   WHERE interactive.provider_key=$1 AND interactive.status='queued'
                     AND interactive.priority<6
                ) THEN 1 ELSE 0 END,
                effective_priority,requested_at,id
              LIMIT 1`,
            [providerKey]
          );
          let evaluationBlocked = false;
          if (Number(head.rows[0]?.priority || 0) === PRIORITIES.evaluation) {
            const active = await client.query(
              `SELECT 1 FROM agent_model_calls
                WHERE outcome='running' AND phase<>'evaluation'
                  AND created_at>clock_timestamp()-interval '10 minutes'
                LIMIT 1`
            );
            evaluationBlocked = active.rowCount > 0;
          }
          if (
            String(head.rows[0]?.id || '') === requestId &&
            scheduler.rows[0]?.available === true &&
            !evaluationBlocked
          ) {
            await client.query(
              `UPDATE agent_provider_requests
                  SET status='granted',granted_at=clock_timestamp(),updated_at=clock_timestamp()
                WHERE id=$1 AND status='queued'`,
              [requestId]
            );
            await client.query(
              `UPDATE agent_provider_scheduler
                  SET next_available_at=clock_timestamp()+($2::text || ' milliseconds')::interval,
                      updated_at=clock_timestamp()
                WHERE provider_key=$1`,
              [providerKey, intervalMs]
            );
            decision = { granted: true };
          } else {
            const own = await client.query(
              'SELECT status,expires_at FROM agent_provider_requests WHERE id=$1',
              [requestId]
            );
            const status = String(own.rows[0]?.status || 'expired');
            if (status !== 'queued') {
              decision = { error: status };
            } else {
              decision = { waitMs: Number(scheduler.rows[0]?.wait_ms || 250) };
            }
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
        if (decision.granted) {
          return {
            requestId,
            queueWaitMs: Math.max(0, Date.now() - startedAt),
            intervalMs,
            mode: 'postgres-v1'
          };
        }
        if (decision.error) {
          throw new ApiError(503, 'AGENT_PROVIDER_SCHEDULER_EXPIRED', { retryable: true });
        }
        await sleep(decision.waitMs, signal);
      }
    } catch (error) {
      await cancel(requestId);
      throw error;
    }
  };

  const cleanup = async () => {
    await pool.query(
      `UPDATE agent_provider_requests
          SET status='expired',updated_at=clock_timestamp()
        WHERE status='queued' AND expires_at<=clock_timestamp()`
    );
    const result = await pool.query(
      `DELETE FROM agent_provider_requests
        WHERE status<>'queued' AND updated_at<clock_timestamp()-interval '7 days'`
    );
    return Number(result.rowCount || 0);
  };

  const readiness = async () => {
    if (!enabled(env.AGENT_PROVIDER_SCHEDULER_ENABLED)) {
      return { ok: true, enabled: false, mode: 'process-local', intervalMs };
    }
    try {
      const result = await pool.query(
        `SELECT to_regclass('public.agent_provider_scheduler') IS NOT NULL AS has_scheduler,
                to_regclass('public.agent_provider_requests') IS NOT NULL AS has_requests`
      );
      return {
        ok: result.rows[0]?.has_scheduler === true && result.rows[0]?.has_requests === true,
        enabled: true,
        mode: 'postgres-v1',
        intervalMs
      };
    } catch (error) {
      return { ok: false, enabled: true, mode: 'postgres-v1', code: String(error?.code || 'DATABASE_ERROR') };
    }
  };

  return { acquire, cancel, cleanup, defer, readiness, intervalMs, providerKey };
};

const cleanText = (value, maximum) => {
  const text = String(value || '').trim();
  return text ? text.slice(0, maximum) : null;
};

const contentFreeMetrics = (value) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(input).slice(0, 32).flatMap(([rawKey, entry]) => {
    const key = String(rawKey || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80);
    if (!key) return [];
    if (typeof entry === 'boolean' || entry === null) return [[key, entry]];
    if (typeof entry === 'number' && Number.isFinite(entry)) return [[key, entry]];
    return [];
  }));
};

const createModelCallService = ({
  pool,
  retentionDays = 30,
  env = process.env,
  testController = null
} = {}) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('AGENT_MODEL_CALL_POOL_REQUIRED');
  }
  if (testController && String(env.NODE_ENV || '').trim() !== 'test') {
    throw new TypeError('AGENT_RUNTIME_TEST_CONTROLLER_FORBIDDEN');
  }
  const start = async ({
    runId = null,
    subagentId = null,
    conversationId = null,
    userId = null,
    provider,
    modelName,
    phase,
    turn = 0,
    attempt = 1,
    promptProfile = null,
    promptHash = null,
    skillIds = [],
    thinkingEnabled = false,
    estimatedInputTokens = 0,
    workerId = null,
    leaseEpoch = null,
    intent = null,
    reservationKey = null
  }) => {
    await testController?.hit('before_intent', { runId, phase, workerId, leaseEpoch });
    const id = crypto.randomUUID();
    const normalizedPromptHash = promptHash ? String(promptHash).toLowerCase() : '';
    if (normalizedPromptHash && !/^[a-f0-9]{64}$/.test(normalizedPromptHash)) {
      throw new TypeError('AGENT_MODEL_CALL_PROMPT_HASH_INVALID');
    }
    const values = [
      id, runId, subagentId, conversationId, userId,
      cleanText(provider, 80), cleanText(modelName, 160), phase,
      Math.max(0, Number(turn) || 0), Math.max(1, Number(attempt) || 1),
      cleanText(promptProfile, 80),
      normalizedPromptHash ? Buffer.from(normalizedPromptHash, 'hex') : null,
      JSON.stringify((Array.isArray(skillIds) ? skillIds : []).map((entry) => String(entry).slice(0, 80))),
      thinkingEnabled === true,
      Math.ceil(Math.max(0, Number(estimatedInputTokens) || 0)),
      Math.max(1, Math.min(30, Number(retentionDays) || 30))
    ];
    const insertCall = (queryable) => queryable.query(
      `INSERT INTO agent_model_calls
        (id,run_id,subagent_id,conversation_id,user_id,provider,model_name,phase,turn,attempt,
         prompt_profile,prompt_hash,skill_ids,thinking_enabled,estimated_input_tokens,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         clock_timestamp()+($16::text || ' days')::interval)`,
      values
    );
    const durable = Boolean(
      runId && cleanText(workerId, 160) &&
      Number.isSafeInteger(Number(leaseEpoch)) && Number(leaseEpoch) > 0
    );
    if (!durable) {
      await insertCall(pool);
      await testController?.hit('after_intent', { callId: id, runId, phase });
      return { id, runId, workerId: null, leaseEpoch: null, startedAt: Date.now(), durable: false };
    }
    const encrypted = encryptAgentPayload({
      runId,
      payloadId: id,
      kind: 'model_call_intent',
      value: intent && typeof intent === 'object' ? intent : {
        phase,
        turn,
        promptHash: normalizedPromptHash || null
      },
      env
    });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lease = await client.query(
        `SELECT 1 FROM agent_runs
          WHERE id=$1 AND worker_id=$2 AND lease_epoch=$3
            AND lease_expires_at>clock_timestamp()
            AND status IN ('provisioning','running','verifying')
          FOR UPDATE`,
        [runId, cleanText(workerId, 160), Number(leaseEpoch)]
      );
      if (!lease.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
      await insertCall(client);
      await client.query(
        `INSERT INTO agent_model_call_receipts
          (id,run_id,worker_id,lease_epoch,algorithm,key_version,intent_iv,intent_auth_tag,
           intent_ciphertext,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
           clock_timestamp()+($10::text || ' days')::interval)`,
        [
          id, runId, cleanText(workerId, 160), Number(leaseEpoch), encrypted.algorithm, encrypted.keyVersion,
          encrypted.iv, encrypted.authTag, encrypted.ciphertext,
          Math.max(1, Math.min(30, Number(retentionDays) || 30))
        ]
      );
      if (cleanText(reservationKey, 200)) {
        const bound = await client.query(
          `UPDATE agent_budget_reservations
              SET model_call_id=$3,updated_at=clock_timestamp()
            WHERE run_id=$1 AND reservation_key=$2 AND state='reserved'
              AND model_call_id IS NULL
            RETURNING id`,
          [runId, cleanText(reservationKey, 200), id]
        );
        if (!bound.rowCount) {
          throw new ApiError(409, 'AGENT_MODEL_BUDGET_BINDING_CONFLICT', {
            retryable: false
          });
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await testController?.hit('after_intent', { callId: id, runId, phase, leaseEpoch });
    return {
      id,
      runId,
      workerId: cleanText(workerId, 160),
      leaseEpoch: Number(leaseEpoch),
      startedAt: Date.now(),
      durable: true
    };
  };

  const transitionReceipt = async (call, { from, to, response = null } = {}) => {
    if (!call?.durable) return true;
    const fields = {
      dispatched: 'dispatched_at=clock_timestamp()',
      received: 'received_at=clock_timestamp()',
      consumed: 'consumed_at=clock_timestamp()',
      ambiguous: 'ambiguous_at=clock_timestamp()'
    };
    const extra = fields[to];
    if (!extra) throw new TypeError('AGENT_MODEL_RECEIPT_STATE_INVALID');
    let encrypted = null;
    if (response !== null) {
      encrypted = encryptAgentPayload({
        runId: call.runId,
        payloadId: call.id,
        kind: 'model_call_response',
        value: response,
        env
      });
    }
    const result = await pool.query(
      `UPDATE agent_model_call_receipts receipt
          SET state=$4,${extra},
              response_iv=COALESCE($5,response_iv),
              response_auth_tag=COALESCE($6,response_auth_tag),
              response_ciphertext=COALESCE($7,response_ciphertext),
              updated_at=clock_timestamp()
         FROM agent_runs run
        WHERE receipt.id=$1 AND receipt.run_id=$2 AND receipt.lease_epoch=$3
          AND receipt.state=$8
          AND run.id=receipt.run_id AND run.lease_epoch=$3
          AND receipt.worker_id=$9 AND run.worker_id=$9
          AND run.lease_expires_at>clock_timestamp()
        RETURNING receipt.id`,
      [
        call.id, call.runId, call.leaseEpoch, to,
        encrypted?.iv || null, encrypted?.authTag || null, encrypted?.ciphertext || null,
        from, call.workerId
      ]
    );
    if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
    return true;
  };

  const markDispatched = (call) => transitionReceipt(call, { from: 'queued', to: 'dispatched' });
  const markReceived = async (call, response) => {
    const received = await transitionReceipt(call, {
      from: 'dispatched',
      to: 'received',
      response
    });
    await testController?.hit('after_receipt', {
      callId: call?.id,
      runId: call?.runId,
      leaseEpoch: call?.leaseEpoch
    });
    return received;
  };
  const markAmbiguous = (call) => transitionReceipt(call, {
    from: 'dispatched',
    to: 'ambiguous'
  });

  const finish = async (call, {
    outcome,
    inputTokens = 0,
    outputTokens = 0,
    queueWaitMs = 0,
    selectedTool = null,
    errorCode = null
  } = {}) => {
    if (!call?.id) return;
    const values = [
      call.id,
      Math.ceil(Math.max(0, Number(inputTokens) || 0)),
      Math.ceil(Math.max(0, Number(outputTokens) || 0)),
      Math.ceil(Math.max(0, Number(queueWaitMs) || 0)),
      Math.ceil(Math.max(0, Date.now() - Number(call.startedAt || Date.now()))),
      cleanText(selectedTool, 100),
      ['succeeded', 'failed', 'cancelled'].includes(outcome) ? outcome : 'failed',
      cleanText(errorCode, 100)
    ];
    if (!call.durable) {
      await pool.query(
        `UPDATE agent_model_calls SET
           input_tokens=$2,output_tokens=$3,queue_wait_ms=$4,latency_ms=$5,
           selected_tool=$6,outcome=$7,error_code=$8,finished_at=clock_timestamp()
         WHERE id=$1`,
        values
      );
      return true;
    }
    const result = await pool.query(
      `UPDATE agent_model_calls call SET
         input_tokens=$2,output_tokens=$3,queue_wait_ms=$4,latency_ms=$5,
         selected_tool=$6,outcome=$7,error_code=$8,finished_at=clock_timestamp()
        FROM agent_runs run
       WHERE call.id=$1 AND call.run_id=$9
         AND run.id=call.run_id AND run.worker_id=$10 AND run.lease_epoch=$11
         AND run.lease_expires_at>clock_timestamp()
         AND run.status IN ('provisioning','running','verifying')
       RETURNING call.id`,
      [
        ...values,
        call.runId,
        call.workerId,
        Number(call.leaseEpoch)
      ]
    );
    if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
    return true;
  };

  const consume = async (call) => {
    if (!call?.durable) return true;
    const result = await pool.query(
      `UPDATE agent_model_call_receipts receipt
          SET state='consumed',consumed_at=clock_timestamp(),updated_at=clock_timestamp()
         FROM agent_runs run
        WHERE receipt.id=$1 AND receipt.run_id=$2 AND receipt.lease_epoch=$3
          AND receipt.state='received'
          AND run.id=receipt.run_id AND run.lease_epoch=$3
          AND receipt.worker_id=$4 AND run.worker_id=$4
          AND run.lease_expires_at>clock_timestamp()
        RETURNING receipt.id`,
      [call.id, call.runId, call.leaseEpoch, call.workerId]
    );
    if (!result.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
    return true;
  };

  const loadReceipt = async ({ runId, callId }) => {
    const result = await pool.query(
      `SELECT receipt.* FROM agent_model_call_receipts receipt
        WHERE receipt.run_id=$1 AND receipt.id=$2`,
      [runId, callId]
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      state: row.state,
      leaseEpoch: Number(row.lease_epoch || 0),
      intent: decryptAgentPayload({
        runId,
        payloadId: callId,
        kind: 'model_call_intent',
        record: {
          algorithm: row.algorithm,
          iv: row.intent_iv,
          auth_tag: row.intent_auth_tag,
          ciphertext: row.intent_ciphertext
        },
        env
      }),
      response: row.response_ciphertext ? decryptAgentPayload({
        runId,
        payloadId: callId,
        kind: 'model_call_response',
        record: {
          algorithm: row.algorithm,
          iv: row.response_iv,
          auth_tag: row.response_auth_tag,
          ciphertext: row.response_ciphertext
        },
        env
      }) : null
    };
  };

  const adoptLatestReceived = async ({ runId, workerId, leaseEpoch, subagentId = null }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const run = await client.query(
        `SELECT 1 FROM agent_runs
          WHERE id=$1 AND worker_id=$2 AND lease_epoch=$3
            AND lease_expires_at>clock_timestamp()
            AND status IN ('provisioning','running','verifying')
          FOR UPDATE`,
        [runId, cleanText(workerId, 160), Number(leaseEpoch)]
      );
      if (!run.rowCount) throw new ApiError(409, 'AGENT_LEASE_LOST');
      const selected = await client.query(
        `SELECT receipt.*,reservation.reservation_key
           FROM agent_model_call_receipts receipt
           LEFT JOIN agent_budget_reservations reservation
             ON reservation.model_call_id=receipt.id
          WHERE receipt.run_id=$1 AND receipt.state='received'
            AND EXISTS (
              SELECT 1 FROM agent_model_calls call
               WHERE call.id=receipt.id
                 AND call.subagent_id IS NOT DISTINCT FROM $2::uuid
            )
          ORDER BY receipt.received_at DESC
          LIMIT 1
          FOR UPDATE OF receipt`,
        [runId, subagentId]
      );
      if (!selected.rowCount) {
        await client.query('COMMIT');
        return null;
      }
      const row = selected.rows[0];
      await client.query(
        `UPDATE agent_model_call_receipts
            SET worker_id=$2,lease_epoch=$3,updated_at=clock_timestamp()
          WHERE id=$1`,
        [row.id, cleanText(workerId, 160), Number(leaseEpoch)]
      );
      await client.query('COMMIT');
      const call = {
        id: row.id,
        runId,
        workerId: cleanText(workerId, 160),
        leaseEpoch: Number(leaseEpoch),
        startedAt: Date.now(),
        durable: true
      };
      return {
        call,
        reservationKey: row.reservation_key || null,
        intent: decryptAgentPayload({
          runId,
          payloadId: row.id,
          kind: 'model_call_intent',
          record: {
            algorithm: row.algorithm,
            iv: row.intent_iv,
            auth_tag: row.intent_auth_tag,
            ciphertext: row.intent_ciphertext
          },
          env
        }),
        response: decryptAgentPayload({
          runId,
          payloadId: row.id,
          kind: 'model_call_response',
          record: {
            algorithm: row.algorithm,
            iv: row.response_iv,
            auth_tag: row.response_auth_tag,
            ciphertext: row.response_ciphertext
          },
          env
        })
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const recordQualityCheck = async ({ runId = null, checkKind, status, score = null, codes = [], metrics = {} }) => {
    await pool.query(
      `INSERT INTO agent_quality_checks (run_id,check_kind,status,score,codes,metrics)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        runId,
        cleanText(checkKind, 100),
        status,
        score === null ? null : Math.max(0, Math.min(100, Number(score) || 0)),
        JSON.stringify((Array.isArray(codes) ? codes : []).map((code) => String(code).slice(0, 100))),
        JSON.stringify(contentFreeMetrics(metrics))
      ]
    );
  };

  const summary = async ({ days = 7 } = {}) => {
    const boundedDays = Math.max(1, Math.min(30, Number(days) || 7));
    const [
      callsResult,
      qualityResult,
      runsResult,
      schedulerResult,
      operationsResult,
      eventsResult,
      financialResult
    ] = await Promise.all([
      pool.query(
        `SELECT phase,outcome,count(*)::integer AS calls,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::integer AS median_latency_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::integer AS p95_latency_ms,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY queue_wait_ms)::integer AS median_queue_wait_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY queue_wait_ms)::integer AS p95_queue_wait_ms,
              COALESCE(sum(input_tokens),0)::bigint AS input_tokens,
              COALESCE(sum(output_tokens),0)::bigint AS output_tokens
         FROM agent_model_calls
        WHERE created_at>=clock_timestamp()-($1::text || ' days')::interval
        GROUP BY phase,outcome ORDER BY phase,outcome`,
        [boundedDays]
      ),
      pool.query(
        `SELECT check_kind,status,count(*)::integer AS checks,
                round(avg(score)::numeric,2) AS average_score
           FROM agent_quality_checks
          WHERE created_at>=clock_timestamp()-($1::text || ' days')::interval
          GROUP BY check_kind,status ORDER BY check_kind,status`,
        [boundedDays]
      ),
      pool.query(
        `SELECT runtime_version,status,count(*)::integer AS runs,
                COALESCE(sum(charged_credits),0)::bigint AS charged_credits,
                COALESCE(sum(refunded_credits),0)::bigint AS refunded_credits
           FROM agent_runs
          WHERE created_at>=clock_timestamp()-($1::text || ' days')::interval
          GROUP BY runtime_version,status ORDER BY runtime_version,status`,
        [boundedDays]
      ),
      pool.query(
        `SELECT provider_key,status,count(*)::integer AS requests
           FROM agent_provider_requests
          WHERE requested_at>=clock_timestamp()-($1::text || ' days')::interval
          GROUP BY provider_key,status ORDER BY provider_key,status`,
        [boundedDays]
      ),
      pool.query(
        `WITH eligible_runs AS (
           SELECT run.*,
             (SELECT min(step.finished_at)
                FROM agent_steps step
               WHERE step.run_id=run.id
                 AND step.status='succeeded'
                 AND step.tool_name IS NOT NULL
                 AND step.tool_name<>'update_plan') AS first_tool_at
             FROM agent_runs run
            WHERE run.created_at>=clock_timestamp()-($1::text || ' days')::interval
         ), first_calls AS (
           SELECT * FROM agent_model_calls
            WHERE created_at>=clock_timestamp()-($1::text || ' days')::interval
              AND phase IN ('router','planner','verifier') AND attempt=1
         )
         SELECT
           (SELECT COALESCE(avg(replan_count),0)::numeric FROM eligible_runs) AS average_plan_changes,
           (SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY replan_count),0)::numeric FROM eligible_runs) AS p95_plan_changes,
           (SELECT COALESCE(avg(EXTRACT(EPOCH FROM (first_tool_at-started_at))*1000),0)::numeric
              FROM eligible_runs WHERE first_tool_at IS NOT NULL AND started_at IS NOT NULL) AS average_first_tool_ms,
           (SELECT COALESCE(
              count(*) FILTER (WHERE outcome='succeeded')::numeric / NULLIF(count(*),0),0
            )::numeric FROM first_calls) AS first_schema_success_rate`,
        [boundedDays]
      ),
      pool.query(
        `SELECT
           count(*) FILTER (WHERE event_type='context.compacted')::integer AS context_compactions,
           count(*) FILTER (WHERE event_type='verification.repair_requested')::integer AS verifier_repairs,
           count(*) FILTER (WHERE event_type IN ('verification.passed','verification.failed'))::integer AS verifier_completions,
           count(*) FILTER (WHERE event_type='model.call.ambiguous')::integer AS ambiguous_calls,
           count(*) FILTER (WHERE event_type='run.lease_recovered')::integer AS lease_losses
         FROM agent_events
        WHERE created_at>=clock_timestamp()-($1::text || ' days')::interval`,
        [boundedDays]
      ),
      pool.query(
        `SELECT
           COALESCE(sum(charged_credits),0)::numeric AS user_charged,
           COALESCE(sum(estimated_credits_used+platform_overrun_credits),0)::numeric AS internal_cost,
           COALESCE(sum(platform_overrun_credits),0)::numeric AS platform_overrun
         FROM agent_runs
        WHERE created_at>=clock_timestamp()-($1::text || ' days')::interval`,
        [boundedDays]
      )
    ]);
    return {
      days: boundedDays,
      calls: callsResult.rows.map((row) => ({
        phase: row.phase,
        outcome: row.outcome,
        count: Number(row.calls || 0),
        medianLatencyMs: Number(row.median_latency_ms || 0),
        p95LatencyMs: Number(row.p95_latency_ms || 0),
        medianQueueWaitMs: Number(row.median_queue_wait_ms || 0),
        p95QueueWaitMs: Number(row.p95_queue_wait_ms || 0),
        inputTokens: Number(row.input_tokens || 0),
        outputTokens: Number(row.output_tokens || 0)
      })),
      quality: qualityResult.rows.map((row) => ({
        checkKind: row.check_kind,
        status: row.status,
        count: Number(row.checks || 0),
        averageScore: row.average_score === null ? null : Number(row.average_score)
      })),
      runs: runsResult.rows.map((row) => ({
        runtimeVersion: Number(row.runtime_version || 1),
        status: row.status,
        count: Number(row.runs || 0),
        chargedCredits: Number(row.charged_credits || 0),
        refundedCredits: Number(row.refunded_credits || 0)
      })),
      scheduler: schedulerResult.rows.map((row) => ({
        provider: row.provider_key,
        status: row.status,
        count: Number(row.requests || 0)
      })),
      operations: {
        averagePlanChanges: Number(operationsResult.rows[0]?.average_plan_changes || 0),
        p95PlanChanges: Number(operationsResult.rows[0]?.p95_plan_changes || 0),
        averageFirstEffectiveToolMs: Number(operationsResult.rows[0]?.average_first_tool_ms || 0),
        schemaFirstValidRate: Number(operationsResult.rows[0]?.first_schema_success_rate || 0)
      },
      recovery: {
        contextCompactions: Number(eventsResult.rows[0]?.context_compactions || 0),
        verifierRepairs: Number(eventsResult.rows[0]?.verifier_repairs || 0),
        verifierCompletions: Number(eventsResult.rows[0]?.verifier_completions || 0),
        verifierRepairRate: Number(eventsResult.rows[0]?.verifier_completions || 0) > 0
          ? Number(eventsResult.rows[0]?.verifier_repairs || 0) /
            Number(eventsResult.rows[0]?.verifier_completions || 1)
          : 0,
        leaseLosses: Number(eventsResult.rows[0]?.lease_losses || 0),
        ambiguousCalls: Number(eventsResult.rows[0]?.ambiguous_calls || 0)
      },
      financial: {
        userChargedCredits: Number(financialResult.rows[0]?.user_charged || 0),
        internalCostCredits: Number(financialResult.rows[0]?.internal_cost || 0),
        platformOverrunCredits: Number(financialResult.rows[0]?.platform_overrun || 0),
        platformSubsidyCredits: Math.max(
          0,
          Number(financialResult.rows[0]?.internal_cost || 0) -
            Number(financialResult.rows[0]?.user_charged || 0)
        )
      }
    };
  };

  const cleanupExpired = async ({ limit = 500 } = {}) => {
    const bounded = Math.max(1, Math.min(5000, Number(limit) || 500));
    const [calls, quality] = await Promise.all([
      pool.query(
        `DELETE FROM agent_model_calls
          WHERE id IN (
            SELECT call.id FROM agent_model_calls call
             LEFT JOIN agent_runs run ON run.id=call.run_id
             WHERE call.expires_at<=clock_timestamp()
               AND (call.run_id IS NULL OR run.status IN ('succeeded','failed','cancelled'))
             ORDER BY call.expires_at LIMIT $1
          )`,
        [bounded]
      ),
      pool.query(
        `DELETE FROM agent_quality_checks
          WHERE id IN (
            SELECT quality.id FROM agent_quality_checks quality
             LEFT JOIN agent_runs run ON run.id=quality.run_id
             WHERE quality.expires_at<=clock_timestamp()
               AND (quality.run_id IS NULL OR run.status IN ('succeeded','failed','cancelled'))
             ORDER BY quality.expires_at LIMIT $1
          )`,
        [bounded]
      )
    ]);
    return {
      modelCalls: Number(calls.rowCount || 0),
      qualityChecks: Number(quality.rowCount || 0)
    };
  };

  return {
    cleanupExpired,
    adoptLatestReceived,
    consume,
    finish,
    loadReceipt,
    markAmbiguous,
    markDispatched,
    markReceived,
    recordQualityCheck,
    start,
    summary
  };
};

module.exports = {
  PRIORITIES,
  contentFreeMetrics,
  createModelCallService,
  createProviderScheduler,
  createScheduledChatGenerate,
  parseRetryAfterMs,
  schedulerIntervalMs
};
