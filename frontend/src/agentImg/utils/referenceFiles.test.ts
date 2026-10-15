import { describe, expect, it } from 'vitest';
import { mergeReferenceFiles, referenceFileKey } from './referenceFiles';

const file = (name: string, size = 10, lastModified = 1, type = 'text/plain') => ({
  name,
  size,
  lastModified,
  type
});
describe('reference selection', () => {
  it('appends another selection and retains the first File identity', () => {
    const first = file('brief.txt');
    const result = mergeReferenceFiles([first], [file('brief.txt'), file('notes.txt')]);
    expect(result.error).toBeNull();
    expect(result.files.map((item) => item.name)).toEqual(['brief.txt', 'notes.txt']);
    expect(result.files[0]).toBe(first);
  });
  it('keeps different modifications and MIME types distinct', () => {
    expect(
      mergeReferenceFiles(
        [file('brief.txt')],
        [file('brief.txt', 10, 2), file('brief.txt', 10, 1, 'application/pdf')]
      ).files
    ).toHaveLength(3);
  });
  it('rejects an over-count selection without truncating or mutating the original', () => {
    const current = [file('original.txt')];
    const result = mergeReferenceFiles(
      current,
      Array.from({ length: 10 }, (_, i) => file(`file-${i}`))
    );
    expect(result).toEqual({ files: current, error: 'too-many' });
    expect(current).toHaveLength(1);
  });
  it('counts duplicates once before checking the limit', () => {
    const current = Array.from({ length: 10 }, (_, i) => file(`file-${i}`));
    expect(mergeReferenceFiles(current, [file('file-0')]).error).toBeNull();
  });
  it('rejects the full selection when one file exceeds the executor size policy', () => {
    const first = file('original.txt');
    expect(
      mergeReferenceFiles([first], [file('small.txt'), file('large.txt', 41)], { maxFileBytes: 40 })
    ).toEqual({ files: [first], error: 'too-large' });
  });
  it('does not impose the cloud upload size policy on local-tool references', () => {
    expect(mergeReferenceFiles([], [file('local.zip', 100 * 1024 * 1024)]).error).toBeNull();
  });
  it('does not collide when a filename includes separators', () => {
    expect(referenceFileKey(file('a:10:1'))).not.toBe(referenceFileKey(file('a', 10, 1)));
  });
});
