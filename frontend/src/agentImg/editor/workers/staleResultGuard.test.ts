import { describe, expect, test } from 'vitest';
import type { PixelJobIdentity, PixelWorkerResult } from './protocol';
import { PixelResultGate } from './staleResultGuard';

function identity(overrides: Partial<PixelJobIdentity> = {}): PixelJobIdentity {
  return {
    jobId: 'job-1',
    projectId: 'project-1',
    layerId: 'layer-1',
    sourceAssetId: 'asset-1',
    revision: 4,
    ...overrides
  };
}

function success(overrides: Partial<PixelJobIdentity> = {}): PixelWorkerResult {
  return {
    ...identity(overrides),
    type: 'success',
    output: { width: 1, height: 1, data: new ArrayBuffer(4) }
  };
}

describe('PixelResultGate', () => {
  test('accepts only the latest exact job at the active revision', () => {
    const gate = new PixelResultGate();
    gate.begin(identity());
    expect(gate.isCurrent(success(), 'project-1', 4)).toBe(true);
    expect(gate.isCurrent(success({ revision: 3 }), 'project-1', 4)).toBe(false);

    expect(gate.begin(identity({ jobId: 'job-2' }))).toBe('job-1');
    expect(gate.isCurrent(success(), 'project-1', 4)).toBe(false);
    expect(gate.isCurrent(success({ jobId: 'job-2' }), 'project-1', 4)).toBe(true);
  });

  test('rejects results after undo, layer switch cancellation or project exit', () => {
    const gate = new PixelResultGate();
    gate.begin(identity());
    expect(gate.invalidateLayer('project-1', 'layer-1')).toBe('job-1');
    expect(gate.isCurrent(success(), 'project-1', 4)).toBe(false);

    gate.begin(identity({ jobId: 'job-2' }));
    expect(gate.clear()).toEqual(['job-2']);
    expect(gate.isCurrent(success({ jobId: 'job-2' }), 'project-1', 4)).toBe(false);
  });
});
