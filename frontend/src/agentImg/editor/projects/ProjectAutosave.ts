import { cloneDocument } from '../domain/factory';
import type { EditorDocumentV2, EditorProjectRecord } from '../domain/types';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  savedAt?: string;
  error?: Error;
}

export interface DraftReader {
  getMostRecentProject(): Promise<EditorProjectRecord | null>;
}

export async function recoverMostRecentDraft(reader: DraftReader): Promise<EditorDocumentV2 | null> {
  const latest = await reader.getMostRecentProject();
  return latest?.document ? cloneDocument(latest.document) : null;
}

export class ProjectAutosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingDocument: EditorDocumentV2 | null = null;
  private saving: Promise<void> | null = null;

  constructor(
    private readonly save: (document: EditorDocumentV2) => Promise<void>,
    private readonly onStateChange: (state: AutosaveState) => void,
    private readonly delayMs = 750
  ) {}

  schedule(document: EditorDocumentV2): void {
    this.pendingDocument = cloneDocument(document);
    if (this.timer) clearTimeout(this.timer);
    this.onStateChange({ status: 'pending' });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  async flush(): Promise<boolean> {
    if (this.saving) await this.saving;
    const document = this.pendingDocument;
    if (!document) return true;
    this.pendingDocument = null;
    this.onStateChange({ status: 'saving' });
    let succeeded = false;
    this.saving = this.save(document)
      .then(() => {
        succeeded = true;
        this.onStateChange({ status: 'saved', savedAt: new Date().toISOString() });
      })
      .catch((value: unknown) => {
        const error = value instanceof Error ? value : new Error('草稿保存失败');
        if (!this.pendingDocument) this.pendingDocument = cloneDocument(document);
        this.onStateChange({ status: 'error', error });
      })
      .finally(() => {
        this.saving = null;
      });
    await this.saving;
    if (succeeded && this.pendingDocument) return this.flush();
    return succeeded;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pendingDocument = null;
  }
}
