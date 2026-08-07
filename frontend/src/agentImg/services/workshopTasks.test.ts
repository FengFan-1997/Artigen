import { describe, expect, it, vi } from 'vitest';
import {
  buildWorkshopRequestDigest,
  deserializePendingWorkshopTask,
  resumePersistedWorkshopTask,
  serializePendingWorkshopTask,
  startPersistedWorkshopTask,
  type PendingWorkshopTask
} from './workshopTasks';
import type { ServerToolTask, ToolTaskQuote } from './toolTasks';

const quote: ToolTaskQuote = {
  quoteId: '11111111-1111-4111-8111-111111111111',
  sku: 'workshop.ingredient-layout-ai.v1',
  credits: 10,
  expiresAt: '2030-01-01T00:00:00.000Z'
};

const successTask: ServerToolTask = {
  taskId: '22222222-2222-4222-8222-222222222222',
  toolId: 'ingredient-label',
  operation: 'ai-organize-source-text',
  status: 'success',
  assets: [],
  warnings: [],
  result: {
    assets: [],
    data: {
      layoutType: 'standard',
      sections: [{ title: 'SOURCE TEXT', content: ['water'] }]
    },
    receipt: {
      sku: quote.sku,
      quotedCredits: 10,
      chargedCredits: 10,
      refundedCredits: 0
    },
    warnings: []
  },
  error: null,
  receipt: {
    sku: quote.sku,
    quotedCredits: 10,
    chargedCredits: 10,
    refundedCredits: 0
  }
};

describe('persisted workshop tasks', () => {
  it('stores upload bytes instead of relying on IndexedDB File cloning', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'portrait.png', {
      type: 'image/png',
      lastModified: 1234
    });
    const pending: PendingWorkshopTask = {
      version: 1,
      slot: 'professional-portrait',
      toolId: 'id-photo',
      operation: 'professional-portrait',
      options: { style: 'finance' },
      quote,
      idempotencyKey: 'web:file-portability',
      requestDigest: 'digest',
      file,
      taskId: '',
      createdAt: Date.now()
    };
    const stored = await serializePendingWorkshopTask(pending);
    expect(stored.file).not.toBeInstanceOf(File);
    expect((stored.file as any).bytes).toBeInstanceOf(ArrayBuffer);
    const restored = deserializePendingWorkshopTask(stored);
    expect(restored?.file).toBeInstanceOf(File);
    expect(restored?.file?.name).toBe('portrait.png');
    expect(restored?.file?.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await restored!.file!.arrayBuffer()))).toEqual([1, 2, 3, 4]);
  });

  it('uses a canonical request digest and includes source changes', async () => {
    const first = await buildWorkshopRequestDigest({
      toolId: 'ingredient-label',
      operation: 'ai-organize-source-text',
      quoteId: quote.quoteId,
      options: { productType: 'Food', sourceText: 'water' }
    });
    const reordered = await buildWorkshopRequestDigest({
      toolId: 'ingredient-label',
      operation: 'ai-organize-source-text',
      quoteId: quote.quoteId,
      options: { sourceText: 'water', productType: 'Food' }
    });
    const changed = await buildWorkshopRequestDigest({
      toolId: 'ingredient-label',
      operation: 'ai-organize-source-text',
      quoteId: quote.quoteId,
      options: { sourceText: 'water, sugar', productType: 'Food' }
    });
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('persists key and quote before POST, then reuses both after a lost response', async () => {
    let pending: PendingWorkshopTask | null = null;
    const persistence = {
      load: vi.fn(async () => pending),
      save: vi.fn(async (next: PendingWorkshopTask) => {
        pending = structuredClone(next);
        return true;
      }),
      clear: vi.fn(async () => {
        pending = null;
      })
    };
    const attempts: Array<{ key?: string; quoteId: string }> = [];
    const create = vi.fn(async (input: any) => {
      attempts.push({ key: input.idempotencyKey, quoteId: input.quoteId });
      if (attempts.length === 1) throw new TypeError('Failed to fetch after dispatch');
      return successTask;
    });
    const deps = {
      persistence,
      api: {
        create,
        get: vi.fn(),
        wait: vi.fn(),
        cancel: vi.fn()
      }
    };

    await expect(startPersistedWorkshopTask({
      slot: 'ingredient-label-ai',
      toolId: 'ingredient-label',
      operation: 'ai-organize-source-text',
      options: { sourceText: 'water', productType: 'Food' },
      quote
    }, deps as any)).rejects.toThrow(/Failed to fetch/);

    const saved = persistence.save.mock.calls.at(-1)?.[0] as PendingWorkshopTask;
    expect(saved.idempotencyKey).toMatch(/^web:/);
    expect(saved.quote.quoteId).toBe(quote.quoteId);
    expect(persistence.save.mock.invocationCallOrder[0])
      .toBeLessThan(create.mock.invocationCallOrder[0]);

    await expect(resumePersistedWorkshopTask(
      'ingredient-label-ai',
      undefined,
      undefined,
      deps as any
    )).resolves.toMatchObject({ status: 'success' });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(persistence.clear).toHaveBeenCalledWith('ingredient-label-ai');
    expect(pending).toBeNull();
  });

  it('refuses paid submission when recovery state cannot be stored', async () => {
    const create = vi.fn();
    await expect(startPersistedWorkshopTask({
      slot: 'old-photo',
      toolId: 'old-photo',
      operation: 'enhance',
      options: { denoise: true },
      quote
    }, {
      persistence: {
        load: async () => null,
        save: async () => false,
        clear: async () => {}
      },
      api: { create, get: vi.fn(), wait: vi.fn(), cancel: vi.fn() }
    } as any)).rejects.toMatchObject({ code: 'BROWSER_STORAGE_UNAVAILABLE' });
    expect(create).not.toHaveBeenCalled();
  });

  it('clears an expired quote record so the UI can request and confirm a new server price', async () => {
    let pending: PendingWorkshopTask | null = null;
    const clear = vi.fn(async () => { pending = null; });
    const persistence = {
      load: async () => pending,
      save: async (next: PendingWorkshopTask) => {
        pending = next;
        return true;
      },
      clear
    };
    const priceChanged = Object.assign(new Error('PRICE_CHANGED'), {
      code: 'PRICE_CHANGED',
      retryable: true
    });
    await expect(startPersistedWorkshopTask({
      slot: 'professional-portrait',
      toolId: 'id-photo',
      operation: 'professional-portrait',
      options: { style: 'finance' },
      quote
    }, {
      persistence,
      api: {
        create: vi.fn(async () => { throw priceChanged; }),
        get: vi.fn(),
        wait: vi.fn(),
        cancel: vi.fn()
      }
    } as any)).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    expect(clear).toHaveBeenCalledWith('professional-portrait');
    expect(pending).toBeNull();
  });

  it('durably replays an unknown POST outcome before cancelling the recovered task', async () => {
    const { cancelPersistedWorkshopTask } = await import('./workshopTasks');
    let pending: PendingWorkshopTask | null = {
      version: 1,
      slot: 'old-photo',
      toolId: 'old-photo',
      operation: 'enhance',
      options: { denoise: true },
      quote,
      idempotencyKey: 'web:durable-cancel',
      requestDigest: await buildWorkshopRequestDigest({
        toolId: 'old-photo',
        operation: 'enhance',
        options: { denoise: true },
        quoteId: quote.quoteId
      }),
      file: null,
      taskId: '',
      createdAt: Date.now()
    };
    const create = vi.fn(async () => ({ ...successTask, status: 'queued' as const }));
    const cancel = vi.fn(async () => ({
      ...successTask,
      status: 'cancelled' as const,
      result: null,
      error: { code: 'TASK_CANCELLED', retryable: false }
    }));
    const persistence = {
      load: vi.fn(async () => pending),
      save: vi.fn(async (next: PendingWorkshopTask) => {
        pending = next;
        return true;
      }),
      clear: vi.fn(async () => { pending = null; })
    };
    const task = await cancelPersistedWorkshopTask('old-photo', undefined, {
      persistence,
      api: { create, get: vi.fn(), wait: vi.fn(), cancel }
    } as any);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'web:durable-cancel',
      quoteId: quote.quoteId
    }));
    expect(cancel).toHaveBeenCalledWith(successTask.taskId);
    expect(task?.status).toBe('cancelled');
    expect(pending).toBeNull();
  });

  it('keeps recovery state when durable cancellation cannot be confirmed', async () => {
    const { cancelPersistedWorkshopTask } = await import('./workshopTasks');
    const pending: PendingWorkshopTask = {
      version: 1,
      slot: 'background-ai-scene',
      toolId: 'background',
      operation: 'ai-scene',
      options: { mode: 'add', presetId: 'forest' },
      quote,
      idempotencyKey: 'web:cancel-pending',
      requestDigest: await buildWorkshopRequestDigest({
        toolId: 'background',
        operation: 'ai-scene',
        options: { mode: 'add', presetId: 'forest' },
        quoteId: quote.quoteId
      }),
      file: null,
      taskId: '',
      createdAt: Date.now()
    };
    const clear = vi.fn();
    let stored: PendingWorkshopTask = pending;
    const persistence = {
      load: async () => stored,
      save: async (next: PendingWorkshopTask) => {
        stored = next;
        return true;
      },
      clear
    };
    const create = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ ...successTask, status: 'queued' as const });
    const cancel = vi.fn(async () => ({
      ...successTask,
      status: 'cancelled' as const,
      result: null,
      error: { code: 'TASK_CANCELLED', retryable: false }
    }));
    await expect(cancelPersistedWorkshopTask('background-ai-scene', undefined, {
      persistence,
      api: {
        create,
        get: vi.fn(),
        wait: vi.fn(),
        cancel
      }
    } as any)).rejects.toMatchObject({ code: 'TASK_CANCEL_PENDING', retryable: true });
    expect(stored.cancelRequestedAt).toEqual(expect.any(Number));
    expect(clear).not.toHaveBeenCalled();

    await expect(resumePersistedWorkshopTask(
      'background-ai-scene',
      undefined,
      undefined,
      {
        persistence,
        api: {
          create,
          get: vi.fn(),
          wait: vi.fn(),
          cancel
        }
      } as any
    )).resolves.toMatchObject({ status: 'cancelled' });
    expect(create).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledWith(successTask.taskId);
    expect(clear).toHaveBeenCalledWith('background-ai-scene');
  });

  it('keeps a normal pending task resumable across refresh without adding cancel intent', async () => {
    const pending: PendingWorkshopTask = {
      version: 1,
      slot: 'old-photo',
      toolId: 'old-photo',
      operation: 'enhance',
      options: { denoise: true },
      quote,
      idempotencyKey: 'web:refresh-resume',
      requestDigest: await buildWorkshopRequestDigest({
        toolId: 'old-photo',
        operation: 'enhance',
        options: { denoise: true },
        quoteId: quote.quoteId
      }),
      file: null,
      taskId: successTask.taskId,
      createdAt: Date.now()
    };
    const cancel = vi.fn();
    const get = vi.fn(async () => successTask);
    await expect(resumePersistedWorkshopTask('old-photo', undefined, undefined, {
      persistence: {
        load: async () => pending,
        save: async () => true,
        clear: async () => {}
      },
      api: {
        create: vi.fn(),
        get,
        wait: vi.fn(),
        cancel
      }
    } as any)).resolves.toMatchObject({ status: 'success' });
    expect(get).toHaveBeenCalledWith(successTask.taskId, undefined);
    expect(cancel).not.toHaveBeenCalled();
  });
});
