import { describe, expect, it } from 'vitest';
import { formatFactoryTools } from '../data/formatFactoryTools';
import { locationForToolEntry } from './toolEntry';

describe('format factory tool entries', () => {
  it('keeps every historical standalone tool visible', () => {
    expect(formatFactoryTools.map((tool) => tool.id)).toEqual([
      'webp',
      'jpeg',
      'resize',
      'rotate',
      'filter',
      'watermark',
      'live',
      'pdf',
      'pdf2word',
      'word2pdf',
      'txt2pdf',
      'img2pdf',
      'gif',
      'ico',
      'ingredient-list'
    ]);
  });

  it('opens a standalone card at its exact operation inside the canonical workflow', () => {
    expect(locationForToolEntry('webp')).toEqual({
      path: '/artigen/tools/image-batch',
      query: { operation: 'webp' }
    });
    expect(locationForToolEntry('img2pdf')).toEqual({
      path: '/artigen/tools/pdf-image',
      query: { operation: 'img2pdf' }
    });
    expect(locationForToolEntry('word2pdf')).toEqual({
      path: '/artigen/tools/document-pdf',
      query: { operation: 'word2pdf' }
    });
  });

  it('preserves the batch workflow and routes workshop entries to their current home', () => {
    expect(locationForToolEntry('image-batch')).toEqual({
      path: '/artigen/tools/image-batch',
      query: { operation: 'pipeline' }
    });
    expect(locationForToolEntry('ingredient-list')).toEqual({
      path: '/artigen/image-workshop/ingredient-label'
    });
  });
});
