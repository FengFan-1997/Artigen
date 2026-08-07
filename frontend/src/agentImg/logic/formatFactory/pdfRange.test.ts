import { describe, expect, it } from 'vitest';
import { formatPdfPageSelection, parsePdfPageRange } from './pdfRange';

describe('parsePdfPageRange', () => {
  it('parses ranges, preserves requested order, and removes duplicates', () => {
    expect(parsePdfPageRange('3, 1-2, 2, 5', 6)).toEqual([3, 1, 2, 5]);
    expect(formatPdfPageSelection([1, 2, 3])).toBe('p1-3');
    expect(formatPdfPageSelection([3, 1, 2])).toBe('p3-1-2');
  });

  it('uses a bounded default selection', () => {
    expect(parsePdfPageRange('', 12, { defaultLimit: 4 })).toEqual([1, 2, 3, 4]);
  });

  it('rejects invalid, out-of-document, reversed, and oversized ranges', () => {
    expect(() => parsePdfPageRange('0', 5)).toThrowError('PDF_PAGE_RANGE_INVALID');
    expect(() => parsePdfPageRange('2-1', 5)).toThrowError('PDF_PAGE_RANGE_INVALID');
    expect(() => parsePdfPageRange('1,', 5)).toThrowError('PDF_PAGE_RANGE_INVALID');
    expect(() => parsePdfPageRange('6', 5)).toThrowError('PDF_PAGE_RANGE_INVALID');
    expect(() => parsePdfPageRange('1-4', 5, { maxPages: 3 })).toThrowError(
      'PDF_PAGE_RANGE_TOO_LARGE'
    );
  });
});
