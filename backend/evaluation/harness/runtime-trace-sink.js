const crypto = require('node:crypto');

const SAFE_KEYS = new Set([
  'artifactCount', 'attempt', 'callId', 'component', 'credits', 'dispatchId', 'elapsedMs', 'inputTokens',
  'kind', 'leaseEpoch', 'maxTokens', 'model', 'ok', 'outputTokens', 'phase', 'point',
  'promptHash', 'provider', 'queueWaitMs', 'reservationKey', 'role', 'runId', 'runtimeVersion',
  'scenarioId', 'sequence', 'state', 'status', 'subagentId', 'thinkingEnabled', 'toolName',
  'userCohort', 'workerId'
]);

const boundedValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return String(value).slice(0, 240);
};

const sanitizeTraceData = (data = {}) => Object.fromEntries(
  Object.entries(data)
    .filter(([key]) => SAFE_KEYS.has(key))
    .map(([key, value]) => [key, boundedValue(value)])
    .filter(([, value]) => value !== null)
);

class RuntimeTraceSink {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.entries = [];
    this.nextSequence = 1;
  }

  record(type, data = {}) {
    const entry = Object.freeze({
      sequence: this.nextSequence++,
      type: String(type || '').slice(0, 100),
      at: new Date(this.now()).toISOString(),
      ...sanitizeTraceData(data)
    });
    this.entries.push(entry);
    return entry;
  }

  modelRequest(data) {
    return this.record('model.request', data);
  }

  toolCall(data) {
    return this.record('tool.call', data);
  }

  toolObservation(data) {
    return this.record('tool.observation', data);
  }

  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  digest() {
    return crypto.createHash('sha256')
      .update(JSON.stringify(this.snapshot()))
      .digest('hex');
  }

  assertProtocolInvariants({
    textModel = 'Qwen/Qwen3-8B',
    imageModel = 'Kwai-Kolors/Kolors',
    allowIncompleteToolCalls = false,
    subagentForbiddenTools = [
      'browser_dom', 'computer', 'generate_image', 'request_user_approval',
      'declare_artifact', 'github_api', 'google_drive_api'
    ]
  } = {}) {
    const calls = this.entries.filter((entry) => entry.type === 'tool.call');
    const observations = this.entries.filter((entry) => entry.type === 'tool.observation');
    const callIds = new Set();
    for (const call of calls) {
      if (!call.callId) throw new Error('AGENT_HARNESS_TOOL_CALL_ID_MISSING');
      if (callIds.has(call.callId)) {
        throw new Error(`AGENT_HARNESS_TOOL_CALL_DUPLICATE:${call.callId}`);
      }
      callIds.add(call.callId);
      const matches = observations.filter((entry) => entry.callId === call.callId);
      if (matches.length === 0 && allowIncompleteToolCalls === true) continue;
      if (matches.length !== 1) {
        throw new Error(`AGENT_HARNESS_TOOL_OBSERVATION_COUNT:${call.callId}:${matches.length}`);
      }
      if (matches[0].sequence <= call.sequence) {
        throw new Error(`AGENT_HARNESS_TOOL_OBSERVATION_ORDER:${call.callId}`);
      }
      if (call.role === 'subagent' && subagentForbiddenTools.includes(call.toolName)) {
        throw new Error(`AGENT_HARNESS_SUBAGENT_TOOL_FORBIDDEN:${call.toolName}`);
      }
    }
    for (const observation of observations) {
      if (!observation.callId || !callIds.has(observation.callId)) {
        throw new Error(`AGENT_HARNESS_ORPHAN_OBSERVATION:${observation.callId || 'missing'}`);
      }
    }
    for (const request of this.entries.filter((entry) => entry.type === 'model.request')) {
      if (request.model !== textModel) {
        throw new Error(`AGENT_HARNESS_TEXT_MODEL_INVALID:${request.model || 'missing'}`);
      }
      if (request.phase === 'actor' && request.thinkingEnabled === true) {
        throw new Error('AGENT_HARNESS_ACTOR_THINKING_FORBIDDEN');
      }
    }
    for (const image of this.entries.filter((entry) => entry.type === 'image.generated')) {
      if (image.model !== imageModel) {
        throw new Error(`AGENT_HARNESS_IMAGE_MODEL_INVALID:${image.model || 'missing'}`);
      }
    }
    return true;
  }
}

module.exports = {
  RuntimeTraceSink,
  sanitizeTraceData
};
