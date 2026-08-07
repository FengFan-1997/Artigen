<script setup lang="ts">
import { ref, onBeforeUnmount, watch, computed, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import gsap from 'gsap';
import IngredientLabelTypeSelect from '../components/IngredientLabelTypeSelect.vue';
import ActionButton from '@/agentImg/components/ActionButton.vue';
import { useLanguageStore } from '@/stores/language';
import {
  buildIngredientLabelSvg,
  buildIngredientLabelSvgUrl,
  type IngredientLabelLayoutType
} from '../logic/formatFactory/ingredientLabel';
import { exportPdf } from '@/utils/export';
import { validateIngredientSourceTrace } from '../logic/ingredientSourceTrace';
import { getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import {
  cancelToolTask,
  quoteToolTask,
  type ToolTaskQuote
} from '../services/toolTasks';
import {
  cancelPersistedWorkshopTask,
  loadPendingWorkshopTask,
  resumePersistedWorkshopTask,
  startPersistedWorkshopTask
} from '../services/workshopTasks';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const editorBoxRef = ref<HTMLElement | null>(null);
const watermarkRef = ref<HTMLElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const downloadModalRef = ref<HTMLElement | null>(null);
const labelTypeModalRef = ref<HTMLElement | null>(null);
const downloadControlRef = ref<HTMLElement | null>(null);
const isLoading = ref(false);
const progressValue = ref(0);
const isDownloadModalOpen = ref(false);
const isDownloadPopoverOpen = ref(false);
const isLabelTypeModalOpen = ref(false);
const isMobile = ref(false);
let progressInterval: number | null = null;
let returnFocus: HTMLElement | null = null;
let nestedReturnFocus: HTMLElement | null = null;

const ingredientsInput = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const adjustTextareaHeight = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  el.style.overflowY = 'hidden';
};

watch(ingredientsInput, () => {
  nextTick(() => {
    adjustTextareaHeight();
  });
});

const productType = ref<'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement'>('Food');
const typeOptions = computed(() => {
  const zh = currentLang.value === 'zh';
  return [
    { label: zh ? '食品' : 'Food', value: 0, gtm: 'ga-click-demo-food' },
    { label: zh ? '药品' : 'Drug', value: 1, gtm: 'ga-click-demo-drug' },
    { label: zh ? '化妆品' : 'Cosmetic', value: 2, gtm: 'ga-click-demo-cosmetic' },
    {
      label: zh ? '膳食补充剂' : 'Dietary Supplement',
      value: 3,
      gtm: 'ga-click-demo-dietary-supplement'
    }
  ];
});
const productTypeMap: Record<number, 'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement'> = {
  0: 'Food',
  1: 'Drug',
  2: 'Cosmetic',
  3: 'Dietary Supplement'
};
const typeIndex = ref(0);

const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300" viewBox="0 0 500 300" font-family="Arial, sans-serif"><rect width="500" height="300" fill="#fff"/><rect x="0.75" y="0.75" width="498.5" height="298.5" fill="none" stroke="#000" stroke-width="1.5"/></svg>`;
const placeholderUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(placeholderSvg);
const imgSrc = ref<string>(placeholderUrl);
const lastLayoutType = ref<IngredientLabelLayoutType | null>(null);
const pendingLayoutType = ref<IngredientLabelLayoutType | null>(null);
const errorMsg = ref('');
const canDownload = ref(false);
const ingredientQuote = ref<ToolTaskQuote | null>(null);
const quoteLoading = ref(false);
const quoteError = ref('');
const uploadConsent = ref(false);
const activeTaskId = ref('');
let quoteController: AbortController | null = null;
let taskController: AbortController | null = null;

const humanizeAiError = (code: string) => {
  const c = String(code || '').trim();
  const en = currentLang.value === 'en';
  if (!c) return en ? 'Generation failed. Please try again later.' : '生成失败，请稍后再试';
  if (c === 'INSUFFICIENT_CREDITS')
    return en
      ? 'Insufficient credits. Please top up in the Market.'
      : '点数不足，请前往「点数商城」充值';
  if (c === 'LOGIN_REQUIRED')
    return en ? 'Sign in to use AI organization. Local layout remains available.' : '请先登录使用 AI 整理；本地排版仍可使用。';
  if (c === 'BROWSER_STORAGE_UNAVAILABLE')
    return en
      ? 'The browser could not safely save recovery data, so no paid task was submitted.'
      : '浏览器无法安全保存任务恢复信息，本次未提交付费任务。';
  if (c === 'PRICE_CHANGED' || c === 'QUOTE_ALREADY_USED' || c === 'QUOTE_NOT_FOUND')
    return en ? 'The quote changed. Please confirm the latest price again.' : '报价已变化，请重新确认最新价格。';
  if (c === 'INGREDIENT_SOURCE_MISMATCH' || c === 'INVALID_INGREDIENT_OUTPUT')
    return en
      ? 'The organized result did not pass source-trace validation. Credits were refunded.'
      : '整理结果未通过原文追溯校验，已退款。';
  if (c === 'OUTPUT_INVALID' || c === 'OUTPUT_PERSIST_FAILED')
    return en
      ? 'The AI result did not pass output validation. Credits were refunded.'
      : 'AI 结果未通过输出校验，已退款。';
  if (
    c === 'LEGACY_BILLING_DISABLED' ||
    c === 'PAID_FEATURES_DISABLED' ||
    c === 'DATABASE_NOT_CONFIGURED' ||
    c === 'TOOL_OPERATION_UNAVAILABLE'
  )
    return en
      ? 'AI organization is temporarily unavailable. Local layout remains available.'
      : 'AI 整理服务暂不可用；本地排版仍可使用。';
  if (
    c === 'RATE_LIMITED' ||
    c === 'TOO_MANY_REQUESTS' ||
    c === 'SERVER_RATE_LIMITED' ||
    c === 'API_ERROR_429'
  )
    return en ? 'Too many requests. Please try again later.' : '请求过于频繁，请稍后再试';
  if (
    c === 'SERVER_BUSY' ||
    c === 'SERVICE_BUSY' ||
    c === 'BUSY' ||
    c === 'API_ERROR_503' ||
    c === 'API_ERROR_502' ||
    c === 'API_ERROR_500'
  )
    return en ? 'Service busy. Please try again later.' : '服务繁忙，请稍后再试';
  if (c === 'UPSTREAM_TIMEOUT' || c === 'API_ERROR_504')
    return en ? 'Request timed out. Please retry.' : '服务超时，请稍后再试';
  if (c === 'OFFLINE') return en ? 'You are offline.' : '网络未连接（本地离线）';
  if (c === 'FETCH_ERROR' || c === 'NETWORK_ERROR')
    return en ? 'Network error. Please try again.' : '网络错误，请稍后再试';
  if (c === 'AbortError' || c === 'ABORTED' || /aborted/i.test(c))
    return en ? 'Cancelled.' : '已取消';
  if (c === 'TASK_CANCEL_PENDING')
    return en
      ? 'Cancellation is pending confirmation. Refreshing will safely retry it.'
      : '取消仍待服务端确认；刷新后会安全重试。';
  return en ? 'Generation failed. Please try again later.' : '生成失败，请稍后再试';
};

const downloadErrorText = () =>
  currentLang.value === 'en'
    ? 'Export failed. Please try again.'
    : '导出失败，请稍后再试';

const PLACEHOLDERS: Record<string, { zh: string; en: string }> = {
  Drug: {
    zh: '请粘贴需要排版的有效成分、用途、警告和辅料原文；缺失内容不会被补全。',
    en: 'Paste the exact active ingredient, use, warning, and inactive ingredient text to lay out. Missing content is never invented.'
  },
  Food: {
    zh: '请输入食品配料（逗号或换行分隔），例如：beef, milk chocolate。',
    en: 'Provide food ingredients (comma or newline separated), e.g., "beef, milk chocolate".'
  },
  Cosmetic: {
    zh: '请输入化妆品成分（逗号或换行分隔），例如：water, vitamin E。',
    en: 'Provide cosmetic ingredients (comma or newline separated), e.g., "water, vitamin E".'
  },
  'Dietary Supplement': {
    zh: '请输入补充剂主要成分与规格，例如：Vitamin C, Zinc; 60 capsules/bottle。',
    en: 'Enter main ingredients and specs, e.g., "Vitamin C, Zinc; 60 capsules/bottle".'
  },
  default: {
    zh: '配料/成分文本（逗号或换行分隔）',
    en: 'Ingredients (comma or newline separated)'
  }
};
const placeholderText = computed(() => {
  const en = currentLang.value === 'en';
  const k = PLACEHOLDERS[productType.value] ?? PLACEHOLDERS.default;
  return en ? k.en : k.zh;
});

const costText = computed(() => {
  const n = Math.max(0, Math.trunc(Number(ingredientQuote.value?.credits ?? 0) || 0));
  if (!n) return '';
  return `⚡${n}`;
});

const DEFAULT_LAYOUT_BY_TYPE: Record<
  'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement',
  IngredientLabelLayoutType
> = {
  Food: 'standard',
  Drug: 'drug_facts',
  Cosmetic: 'standard',
  'Dietary Supplement': 'supplement_facts'
};

const updateProgressBarPosition = () => {
  const editor = editorBoxRef.value as HTMLElement;
  if (!editor) return;
  const img = editor.querySelector('img') as HTMLImageElement;
  const progressBar = editor.querySelector('.progress-bar') as HTMLElement;
  if (!img || !progressBar || !img.complete) return;
  const containerRect = editor.getBoundingClientRect();
  const imageRatio = img.naturalWidth / img.naturalHeight;
  const containerRatio = containerRect.width / containerRect.height;
  let actualDisplayWidth, actualDisplayHeight;
  if (imageRatio > containerRatio) {
    actualDisplayWidth = containerRect.width;
    actualDisplayHeight = containerRect.width / imageRatio;
  } else {
    actualDisplayWidth = containerRect.height * imageRatio;
    actualDisplayHeight = containerRect.height;
  }
  const offsetX = (containerRect.width - actualDisplayWidth) / 2;
  const offsetY = (containerRect.height - actualDisplayHeight) / 2;
  progressBar.style.width = `${actualDisplayWidth}px`;
  progressBar.style.left = `${offsetX}px`;
  progressBar.style.bottom = `${offsetY + 0}px`;
  progressBar.style.right = 'auto';
};

const startProgress = () => {
  if (progressInterval) clearInterval(progressInterval);
  progressValue.value = 0;
  setTimeout(() => updateProgressBarPosition(), 0);
  const allTime = 10000;
  const updateInterval = 200;
  const step = 85 / (allTime / updateInterval);
  progressInterval = window.setInterval(() => {
    if (progressValue.value < 85) progressValue.value += step;
  }, updateInterval);
};

const completeProgress = () => {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  progressValue.value = 100;
  setTimeout(() => {
    isLoading.value = false;
    progressValue.value = 0;
  }, 300);
};

const onImageLoaded = () => {
  if (isLoading.value) completeProgress();
  if (pendingLayoutType.value) {
    lastLayoutType.value = pendingLayoutType.value;
    pendingLayoutType.value = null;
  }
  updateWatermark();
  updateProgressBarPosition();
  canDownload.value = !!(!isLoading.value && imgSrc.value && imgSrc.value !== placeholderUrl);
};

const updateWatermark = () => {
  const watermark = watermarkRef.value as HTMLElement;
  const editor = editorBoxRef.value as HTMLElement;
  if (!watermark || !editor) return;
  const demoMode = imgSrc.value === placeholderUrl;
  if (!isLoading.value && demoMode) {
    const img = editor.querySelector('img') as HTMLImageElement;
    if (!img?.complete) return;
    const containerRect = editor.getBoundingClientRect();
    const imageRatio = img.naturalWidth / img.naturalHeight;
    const containerRatio = containerRect.width / containerRect.height;
    let actualDisplayWidth;
    if (imageRatio > containerRatio) {
      actualDisplayWidth = containerRect.width;
    } else {
      actualDisplayWidth = containerRect.height * imageRatio;
    }
    const watermarkWidth = actualDisplayWidth * 0.78;
    const fontSize = 72 * (watermarkWidth / 500);
    watermark.style.cssText = `display: flex; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: ${watermarkWidth}px; height: ${watermarkWidth / 4}px; font-size: ${fontSize}px; font-weight: 600; color: rgba(0,0,0,0.08); z-index: 10; pointer-events: none; align-items: center; justify-content: center; text-align: center; line-height: 1;`;
  } else {
    watermark.style.display = 'none';
  }
};

const isAuthenticated = () => {
  const uid = String(getCurrentUserId() || '').trim();
  return Boolean(uid && !uid.startsWith('guest_') && isLocalLoggedIn());
};

const loadIngredientQuote = async () => {
  quoteController?.abort();
  const controller = new AbortController();
  quoteController = controller;
  ingredientQuote.value = null;
  quoteError.value = '';
  uploadConsent.value = false;
  if (!isAuthenticated()) {
    quoteLoading.value = false;
    quoteError.value = 'LOGIN_REQUIRED';
    return;
  }
  quoteLoading.value = true;
  try {
    ingredientQuote.value = await quoteToolTask({
      toolId: 'ingredient-label',
      operation: 'ai-organize-source-text'
    }, controller.signal);
  } catch (error: any) {
    if (!controller.signal.aborted) {
      quoteError.value = String(error?.code || error?.name || 'QUOTE_FAILED');
    }
  } finally {
    if (quoteController === controller) {
      quoteController = null;
      quoteLoading.value = false;
    }
  }
};

const applyLabelOutput = (parsed: any, inputText: string) => {
  if (!parsed || typeof parsed !== 'object') throw new Error('INVALID_INGREDIENT_OUTPUT');
  const layoutTypeRaw = String(parsed.layoutType || '').trim();
    const layoutType = ((): IngredientLabelLayoutType => {
      if (layoutTypeRaw === 'drug_facts') return 'drug_facts';
      if (layoutTypeRaw === 'supplement_facts') return 'supplement_facts';
      if (layoutTypeRaw === 'nutrition_facts') return 'nutrition_facts';
      return 'standard';
    })();

    const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
    if (!sections.length) {
      throw new Error('INVALID_INGREDIENT_OUTPUT');
    }
    if (!validateIngredientSourceTrace(parsed, inputText)) {
      throw new Error('INGREDIENT_SOURCE_MISMATCH');
    }
    const svg = buildIngredientLabelSvg({
      productName: '',
      sections,
      layoutType: layoutType || DEFAULT_LAYOUT_BY_TYPE[productType.value]
    });
    imgSrc.value = buildIngredientLabelSvgUrl(svg) || placeholderUrl;
    pendingLayoutType.value = layoutType;
    errorMsg.value = '';
};

const onLocalLayout = () => {
  if (isLoading.value) return;
  const inputText = ingredientsInput.value.trim();
  if (!inputText) return;
  errorMsg.value = '';
  try {
    applyLabelOutput({
      layoutType: DEFAULT_LAYOUT_BY_TYPE[productType.value],
      sections: [{ title: 'SOURCE TEXT', content: [inputText] }]
    }, inputText);
  } catch (error: any) {
    errorMsg.value = humanizeAiError(String(error?.code || error?.message || 'INVALID_INGREDIENT_OUTPUT'));
  }
};

const cancelIngredientTask = async () => {
  const taskId = activeTaskId.value;
  taskController?.abort();
  taskController = null;
  isLoading.value = false;
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  progressValue.value = 0;
  if (props.visible) {
    errorMsg.value = currentLang.value === 'en'
      ? 'Cancellation is pending confirmation. Refreshing will safely resume it.'
      : '取消仍待服务端确认；刷新后会安全恢复并继续确认。';
  }
  try {
    let task = await cancelPersistedWorkshopTask('ingredient-label-ai');
    if (!task && taskId) task = await cancelToolTask(taskId);
    if (!task) return;
    activeTaskId.value = '';
    if (!props.visible) return;
    if (task.status === 'cancelled' || task.status === 'failed') {
      errorMsg.value = currentLang.value === 'en'
        ? 'Cancelled. Reserved credits were released.'
        : '已取消，预占点数已释放。';
      return;
    }
    if (task.status === 'success') {
      errorMsg.value = currentLang.value === 'en'
        ? 'The task completed before cancellation. No refund was claimed.'
        : '任务已在取消前完成，本次不宣称退款。';
    }
  } catch {
    // Keep the durable pending record; refresh/open will retry with the same key.
  }
};

const runIngredientTask = async (resume = false) => {
  if (isLoading.value) return;
  const stored = resume ? await loadPendingWorkshopTask('ingredient-label-ai') : null;
  const inputText = resume
    ? String(stored?.options?.sourceText || '').trim()
    : ingredientsInput.value.trim();
  if (!inputText) return;
  const quote = ingredientQuote.value;
  if (!resume && !quote) {
    errorMsg.value = humanizeAiError(quoteError.value || 'QUOTE_NOT_FOUND');
    return;
  }
  if (resume && !stored) return;
  if (resume && !ingredientsInput.value.trim()) ingredientsInput.value = inputText;
  isLoading.value = true;
  errorMsg.value = '';
  startProgress();
  taskController?.abort();
  const controller = new AbortController();
  taskController = controller;
  let terminalReached = false;
  try {
    const task = resume
      ? await resumePersistedWorkshopTask(
          'ingredient-label-ai',
          controller.signal,
          (next) => { activeTaskId.value = next.taskId; }
        )
      : await startPersistedWorkshopTask({
          slot: 'ingredient-label-ai',
          toolId: 'ingredient-label',
          operation: 'ai-organize-source-text',
          options: {
            sourceText: inputText,
            productType: productType.value,
            locale: currentLang.value === 'en' ? 'en' : 'zh'
          },
          quote: quote as ToolTaskQuote,
          signal: controller.signal,
          onTask: (next) => { activeTaskId.value = next.taskId; }
        });
    if (!task) return;
    terminalReached = true;
    if (activeTaskId.value === task.taskId) activeTaskId.value = '';
    if (task.status !== 'success') {
      throw new Error(task.error?.code || (task.status === 'cancelled' ? 'TASK_CANCELLED' : 'WORKSHOP_AI_FAILED'));
    }
    const data = task.result?.data;
    applyLabelOutput(data, inputText);
    completeProgress();
  } catch (error: any) {
    if (controller.signal.aborted) return;
    const code = String(error?.code || error?.message || error?.name || 'WORKSHOP_AI_FAILED');
    errorMsg.value = code === 'INGREDIENT_SOURCE_MISMATCH'
      ? currentLang.value === 'en'
        ? 'The result introduced content that was not in your source text. Credits were refunded.'
        : '结果包含原文中不存在的内容，已拒绝并退款。'
      : humanizeAiError(code);
    if (['PRICE_CHANGED', 'QUOTE_ALREADY_USED', 'QUOTE_EXPIRED', 'QUOTE_NOT_FOUND'].includes(code)) {
      ingredientQuote.value = null;
      void loadIngredientQuote();
    }
    pendingLayoutType.value = null;
    completeProgress();
  } finally {
    if (taskController === controller) taskController = null;
    if (terminalReached) {
      ingredientQuote.value = null;
      void loadIngredientQuote();
    }
  }
};

const onGenerate = () => void runIngredientTask(false);

const getImg = (isBlob?: boolean) => {
  return new Promise((resolve) => {
    const svgDataUrl = imgSrc.value;
    if (!svgDataUrl || svgDataUrl === placeholderUrl) {
      resolve('');
      return;
    }
    const img = new Image();
    img.src = svgDataUrl;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const targetWidth = 2000;
        canvas.width = targetWidth;
        canvas.height = (targetWidth / img.width) * img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (isBlob) {
          canvas.toBlob((blob) => resolve(blob?.size ? blob : ''), 'image/png');
        } else {
          const imgDataUrl = canvas.toDataURL();
          resolve(imgDataUrl);
        }
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
  });
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 5000);
};

const downLoadImg = async () => {
  const blob = (await getImg(true)) as Blob | '';
  if (!blob || !(blob instanceof Blob) || !blob.size) {
    errorMsg.value = downloadErrorText();
    return false;
  }
  downloadBlob(blob, 'ingredients.png');
  return true;
};

const downLoadSvg = () => {
  try {
    if (!imgSrc.value || imgSrc.value === placeholderUrl) return false;
    const svgContent = decodeURIComponent(
      imgSrc.value.replace('data:image/svg+xml;charset=utf-8,', '')
    );
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
    const a = document.createElement('a');
    a.href = svgDataUrl;
    a.download = 'ingredients.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    errorMsg.value = downloadErrorText();
    return false;
  }
};

const onExportPdf = async () => {
  try {
    if (!imgSrc.value || imgSrc.value === placeholderUrl) return false;
    const svgContent = decodeURIComponent(
      imgSrc.value.replace('data:image/svg+xml;charset=utf-8,', '')
    );
    await exportPdf(svgContent, 0);
    return true;
  } catch {
    errorMsg.value = downloadErrorText();
    return false;
  }
};

const openDownload = async () => {
  if (isMobile.value) {
    isDownloadModalOpen.value = true;
  } else {
    isDownloadPopoverOpen.value = !isDownloadPopoverOpen.value;
    if (isDownloadPopoverOpen.value) {
      await nextTick();
      if (!reducedMotion()) {
        gsap.fromTo(
          '.download-popover',
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }
        );
        gsap.fromTo(
          '.download-option',
          { x: -10, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.3, stagger: 0.05, delay: 0.1 }
        );
      }
      downloadControlRef.value?.querySelector<HTMLElement>('.download-option')?.focus();
    }
  }
};
const closeDownloadModal = () => {
  isDownloadModalOpen.value = false;
};
const openLabelTypeModal = () => {
  isLabelTypeModalOpen.value = true;
};
const closeLabelTypeModal = () => {
  isLabelTypeModalOpen.value = false;
};
const handleDownload = async (type: 'png' | 'svg' | 'pdf') => {
  errorMsg.value = '';
  const ok =
    type === 'png' ? await downLoadImg() : type === 'svg' ? downLoadSvg() : await onExportPdf();
  if (!ok) return;
  closeDownloadModal();
  isDownloadPopoverOpen.value = false;
};
const downloadOptions = [
  {
    type: 'png' as const,
    label: 'PNG',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'
  },
  {
    type: 'svg' as const,
    label: 'SVG',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>'
  },
  {
    type: 'pdf' as const,
    label: 'PDF',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
  }
];

const handleClickOutside = (e: Event) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('.btn-primary') && !target.closest('.download-popover')) {
    isDownloadPopoverOpen.value = false;
  }
};

const close = () => {
  emit('close');
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const resetState = () => {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  isLoading.value = false;
  progressValue.value = 0;
  isDownloadModalOpen.value = false;
  isDownloadPopoverOpen.value = false;
  isLabelTypeModalOpen.value = false;
  errorMsg.value = '';
  uploadConsent.value = false;
};

const syncMobile = () => {
  isMobile.value = window.innerWidth <= 979;
};

let onWindowResize: ((this: Window, ev: UIEvent) => any) | null = null;
let globalEventsBound = false;
const bindGlobalEvents = () => {
  if (globalEventsBound) return;
  onWindowResize = () => {
    syncMobile();
    updateWatermark();
    updateProgressBarPosition();
  };
  window.addEventListener('resize', onWindowResize);
  document.addEventListener('click', handleClickOutside);
  globalEventsBound = true;
};
const unbindGlobalEvents = () => {
  if (!globalEventsBound) return;
  if (onWindowResize) window.removeEventListener('resize', onWindowResize);
  document.removeEventListener('click', handleClickOutside);
  onWindowResize = null;
  globalEventsBound = false;
};

watch(
  () => !!props.visible,
  async (v) => {
    if (!v) {
      quoteController?.abort();
      quoteController = null;
      if (taskController || activeTaskId.value) cancelIngredientTask();
      unbindGlobalEvents();
      resetState();
      await nextTick();
      if (returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
      return;
    }

    returnFocus = globalThis.document.activeElement instanceof HTMLElement
      ? globalThis.document.activeElement
      : null;
    syncMobile();
    pendingLayoutType.value = DEFAULT_LAYOUT_BY_TYPE[productType.value];
    bindGlobalEvents();
    await nextTick();
    updateWatermark();
    updateProgressBarPosition();
    adjustTextareaHeight();
    dialogRef.value?.focus();
    const pending = await loadPendingWorkshopTask('ingredient-label-ai');
    if (pending) void runIngredientTask(true);
    else void loadIngredientQuote();

    if (!reducedMotion()) {
      // The modal transition already provides entrance feedback. Do not animate the
      // interactive frame after the asynchronous recovery read: a fast user can
      // otherwise click a control just as GSAP hides and moves the whole workspace.
      gsap.from('.bg-orb', {
        scale: 0,
        opacity: 0,
        duration: 2,
        stagger: 0.3,
        ease: 'elastic.out(1, 0.5)'
      });
    }
  },
  { immediate: true }
);

const handleMouseMove = (e: MouseEvent) => {
  if (reducedMotion()) return;
  const orbs = document.querySelectorAll('.bg-orb');
  const x = (e.clientX / window.innerWidth - 0.5) * 2;
  const y = (e.clientY / window.innerHeight - 0.5) * 2;

  orbs.forEach((orb) => {
    const speed = parseFloat(orb.getAttribute('data-speed') || '0');
    gsap.to(orb, {
      x: x * 100 * speed,
      y: y * 100 * speed,
      duration: 1,
      ease: 'power2.out'
    });
  });
};

onBeforeUnmount(() => {
  quoteController?.abort();
  quoteController = null;
  taskController?.abort();
  taskController = null;
  unbindGlobalEvents();
  resetState();
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
});

watch(isDownloadModalOpen, async (open) => {
  if (open) {
    nestedReturnFocus = globalThis.document.activeElement instanceof HTMLElement
      ? globalThis.document.activeElement
      : null;
    await nextTick();
    downloadModalRef.value?.focus();
  } else {
    await nextTick();
    if (nestedReturnFocus?.isConnected) nestedReturnFocus.focus();
    nestedReturnFocus = null;
  }
});

watch(isLabelTypeModalOpen, async (open) => {
  if (open) {
    nestedReturnFocus = globalThis.document.activeElement instanceof HTMLElement
      ? globalThis.document.activeElement
      : null;
    await nextTick();
    labelTypeModalRef.value?.focus();
  } else {
    await nextTick();
    if (nestedReturnFocus?.isConnected) nestedReturnFocus.focus();
    nestedReturnFocus = null;
  }
});

const trapDialogFocus = (event: KeyboardEvent, container: HTMLElement | null) => {
  if (event.key !== 'Tab' || !container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && globalThis.document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && globalThis.document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const onMainDialogKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (isDownloadPopoverOpen.value) {
      isDownloadPopoverOpen.value = false;
      downloadControlRef.value?.querySelector<HTMLElement>('button')?.focus();
    } else close();
    return;
  }
  trapDialogFocus(event, dialogRef.value);
};

const onDownloadDialogKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDownloadModal();
    return;
  }
  trapDialogFocus(event, downloadModalRef.value);
};

const onLabelTypeDialogKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeLabelTypeModal();
    return;
  }
  trapDialogFocus(event, labelTypeModalRef.value);
};

watch([isLoading, imgSrc], () => {
  updateWatermark();
  updateProgressBarPosition();
  canDownload.value = !!(!isLoading.value && imgSrc.value && imgSrc.value !== placeholderUrl);
});

watch(typeIndex, (nv) => {
  productType.value = productTypeMap[nv];
  imgSrc.value = placeholderUrl;
  pendingLayoutType.value = DEFAULT_LAYOUT_BY_TYPE[productType.value];
  errorMsg.value = '';
  isLoading.value = false;
  progressValue.value = 0;
  updateWatermark();
  updateProgressBarPosition();
});

const backText = computed(() => (currentLang.value === 'en' ? 'Back' : '返回'));
const downloadText = computed(() => (currentLang.value === 'en' ? 'Download' : '下载'));
const previewWatermarkText = computed(() => (currentLang.value === 'en' ? 'PREVIEW' : '预览'));
const titleText = computed(() =>
  currentLang.value === 'en' ? 'Ingredient Label Layout' : '配料标签排版助手'
);
const typeText = computed(() => (currentLang.value === 'en' ? 'Product type' : '产品类型'));
const ingredientsText = computed(() => (currentLang.value === 'en' ? 'Ingredients' : '配料/成分'));
const svgIconUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const backIconUrl = svgIconUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5F7F2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>'
);
const downloadIconUrl = svgIconUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0D0E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
);
const actionButtonStyles = {
  primary: {
    '--btn-height': '48px',
    '--btn-radius': '12px',
    '--btn-font-size': '15px',
    '--btn-gap': '8px',
    '--btn-transition': 'all 0.2s',
    '--btn-bg': '#c8ff3d',
    '--btn-border': '1px solid #c8ff3d',
    '--btn-color': '#0b0d0e',
    '--btn-shadow': '0 4px 16px rgba(200, 255, 61, 0.14)',
    '--btn-hover-bg': '#b7f12c',
    '--btn-hover-border': '1px solid #b7f12c',
    '--btn-hover-shadow': '0 6px 20px rgba(200, 255, 61, 0.2)'
  },
  secondary: {
    '--btn-height': '48px',
    '--btn-radius': '12px',
    '--btn-font-size': '15px',
    '--btn-gap': '8px',
    '--btn-transition': 'all 0.2s',
    '--btn-bg': '#ffffff',
    '--btn-border': '1px solid #e2e8f0',
    '--btn-color': '#0f172a',
    '--btn-hover-bg': '#f8fafc',
    '--btn-hover-border': '1px solid #475569'
  }
} as const;
const backButtonStyles = {
  ...actionButtonStyles.primary,
  '--btn-bg': '#151a1b',
  '--btn-border': '1px solid rgba(245, 247, 242, 0.16)',
  '--btn-color': '#f5f7f2',
  '--btn-shadow': 'none',
  '--btn-hover-bg': '#1d2425',
  '--btn-hover-border': '1px solid rgba(200, 255, 61, 0.5)',
  '--btn-hover-shadow': 'none'
} as const;
</script>

<template>
  <transition name="fade">
    <div v-if="visible" class="ingredient-modal-overlay" @click.self="close">
      <section
        ref="dialogRef"
        class="ingredient-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingredient-label-title"
        tabindex="-1"
        @keydown="onMainDialogKeydown"
      >
        <div class="ingredient-modal-header">
          <h2 id="ingredient-label-title" class="ingredient-modal-title">{{ titleText }}</h2>
          <button
            class="ingredient-close-btn"
            type="button"
            :aria-label="currentLang === 'en' ? 'Close' : '关闭'"
            @click="close"
          >×</button>
        </div>

        <div class="ingredient-modal-body">
          <div class="tools-root" @mousemove="handleMouseMove">
            <div class="parallax-bg">
              <div class="bg-orb orb-1" data-speed="0.05"></div>
              <div class="bg-orb orb-2" data-speed="-0.08"></div>
              <div class="bg-orb orb-3" data-speed="0.02"></div>
            </div>

            <div
              class="glass-container tools-main-frame"
              :class="{ 'is-drug': lastLayoutType === 'drug_facts' }"
            >
              <div class="left-panel">
                <div class="section-title">{{ typeText }}</div>
                <div class="select-wrapper">
                  <IngredientLabelTypeSelect
                    v-model="typeIndex"
                    :options="typeOptions"
                    :label="typeText"
                    :mobile="isMobile"
                    :disabled="false"
                    @open-mobile="openLabelTypeModal"
                  />
                </div>
                <div class="section-title title-product">{{ ingredientsText }}</div>
                <div class="textarea-container product-describe">
                  <div class="textarea-content">
                    <textarea
                      ref="textareaRef"
                      v-model="ingredientsInput"
                      class="product-textarea"
                      :placeholder="placeholderText"
                      :aria-label="ingredientsText"
                    ></textarea>
                  </div>
                  <div class="layout-actions">
                    <button
                      class="generate-button local-layout-button hover-effect"
                      type="button"
                      :disabled="!ingredientsInput || isLoading"
                      @click="onLocalLayout"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path
                          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        ></path>
                      </svg>
                      <span class="generate-text">
                        {{ currentLang === 'en' ? 'Local layout · Free' : '本地原文排版 · 免费' }}
                      </span>
                    </button>
                    <label class="ai-consent" :class="{ disabled: quoteLoading || !!quoteError }">
                      <input v-model="uploadConsent" type="checkbox" :disabled="quoteLoading || !!quoteError || isLoading" />
                      <span>
                        {{
                          currentLang === 'en'
                            ? `I agree to send only this source text for AI organization and reserve ${ingredientQuote?.credits ?? '?'} credits. No missing facts will be invented; failed or cancelled tasks are refunded.`
                            : `我同意仅上传这段原文进行 AI 整理，并预占 ${ingredientQuote?.credits ?? '?'} 点数；不会补全缺失事实，失败或取消会退款。`
                        }}
                      </span>
                    </label>
                    <div v-if="quoteLoading" class="quote-status" role="status">
                      {{ currentLang === 'en' ? 'Loading the server quote…' : '正在读取服务端报价…' }}
                    </div>
                    <div v-else-if="quoteError" class="quote-status error" role="alert">
                      {{ humanizeAiError(quoteError) }}
                    </div>
                    <button
                      class="generate-button hover-effect"
                      type="button"
                      :disabled="!ingredientsInput || isLoading || quoteLoading || !!quoteError || !uploadConsent || !ingredientQuote"
                      @click="onGenerate"
                    >
                      <svg
                        v-if="isLoading"
                        class="generate-icon--loading"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                      </svg>
                      <span class="generate-text">
                        {{ isLoading ? (currentLang === 'en' ? 'Organizing…' : '整理中…') : (currentLang === 'en' ? 'AI organize source' : 'AI 整理原文') }}
                      </span>
                      <span v-if="costText && !isLoading" class="generate-cost">{{ costText }}</span>
                    </button>
                    <button
                      v-if="isLoading"
                      class="cancel-task-button"
                      type="button"
                      @click="cancelIngredientTask"
                    >
                      {{ currentLang === 'en' ? 'Cancel and refund hold' : '取消并释放预占' }}
                    </button>
                  </div>
                </div>
                <div v-if="errorMsg" class="error-text" role="alert">{{ errorMsg }}</div>
              </div>

              <div class="right-panel-container">
                <div class="right-panel" :class="{ 'is-drug': lastLayoutType === 'drug_facts' }">
                  <div
                    class="preview-inner floating-anim"
                    :class="{ 'is-drug': lastLayoutType === 'drug_facts' }"
                  >
                    <div class="editor-wrap">
                      <div
                        id="editorBoxRef"
                        ref="editorBoxRef"
                        class="editorBox"
                        :class="{
                          'is-loading': isLoading,
                          generated: imgSrc && imgSrc !== placeholderUrl
                        }"
                      >
                        <div class="image-container">
                          <img
                            :src="imgSrc"
                            :alt="currentLang === 'en' ? 'Ingredient label preview' : '配料标签预览'"
                            style="width: 100%; height: 100%; object-fit: contain; display: block"
                            @load="onImageLoaded"
                          />
                          <div
                            v-if="isLoading"
                            class="progress-bar"
                            role="progressbar"
                            :aria-label="currentLang === 'en' ? 'Generating label' : '正在生成标签'"
                            aria-valuemin="0"
                            aria-valuemax="100"
                            :aria-valuenow="Math.round(progressValue)"
                          >
                            <div
                              class="progress-fill"
                              :style="{ width: progressValue + '%' }"
                            ></div>
                          </div>
                        </div>
                      </div>
                      <div ref="watermarkRef" class="demo-watermark" aria-hidden="true">
                        {{ previewWatermarkText }}
                      </div>
                    </div>
                  </div>

                  <div class="operation-buttons" :class="{ 'stack-mobile': isMobile }">
                    <ActionButton
                      class="hover-effect back-btn"
                      variant="primary"
                      type="button"
                      :style="backButtonStyles"
                      :icon="backIconUrl"
                      icon-alt=""
                      :icon-width="19"
                      :icon-height="18"
                      @click="close"
                    >
                      {{ backText }}
                    </ActionButton>
                    <div ref="downloadControlRef" style="position: relative">
                      <ActionButton
                        class="hover-effect"
                        variant="primary"
                        type="button"
                        :style="actionButtonStyles.primary"
                        :icon="downloadIconUrl"
                        icon-alt=""
                        :icon-width="19"
                        :icon-height="18"
                        :disabled="!canDownload"
                        aria-haspopup="true"
                        :aria-expanded="isDownloadPopoverOpen || isDownloadModalOpen"
                        @click="openDownload"
                      >
                        {{ downloadText }}
                      </ActionButton>
                      <div
                        v-if="isDownloadPopoverOpen && !isMobile"
                        class="download-popover glass-popover"
                        role="group"
                        :aria-label="currentLang === 'en' ? 'Download format' : '下载格式'"
                      >
                        <button
                          v-for="option in downloadOptions"
                          :key="option.type"
                          class="download-option"
                          type="button"
                          @click="handleDownload(option.type)"
                        >
                          <div class="file-icon-wrapper">
                            <div
                              class="modal-icon"
                              v-html="option.icon"
                              style="
                                width: 24px;
                                height: 24px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                              "
                            ></div>
                          </div>
                          <span class="opt-text">{{ option.label }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <teleport to="body">
              <div
                v-if="isDownloadModalOpen"
                class="modal-mask glass-mask"
                @click.self="closeDownloadModal"
              >
                <section
                  ref="downloadModalRef"
                  class="bottom-modal download-modal glass-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="ingredient-download-title"
                  tabindex="-1"
                  @keydown="onDownloadDialogKeydown"
                >
                  <div class="modal-header">
                    <h3 id="ingredient-download-title" class="modal-title">{{ downloadText }}</h3>
                    <button
                      class="modal-close"
                      type="button"
                      :aria-label="currentLang === 'en' ? 'Close download options' : '关闭下载选项'"
                      @click="closeDownloadModal"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  <div class="modal-options">
                    <button
                      v-for="option in downloadOptions"
                      :key="option.type"
                      class="modal-option"
                      type="button"
                      @click="handleDownload(option.type)"
                    >
                      <div
                        class="modal-icon"
                        v-html="option.icon"
                        aria-hidden="true"
                        style="
                          width: 24px;
                          height: 24px;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                        "
                      ></div>
                      <span class="opt-text">{{ option.label }}</span>
                    </button>
                  </div>
                </section>
              </div>
            </teleport>

            <teleport to="body">
              <div
                v-if="isLabelTypeModalOpen && isMobile"
                class="modal-mask glass-mask"
                @click.self="closeLabelTypeModal"
              >
                <section
                  ref="labelTypeModalRef"
                  class="bottom-modal labeltype-modal glass-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="ingredient-type-modal-title"
                  tabindex="-1"
                  @keydown="onLabelTypeDialogKeydown"
                >
                  <div class="modal-header">
                    <h3 id="ingredient-type-modal-title" class="modal-title">{{ typeText }}</h3>
                    <button
                      class="modal-close"
                      type="button"
                      :aria-label="currentLang === 'en' ? 'Close product types' : '关闭产品类型'"
                      @click="closeLabelTypeModal"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  <div class="modal-options">
                    <button
                      v-for="option in typeOptions"
                      :key="option.value"
                      class="modal-option"
                      :class="{ 'is-selected': typeIndex === option.value }"
                      :aria-pressed="typeIndex === option.value"
                      type="button"
                      @click="
                        () => {
                          typeIndex = option.value;
                          closeLabelTypeModal();
                        }
                      "
                    >
                      <span class="opt-text">{{ option.label }}</span>
                    </button>
                  </div>
                </section>
              </div>
            </teleport>
          </div>
        </div>
      </section>
    </div>
  </transition>
</template>

<style lang="less" scoped>
/* Artigen dark workspace palette. The generated label itself remains white. */
@bg-root: #0b0d0e;
@bg-surface: #111617;
@bg-element: #151a1b;
@border-color: rgba(245, 247, 242, 0.14);
@primary-color: #c8ff3d;
@primary-hover: #b7f12c;
@text-main: #f5f7f2;
@text-secondary: #c7cec3;
@text-muted: #9ca69a;
@glass-shadow:
  0 10px 15px -3px rgba(0, 0, 0, 0.1),
  0 4px 6px -2px rgba(0, 0, 0, 0.05);

@keyframes float {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
  100% {
    transform: translateY(0px);
  }
}

.floating-anim { animation: none; }

.tools-root {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  position: relative;
  overflow: hidden;
  background: transparent;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  color: @text-main;
}

.ingredient-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.76);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  box-sizing: border-box;
}

.ingredient-modal-container {
  width: min(1280px, 96vw);
  height: min(860px, 92vh);
  border-radius: 16px;
  overflow: hidden;
  background: @bg-root;
  border: 1px solid @border-color;
  box-shadow: @glass-shadow;
  display: flex;
  flex-direction: column;
}

.ingredient-modal-container:focus-visible,
.bottom-modal:focus-visible {
  outline: none;
}

.ingredient-modal-container :is(button, textarea, input, select, [tabindex]):focus-visible,
.bottom-modal :is(button, textarea, input, select, [tabindex]):focus-visible {
  outline: 3px solid @primary-color;
  outline-offset: 2px;
}

.ingredient-modal-header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: @bg-surface;
  border-bottom: 1px solid @border-color;
  box-sizing: border-box;
}

.ingredient-modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: @text-main;
  letter-spacing: -0.01em;
}

.ingredient-close-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: @text-secondary;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: @bg-element;
    color: @text-main;
    border-color: @border-color;
  }
}

.ingredient-modal-body {
  flex: 1;
  overflow: hidden;
  background: @bg-root;
  display: flex;
}

/* Background Effects - Hidden */
.parallax-bg {
  display: none;
}

.glass-container {
  background: transparent;
  border: none;
  box-shadow: none;
}

.tools-main-frame {
  display: flex;
  width: 100%;
  height: 100%;
  padding: 32px;
  gap: 40px;
  box-sizing: border-box;
  overflow: auto;
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 220px;
}

@media (max-width: 500px) {
  .tools-main-frame {
    margin-top: 0px !important;
    flex-direction: column !important;
  }
}
@media (max-width: 980px) {
  .tools-root {
    align-items: flex-start;
  }

  .tools-main-frame {
    margin-top: 0;
    flex-direction: column;
    height: auto;
    max-height: none;
    overflow-y: auto;
  }

  .left-panel {
    width: 100%;
    min-width: 0;
    max-width: none;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .right-panel-container {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 400px;
    flex: none;
  }

  .ingredient-modal-body {
    overflow-y: auto;
    height: calc(100dvh - 64px);
  }

  .ingredient-modal-container {
    height: 100dvh;
    max-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .tools-main-frame {
    padding: 16px;
    gap: 24px;
  }
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: @text-secondary;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-wrapper {
  /* Child component updated to match theme */
}

.product-describe {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 200px;
}

.textarea-content {
  flex: 1;
  border-radius: 12px;
  background: @bg-surface;
  border: 1px solid @border-color;
  padding: 16px;
  transition: all 0.2s ease;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);

  &:focus-within {
    background: @bg-root;
    border-color: @primary-color;
    box-shadow: 0 0 0 3px fade(@primary-color, 15%);
  }
}

.product-textarea {
  width: 100%;
  height: 100%;
  min-height: 120px;
  background: transparent;
  border: none;
  resize: none;
  font-size: 15px;
  line-height: 1.6;
  color: @text-main;
  outline: none;
  font-family: inherit;
  overflow: hidden;
}

.product-textarea::placeholder {
  color: @text-muted;
}

.generate-button {
  height: 52px;
  border: none;
  border-radius: 12px;
  background: @primary-color;
  color: #0b0d0e;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 16px rgba(200, 255, 61, 0.14);
}

.layout-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.local-layout-button {
  border: 1px solid rgba(200, 255, 61, 0.45);
  background: #151a1b;
  color: @text-main;
  box-shadow: none;
}

.generate-button.local-layout-button:hover:not(:disabled) {
  border-color: @primary-color;
  background: #1d2425;
  color: @primary-color;
  box-shadow: none;
}

.ai-consent {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: @text-muted;
  font-size: 12px;
  line-height: 1.5;
}

.ai-consent input {
  margin-top: 2px;
}

.ai-consent.disabled {
  opacity: 0.6;
}

.quote-status {
  color: @text-muted;
  font-size: 12px;
  line-height: 1.45;
}

.quote-status.error {
  color: #fca5a5;
}

.cancel-task-button {
  min-height: 44px;
  border: 1px solid rgba(248, 113, 113, 0.45);
  border-radius: 10px;
  background: rgba(248, 113, 113, 0.08);
  color: #fca5a5;
  cursor: pointer;
  font: inherit;
}

.generate-cost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.12);
  color: #0b0d0e;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.generate-button:hover:not(:disabled) {
  background: @primary-hover;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(200, 255, 61, 0.2);
}

.generate-button:active:not(:disabled) {
  transform: translateY(0);
}

.generate-button:disabled {
  background: @border-color;
  color: @text-muted;
  cursor: not-allowed;
  box-shadow: none;
}

.generate-icon--loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}

.right-panel-container {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.preview-inner {
  flex: 1;
  position: relative;
  background: @bg-surface;
  border-radius: 12px;
  border: 1px solid @border-color;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.editorBox {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.operation-buttons {
  display: flex;
  gap: 16px;
  align-items: center;
}

.operation-buttons :deep(.btn),
.operation-buttons > div {
  flex: 1;
}

.operation-buttons > div :deep(.btn) {
  width: 100%;
}

.glass-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  padding: 6px;
  border-radius: 12px;
  border: 1px solid @border-color;
  background: @bg-root;
  box-shadow: @glass-shadow;
  z-index: 1000;
  min-width: 200px;
}

.download-option {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: @text-main;
  font-size: 14px;

  &:hover {
    background: @bg-surface;
    color: @primary-color;
  }
}

.file-icon-wrapper {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: @bg-surface;
  color: @text-secondary;
  transition: all 0.2s;
}

.download-option:hover .file-icon-wrapper {
  background: fade(@primary-color, 10%);
  color: @primary-color;
}

/* Modals */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.bottom-modal {
  width: min(520px, 100%);
  background: @bg-root;
  border-radius: 20px 20px 0 0;
  border-top: 1px solid @border-color;
  padding: 24px;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: @text-main;
}

.modal-close {
  width: 44px;
  min-width: 44px;
  height: 44px;
  box-sizing: border-box;
  border: none;
  background: transparent;
  padding: 8px;
  cursor: pointer;
  color: @text-secondary;

  span {
    display: block;
    font-size: 24px;
    line-height: 1;
  }

  &:hover {
    color: @text-main;
    background: @bg-surface;
    border-radius: 50%;
  }
}

.modal-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-option {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid @border-color;
  background: @bg-surface;
  cursor: pointer;
  color: @text-main;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s;
  gap: 8px;

  &:hover {
    background: darken(@bg-surface, 2%);
    border-color: @text-secondary;
  }

  &.is-selected {
    border-color: @primary-color;
    background: fade(@primary-color, 10%);
    color: @primary-color;
  }
}

.progress-bar {
  position: absolute;
  height: 4px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  left: 0;
  bottom: 0;
  overflow: hidden;
  width: 100%;
}

.progress-fill {
  height: 100%;
  background: @primary-color;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.error-text {
  font-size: 14px;
  color: #ef4444;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(239, 68, 68, 0.1);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.32);
}

/* Legacy classes - hidden or neutral */
.glass-mask {
}
.glass-modal {
}

@media (max-width: 979px) {
  .ingredient-modal-overlay {
    padding: 0;
  }
  .ingredient-modal-container {
    width: 100%;
    height: 100%;
    border-radius: 0;
    border: none;
  }
  .tools-main-frame {
    padding: 20px;
    height: auto;
    overflow: visible;
  }
  .product-describe {
    min-height: auto;
  }
  .right-panel-container {
    min-height: 360px;
  }
  .preview-inner { min-height: 280px; }
  .operation-buttons {
    flex-direction: column;
  }
  .operation-buttons > div {
    width: 100%;
  }
  .operation-buttons :deep(.back-btn) {
    display: none !important;
  }
}

@media (max-width: 350px) {
  .generate-button {
    height: 44px;
    font-size: 14px;
  }
  .operation-buttons :deep(button) {
    height: 44px !important;
    font-size: 13px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }

  .floating-anim,
  .generate-icon--loading {
    animation: none !important;
  }

  .generate-button:hover:not(:disabled) {
    transform: none;
  }
}
</style>
