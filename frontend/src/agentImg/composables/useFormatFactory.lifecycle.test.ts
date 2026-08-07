import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({
  beforeUnmount: null as null | (() => void)
}));

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    onBeforeUnmount: (callback: () => void) => {
      lifecycle.beforeUnmount = callback;
    }
  };
});

import { useFormatFactory } from './useFormatFactory';

describe('useFormatFactory lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    lifecycle.beforeUnmount = null;
  });

  it('revokes every batch and preview Blob URL on route unmount', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const factory = useFormatFactory();
    factory.sourceUrl.value = 'blob:source';
    factory.outputUrl.value = 'blob:primary';
    factory.outputItems.value = [
      { name: 'one.png', size: 1, blob: new Blob(['1']), url: 'blob:batch-one' },
      { name: 'two.png', size: 1, blob: new Blob(['2']), url: 'blob:batch-two' }
    ];

    expect(lifecycle.beforeUnmount).toBeTypeOf('function');
    lifecycle.beforeUnmount?.();

    expect(revoke).toHaveBeenCalledWith('blob:source');
    expect(revoke).toHaveBeenCalledWith('blob:primary');
    expect(revoke).toHaveBeenCalledWith('blob:batch-one');
    expect(revoke).toHaveBeenCalledWith('blob:batch-two');
    expect(factory.outputItems.value).toEqual([]);
    revoke.mockRestore();
  });
});
