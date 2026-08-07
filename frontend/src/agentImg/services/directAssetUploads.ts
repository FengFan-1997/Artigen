import type { Body, Meta, UppyFile } from '@uppy/core';
import type { AwsS3Options } from '@uppy/aws-s3';
import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';
import { ToolTaskClientError } from './toolTasks';

const SINGLE_PUT_LIMIT = 16 * 1024 * 1024;
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const headlessUppyLogger = {
  debug: () => {},
  warn: () => {},
  // The caller converts failures into the existing task UI and analytics.
  // Avoid a second, unhandled-looking console error during graceful fallback.
  error: () => {}
};

type UploadSession = {
  id: string;
  kind: 'single' | 'multipart';
  status: string;
  partSize: number | null;
  method?: 'PUT';
  url?: string;
  headers?: Record<string, string>;
};

type UploadedAsset = {
  assetId: string;
};

const apiError = async (response: Response) => {
  const json: any = await response.json().catch(() => null);
  const error = json?.error;
  return new ToolTaskClientError(
    typeof error?.code === 'string' ? error.code : `API_ERROR_${response.status}`,
    {
      field: typeof error?.field === 'string' ? error.field : undefined,
      retryable: Boolean(error?.retryable),
      status: response.status
    }
  );
};

const jsonRequest = async (url: string, init: RequestInit = {}) => {
  const response = await authFetch(buildApiUrl(url), {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
  if (!response.ok) throw await apiError(response);
  return response.json().catch(() => null);
};

const uploadIdempotencyKey = async (taskKey: string, index: number) => {
  const source = new TextEncoder().encode(`${taskKey}:${index}`);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', source);
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `asset:${hex}`;
  }
  return `asset:${taskKey.slice(0, 150)}:${index}`;
};

const assertSession = (raw: any): UploadSession => {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  const kind = raw?.kind;
  if (!id || !['single', 'multipart'].includes(kind)) {
    throw new ToolTaskClientError('INVALID_ASSET_UPLOAD_RESPONSE');
  }
  return raw as UploadSession;
};

const assertAsset = (raw: any): UploadedAsset => {
  const assetId = typeof raw?.assetId === 'string' ? raw.assetId.trim() : '';
  if (!assetId) throw new ToolTaskClientError('INVALID_ASSET_UPLOAD_RESPONSE');
  return raw as UploadedAsset;
};

export const shouldFallbackToMultipart = (error: unknown) => {
  if (error instanceof TypeError) return true;
  // Uppy exposes plugin failures as either the original Error or a file-level
  // string. Preserve the rollout fallback in both cases.
  const code = error instanceof ToolTaskClientError
    ? error.code
    : typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
  return new Set([
    'DIRECT_ASSET_UPLOADS_DISABLED',
    'S3_NOT_CONFIGURED',
    'ASSET_STORAGE_NOT_CONFIGURED',
    'INVALID_ASSET_UPLOAD_RESPONSE',
    'API_ERROR_404',
    'API_ERROR_405',
    'API_ERROR_501',
    'API_ERROR_503'
  ]).has(code.trim());
};

export const uploadTaskAssets = async (input: {
  toolId: string;
  operation: string;
  files: File[];
  taskIdempotencyKey: string;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}): Promise<string[]> => {
  if (!input.files.length) return [];
  const [{ default: Uppy }, { default: AwsS3 }] = await Promise.all([
    import('@uppy/core'),
    import('@uppy/aws-s3')
  ]);
  const sessions = new Map<string, Promise<UploadSession>>();
  const assets = new Map<string, UploadedAsset>();

  const ensureSession = (file: UppyFile<Meta, Body>) => {
    const existing = sessions.get(file.id);
    if (existing) return existing;
    const promise = uploadIdempotencyKey(input.taskIdempotencyKey, Number(file.meta.sourceIndex))
      .then((idempotencyKey) => jsonRequest('/api/asset-uploads', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          toolId: input.toolId,
          operation: input.operation,
          mimeType: file.type || 'application/octet-stream',
          size: file.size
        }),
        signal: input.signal
      }))
      .then((json) => assertSession(json?.upload));
    sessions.set(file.id, promise);
    return promise;
  };

  const uppy = new Uppy<Meta, Body>({
    id: `artigen-task-assets-${Date.now().toString(36)}`,
    autoProceed: false,
    allowMultipleUploadBatches: false,
    logger: headlessUppyLogger,
    restrictions: { maxNumberOfFiles: input.files.length }
  });
  const awsOptions: AwsS3Options<Meta, Body> = {
    retryDelays: [0, 1_000, 3_000, 5_000],
    limit: 3,
    shouldUseMultipart: (file) => Number(file.size || 0) >= SINGLE_PUT_LIMIT,
    getChunkSize: () => MULTIPART_PART_SIZE,
    getUploadParameters: async (file) => {
      const session = await ensureSession(file);
      if (session.kind !== 'single' || !session.url) {
        throw new ToolTaskClientError('INVALID_ASSET_UPLOAD_RESPONSE');
      }
      return {
        method: 'PUT' as const,
        url: session.url,
        headers: session.headers || {}
      };
    },
    createMultipartUpload: async (file) => {
      const session = await ensureSession(file);
      if (session.kind !== 'multipart') {
        throw new ToolTaskClientError('INVALID_ASSET_UPLOAD_RESPONSE');
      }
      return { uploadId: session.id, key: session.id };
    },
    listParts: async (_file, { uploadId, signal }) => {
      const json = await jsonRequest(`/api/asset-uploads/${encodeURIComponent(String(uploadId))}/parts`, {
        signal
      });
      return (Array.isArray(json?.parts) ? json.parts : []).map((part: any) => ({
        PartNumber: Number(part.partNumber),
        ETag: String(part.etag || ''),
        Size: Number(part.size || 0)
      }));
    },
    signPart: async (_file, { uploadId, partNumber, signal }) => {
      const json = await jsonRequest(
        `/api/asset-uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}/sign`,
        { method: 'POST', body: '{}', signal }
      );
      return { method: 'PUT' as const, url: String(json?.url || ''), headers: json?.headers || {} };
    },
    completeMultipartUpload: async (file, { uploadId, parts, signal }) => {
      const json = await jsonRequest(`/api/asset-uploads/${encodeURIComponent(uploadId)}/complete`, {
        method: 'POST',
        body: JSON.stringify({ parts }),
        signal
      });
      const asset = assertAsset(json?.asset);
      assets.set(file.id, asset);
      return { location: buildApiUrl(`/api/assets/${encodeURIComponent(asset.assetId)}`) };
    },
    abortMultipartUpload: async (_file, { uploadId, signal }) => {
      await jsonRequest(`/api/asset-uploads/${encodeURIComponent(String(uploadId))}`, {
        method: 'DELETE',
        signal
      });
    }
  };
  uppy.use(AwsS3, awsOptions);

  const abort = () => uppy.cancelAll();
  input.signal?.addEventListener('abort', abort, { once: true });
  uppy.on('progress', (progress) => input.onProgress?.(progress));
  try {
    input.files.forEach((file, sourceIndex) => {
      uppy.addFile({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: file,
        meta: { sourceIndex }
      });
    });
    const result = await uppy.upload();
    if (result?.failed?.length) {
      throw result.failed[0].error || new ToolTaskClientError('ASSET_UPLOAD_FAILED', { retryable: true });
    }
    for (const file of result?.successful || []) {
      if (assets.has(file.id)) continue;
      const session = await ensureSession(file);
      const json = await jsonRequest(`/api/asset-uploads/${encodeURIComponent(session.id)}/complete`, {
        method: 'POST',
        body: JSON.stringify({ parts: [] }),
        signal: input.signal
      });
      assets.set(file.id, assertAsset(json?.asset));
    }
    return input.files.map((_file, index) => {
      const uppyFile = Object.values(uppy.getFiles()).find(
        (file) => Number(file.meta.sourceIndex) === index
      );
      const assetId = uppyFile ? assets.get(uppyFile.id)?.assetId : '';
      if (!assetId) throw new ToolTaskClientError('INVALID_ASSET_UPLOAD_RESPONSE');
      return assetId;
    });
  } finally {
    input.signal?.removeEventListener('abort', abort);
    uppy.destroy();
  }
};
