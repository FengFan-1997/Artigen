import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';

export type ConvertCapabilities = {
  ok: boolean;
  capabilities?: {
    officeToPdf?: boolean;
    pdfToDocx?: boolean;
    maxFileBytes?: number;
  };
};

type BackendConvertResult = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

const CAPABILITIES_URL = buildApiUrl('/api/tools/convert/capabilities');
const CONVERT_URL = buildApiUrl('/api/tools/convert');

let capabilitiesCache: { expiresAt: number; promise: Promise<ConvertCapabilities | null> } | null =
  null;

const blobToBase64 = (blob: Blob, signal?: AbortSignal) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      try {
        reader.abort();
      } catch {}
      cleanup();
      reject(new Error('ABORTED'));
    };
    if (signal?.aborted) {
      reject(new Error('ABORTED'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.onerror = () => {
      cleanup();
      reject(new Error('FILE_READ_FAIL'));
    };
    reader.onload = () => {
      cleanup();
      const dataUrl = String(reader.result || '');
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (base64: string, mimeType: string) => {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
};

export const getConvertCapabilities = async (opts?: { signal?: AbortSignal }) => {
  const now = Date.now();
  if (!capabilitiesCache || now >= capabilitiesCache.expiresAt) {
    const promise = authFetch(CAPABILITIES_URL, { signal: opts?.signal })
      .then((res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .catch(() => null);
    capabilitiesCache = { expiresAt: now + 30 * 1000, promise };
  }
  const caps = await capabilitiesCache.promise;
  if (!caps) capabilitiesCache = null;
  return caps;
};

export const clearConvertCapabilitiesCacheForTests = () => {
  capabilitiesCache = null;
};

export const preflightWordToPdf = async (opts?: { signal?: AbortSignal }) => {
  const result = await getConvertCapabilities(opts);
  const maxFileBytes = Math.max(0, Number(result?.capabilities?.maxFileBytes || 0));
  return {
    available: Boolean(result?.ok && result.capabilities?.officeToPdf),
    maxFileBytes
  };
};

export const convertWithBackend = async (
  toolId: 'word2pdf',
  file: File,
  opts: { signal?: AbortSignal; uploadConsent: boolean }
): Promise<BackendConvertResult> => {
  if (opts.uploadConsent !== true) throw new Error('WORD_UPLOAD_CONSENT_REQUIRED');
  const caps = await getConvertCapabilities(opts);
  if (toolId === 'word2pdf' && !caps?.capabilities?.officeToPdf) {
    throw new Error('CONVERTER_UNAVAILABLE');
  }
  const maxFileBytes = Number(caps?.capabilities?.maxFileBytes || 0);
  if (maxFileBytes > 0 && file.size > maxFileBytes) throw new Error('FILE_TOO_LARGE');

  const dataBase64 = await blobToBase64(file, opts?.signal);
  if (opts?.signal?.aborted) throw new Error('ABORTED');

  const res = await authFetch(CONVERT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts?.signal,
    body: JSON.stringify({
      toolId,
      uploadConsent: opts.uploadConsent,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64
    })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const code = typeof json?.error === 'string' && json.error ? json.error : 'CONVERT_FAILED';
    throw new Error(code);
  }
  const mimeType = String(json.mimeType || 'application/octet-stream');
  const filename = String(json.filename || 'converted.pdf');
  const responseDataBase64 = String(json.dataBase64 || '').trim();
  if (!responseDataBase64) throw new Error('CONVERT_FAILED');
  const blob = base64ToBlob(responseDataBase64, mimeType);
  if (!blob.size) throw new Error('CONVERT_FAILED');
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...header) !== '%PDF-') throw new Error('CONVERT_FAILED');
  return { blob, filename, mimeType };
};
