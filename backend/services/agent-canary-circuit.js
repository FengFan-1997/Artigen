const { ApiError } = require('../lib/api-error');

const HARD_INCIDENT_CODES = new Set([
  'AGENT_BILLING_DUPLICATE',
  'AGENT_UNAUTHORIZED_EXTERNAL_WRITE',
  'AGENT_DELIVERY_UNVERIFIED',
  'AGENT_ARTIFACT_VERIFICATION_FAILED',
  'AGENT_VERIFICATION_INCOMPLETE',
  'AGENT_LEASE_LOST',
  'AGENT_RESERVATION_NOT_CONVERGED',
  'AGENT_HOLD_NOT_CONVERGED',
  'AGENT_PROVIDER_FALLBACK_LOOP',
  'AGENT_MODEL_CALL_AMBIGUOUS',
  'AGENT_IMAGE_CALL_AMBIGUOUS',
  'AGENT_TOOL_CALL_AMBIGUOUS'
]);

const normalizeCode = (value) => String(value || '').trim().toUpperCase().slice(0, 120);

const CIRCUIT_KEY = 'owner-canary';

const normalizeRow = (row = {}, enabled = true) => ({
  enabled: Boolean(enabled),
  open: Boolean(row.is_open),
  openedAt: row.opened_at ? new Date(row.opened_at).getTime() : null,
  openedBy: String(row.opened_by || '').slice(0, 120) || null,
  recoveredAt: row.recovered_at ? new Date(row.recovered_at).getTime() : null,
  recoveredBy: String(row.recovered_by || '').slice(0, 120) || null,
  incidents: Math.max(0, Number(row.incidents || 0)),
  ambiguousIncidents: Math.max(0, Number(row.ambiguous_incidents || 0)),
  lastCode: String(row.last_code || '').slice(0, 120) || null,
  lastRunId: String(row.last_run_id || '').slice(0, 120) || null
});

const snapshotFromState = (state) => ({
  enabled: Boolean(state.enabled),
  open: Boolean(state.open),
  openedAt: state.openedAt || null,
  openedBy: state.openedBy || null,
  recoveredAt: state.recoveredAt || null,
  recoveredBy: state.recoveredBy || null,
  incidents: state.incidents,
  ambiguousIncidents: state.ambiguousIncidents,
  lastCode: state.lastCode || null,
  lastRunId: state.lastRunId || null,
  manualRecoveryRequired: Boolean(state.open),
  storageReady: state.storageReady !== false
});

const createAgentCanaryCircuit = ({
  enabled = false,
  ambiguityThreshold = 3,
  now = () => Date.now()
} = {}) => {
  const state = {
    open: false,
    openedAt: 0,
    openedBy: '',
    incidents: 0,
    ambiguousIncidents: 0,
    lastCode: '',
    lastRunId: ''
  };
  const threshold = Math.max(1, Number(ambiguityThreshold) || 3);

  const snapshot = () => ({
    enabled: Boolean(enabled),
    open: Boolean(state.open),
    openedAt: state.openedAt || null,
    openedBy: state.openedBy || null,
    incidents: state.incidents,
    ambiguousIncidents: state.ambiguousIncidents,
    lastCode: state.lastCode || null,
    lastRunId: state.lastRunId || null,
    manualRecoveryRequired: Boolean(state.open)
  });

  const trip = ({ code, runId = '', source = 'automatic' } = {}) => {
    if (!enabled) return snapshot();
    state.open = true;
    state.openedAt = Number(now()) || Date.now();
    state.openedBy = String(source || 'automatic').slice(0, 80);
    state.lastCode = normalizeCode(code);
    state.lastRunId = String(runId || '').slice(0, 80);
    return snapshot();
  };

  const record = ({ code, runId = '' } = {}) => {
    if (!enabled) return snapshot();
    const normalized = normalizeCode(code);
    if (!HARD_INCIDENT_CODES.has(normalized)) return snapshot();
    state.incidents += 1;
    state.lastCode = normalized;
    state.lastRunId = String(runId || '').slice(0, 80);
    if (normalized.includes('AMBIGUOUS')) state.ambiguousIncidents += 1;
    if (!normalized.includes('AMBIGUOUS') || state.ambiguousIncidents >= threshold) {
      return trip({ code: normalized, runId, source: 'automatic' });
    }
    return snapshot();
  };

  const assertClosed = () => {
    if (!enabled || !state.open) return true;
    throw new ApiError(503, 'AGENT_CANARY_CIRCUIT_OPEN', {
      retryable: false,
      details: snapshot()
    });
  };

  const recover = ({ actor = '' } = {}) => {
    if (!enabled) return snapshot();
    if (!String(actor || '').trim()) {
      throw new ApiError(403, 'AGENT_CANARY_MANUAL_RECOVERY_REQUIRED', { retryable: false });
    }
    state.open = false;
    state.openedAt = 0;
    state.openedBy = '';
    state.ambiguousIncidents = 0;
    state.lastCode = '';
    state.lastRunId = '';
    return snapshot();
  };

  return Object.freeze({
    assertClosed,
    isOpen: () => Boolean(enabled && state.open),
    record,
    recover,
    snapshot,
    trip
  });
};

const createPersistentAgentCanaryCircuit = ({
  pool,
  enabled = false,
  ambiguityThreshold = 3,
  circuitKey = CIRCUIT_KEY,
  now = () => Date.now()
} = {}) => {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('AGENT_CANARY_CIRCUIT_POOL_REQUIRED');
  }
  const key = String(circuitKey || CIRCUIT_KEY).trim().slice(0, 80) || CIRCUIT_KEY;
  const threshold = Math.max(1, Number(ambiguityThreshold) || 3);
  const state = {
    enabled: Boolean(enabled),
    open: false,
    openedAt: null,
    openedBy: null,
    incidents: 0,
    ambiguousIncidents: 0,
    lastCode: null,
    lastRunId: null,
    storageReady: false
  };

  const withClient = async (work) => {
    const client = await pool.connect();
    try {
      return await work(client);
    } finally {
      client.release?.();
    }
  };

  const ensureRow = async (client) => {
    await client.query(
      `INSERT INTO agent_canary_circuit_state (circuit_key, enabled)
       VALUES ($1, $2)
       ON CONFLICT (circuit_key) DO UPDATE SET enabled=EXCLUDED.enabled`,
      [key, Boolean(enabled)]
    );
  };

  const applyRow = (row) => {
    Object.assign(state, normalizeRow(row, enabled), { storageReady: true });
    return snapshotFromState(state);
  };

  const ready = async () => {
    if (!enabled) {
      state.storageReady = true;
      return snapshotFromState(state);
    }
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await ensureRow(client);
        const result = await client.query(
          `SELECT is_open, opened_at, opened_by, recovered_at, recovered_by,
                  incidents, ambiguous_incidents, last_code, last_run_id
             FROM agent_canary_circuit_state
            WHERE circuit_key=$1
            FOR UPDATE`,
          [key]
        );
        await client.query('COMMIT');
        return applyRow(result.rows[0] || {});
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new ApiError(503, 'AGENT_CANARY_STATE_UNAVAILABLE', {
          retryable: true,
          details: { cause: String(error?.code || error?.message || 'database_error').slice(0, 120) }
        });
      }
    });
  };

  const assertClosed = async () => {
    if (!enabled) return true;
    if (!state.storageReady) await ready();
    if (state.open) {
      throw new ApiError(503, 'AGENT_CANARY_CIRCUIT_OPEN', {
        retryable: false,
        details: snapshotFromState(state)
      });
    }
    return true;
  };

  const trip = async ({ code, runId = '', source = 'automatic' } = {}) => {
    if (!enabled) return snapshotFromState(state);
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await ensureRow(client);
        const result = await client.query(
          `UPDATE agent_canary_circuit_state
              SET is_open=true, opened_at=to_timestamp($2 / 1000.0), opened_by=$3,
                  last_code=$4, last_run_id=$5, updated_at=now()
            WHERE circuit_key=$1
            RETURNING is_open, opened_at, opened_by, recovered_at, recovered_by,
                      incidents, ambiguous_incidents, last_code, last_run_id`,
          [key, Number(now()) || Date.now(), String(source || 'automatic').slice(0, 120),
            normalizeCode(code), String(runId || '').slice(0, 120)]
        );
        await client.query('COMMIT');
        return applyRow(result.rows[0] || {});
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new ApiError(503, 'AGENT_CANARY_STATE_UNAVAILABLE', { retryable: true });
      }
    });
  };

  const record = async ({ code, runId = '' } = {}) => {
    if (!enabled) return snapshotFromState(state);
    const normalized = normalizeCode(code);
    if (!HARD_INCIDENT_CODES.has(normalized)) return snapshotFromState(state);
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await ensureRow(client);
        const result = await client.query(
          `UPDATE agent_canary_circuit_state
              SET incidents=incidents+1,
                  ambiguous_incidents=ambiguous_incidents + CASE WHEN $2 LIKE '%AMBIGUOUS%' THEN 1 ELSE 0 END,
                  last_code=$2, last_run_id=$3, updated_at=now()
            WHERE circuit_key=$1
            RETURNING is_open, opened_at, opened_by, recovered_at, recovered_by,
                      incidents, ambiguous_incidents, last_code, last_run_id`,
          [key, normalized, String(runId || '').slice(0, 120)]
        );
        const row = result.rows[0] || {};
        const shouldOpen = !normalized.includes('AMBIGUOUS') ||
          Number(row.ambiguous_incidents || 0) >= threshold;
        let finalRow = row;
        if (shouldOpen && !row.is_open) {
          const opened = await client.query(
            `UPDATE agent_canary_circuit_state
                SET is_open=true, opened_at=to_timestamp($2 / 1000.0),
                    opened_by='automatic', updated_at=now()
              WHERE circuit_key=$1
              RETURNING is_open, opened_at, opened_by, incidents,
                        ambiguous_incidents, last_code, last_run_id`,
            [key, Number(now()) || Date.now()]
          );
          finalRow = opened.rows[0] || row;
        }
        await client.query('COMMIT');
        return applyRow(finalRow);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new ApiError(503, 'AGENT_CANARY_STATE_UNAVAILABLE', { retryable: true });
      }
    });
  };

  const recover = async ({ actor = '' } = {}) => {
    if (!enabled) return snapshotFromState(state);
    const normalizedActor = String(actor || '').trim().slice(0, 120);
    if (!normalizedActor) {
      throw new ApiError(403, 'AGENT_CANARY_MANUAL_RECOVERY_REQUIRED', { retryable: false });
    }
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await ensureRow(client);
        const result = await client.query(
          `UPDATE agent_canary_circuit_state
              SET is_open=false, opened_at=NULL, opened_by='', recovered_at=to_timestamp($3 / 1000.0),
                  recovered_by=$2,
                  ambiguous_incidents=0, last_code='', last_run_id='', updated_at=now()
            WHERE circuit_key=$1
            RETURNING is_open, opened_at, opened_by, recovered_at, recovered_by,
                      incidents, ambiguous_incidents, last_code, last_run_id`,
          [key, normalizedActor, Number(now()) || Date.now()]
        );
        await client.query('COMMIT');
        return applyRow(result.rows[0] || {});
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new ApiError(503, 'AGENT_CANARY_STATE_UNAVAILABLE', { retryable: true });
      }
    });
  };

  return Object.freeze({
    assertClosed,
    isOpen: () => Boolean(enabled && state.open),
    ready,
    record,
    recover,
    snapshot: () => snapshotFromState(state),
    trip
  });
};

module.exports = {
  CIRCUIT_KEY,
  HARD_INCIDENT_CODES,
  createAgentCanaryCircuit,
  createPersistentAgentCanaryCircuit,
  normalizeCode
};
