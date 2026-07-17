import { cloneDocument } from '../domain/factory';
import { collectDocumentAssetIds, findUnreachableAssetIds } from '../domain/reachability';
import type {
  EditorAssetRecord,
  EditorDocumentV2,
  EditorProjectRecord
} from '../domain/types';

const DATABASE_NAME = 'artigen-editor-v2';
const DATABASE_VERSION = 1;
const ASSETS_STORE = 'assets';
const PROJECTS_STORE = 'projects';

export class EditorStorageUnavailableError extends Error {
  constructor(message = '当前浏览器无法使用本地草稿存储。') {
    super(message);
    this.name = 'EditorStorageUnavailableError';
  }
}

export class EditorDatabase {
  private databasePromise: Promise<IDBDatabase> | null = null;

  async putAsset(input: {
    id?: string;
    blob: Blob;
    name: string;
    width: number;
    height: number;
  }): Promise<EditorAssetRecord> {
    const now = new Date().toISOString();
    const record: EditorAssetRecord = {
      id: input.id ?? createAssetId(),
      blob: input.blob,
      mimeType: input.blob.type || 'application/octet-stream',
      name: input.name || 'asset',
      size: input.blob.size,
      width: Math.max(1, Math.round(input.width)),
      height: Math.max(1, Math.round(input.height)),
      createdAt: now,
      lastAccessedAt: now
    };
    const database = await this.open();
    const transaction = database.transaction(ASSETS_STORE, 'readwrite');
    const completed = transactionComplete(transaction);
    transaction.objectStore(ASSETS_STORE).put(record);
    await completed;
    return record;
  }

  async getAsset(assetId: string): Promise<EditorAssetRecord | null> {
    const database = await this.open();
    const transaction = database.transaction(ASSETS_STORE, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(ASSETS_STORE);
    const record = (await requestResult(store.get(assetId))) as EditorAssetRecord | undefined;
    if (record) {
      record.lastAccessedAt = new Date().toISOString();
      store.put(record);
    }
    await completed;
    return record ?? null;
  }

  async getAssetBlob(assetId: string): Promise<Blob | null> {
    return (await this.getAsset(assetId))?.blob ?? null;
  }

  async saveProject(document: EditorDocumentV2): Promise<EditorProjectRecord> {
    const record: EditorProjectRecord = {
      projectId: document.projectId,
      document: cloneDocument(document),
      assetIds: [...collectDocumentAssetIds(document)],
      savedAt: new Date().toISOString()
    };
    const database = await this.open();
    const transaction = database.transaction(PROJECTS_STORE, 'readwrite');
    const completed = transactionComplete(transaction);
    transaction.objectStore(PROJECTS_STORE).put(record);
    await completed;
    return record;
  }

  async getProject(projectId: string): Promise<EditorProjectRecord | null> {
    const database = await this.open();
    const transaction = database.transaction(PROJECTS_STORE, 'readonly');
    const completed = transactionComplete(transaction);
    const record = (await requestResult(
      transaction.objectStore(PROJECTS_STORE).get(projectId)
    )) as EditorProjectRecord | undefined;
    await completed;
    return record ?? null;
  }

  async getMostRecentProject(): Promise<EditorProjectRecord | null> {
    const projects = await this.listProjects();
    return projects.sort((left, right) => right.savedAt.localeCompare(left.savedAt))[0] ?? null;
  }

  async listProjects(): Promise<EditorProjectRecord[]> {
    const database = await this.open();
    const transaction = database.transaction(PROJECTS_STORE, 'readonly');
    const completed = transactionComplete(transaction);
    const records = (await requestResult(
      transaction.objectStore(PROJECTS_STORE).getAll()
    )) as EditorProjectRecord[];
    await completed;
    return records;
  }

  async deleteProject(projectId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PROJECTS_STORE, 'readwrite');
    const completed = transactionComplete(transaction);
    transaction.objectStore(PROJECTS_STORE).delete(projectId);
    await completed;
  }

  async garbageCollectAssets(): Promise<string[]> {
    const database = await this.open();
    const transaction = database.transaction([ASSETS_STORE, PROJECTS_STORE], 'readwrite');
    const completed = transactionComplete(transaction);
    const assetsStore = transaction.objectStore(ASSETS_STORE);
    const projectsStore = transaction.objectStore(PROJECTS_STORE);
    const [assetIds, projects] = await Promise.all([
      requestResult(assetsStore.getAllKeys()) as Promise<IDBValidKey[]>,
      requestResult(projectsStore.getAll()) as Promise<EditorProjectRecord[]>
    ]);
    const unreachable = findUnreachableAssetIds(assetIds.map(String), projects);
    for (const id of unreachable) assetsStore.delete(id);
    await completed;
    return unreachable;
  }

  close(): void {
    const databasePromise = this.databasePromise;
    this.databasePromise = null;
    void databasePromise?.then((database) => database.close()).catch(() => {
      // A failed open has no live database handle to close.
    });
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new EditorStorageUnavailableError());
    }
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(ASSETS_STORE)) {
            database.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
            const projects = database.createObjectStore(PROJECTS_STORE, { keyPath: 'projectId' });
            projects.createIndex('savedAt', 'savedAt');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new EditorStorageUnavailableError());
        request.onblocked = () => reject(new EditorStorageUnavailableError('草稿数据库正在被其他页面占用。'));
      });
    }
    return this.databasePromise;
  }
}

function createAssetId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `asset_${id}`;
}

function requestResult<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}
