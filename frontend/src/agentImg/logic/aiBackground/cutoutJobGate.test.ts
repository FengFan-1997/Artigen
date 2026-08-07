import { describe, expect, test } from 'vitest';
import { CutoutJobGate } from './cutoutJobGate';

describe('CutoutJobGate', () => {
  test('rejects stale job ids and stale source revisions', () => {
    const gate = new CutoutJobGate();
    const first = gate.begin(7);
    const second = gate.begin(8);

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent({ ...second, sourceRevision: 7 })).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.complete(second)).toBe(true);
    expect(gate.isCurrent(second)).toBe(false);
  });

  test('invalidates the exact active identity on cancel', () => {
    const gate = new CutoutJobGate();
    const active = gate.begin(11);

    expect(gate.cancel()).toEqual(active);
    expect(gate.isCurrent(active)).toBe(false);
    expect(gate.complete(active)).toBe(false);
    expect(gate.cancel()).toBeNull();
  });
});
