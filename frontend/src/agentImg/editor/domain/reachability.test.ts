import { describe, expect, test } from 'vitest';
import { addLayer, createEditorDocument, createImageLayer } from './factory';
import { collectDocumentAssetIds, findUnreachableAssetIds } from './reachability';

describe('editor asset reachability', () => {
  test('keeps both current and original source assets reachable', () => {
    const empty = createEditorDocument({ projectId: 'p1' });
    const layer = createImageLayer({
      assetId: 'processed',
      sourceAssetId: 'original',
      naturalWidth: 100,
      naturalHeight: 100,
      artboard: empty.artboard
    });
    const document = addLayer(empty, layer);
    expect([...collectDocumentAssetIds(document)].sort()).toEqual(['original', 'processed']);

    const project = {
      projectId: 'p1',
      document,
      assetIds: ['thumbnail'],
      savedAt: new Date().toISOString()
    };
    expect(findUnreachableAssetIds(['processed', 'original', 'thumbnail', 'orphan'], [project])).toEqual([
      'orphan'
    ]);
  });

  test('collects only assets no longer referenced by any saved project', () => {
    const firstDocument = createEditorDocument({ projectId: 'first' });
    const firstLayer = createImageLayer({
      assetId: 'shared-current',
      sourceAssetId: 'first-source',
      naturalWidth: 80,
      naturalHeight: 80,
      artboard: firstDocument.artboard
    });
    const secondDocument = createEditorDocument({ projectId: 'second' });
    const secondLayer = createImageLayer({
      assetId: 'shared-current',
      sourceAssetId: 'second-source',
      naturalWidth: 80,
      naturalHeight: 80,
      artboard: secondDocument.artboard
    });
    const projects = [
      {
        projectId: 'first',
        document: addLayer(firstDocument, firstLayer),
        assetIds: [],
        savedAt: '2026-07-15T08:00:00.000Z'
      },
      {
        projectId: 'second',
        document: addLayer(secondDocument, secondLayer),
        assetIds: [],
        savedAt: '2026-07-15T08:01:00.000Z'
      }
    ];

    expect(findUnreachableAssetIds(
      ['shared-current', 'first-source', 'second-source', 'orphan-a', 'orphan-b'],
      projects
    )).toEqual(['orphan-a', 'orphan-b']);
    expect(findUnreachableAssetIds(
      ['shared-current', 'first-source', 'second-source'],
      projects.slice(1)
    )).toEqual(['first-source']);
  });
});
