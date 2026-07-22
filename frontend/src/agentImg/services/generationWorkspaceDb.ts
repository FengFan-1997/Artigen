import Dexie, { type Table } from 'dexie';
import type {
  PendingGenerationSubmission,
  ProductProfileSnapshot
} from '../domain/generationWorkspace';
import {
  classifyStorageIssue,
  notifyStorageChanged,
  reportStorageIssue
} from './browserStorageEvents';

const DATABASE_NAME = 'artigen-generation-workspace';
const DATABASE_VERSION = 1;
const STORE_NAME = 'workspace';
const PROFILE_KEY = 'product-profile-v1';
const PENDING_KEY = 'pending-generation-v1';

class GenerationWorkspaceDatabase extends Dexie {
  workspace!: Table<unknown, string>;

  constructor() {
    super(DATABASE_NAME);
    // Keep the original database name, logical version and out-of-line key
    // store. Dexie can open the native IndexedDB records without a data copy.
    this.version(DATABASE_VERSION).stores({ [STORE_NAME]: '' });
    this.on('blocked', () => reportStorageIssue('blocked', DATABASE_NAME));
    this.on('versionchange', () => {
      reportStorageIssue('versionchange', DATABASE_NAME);
      this.close();
    });
  }
}

let database: GenerationWorkspaceDatabase | null = null;
const getDatabase = () => {
  if (typeof indexedDB === 'undefined') throw new Error('INDEXEDDB_UNAVAILABLE');
  if (!database || !database.isOpen()) database = new GenerationWorkspaceDatabase();
  return database;
};

const read = async <T>(key: string): Promise<T | null> => {
  try {
    return ((await getDatabase().workspace.get(key)) as T | undefined) ?? null;
  } catch (error) {
    reportStorageIssue(classifyStorageIssue(error), DATABASE_NAME, error);
    return null;
  }
};

const write = async (key: string, value: unknown): Promise<boolean> => {
  try {
    await getDatabase().workspace.put(value, key);
    notifyStorageChanged(DATABASE_NAME, STORE_NAME, key);
    return true;
  } catch (error) {
    reportStorageIssue(classifyStorageIssue(error), DATABASE_NAME, error);
    return false;
  }
};

const remove = async (key: string): Promise<void> => {
  try {
    await getDatabase().workspace.delete(key);
    notifyStorageChanged(DATABASE_NAME, STORE_NAME, key);
  } catch (error) {
    reportStorageIssue(classifyStorageIssue(error), DATABASE_NAME, error);
  }
};

export const loadProductProfile = () => read<ProductProfileSnapshot>(PROFILE_KEY);
export const saveProductProfile = (profile: ProductProfileSnapshot) => write(PROFILE_KEY, profile);

export const loadPendingGeneration = () => read<PendingGenerationSubmission>(PENDING_KEY);
export const savePendingGeneration = (pending: PendingGenerationSubmission) =>
  write(PENDING_KEY, pending);
export const clearPendingGeneration = () => remove(PENDING_KEY);

export const closeGenerationWorkspaceDatabase = () => {
  database?.close();
  database = null;
};
