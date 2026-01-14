import { buildApiUrl } from '@/utils/api';
import { ensureGuestUserId, getAuthToken } from '@/login/session';

const API_URL = buildApiUrl('/api/generate');
const IMG2IMG_URL = buildApiUrl('/api/img2img');

const FIXED_TEXT_MODEL = 'Qwen/Qwen3-8B';
const FIXED_IMAGE_MODEL = 'Kwai-Kolors/Kolors';

const isAllowedTextModel = (raw: string) => {
  const k = String(raw || '')
    .trim()
    .toLowerCase();
  return k === 'qwen' || k === 'qwen/qwen3-8b' || k === 'qwen3-8b';
};

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

export type Img2ImgImageInput = GenerateImageInput | string;

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

const sanitizeUrl = (raw: string) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return /^data:image\//i.test(s) ? s : '';
  try {
    const u = new URL(s, window.location.origin);
    const p = String(u.protocol || '').toLowerCase();
    if (p === 'http:' || p === 'https:' || p === 'blob:') return u.href;
    return '';
  } catch {
    return '';
  }
};

const normalizeImageUrl = (raw: string) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return sanitizeUrl(s);
  if (/^https?:\/\//i.test(s)) return sanitizeUrl(s);
  if (s.startsWith('/files/')) return buildApiUrl(s);
  const compact = s.replace(/\s+/g, '');
  const looksBase64 =
    compact.length >= 64 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(compact) &&
    (compact.includes('/') || compact.includes('+') || compact.includes('='));
  if (looksBase64) return sanitizeUrl(`data:image/png;base64,${compact}`);
  return sanitizeUrl(s);
};

const toRequestErrorCode = (err: any) => {
  if (err && typeof err === 'object' && (err as any).name === 'AbortError') return 'ABORTED';
  const msg = String(err?.message || err || '').trim();
  return msg || 'NETWORK_ERROR';
};

const isSafeImageRefString = (raw: string) => {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^data:image\//i.test(s)) return true;
  if (s.startsWith('/files/')) return true;
  return false;
};

const normalizeImg2ImgImages = (images: Img2ImgImageInput[]) => {
  const maxItems = 3;
  const maxBase64Len = 25 * 1024 * 1024;
  const out: Img2ImgImageInput[] = [];
  for (const it of images.slice(0, maxItems)) {
    if (typeof it === 'string') {
      if (isSafeImageRefString(it)) out.push(it.trim());
      continue;
    }
    const mimeType = String((it as any)?.mimeType || '').trim();
    const dataBase64 = String((it as any)?.dataBase64 || '').trim();
    if (!/^image\//i.test(mimeType)) continue;
    if (!dataBase64) continue;
    if (dataBase64.length > maxBase64Len) continue;
    out.push({ mimeType, dataBase64 });
  }
  return out;
};

export const img2img = async (input: {
  prompt: string;
  userText?: string;
  negativePrompt?: string;
  params?: {
    imageSize?: string;
    steps?: number;
    guidanceScale?: number;
    seed?: number;
  };
  images?: Img2ImgImageInput[];
  model?: string;
  reason?: string;
  timeoutMs?: number;
  requestId?: string;
  deepMode?: boolean;
  signal?: AbortSignal;
}): Promise<Img2ImgResult> => {
  const requestId =
    String(input.requestId || '').trim() ||
    `artigen_img2img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const prompt = String(input.prompt || '').trim();
  if (!prompt) return { ok: false, errorCode: 'EMPTY_PROMPT', error: 'EMPTY_PROMPT', requestId };
  const images = normalizeImg2ImgImages(Array.isArray(input.images) ? input.images : []);
  const requestedModel = String(input.model || '').trim();
  const reason = (() => {
    const raw = String(input.reason || '')
      .trim()
      .toLowerCase();
    if (raw === 'ai_design' || raw === 'id_photo' || raw === 'old_photo') return raw;
    return 'img2img';
  })();
  if (requestedModel && requestedModel !== FIXED_IMAGE_MODEL) {
    return {
      ok: false,
      errorCode: 'MODEL_NOT_ALLOWED',
      error: 'MODEL_NOT_ALLOWED',
      requestId
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(180000, Number(input.timeoutMs ?? 120000) || 120000));
  const startedAt = performance.now();
  const timeoutId = window.setTimeout(() => {
    try {
      console.warn('[AI][timeout]', {
        api: IMG2IMG_URL,
        requestId,
        model: 'Kwai-Kolors/Kolors',
        modelRequested: requestedModel || undefined,
        timeoutMs,
        elapsedMs: Math.round(performance.now() - startedAt)
      });
    } catch {}
    controller.abort();
  }, timeoutMs);
  const ext = input.signal;
  if (ext) {
    if (ext.aborted) controller.abort();
    else ext.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const userId = ensureGuestUserId();
    const token = getAuthToken();
    try {
      console.log('[AI][request]', {
        api: IMG2IMG_URL,
        requestId,
        model: FIXED_IMAGE_MODEL,
        modelRequested: requestedModel || undefined,
        timeoutMs,
        prompt,
        reason,
        imagesCount: images.length
      });
    } catch {}
    const response = await fetch(IMG2IMG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: controller.signal,
      body: JSON.stringify({
        userId,
        requestId,
        prompt,
        userText: typeof input.userText === 'string' ? input.userText.trim() : '',
        negativePrompt: input.negativePrompt,
        params: input.params,
        model: FIXED_IMAGE_MODEL,
        reason,
        ...(images.length ? { images } : {}),
        timeoutMs: input.timeoutMs,
        deepMode: !!input.deepMode,
        requestSource: 'circled-generate'
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
      .map((x: any) => ({ url: normalizeImageUrl(String(x?.url || '')) }))
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
    const code = toRequestErrorCode(e);
    try {
      console.warn('[AI][error]', {
        api: IMG2IMG_URL,
        requestId,
        model: FIXED_IMAGE_MODEL,
        modelRequested: requestedModel || undefined,
        timeoutMs,
        elapsedMs: Math.round(performance.now() - startedAt),
        errorCode: code
      });
    } catch {}
    return { ok: false, errorCode: code, error: code, requestId };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const generateText = async (
  prompt: string,
  opts?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    requestId?: string;
    images?: GenerateImageInput[];
    model?: string;
    purpose?: string;
  }
): Promise<TextGenerateResult> => {
  const p = String(prompt || '').trim();
  const requestId =
    String(opts?.requestId || '').trim() ||
    `artigen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  if (!p) return { ok: false, errorCode: 'EMPTY_PROMPT', error: 'EMPTY_PROMPT', requestId };

  const requestedModel = String(opts?.model || '').trim();
  if (requestedModel && !isAllowedTextModel(requestedModel)) {
    return {
      ok: false,
      errorCode: 'MODEL_NOT_ALLOWED',
      error: 'MODEL_NOT_ALLOWED',
      requestId
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(180000, Number(opts?.timeoutMs ?? 120000) || 120000));
  const startedAt = performance.now();
  const timeoutId = window.setTimeout(() => {
    try {
      console.warn('[AI][timeout]', {
        api: API_URL,
        requestId,
        model: FIXED_TEXT_MODEL,
        modelRequested: requestedModel || undefined,
        purpose: String(opts?.purpose || '').trim() || undefined,
        timeoutMs,
        elapsedMs: Math.round(performance.now() - startedAt)
      });
    } catch {}
    controller.abort();
  }, timeoutMs);

  try {
    const ext = opts?.signal;
    if (ext) {
      if (ext.aborted) controller.abort();
      else ext.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const userId = ensureGuestUserId();
    const token = getAuthToken();
    const images = Array.isArray(opts?.images) ? opts?.images : undefined;
    const purpose = String(opts?.purpose || '').trim();
    try {
      console.log('[AI][request]', {
        api: API_URL,
        requestId,
        model: FIXED_TEXT_MODEL,
        modelRequested: requestedModel || undefined,
        purpose: purpose || undefined,
        timeoutMs,
        prompt: p,
        imagesCount: Array.isArray(images) ? images.length : 0
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
        prompt: p,
        userId,
        requestId,
        images,
        model: FIXED_TEXT_MODEL,
        ...(purpose ? { purpose } : {})
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === 'string' && text.trim()) return { ok: true, text: text.trim(), requestId };
    return { ok: false, errorCode: 'EMPTY_RESPONSE_TEXT', error: 'EMPTY_RESPONSE_TEXT', requestId };
  } catch (e: any) {
    const code = toRequestErrorCode(e);
    try {
      console.warn('[AI][error]', {
        api: API_URL,
        requestId,
        model: FIXED_TEXT_MODEL,
        modelRequested: requestedModel || undefined,
        purpose: String(opts?.purpose || '').trim() || undefined,
        timeoutMs,
        elapsedMs: Math.round(performance.now() - startedAt),
        errorCode: code
      });
    } catch {}
    return { ok: false, errorCode: code, error: code, requestId };
  } finally {
    window.clearTimeout(timeoutId);
  }
};
