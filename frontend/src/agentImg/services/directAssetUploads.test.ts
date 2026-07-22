import { describe, expect, it } from 'vitest';
import { shouldFallbackToMultipart } from './directAssetUploads';
import { ToolTaskClientError } from './toolTasks';

describe('direct asset upload fallback', () => {
  it('recognizes disabled or malformed direct upload responses after Uppy normalization', () => {
    expect(shouldFallbackToMultipart(new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldFallbackToMultipart(
      new ToolTaskClientError('DIRECT_ASSET_UPLOADS_DISABLED')
    )).toBe(true);
    expect(shouldFallbackToMultipart('INVALID_ASSET_UPLOAD_RESPONSE')).toBe(true);
    expect(shouldFallbackToMultipart('CONTENT_POLICY_REJECTED')).toBe(false);
  });
});
