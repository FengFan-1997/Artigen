import { buildApiUrl } from '@/utils/api';
import { getAuthToken, getUserId } from '@/auth';

const API_URL = buildApiUrl('/api/generate');
const BALANCE_URL = buildApiUrl('/api/credits/balance');

export type CreditsBalance = { userId: string; available: number; frozen: number };

export type TextGenerateResult =
  | { ok: true; text: string; requestId: string }
  | {
      ok: false;
      errorCode: string;
      error: string;
      requestId: string;
      wallet?: CreditsBalance | null;
    };

export const getCreditsBalance = async (): Promise<CreditsBalance | null> => {
  try {
    const userId = getUserId();
    const token = getAuthToken();
    const url = `${BALANCE_URL}?userId=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const uid = typeof json?.userId === 'string' ? json.userId : '';
    if (!uid) return null;
    return {
      userId: uid,
      available: Number(json?.available ?? 0) || 0,
      frozen: Number(json?.frozen ?? 0) || 0
    };
  } catch {
    return null;
  }
};

export const generateText = async (
  prompt: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number; requestId?: string }
): Promise<TextGenerateResult> => {
  const p = String(prompt || '').trim();
  const requestId =
    String(opts?.requestId || '').trim() ||
    `agentimg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  if (!p) return { ok: false, errorCode: 'EMPTY_PROMPT', error: 'EMPTY_PROMPT', requestId };

  try {
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(opts?.timeoutMs ?? 45000) || 45000);
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const ext = opts?.signal;
    if (ext) {
      if (ext.aborted) controller.abort();
      else ext.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const userId = getUserId();
    const token = getAuthToken();
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: controller.signal,
      body: JSON.stringify({ prompt: p, userId, requestId })
    });
    window.clearTimeout(timeoutId);

    if (!response.ok) {
      const json = await response.json().catch(() => null);
      const errorCode =
        typeof json?.error === 'string' && json.error.trim()
          ? json.error.trim()
          : `API_ERROR_${response.status}`;
      const wallet =
        json && typeof json === 'object' && json.wallet && typeof json.wallet === 'object'
          ? {
              userId: String(json.wallet.userId || userId),
              available: Number(json.wallet.available ?? 0) || 0,
              frozen: Number(json.wallet.frozen ?? 0) || 0
            }
          : null;
      return { ok: false, errorCode, error: errorCode, wallet, requestId };
    }

    const data = await response.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === 'string' && text.trim()) return { ok: true, text: text.trim(), requestId };
    return { ok: false, errorCode: 'EMPTY_RESPONSE_TEXT', error: 'EMPTY_RESPONSE_TEXT', requestId };
  } catch (e: any) {
    const msg = String(e?.message || e || 'UNKNOWN_ERROR');
    return { ok: false, errorCode: msg, error: msg, requestId };
  }
};
