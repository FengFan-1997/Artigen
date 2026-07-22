import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';
import type { ToolTaskStatus } from '../domain/toolTask';
import type { ToolTaskAsset, ToolTaskReceipt, ToolTaskResult } from '../domain/toolTask';

const QUOTE_URL = buildApiUrl('/api/tool-tasks/quote');
const TASKS_URL = buildApiUrl('/api/tool-tasks');

export type ToolTaskQuote = {
  quoteId: string;
  sku: string;
  credits: number;
  expiresAt: string;
};

export type ServerToolTask = {
  taskId: string;
  toolId: string;
  operation: string;
  status: Extract<ToolTaskStatus, 'queued' | 'running' | 'success' | 'failed' | 'cancelled'>;
  assets: ToolTaskAsset[];
  warnings: Array<{ code: string; messageKey: string }>;
  result: ToolTaskResult | null;
  error: null | { code: string; messageKey?: string; retryable?: boolean };
  receipt: ToolTaskReceipt;
};

export type GenerationModelProfile = {
  id: string;
  name: string | { zh?: string; en?: string };
  available: boolean;
  capabilities: string[];
  maxReferences: number;
  aspectRatios: string[];
  supportsSeed: boolean;
};

export class ToolTaskClientError extends Error {
  code: string;
  field?: string;
  retryable: boolean;

  constructor(code: string, options?: { field?: string; retryable?: boolean }) {
    super(code);
    this.name = 'ToolTaskClientError';
    this.code = code;
    this.field = options?.field;
    this.retryable = Boolean(options?.retryable);
  }
}

const errorFromResponse = async (response: Response) => {
  const json: any = await response.json().catch(() => null);
  const raw = json?.error;
  if (raw && typeof raw === 'object') {
    return new ToolTaskClientError(String(raw.code || 'TOOL_TASK_FAILED'), {
      field: typeof raw.field === 'string' ? raw.field : undefined,
      retryable: Boolean(raw.retryable)
    });
  }
  return new ToolTaskClientError(
    typeof raw === 'string' && raw.trim() ? raw.trim() : `API_ERROR_${response.status}`
  );
};

const assertTask = (raw: any): ServerToolTask => {
  const taskId = typeof raw?.taskId === 'string' ? raw.taskId.trim() : '';
  const status = String(raw?.status || '');
  if (!taskId || !['queued', 'running', 'success', 'failed', 'cancelled'].includes(status)) {
    throw new ToolTaskClientError('INVALID_TASK_RESPONSE');
  }
  return raw as ServerToolTask;
};

export const quoteToolTask = async (
  input: { toolId: string; operation: string },
  signal?: AbortSignal
): Promise<ToolTaskQuote> => {
  const response = await authFetch(QUOTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolId: input.toolId, operation: input.operation }),
    signal
  });
  if (!response.ok) throw await errorFromResponse(response);
  const json: any = await response.json().catch(() => null);
  const quote = json?.quote;
  const quoteId = typeof quote?.quoteId === 'string' ? quote.quoteId.trim() : '';
  const sku = typeof quote?.sku === 'string' ? quote.sku.trim() : '';
  const credits = Number(quote?.credits);
  const expiresAt = typeof quote?.expiresAt === 'string' ? quote.expiresAt.trim() : '';
  if (!quoteId || !sku || !Number.isSafeInteger(credits) || credits < 0 || !expiresAt) {
    throw new ToolTaskClientError('INVALID_QUOTE_RESPONSE');
  }
  return { quoteId, sku, credits, expiresAt };
};

export const createIdempotencyKey = () => {
  try {
    return `web:${crypto.randomUUID()}`;
  } catch {
    return `web:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
  }
};

export const createToolTask = async (input: {
  toolId: string;
  operation: string;
  options?: Record<string, unknown>;
  quoteId: string;
  file?: File;
  files?: File[];
  inputAssets?: string[];
  idempotencyKey?: string;
  signal?: AbortSignal;
  onUploadProgress?: (progress: number) => void;
}): Promise<ServerToolTask> => {
  const idempotencyKey = input.idempotencyKey || createIdempotencyKey();
  let files = input.files?.length ? input.files : input.file ? [input.file] : [];
  let inputAssets = [...(input.inputAssets || [])];
  if (files.length) {
    try {
      const { uploadTaskAssets } = await import('./directAssetUploads');
      const uploaded = await uploadTaskAssets({
        toolId: input.toolId,
        operation: input.operation,
        files,
        taskIdempotencyKey: idempotencyKey,
        signal: input.signal,
        onProgress: input.onUploadProgress
      });
      inputAssets = [...inputAssets, ...uploaded];
      files = [];
    } catch (error) {
      const { shouldFallbackToMultipart } = await import('./directAssetUploads');
      if (!shouldFallbackToMultipart(error)) throw error;
    }
  }
  const form = new FormData();
  form.set('toolId', input.toolId);
  form.set('operation', input.operation);
  form.set('options', JSON.stringify(input.options || {}));
  form.set('inputAssets', JSON.stringify(inputAssets));
  form.set('quoteId', input.quoteId);
  for (const file of files) form.append('files', file, file.name);
  const response = await authFetch(TASKS_URL, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: form,
    signal: input.signal
  });
  if (!response.ok) throw await errorFromResponse(response);
  const json: any = await response.json().catch(() => null);
  return assertTask(json?.task);
};

export const getToolTask = async (taskId: string, signal?: AbortSignal) => {
  const response = await authFetch(buildApiUrl(`/api/tool-tasks/${encodeURIComponent(taskId)}`), {
    signal
  });
  if (!response.ok) throw await errorFromResponse(response);
  const json: any = await response.json().catch(() => null);
  return assertTask(json?.task);
};

export const cancelToolTask = async (taskId: string) => {
  const response = await authFetch(buildApiUrl(`/api/tool-tasks/${encodeURIComponent(taskId)}`), {
    method: 'DELETE'
  });
  if (!response.ok) throw await errorFromResponse(response);
  const json: any = await response.json().catch(() => null);
  return assertTask(json?.task);
};

const waitWithSignal = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  let settled = false;
  const cleanup = () => signal?.removeEventListener('abort', abort);
  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve();
  };
  const timer = window.setTimeout(finish, ms);
  const abort = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    cleanup();
    reject(new DOMException('Aborted', 'AbortError'));
  };
  if (signal?.aborted) return abort();
  signal?.addEventListener('abort', abort, { once: true });
});

export const waitForToolTask = async (
  initial: ServerToolTask,
  options?: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number }
): Promise<ServerToolTask> => {
  const startedAt = Date.now();
  const timeoutMs = Math.max(5_000, Math.min(5 * 60_000, options?.timeoutMs ?? 180_000));
  const intervalMs = Math.max(250, Math.min(5_000, options?.intervalMs ?? 1_000));
  let task = initial;
  while (task.status === 'queued' || task.status === 'running') {
    if (Date.now() - startedAt >= timeoutMs) throw new ToolTaskClientError('TASK_POLL_TIMEOUT', { retryable: true });
    await waitWithSignal(intervalMs, options?.signal);
    task = await getToolTask(task.taskId, options?.signal);
  }
  return task;
};

export const taskAssetUrl = (assetId: string) =>
  buildApiUrl(`/api/assets/${encodeURIComponent(assetId)}`);

export const getGenerationModels = async (signal?: AbortSignal): Promise<GenerationModelProfile[]> => {
  const response = await authFetch(buildApiUrl('/api/generation/models'), { signal });
  if (!response.ok) throw await errorFromResponse(response);
  const json: any = await response.json().catch(() => null);
  const list = Array.isArray(json?.models) ? json.models : [];
  return list
    .map((raw: any): GenerationModelProfile | null => {
      const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
      const name = typeof raw?.name === 'string' || (raw?.name && typeof raw.name === 'object')
        ? raw.name
        : '';
      if (!id || !name) return null;
      return {
        id,
        name,
        available: raw?.available !== false,
        capabilities: Array.isArray(raw?.capabilities)
          ? raw.capabilities.map((value: unknown) => String(value || '').trim()).filter(Boolean)
          : [],
        maxReferences: Math.max(0, Math.min(3, Number(raw?.maxReferences) || 0)),
        aspectRatios: Array.isArray(raw?.aspectRatios)
          ? raw.aspectRatios.map((value: unknown) => String(value || '').trim()).filter(Boolean)
          : [],
        supportsSeed: Boolean(raw?.supportsSeed)
      };
    })
    .filter((profile: GenerationModelProfile | null): profile is GenerationModelProfile => profile !== null);
};

export const createEditorTransfer = async (assetId: string): Promise<string> => {
  const response = await authFetch(buildApiUrl('/api/editor/transfers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId })
  });
  if (!response.ok) throw await errorFromResponse(response);
  const json: any = await response.json().catch(() => null);
  const transferId = typeof json?.transferId === 'string'
    ? json.transferId.trim()
    : typeof json?.transfer?.transferId === 'string'
      ? json.transfer.transferId.trim()
      : '';
  if (!transferId) throw new ToolTaskClientError('EDITOR_TRANSFER_INVALID_RESPONSE');
  return transferId;
};
