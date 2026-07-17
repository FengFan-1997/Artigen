import { describe, expect, test } from 'vitest';
import { createEditorDocument, updateDocument } from '../domain/factory';
import { CommandHistory } from './CommandHistory';

describe('CommandHistory', () => {
  test('undoes and redoes snapshot commands', () => {
    const history = new CommandHistory();
    const before = createEditorDocument({ title: 'A' });
    const after = updateDocument(before, (draft) => {
      draft.title = 'B';
    });
    history.record('rename', before, after);

    expect(history.undo(after).title).toBe('A');
    expect(history.redo(before).title).toBe('B');
  });

  test('keeps at most 100 undo entries and clears redo on a new command', () => {
    const history = new CommandHistory(100);
    let current = createEditorDocument({ title: '0' });
    for (let index = 1; index <= 120; index += 1) {
      const next = updateDocument(current, (draft) => {
        draft.title = String(index);
      });
      history.record(`rename ${index}`, current, next);
      current = next;
    }
    expect(history.undoCount).toBe(100);

    const undone = history.undo(current);
    expect(history.canRedo).toBe(true);
    const replacement = updateDocument(undone, (draft) => {
      draft.title = 'replacement';
    });
    history.record('replacement', undone, replacement);
    expect(history.canRedo).toBe(false);
  });

  test('coalesces rapid edits with the same merge key into one undo transaction', () => {
    const history = new CommandHistory();
    const before = createEditorDocument({ title: 'A' });
    const middle = updateDocument(before, (draft) => {
      draft.title = 'AB';
    });
    const after = updateDocument(middle, (draft) => {
      draft.title = 'ABC';
    });
    history.record('typing', before, middle, { mergeKey: 'title', timestamp: 1_000 });
    history.record('typing', middle, after, { mergeKey: 'title', timestamp: 1_200 });

    expect(history.undoCount).toBe(1);
    expect(history.undo(after).title).toBe('A');
    expect(history.redo(before).title).toBe('ABC');
  });
});
