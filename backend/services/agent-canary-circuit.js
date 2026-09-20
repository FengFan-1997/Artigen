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

module.exports = {
  HARD_INCIDENT_CODES,
  createAgentCanaryCircuit,
  normalizeCode
};
