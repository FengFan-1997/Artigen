import { cloneDocument } from '../domain/factory';
import type { EditorDocumentV2 } from '../domain/types';

export interface HistoryEntry {
  id: string;
  label: string;
  before: EditorDocumentV2;
  after: EditorDocumentV2;
  createdAt: number;
  mergeKey?: string;
}

export interface HistoryRecordOptions {
  mergeKey?: string;
  timestamp?: number;
  mergeWindowMs?: number;
}

export class CommandHistory {
  readonly limit: number;
  private undoEntries: HistoryEntry[] = [];
  private redoEntries: HistoryEntry[] = [];

  constructor(limit = 100) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get canUndo(): boolean {
    return this.undoEntries.length > 0;
  }

  get canRedo(): boolean {
    return this.redoEntries.length > 0;
  }

  get undoCount(): number {
    return this.undoEntries.length;
  }

  get redoCount(): number {
    return this.redoEntries.length;
  }

  record(
    label: string,
    before: EditorDocumentV2,
    after: EditorDocumentV2,
    options: HistoryRecordOptions = {}
  ): void {
    if (before === after || documentsEqual(before, after)) return;
    const timestamp = Number.isFinite(options.timestamp) ? Number(options.timestamp) : Date.now();
    const mergeWindowMs = Math.max(0, Number(options.mergeWindowMs ?? 900));
    const mergeKey = String(options.mergeKey || '').trim() || undefined;
    const previous = this.undoEntries[this.undoEntries.length - 1];
    if (
      mergeKey &&
      previous?.mergeKey === mergeKey &&
      timestamp - previous.createdAt <= mergeWindowMs &&
      this.redoEntries.length === 0
    ) {
      previous.label = label;
      previous.after = cloneDocument(after);
      previous.createdAt = timestamp;
      return;
    }
    this.undoEntries.push({
      id: `${timestamp}-${Math.random().toString(36).slice(2)}`,
      label,
      before: cloneDocument(before),
      after: cloneDocument(after),
      createdAt: timestamp,
      ...(mergeKey ? { mergeKey } : {})
    });
    if (this.undoEntries.length > this.limit) {
      this.undoEntries.splice(0, this.undoEntries.length - this.limit);
    }
    this.redoEntries = [];
  }

  undo(current: EditorDocumentV2): EditorDocumentV2 {
    const entry = this.undoEntries.pop();
    if (!entry) return current;
    this.redoEntries.push(entry);
    return cloneDocument(entry.before);
  }

  redo(current: EditorDocumentV2): EditorDocumentV2 {
    const entry = this.redoEntries.pop();
    if (!entry) return current;
    this.undoEntries.push(entry);
    return cloneDocument(entry.after);
  }

  clear(): void {
    this.undoEntries = [];
    this.redoEntries = [];
  }
}

function documentsEqual(left: EditorDocumentV2, right: EditorDocumentV2): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
