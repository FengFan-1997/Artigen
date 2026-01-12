import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { agentImgPromptLibrary } from '../data/promptLibrary';
import { extractFirstJsonObject, safeJsonStringify } from '../logic/json';
import type { AgentImgDirectionOption, AgentImgPromptResult } from '../types';
import { generateText, type GenerateImageInput } from '../services/text';

const clampNumber = (n: any, min: number, max: number) => {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(min, Math.min(max, v));
};

const ensureStringArray = (v: any, max = 24) => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = String(x || '').trim();
    if (!s) continue;
    out.push(s.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
};

const detectUserInputLang = (input: string) => {
  const s = String(input || '').trim();
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh' as const;
  return 'en' as const;
};

const normalizeOption = (v: any, idx: number): AgentImgDirectionOption | null => {
  if (!v || typeof v !== 'object') return null;
  const id = String(v.id || '').trim() || `opt_${idx + 1}`;
  const title = String(v.title || '').trim();
  const summary = String(v.summary || '').trim();
  const styleTags = ensureStringArray(v.styleTags, 16);
  if (!title || !summary || styleTags.length === 0) return null;
  const negativeTags = ensureStringArray(v.negativeTags, 24);
  const suggestedRaw = v.suggested && typeof v.suggested === 'object' ? v.suggested : null;
  const suggested = suggestedRaw
    ? {
        imageSize: String(suggestedRaw.imageSize || '').trim() || undefined,
        steps: clampNumber(suggestedRaw.steps, 5, 60),
        guidanceScale: clampNumber(suggestedRaw.guidanceScale, 1, 20),
        seed: clampNumber(suggestedRaw.seed, 0, 2147483647)
      }
    : undefined;

  return { id, title, summary, styleTags, negativeTags, suggested };
};

const normalizePromptResult = (v: any): AgentImgPromptResult | null => {
  if (!v || typeof v !== 'object') return null;
  const prompt = String(v.prompt || '').trim();
  const negativePrompt = String(v.negativePrompt || '').trim();
  if (!prompt || !negativePrompt) return null;
  const paramsRaw = v.params && typeof v.params === 'object' ? v.params : null;
  const params = paramsRaw
    ? {
        imageSize: String(paramsRaw.imageSize || '').trim() || undefined,
        steps: clampNumber(paramsRaw.steps, 5, 60),
        guidanceScale: clampNumber(paramsRaw.guidanceScale, 1, 20),
        seed: clampNumber(paramsRaw.seed, 0, 2147483647)
      }
    : undefined;
  return { prompt, negativePrompt, params };
};

const buildDirectionPrompt = (input: string, contextText: string) => {
  const schema = safeJsonStringify(agentImgPromptLibrary.directionSchema);
  const lang = detectUserInputLang(input);
  const zh = lang === 'zh';
  return [
    agentImgPromptLibrary.directionSystem,
    `Schema: ${schema}`,
    `User input language: ${lang}`,
    zh
      ? '所有输出字段必须使用中文（title/summary/styleTags/negativeTags），禁止出现英文。'
      : 'All output fields must be English (title/summary/styleTags/negativeTags). Do not output Chinese.',
    contextText ? (zh ? `上下文:\n${contextText}` : `Context:\n${contextText}`) : '',
    zh ? `用户输入: ${input}` : `User input: ${input}`,
    zh ? '只返回 JSON，不要包含任何解释或多余文本。' : 'Return ONLY JSON. No extra text.',
    'Output JSON example:',
    '{"options":[{"id":"opt_1","title":"...","summary":"...","styleTags":["..."],"negativeTags":["..."],"suggested":{"imageSize":"1024x1024","steps":20,"guidanceScale":7.5,"seed":123}}]}'
  ]
    .filter(Boolean)
    .join('\n\n');
};

const buildFinalPrompt = (input: {
  userInput: string;
  option: AgentImgDirectionOption | null;
  contextText: string;
}) => {
  const schema = safeJsonStringify(agentImgPromptLibrary.finalPromptSchema);
  const baseStyle = agentImgPromptLibrary.baseStyle.join(', ');
  const safeNeg = agentImgPromptLibrary.safeNegative.join(', ');
  const lang = detectUserInputLang(input.userInput);
  const zh = lang === 'zh';
  const optionText = input.option
    ? safeJsonStringify({
        title: input.option.title,
        summary: input.option.summary,
        styleTags: input.option.styleTags,
        negativeTags: input.option.negativeTags || [],
        suggested: input.option.suggested || {}
      })
    : '';

  return [
    agentImgPromptLibrary.finalPromptSystem,
    `Schema: ${schema}`,
    `User input language: ${lang}`,
    zh
      ? 'prompt 与 negativePrompt 必须使用中文，禁止出现英文。'
      : 'prompt and negativePrompt must be English. Do not output Chinese.',
    `Base style tags to incorporate when appropriate: ${baseStyle}`,
    `Safety negative tags (must include): ${safeNeg}`,
    input.contextText
      ? zh
        ? `上下文:\n${input.contextText}`
        : `Context:\n${input.contextText}`
      : '',
    zh ? `用户输入: ${input.userInput}` : `User input: ${input.userInput}`,
    input.option ? (zh ? `已选方向: ${optionText}` : `Chosen direction: ${optionText}`) : '',
    zh
      ? '只返回 JSON：prompt, negativePrompt, params'
      : 'Return JSON with: prompt, negativePrompt, params'
  ]
    .filter(Boolean)
    .join('\n\n');
};

export const useAgentImgFlow = (opts?: {
  getContextText?: () => string;
  getImages?: () => Promise<GenerateImageInput[] | undefined> | GenerateImageInput[] | undefined;
}) => {
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);
  const t = (zh: string, en: string) => (currentLang.value === 'en' ? en : zh);

  const getContextText = () => {
    try {
      const fn = opts?.getContextText;
      return typeof fn === 'function' ? String(fn() || '').trim() : '';
    } catch {
      return '';
    }
  };
  const getImages = async (): Promise<GenerateImageInput[] | undefined> => {
    try {
      const fn = opts?.getImages;
      if (typeof fn !== 'function') return undefined;
      const res = await fn();
      return Array.isArray(res) ? res : undefined;
    } catch {
      return undefined;
    }
  };
  const userInput = ref('');
  const deepMode = ref(true);
  const loading = ref(false);
  const error = ref('');
  const stage = ref<'idle' | 'directions' | 'final'>('idle');
  const lastRequestId = ref('');
  const activeAbort = ref<AbortController | null>(null);

  const options = ref<AgentImgDirectionOption[]>([]);
  const selectedOptionId = ref<string>('');
  const finalPrompt = ref<AgentImgPromptResult | null>(null);

  const selectedOption = computed(() => {
    const id = selectedOptionId.value.trim();
    if (!id) return null;
    return options.value.find((o) => o.id === id) || null;
  });

  const canAnalyze = computed(() => userInput.value.trim().length > 0 && !loading.value);
  const canFinalize = computed(() => {
    if (!userInput.value.trim() || loading.value) return false;
    if (!deepMode.value) return true;
    return !!selectedOption.value;
  });

  const cancel = () => {
    const ctl = activeAbort.value;
    if (!ctl) return;
    try {
      ctl.abort();
    } catch {}
    activeAbort.value = null;
  };

  const reset = () => {
    cancel();
    loading.value = false;
    options.value = [];
    selectedOptionId.value = '';
    finalPrompt.value = null;
    error.value = '';
    stage.value = 'idle';
    lastRequestId.value = '';
  };

  const humanizeError = (code: string) => {
    const c = String(code || '').trim();
    if (!c) return t('请求失败，请稍后再试', 'Request failed. Please try again later.');
    if (c === 'INSUFFICIENT_CREDITS')
      return t(
        '积分不足，请前往「算力商城」充值',
        'Insufficient credits. Please top up in Compute Market.'
      );
    if (c === 'EMPTY_PROMPT') return t('请输入需求描述后再试', 'Please enter a request first.');
    if (c === 'EMPTY_RESPONSE_TEXT')
      return t('模型返回为空，请稍后再试', 'Empty model response. Please try again.');
    if (c === 'PARSE_OPTIONS_FAILED')
      return t(
        '方向建议解析失败，请点击「重试」',
        'Failed to parse directions. Please click Retry.'
      );
    if (c === 'PARSE_PROMPT_FAILED')
      return t('Prompt 解析失败，请点击「重试」', 'Failed to parse prompt. Please click Retry.');
    if (c === 'AbortError' || /aborted/i.test(c)) return t('已取消', 'Cancelled');
    if (/failed to fetch/i.test(c))
      return t(
        '网络异常或服务不可用，请稍后再试',
        'Network error or service unavailable. Please try again.'
      );
    if (/timeout/i.test(c))
      return t('请求超时，请稍后再试', 'Request timed out. Please try again.');
    if (/API_ERROR_429/i.test(c))
      return t('请求过于频繁，请稍后再试', 'Too many requests. Please try again later.');
    return c.length > 160 ? `${c.slice(0, 160)}…` : c;
  };

  const runGenerateText = async (prompt: string, nextStage: 'directions' | 'final') => {
    const ctl = new AbortController();
    activeAbort.value = ctl;
    const reqId = `artigen_${nextStage}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    lastRequestId.value = reqId;
    try {
      const images = await getImages();
      return await generateText(prompt, {
        signal: ctl.signal,
        timeoutMs: 45000,
        requestId: reqId,
        images,
        purpose: `agentImg_${nextStage}`
      });
    } finally {
      activeAbort.value = null;
    }
  };

  const analyzeDirections = async () => {
    const input = userInput.value.trim();
    if (!input || loading.value) return;
    loading.value = true;
    error.value = '';
    finalPrompt.value = null;
    selectedOptionId.value = '';
    options.value = [];
    stage.value = 'directions';

    const prompt = buildDirectionPrompt(input, getContextText());
    const res = await runGenerateText(prompt, 'directions');
    if (!res.ok) {
      loading.value = false;
      error.value = humanizeError(res.errorCode || res.error);
      return;
    }

    const json = extractFirstJsonObject(res.text);
    const rawOptions = json && typeof json === 'object' ? (json as any).options : null;
    const list = Array.isArray(rawOptions) ? rawOptions : [];
    const normalized = list
      .map((x, i) => normalizeOption(x, i))
      .filter((x): x is AgentImgDirectionOption => !!x)
      .slice(0, 4);

    if (normalized.length !== 4) {
      loading.value = false;
      error.value = humanizeError('PARSE_OPTIONS_FAILED');
      return;
    }

    options.value = normalized;
    selectedOptionId.value = normalized[0].id;
    loading.value = false;
  };

  const generateFinal = async (): Promise<AgentImgPromptResult | null> => {
    const input = userInput.value.trim();
    if (!input || loading.value) return null;
    loading.value = true;
    error.value = '';
    finalPrompt.value = null;
    stage.value = 'final';

    const prompt = buildFinalPrompt({
      userInput: input,
      option: deepMode.value ? selectedOption.value : null,
      contextText: getContextText()
    });
    const res = await runGenerateText(prompt, 'final');
    if (!res.ok) {
      loading.value = false;
      error.value = humanizeError(res.errorCode || res.error);
      return null;
    }

    const json = extractFirstJsonObject(res.text);
    const normalized = normalizePromptResult(json);
    if (!normalized) {
      loading.value = false;
      error.value = humanizeError('PARSE_PROMPT_FAILED');
      return null;
    }

    finalPrompt.value = normalized;
    loading.value = false;
    return normalized;
  };

  return {
    userInput,
    deepMode,
    loading,
    error,
    stage,
    lastRequestId,
    options,
    selectedOptionId,
    selectedOption,
    finalPrompt,
    canAnalyze,
    canFinalize,
    reset,
    cancel,
    analyzeDirections,
    generateFinal
  };
};
