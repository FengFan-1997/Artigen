import { describe, expect, it, vi } from 'vitest';

const zipMock = vi.hoisted(() => ({
  callback: null as null | ((error: Error | null, bytes: Uint8Array) => void),
  terminate: vi.fn(),
  zip: vi.fn(
    (
      _entries: Record<string, Uint8Array>,
      _options: Record<string, unknown>,
      callback: (error: Error | null, bytes: Uint8Array) => void
    ) => {
      zipMock.callback = callback;
      return zipMock.terminate;
    }
  )
}));

vi.mock('fflate', () => ({
  zip: zipMock.zip
}));

import { createZipBlob } from './zip';

describe('createZipBlob async cancellation', () => {
  it('calls the fflate terminator and ignores its late callback', async () => {
    const controller = new AbortController();
    const pending = createZipBlob([{ name: 'one.txt', blob: new Blob(['one']) }], {
      signal: controller.signal
    });
    await vi.waitFor(() => expect(zipMock.zip).toHaveBeenCalledOnce());

    controller.abort();
    zipMock.callback?.(
      null,
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(18).fill(0)])
    );

    await expect(pending).rejects.toThrowError('ABORTED');
    expect(zipMock.terminate).toHaveBeenCalledOnce();
  });
});
