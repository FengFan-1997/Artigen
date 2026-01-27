import type { ChatMessage } from '../types';
import { buildApiUrl, getAuthToken, getUserId } from '../utils/user';
import { getPageContext } from '../utils/pageContext';
import { recordAiRequest, recordDiagnostic, updateAiRequest } from '../utils/diagnostics';
import { projectKnowledge } from '../data/projectKnowledge';
import logger from '../utils/logger';

const API_URL = buildApiUrl('/api/chat');
const USER_API_URL = buildApiUrl('/api/user');
const USAGE_INGEST_URL = buildApiUrl('/api/usage/ingest');

type AiRequestKind = 'chat' | 'reaction';
type AiTransport = 'auto' | 'proxy' | 'direct';
type AiRequestGroup = 'chat' | 'task' | 'background' | 'interaction' | 'idle' | 'reaction';

const SESSION_ID_KEY = 'agent_session_id_v1';
const PROJECT_ID_KEY = 'agent_project_id_v1';

type CachedValue = { value: string; expiresAt: number };
type InflightValue = { promise: Promise<string>; controller: AbortController; startedAt: number };
type ActiveGroupValue = { controller: AbortController; priority: number; startedAt: number };

const resolvedCache = new Map<string, CachedValue>();
const inflight = new Map<string, InflightValue>();
const groupControllers = new Map<string, AbortController>();
const activeGroups = new Map<string, ActiveGroupValue>();

const DEFAULT_GROUP_PRIORITIES: Record<AiRequestGroup, number> = {
  chat: 100,
  task: 90,
  background: 60,
  interaction: 50,
  reaction: 40,
  idle: 10
};

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TRANSPORT = ((import.meta.env.VITE_AGENT_AI_TRANSPORT || '') as string)
  .trim()
  .toLowerCase() as AiTransport;

const TRANSPORT_OVERRIDE_KEY = 'agent_ai_transport_override';

const safeJsonStringify = (v: any) => {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
};

const getOrCreateSessionId = () => {
  const make = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {}
  const created = make();
  try {
    window.sessionStorage.setItem(SESSION_ID_KEY, created);
  } catch {}
  return created;
};

const computeDefaultProjectId = () => {
  try {
    const host = String(window.location?.host || '').trim();
    if (host) return host;
  } catch {}
  return 'default';
};

const getOrCreateProjectId = () => {
  try {
    const existing = window.localStorage.getItem(PROJECT_ID_KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {}
  const created = computeDefaultProjectId();
  try {
    window.localStorage.setItem(PROJECT_ID_KEY, created);
  } catch {}
  return created;
};

const ingestUsage = async (payload: any) => {
  try {
    const token = getAuthToken();
    await fetch(USAGE_INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload || {})
    });
  } catch {}
};

const getTransportOverride = (): AiTransport | '' => {
  try {
    const v = window.localStorage.getItem(TRANSPORT_OVERRIDE_KEY) || '';
    const normalized = v.trim().toLowerCase();
    if (normalized === 'direct' || normalized === 'proxy') return normalized;
    return '';
  } catch {
    return '';
  }
};

const setTransportOverride = (v: AiTransport | '') => {
  try {
    if (!v) window.localStorage.removeItem(TRANSPORT_OVERRIDE_KEY);
    else window.localStorage.setItem(TRANSPORT_OVERRIDE_KEY, v);
  } catch {}
};

const resolveTransport = (): AiTransport => {
  const override = getTransportOverride();
  if (override === 'direct') {
    setTransportOverride('proxy');
    recordDiagnostic({
      kind: 'policy',
      level: 'warn',
      message: 'direct_transport_blocked',
      data: { override: 'direct' }
    });
  }
  if (REQUEST_TRANSPORT === 'direct') {
    recordDiagnostic({
      kind: 'policy',
      level: 'warn',
      message: 'direct_env_blocked',
      data: { env: 'VITE_AGENT_AI_TRANSPORT=direct' }
    });
  }
  return 'proxy';
};

const buildAgentContextKey = (agentContext: any) => {
  if (!agentContext || typeof agentContext !== 'object') return '';
  const keyObj = {
    trigger: agentContext.trigger,
    runtime: {
      lang: agentContext.runtime?.lang,
      modelId: agentContext.runtime?.modelId,
      agentType: agentContext.runtime?.agentType
    },
    character: {
      name: agentContext.character?.name
    },
    ai: {
      transport: resolveTransport()
    }
  };
  return safeJsonStringify(keyObj);
};

const buildRequestKey = (kind: AiRequestKind, message: string, agentContext: any) => {
  return `${kind}|${message}|${buildAgentContextKey(agentContext)}`;
};

const buildRequestKeyWithGroup = (
  group: string,
  kind: AiRequestKind,
  message: string,
  agentContext: any
) => {
  return `${group}|${buildRequestKey(kind, message, agentContext)}`;
};

const pruneCache = () => {
  const t = Date.now();
  for (const [k, v] of resolvedCache) {
    if (t >= v.expiresAt) resolvedCache.delete(k);
  }
  if (resolvedCache.size > 64) {
    const keys = Array.from(resolvedCache.keys());
    for (let i = 0; i < keys.length - 64; i++) resolvedCache.delete(keys[i]);
  }
  if (inflight.size > 16) {
    const entries = Array.from(inflight.entries()).sort((a, b) => a[1].startedAt - b[1].startedAt);
    for (let i = 0; i < entries.length - 16; i++) {
      const [k, v] = entries[i];
      try {
        v.controller.abort();
      } catch {}
      inflight.delete(k);
    }
  }
};

const getDefaultPriorityForGroup = (group: string) => {
  const g = (group || '').trim() as AiRequestGroup;
  if (g && Object.prototype.hasOwnProperty.call(DEFAULT_GROUP_PRIORITIES, g))
    return DEFAULT_GROUP_PRIORITIES[g];
  return 40;
};

const cancelGroup = (group: string) => {
  const controller = groupControllers.get(group);
  if (controller) {
    try {
      controller.abort();
    } catch {}
    groupControllers.delete(group);
  }
  activeGroups.delete(group);
  for (const [k, v] of inflight) {
    if (k.startsWith(`${group}|`)) {
      try {
        v.controller.abort();
      } catch {}
      inflight.delete(k);
    }
  }
};

const getMaxActivePriority = () => {
  let max = 0;
  for (const v of activeGroups.values()) {
    if (typeof v.priority === 'number' && v.priority > max) max = v.priority;
  }
  return max;
};

const buildDirectSystemPrompt = (input: {
  kind: AiRequestKind;
  message: string;
  agentContext?: any;
  pageContext?: any;
}) => {
  const ctx =
    input.agentContext && typeof input.agentContext === 'object' ? input.agentContext : null;
  const lang =
    typeof ctx?.runtime?.lang === 'string' && ctx.runtime.lang.trim()
      ? ctx.runtime.lang.trim()
      : 'zh';
  const personaName =
    (typeof ctx?.persona?.name === 'string' &&
      ctx.persona.name.trim() &&
      ctx.persona.name.trim()) ||
    (typeof ctx?.character?.name === 'string' &&
      ctx.character.name.trim() &&
      ctx.character.name.trim()) ||
    'Lumina';
  const personaRules =
    (typeof ctx?.persona?.rules === 'string' &&
      ctx.persona.rules.trim() &&
      ctx.persona.rules.trim()) ||
    '';
  const personaProfile =
    (typeof ctx?.persona?.profile === 'string' &&
      ctx.persona.profile.trim() &&
      ctx.persona.profile.trim()) ||
    '';
  const agentType =
    typeof ctx?.runtime?.agentType === 'string' ? ctx.runtime.agentType.trim().toLowerCase() : '';
  const trigger = typeof ctx?.trigger === 'string' ? ctx.trigger.trim().toLowerCase() : '';
  const mustIncludeAvatarPlan =
    input.kind === 'reaction' ||
    trigger === 'idle' ||
    trigger.startsWith('task') ||
    agentType === 'vrm';
  const allowedMotions = Array.isArray(ctx?.constraints?.allowedMotions)
    ? ctx.constraints.allowedMotions
    : [];
  const allowedExpressions = Array.isArray(ctx?.constraints?.allowedExpressions)
    ? ctx.constraints.allowedExpressions
    : [];

  const motionList = allowedMotions.length > 0 ? allowedMotions.join(', ') : '';
  const exprList = allowedExpressions.length > 0 ? allowedExpressions.join(', ') : '';

  const pageText =
    typeof input.pageContext === 'string'
      ? input.pageContext
      : safeJsonStringify(input.pageContext);
  const trimmedPage = pageText ? String(pageText).slice(0, 2200) : '';

  const responseRules =
    lang === 'en'
      ? [
          `Always reply as ${personaName}.`,
          'Preferred output: a single strict JSON object (no code fences, no extra text).',
          'JSON envelope schema: {"v":"1","text":"...","emotionTag":{"primary":"happy","intensity":0.6},"avatarPlan":[...],"plan":[...],"memoryFacts":[...],"lockMs":1200,"exprOverride":"smile"}.',
          'If you output the JSON envelope, do NOT append bracket emotion tags like "[HAPPY]".',
          'If you do NOT use the JSON envelope, then append at least one bracket emotion tag at the end like "[HAPPY]".',
          mustIncludeAvatarPlan
            ? 'You MUST include motion: either "avatarPlan" in the JSON envelope or a JSON array after the label "avatarPlan:" on its own line.'
            : 'If you want the avatar to move, include motion: either "avatarPlan" in the JSON envelope or a JSON array after the label "avatarPlan:" on its own line.',
          'If present, "avatarPlan" must be strict JSON and use only allowed motions/expressions.',
          'Keep avatarPlan steps short (1–6 steps).',
          'If present, "plan" must be safe and stay within current website origin.'
        ].join('\n- ')
      : [
          `始终以 ${personaName} 的口吻回复。`,
          '优先输出：单一严格 JSON 对象（不要代码块，不要夹杂任何其他文字）。',
          'JSON Envelope 结构：{"v":"1","text":"...","emotionTag":{"primary":"happy","intensity":0.6},"avatarPlan":[...],"plan":[...],"memoryFacts":[...],"lockMs":1200,"exprOverride":"smile"}。',
          '如果输出了 JSON Envelope，就不要再追加「[HAPPY]」这种括号情绪标签。',
          '如果没有用 JSON Envelope，才在回复末尾追加至少一个括号情绪标签，例如「…… [HAPPY]」。',
          mustIncludeAvatarPlan
            ? '必须输出动作：要么在 JSON Envelope 里带 "avatarPlan"，要么在单独一行输出「avatarPlan:」后面紧跟 JSON 数组。'
            : '需要动作时：要么在 JSON Envelope 里带 "avatarPlan"，要么在单独一行输出「avatarPlan:」后面紧跟 JSON 数组。',
          '只要有 avatarPlan，就必须是严格 JSON，只能使用允许的 motions/expressions。',
          'avatarPlan 步骤保持简短（1–6 步）。',
          '只要有 plan，就必须安全且不得跨域。'
        ].join('\n- ');

  const constraints =
    lang === 'en'
      ? `Allowed motions: ${motionList || '(not provided)'}\nAllowed expressions: ${exprList || '(not provided)'}`
      : `允许的动作 motions: ${motionList || '（未提供）'}\n允许的表情 expressions: ${exprList || '（未提供）'}`;

  const modeText =
    input.kind === 'reaction'
      ? lang === 'en'
        ? 'Mode: Reaction (fast, minimal text)'
        : '模式：Reaction（快速，仅简短）'
      : lang === 'en'
        ? 'Mode: Chat'
        : '模式：Chat';

  const personaBlock = personaProfile
    ? lang === 'en'
      ? `Persona Profile:\n${personaProfile}`
      : `人设（Profile）：\n${personaProfile}`
    : '';

  const personaRulesBlock = personaRules
    ? lang === 'en'
      ? `Persona Rules:\n${personaRules}`
      : `人设（Rules）：\n${personaRules}`
    : '';

  const pageBlock = trimmedPage
    ? lang === 'en'
      ? `Page context (may be noisy):\n${trimmedPage}`
      : `页面上下文（可能有噪声）：\n${trimmedPage}`
    : '';

  const summaryRaw =
    typeof ctx?.memory?.summary === 'string' && ctx.memory.summary.trim()
      ? ctx.memory.summary.trim()
      : '';
  const summary = summaryRaw ? summaryRaw.slice(-1200) : '';
  const summaryBlock = summary
    ? lang === 'en'
      ? `Memory summary:\n${summary}`
      : `记忆摘要：\n${summary}`
    : '';

  const factsList = Array.isArray(ctx?.memory?.facts) ? ctx.memory.facts : [];
  const factLines = factsList
    .map((f: any) =>
      typeof f?.text === 'string' ? f.text.trim() : typeof f === 'string' ? f.trim() : ''
    )
    .filter((x: string) => x && x.trim())
    .slice(-18)
    .map((x: string) => `- ${x.slice(0, 180)}`);
  const factsBlock =
    factLines.length > 0
      ? lang === 'en'
        ? `Long-term facts (important):\n${factLines.join('\n')}`
        : `长期要点（重要）：\n${factLines.join('\n')}`
      : '';

  const chatItems = Array.isArray(ctx?.memory?.recentChat) ? ctx.memory.recentChat : [];
  const chatLines = chatItems
    .slice(-10)
    .map((m: any) => {
      const role = m?.role === 'agent' ? 'A' : 'U';
      const t = typeof m?.text === 'string' ? m.text.trim() : '';
      return t ? `${role}: ${t.slice(0, 220)}` : '';
    })
    .filter(Boolean);
  const recentChatBlock =
    chatLines.length > 0
      ? lang === 'en'
        ? `Recent chat:\n${chatLines.join('\n')}`
        : `近期对话：\n${chatLines.join('\n')}`
      : '';

  const eventItems = Array.isArray(ctx?.memory?.recentEvents) ? ctx.memory.recentEvents : [];
  const eventLines = eventItems
    .slice(-10)
    .map((e: any) => {
      const type = typeof e?.type === 'string' && e.type.trim() ? e.type.trim() : 'event';
      const t = typeof e?.text === 'string' ? e.text.trim() : '';
      return t ? `- (${type}) ${t.slice(0, 220)}` : '';
    })
    .filter(Boolean);
  const recentEventsBlock =
    eventLines.length > 0
      ? lang === 'en'
        ? `Recent events:\n${eventLines.join('\n')}`
        : `近期事件：\n${eventLines.join('\n')}`
      : '';

  return [
    modeText,
    personaBlock,
    personaRulesBlock,
    factsBlock,
    summaryBlock,
    recentChatBlock,
    recentEventsBlock,
    pageBlock,
    constraints,
    `Rules:\n- ${responseRules}`
  ]
    .filter((x) => x && String(x).trim())
    .join('\n\n');
};

type BackendChatResponse = {
  reply: string;
  rag?: any;
  requestId?: string;
};

const callBackendChat = async (input: {
  message: string;
  userId: string;
  requestId: string;
  sessionId: string;
  projectId: string;
  pageContext: any;
  requestSource: string;
  projectKnowledge?: string;
  agentContext?: any;
  signal: AbortSignal;
}): Promise<BackendChatResponse> => {
  const token = getAuthToken();
  try {
    console.log('[AI][request]', {
      api: API_URL,
      requestId: input.requestId,
      model: 'Qwen/Qwen3-8B',
      message: input.message
    });
  } catch {}
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    signal: input.signal,
    body: JSON.stringify({
      message: input.message,
      userId: input.userId,
      requestId: input.requestId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      pageContext: input.pageContext,
      requestSource: input.requestSource,
      projectKnowledge: input.projectKnowledge,
      agentContext: input.agentContext
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const normalized = errorText.trim();
    const err = new Error(`API Error: ${response.status} ${normalized}`);
    (err as any).status = response.status;
    (err as any).body = normalized;
    throw err;
  }

  const data = await response.json();
  return {
    reply: typeof data?.reply === 'string' ? data.reply : '',
    rag: data?.rag,
    requestId: typeof data?.requestId === 'string' ? data.requestId : undefined
  };
};

const callGeminiDirect = async (input: {
  kind: AiRequestKind;
  message: string;
  agentContext?: any;
  pageContext: any;
  signal: AbortSignal;
}): Promise<{
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  model: string;
  usedUrl: string;
}> => {
  if (!GEMINI_API_KEY) {
    throw new Error('MISSING_VITE_GEMINI_API_KEY');
  }

  const systemPrompt = buildDirectSystemPrompt({
    kind: input.kind,
    message: input.message,
    agentContext: input.agentContext,
    pageContext: input.pageContext
  });

  const body = {
    contents: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'user', parts: [{ text: input.message }] }
    ]
  };

  try {
    console.log('[AI][request]', {
      api: GEMINI_API_URL,
      model: GEMINI_MODEL,
      message: input.message
    });
  } catch {}
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: input.signal,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const normalized = errorText.trim();
    const err = new Error(`GEMINI_DIRECT_ERROR: ${response.status} ${normalized}`);
    (err as any).status = response.status;
    (err as any).body = normalized;
    throw err;
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const usageRaw = data?.usageMetadata;
  const usage =
    usageRaw && typeof usageRaw === 'object'
      ? {
          promptTokens: Number(usageRaw.promptTokenCount ?? 0) || 0,
          completionTokens: Number(usageRaw.candidatesTokenCount ?? 0) || 0,
          totalTokens: Number(usageRaw.totalTokenCount ?? 0) || 0
        }
      : null;
  return {
    text: typeof rawText === 'string' ? rawText : '',
    usage,
    model: GEMINI_MODEL,
    usedUrl: GEMINI_API_URL
  };
};

const requestAi = async (input: {
  kind: AiRequestKind;
  group?: AiRequestGroup | string;
  priority?: number;
  cancelLowerPriority?: boolean;
  dropIfHigherPriorityActive?: boolean;
  message: string;
  agentContext?: any;
  timeoutMs: number;
  allowCache: boolean;
  cacheTtlMs?: number;
  signal?: AbortSignal;
}): Promise<string> => {
  pruneCache();

  const userId = getUserId();
  const pageContext = getPageContext();
  const sessionId = getOrCreateSessionId();
  const projectId = getOrCreateProjectId();
  const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  const group = ((input.group || input.kind) as string).trim() || input.kind;
  const priority =
    typeof input.priority === 'number' ? input.priority : getDefaultPriorityForGroup(group);
  const dropIfHigherPriorityActive =
    typeof input.dropIfHigherPriorityActive === 'boolean'
      ? input.dropIfHigherPriorityActive
      : group !== 'chat';
  const cancelLowerPriority =
    typeof input.cancelLowerPriority === 'boolean' ? input.cancelLowerPriority : group === 'chat';

  const trigger =
    typeof input.agentContext?.trigger === 'string' ? String(input.agentContext.trigger) : '';
  if (dropIfHigherPriorityActive && getMaxActivePriority() > priority) {
    recordAiRequest({
      id: requestId,
      ts: Date.now(),
      kind: input.kind,
      group,
      priority,
      transport: resolveTransport(),
      dropped: true,
      ok: true,
      endedAt: Date.now(),
      durationMs: 0,
      messagePreview: String(input.message || '').slice(0, 260),
      trigger: trigger.slice(0, 60)
    });
    return '';
  }

  if (cancelLowerPriority) {
    for (const [g, v] of activeGroups) {
      if (typeof v.priority === 'number' && v.priority < priority) cancelGroup(g);
    }
  }

  const key = buildRequestKeyWithGroup(group, input.kind, input.message, input.agentContext);
  const cached = input.allowCache ? resolvedCache.get(key) : undefined;
  if (cached && Date.now() < cached.expiresAt) {
    recordAiRequest({
      id: requestId,
      ts: Date.now(),
      kind: input.kind,
      group,
      priority,
      transport: resolveTransport(),
      cached: true,
      ok: true,
      endedAt: Date.now(),
      durationMs: 0,
      messagePreview: String(input.message || '').slice(0, 260),
      trigger: trigger.slice(0, 60)
    });
    return cached.value;
  }

  const inflightHit = inflight.get(key);
  if (inflightHit) {
    recordDiagnostic({
      kind: 'ai_dedupe',
      level: 'info',
      message: `${input.kind}:${group}`,
      data: { group, kind: input.kind }
    });
    return inflightHit.promise;
  }

  const prevController = groupControllers.get(group);
  if (prevController) {
    try {
      prevController.abort();
    } catch {}
  }

  const controller = new AbortController();
  groupControllers.set(group, controller);
  activeGroups.set(group, { controller, priority, startedAt: nowMs() });
  recordAiRequest({
    id: requestId,
    ts: Date.now(),
    kind: input.kind,
    group,
    priority,
    transport: resolveTransport(),
    messagePreview: String(input.message || '').slice(0, 260),
    trigger: trigger.slice(0, 60)
  });
  let detachExternalAbort: null | (() => void) = null;
  if (input.signal) {
    if (input.signal.aborted) {
      try {
        controller.abort();
      } catch {}
    } else {
      const onAbort = () => {
        try {
          controller.abort();
        } catch {}
      };
      input.signal.addEventListener('abort', onAbort, { once: true });
      detachExternalAbort = () => input.signal?.removeEventListener('abort', onAbort);
    }
  }

  const startedAt = nowMs();
  const p = (async () => {
    const timeoutId = window.setTimeout(() => controller.abort(), Math.max(1000, input.timeoutMs));
    try {
      const transport = resolveTransport();
      let reply = '';

      const ctxForBackend = (() => {
        const base =
          input.agentContext && typeof input.agentContext === 'object' ? input.agentContext : {};
        const mode = input.kind === 'reaction' ? 'react' : base?.mode;
        const next = { ...base, requestId, sessionId, projectId };
        if (mode === base?.mode) return next;
        return { ...next, mode };
      })();

      const knowledgeForBackend = (() => {
        const v = typeof projectKnowledge === 'string' ? projectKnowledge : '';
        const trimmed = v.trim();
        return trimmed ? trimmed.slice(0, 20000) : '';
      })();

      const tryBackend = async () => {
        const result = await callBackendChat({
          message: input.message,
          userId,
          requestId,
          sessionId,
          projectId,
          pageContext,
          requestSource: `agent_chat_${String(group || input.kind).trim() || 'chat'}`.slice(0, 80),
          projectKnowledge: knowledgeForBackend,
          agentContext: ctxForBackend,
          signal: controller.signal
        });
        reply = result.reply;
        if (result?.rag && typeof result.rag === 'object') {
          recordDiagnostic({
            kind: 'rag',
            level: 'info',
            message: 'backend_rag',
            data: result.rag
          });
        }
      };

      const tryDirect = async () => {
        const startedAt = Date.now();
        const result = await callGeminiDirect({
          kind: input.kind,
          message: input.message,
          agentContext: input.agentContext,
          pageContext,
          signal: controller.signal
        });
        reply = result.text;

        try {
          const usage = result.usage;
          const tokensIn = Number(usage?.promptTokens ?? 0) || 0;
          const tokensOut = Number(usage?.completionTokens ?? 0) || 0;
          const tokensTotal = Number(usage?.totalTokens ?? 0) || tokensIn + tokensOut;
          const trigger =
            typeof input.agentContext?.trigger === 'string'
              ? String(input.agentContext.trigger).trim().toLowerCase()
              : input.kind;
          await ingestUsage({
            userId,
            requestId,
            sessionId,
            projectId,
            ts: Date.now(),
            pageContext,
            requestSource:
              `agent_chat_${String(group || input.kind).trim() || 'chat'}_direct`.slice(0, 80),
            trigger,
            provider: 'gemini_direct',
            model: result.model,
            usedUrl: result.usedUrl,
            tokensIn,
            tokensOut,
            tokensTotal,
            status: 'ok',
            durationMs: Math.max(0, Date.now() - startedAt)
          });
        } catch {}
      };

      if (transport === 'direct') {
        try {
          await tryDirect();
        } catch (e: any) {
          const msg = typeof e?.message === 'string' ? e.message : String(e);
          if (!/abort/i.test(msg)) {
            setTransportOverride('proxy');
            await tryBackend();
            setTransportOverride('proxy');
          } else {
            throw e;
          }
        }
      } else {
        await tryBackend();
      }

      const result = reply || (input.kind === 'chat' ? "I'm not sure what to say..." : '');
      if (input.allowCache) {
        const ttlMs =
          typeof input.cacheTtlMs === 'number'
            ? Math.max(200, Math.min(120000, input.cacheTtlMs))
            : input.kind === 'chat'
              ? 9000
              : 5000;
        resolvedCache.set(key, { value: result, expiresAt: Date.now() + ttlMs });
      }
      updateAiRequest(requestId, {
        ok: true,
        endedAt: Date.now(),
        durationMs: Math.max(0, nowMs() - startedAt)
      });
      return result;
    } catch (err) {
      const status = typeof (err as any)?.status === 'number' ? (err as any).status : undefined;
      const msg = typeof (err as any)?.message === 'string' ? (err as any).message : String(err);
      const aborted =
        (err as any)?.name === 'AbortError' || /\babort(ed)?\b/i.test(String(msg || ''));
      updateAiRequest(requestId, {
        ok: false,
        aborted,
        status,
        errorMessage: String(msg || '').slice(0, 900),
        endedAt: Date.now(),
        durationMs: Math.max(0, nowMs() - startedAt)
      });
      recordDiagnostic({
        kind: 'ai_error',
        level: aborted ? 'warn' : 'error',
        message: `${input.kind}:${group} ${String(msg || '').slice(0, 220)}`,
        data: {
          group,
          kind: input.kind,
          status,
          aborted
        }
      });
      logger.error('AI request failed', { kind: input.kind, group, status, aborted, message: msg });
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
      inflight.delete(key);
      const currentGroup = groupControllers.get(group);
      if (currentGroup === controller) groupControllers.delete(group);
      const currentActive = activeGroups.get(group);
      if (currentActive?.controller === controller) activeGroups.delete(group);
      if (detachExternalAbort) {
        try {
          detachExternalAbort();
        } catch {}
        detachExternalAbort = null;
      }
    }
  })();

  inflight.set(key, { promise: p, controller, startedAt });
  return p;
};

export const sendMessageToAI = async (
  message: string,
  _history: ChatMessage[] = [], // Kept for compatibility but not strictly needed for backend context
  agentContext?: any,
  options?: {
    signal?: AbortSignal;
    group?: AiRequestGroup | string;
    priority?: number;
    cancelLowerPriority?: boolean;
    dropIfHigherPriorityActive?: boolean;
  }
): Promise<string> => {
  try {
    return await requestAi({
      kind: 'chat',
      group: options?.group || 'chat',
      priority: options?.priority,
      cancelLowerPriority: options?.cancelLowerPriority,
      dropIfHigherPriorityActive: options?.dropIfHigherPriorityActive,
      message,
      agentContext,
      timeoutMs: 30000,
      allowCache: true,
      signal: options?.signal
    });
  } catch (error) {
    logger.error('Error calling AI', error);
    return (
      "Sorry, I'm having trouble connecting to my brain right now! [DIZZY] [MOTION: shake]\n\n" +
      'emotionTag: {"primary":"dizzy","intensity":0.9,"secondary":["confused"]}\n\n' +
      'motionTag: [{"type":"gesture","name":"shake_head","duration":900,"loop":false}]'
    );
  }
};

export const requestAgentReaction = async (input: {
  message: string;
  agentContext?: any;
  signal?: AbortSignal;
  group?: AiRequestGroup | string;
  priority?: number;
  cancelLowerPriority?: boolean;
  dropIfHigherPriorityActive?: boolean;
}): Promise<string> => {
  try {
    return await requestAi({
      kind: 'reaction',
      group: input.group || 'reaction',
      priority: input.priority,
      cancelLowerPriority: input.cancelLowerPriority,
      dropIfHigherPriorityActive: input.dropIfHigherPriorityActive,
      message: input.message,
      agentContext: input.agentContext,
      timeoutMs: 15000,
      allowCache: true,
      signal: input.signal
    });
  } catch (error) {
    logger.error('Error calling AI', error);
    return '';
  }
};

export const cancelAiRequests = (group?: AiRequestKind | AiRequestGroup | string) => {
  if (group) {
    recordDiagnostic({ kind: 'ai_cancel', level: 'info', message: String(group) });
    cancelGroup(group);
    return;
  }

  recordDiagnostic({ kind: 'ai_cancel', level: 'info', message: 'all' });
  for (const g of Array.from(groupControllers.keys())) cancelGroup(g);
};

export const clearAiCache = () => {
  resolvedCache.clear();
};

export const getUserProfile = async () => {
  try {
    const userId = getUserId();
    const token = getAuthToken();
    const response = await fetch(`${USER_API_URL}/${userId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) throw new Error('Failed to fetch profile');
    return await response.json();
  } catch (error) {
    logger.error('Error fetching profile', error);
    return null;
  }
};

export const getChatHistory = async (userId: string) => {
  try {
    const token = getAuthToken();
    const response = await fetch(buildApiUrl(`/api/chat/history/${userId}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) throw new Error('Failed to fetch history');
    const data = await response.json();
    return data.history || [];
  } catch (error) {
    logger.error('Error fetching chat history', error);
    return [];
  }
};

export const updateUserProfile = async (profile: any) => {
  try {
    const userId = getUserId();
    const token = getAuthToken();
    const response = await fetch(USER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        userId,
        profile,
        sessionId: getOrCreateSessionId(),
        projectId: getOrCreateProjectId(),
        pageContext: getPageContext(),
        requestSource: 'agent_update_profile'
      })
    });
    if (!response.ok) throw new Error('Failed to update profile');
    return await response.json();
  } catch (error) {
    logger.error('Error updating profile', error);
    return null;
  }
};

export const getAiTransportOverride = (): AiTransport | '' => getTransportOverride();

export const setAiTransportOverride = (v: AiTransport | '') => {
  setTransportOverride(v);
};

export const getAiRuntimeState = () => {
  return {
    transport: resolveTransport(),
    override: getTransportOverride(),
    inflightCount: inflight.size,
    cacheCount: resolvedCache.size,
    groupControllers: Array.from(groupControllers.keys()),
    activeGroups: Array.from(activeGroups.entries()).map(([k, v]) => ({
      group: k,
      priority: v.priority,
      startedAt: v.startedAt
    }))
  };
};
