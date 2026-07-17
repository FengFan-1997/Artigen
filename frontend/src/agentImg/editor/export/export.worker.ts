import type { EditorDocumentV2 } from '../domain/types';
import {
  exportEditorDocument,
  type EditorExportOptions
} from './exportRenderer';

interface ExportAssetPayload {
  assetId: string;
  mimeType: string;
  data: ArrayBuffer;
}

interface ExportWorkerRequest {
  type: 'run';
  jobId: string;
  projectId: string;
  revision: number;
  document: EditorDocumentV2;
  options: EditorExportOptions;
  assets: ExportAssetPayload[];
}

const workerScope: DedicatedWorkerGlobalScope = self as any;

workerScope.onmessage = async (event: MessageEvent<ExportWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'run') return;
  const identity = {
    jobId: request.jobId,
    projectId: request.projectId,
    revision: request.revision
  };
  try {
    const assets = new Map(
      request.assets.map((asset) => [
        asset.assetId,
        new Blob([asset.data], { type: asset.mimeType })
      ])
    );
    const result = await exportEditorDocument(
      request.document,
      async (assetId) => assets.get(assetId) ?? null,
      request.options
    );
    workerScope.postMessage({ type: 'success', ...identity, result });
  } catch (error) {
    workerScope.postMessage({
      type: 'failed',
      ...identity,
      message: error instanceof Error ? error.message : 'EXPORT_FAILED'
    });
  }
};

export {};
