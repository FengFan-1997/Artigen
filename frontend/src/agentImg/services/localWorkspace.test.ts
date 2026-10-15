import 'fake-indexeddb/auto';
import { afterAll, describe, it, expect } from 'vitest';
import {
  readLocalText,
  writeLocalText,
  contentHash,
  sensitiveFile,
  saveEditorDraft,
  loadEditorDraft,
  clearEditorDraft,
  closeWorkspaceDatabase,
  MAX_DRAFT_BYTES,
  type LocalFile
} from './localWorkspace';
import { stageWorkspaceAttachment, takeWorkspaceAttachment } from './workspaceAttachmentTransfer';
import { changedLineCounts } from './workspaceChanges';
afterAll(() => closeWorkspaceDatabase());
describe('local workspace safety', () => {
  it('refuses conflicts and permission denial without opening a writable stream', async () => {
    let opened = 0;
    const handle = {
      queryPermission: async () => 'granted',
      getFile: async () => new File(['external edit'], 'file.txt'),
      createWritable: async () => {
        opened++;
        throw Error('unexpected write');
      }
    } as unknown as LocalFile;
    await expect(
      writeLocalText(handle, 'candidate', await contentHash('original'))
    ).rejects.toThrow('VERSION_CONFLICT');
    expect(opened).toBe(0);
    const denied = {
      ...handle,
      queryPermission: async () => 'denied',
      requestPermission: async () => 'denied'
    } as unknown as LocalFile;
    await expect(writeLocalText(denied, 'candidate', 'hash')).rejects.toThrow('PERMISSION_DENIED');
    expect(opened).toBe(0);
  });
  it('keeps UTF-8 BOM and rejects malformed UTF-8', async () => {
    const handle = {
      getFile: async () => new File([new Uint8Array([239, 187, 191, 65])], 'a.txt')
    } as unknown as LocalFile;
    expect(await readLocalText(handle)).toBe('\ufeffA');
    await expect(
      readLocalText({
        getFile: async () => new File([new Uint8Array([255])], 'bad')
      } as unknown as LocalFile)
    ).rejects.toThrow('NOT_UTF8');
  });
  it('isolates account drafts and enforces budget and sensitive file exclusions', async () => {
    await saveEditorDraft('owner-a', 'project-one:file', 'brief.md', 'draft', 'base');
    expect(await loadEditorDraft('owner-b', 'project-one:file')).toBeUndefined();
    expect((await loadEditorDraft('owner-a', 'project-one:file'))?.text).toBe('draft');
    expect(await saveEditorDraft('owner-a', 'secret', '.env.local', 'secret', '')).toBe(false);
    expect(sensitiveFile('keys/server.pem')).toBe(true);
    await expect(
      saveEditorDraft('owner-a', 'oversize', 'brief.md', 'a'.repeat(MAX_DRAFT_BYTES), '')
    ).rejects.toThrow('QUOTA');
    await clearEditorDraft('owner-a', 'project-one:file');
    expect(await loadEditorDraft('owner-a', 'project-one:file')).toBeUndefined();
  });
  it('does not transfer another account or project file into a chat', () => {
    const attachment = {
      owner: 'a',
      project: 'p',
      file: new File(['x'], 'a.txt'),
      reference: {
        source: 'local' as const,
        id: 'a',
        name: 'a.txt',
        projectId: 'p',
        sha256: 'a'.repeat(64)
      }
    };
    stageWorkspaceAttachment('a', 'p', attachment);
    expect(takeWorkspaceAttachment('b', 'p')).toBeNull();
    stageWorkspaceAttachment('a', 'p', attachment);
    expect(takeWorkspaceAttachment('a', 'other')).toBeNull();
    stageWorkspaceAttachment('a', 'p', attachment);
    expect(takeWorkspaceAttachment('a', 'p')).toEqual(attachment);
    expect(takeWorkspaceAttachment('a', 'p')).toBeNull();
  });
  it('counts actual changed lines once', () => {
    expect(changedLineCounts('red red\nkeep\n', 'blue blue\nkeep\n')).toEqual({
      added: 1,
      removed: 1
    });
    expect(changedLineCounts('', 'new')).toEqual({ added: 1, removed: 0 });
    expect(changedLineCounts('old', '')).toEqual({ added: 0, removed: 1 });
  });
});
