import type { ChatMessage } from '../types';
import { buildApiUrl, getUserId } from '../utils/user';
import { getPageContext } from '../utils/pageContext';
import { recordAiRequest, recordDiagnostic, updateAiRequest } from '../utils/diagnostics';

const API_URL = buildApiUrl('/api/chat');
const USER_API_URL = buildApiUrl('/api/user');

type AiRequestKind = 'chat' | 'reaction';
type AiTransport = 'auto' | 'proxy' | 'direct';
type AiRequestGroup = 'chat' | 'task' | 'background' | 'interaction' | 'idle' | 'reaction';

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
  if (override === 'direct' || override === 'proxy') return override;
  if (REQUEST_TRANSPORT === 'direct') return 'direct';
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
          'Append at least one emotional tag at the end like "[HAPPY]".',
          mustIncludeAvatarPlan
            ? 'You MUST include a JSON array after the label "avatarPlan:" on its own line.'
            : 'If you want the avatar to move, include a JSON array after the label "avatarPlan:" on its own line.',
          'The "avatarPlan" must be strict JSON and use only allowed motions/expressions.',
          'Keep avatarPlan steps short (1–6 steps).'
        ].join('\n- ')
      : [
          `始终以 ${personaName} 的口吻回复。`,
          '每次回复末尾必须带至少一个情绪标签，例如「…… [HAPPY]」。',
          mustIncludeAvatarPlan
            ? '必须输出模型动作：在单独一行输出「avatarPlan:」后面紧跟 JSON 数组。'
            : '如果需要模型动作，在单独一行输出「avatarPlan:」后面紧跟 JSON 数组。',
          'avatarPlan 必须是严格 JSON，只能使用允许的 motions/expressions。',
          'avatarPlan 步骤保持简短（1–6 步）。'
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

const callBackendChat = async (input: {
  message: string;
  userId: string;
  pageContext: any;
  agentContext?: any;
  signal: AbortSignal;
}) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: input.signal,
    body: JSON.stringify({
      message: input.message,
      userId: input.userId,
      pageContext: input.pageContext,
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
  return typeof data?.reply === 'string' ? data.reply : '';
};

const callGeminiDirect = async (input: {
  kind: AiRequestKind;
  message: string;
  agentContext?: any;
  pageContext: any;
  signal: AbortSignal;
}) => {
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
  return typeof rawText === 'string' ? rawText : '';
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

      const tryBackend = async () => {
        reply = await callBackendChat({
          message: input.message,
          userId,
          pageContext,
          agentContext: input.agentContext,
          signal: controller.signal
        });
      };

      const tryDirect = async () => {
        reply = await callGeminiDirect({
          kind: input.kind,
          message: input.message,
          agentContext: input.agentContext,
          pageContext,
          signal: controller.signal
        });
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
      console.error('AI request failed', err);
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
    console.error('Error calling AI:', error);
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
    console.error('Error calling AI:', error);
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
    const response = await fetch(`${USER_API_URL}/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch profile');
    return await response.json();
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
};

export const getChatHistory = async (userId: string) => {
  try {
    const response = await fetch(buildApiUrl(`/api/chat/history/${userId}`));
    if (!response.ok) throw new Error('Failed to fetch history');
    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return [];
  }
};

export const updateUserProfile = async (profile: any) => {
  try {
    const userId = getUserId();
    const response = await fetch(USER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, profile })
    });
    if (!response.ok) throw new Error('Failed to update profile');
    return await response.json();
  } catch (error) {
    console.error('Error updating profile:', error);
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
