import { afterEach, describe, expect, test, vi } from 'vitest';
import { AssetUrlRegistry } from './AssetUrlRegistry';

afterEach(() => vi.unstubAllGlobals());

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('AssetUrlRegistry lifecycle', () => {
  test('reuses one URL and revokes it when the asset becomes unreachable', async () => {
    const createObjectURL = vi.fn(() => 'blob:asset-1');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const registry = new AssetUrlRegistry();
    const load = vi.fn(async () => new Blob(['image'], { type: 'image/png' }));

    await expect(registry.get('asset-1', load)).resolves.toBe('blob:asset-1');
    await expect(registry.get('asset-1', load)).resolves.toBe('blob:asset-1');
    expect(load).toHaveBeenCalledTimes(1);
    registry.retainOnly([]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset-1');
  });

  test('does not create an ObjectURL when a pending load resolves after project disposal', async () => {
    const createObjectURL = vi.fn(() => 'blob:late');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const registry = new AssetUrlRegistry();
    const pending = deferred<Blob | null>();
    const result = registry.get('asset-late', () => pending.promise);

    registry.revokeAll();
    pending.resolve(new Blob(['late'], { type: 'image/png' }));

    await expect(result).rejects.toThrow('ASSET_URL_INVALIDATED');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test('an invalidated old load cannot erase a newer request for the same asset', async () => {
    const createObjectURL = vi.fn(() => 'blob:new');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const registry = new AssetUrlRegistry();
    const oldLoad = deferred<Blob | null>();
    const oldResult = registry.get('asset-race', () => oldLoad.promise);
    registry.retainOnly([]);
    const newResult = registry.get('asset-race', async () => new Blob(['new']));
    oldLoad.resolve(new Blob(['old']));

    await expect(oldResult).rejects.toThrow('ASSET_URL_INVALIDATED');
    await expect(newResult).resolves.toBe('blob:new');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
