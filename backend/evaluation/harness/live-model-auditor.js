const { AsyncLocalStorage } = require('node:async_hooks');

const {
  ScriptedSiliconFlowTransport,
  requestPromptHash
} = require('./scripted-siliconflow-transport');

const TEXT_MODEL = 'Qwen/Qwen3-8B';
const IMAGE_MODEL = 'Kwai-Kolors/Kolors';
const STAGE_LIMITS = Object.freeze({
  router: 1200,
  planner: 2048,
  actor: 1024,
  verifier: 2048,
  subagent: 1200,
  final_summary: 800
});
const SUBAGENT_FORBIDDEN_TOOLS = new Set([
  'browser_dom',
  'computer',
  'connector_request',
  'declare_artifact',
  'delegate_tasks',
  'generate_image',
  'request_user_approval'
]);

class LiveModelAuditor {
  constructor({
    trace,
    pool,
    campaignGuard = null,
    maxQwenCalls = 200,
    maxKolorsCalls = 16
  } = {}) {
    this.trace = trace;
    this.pool = pool;
    this.campaignGuard = campaignGuard;
    this.maxQwenCalls = Math.max(1, Number(maxQwenCalls) || 200);
    this.maxKolorsCalls = Math.max(1, Number(maxKolorsCalls) || 16);
    this.qwenCalls = 0;
    this.logicalQwenCalls = 0;
    this.kolorsCalls = 0;
    this.requests = [];
    this.kolors = [];
    this.protocol = new ScriptedSiliconFlowTransport({ trace });
    this.requestContext = new AsyncLocalStorage();
  }

  async runtimeVersion(runId) {
    if (!runId || !this.pool) return 1;
    const result = await this.pool.query(
      'SELECT runtime_version FROM agent_runs WHERE id=$1',
      [runId]
    );
    return Number(result.rows[0]?.runtime_version || 1);
  }

  async inspectQwenRequest(payload, metadata = {}) {
    this.logicalQwenCalls += 1;
    if (payload.model !== TEXT_MODEL) throw new Error('AGENT_LIVE_EVAL_TEXT_MODEL_INVALID');
    this.protocol.validateRequest(payload);
    this.protocol.traceRequestProtocol(payload);
    const phase = String(metadata.runtimeStage || metadata.phase || (
      payload.response_format?.type === 'json_object' ? 'planner' : 'actor'
    ));
    const requestedRuntimeVersion = Number(metadata.runtimeVersion);
    const runtimeVersion = [1, 2].includes(requestedRuntimeVersion)
      ? requestedRuntimeVersion
      : await this.runtimeVersion(metadata.runId);
    if (runtimeVersion === 2) this.assertV2Stage(payload, metadata, phase);
    const request = Object.freeze({
      sequence: this.logicalQwenCalls,
      runId: metadata.runId || null,
      runtimeVersion,
      phase,
      turn: Math.max(0, Number(metadata.turn || 0)),
      model: payload.model,
      thinkingEnabled: payload.enable_thinking === true,
      maxTokens: Number(payload.max_tokens || 0),
      promptHash: requestPromptHash(payload),
      toolNames: (Array.isArray(payload.tools) ? payload.tools : [])
        .map((tool) => String(tool?.function?.name || ''))
        .filter(Boolean)
    });
    this.requests.push(request);
    this.trace?.modelRequest({
      attempt: request.sequence,
      model: request.model,
      phase: request.phase,
      promptHash: request.promptHash,
      runId: request.runId,
      runtimeVersion,
      thinkingEnabled: request.thinkingEnabled,
      maxTokens: request.maxTokens
    });
    return request;
  }

  async runQwenRequest(payload, metadata, operation) {
    const inspected = await this.inspectQwenRequest(payload, metadata);
    return this.requestContext.run(inspected, operation);
  }

  wrapQwenFetch(fetchImpl) {
    if (typeof fetchImpl !== 'function') throw new TypeError('AGENT_LIVE_EVAL_FETCH_REQUIRED');
    return async (...inputArgs) => {
      const args = [...inputArgs];
      const url = String(args[0] || '');
      const options = { ...(args[1] || {}) };
      const isQwenDispatch = String(options.method || 'GET').toUpperCase() === 'POST' &&
        /\/chat\/completions(?:\?|$)/.test(url);
      if (!isQwenDispatch) return fetchImpl(...args);
      const context = this.requestContext.getStore() || {};
      const dispatch = this.campaignGuard
        ? await this.campaignGuard.reserveDispatch('qwen', { runId: context.runId || null })
        : { dispatchId: null, sequence: this.qwenCalls + 1 };
      this.qwenCalls += 1;
      if (this.qwenCalls > this.maxQwenCalls) {
        throw new Error('AGENT_LIVE_EVAL_QWEN_CALL_LIMIT');
      }
      const currentSignal = args[3] || options.signal || null;
      const signal = this.campaignGuard
        ? this.campaignGuard.combinedSignal(currentSignal)
        : currentSignal;
      if (args.length >= 4) args[3] = signal;
      else options.signal = signal;
      args[1] = options;
      this.trace?.record('model.provider_dispatch', {
        attempt: dispatch.sequence,
        dispatchId: dispatch.dispatchId,
        model: TEXT_MODEL,
        phase: context.phase || 'actor',
        runId: context.runId || null
      });
      return fetchImpl(...args);
    };
  }

  assertV2Stage(payload, metadata, phase) {
    if (payload.model !== TEXT_MODEL) throw new Error('AGENT_LIVE_EVAL_TEXT_MODEL_INVALID');
    const expectedLimit = STAGE_LIMITS[phase];
    if (expectedLimit && Number(payload.max_tokens) !== expectedLimit) {
      throw new Error(`AGENT_LIVE_EVAL_STAGE_TOKEN_LIMIT:${phase}:${payload.max_tokens}`);
    }
    if (
      ['planner', 'verifier'].includes(phase) &&
      payload.response_format?.type !== 'json_object'
    ) {
      throw new Error(`AGENT_LIVE_EVAL_STRUCTURED_FORMAT_MISSING:${phase}`);
    }
    if (
      ['router', 'planner', 'actor', 'verifier', 'subagent', 'final_summary'].includes(phase) &&
      String(metadata.promptHash || '') !== requestPromptHash(payload)
    ) {
      throw new Error(`AGENT_LIVE_EVAL_PROMPT_HASH_MISMATCH:${phase}`);
    }
    if (['actor', 'subagent', 'final_summary'].includes(phase) && payload.enable_thinking !== false) {
      throw new Error(`AGENT_LIVE_EVAL_TOOL_STAGE_THINKING:${phase}`);
    }
    if (
      ['router', 'planner', 'actor', 'verifier', 'subagent', 'final_summary'].includes(phase) &&
      !/^[a-f0-9]{64}$/i.test(String(metadata.promptHash || ''))
    ) {
      throw new Error(`AGENT_LIVE_EVAL_PROMPT_HASH_MISSING:${phase}`);
    }
    if (phase === 'subagent') {
      const exposed = (Array.isArray(payload.tools) ? payload.tools : [])
        .map((tool) => String(tool?.function?.name || ''))
        .filter((name) => SUBAGENT_FORBIDDEN_TOOLS.has(name));
      if (exposed.length) {
        throw new Error(`AGENT_LIVE_EVAL_SUBAGENT_TOOL_FORBIDDEN:${exposed.join(',')}`);
      }
    }
  }

  async inspectKolorsRequest(request = {}) {
    const dispatch = this.campaignGuard
      ? await this.campaignGuard.reserveDispatch('kolors', { runId: request.runId || null })
      : { dispatchId: null, sequence: this.kolorsCalls + 1 };
    this.kolorsCalls += 1;
    if (this.kolorsCalls > this.maxKolorsCalls) {
      throw new Error('AGENT_LIVE_EVAL_KOLORS_CALL_LIMIT');
    }
    const entry = Object.freeze({
      sequence: dispatch.sequence,
      dispatchId: dispatch.dispatchId,
      referenceCount: Array.isArray(request.references) ? request.references.length : 0,
      filename: String(request.filename || '').slice(0, 240)
    });
    if (entry.referenceCount > 1) throw new Error('AGENT_LIVE_EVAL_REFERENCE_LIMIT');
    this.kolors.push(entry);
    return entry;
  }

  inspectKolorsResponse(response = {}, request = {}) {
    if (String(response.model || '') !== IMAGE_MODEL) {
      throw new Error(`AGENT_LIVE_EVAL_IMAGE_MODEL_INVALID:${response.model || 'missing'}`);
    }
    this.trace?.record('image.generated', {
      attempt: this.kolorsCalls,
      credits: Number(response.costCredits || 0),
      model: response.model,
      ok: true,
      runId: request.runId || null
    });
    return response;
  }

  snapshot() {
    return Object.freeze({
      qwenCalls: this.qwenCalls,
      logicalQwenCalls: this.logicalQwenCalls,
      kolorsCalls: this.kolorsCalls,
      requests: this.requests.map((entry) => ({ ...entry })),
      images: this.kolors.map((entry) => ({ ...entry }))
    });
  }
}

module.exports = {
  IMAGE_MODEL,
  LiveModelAuditor,
  STAGE_LIMITS,
  SUBAGENT_FORBIDDEN_TOOLS,
  TEXT_MODEL
};
