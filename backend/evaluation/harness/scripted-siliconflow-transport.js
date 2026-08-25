const crypto = require('node:crypto');
const { ApiError } = require('../../lib/api-error');

const jsonResponse = (body, { status = 200, headers = {} } = {}) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  }
);

const assistantBody = ({
  id,
  content = '',
  toolCalls = [],
  promptTokens = 80,
  completionTokens = 20
}) => ({
  id,
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {})
    },
    finish_reason: toolCalls.length ? 'tool_calls' : 'stop'
  }],
  usage: {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  }
});

const functionToolCall = ({ id, name, arguments: args = {} }) => ({
  id,
  type: 'function',
  function: {
    name,
    arguments: typeof args === 'string' ? args : JSON.stringify(args)
  }
});

const requestToolPairs = (messages) => {
  const calls = new Map();
  const outputs = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        const id = String(call?.id || '');
        if (!id) throw new Error('AGENT_HARNESS_REQUEST_TOOL_CALL_ID_MISSING');
        if (calls.has(id)) throw new Error(`AGENT_HARNESS_REQUEST_TOOL_CALL_DUPLICATE:${id}`);
        calls.set(id, call);
      }
    }
    if (message?.role === 'tool') {
      const id = String(message.tool_call_id || '');
      if (!id) throw new Error('AGENT_HARNESS_REQUEST_TOOL_OUTPUT_ID_MISSING');
      outputs.set(id, (outputs.get(id) || 0) + 1);
    }
  }
  for (const [id, count] of outputs) {
    if (!calls.has(id)) throw new Error(`AGENT_HARNESS_REQUEST_ORPHAN_TOOL_OUTPUT:${id}`);
    if (count !== 1) throw new Error(`AGENT_HARNESS_REQUEST_TOOL_OUTPUT_DUPLICATE:${id}`);
  }
  for (const id of calls.keys()) {
    if (outputs.get(id) !== 1) throw new Error(`AGENT_HARNESS_REQUEST_TOOL_OUTPUT_MISSING:${id}`);
  }
  return { calls, outputs };
};

const requestPromptHash = (body) => crypto.createHash('sha256')
  .update(JSON.stringify({
    messages: Array.isArray(body?.messages) ? body.messages : [],
    tools: Array.isArray(body?.tools) ? body.tools : []
  }))
  .digest('hex');

class ScriptedSiliconFlowTransport {
  constructor({ script = [], trace = null, controller = null, traceRequestObservations = true } = {}) {
    this.script = [...script];
    this.trace = trace;
    this.controller = controller;
    this.traceRequestObservations = traceRequestObservations !== false;
    this.requests = [];
    this.responseIndex = 0;
    this.tracedToolCalls = new Set();
    this.tracedToolOutputs = new Set();
  }

  push(...entries) {
    this.script.push(...entries);
    return this;
  }

  remaining() {
    return this.script.length;
  }

  assertDrained() {
    if (this.script.length) {
      throw new Error(`AGENT_HARNESS_PROVIDER_SCRIPT_REMAINING:${this.script.length}`);
    }
    return true;
  }

  fetch = async (url, init = {}) => {
    if (String(url) !== 'https://api.siliconflow.cn/v1/chat/completions') {
      throw new Error(`AGENT_HARNESS_PROVIDER_URL_INVALID:${String(url)}`);
    }
    const body = JSON.parse(String(init.body || '{}'));
    this.validateRequest(body);
    if (this.traceRequestObservations) this.traceRequestProtocol(body);
    this.requests.push(body);
    const phase = body.response_format?.type === 'json_object'
      ? (body.enable_thinking ? 'verifier' : 'structured')
      : 'actor';
    this.trace?.modelRequest({
      model: body.model,
      phase,
      thinkingEnabled: body.enable_thinking === true,
      promptHash: requestPromptHash(body),
      attempt: this.requests.length
    });
    await this.controller?.hit('after_dispatch', { phase });
    const matchedIndex = this.script.findIndex((entry) => (
      typeof entry?.matchRequest !== 'function' || entry.matchRequest(body, this.requests)
    ));
    const next = matchedIndex >= 0 ? this.script.splice(matchedIndex, 1)[0] : null;
    if (!next) throw new Error('AGENT_HARNESS_PROVIDER_SCRIPT_EXHAUSTED');
    if (typeof next.assertRequest === 'function') next.assertRequest(body, this.requests);
    if (next.throwCode) {
      throw new ApiError(Number(next.status || 502), next.throwCode, {
        retryable: next.retryable === true
      });
    }
    const status = Number(next.status || 200);
    const responseBody = next.body || assistantBody({
      id: next.id || `harness-response-${++this.responseIndex}`,
      content: next.content || '',
      toolCalls: next.toolCalls || [],
      promptTokens: next.promptTokens,
      completionTokens: next.completionTokens
    });
    await this.controller?.hit('after_provider_response', { phase, status });
    return jsonResponse(responseBody, {
      status,
      headers: next.headers || {}
    });
  };

  validateRequest(body) {
    if (body.model !== 'Qwen/Qwen3-8B') {
      throw new Error(`AGENT_HARNESS_PROVIDER_MODEL_INVALID:${body.model || 'missing'}`);
    }
    const tools = Array.isArray(body.tools) ? body.tools : [];
    if (
      (tools.length > 0 && body.parallel_tool_calls !== false) ||
      (body.parallel_tool_calls !== undefined && body.parallel_tool_calls !== false)
    ) {
      throw new Error('AGENT_HARNESS_PARALLEL_TOOL_CALLS_FORBIDDEN');
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) throw new Error('AGENT_HARNESS_PROVIDER_MESSAGES_REQUIRED');
    if (!Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 4096) {
      throw new Error(`AGENT_HARNESS_MAX_TOKENS_INVALID:${String(body.max_tokens)}`);
    }
    if (body.response_format && body.response_format.type !== 'json_object') {
      throw new Error('AGENT_HARNESS_RESPONSE_FORMAT_INVALID');
    }
    if (tools.length && body.enable_thinking !== false) {
      throw new Error('AGENT_HARNESS_ACTOR_THINKING_FORBIDDEN');
    }
    if (body.enable_thinking === true) {
      if (
        body.temperature !== 0.6 || body.top_p !== 0.95 ||
        body.top_k !== 20 || body.min_p !== 0
      ) {
        throw new Error('AGENT_HARNESS_THINKING_SAMPLING_INVALID');
      }
    } else if (tools.length) {
      const supportedActorProfile = (
        (body.temperature === 0.2 && body.top_p === 0.7) ||
        (body.temperature === 0.4 && body.top_p === 0.8)
      );
      if (!supportedActorProfile) throw new Error('AGENT_HARNESS_ACTOR_SAMPLING_INVALID');
    }
    requestToolPairs(messages);
    const names = tools.map((tool) => String(tool?.function?.name || '')).filter(Boolean);
    if (new Set(names).size !== names.length) {
      throw new Error('AGENT_HARNESS_TOOL_SCHEMA_DUPLICATE');
    }
    if (body.response_format?.type === 'json_object' && tools.length) {
      throw new Error('AGENT_HARNESS_STRUCTURED_STAGE_TOOL_FORBIDDEN');
    }
    const forcedTool = body.tool_choice?.function?.name;
    if (forcedTool && !names.includes(String(forcedTool))) {
      throw new Error(`AGENT_HARNESS_TOOL_CHOICE_NOT_EXPOSED:${String(forcedTool)}`);
    }
  }

  traceRequestProtocol(body) {
    for (const message of Array.isArray(body.messages) ? body.messages : []) {
      if (message?.role === 'assistant' && Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
          const callId = String(call?.id || '');
          if (!callId || this.tracedToolCalls.has(callId)) continue;
          this.tracedToolCalls.add(callId);
          this.trace?.toolCall({
            callId,
            phase: 'actor',
            role: 'parent',
            toolName: String(call?.function?.name || '')
          });
        }
      }
      if (message?.role !== 'tool') continue;
      const callId = String(message.tool_call_id || '');
      if (!callId || this.tracedToolOutputs.has(callId)) continue;
      this.tracedToolOutputs.add(callId);
      this.trace?.toolObservation({ callId, ok: true, toolName: String(message.name || '') });
    }
  }
}

module.exports = {
  ScriptedSiliconFlowTransport,
  assistantBody,
  functionToolCall,
  requestPromptHash,
  requestToolPairs
};
