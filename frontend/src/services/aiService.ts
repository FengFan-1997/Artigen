import { buildApiUrl } from '../utils/api';
import { getAuthToken, getCurrentUserId, isLocalLoggedIn } from '@/login/session';

const API_URL = buildApiUrl('/api/generate');
const FIXED_TEXT_MODEL = 'Qwen/Qwen3-8B';

export interface AIResponse {
  text: string;
  error?: string;
}

export const generateContent = async (prompt: string): Promise<AIResponse> => {
  try {
    const userId = getCurrentUserId();
    if (!userId || !isLocalLoggedIn()) {
      return { text: '', error: 'LOGIN_REQUIRED' };
    }

    const token = getAuthToken();
    const requestId = `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const controller = new AbortController();
    const timeoutMs = 120000;
    const startedAt = performance.now();
    const timeoutId = window.setTimeout(() => {
      try {
        console.warn('[AI][timeout]', {
          api: API_URL,
          requestId,
          model: FIXED_TEXT_MODEL,
          timeoutMs,
          elapsedMs: Math.round(performance.now() - startedAt)
        });
      } catch {}
      controller.abort();
    }, timeoutMs);
    try {
      console.log('[AI][request]', {
        api: API_URL,
        requestId,
        model: FIXED_TEXT_MODEL,
        timeoutMs,
        prompt
      });
    } catch {}
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        userId,
        requestId,
        model: FIXED_TEXT_MODEL
      })
    });
    window.clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch {
        const text = await response.text();
        if (text) errorMsg += ` - ${text.slice(0, 200)}`;
      }
      return { text: '', error: errorMsg };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      const fallbackText = await response.text();
      const errorMsg =
        fallbackText && fallbackText.trim().length > 0
          ? `Invalid JSON response: ${fallbackText.slice(0, 200)}`
          : 'Invalid JSON response from server';
      return { text: '', error: errorMsg };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text };
  } catch (error: any) {
    const msg = String(error?.message || error || '').trim();
    const name = String(error?.name || '').trim();
    if (name === 'AbortError' || /abort(ed)?/i.test(msg))
      return { text: '', error: 'REQUEST_TIMEOUT' };
    if (/(failed to fetch|networkerror|load failed|err_connection_refused)/i.test(msg))
      return { text: '', error: 'NETWORK_ERROR' };
    return { text: '', error: msg || 'UNKNOWN_ERROR' };
  }
};
