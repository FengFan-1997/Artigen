import Dexie, { type Table } from 'dexie';
import { cloneDocument } from '../domain/factory';
import { collectDocumentAssetIds, findUnreachableAssetIds } from '../domain/reachability';
import type {
  EditorAssetRecord,
  EditorDocumentV2,
  EditorProjectRecord
} from '../domain/types';
import {
  classifyStorageIssue,
  notifyStorageChanged,
  reportStorageIssue
} from '../../services/browserStorageEvents';

const DATABASE_NAME = 'artigen-editor-v2';
// Dexie multiplies schema versions by 10 before opening native IndexedDB.
// Using 0.1 preserves the existing native database version at exactly 1.
const DEXIE_SCHEMA_VERSION = 0.1;
const ASSETS_STORE = 'assets';
const PROJECTS_STORE = 'projects';

export class EditorStorageUnavailableError extends Error {
  issue: ReturnType<typeof classifyStorageIssue>;

  constructor(message = '当前浏览器无法使用本地草稿存储。', issue: ReturnType<typeof classifyStorageIssue> = 'unavailable') {
    super(message);
    this.name = 'EditorStorageUnavailableError';
    this.issue = issue;
  }
}

class EditorDexieDatabase extends Dexie {
  assets!: Table<EditorAssetRecord, string>;
  projects!: Table<EditorProjectRecord, string>;

  constructor() {
    super(DATABASE_NAME);
    // This exactly mirrors the original native IndexedDB key paths and index.
    // Existing projects and blobs remain in-place during Dexie's schema adoption.
    this.version(DEXIE_SCHEMA_VERSION).stores({
      [ASSETS_STORE]: 'id',
      [PROJECTS_STORE]: 'projectId,savedAt'
    });
    this.on('blocked', () => reportStorageIssue('blocked', DATABASE_NAME));
    this.on('versionchange', () => {
      reportStorageIssue('versionchange', DATABASE_NAME);
      this.close();
    });
  }
}

const storageError = (error: unknown) => {
  const issue = classifyStorageIssue(error);
  reportStorageIssue(issue, DATABASE_NAME, error);
  const message = issue === 'quota'
    ? '本地存储空间不足，当前项目仍保留在页面中，请导出或清理旧草稿后重试。'
    : issue === 'blocked' || issue === 'versionchange'
      ? '草稿数据库已在其他标签页更新，请刷新页面后重试；当前项目尚未丢失。'
      : '当前浏览器无法写入本地草稿；当前项目仍保留在页面中。';
  return new EditorStorageUnavailableError(message, issue);
};

export class EditorDatabase {
  private database: EditorDexieDatabase | null = null;

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
    try {
      await this.open().assets.put(record);
      notifyStorageChanged(DATABASE_NAME, ASSETS_STORE, record.id);
      return record;
    } catch (error) {
      throw storageError(error);
    }
  }

  async getAsset(assetId: string): Promise<EditorAssetRecord | null> {
    try {
      const database = this.open();
      return await database.transaction('rw', database.assets, async () => {
        const record = await database.assets.get(assetId);
        if (!record) return null;
        record.lastAccessedAt = new Date().toISOString();
        await database.assets.put(record);
        return record;
      });
    } catch (error) {
      throw storageError(error);
    }
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
    try {
      await this.open().projects.put(record);
      notifyStorageChanged(DATABASE_NAME, PROJECTS_STORE, record.projectId);
      return record;
    } catch (error) {
      throw storageError(error);
    }
  }

  async getProject(projectId: string): Promise<EditorProjectRecord | null> {
    try {
      return (await this.open().projects.get(projectId)) ?? null;
    } catch (error) {
      throw storageError(error);
    }
  }

  async getMostRecentProject(): Promise<EditorProjectRecord | null> {
    try {
      return (await this.open().projects.orderBy('savedAt').last()) ?? null;
    } catch (error) {
      throw storageError(error);
    }
  }

  async listProjects(): Promise<EditorProjectRecord[]> {
    try {
      return await this.open().projects.toArray();
    } catch (error) {
      throw storageError(error);
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      await this.open().projects.delete(projectId);
      notifyStorageChanged(DATABASE_NAME, PROJECTS_STORE, projectId);
    } catch (error) {
      throw storageError(error);
    }
  }

  async garbageCollectAssets(): Promise<string[]> {
    try {
      const database = this.open();
      return await database.transaction('rw', database.assets, database.projects, async () => {
        const [assetIds, projects] = await Promise.all([
          database.assets.toCollection().primaryKeys(),
          database.projects.toArray()
        ]);
        const unreachable = findUnreachableAssetIds(assetIds.map(String), projects);
        await database.assets.bulkDelete(unreachable);
        for (const id of unreachable) notifyStorageChanged(DATABASE_NAME, ASSETS_STORE, id);
        return unreachable;
      });
    } catch (error) {
      throw storageError(error);
    }
  }

  close(): void {
    this.database?.close();
    this.database = null;
  }

  private open(): EditorDexieDatabase {
    if (typeof indexedDB === 'undefined') throw new EditorStorageUnavailableError();
    if (!this.database) this.database = new EditorDexieDatabase();
    return this.database;
  }
}

function createAssetId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `asset_${id}`;
}
