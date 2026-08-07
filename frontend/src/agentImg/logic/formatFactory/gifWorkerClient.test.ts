import { describe, expect, it } from 'vitest';
import { createGifWorkerSession } from './gifWorkerClient';

class FakeWorker {
  terminated = false;
  private messageListeners = new Set<(event: MessageEvent) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

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

  postMessage(message: any) {
    if (message.type !== 'init') return;
    queueMicrotask(() => {
      const event = { data: { requestId: message.requestId, type: 'ready' } } as MessageEvent;
      for (const listener of this.messageListeners) listener(event);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

describe('createGifWorkerSession', () => {
  it('terminates the dedicated worker and rejects an in-flight frame on cancel', async () => {
    const fake = new FakeWorker();
    const controller = new AbortController();
    const session = await createGifWorkerSession({
      width: 2,
      height: 2,
      delayMilliseconds: 100,
      maxColors: 16,
      signal: controller.signal,
      workerFactory: () => fake as unknown as Worker
    });
    const pending = session.addFrame(new Uint8Array(16).buffer);
    controller.abort();
    await expect(pending).rejects.toThrowError('ABORTED');
    expect(fake.terminated).toBe(true);
  });
});
