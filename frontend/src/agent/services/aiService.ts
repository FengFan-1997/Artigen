import type { ChatMessage } from '../types';
import { getUserId } from '../utils/user';
import { getPageContext } from '../utils/pageContext';

const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const apiBaseUrl = normalizeBaseUrl(
  import.meta.env.VITE_AGENT_API_BASE || import.meta.env.VITE_API_BASE || 'http://localhost:8080'
);
const API_URL = `${apiBaseUrl}/api/chat`;
const USER_API_URL = `${apiBaseUrl}/api/user`;

type AiRequestKind = 'chat' | 'reaction';

type CachedValue = { value: string; expiresAt: number };
type InflightValue = { promise: Promise<string>; controller: AbortController; startedAt: number };

const resolvedCache = new Map<string, CachedValue>();
const inflight = new Map<string, InflightValue>();
const groupControllers = new Map<AiRequestKind, AbortController>();

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const safeJsonStringify = (v: any) => {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
};

const buildAgentContextKey = (agentContext: any) => {
  if (!agentContext || typeof agentContext !== 'object') return '';
  const keyObj = {
    trigger: agentContext.trigger,
    runtime: {
      lang: agentContext.runtime?.lang,
      modelId: agentContext.runtime?.modelId
    },
    character: {
      name: agentContext.character?.name
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
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: input.message,
          userId,
          pageContext,
          agentContext: input.agentContext
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend Error:', errorText);
        throw new Error(`API Error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const reply = typeof data?.reply === 'string' ? data.reply : '';
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
