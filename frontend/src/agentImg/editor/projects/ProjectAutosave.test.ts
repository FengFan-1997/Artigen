import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createEditorDocument, updateDocument } from '../domain/factory';
import type { EditorDocumentV2 } from '../domain/types';
import {
  ProjectAutosave,
  recoverMostRecentDraft,
  type AutosaveState
} from './ProjectAutosave';

describe('ProjectAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('debounces for 750ms, saves only the latest immutable snapshot, and reports status', async () => {
    const saves: EditorDocumentV2[] = [];
    const states: AutosaveState[] = [];
    const autosave = new ProjectAutosave(
      async (document) => { saves.push(document); },
      (state) => states.push(state)
    );
    const first = createEditorDocument({ projectId: 'draft' });
    const latest = updateDocument(first, (document) => { document.artboard.width = 2048; });

    autosave.schedule(first);
    await vi.advanceTimersByTimeAsync(500);
    autosave.schedule(latest);
    latest.artboard.width = 1;
    await vi.advanceTimersByTimeAsync(749);
    expect(saves).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toHaveLength(1);
    expect(saves[0]?.artboard.width).toBe(2048);
    expect(states.map((state) => state.status)).toEqual(['pending', 'pending', 'saving', 'saved']);
    expect(states.at(-1)?.savedAt).toBe('2026-07-15T08:00:01.250Z');
  });

  test('flushes immediately and drains a document queued during an active save', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const saves: string[] = [];
    const autosave = new ProjectAutosave(async (document) => {
      saves.push(document.projectId);
      if (document.projectId === 'first') await firstSave;
    }, () => {});

    autosave.schedule(createEditorDocument({ projectId: 'first' }));
    const flushing = autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    autosave.schedule(createEditorDocument({ projectId: 'second' }));
    releaseFirst?.();
    await flushing;

    expect(saves).toEqual(['first', 'second']);
    await vi.advanceTimersByTimeAsync(750);
    expect(saves).toEqual(['first', 'second']);
  });

  test('surfaces repository failures as an error state without losing control', async () => {
    const failure = new Error('quota exceeded');
    const states: AutosaveState[] = [];
    const autosave = new ProjectAutosave(
      async () => { throw failure; },
      (state) => states.push(state)
    );

    autosave.schedule(createEditorDocument({ projectId: 'broken' }));
    await autosave.flush();

    expect(states.map((state) => state.status)).toEqual(['pending', 'saving', 'error']);
    expect(states.at(-1)?.error).toBe(failure);
  });
});

describe('draft recovery', () => {
  test('restores an isolated copy of the most recent repository document', async () => {
    const source = createEditorDocument({ projectId: 'recovered' });
    source.artboard.width = 1800;
    const restored = await recoverMostRecentDraft({
      async getMostRecentProject() {
        return {
          projectId: source.projectId,
          document: source,
          assetIds: [],
          savedAt: '2026-07-15T08:00:00.000Z'
        };
      }
    });

    expect(restored?.projectId).toBe('recovered');
    expect(restored?.artboard.width).toBe(1800);
    if (restored) restored.artboard.width = 320;
    expect(source.artboard.width).toBe(1800);
  });

  test('returns null when the repository has no draft', async () => {
    await expect(recoverMostRecentDraft({ async getMostRecentProject() { return null; } })).resolves.toBeNull();
  });
});
