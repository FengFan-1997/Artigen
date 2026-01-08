import { buildApiUrl } from '@/utils/api';
import { ensureGuestUserId, getAuthToken } from '@/login/session';

const API_URL = buildApiUrl('/api/generate');
const IMG2IMG_URL = buildApiUrl('/api/img2img');

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

export type GenerateImageInput = { mimeType: string; dataBase64: string };

export type Img2ImgResult =
  | {
      ok: true;
      requestId: string;
      images: { url: string }[];
      seed?: number;
      timings?: any;
    }
  | {
      ok: false;
      requestId: string;
      errorCode: string;
      error: string;
      wallet?: CreditsBalance | null;
    };

export const img2img = async (input: {
  prompt: string;
  negativePrompt?: string;
  params?: {
    imageSize?: string;
    steps?: number;
    guidanceScale?: number;
    seed?: number;
  };
  images: GenerateImageInput[];
  timeoutMs?: number;
  requestId?: string;
}): Promise<Img2ImgResult> => {
  const requestId =
    String(input.requestId || '').trim() ||
    `agentimg_img2img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const prompt = String(input.prompt || '').trim();
  if (!prompt) return { ok: false, errorCode: 'EMPTY_PROMPT', error: 'EMPTY_PROMPT', requestId };
  const images = Array.isArray(input.images) ? input.images : [];
  if (images.length === 0)
    return { ok: false, errorCode: 'EMPTY_IMAGE', error: 'EMPTY_IMAGE', requestId };

  try {
    const userId = ensureGuestUserId();
    const token = getAuthToken();
    const response = await fetch(IMG2IMG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        userId,
        requestId,
        prompt,
        negativePrompt: input.negativePrompt,
        params: input.params,
        images,
        timeoutMs: input.timeoutMs
      })
    });

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
    const imagesRaw = Array.isArray(data?.images) ? data.images : [];
    const outImages = imagesRaw
      .map((x: any) => ({ url: String(x?.url || '').trim() }))
      .filter((x: any) => !!x.url);
    if (!outImages.length) {
      return { ok: false, errorCode: 'EMPTY_IMAGE_RESULT', error: 'EMPTY_IMAGE_RESULT', requestId };
    }
    return {
      ok: true,
      requestId,
      images: outImages,
      seed: typeof data?.seed === 'number' ? data.seed : undefined,
      timings: data?.timings
    };
  } catch (e: any) {
    const msg = String(e?.message || e || 'UNKNOWN_ERROR');
    return { ok: false, errorCode: msg, error: msg, requestId };
  }
};

export const generateText = async (
  prompt: string,
  opts?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    requestId?: string;
    images?: GenerateImageInput[];
  }
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
    const userId = ensureGuestUserId();
    const token = getAuthToken();
    const images = Array.isArray(opts?.images) ? opts?.images : undefined;
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: controller.signal,
      body: JSON.stringify({ prompt: p, userId, requestId, images })
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
