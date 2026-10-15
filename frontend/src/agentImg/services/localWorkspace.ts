import Dexie, { type Table } from 'dexie';
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_DRAFT_BYTES = 5 * 1024 * 1024;
type PermissionHandle = FileSystemHandle & {
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};
export type LocalDirectory = FileSystemDirectoryHandle &
  PermissionHandle & { values(): AsyncIterable<FileSystemHandle> };
export type LocalFile = FileSystemFileHandle &
  PermissionHandle & { createWritable(): Promise<FileSystemWritableFileStream> };
type Root = { key: string; handle: LocalDirectory; identity?: string };
export type EditorDraft = {
  key: string;
  owner: string;
  text: string;
  baseline: string;
  updatedAt: number;
};
class WorkspaceDatabase extends Dexie {
  roots!: Table<Root, string>;
  drafts!: Table<EditorDraft, string>;
  constructor() {
    super('artigen-workspace-local');
    this.version(1).stores({ roots: 'key', drafts: 'key,owner,updatedAt' });
  }
}
const db = new WorkspaceDatabase();
export const localRootKey = (owner: string, project: string) => JSON.stringify([owner, project]);
export const supportsLocalDirectories = () => 'showDirectoryPicker' in window;
export async function chooseLocalRoot(owner: string, project: string) {
  const picker = (
    window as unknown as Window & {
      showDirectoryPicker(options: { mode: 'read' }): Promise<LocalDirectory>;
    }
  ).showDirectoryPicker;
  if (!picker) throw new Error('LOCAL_DIRECTORY_UNSUPPORTED');
  const handle = await picker.call(window, { mode: 'read' });
  await db.roots.put({ key: localRootKey(owner, project), handle, identity: crypto.randomUUID() });
  return handle;
}
export async function restoreLocalRoot(owner: string, project: string) {
  return (await db.roots.get(localRootKey(owner, project)))?.handle || null;
}
export const disconnectLocalRoot = (owner: string, project: string) =>
  db.roots.delete(localRootKey(owner, project));
export async function verifyLocalPermission(
  handle: PermissionHandle,
  write = false,
  prompt = false
) {
  const options = { mode: write ? ('readwrite' as const) : ('read' as const) };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return prompt && (await handle.requestPermission(options)) === 'granted';
}
export const contentHash = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
export const sensitiveFile = (path: string) =>
  /(^|\/)(\.env(?:\..*)?|\.ssh|\.aws|\.git)(\/|$)|\.(pem|key|p12|pfx)$/i.test(path);
export async function readLocalText(handle: LocalFile) {
  const file = await handle.getFile();
  if (file.size > MAX_TEXT_BYTES) throw new Error('WORKSPACE_TEXT_TOO_LARGE');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await file.arrayBuffer()
    );
  } catch {
    throw new Error('WORKSPACE_NOT_UTF8');
  }
}
export async function writeLocalText(handle: LocalFile, text: string, expectedHash: string) {
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES)
    throw new Error('WORKSPACE_TEXT_TOO_LARGE');
  if (!(await verifyLocalPermission(handle, true, true)))
    throw new Error('LOCAL_WRITE_PERMISSION_DENIED');
  const previous = await readLocalText(handle);
  if ((await contentHash(previous)) !== expectedHash) throw new Error('WORKSPACE_VERSION_CONFLICT');
  const stream = await handle.createWritable();
  try {
    await stream.write(text);
    await stream.close();
  } catch (error) {
    await stream.abort().catch(() => {});
    throw error;
  }
  return previous;
}
export async function saveEditorDraft(
  owner: string,
  key: string,
  path: string,
  text: string,
  baseline: string
) {
  if (sensitiveFile(path)) return false;
  const row: EditorDraft = {
    key: JSON.stringify([owner, key]),
    owner,
    text,
    baseline,
    updatedAt: Date.now()
  };
  return db.transaction('rw', db.drafts, async () => {
    const current = await db.drafts.where('owner').equals(owner).toArray();
    const size =
      current
        .filter((d) => d.key !== row.key)
        .reduce((n, d) => n + new TextEncoder().encode(d.text + d.baseline).length, 0) +
      new TextEncoder().encode(text + baseline).length;
    if (size > MAX_DRAFT_BYTES) throw new Error('WORKSPACE_DRAFT_QUOTA');
    await db.drafts.put(row);
    return true;
  });
}
export const loadEditorDraft = (owner: string, key: string) =>
  db.drafts.get(JSON.stringify([owner, key]));
export const clearEditorDraft = (owner: string, key: string) =>
  db.drafts.delete(JSON.stringify([owner, key]));
export const closeWorkspaceDatabase = () => db.close();

export async function localRootIdentity(owner: string, project: string) {
  const row = await db.roots.get(localRootKey(owner, project));
  if (!row) return '';
  if (!row.identity) {
    row.identity = crypto.randomUUID();
    await db.roots.put(row);
  }
  return row.identity;
}
