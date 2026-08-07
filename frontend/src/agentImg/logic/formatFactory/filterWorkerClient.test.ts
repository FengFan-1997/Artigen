import { describe, expect, it } from 'vitest';
import { processImageFilterInWorker } from './filterWorkerClient';

class FakeWorker {
  terminated = false;
  lastMessage: Record<string, unknown> | null = null;
  private readonly messageListeners = new Set<(event: MessageEvent) => void>();
  private readonly errorListeners = new Set<(event: ErrorEvent) => void>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as (event: any) => void;
    if (type === 'message') this.messageListeners.add(callback);
    if (type === 'error') this.errorListeners.add(callback);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as (event: any) => void;
    if (type === 'message') this.messageListeners.delete(callback);
    if (type === 'error') this.errorListeners.delete(callback);
  }

  postMessage(message: Record<string, unknown>) {
    this.lastMessage = message;
  }

  terminate() {
    this.terminated = true;
  }

  emitLateSuccess() {
    const event = {
      data: {
        type: 'success',
        jobId: this.lastMessage?.jobId,
        blob: new Blob(['late'], { type: 'image/png' }),
        width: 1,
        height: 1
      }
    } as MessageEvent;
    for (const listener of this.messageListeners) listener(event);
  }
}

describe('processImageFilterInWorker', () => {
  it('terminates on cancellation and ignores a late worker result', async () => {
    const fake = new FakeWorker();
    const controller = new AbortController();
    const pending = processImageFilterInWorker({
      file: new Blob(['source'], { type: 'image/png' }),
      preset: 'grayscale',
      intensity: 1,
      outType: 'image/png',
      signal: controller.signal,
      workerFactory: () => fake as unknown as Worker
    });

    controller.abort();
    fake.emitLateSuccess();

    await expect(pending).rejects.toThrowError('ABORTED');
    expect(fake.terminated).toBe(true);
  });
});
