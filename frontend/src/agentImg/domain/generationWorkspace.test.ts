import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATION_ASPECT_RATIOS,
  GENERATION_STARTER_TEMPLATES,
  generationReferenceSlotLabels,
  normalizeGenerationDirections
} from './generationWorkspace';

describe('generation workspace contract', () => {
  it('exposes six non-executing starter recipes and three semantic reference slots', () => {
    expect(GENERATION_STARTER_TEMPLATES).toHaveLength(6);
    expect(new Set(GENERATION_STARTER_TEMPLATES.map((item) => item.id)).size).toBe(6);
    expect(generationReferenceSlotLabels('zh')).toEqual(['商品参考', '风格参考', '场景参考']);
    expect(generationReferenceSlotLabels('en')).toEqual([
      'Product reference',
      'Style reference',
      'Scene reference'
    ]);
    expect(DEFAULT_GENERATION_ASPECT_RATIOS).toEqual(['1:1', '4:5', '3:4', '16:9', '9:16']);
  });

  it('accepts exactly the semantic direction fields and caps results at four', () => {
    expect(normalizeGenerationDirections([
      { id: 'a', title: 'A', summary: 'One', prompt: 'Prompt A', provider: 'hidden' },
      { id: 'b', title: 'B', summary: 'Two' },
      { id: 'c', title: 'C', summary: 'Three' },
      { id: 'd', title: 'D', summary: 'Four' },
      { id: 'e', title: 'E', summary: 'Five' },
      { id: 'invalid', title: '', summary: 'Missing title' }
    ])).toEqual([
      { id: 'a', title: 'A', summary: 'One', prompt: 'Prompt A' },
      { id: 'b', title: 'B', summary: 'Two' },
      { id: 'c', title: 'C', summary: 'Three' },
      { id: 'd', title: 'D', summary: 'Four' }
    ]);
  });
});
