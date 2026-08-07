import { describe, expect, it } from 'vitest';
import { processImageWithCodecWorker } from './imageCodecWorkerClient';

class FakeWorker {
  terminated = false;
  lastMessage: Record<string, any> | null = null;
  private messages = new Set<(event: MessageEvent) => void>();
  private errors = new Set<(event: ErrorEvent) => void>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') this.messages.add(listener as (event: MessageEvent) => void);
    if (type === 'error') this.errors.add(listener as (event: ErrorEvent) => void);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') this.messages.delete(listener as (event: MessageEvent) => void);
    if (type === 'error') this.errors.delete(listener as (event: ErrorEvent) => void);
  }
  postMessage(message: Record<string, any>) { this.lastMessage = message; }
  terminate() { this.terminated = true; }
  succeed() {
    for (const listener of this.messages) listener({ data: {
      type: 'success',
      jobId: this.lastMessage?.jobId,
      blob: new Blob(['encoded'], { type: 'image/png' }),
      width: 20,
      height: 10
    } } as MessageEvent);
  }
}

describe('image codec worker client', () => {
  it('preserves the worker protocol and dimensions', async () => {
    const worker = new FakeWorker();
    const pending = processImageWithCodecWorker({
      file: new Blob(['source'], { type: 'image/png' }),
      operation: { type: 'resize', width: 20, height: 10, maxSide: null },
      outType: 'image/png',
      workerFactory: () => worker as unknown as Worker
    });
    worker.succeed();
    await expect(pending).resolves.toMatchObject({ width: 20, height: 10 });
    expect(worker.lastMessage?.operation).toEqual({
      type: 'resize', width: 20, height: 10, maxSide: null
    });
    expect(worker.terminated).toBe(true);
  });

  it('terminates immediately when cancelled', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = processImageWithCodecWorker({
      file: new Blob(['source']),
      operation: { type: 'convert' },
      outType: 'image/webp',
      signal: controller.signal,
      workerFactory: () => worker as unknown as Worker
    });
    controller.abort();
    await expect(pending).rejects.toThrowError('ABORTED');
    expect(worker.terminated).toBe(true);
  });
});
