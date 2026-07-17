import { afterEach, describe, expect, test, vi } from 'vitest';
import { createEditorDocument } from '../domain/factory';
import { ExportWorkerClient } from './ExportWorkerClient';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<any>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: any = null;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: any): void {
    this.request = request;
  }

  terminate(): void {
    this.terminated = true;
  }
}

const options = {
  format: 'png' as const,
  scale: 1 as const,
  quality: 0.92,
  bounds: 'artboard' as const,
  background: { type: 'transparent' as const },
  filename: 'worker-export'
};

describe('ExportWorkerClient', () => {
  afterEach(() => {
    FakeWorker.instances = [];
    vi.unstubAllGlobals();
  });

  test('cancels an active worker export immediately', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    const client = new ExportWorkerClient();
    const promise = client.run(createEditorDocument(), async () => null, options);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    client.cancel();
    await expect(promise).rejects.toThrow('EXPORT_CANCELLED');
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  test('rejects a worker response from another document revision', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    const client = new ExportWorkerClient();
    const document = createEditorDocument();
    const promise = client.run(document, async () => null, options);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    worker.onmessage?.({
      data: {
        type: 'success',
        jobId: worker.request.jobId,
        projectId: document.projectId,
        revision: document.revision + 1,
        result: {}
      }
    } as MessageEvent);
    await expect(promise).rejects.toThrow('EXPORT_CANCELLED');
    expect(worker.terminated).toBe(true);
  });
});
