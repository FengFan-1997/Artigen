import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { createZipBlob } from './zip';

describe('createZipBlob', () => {
  it('creates a real ZIP and resolves duplicate and unsafe filenames', async () => {
    const blob = await createZipBlob([
      { name: '../same.txt', blob: new Blob(['one']) },
      { name: 'same.txt', blob: new Blob(['two']) }
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['same (2).txt', 'same.txt']);
    expect(new TextDecoder().decode(entries['same.txt'])).toBe('one');
    expect(new TextDecoder().decode(entries['same (2).txt'])).toBe('two');
  });

  it('rejects cancellation and never publishes a late ZIP result', async () => {
    let releaseRead: (value: ArrayBuffer) => void = () => {};
    const delayedBlob = {
      size: 3,
      arrayBuffer: vi.fn(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            releaseRead = resolve;
          })
      )
    } as unknown as Blob;
    const controller = new AbortController();
    const promise = createZipBlob([{ name: 'late.txt', blob: delayedBlob }], {
      signal: controller.signal
    });
    controller.abort();
    releaseRead(new TextEncoder().encode('abc').buffer);
    await expect(promise).rejects.toThrowError('ABORTED');
  });
});
