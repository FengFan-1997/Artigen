import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const fakes = vi.hoisted(() => ({
  saveProject: vi.fn<(document: unknown) => Promise<void>>(),
  getMostRecentProject: vi.fn<() => Promise<null>>(),
  garbageCollectAssets: vi.fn<() => Promise<string[]>>(),
  close: vi.fn(),
  revokeAll: vi.fn(),
  workerDispose: vi.fn()
}));

vi.mock('../assets/EditorDatabase', () => ({
  EditorDatabase: class {
    saveProject(document: unknown) { return fakes.saveProject(document); }
    getMostRecentProject() { return fakes.getMostRecentProject(); }
    garbageCollectAssets() { return fakes.garbageCollectAssets(); }
    close() { fakes.close(); }
  }
}));

vi.mock('../assets/AssetUrlRegistry', () => ({
  AssetUrlRegistry: class {
    get() { return Promise.reject(new Error('not used in lifecycle tests')); }
    retainOnly() {}
    revokeAll() { fakes.revokeAll(); }
  }
}));

vi.mock('../workers/PixelWorkerClient', () => ({
  PixelWorkerClient: class {
    invalidateProject() {}
    invalidateLayer() {}
    dispose() { fakes.workerDispose(); }
  }
}));

import { useImageEditorV2Store } from './editorStore';

describe('editor runtime disposal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fakes.saveProject.mockReset().mockResolvedValue(undefined);
    fakes.getMostRecentProject.mockReset().mockResolvedValue(null);
    fakes.garbageCollectAssets.mockReset().mockResolvedValue([]);
    fakes.close.mockReset();
    fakes.revokeAll.mockReset();
    fakes.workerDispose.mockReset();
  });

  test('flushes the draft, collects unreachable assets, closes storage, and allows a fresh init', async () => {
    const store = useImageEditorV2Store();
    await store.initialize();
    store.newProject();

    await store.disposeRuntime();

    expect(fakes.saveProject).toHaveBeenCalledTimes(1);
    expect(fakes.garbageCollectAssets).toHaveBeenCalledTimes(1);
    expect(fakes.close).toHaveBeenCalledTimes(1);
    expect(fakes.revokeAll).toHaveBeenCalledTimes(1);
    expect(fakes.workerDispose).toHaveBeenCalledTimes(1);
    expect(store.initialized).toBe(false);

    await store.initialize();
    expect(store.initialized).toBe(true);
    expect(fakes.getMostRecentProject).toHaveBeenCalledTimes(2);
  });

  test('does not finalize an old disposal after the editor has already re-entered', async () => {
    let releaseSave: (() => void) | undefined;
    fakes.saveProject.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSave = resolve; }));
    const store = useImageEditorV2Store();
    await store.initialize();
    store.newProject();

    const disposing = store.disposeRuntime();
    await Promise.resolve();
    await store.initialize();
    releaseSave?.();
    await disposing;

    expect(store.initialized).toBe(true);
    expect(fakes.garbageCollectAssets).not.toHaveBeenCalled();
    expect(fakes.close).not.toHaveBeenCalled();

    await store.disposeRuntime();
    expect(store.initialized).toBe(false);
    expect(fakes.garbageCollectAssets).toHaveBeenCalledTimes(1);
  });

  test('preserves the runtime and retries the pending draft after a storage failure', async () => {
    fakes.saveProject.mockRejectedValueOnce(new Error('quota exceeded')).mockResolvedValueOnce(undefined);
    const store = useImageEditorV2Store();
    await store.initialize();
    store.newProject();

    await store.disposeRuntime();
    expect(store.initialized).toBe(true);
    expect(store.autosaveState.status).toBe('error');
    expect(fakes.garbageCollectAssets).not.toHaveBeenCalled();

    await store.disposeRuntime();
    expect(fakes.saveProject).toHaveBeenCalledTimes(2);
    expect(fakes.garbageCollectAssets).toHaveBeenCalledTimes(1);
    expect(store.initialized).toBe(false);
  });

  test('keeps locked layers when a mixed selection is deleted', () => {
    const store = useImageEditorV2Store();
    store.addRect();
    const lockedId = store.selectedLayerIds[0];
    store.toggleLayerLock(lockedId);
    store.addEllipse();
    const removableId = store.selectedLayerIds[0];
    store.setSelection([lockedId, removableId]);

    store.removeSelectedLayers();

    expect(store.document.layers[lockedId]).toBeDefined();
    expect(store.document.layers[removableId]).toBeUndefined();
    expect(store.selectedLayerIds).toEqual([lockedId]);
    expect(store.canDeleteSelection).toBe(false);
  });

  test('undoes a text editing transaction without deleting the text layer', () => {
    const store = useImageEditorV2Store();
    store.addText();
    const layerId = store.selectedLayerIds[0];
    const initialText = store.document.layers[layerId]?.type === 'text'
      ? store.document.layers[layerId].text
      : '';

    store.updateText('Artigen');
    store.updateText('Artigen 商品主图');
    expect(store.document.layers[layerId]?.type === 'text' && store.document.layers[layerId].text)
      .toBe('Artigen 商品主图');

    store.undo();
    expect(store.document.layers[layerId]).toBeDefined();
    expect(store.document.layers[layerId]?.type === 'text' && store.document.layers[layerId].text)
      .toBe(initialText);

    store.redo();
    expect(store.document.layers[layerId]?.type === 'text' && store.document.layers[layerId].text)
      .toBe('Artigen 商品主图');
  });
});
