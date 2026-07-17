import { describe, expect, test } from 'vitest';
import {
  addLayer,
  cloneDocument,
  createEditorDocument,
  createImageLayer,
  normalizeDocument,
  updateDocument
} from './factory';

describe('EditorDocumentV2', () => {
  test('clones a reactive proxy-shaped document without a DataCloneError', () => {
    const document = createEditorDocument();
    const proxy = new Proxy(document, {}) as typeof document;
    const cloned = cloneDocument(proxy);
    expect(cloned).toEqual(document);
    expect(cloned).not.toBe(document);
  });

  test('imports one source as one ordinary image layer', () => {
    const empty = createEditorDocument();
    const layer = createImageLayer({
      assetId: 'asset-1',
      naturalWidth: 2400,
      naturalHeight: 1600,
      name: 'product.png',
      artboard: empty.artboard
    });
    const document = addLayer(empty, layer);

    expect(document.layerOrder).toEqual([layer.id]);
    expect(document.layers[layer.id]).toMatchObject({
      type: 'image',
      assetId: 'asset-1',
      sourceAssetId: 'asset-1',
      crop: { x: 0, y: 0, width: 1, height: 1 }
    });
  });

  test('normalizes order, artboard limits and non-destructive crop', () => {
    const base = createEditorDocument();
    const layer = createImageLayer({
      assetId: 'asset-1',
      naturalWidth: 100,
      naturalHeight: 100,
      artboard: base.artboard
    });
    const input = addLayer(base, layer);
    input.layerOrder = [layer.id, layer.id, 'missing'];
    input.artboard.width = 99_999;
    const inputLayer = input.layers[layer.id];
    if (inputLayer.type === 'image') {
      inputLayer.crop = { x: 0.9, y: -2, width: 0.5, height: 4 };
    }

    const document = normalizeDocument(input);
    const normalizedLayer = document.layers[layer.id];
    expect(document.layerOrder).toEqual([layer.id]);
    expect(document.artboard.width).toBe(16_384);
    expect(normalizedLayer.type).toBe('image');
    if (normalizedLayer.type === 'image') {
      expect(normalizedLayer.crop.x).toBe(0.9);
      expect(normalizedLayer.crop.y).toBe(0);
      expect(normalizedLayer.crop.width).toBeCloseTo(0.1);
      expect(normalizedLayer.crop.height).toBe(1);
    }
  });

  test('updates immutably and increments the monotonic revision', () => {
    const original = createEditorDocument({ title: 'Before' });
    const next = updateDocument(original, (draft) => {
      draft.title = 'After';
    });
    expect(original.title).toBe('Before');
    expect(next.title).toBe('After');
    expect(next.revision).toBe(original.revision + 1);
  });
});
