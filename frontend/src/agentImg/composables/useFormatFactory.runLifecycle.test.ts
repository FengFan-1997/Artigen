import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({
  beforeUnmount: [] as Array<() => void>
}));

const processorMocks = vi.hoisted(() => ({
  convertImage: vi.fn()
}));

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    onBeforeUnmount: (callback: () => void) => {
      lifecycle.beforeUnmount.push(callback);
    }
  };
});

vi.mock('../logic/formatFactory/processors', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../logic/formatFactory/processors')>();
  return {
    ...actual,
    convertImage: processorMocks.convertImage
  };
});

import { useFormatFactory } from './useFormatFactory';

const pngFile = (name: string, width = 10, height = 10) => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new File([bytes], name, { type: 'image/png' });
};

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((currentResolve) => {
    resolve = currentResolve;
  });
  return { promise, resolve };
};

const selectWebpBatch = (factory: ReturnType<typeof useFormatFactory>, files: File[]) => {
  const tool = factory.tools.value.find((entry) => entry.id === 'webp');
  if (!tool) throw new Error('WEBP_TOOL_MISSING');
  factory.handleToolClick(tool);
  factory.sourceFile.value = files[0];
  factory.sourceFiles.value = files;
};

describe('useFormatFactory run ownership', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    lifecycle.beforeUnmount = [];
    processorMocks.convertImage.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revokes run-local URLs and does not publish a late result after cancellation', async () => {
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementationOnce(() => 'blob:first-result')
      .mockImplementation(() => 'blob:unexpected');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const second = deferred<{ blob: Blob; filename: string }>();
    processorMocks.convertImage
      .mockResolvedValueOnce({
        blob: new Blob(['first'], { type: 'image/webp' }),
        filename: 'first.webp'
      })
      .mockReturnValueOnce(second.promise);

    const factory = useFormatFactory();
    selectWebpBatch(factory, [pngFile('one.png'), pngFile('two.png')]);
    const pending = factory.runTool();
    await vi.waitFor(() => expect(processorMocks.convertImage).toHaveBeenCalledTimes(2));

    factory.cancelProcessing();
    second.resolve({
      blob: new Blob(['late'], { type: 'image/webp' }),
      filename: 'late.webp'
    });

    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(factory.outputItems.value).toEqual([]);
    expect(revokeUrl).toHaveBeenCalledWith('blob:first-result');
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it('invalidates the run on unmount and ignores a late worker/processor completion', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementationOnce(() => 'blob:first-result');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const second = deferred<{ blob: Blob; filename: string }>();
    processorMocks.convertImage
      .mockResolvedValueOnce({
        blob: new Blob(['first'], { type: 'image/webp' }),
        filename: 'first.webp'
      })
      .mockReturnValueOnce(second.promise);

    const factory = useFormatFactory();
    selectWebpBatch(factory, [pngFile('one.png'), pngFile('two.png')]);
    const pending = factory.runTool();
    await vi.waitFor(() => expect(processorMocks.convertImage).toHaveBeenCalledTimes(2));

    lifecycle.beforeUnmount.forEach((callback) => callback());
    second.resolve({
      blob: new Blob(['late'], { type: 'image/webp' }),
      filename: 'late.webp'
    });

    await expect(pending).resolves.toEqual({ status: 'superseded' });
    expect(factory.outputItems.value).toEqual([]);
    expect(revokeUrl).toHaveBeenCalledWith('blob:first-result');
  });

  it('transfers successful URL ownership to the published output until reset', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:published');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    processorMocks.convertImage.mockResolvedValue({
      blob: new Blob(['result'], { type: 'image/webp' }),
      filename: 'result.webp'
    });

    const factory = useFormatFactory();
    selectWebpBatch(factory, [pngFile('one.png')]);

    await expect(factory.runTool()).resolves.toEqual({ status: 'success' });
    expect(factory.outputItems.value).toHaveLength(1);
    expect(revokeUrl).not.toHaveBeenCalledWith('blob:published');

    factory.resetTool();
    expect(revokeUrl).toHaveBeenCalledWith('blob:published');
  });
});
