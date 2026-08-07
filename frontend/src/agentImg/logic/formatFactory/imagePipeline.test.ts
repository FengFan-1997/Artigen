import { describe, expect, it } from 'vitest';
import {
  normalizeImagePipelineOrder,
  validateImagePipeline,
  type ImagePipelineStep
} from './imagePipeline';

describe('ordered image pipeline contract', () => {
  it('keeps the requested unique order and appends missing operations', () => {
    expect(normalizeImagePipelineOrder(['filter', 'resize', 'filter'])).toEqual([
      'filter',
      'resize',
      'rotate',
      'convert'
    ]);
  });

  it('rejects an empty pipeline and an enabled resize without dimensions', () => {
    const disabled: ImagePipelineStep[] = [
      { id: 'convert', type: 'convert', enabled: false, outType: 'image/webp', quality: 0.9 }
    ];
    expect(() => validateImagePipeline(disabled)).toThrow('PIPELINE_EMPTY');

    const missingSize: ImagePipelineStep[] = [
      { id: 'resize', type: 'resize', enabled: true, width: null, height: null, maxSide: null }
    ];
    expect(() => validateImagePipeline(missingSize)).toThrow('PIPELINE_RESIZE_MISSING_SIZE');
  });
});
