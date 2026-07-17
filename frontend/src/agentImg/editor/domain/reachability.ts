import type { EditorDocumentV2, EditorProjectRecord } from './types';

export function collectDocumentAssetIds(document: EditorDocumentV2): Set<string> {
  const assetIds = new Set<string>();
  for (const layer of Object.values(document.layers)) {
    if (layer.type !== 'image') continue;
    if (layer.assetId) assetIds.add(layer.assetId);
    if (layer.sourceAssetId) assetIds.add(layer.sourceAssetId);
  }
  return assetIds;
}

export function collectReachableAssetIds(projects: Iterable<EditorProjectRecord>): Set<string> {
  const reachable = new Set<string>();
  for (const project of projects) {
    for (const id of project.assetIds) reachable.add(id);
    for (const id of collectDocumentAssetIds(project.document)) reachable.add(id);
  }
  return reachable;
}

export function findUnreachableAssetIds(
  allAssetIds: Iterable<string>,
  projects: Iterable<EditorProjectRecord>
): string[] {
  const reachable = collectReachableAssetIds(projects);
  return Array.from(allAssetIds).filter((id) => !reachable.has(id));
}
