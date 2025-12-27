import type { ChatMessage } from '../types';
import { getUserId } from '../utils/user';
import { getPageContext } from '../utils/pageContext';

const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const apiBaseUrl = normalizeBaseUrl(
  import.meta.env.VITE_AGENT_API_BASE || import.meta.env.VITE_API_BASE || ''
);
const API_URL = `${apiBaseUrl}/api/chat`;
const USER_API_URL = `${apiBaseUrl}/api/user`;

type AiRequestKind = 'chat' | 'reaction';
type AiTransport = 'auto' | 'proxy' | 'direct';

type CachedValue = { value: string; expiresAt: number };
type InflightValue = { promise: Promise<string>; controller: AbortController; startedAt: number };

const resolvedCache = new Map<string, CachedValue>();
const inflight = new Map<string, InflightValue>();
const groupControllers = new Map<AiRequestKind, AbortController>();

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

  return [
    modeText,
    personaBlock,
    personaRulesBlock,
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

  const key = buildRequestKey(input.kind, input.message, input.agentContext);
  const cached = input.allowCache ? resolvedCache.get(key) : undefined;
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const inflightHit = inflight.get(key);
  if (inflightHit) return inflightHit.promise;

  const prevController = groupControllers.get(input.kind);
  if (prevController) {
    try {
      prevController.abort();
    } catch {}
  }

  const controller = new AbortController();
  groupControllers.set(input.kind, controller);
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
      return result;
    } catch (err) {
      console.error('AI request failed', err);
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
      inflight.delete(key);
      const currentGroup = groupControllers.get(input.kind);
      if (currentGroup === controller) groupControllers.delete(input.kind);
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
  options?: { signal?: AbortSignal }
): Promise<string> => {
  try {
    return await requestAi({
      kind: 'chat',
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
}): Promise<string> => {
  try {
    return await requestAi({
      kind: 'reaction',
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

export const cancelAiRequests = (kind?: AiRequestKind) => {
  if (kind) {
    const controller = groupControllers.get(kind);
    if (controller) {
      try {
        controller.abort();
      } catch {}
      groupControllers.delete(kind);
    }
    for (const [k, v] of inflight) {
      if (k.startsWith(`${kind}|`)) {
        try {
          v.controller.abort();
        } catch {}
        inflight.delete(k);
      }
    }
    return;
  }

  for (const controller of groupControllers.values()) {
    try {
      controller.abort();
    } catch {}
  }
  groupControllers.clear();

  for (const v of inflight.values()) {
    try {
      v.controller.abort();
    } catch {}
  }
  inflight.clear();
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
    const response = await fetch(`${apiBaseUrl}/api/chat/history/${userId}`);
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
