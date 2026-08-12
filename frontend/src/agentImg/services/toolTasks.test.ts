import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authFetch, uploadTaskAssets, shouldFallbackToMultipart } = vi.hoisted(() => ({
  authFetch: vi.fn(),
  uploadTaskAssets: vi.fn(),
  shouldFallbackToMultipart: vi.fn(() => true)
}));
vi.mock('@/login/authFetch', () => ({ authFetch }));
vi.mock('./directAssetUploads', () => ({ uploadTaskAssets, shouldFallbackToMultipart }));

import {
  createEditorTransfer,
  createToolTask,
  getGenerationModels,
  quoteToolTask
} from './toolTasks';

describe('unified tool task client', () => {
  beforeEach(() => {
    authFetch.mockReset();
    uploadTaskAssets.mockReset();
    uploadTaskAssets.mockRejectedValue(new TypeError('direct upload unavailable'));
    shouldFallbackToMultipart.mockClear();
  });

  it('quotes without sending price authority', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      quote: {
        quoteId: 'quote-uuid',
        sku: 'workshop.old-photo.v1',
        credits: 7,
        expiresAt: '2026-07-15T10:00:00.000Z'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(quoteToolTask({ toolId: 'old-photo', operation: 'enhance' })).resolves.toMatchObject({
      quoteId: 'quote-uuid',
      credits: 7
    });
    const init = authFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ toolId: 'old-photo', operation: 'enhance' });
  });

  it('creates multipart with only operation options and server quote', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      task: {
        taskId: 'task-uuid',
        toolId: 'old-photo',
        operation: 'enhance-colorize',
        status: 'queued',
        result: null,
        error: null,
        receipt: { sku: 'workshop.old-photo.v1', quotedCredits: 5, chargedCredits: 0, refundedCredits: 0 }
      }
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));

    await createToolTask({
      toolId: 'old-photo',
      operation: 'enhance-colorize',
      options: { denoise: true },
      quoteId: 'quote-uuid',
      file: new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'old.png', { type: 'image/png' }),
      idempotencyKey: 'test:old-photo:1'
    });
    const init = authFetch.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('toolId')).toBe('old-photo');
    expect(form.get('operation')).toBe('enhance-colorize');
    expect(JSON.parse(String(form.get('options')))).toEqual({ denoise: true });
    expect(form.has('cost')).toBe(false);
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('test:old-photo:1');
  });

  it('preserves unified nested error fields', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: 'PRICE_CHANGED', field: 'quoteId', retryable: true }
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
    await expect(quoteToolTask({ toolId: 'old-photo', operation: 'enhance' })).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
      field: 'quoteId',
      retryable: true
    });
  });

  it('supports zero-to-three generation files without client pricing fields', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      task: {
        taskId: 'task-generation',
        toolId: 'ai-design',
        operation: 'generate',
        status: 'queued',
        assets: [],
        warnings: [],
        result: null,
        error: null,
        receipt: { sku: 'ai-design.generate.v1', quotedCredits: 10, chargedCredits: 0, refundedCredits: 0 }
      }
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));

    const product = new File(['product'], 'product.png', { type: 'image/png' });
    const style = new File(['style'], 'style.webp', { type: 'image/webp' });
    await createToolTask({
      toolId: 'ai-design',
      operation: 'generate',
      quoteId: 'quote-generation',
      options: { prompt: 'safe prompt', profileId: 'standard-v1', aspectRatio: '4:5' },
      files: [product, style],
      idempotencyKey: 'web:durable-generation'
    });

    const init = authFetch.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form.getAll('files')).toEqual([product, style]);
    expect(form.get('inputAssets')).toBe('[]');
    expect(form.has('price')).toBe(false);
    expect(form.has('cost')).toBe(false);
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('web:durable-generation');
  });

  it('uses direct asset IDs when Uppy succeeds while preserving the task API contract', async () => {
    uploadTaskAssets.mockResolvedValueOnce(['asset-one', 'asset-two']);
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      task: {
        taskId: 'task-direct',
        toolId: 'ai-design',
        operation: 'generate',
        status: 'queued',
        assets: [],
        warnings: [],
        result: null,
        error: null,
        receipt: { sku: 'ai-design.generate.v1', quotedCredits: 10, chargedCredits: 0, refundedCredits: 0 }
      }
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));

    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.webp', { type: 'image/webp' })
    ];
    await createToolTask({
      toolId: 'ai-design',
      operation: 'generate',
      quoteId: 'quote-direct',
      files,
      inputAssets: ['existing-asset'],
      idempotencyKey: 'web:direct-assets'
    });

    expect(uploadTaskAssets).toHaveBeenCalledWith(expect.objectContaining({
      files,
      taskIdempotencyKey: 'web:direct-assets'
    }));
    const form = authFetch.mock.calls[0][1].body as FormData;
    expect(form.getAll('files')).toEqual([]);
    expect(JSON.parse(String(form.get('inputAssets')))).toEqual([
      'existing-asset',
      'asset-one',
      'asset-two'
    ]);
  });

  it('reads only stable generation model profiles', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      models: [{
        id: 'standard-v1',
        name: { zh: '标准生成', en: 'Standard generation' },
        available: true,
        capabilities: ['text-to-image', 'image-reference'],
        maxReferences: 1,
        aspectRatios: ['1:1', '4:5'],
        supportsSeed: true,
        provider: 'must-not-be-consumed'
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(getGenerationModels()).resolves.toEqual([{
      id: 'standard-v1',
      name: { zh: '标准生成', en: 'Standard generation' },
      available: true,
      capabilities: ['text-to-image', 'image-reference'],
      maxReferences: 1,
      aspectRatios: ['1:1', '4:5'],
      supportsSeed: true
    }]);
  });

  it('creates an opaque editor transfer from an owned asset id', async () => {
    authFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      transferId: '11111111-1111-4111-8111-111111111111'
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

    await expect(
      createEditorTransfer('22222222-2222-4222-8222-222222222222')
    ).resolves.toBe('11111111-1111-4111-8111-111111111111');
    const init = authFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      assetId: '22222222-2222-4222-8222-222222222222'
    });
  });
});
