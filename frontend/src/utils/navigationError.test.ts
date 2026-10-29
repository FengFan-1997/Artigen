import { describe, expect, it } from 'vitest';
import { isRouteChunkLoadError } from './navigationError';

describe('route module load failures', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.invalid/page.js',
    'error loading dynamically imported module: https://example.invalid/page.js',
    'Importing a module script failed.',
    'Loading chunk 12 failed.',
    'ChunkLoadError'
  ])('recognizes %s for document recovery', (message) => {
    expect(isRouteChunkLoadError(new TypeError(message))).toBe(true);
  });
  it.each([undefined, null, new Error('Navigation aborted'), new Error('Permission denied')])(
    'does not reload unrelated navigation failures: %s', (error) => {
      expect(isRouteChunkLoadError(error)).toBe(false);
    }
  );
});
