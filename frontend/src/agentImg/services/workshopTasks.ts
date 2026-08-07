import Dexie, { type Table } from 'dexie';
import {
  cancelToolTask,
  createIdempotencyKey,
  createToolTask,
  getToolTask,
  waitForToolTask,
  ToolTaskClientError,
  type ServerToolTask,
  type ToolTaskQuote
} from './toolTasks';
import {
  classifyStorageIssue,
  notifyStorageChanged,
  reportStorageIssue
} from './browserStorageEvents';

const DATABASE_NAME = 'artigen-workshop-tasks';
// Dexie multiplies schema versions by 10 before opening native IndexedDB.
// Using 0.1 preserves the existing native database version at exactly 1.
const DEXIE_SCHEMA_VERSION = 0.1;
const STORE_NAME = 'pending';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingWorkshopTask = {
  version: 1;
  slot: string;
  toolId: string;
  operation: string;
  options: Record<string, unknown>;
  quote: ToolTaskQuote;
  idempotencyKey: string;
  requestDigest: string;
  file: File | null;
  taskId: string;
  cancelRequestedAt?: number;
  createdAt: number;
};

type StoredWorkshopFile = {
  name: string;
  type: string;
  lastModified: number;
  bytes: ArrayBuffer;
};

type StoredPendingWorkshopTask = Omit<PendingWorkshopTask, 'file'> & {
  file: StoredWorkshopFile | File | null;
};

type Persistence = {
  load: (slot: string) => Promise<PendingWorkshopTask | null>;
  save: (pending: PendingWorkshopTask) => Promise<boolean>;
  clear: (slot: string) => Promise<void>;
};

type TaskApi = {
  create: typeof createToolTask;
  get: typeof getToolTask;
  wait: typeof waitForToolTask;
  cancel: typeof cancelToolTask;
};

class WorkshopTaskDatabase extends Dexie {
  pending!: Table<StoredPendingWorkshopTask, string>;

  constructor() {
    super(DATABASE_NAME);
    this.version(DEXIE_SCHEMA_VERSION).stores({ [STORE_NAME]: '' });
    this.on('blocked', () => reportStorageIssue('blocked', DATABASE_NAME));
    this.on('versionchange', () => {
      reportStorageIssue('versionchange', DATABASE_NAME);
      this.close();
    });
  }
}

let workshopDatabase: WorkshopTaskDatabase | null = null;
const getWorkshopDatabase = () => {
  if (typeof indexedDB === 'undefined') throw new Error('INDEXEDDB_UNAVAILABLE');
  if (!workshopDatabase || !workshopDatabase.isOpen()) workshopDatabase = new WorkshopTaskDatabase();
  return workshopDatabase;
};

export const closeWorkshopTaskDatabase = () => {
  workshopDatabase?.close();
  workshopDatabase = null;
};

const restoreFile = (stored: StoredWorkshopFile): File => {
  const parts = [stored.bytes];
  try {
    return new File(parts, stored.name, {
      type: stored.type,
      lastModified: stored.lastModified
    });
  } catch {
    const blob = new Blob(parts, { type: stored.type }) as File;
    Object.defineProperties(blob, {
      name: { value: stored.name, enumerable: true },
      lastModified: { value: stored.lastModified, enumerable: true }
    });
    return blob;
  }
};

export const serializePendingWorkshopTask = async (
  pending: PendingWorkshopTask
): Promise<StoredPendingWorkshopTask> => ({
  ...pending,
  file: pending.file
    ? {
        name: pending.file.name,
        type: pending.file.type,
        lastModified: pending.file.lastModified,
        // WebKit has historically been unreliable when structured-cloning a
        // File directly into IndexedDB. Raw bytes plus metadata are portable.
        bytes: await pending.file.arrayBuffer()
      }
    : null
});

export const deserializePendingWorkshopTask = (
  stored: StoredPendingWorkshopTask
): PendingWorkshopTask | null => {
  if (!stored || typeof stored !== 'object') return null;
  const candidate = stored.file;
  if (!candidate) return { ...stored, file: null };
  if (typeof File !== 'undefined' && candidate instanceof File) {
    return { ...stored, file: candidate };
  }
  const serialized = candidate as StoredWorkshopFile;
  if (
    typeof serialized.name !== 'string' ||
    typeof serialized.type !== 'string' ||
    !Number.isFinite(serialized.lastModified) ||
    !(serialized.bytes instanceof ArrayBuffer)
  ) {
    return null;
  }
  return { ...stored, file: restoreFile(serialized) };
};

const persistence: Persistence = {
  async load(slot) {
    try {
      const stored = await getWorkshopDatabase().pending.get(slot);
      return stored ? deserializePendingWorkshopTask(stored) : null;
    } catch (error) {
      reportStorageIssue(classifyStorageIssue(error), DATABASE_NAME, error);
      return null;
    }
  },
  async save(pending) {
    try {
      const stored = await serializePendingWorkshopTask(pending);
      await getWorkshopDatabase().pending.put(stored, pending.slot);
      notifyStorageChanged(DATABASE_NAME, STORE_NAME, pending.slot);
      return true;
    } catch (error) {
      reportStorageIssue(classifyStorageIssue(error), DATABASE_NAME, error);
      return false;
    }
  },
  async clear(slot) {
    try {
      await getWorkshopDatabase().pending.delete(slot);
      notifyStorageChanged(DATABASE_NAME, STORE_NAME, slot);
    } catch (error) {
      reportStorageIssue(classifyStorageIssue(error), DATABASE_NAME, error);
    }
  }
};

const api: TaskApi = {
  create: createToolTask,
  get: getToolTask,
  wait: waitForToolTask,
  cancel: cancelToolTask
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)])
  );
};

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export const buildWorkshopRequestDigest = async (input: {
  toolId: string;
  operation: string;
  options: Record<string, unknown>;
  quoteId: string;
  file?: File | null;
}) => {
  if (!globalThis.crypto?.subtle) throw new ToolTaskClientError('BROWSER_STORAGE_UNAVAILABLE');
  const file = input.file || null;
  const fileSha256 = file
    ? hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
    : '';
  const payload = JSON.stringify(canonical({
    toolId: input.toolId,
    operation: input.operation,
    options: input.options,
    quoteId: input.quoteId,
    file: file
      ? { name: file.name, type: file.type, size: file.size, sha256: fileSha256 }
      : null
  }));
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)));
};

const isTerminal = (task: ServerToolTask) =>
  task.status === 'success' || task.status === 'failed' || task.status === 'cancelled';

const SAFE_PRE_TASK_ERRORS = new Set([
  'IDEMPOTENCY_CONFLICT',
  'INSUFFICIENT_CREDITS',
  'PRICE_CHANGED',
  'QUOTE_ALREADY_USED',
  'QUOTE_EXPIRED',
  'QUOTE_NOT_FOUND'
]);

const executePending = async (
  pending: PendingWorkshopTask,
  signal: AbortSignal | undefined,
  deps: { persistence: Persistence; api: TaskApi },
  onTask?: (task: ServerToolTask) => void
) => {
  const digest = await buildWorkshopRequestDigest({
    toolId: pending.toolId,
    operation: pending.operation,
    options: pending.options,
    quoteId: pending.quote.quoteId,
    file: pending.file
  });
  if (digest !== pending.requestDigest) {
    await deps.persistence.clear(pending.slot);
    throw new ToolTaskClientError('IDEMPOTENCY_CONFLICT');
  }

  let task: ServerToolTask;
  if (pending.taskId) {
    task = await deps.api.get(pending.taskId, signal);
  } else {
    try {
      task = await deps.api.create({
        toolId: pending.toolId,
        operation: pending.operation,
        options: pending.options,
        quoteId: pending.quote.quoteId,
        ...(pending.file ? { file: pending.file } : {}),
        idempotencyKey: pending.idempotencyKey,
        signal
      });
    } catch (error) {
      if (SAFE_PRE_TASK_ERRORS.has(String((error as any)?.code || ''))) {
        await deps.persistence.clear(pending.slot);
      }
      throw error;
    }
    pending = { ...pending, taskId: task.taskId };
    await deps.persistence.save(pending);
  }
  onTask?.(task);

  if (!isTerminal(task)) {
    task = await deps.api.wait(task, { signal, timeoutMs: 180_000, intervalMs: 1_000 });
  }
  if (isTerminal(task)) await deps.persistence.clear(pending.slot);
  return task;
};

export const startPersistedWorkshopTask = async (input: {
  slot: string;
  toolId: string;
  operation: string;
  options: Record<string, unknown>;
  quote: ToolTaskQuote;
  file?: File | null;
  signal?: AbortSignal;
  onTask?: (task: ServerToolTask) => void;
}, deps = { persistence, api }) => {
  const options = JSON.parse(JSON.stringify(input.options || {})) as Record<string, unknown>;
  const pending: PendingWorkshopTask = {
    version: 1,
    slot: input.slot,
    toolId: input.toolId,
    operation: input.operation,
    options,
    quote: { ...input.quote },
    idempotencyKey: createIdempotencyKey(),
    requestDigest: await buildWorkshopRequestDigest({
      toolId: input.toolId,
      operation: input.operation,
      options,
      quoteId: input.quote.quoteId,
      file: input.file
    }),
    file: input.file || null,
    taskId: '',
    createdAt: Date.now()
  };
  if (!(await deps.persistence.save(pending))) {
    throw new ToolTaskClientError('BROWSER_STORAGE_UNAVAILABLE');
  }
  return executePending(pending, input.signal, deps, input.onTask);
};

export const resumePersistedWorkshopTask = async (
  slot: string,
  signal?: AbortSignal,
  onTask?: (task: ServerToolTask) => void,
  deps = { persistence, api }
) => {
  const pending = await deps.persistence.load(slot);
  if (!pending) return null;
  if (
    pending.version !== 1 ||
    !pending.createdAt ||
    Date.now() - pending.createdAt > MAX_AGE_MS
  ) {
    await deps.persistence.clear(slot);
    return null;
  }
  if (pending.cancelRequestedAt) {
    return cancelPersistedWorkshopTask(slot, onTask, deps);
  }
  return executePending(pending, signal, deps, onTask);
};

export const loadPendingWorkshopTask = (slot: string) => persistence.load(slot);
export const clearPendingWorkshopTask = (slot: string) => persistence.clear(slot);

export const cancelPersistedWorkshopTask = async (
  slot: string,
  onTask?: (task: ServerToolTask) => void,
  deps = { persistence, api }
) => {
  let pending = await deps.persistence.load(slot);
  if (!pending) return null;
  try {
    if (!pending.cancelRequestedAt) {
      pending = { ...pending, cancelRequestedAt: Date.now() };
      if (!(await deps.persistence.save(pending))) {
        throw new ToolTaskClientError('TASK_CANCEL_PENDING', { retryable: true });
      }
    }
    const digest = await buildWorkshopRequestDigest({
      toolId: pending.toolId,
      operation: pending.operation,
      options: pending.options,
      quoteId: pending.quote.quoteId,
      file: pending.file
    });
    if (digest !== pending.requestDigest) {
      throw new ToolTaskClientError('IDEMPOTENCY_CONFLICT');
    }
    let task = pending.taskId
      ? await deps.api.get(pending.taskId)
      : await deps.api.create({
          toolId: pending.toolId,
          operation: pending.operation,
          options: pending.options,
          quoteId: pending.quote.quoteId,
          ...(pending.file ? { file: pending.file } : {}),
          idempotencyKey: pending.idempotencyKey
        });
    if (!pending.taskId) {
      pending = { ...pending, taskId: task.taskId };
      await deps.persistence.save(pending);
    }
    onTask?.(task);
    if (task.status === 'queued' || task.status === 'running') {
      task = await deps.api.cancel(task.taskId);
    }
    if (isTerminal(task)) await deps.persistence.clear(slot);
    return task;
  } catch (error) {
    if (error instanceof ToolTaskClientError && error.code === 'IDEMPOTENCY_CONFLICT') {
      throw error;
    }
    throw new ToolTaskClientError('TASK_CANCEL_PENDING', { retryable: true });
  }
};
