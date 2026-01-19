import { ref, computed, watch } from 'vue';
import { useLanguageStore } from '@/stores/language';
import { storeToRefs } from 'pinia';
import { img2img, type GenerateImageInput, type Img2ImgImageInput } from '../services/text';
import { trackEvent } from '@/utils/analytics';
import { agentImgPromptLibrary } from '../data/promptLibrary';
import type { AgentImgPromptResult } from '../types';

// Helper types for dependencies
interface GenerationDeps {
  auth: {
    ensureAuthed: (cb?: () => void) => boolean;
  };
  memory: {
    userInputMemory: any; // Ref<string[]>
  };
  credits: {
    refreshCredits: () => Promise<void>;
    creditsBalance: any; // Ref
  };
  models: {
    selectedModelId: any; // Ref
  };
  upload: {
    previewFiles: any; // Ref<File[]>
    logoFile: any; // Ref<File | null>
    fileToGenerateInput: (f: File) => Promise<GenerateImageInput | null>;
    fileToThumbDataUrl: (f: File) => Promise<string | null>;
  };
  history: {
    history: any; // Ref
    setCancelNoticeForHistory: (id: string | number, text: string) => void;
  };
  flow: {
    userInput: any; // Ref
    deepMode: any; // Ref
    options: any; // Ref
    selectedOptionId: any; // Ref
    selectedOptionTitle: any; // Computed
    selectedOptionSummary: any; // Computed
    selectedOptionStyleTags: any; // Computed
    analyzeDirections: () => Promise<void>;
    cancel: () => void;
  };
  settings: {
    buildProductProfileContextText: () => string;
  };
  ui: {
    error: any; // Ref
    loading: any; // Ref
    scrollChatToBottom: () => void;
    showTopTip: (msg: string) => void;
  };
}

const MAX_HISTORY = 50;

const resolveRemoteUrl = (raw: string) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  // Simple heuristic if buildApiUrl is not available
  if (u.startsWith('/')) return `${window.location.origin}${u}`;
  return u;
};

const normalizeTag = (v: string) =>
  String(v || '')
    .trim()
    .replace(/\s+/g, ' ');

const ensureUniqueTags = (tags: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 24) break;
  }
  return out;
};

const applyStyleTagsToPrompt = (prompt: string, tags: string[]) => {
  let out = String(prompt || '').trim();
  const lower = () => out.toLowerCase();
  for (const t of ensureUniqueTags(tags)) {
    if (!t) continue;
    if (lower().includes(t.toLowerCase())) continue;
    if (!out) out = t;
    else out = `${out}${out.endsWith(',') || out.endsWith('，') ? ' ' : ', '}${t}`;
  }
  return out;
};

export function useAgentImgGeneration(deps: GenerationDeps) {
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);

  const activeImgAbort = ref<AbortController | null>(null);
  const activeRequestId = ref('');
  const pendingUserText = ref('');
  const lastUserText = ref('');
  const pendingNotice = ref<{ type: 'cancel'; text: string } | null>(null);

  const pushUserInputMemory = (text: string) => {
    const t = String(text || '').trim();
    if (!t) return;
    const listRaw = Array.isArray(deps.memory.userInputMemory.value)
      ? deps.memory.userInputMemory.value
      : [];
    const list: string[] = listRaw
      .map((x: any) => String(x || '').trim())
      .filter((x: string) => !!x);
    const key = normalizeTag(t).toLowerCase();
    const last = list.length ? String(list[list.length - 1] || '').trim() : '';
    const lastKey = normalizeTag(last).toLowerCase();
    if (lastKey && lastKey === key) return;
    const next = [...list, t].slice(-12);
    deps.memory.userInputMemory.value = next;
  };

  const abortImg2Img = () => {
    const ctl = activeImgAbort.value;
    if (!ctl) return;
    try {
      ctl.abort();
    } catch {}
    activeImgAbort.value = null;
  };

  const clearCancelNotices = () => {
    pendingNotice.value = null;
    deps.history.history.value = deps.history.history.value.map((it: any) => {
      if (it.notice && it.notice.type === 'cancel') return { ...it, notice: null };
      return it;
    });
  };

  const humanizeImgError = (code: string) => {
    const c = String(code || '').trim();
    if (!c) return currentLang.value === 'zh' ? '出图失败，请稍后再试' : 'Image generation failed.';
    if (c === 'ABORTED' || c === 'AbortError' || /aborted/i.test(c))
      return currentLang.value === 'zh' ? '已取消' : 'Cancelled.';
    if (c === 'CLIENT_ABORTED') return currentLang.value === 'zh' ? '已取消' : 'Cancelled.';
    if (c === 'API_ERROR_499') return currentLang.value === 'zh' ? '已取消' : 'Cancelled.';
    if (c === 'UPSTREAM_TIMEOUT' || c === 'API_ERROR_504')
      return currentLang.value === 'zh'
        ? '服务超时，请稍后再试'
        : 'Request timed out, please retry.';
    if (c === 'INSUFFICIENT_CREDITS')
      return currentLang.value === 'zh'
        ? '积分不足，请前往「点数商城」充值'
        : 'Insufficient credits. Please top up in the Market.';
    if (c === 'EMPTY_IMAGE')
      return currentLang.value === 'zh'
        ? '请先上传一张参考图再出图'
        : 'Please upload a reference image first.';
    if (c === 'REQUEST_IN_PROGRESS')
      return currentLang.value === 'zh'
        ? '请求处理中，请稍后再试'
        : 'Request in progress, try again later.';
    if (c === 'DUPLICATE_REQUEST')
      return currentLang.value === 'zh'
        ? '重复请求，请稍后再试'
        : 'Duplicate request, try again later.';
    if (c === 'EMPTY_IMAGE_RESULT')
      return currentLang.value === 'zh'
        ? '出图失败：服务未返回图片'
        : 'Failed: empty image result.';
    if (c === 'CREDITS_CONFIRM_FAILED')
      return currentLang.value === 'zh'
        ? '扣费确认失败，已回滚，请重试'
        : 'Credits confirmation failed (rolled back). Please retry.';
    if (c === 'MISSING_SILICONFLOW_API_KEY')
      return currentLang.value === 'zh' ? '服务未配置，请联系管理员' : 'Server not configured.';
    if (c === 'NETWORK_ERROR' || c === 'FETCH_ERROR')
      return currentLang.value === 'zh'
        ? '网络错误，请稍后再试'
        : 'Network error, please try again.';
    if (c === 'OFFLINE')
      return currentLang.value === 'zh' ? '网络未连接（本地离线）' : 'You are offline.';
    if (c.startsWith('SILICONFLOW_IMAGE_')) {
      if (/^SILICONFLOW_IMAGE_\d{3}$/.test(c)) {
        const status = Number(c.replace('SILICONFLOW_IMAGE_', '')) || 0;
        if (status === 400)
          return currentLang.value === 'zh'
            ? '请求参数不合法（可能是模型不支持/图片格式或尺寸不匹配），请调整后重试'
            : 'Bad request (model/inputs may be invalid). Please adjust and retry.';
        if (status === 401 || status === 403)
          return currentLang.value === 'zh'
            ? '上游鉴权失败（服务端配置问题），请稍后再试或联系管理员'
            : 'Upstream authorization failed (server config). Please retry later.';
        if (status === 429)
          return currentLang.value === 'zh'
            ? '上游限流中，请稍后再试'
            : 'Rate limited upstream. Please retry later.';
        if (status === 500 || status === 502 || status === 503)
          return currentLang.value === 'zh'
            ? '服务繁忙，请稍后再试'
            : 'Service busy, please try again.';
        if (status === 504)
          return currentLang.value === 'zh'
            ? '服务超时，请稍后再试'
            : 'Request timed out, please retry.';
        return currentLang.value === 'zh'
          ? '服务异常，请稍后再试'
          : 'Upstream error, please try again.';
      }
      return currentLang.value === 'zh'
        ? '服务繁忙或参数错误，请稍后再试'
        : 'Upstream error, please try again.';
    }
    return currentLang.value === 'zh' ? `出图失败：${c}` : `Image generation failed: ${c}`;
  };

  const buildDeepPrompt = (baseText: string) => {
    const title = String(deps.flow.selectedOptionTitle.value || '').trim();
    const summary = String(deps.flow.selectedOptionSummary.value || '').trim();
    const tags = ensureUniqueTags(deps.flow.selectedOptionStyleTags.value || []).join(', ');
    const parts = [String(baseText || '').trim(), title, summary, tags].filter(Boolean);
    return parts.join(', ');
  };

  const buildDeepDisplayText = (_userText: string, opt: { title: string; summary: string }) => {
    const title = String(opt?.title || '').trim();
    const summary = String(opt?.summary || '').trim();
    if (title && summary) return `${title} ${summary}`.trim();
    return (title || summary).trim();
  };

  const buildNegativePrompt = (extra?: string[]) => {
    const base = Array.isArray(agentImgPromptLibrary.safeNegative)
      ? agentImgPromptLibrary.safeNegative
      : [];
    const extraTags = Array.isArray(extra) ? extra : [];
    const allowLogo = !!deps.upload.logoFile.value;
    const filteredBase = allowLogo
      ? base.filter((t) => {
          const k = normalizeTag(t).toLowerCase();
          return k !== 'watermark' && k !== 'signature' && k !== 'text';
        })
      : base;
    const merged = ensureUniqueTags([...filteredBase, ...extraTags]);
    return merged.join(', ');
  };

  const buildPromptWithContext = (userText: string) => {
    const u = String(userText || '').trim();
    const ctx = String(deps.settings.buildProductProfileContextText() || '').trim();
    if (!ctx) return u;
    const prefix = currentLang.value === 'zh' ? '产品档案' : 'Product Profile';
    const req = currentLang.value === 'zh' ? '用户需求' : 'User Request';
    if (!u) return `${prefix}:\n${ctx}`;
    return `${prefix}:\n${ctx}\n\n${req}:\n${u}`;
  };

  const applyLogoInstructionToPrompt = (prompt: string) => {
    const p = String(prompt || '').trim();
    if (!deps.upload.logoFile.value) return p;
    const inst =
      currentLang.value === 'zh'
        ? '在画面左上角添加提供的品牌Logo（使用上传的Logo参考图），小尺寸，四周留出边距，保持Logo清晰且不变形，尽量不要改变原有主体与构图。'
        : 'Add the provided brand logo (use the uploaded logo reference image) to the top-left corner, small size with margin, keep it crisp and not distorted, and preserve the original subject and composition as much as possible.';
    if (!p) return inst;
    return `${p}\n\n${inst}`;
  };

  const doPrimary = async () => {
    if (!deps.auth.ensureAuthed(() => doPrimary())) return;

    trackEvent('ai_generate_click', {
      category: 'funnel',
      deepMode: !!deps.flow.deepMode.value,
      model: String(deps.models.selectedModelId.value || '').trim(),
      hasRef: deps.upload.previewFiles.value.filter((f: any) => !!f).length > 0,
      hasLogo: !!deps.upload.logoFile.value
    });

    clearCancelNotices();
    deps.flow.cancel();
    abortImg2Img();

    const rawUserText = String(deps.flow.userInput.value || '').trim();
    const activeUserText = rawUserText || String(lastUserText.value || '').trim();
    if (rawUserText) lastUserText.value = rawUserText;
    if (!activeUserText) return;
    pushUserInputMemory(activeUserText);

    const getImgInputs = async () => {
      const files: File[] = [];
      for (const f of deps.upload.previewFiles.value) if (f) files.push(f);
      const list = files.slice(0, 3);
      if (!list.length) return [];
      const inputs = await Promise.all(list.map(deps.upload.fileToGenerateInput));
      const ok = inputs.filter(
        (x): x is GenerateImageInput => !!x && !!x.mimeType && !!x.dataBase64
      );
      return ok.length ? ok : [];
    };

    const runGen = async (fp: AgentImgPromptResult, requestId: string, displayUserText: string) => {
      const refImgs = await getImgInputs();
      const logoInput = deps.upload.logoFile.value
        ? await deps.upload.fileToGenerateInput(deps.upload.logoFile.value)
        : null;
      const hasLogo = !!logoInput && !!deps.upload.logoFile.value;
      const buildFinalImages = () => {
        if (!hasLogo) return refImgs as Img2ImgImageInput[];
        if (refImgs.length)
          return [...refImgs.slice(0, 2), logoInput as GenerateImageInput] as Img2ImgImageInput[];
        return [logoInput as GenerateImageInput] as Img2ImgImageInput[];
      };

      activeRequestId.value = requestId;

      const runOnce = async (args: {
        prompt: string;
        userText: string;
        negativePrompt?: string;
        params?: AgentImgPromptResult['params'];
        images: Img2ImgImageInput[];
      }) => {
        abortImg2Img();
        const ctl = new AbortController();
        activeImgAbort.value = ctl;
        const res = await img2img({
          prompt: args.prompt,
          userText: args.userText,
          negativePrompt: args.negativePrompt,
          params: args.params,
          images: args.images,
          model: deps.models.selectedModelId.value,
          reason: 'ai_design',
          timeoutMs: 120000,
          requestId,
          deepMode: !!deps.flow.deepMode.value,
          signal: ctl.signal
        });
        if (activeImgAbort.value === ctl) activeImgAbort.value = null;
        if (!res.ok) {
          if (res.wallet) deps.credits.creditsBalance.value = res.wallet;
          const code = String(res.errorCode || res.error || '').trim();
          const abortLike =
            code === 'ABORTED' ||
            code === 'AbortError' ||
            code === 'CLIENT_ABORTED' ||
            code === 'API_ERROR_499' ||
            /aborted/i.test(code) ||
            /AbortError/i.test(code);
          if (abortLike) {
            const msg = humanizeImgError(code || 'ABORTED');
            deps.history.setCancelNoticeForHistory(requestId, msg);
            trackEvent('ai_generate_abort', {
              category: 'funnel',
              error: code || 'ABORTED',
              model: String(deps.models.selectedModelId.value || '').trim(),
              deepMode: !!deps.flow.deepMode.value
            });
            return { ok: false as const, url: '' };
          }
          deps.ui.error.value = humanizeImgError(code);
          trackEvent('ai_generate_fail', {
            category: 'funnel',
            error: code || 'FAILED',
            model: String(deps.models.selectedModelId.value || '').trim(),
            deepMode: !!deps.flow.deepMode.value
          });
          return { ok: false as const, url: '' };
        }
        const url = String(res.images?.[0]?.url || '').trim();
        const finalUrl = resolveRemoteUrl(url) || url;

        if (!finalUrl) {
          deps.ui.error.value = humanizeImgError('EMPTY_IMAGE_RESULT');
          trackEvent('ai_generate_fail', {
            category: 'funnel',
            error: 'EMPTY_IMAGE_RESULT',
            model: String(deps.models.selectedModelId.value || '').trim(),
            deepMode: !!deps.flow.deepMode.value
          });
          return { ok: false as const, url: '' };
        }
        trackEvent('ai_generate_success', {
          category: 'funnel',
          model: String(deps.models.selectedModelId.value || '').trim(),
          deepMode: !!deps.flow.deepMode.value,
          hasRef: deps.upload.previewFiles.value.filter((f: any) => !!f).length > 0,
          hasLogo: !!deps.upload.logoFile.value
        });
        return { ok: true as const, url: finalUrl };
      };

      deps.ui.loading.value = true;
      deps.ui.error.value = '';
      const out = await runOnce({
        prompt: hasLogo ? applyLogoInstructionToPrompt(fp.prompt) : fp.prompt,
        userText: displayUserText,
        negativePrompt: fp.negativePrompt,
        params: fp.params,
        images: buildFinalImages()
      });
      deps.ui.loading.value = false;
      if (activeRequestId.value === requestId) activeRequestId.value = '';
      if (out.ok) {
        await deps.credits.refreshCredits();
      }
      return out;
    };

    if (deps.flow.deepMode.value) {
      if (deps.flow.options.value.length === 0) {
        pendingUserText.value = activeUserText;
        const p = deps.flow.analyzeDirections();
        deps.flow.userInput.value = '';
        await p;
        await deps.credits.refreshCredits();
        pendingUserText.value = '';
        return;
      }

      // We need selectedOptionIndex or just use selectedOptionId to find it
      // In useAgentImgFlow, options is ref array.
      const idx = deps.flow.options.value.findIndex(
        (o: any) => o.id === deps.flow.selectedOptionId.value
      );
      if (idx < 0) {
        deps.flow.userInput.value = '';
        pendingUserText.value = '';
        return;
      }
      const opt = deps.flow.options.value[idx];
      const baseText = buildPromptWithContext(activeUserText);
      const prompt = applyStyleTagsToPrompt(buildDeepPrompt(baseText), opt.styleTags || []);
      const negativePrompt = buildNegativePrompt(opt.negativeTags || []);
      const fp: AgentImgPromptResult = { prompt, negativePrompt };
      deps.flow.options.value = [];
      deps.flow.selectedOptionId.value = '';

      deps.flow.userInput.value = '';
      const refThumbsRaw = await Promise.all(
        deps.upload.previewFiles.value
          .filter((f: any): f is File => !!f)
          .slice(0, 3)
          .map((f: File) => deps.upload.fileToThumbDataUrl(f))
      );
      const refThumbs = refThumbsRaw.filter((x: any): x is string => !!x);
      const requestId = `img2img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const displayText = buildDeepDisplayText(activeUserText, {
        title: String(opt?.title || '').trim(),
        summary: String(opt?.summary || '').trim()
      });
      deps.history.history.value = [
        ...deps.history.history.value,
        {
          id: requestId,
          timestamp: Date.now(),
          userText: displayText || activeUserText,
          result: fp,
          image: null,
          ...(refThumbs.length ? { refImages: refThumbs } : {}),
          notice: null
        }
      ].slice(-MAX_HISTORY);
      pendingUserText.value = '';
      const { ok, url } = await runGen(fp, requestId, displayText || activeUserText);
      if (ok) {
        deps.history.history.value = deps.history.history.value.map((it: any) =>
          it.id === requestId ? { ...it, image: url } : it
        );
      }
      return;
    }

    // Quick Mode
    const fp: AgentImgPromptResult = {
      prompt: buildPromptWithContext(activeUserText),
      negativePrompt: buildNegativePrompt()
    };
    deps.flow.userInput.value = '';
    const refThumbsRaw = await Promise.all(
      deps.upload.previewFiles.value
        .filter((f: any): f is File => !!f)
        .slice(0, 3)
        .map((f: File) => deps.upload.fileToThumbDataUrl(f))
    );
    const refThumbs = refThumbsRaw.filter((x: any): x is string => !!x);
    const requestId = `img2img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    deps.history.history.value = [
      ...deps.history.history.value,
      {
        id: requestId,
        timestamp: Date.now(),
        userText: activeUserText,
        result: fp,
        image: null,
        ...(refThumbs.length ? { refImages: refThumbs } : {}),
        notice: null
      }
    ].slice(-MAX_HISTORY);
    pendingUserText.value = '';
    const { ok, url } = await runGen(fp, requestId, activeUserText);
    if (ok) {
      deps.history.history.value = deps.history.history.value.map((it: any) =>
        it.id === requestId ? { ...it, image: url } : it
      );
    }
  };

  const onStopProcessing = () => {
    const reqId = String(activeRequestId.value || '').trim();
    if (reqId) {
      deps.history.setCancelNoticeForHistory(reqId, humanizeImgError('ABORTED'));
    } else if (pendingUserText.value) {
      pendingNotice.value = { type: 'cancel', text: humanizeImgError('ABORTED') };
    }
    deps.flow.cancel();
    abortImg2Img();
  };

  const restoreLastUserTextToInput = () => {
    const t = String(lastUserText.value || '').trim();
    if (!t) return;
    const cur = String(deps.flow.userInput.value || '');
    if (!cur.trim()) {
      deps.flow.userInput.value = t;
      return;
    }
    const sep = cur.endsWith('\n') ? '' : '\n';
    deps.flow.userInput.value = `${cur}${sep}${t}`;
  };

  const onExitStyleSelection = () => {
    if (!deps.flow.options.value.length) return;
    deps.flow.options.value = [];
    deps.flow.selectedOptionId.value = '';
    pendingUserText.value = '';
    restoreLastUserTextToInput();
    deps.ui.scrollChatToBottom();
  };

  watch(
    () => deps.flow.deepMode.value,
    () => {
      if (deps.flow.options.value.length) onExitStyleSelection();
    }
  );

  watch(
    () => deps.ui.error.value,
    (v) => {
      const m = String(v || '').trim();
      if (!m) return;
      const cancelled =
        m === 'Cancelled.' || m === '已取消' || /cancelled/i.test(m) || /取消/.test(m);
      if (cancelled) {
        const reqId = String(activeRequestId.value || '').trim();
        if (reqId) deps.history.setCancelNoticeForHistory(reqId, m);
        else if (pendingUserText.value) pendingNotice.value = { type: 'cancel', text: m };
        deps.ui.error.value = '';
        return;
      }
      deps.ui.showTopTip(m); // Need showTopTip in deps.ui
    }
  );

  return {
    activeImgAbort,
    activeRequestId,
    pendingUserText,
    lastUserText,
    pendingNotice,
    doPrimary,
    onStopProcessing,
    onExitStyleSelection,
    clearCancelNotices,
    abortImg2Img,
    resolveRemoteUrl
  };
}
