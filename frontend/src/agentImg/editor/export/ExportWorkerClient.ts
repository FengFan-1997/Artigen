import type { EditorDocumentV2 } from '../domain/types';
import {
  exportEditorDocument,
  type EditorExportOptions,
  type EditorExportResult
} from './exportRenderer';

interface ActiveExport {
  jobId: string;
  reject: (error: Error) => void;
  worker: Worker | null;
}

const cancellationError = () => new Error('EXPORT_CANCELLED');

export class ExportWorkerClient {
  private active: ActiveExport | null = null;
  private generation = 0;

  async run(
    document: EditorDocumentV2,
    getAssetBlob: (assetId: string) => Promise<Blob | null>,
    options: EditorExportOptions
  ): Promise<EditorExportResult> {
    this.cancel();
    const generation = this.generation;
    const imageAssetIds = [...new Set(
      document.layerOrder
        .map((layerId) => document.layers[layerId])
        .filter((layer) => layer?.type === 'image')
        .map((layer) => layer.assetId)
    )];
    const assets = await Promise.all(imageAssetIds.map(async (assetId) => {
      const blob = await getAssetBlob(assetId);
      if (!blob) throw new Error('ASSET_NOT_FOUND');
      return {
        assetId,
        mimeType: blob.type || 'application/octet-stream',
        data: await blob.arrayBuffer()
      };
    }));
    if (generation !== this.generation) throw cancellationError();

    // Older Safari versions lack worker OffscreenCanvas. They retain a
    // correctness fallback, while current engines keep all rasterization and
    // encoding away from the UI thread.
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      const result = await exportEditorDocument(document, getAssetBlob, options);
      if (generation !== this.generation) throw cancellationError();
      return result;
    }

    const jobId = globalThis.crypto?.randomUUID?.() ?? `export-${Date.now()}-${Math.random()}`;
    return new Promise<EditorExportResult>((resolve, reject) => {
      const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
      const finish = () => {
        worker.terminate();
        if (this.active?.jobId === jobId) this.active = null;
      };
      this.active = { jobId, reject, worker };
      worker.onmessage = (event: MessageEvent<any>) => {
        const message = event.data;
        if (message?.jobId !== jobId) return;
        finish();
        if (
          generation !== this.generation ||
          message.projectId !== document.projectId ||
          Number(message.revision) !== document.revision
        ) {
          reject(cancellationError());
          return;
        }
        if (message.type === 'success') resolve(message.result as EditorExportResult);
        else reject(new Error(String(message.message || 'EXPORT_FAILED')));
      };
      worker.onerror = (event) => {
        finish();
        reject(new Error(event.message || 'EXPORT_WORKER_FAILED'));
      };
      worker.postMessage({
        type: 'run',
        jobId,
        projectId: document.projectId,
        revision: document.revision,
        document,
        options,
        assets
      }, assets.map((asset) => asset.data));
    });
  }

  cancel(): void {
    this.generation += 1;
    const active = this.active;
    this.active = null;
    if (!active) return;
    active.worker?.terminate();
    active.reject(cancellationError());
  }

  dispose(): void {
    this.cancel();
  }
}
