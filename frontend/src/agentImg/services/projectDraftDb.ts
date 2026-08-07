import Dexie, { type Table } from 'dexie';

export type CreativeProjectDraft = {
  id: 'current';
  title: string;
  productName: string;
  brief: string;
  productFile?: File | null;
  updatedAt: number;
};

class ProjectDraftDatabase extends Dexie {
  drafts!: Table<CreativeProjectDraft, string>;

  constructor() {
    super('artigen-creative-project-drafts');
    this.version(1).stores({ drafts: 'id,updatedAt' });
  }
}

let database: ProjectDraftDatabase | null = null;

const getDatabase = () => {
  if (typeof indexedDB === 'undefined') throw new Error('INDEXEDDB_UNAVAILABLE');
  if (!database || !database.isOpen()) database = new ProjectDraftDatabase();
  return database;
};

export const saveCreativeProjectDraft = async (
  draft: Omit<CreativeProjectDraft, 'id' | 'updatedAt'>
) => {
  try {
    await getDatabase().drafts.put({ ...draft, id: 'current', updatedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
};

export const loadCreativeProjectDraft = async () => {
  try {
    return (await getDatabase().drafts.get('current')) || null;
  } catch {
    return null;
  }
};

export const clearCreativeProjectDraft = async () => {
  try {
    await getDatabase().drafts.delete('current');
  } catch {}
};

export const closeCreativeProjectDraftDatabase = () => {
  database?.close();
  database = null;
};
