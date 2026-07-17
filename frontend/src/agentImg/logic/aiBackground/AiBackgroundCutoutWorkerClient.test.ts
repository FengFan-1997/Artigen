import { describe, expect, test } from 'vitest';
import {
  AiBackgroundCutoutWorkerClient,
  CutoutCancelledError
} from './AiBackgroundCutoutWorkerClient';
import type { CutoutWorkerRequest } from './cutoutProtocol';

class FakeWorker {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  readonly messages: CutoutWorkerRequest[] = [];
  terminated = false;

  postMessage(message: CutoutWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('AiBackgroundCutoutWorkerClient cancellation', () => {
  test('terminates active pixel work and rejects the pending promise', async () => {
    const worker = new FakeWorker();
    const client = new AiBackgroundCutoutWorkerClient(() => worker as unknown as Worker);
    const pending = client.run({ source: new Blob(['image']), sourceRevision: 4 });

    client.cancelCurrent();

    await expect(pending).rejects.toBeInstanceOf(CutoutCancelledError);
    expect(worker.terminated).toBe(true);
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[0]).toMatchObject({ type: 'process', sourceRevision: 4 });
    expect(worker.messages[1]).toMatchObject({
      type: 'cancel',
      jobId: worker.messages[0]?.jobId,
      sourceRevision: 4
    });
  });
});
