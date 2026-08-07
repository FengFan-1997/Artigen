import { ref, shallowRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { trackEvent } from '@/utils/analytics';
import type { AgentImgDirectionOption, AgentImgPromptResult } from '../types';
import type { HistoryItem } from './useAgentImgHistory';
import type {
  GenerationDirection,
  GenerationOperation,
  PendingGenerationSubmission,
  ProductProfileSnapshot
} from '../domain/generationWorkspace';
import { normalizeGenerationDirections } from '../domain/generationWorkspace';
import {
  cancelToolTask,
  createIdempotencyKey,
  createToolTask,
  getToolTask,
  quoteToolTask,
  taskAssetUrl,
  ToolTaskClientError,
  waitForToolTask,
  type ServerToolTask,
  type ToolTaskQuote
} from '../services/toolTasks';
import {
  clearPendingGeneration,
  loadPendingGeneration,
  savePendingGeneration
} from '../services/generationWorkspaceDb';

type MutableRef<T> = { value: T };

export type GenerationV2Deps = {
  auth: {
    ensureAuthed: (cb?: () => void) => boolean;
    isAuthed: Ref<boolean>;
  };
  credits: {
    refreshCredits: () => Promise<void>;
  };
  upload: {
    previewFiles: MutableRef<Array<File | null>>;
    fileToThumbDataUrl: (file: File) => Promise<string | null>;
  };
  history: {
    history: MutableRef<HistoryItem[]>;
    setCancelNoticeForHistory: (id: string | number, text: string) => void;
    setHistoryItemStatus: (
      id: string | number,
      next: Partial<Pick<
        HistoryItem,
        | 'status'
        | 'errorCode'
        | 'errorText'
        | 'failedStage'
        | 'image'
        | 'taskId'
        | 'assetId'
        | 'profileId'
        | 'aspectRatio'
      >>
    ) => void;
  };
  flow: {
    userInput: MutableRef<string>;
    deepMode: MutableRef<boolean>;
    loading: MutableRef<boolean>;
    error: MutableRef<string>;
    options: MutableRef<AgentImgDirectionOption[]>;
    selectedOptionId: MutableRef<string>;
    selectedOptionTitle: MutableRef<string>;
    selectedOptionSummary: MutableRef<string>;
    cancel: () => void;
  };
  settings: {
    buildProductProfileContextText: () => string;
    productProfileSnapshot: () => ProductProfileSnapshot;
  };
  config: {
    profileId: MutableRef<string>;
    aspectRatio: MutableRef<string>;
    profileAvailable: MutableRef<boolean>;
    projectId?: MutableRef<string>;
    parentVersionId?: MutableRef<string>;
  };
  ui: {
    scrollChatToBottom: () => void;
    showTopTip: (message: string) => void;
    onInsufficientCredits?: () => void;
  };
};

type QuoteConfirmation = {
  operation: GenerationOperation;
  quote: ToolTaskQuote;
};

const MAX_HISTORY = 200;
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const makeHistoryId = () => {
  try {
    return `generation_${crypto.randomUUID()}`;
  } catch {
    return `generation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
};

const isAbortError = (error: unknown) => {
  const code = String((error as any)?.code || (error as any)?.name || (error as any)?.message || '');
  return code === 'AbortError' || code === 'TASK_CANCELLED' || /abort|cancel/i.test(code);
};

const outputAssets = (task: ServerToolTask) => {
  const resultAssets = Array.isArray(task.result?.assets) ? task.result.assets : [];
  return resultAssets.length ? resultAssets : Array.isArray(task.assets) ? task.assets : [];
};

export function useAgentImgGenerationV2(deps: GenerationV2Deps) {
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);
  const pendingUserText = ref('');
  const lastUserText = ref('');
  const pendingNotice = ref<{ type: 'cancel'; text: string } | null>(null);
  // Pending payloads must remain structured-cloneable for IndexedDB. A deep Vue
  // proxy causes DataCloneError in Chromium/WebKit when the confirmed draft is saved.
  const quoteConfirmation = shallowRef<QuoteConfirmation | null>(null);
  const quoteDraft = shallowRef<PendingGenerationSubmission | null>(null);
  const activeTaskId = ref('');
  const activeHistoryId = ref('');
  const activeAbort = ref<AbortController | null>(null);
  let runRevision = 0;

  const localized = (zh: string, en: string) => (currentLang.value === 'zh' ? zh : en);

  const humanizeError = (error: unknown) => {
    const code = String((error as any)?.code || (error as any)?.message || error || 'TOOL_TASK_FAILED');
    const messages: Record<string, [string, string]> = {
      MODEL_PROFILE_UNAVAILABLE: ['服务繁忙，请稍后再试', 'Service is busy. Please try again later.'],
      INVALID_ASPECT_RATIO: ['当前模型不支持这个画面比例', 'This aspect ratio is not supported by the current profile.'],
      CONTENT_POLICY_REJECTED: ['请求未通过内容安全检查，请调整描述', 'The request did not pass the content policy check. Please revise it.'],
      TASK_PAYLOAD_KEY_MISSING: ['付费生图安全配置缺失，任务未创建', 'Secure paid-generation configuration is missing. No task was created.'],
      PROVIDER_TIMEOUT: ['模型服务超时，预占点数将自动释放', 'The model provider timed out. Held credits will be released.'],
      REFERENCE_IMAGES_NOT_SUPPORTED: ['标准生成仅支持文生图，请移除参考图或切换到商品参考生成', 'Standard generation supports text-to-image only. Remove references or choose product-reference generation.'],
      REFERENCE_IMAGE_REQUIRED: ['商品参考生成必须在第一个槽位上传商品图', 'Product reference generation requires a product image in the first slot.'],
      OUTPUT_INVALID: ['生成结果未通过验证，预占点数将自动释放', 'The output failed validation. Held credits will be released.'],
      TASK_LEASE_LOST: ['任务执行实例已切换，请稍后查看状态', 'The task worker changed. Check the status again shortly.'],
      TASK_POLL_TIMEOUT: ['任务仍在处理中，刷新页面会继续恢复进度', 'The task is still running. Refreshing will resume its status.'],
      BROWSER_STORAGE_UNAVAILABLE: ['浏览器无法安全保存任务恢复信息，本次未提交', 'The browser could not safely store recovery data, so the task was not submitted.'],
      PRICE_CHANGED: ['报价已变化，请重新确认', 'The quote changed. Please confirm the new price.'],
      QUOTE_EXPIRED: ['报价已过期，请重新提交并确认', 'The quote expired. Submit again to confirm a fresh quote.'],
      LOGIN_REQUIRED: ['请先登录后再生成', 'Please sign in before generating.'],
      INSUFFICIENT_CREDITS: ['点数不足，请先充值', 'You do not have enough credits.'],
      TASK_CANCELLED: ['已取消，预占点数将自动释放', 'Cancelled. Held credits will be released.'],
      AbortError: ['已取消', 'Cancelled.'],
      NETWORK_ERROR: ['网络异常，任务信息已保留，可刷新恢复', 'Network error. Task recovery information was preserved.']
    };
    const pair = messages[code];
    if (pair) return localized(pair[0], pair[1]);
    if (/network|fetch/i.test(code)) return localized(messages.NETWORK_ERROR[0], messages.NETWORK_ERROR[1]);
    return localized('生成任务失败，请稍后重试', 'Generation failed. Please try again later.');
  };

  const buildPrompt = (userText: string) => {
    const request = userText.trim().slice(0, 1000);
    const context = deps.settings.buildProductProfileContextText().trim().slice(0, 2800);
    if (!context) return request;
    const combined = currentLang.value === 'zh'
      ? `产品档案：\n${context}\n\n用户需求：\n${request}`
      : `Product Profile:\n${context}\n\nUser Request:\n${request}`;
    return combined.slice(0, 4000);
  };

  const ensureHistoryItem = (pending: PendingGenerationSubmission) => {
    if (pending.operation !== 'generate') return;
    if (deps.history.history.value.some((item) => String(item.id) === pending.historyId)) return;
    const prompt = String(pending.options.prompt || pending.userText).trim();
    const result: AgentImgPromptResult = { prompt, negativePrompt: '' };
    const historyItem: HistoryItem = {
      id: pending.historyId,
      timestamp: pending.createdAt,
      userText: pending.userText,
      result,
      image: null,
      status: 'pending',
      ...(pending.refThumbs.length ? { refImages: pending.refThumbs } : {}),
      notice: null,
      taskV2: true
    };
    deps.history.history.value = [
      ...deps.history.history.value,
      historyItem
    ].slice(-MAX_HISTORY);
  };

  const failHistory = (pending: PendingGenerationSubmission, error: unknown) => {
    const message = humanizeError(error);
    if (pending.operation === 'generate') {
      ensureHistoryItem(pending);
      deps.history.setHistoryItemStatus(pending.historyId, {
        status: isAbortError(error) ? 'cancelled' : 'failed',
        errorCode: String((error as any)?.code || (error as any)?.message || 'TOOL_TASK_FAILED'),
        errorText: message,
        failedStage: 'generation',
        image: null
      });
    } else {
      const result: AgentImgPromptResult = {
        prompt: String(pending.options.prompt || pending.userText),
        negativePrompt: ''
      };
      const historyItem: HistoryItem = {
        id: pending.historyId,
        timestamp: pending.createdAt,
        userText: pending.userText,
        result,
        image: null,
        status: isAbortError(error) ? 'cancelled' : 'failed',
        errorCode: String((error as any)?.code || (error as any)?.message || 'DIRECTIONS_FAILED'),
        errorText: message,
        failedStage: 'directions'
      };
      deps.history.history.value = [
        ...deps.history.history.value,
        historyItem
      ].slice(-MAX_HISTORY);
    }
    deps.ui.showTopTip(message);
  };

  const applyDirections = (directions: GenerationDirection[]) => {
    deps.flow.options.value = directions.map((direction) => ({
      id: direction.id,
      title: direction.title,
      summary: direction.summary,
      prompt: direction.prompt,
      styleTags: [],
      negativeTags: []
    }));
    deps.flow.selectedOptionId.value = deps.flow.options.value[0]?.id || '';
  };

  const handleTerminalTask = async (
    task: ServerToolTask,
    pending: PendingGenerationSubmission
  ) => {
    if (task.status !== 'success') {
      const code = task.error?.code || (task.status === 'cancelled' ? 'TASK_CANCELLED' : 'TOOL_TASK_FAILED');
      failHistory(pending, new ToolTaskClientError(code));
      trackEvent(task.status === 'cancelled' ? 'task_cancel' : 'task_fail', {
        operation: pending.operation,
        taskId: task.taskId,
        errorCode: code,
        retryable: Boolean(task.error?.retryable)
      });
      await deps.credits.refreshCredits().catch(() => {});
      return;
    }

    if (pending.operation === 'directions') {
      const directions = normalizeGenerationDirections((task.result?.data as any)?.directions);
      if (directions.length !== 4) {
        failHistory(pending, new ToolTaskClientError('OUTPUT_INVALID'));
        return;
      }
      applyDirections(directions);
      lastUserText.value = pending.userText;
      pendingUserText.value = '';
    } else {
      const asset = outputAssets(task)[0];
      const assetId = String(asset?.assetId || '').trim();
      if (!assetId) {
        failHistory(pending, new ToolTaskClientError('OUTPUT_INVALID'));
        return;
      }
      ensureHistoryItem(pending);
      deps.history.setHistoryItemStatus(pending.historyId, {
        status: 'success',
        errorCode: '',
        errorText: '',
        image: taskAssetUrl(assetId),
        taskId: task.taskId,
        assetId,
        profileId: String((task.result?.data as any)?.profileId || deps.config.profileId.value),
        aspectRatio: String((task.result?.data as any)?.aspectRatio || deps.config.aspectRatio.value)
      });
      lastUserText.value = pending.userText;
      trackEvent('first_image_visible', {
        operation: pending.operation,
        taskId: task.taskId,
        durationMs: Math.max(0, Date.now() - pending.createdAt),
        profileId: String((task.result?.data as any)?.profileId || deps.config.profileId.value),
        aspectRatio: String((task.result?.data as any)?.aspectRatio || deps.config.aspectRatio.value)
      });
    }
    trackEvent('task_success', {
      operation: pending.operation,
      taskId: task.taskId,
      chargedCredits: Number(task.receipt?.chargedCredits || 0),
      refundedCredits: Number(task.receipt?.refundedCredits || 0)
    });
    await deps.credits.refreshCredits().catch(() => {});
  };

  const executeSubmission = async (pending: PendingGenerationSubmission, recovering = false) => {
    const revision = ++runRevision;
    activeAbort.value?.abort();
    const controller = new AbortController();
    activeAbort.value = controller;
    activeHistoryId.value = pending.historyId;
    pendingUserText.value = pending.operation === 'directions' ? pending.userText : '';
    if (pending.operation === 'generate') ensureHistoryItem(pending);
    deps.flow.loading.value = true;
    deps.flow.error.value = '';

    try {
      let task: ServerToolTask;
      if (pending.taskId) {
        activeTaskId.value = pending.taskId;
        task = await getToolTask(pending.taskId, controller.signal);
      } else {
        // Always replay a previously confirmed submission with its original key.
        // The server checks idempotency before quote expiry, so a response lost
        // after commit can still recover the one already-created task.
        task = await createToolTask({
          toolId: 'ai-design',
          operation: pending.operation,
          options: pending.options,
          quoteId: pending.quote.quoteId,
          files: pending.files,
          projectId: pending.projectId,
          parentVersionId: pending.parentVersionId,
          idempotencyKey: pending.idempotencyKey,
          signal: controller.signal
        });
        if (revision !== runRevision) return;
        pending.taskId = task.taskId;
        activeTaskId.value = task.taskId;
        await savePendingGeneration(pending);
        trackEvent('task_queued', {
          operation: pending.operation,
          taskId: task.taskId,
          referenceCount: pending.files.length,
          recovering
        });
      }

      if (pending.cancelRequested) {
        task = await cancelToolTask(task.taskId);
      } else if (task.status === 'queued' || task.status === 'running') {
        trackEvent('task_running', { operation: pending.operation, taskId: task.taskId, recovering });
        task = await waitForToolTask(task, {
          signal: controller.signal,
          timeoutMs: 5 * 60_000,
          intervalMs: 1_000
        });
      }
      if (revision !== runRevision || controller.signal.aborted) return;
      await handleTerminalTask(task, pending);
      await clearPendingGeneration();
      pendingUserText.value = '';
    } catch (error: any) {
      if (revision !== runRevision) return;
      if (controller.signal.aborted) return;
      const code = String(error?.code || error?.name || error?.message || 'NETWORK_ERROR');
      if (code === 'INSUFFICIENT_CREDITS') deps.ui.onInsufficientCredits?.();
      const keepForRecovery = code === 'TASK_POLL_TIMEOUT' || /network|fetch/i.test(code);
      if (!keepForRecovery) {
        await clearPendingGeneration();
        failHistory(pending, error);
        trackEvent('task_fail', {
          operation: pending.operation,
          taskId: pending.taskId || '',
          errorCode: code,
          retryable: false,
          recovering
        });
      } else {
        if (pending.operation === 'generate') ensureHistoryItem(pending);
        deps.ui.showTopTip(humanizeError(error));
      }
    } finally {
      if (revision === runRevision) {
        deps.flow.loading.value = false;
        activeTaskId.value = '';
        activeHistoryId.value = '';
      }
      if (activeAbort.value === controller) activeAbort.value = null;
      deps.ui.scrollChatToBottom();
    }
  };

  const prepareSubmission = async (operationOverride?: GenerationOperation) => {
    pendingNotice.value = null;
    const rawText = String(deps.flow.userInput.value || '').trim();
    const userText = rawText || lastUserText.value.trim();
    if (!userText) return;
    if (!deps.config.profileAvailable.value) {
      deps.ui.showTopTip(humanizeError(new ToolTaskClientError('MODEL_PROFILE_UNAVAILABLE')));
      return;
    }
    const intendedOperation: GenerationOperation = operationOverride ||
      (deps.flow.deepMode.value && deps.flow.options.value.length === 0 ? 'directions' : 'generate');
    if (!deps.auth.isAuthed.value) {
      trackEvent('auth_blocked', {
        operation: intendedOperation,
        authenticated: false,
        mode: deps.flow.deepMode.value ? 'deep' : 'quick'
      });
    }
    if (!deps.auth.ensureAuthed(() => prepareSubmission(operationOverride))) return;
    let existingPending = await loadPendingGeneration();
    if (existingPending && Date.now() - existingPending.createdAt > PENDING_MAX_AGE_MS) {
      await clearPendingGeneration();
      existingPending = null;
    }
    if (existingPending?.version === 1) {
      deps.ui.showTopTip(
        localized('正在恢复上一次已确认的任务', 'Resuming the previously confirmed task.')
      );
      await executeSubmission(existingPending, true);
      return;
    }

    const operation: GenerationOperation = intendedOperation;
    const selectedDirection = deps.flow.options.value.find(
      (option) => option.id === deps.flow.selectedOptionId.value
    );
    if (!operationOverride && operation === 'generate' && deps.flow.deepMode.value && !selectedDirection) return;
    if (
      operation === 'generate' &&
      deps.config.profileId.value === 'product-reference-v1' &&
      !(deps.upload.previewFiles.value[0] instanceof File)
    ) {
      deps.ui.showTopTip(humanizeError(new ToolTaskClientError('REFERENCE_IMAGE_REQUIRED')));
      return;
    }

    deps.flow.loading.value = true;
    deps.flow.error.value = '';
    try {
      trackEvent('prompt_start', {
        operation,
        promptLength: userText.length,
        referenceCount: deps.upload.previewFiles.value.filter(Boolean).length,
        hasProductProfile: Object.values(deps.settings.productProfileSnapshot()).some((value) =>
          Array.isArray(value) ? value.length > 0 : Boolean(value)
        )
      });
      const referenceSlots = operation === 'generate'
        ? deps.upload.previewFiles.value
            .map((file, index) => ({ file, role: ['product', 'style', 'scene'][index] }))
            .filter((entry): entry is { file: File; role: string } => entry.file instanceof File)
            .slice(0, 3)
        : [];
      const files = referenceSlots.map((entry) => entry.file);
      const refThumbsRaw = await Promise.all(files.map((file) => deps.upload.fileToThumbDataUrl(file)));
      const refThumbs = refThumbsRaw.filter((value): value is string => Boolean(value));
      const options: Record<string, unknown> = operation === 'directions'
        ? {
            prompt: userText,
            locale: currentLang.value === 'zh' ? 'zh' : 'en',
            productProfile: deps.settings.productProfileSnapshot()
          }
        : {
            prompt: buildPrompt(userText),
            profileId: deps.config.profileId.value,
            aspectRatio: deps.config.aspectRatio.value,
            ...(referenceSlots.length
              ? { referenceRoles: referenceSlots.map((entry) => entry.role) }
              : {}),
            ...(selectedDirection
              ? {
                  direction: {
                    id: selectedDirection.id,
                    title: selectedDirection.title.slice(0, 100),
                    summary: selectedDirection.summary.slice(0, 400),
                    prompt: String(selectedDirection.prompt || selectedDirection.summary).slice(0, 2000)
                  }
                }
              : {})
          };
      const quote = await quoteToolTask({
        toolId: 'ai-design',
        operation,
        ...(operation === 'generate'
          ? { options: { profileId: deps.config.profileId.value } }
          : {})
      });
      quoteDraft.value = {
        version: 1,
        operation,
        idempotencyKey: createIdempotencyKey(),
        quote,
        options,
        files,
        historyId: makeHistoryId(),
        userText,
        refThumbs,
        ...(deps.config.projectId?.value ? { projectId: deps.config.projectId.value } : {}),
        ...(deps.config.parentVersionId?.value
          ? { parentVersionId: deps.config.parentVersionId.value }
          : {}),
        createdAt: Date.now()
      };
      quoteConfirmation.value = { operation, quote };
      trackEvent('quote_shown', { operation, quoteId: quote.quoteId, quotedCredits: quote.credits });
    } catch (error) {
      if (String((error as any)?.code || '') === 'INSUFFICIENT_CREDITS') {
        deps.ui.onInsufficientCredits?.();
      }
      deps.ui.showTopTip(humanizeError(error));
    } finally {
      deps.flow.loading.value = false;
    }
  };

  const confirmQuote = async () => {
    const pending = quoteDraft.value;
    if (!pending) return;
    quoteConfirmation.value = null;
    quoteDraft.value = null;
    const stored = await savePendingGeneration(pending);
    if (!stored) {
      failHistory(pending, new ToolTaskClientError('BROWSER_STORAGE_UNAVAILABLE'));
      return;
    }
    deps.flow.userInput.value = '';
    if (pending.operation === 'generate' && deps.flow.deepMode.value) {
      deps.flow.options.value = [];
      deps.flow.selectedOptionId.value = '';
    }
    if (pending.operation === 'directions') pendingUserText.value = pending.userText;
    trackEvent('quote_confirmed', {
      operation: pending.operation,
      quoteId: pending.quote.quoteId,
      quotedCredits: pending.quote.credits
    });
    await executeSubmission(pending);
  };

  const declineQuote = () => {
    const pending = quoteDraft.value;
    if (pending) trackEvent('task_cancel', { operation: pending.operation, stage: 'quote' });
    quoteConfirmation.value = null;
    quoteDraft.value = null;
  };

  const onStopProcessing = async () => {
    const taskId = activeTaskId.value;
    const historyId = activeHistoryId.value;
    runRevision += 1;
    activeAbort.value?.abort();
    activeAbort.value = null;
    deps.flow.cancel();
    deps.flow.loading.value = false;
    const pending = await loadPendingGeneration();
    if (pending) {
      pending.cancelRequested = true;
      await savePendingGeneration(pending);
    }
    if (pending?.operation === 'generate' && historyId) {
      deps.history.setCancelNoticeForHistory(historyId, localized('已取消', 'Cancelled.'));
    } else if (pendingUserText.value) {
      pendingNotice.value = { type: 'cancel', text: localized('已取消', 'Cancelled.') };
    }
    if (!taskId) return;
    try {
      await cancelToolTask(taskId);
      await clearPendingGeneration();
      trackEvent('task_cancel', { operation: pending?.operation || 'generate', taskId });
      await deps.credits.refreshCredits().catch(() => {});
    } catch {
      // The persisted cancelRequested flag lets another instance or a refreshed page finish cancellation.
    }
  };

  const abortImg2Img = () => {
    runRevision += 1;
    activeAbort.value?.abort();
    activeAbort.value = null;
  };

  const resumePendingTask = async () => {
    if (!deps.auth.isAuthed.value || deps.flow.loading.value) return;
    const pending = await loadPendingGeneration();
    if (!pending || pending.version !== 1) return;
    if (Date.now() - pending.createdAt > PENDING_MAX_AGE_MS) {
      await clearPendingGeneration();
      failHistory(pending, new ToolTaskClientError('QUOTE_EXPIRED'));
      return;
    }
    await executeSubmission(pending, true);
  };

  return {
    pendingUserText,
    lastUserText,
    pendingNotice,
    quoteConfirmation,
    prepareSubmission,
    confirmQuote,
    declineQuote,
    onStopProcessing,
    abortImg2Img,
    resumePendingTask
  };
}
