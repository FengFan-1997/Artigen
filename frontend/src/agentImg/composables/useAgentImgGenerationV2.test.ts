import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { computed, ref } from 'vue';

const taskApi = vi.hoisted(() => ({
  quote: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  wait: vi.fn()
}));

const workspaceDb = vi.hoisted(() => ({
  pending: null as any,
  save: vi.fn(async (value: any) => {
    workspaceDb.pending = value;
    return true;
  }),
  load: vi.fn(async () => workspaceDb.pending),
  clear: vi.fn(async () => {
    workspaceDb.pending = null;
  })
}));

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../services/generationWorkspaceDb', () => ({
  savePendingGeneration: workspaceDb.save,
  loadPendingGeneration: workspaceDb.load,
  clearPendingGeneration: workspaceDb.clear
}));
vi.mock('../services/toolTasks', () => ({
  quoteToolTask: taskApi.quote,
  createToolTask: taskApi.create,
  getToolTask: taskApi.get,
  cancelToolTask: taskApi.cancel,
  waitForToolTask: taskApi.wait,
  createIdempotencyKey: () => 'web:durable-key',
  taskAssetUrl: (assetId: string) => `/api/assets/${assetId}`,
  ToolTaskClientError: class ToolTaskClientError extends Error {
    code: string;
    retryable = false;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
}));

import { useAgentImgGenerationV2 } from './useAgentImgGenerationV2';

const assetId = '22222222-2222-4222-8222-222222222222';

const task = (status: string, extra: Record<string, unknown> = {}) => ({
  taskId: '11111111-1111-4111-8111-111111111111',
  toolId: 'ai-design',
  operation: 'generate',
  status,
  assets: [],
  warnings: [],
  result: null,
  error: null,
  receipt: {
    sku: 'ai-design.generate.v1',
    quotedCredits: 10,
    chargedCredits: status === 'success' ? 10 : 0,
    refundedCredits: 0
  },
  ...extra
});

const createDeps = (deep = false) => {
  const history = ref<any[]>([]);
  const flow = {
    userInput: ref('Create a premium serum campaign'),
    deepMode: ref(deep),
    loading: ref(false),
    error: ref(''),
    options: ref<any[]>([]),
    selectedOptionId: ref(''),
    selectedOptionTitle: computed(() => ''),
    selectedOptionSummary: computed(() => ''),
    cancel: vi.fn()
  };
  const setHistoryItemStatus = (id: string | number, next: Record<string, unknown>) => {
    history.value = history.value.map((item) => (item.id === id ? { ...item, ...next } : item));
  };
  return {
    history,
    flow,
    deps: {
      auth: { ensureAuthed: () => true, isAuthed: ref(true) },
      credits: { refreshCredits: vi.fn(async () => {}) },
      upload: { previewFiles: ref<Array<File | null>>([]), fileToThumbDataUrl: vi.fn() },
      history: {
        history,
        setCancelNoticeForHistory: vi.fn(),
        setHistoryItemStatus
      },
      flow,
      settings: {
        buildProductProfileContextText: () => 'Product Name: Serum',
        productProfileSnapshot: () => ({
          productName: 'Serum',
          productCategory: 'Beauty',
          material: 'Glass',
          sceneType: '',
          lighting: '',
          primaryColor: '',
          brandName: 'Artigen',
          designElements: [],
          styles: [],
          colors: []
        })
      },
      config: {
        profileId: ref('standard-v1'),
        aspectRatio: ref('4:5'),
        profileAvailable: ref(true)
      },
      ui: { scrollChatToBottom: vi.fn(), showTopTip: vi.fn() }
    }
  };
};

describe('AI design unified task controller', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    workspaceDb.pending = null;
    vi.clearAllMocks();
    taskApi.quote.mockResolvedValue({
      quoteId: 'quote-generate',
      sku: 'ai-design.generate.v1',
      credits: 10,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    taskApi.create.mockResolvedValue(task('queued'));
    taskApi.wait.mockResolvedValue(task('success', {
      assets: [{ assetId, url: `/api/assets/${assetId}`, mimeType: 'image/png', byteSize: 100 }],
      result: {
        assets: [{ assetId, url: `/api/assets/${assetId}`, mimeType: 'image/png', byteSize: 100 }],
        data: { profileId: 'standard-v1', aspectRatio: '4:5', seed: null },
        receipt: {},
        warnings: []
      }
    }));
  });

  it('does not create or charge a task until the server quote is confirmed', async () => {
    const { deps, history, flow } = createDeps(false);
    const controller = useAgentImgGenerationV2(deps as any);

    await controller.prepareSubmission();
    expect(taskApi.quote).toHaveBeenCalledWith({
      toolId: 'ai-design',
      operation: 'generate',
      options: { profileId: 'standard-v1' }
    });
    expect(controller.quoteConfirmation.value?.quote.credits).toBe(10);
    expect(taskApi.create).not.toHaveBeenCalled();
    expect(flow.userInput.value).toContain('premium serum');

    await controller.confirmQuote();
    expect(workspaceDb.save).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'web:durable-key',
      operation: 'generate',
      quote: expect.objectContaining({ quoteId: 'quote-generate' })
    }));
    expect(taskApi.create).toHaveBeenCalledWith(expect.objectContaining({
      toolId: 'ai-design',
      operation: 'generate',
      quoteId: 'quote-generate',
      idempotencyKey: 'web:durable-key',
      options: expect.objectContaining({ profileId: 'standard-v1', aspectRatio: '4:5' })
    }));
    expect(history.value).toHaveLength(1);
    expect(history.value[0]).toMatchObject({ status: 'success', image: `/api/assets/${assetId}` });
    expect(workspaceDb.clear).toHaveBeenCalled();
  });

  it('quotes directions separately at five credits and maps four returned directions', async () => {
    taskApi.quote.mockResolvedValueOnce({
      quoteId: 'quote-directions',
      sku: 'ai-design.directions.v1',
      credits: 5,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    taskApi.create.mockResolvedValueOnce({ ...task('queued'), operation: 'directions' });
    taskApi.wait.mockResolvedValueOnce(task('success', {
      operation: 'directions',
      result: {
        assets: [],
        data: {
          directions: [1, 2, 3, 4].map((number) => ({
            id: `d${number}`,
            title: `Direction ${number}`,
            summary: `Summary ${number}`,
            prompt: `Prompt ${number}`
          }))
        },
        receipt: {},
        warnings: []
      },
      receipt: {
        sku: 'ai-design.directions.v1',
        quotedCredits: 5,
        chargedCredits: 5,
        refundedCredits: 0
      }
    }));
    const { deps, flow } = createDeps(true);
    const controller = useAgentImgGenerationV2(deps as any);

    await controller.prepareSubmission();
    expect(controller.quoteConfirmation.value?.quote.credits).toBe(5);
    expect(taskApi.create).not.toHaveBeenCalled();
    await controller.confirmQuote();

    expect(taskApi.create).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'directions',
      files: [],
      options: expect.objectContaining({ locale: 'zh', productProfile: expect.any(Object) })
    }));
    expect(flow.options.value).toHaveLength(4);
    expect(flow.selectedOptionId.value).toBe('d1');
  });

  it('forces a ten-credit generation quote for variation while deep mode has no active directions', async () => {
    const { deps } = createDeps(true);
    const controller = useAgentImgGenerationV2(deps as any);

    await controller.prepareSubmission('generate');

    expect(taskApi.quote).toHaveBeenCalledWith({
      toolId: 'ai-design',
      operation: 'generate',
      options: { profileId: 'standard-v1' }
    });
    expect(controller.quoteConfirmation.value).toMatchObject({
      operation: 'generate',
      quote: { sku: 'ai-design.generate.v1', credits: 10 }
    });
  });

  it('replays the persisted quote and idempotency key after a lost response even when the local quote clock expired', async () => {
    const { deps, history } = createDeps(false);
    workspaceDb.pending = {
      version: 1,
      operation: 'generate',
      idempotencyKey: 'web:response-loss-key',
      quote: {
        quoteId: 'quote-before-response-loss',
        sku: 'ai-design.generate.v1',
        credits: 10,
        expiresAt: new Date(Date.now() - 60_000).toISOString()
      },
      options: {
        prompt: 'Recovered prompt',
        profileId: 'standard-v1',
        aspectRatio: '1:1'
      },
      files: [],
      historyId: 'generation-recovered',
      userText: 'Recovered prompt',
      refThumbs: [],
      createdAt: Date.now()
    };
    const controller = useAgentImgGenerationV2(deps as any);

    await controller.resumePendingTask();

    expect(taskApi.create).toHaveBeenCalledWith(expect.objectContaining({
      quoteId: 'quote-before-response-loss',
      idempotencyKey: 'web:response-loss-key'
    }));
    expect(workspaceDb.save).toHaveBeenCalledWith(expect.objectContaining({
      taskId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: 'web:response-loss-key'
    }));
    expect(history.value[0]).toMatchObject({ status: 'success', image: `/api/assets/${assetId}` });
  });

  it('refreshes the visible balance after a terminal failure releases the held credits', async () => {
    taskApi.wait.mockResolvedValueOnce(task('failed', {
      error: { code: 'PROVIDER_TIMEOUT', retryable: true },
      receipt: {
        sku: 'ai-design.generate.v1',
        quotedCredits: 10,
        chargedCredits: 0,
        refundedCredits: 10
      }
    }));
    const { deps, history } = createDeps(false);
    const controller = useAgentImgGenerationV2(deps as any);

    await controller.prepareSubmission();
    await controller.confirmQuote();

    expect(history.value[0]).toMatchObject({ status: 'failed', errorCode: 'PROVIDER_TIMEOUT' });
    expect(deps.credits.refreshCredits).toHaveBeenCalledTimes(1);
  });
});
