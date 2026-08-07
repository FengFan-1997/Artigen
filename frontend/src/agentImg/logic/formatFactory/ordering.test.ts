import { describe, expect, it } from 'vitest';
import { moveListItem } from './ordering';

describe('moveListItem', () => {
  it('reorders image-to-PDF inputs without mutating the original list', () => {
    const source = ['cover', 'detail', 'back'];
    expect(moveListItem(source, 2, -1)).toEqual(['cover', 'back', 'detail']);
    expect(source).toEqual(['cover', 'detail', 'back']);
    expect(moveListItem(source, 0, -1)).toEqual(source);
  });
});
