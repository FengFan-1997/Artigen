import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorDocument } from '../editor/domain/factory';
import type { EditorAssetRecord, EditorProjectRecord } from '../editor/domain/types';

const openLegacyDatabase = (
  name: string,
  upgrade: (database: IDBDatabase) => void
) => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => upgrade(request.result);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
});

const putLegacy = (database: IDBDatabase, store: string, value: unknown, key?: IDBValidKey) =>
  new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    const request = key === undefined
      ? transaction.objectStore(store).put(value)
      : transaction.objectStore(store).put(value, key);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

const deleteDatabase = (name: string) => new Promise<void>((resolve) => {
  const request = indexedDB.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => resolve();
  request.onblocked = () => resolve();
});

const readNativeDatabaseVersion = (name: string) => new Promise<number>((resolve, reject) => {
  const request = indexedDB.open(name);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const version = database.version;
    database.close();
    resolve(version);
  };
});

afterEach(async () => {
  const workspace = await import('./generationWorkspaceDb');
  const workshop = await import('./workshopTasks');
  workspace.closeGenerationWorkspaceDatabase();
  workshop.closeWorkshopTaskDatabase();
  await Promise.all([
    deleteDatabase('artigen-generation-workspace'),
    deleteDatabase('artigen-editor-v2'),
    deleteDatabase('artigen-workshop-tasks')
  ]);
  vi.restoreAllMocks();
});

describe('Dexie adoption of native IndexedDB data', () => {
  it('reads the existing generation workspace without copying records', async () => {
    const legacy = await openLegacyDatabase('artigen-generation-workspace', (database) => {
      database.createObjectStore('workspace');
    });
    const profile = { version: 1, name: 'existing profile', productType: 'shoe' };
    const pending = { version: 1, taskId: 'existing-task', createdAt: 123 };
    await putLegacy(legacy, 'workspace', profile, 'product-profile-v1');
    await putLegacy(legacy, 'workspace', pending, 'pending-generation-v1');
    legacy.close();

    const storage = await import('./generationWorkspaceDb');
    await expect(storage.loadProductProfile()).resolves.toEqual(profile);
    await expect(storage.loadPendingGeneration()).resolves.toEqual(pending);
    await expect(readNativeDatabaseVersion('artigen-generation-workspace')).resolves.toBe(1);
  });

  it('reads existing editor projects and assets with the original key paths', async () => {
    const legacy = await openLegacyDatabase('artigen-editor-v2', (database) => {
      database.createObjectStore('assets', { keyPath: 'id' });
      const projects = database.createObjectStore('projects', { keyPath: 'projectId' });
      projects.createIndex('savedAt', 'savedAt');
    });
    const document = createEditorDocument({ projectId: 'legacy-project', title: '旧草稿' });
    const asset: EditorAssetRecord = {
      id: 'legacy-asset',
      blob: new Blob(['legacy'], { type: 'image/png' }),
      mimeType: 'image/png',
      name: 'legacy.png',
      size: 6,
      width: 1,
      height: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAccessedAt: '2026-01-01T00:00:00.000Z'
    };
    const project: EditorProjectRecord = {
      projectId: document.projectId,
      document,
      assetIds: [asset.id],
      savedAt: '2026-01-01T00:00:00.000Z'
    };
    await putLegacy(legacy, 'assets', asset);
    await putLegacy(legacy, 'projects', project);
    legacy.close();

    const { EditorDatabase } = await import('../editor/assets/EditorDatabase');
    const database = new EditorDatabase();
    await expect(database.getProject('legacy-project')).resolves.toMatchObject({
      projectId: 'legacy-project',
      document: { title: '旧草稿' }
    });
    await expect(database.getAssetBlob('legacy-asset')).resolves.toMatchObject({ size: 6 });
    database.close();
    await expect(readNativeDatabaseVersion('artigen-editor-v2')).resolves.toBe(1);
  });

  it('keeps recoverable workshop tasks from the native store', async () => {
    const legacy = await openLegacyDatabase('artigen-workshop-tasks', (database) => {
      database.createObjectStore('pending');
    });
    await putLegacy(legacy, 'pending', {
      version: 1,
      slot: 'old-photo',
      toolId: 'old-photo',
      operation: 'enhance',
      options: {},
      quote: { quoteId: 'quote', sku: 'sku', credits: 1, expiresAt: '2026-01-01' },
      idempotencyKey: 'legacy-key',
      requestDigest: 'legacy-digest',
      file: null,
      taskId: 'legacy-task',
      createdAt: 123
    }, 'old-photo');
    legacy.close();

    const workshop = await import('./workshopTasks');
    await expect(workshop.loadPendingWorkshopTask('old-photo')).resolves.toMatchObject({
      taskId: 'legacy-task',
      slot: 'old-photo'
    });
    await expect(readNativeDatabaseVersion('artigen-workshop-tasks')).resolves.toBe(1);
  });
});
