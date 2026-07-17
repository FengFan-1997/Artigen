import { describe, expect, test } from 'vitest';
import { enforceLocalBackgroundPolicy } from './backgroundWorkflow';

describe('local background submission policy', () => {
  test('never permits replace mode to fall through without a local result', () => {
    expect(() => enforceLocalBackgroundPolicy('replace', '')).toThrow(
      'AI_BACKGROUND_LOCAL_RESULT_REQUIRED'
    );
    expect(enforceLocalBackgroundPolicy('replace', 'data:image/png;base64,result')).toBe(
      'data:image/png;base64,result'
    );
  });

  test('keeps explicitly selected add mode as the cloud workflow', () => {
    expect(enforceLocalBackgroundPolicy('add', '')).toBeUndefined();
  });
});
