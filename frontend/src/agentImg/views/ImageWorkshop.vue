<template>
  <div class="image-workshop-page">
    <TitleBar />

    <main class="main-content">
      <div class="page-header">
        <div class="badge-row">
          <span class="badge-dot"></span>
          <span class="badge-text">{{ ui.status }}</span>
        </div>

        <div class="title-stack">
          <h1 class="page-title">
            <span class="title-text-group">
              {{ ui.titleMain }} <span class="highlight">{{ ui.titleHighlight }}</span>
            </span>
            <div class="badges-group">
              <span class="real-beta-badge">Beta</span>
              <span class="beta-badge">{{ ui.beta }}</span>
            </div>
          </h1>
          <p class="page-desc">{{ ui.desc }}</p>
        </div>
      </div>

      <div class="tools-grid">
        <ToolCard
          tool-id="TOOL_01"
          badge="NEW"
          icon="ID"
          :title="ui.toolIdTitle"
          :desc="ui.toolIdDesc"
          :launch="ui.launch"
          @click="openIdPhotoPopup"
        />

        <ToolCard
          tool-id="TOOL_02"
          badge="HOT"
          badge-tone="hot"
          icon="🕒"
          :title="ui.toolOldTitle"
          :desc="ui.toolOldDesc"
          :launch="ui.launch"
          @click="openOldPhotoPopup"
        />

        <ToolCard
          tool-id="TOOL_03"
          badge="10⚡"
          icon="🧾"
          :title="ui.toolIngredientTitle"
          :desc="ui.toolIngredientDesc"
          :launch="ui.launch"
          @click="openIngredientList"
        />

        <ToolCard
          tool-id="TOOL_04"
          badge="NEW"
          icon="BG"
          :title="ui.toolBgTitle"
          :desc="ui.toolBgDesc"
          :launch="ui.launch"
          @click="openAiBackgroundPopup"
        />
      </div>

      <div class="info-section">
        <div class="info-container">
          <h2 class="info-title">{{ ui.contentTitle }}</h2>
          <p class="info-desc">{{ ui.contentDesc }}</p>

          <div class="info-grid">
            <div class="info-card">
              <div class="info-card-title">> {{ ui.useCasesTitle }}</div>
              <ul class="info-list">
                <li v-for="(item, idx) in ui.useCases" :key="idx" class="info-list-item">
                  <span class="info-list-icon">#</span>
                  {{ item }}
                </li>
              </ul>
            </div>

            <div class="info-card">
              <div class="info-card-title">> {{ ui.longTailTitle }}</div>
              <div class="info-chips">
                <span v-for="(chip, idx) in ui.longTailKeywords" :key="idx" class="info-chip">
                  {{ chip }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="faq-section faq-mobile-pad">
        <div class="faq-left">
          <div class="faq-title-large">{{ ui.faqTitle }}</div>
          <div class="faq-subtitle">{{ ui.faqSubtitle }}</div>
        </div>
        <div class="faq-list">
          <details v-for="f in ui.faqs" :key="f.q" class="faq-item">
            <summary class="faq-q">
              <span class="q-text">{{ f.q }}</span>
              <span class="q-icon">+</span>
            </summary>
            <div class="faq-a-wrapper">
              <div class="faq-a">{{ f.a }}</div>
            </div>
          </details>
        </div>
      </div>
    </main>

    <GlobalFooter />

    <transition name="fade">
      <div v-if="resultVisible" class="result-overlay" @click="closeResult">
        <div class="result-container" @click.stop>
          <div class="result-header">
            <div class="result-title">{{ resultTitle }}</div>
            <CloseButton @click="closeResult" />
          </div>
          <div v-if="resultError" class="result-error">{{ resultError }}</div>
          <div v-else class="result-body">
            <div v-if="resultLoading" class="result-loading">
              <div class="loading-spinner"></div>
              <div class="loading-text">{{ ui.loading }}</div>
            </div>
            <div v-if="resultUrl" class="result-image-wrap">
              <img :src="resultUrl" class="result-image" alt="Result" />
            </div>
            <div class="result-actions">
              <button
                class="result-btn"
                type="button"
                @click="downloadResult"
                :disabled="!resultUrl || resultLoading"
              >
                {{ ui.download }}
              </button>
              <button class="result-btn secondary" type="button" @click="closeResult">
                {{ ui.close }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <IdPhotoPopup
      :visible="isIdPhotoPopupOpen"
      :credits-cost="idPhotoCost"
      @close="isIdPhotoPopupOpen = false"
      @generate="handleGenerateIdPhoto"
    />

    <OldPhotoPopup
      :visible="isOldPhotoPopupOpen"
      :credits-cost="oldPhotoCost"
      @close="isOldPhotoPopupOpen = false"
      @restore="handleRestoreOldPhoto"
    />

    <AiBackgroundPopup
      :visible="isAiBackgroundPopupOpen"
      :credits-cost="aiBackgroundCost"
      @close="isAiBackgroundPopupOpen = false"
      @generate="handleGenerateAiBackground"
    />

    <IngredientLabel
      :visible="isIngredientPopupOpen"
      :credits-cost="ingredientLabelCost"
      @close="isIngredientPopupOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import TitleBar from '../components/TitleBar.vue';
import GlobalFooter from '../components/GlobalFooter.vue';
import IdPhotoPopup from '../components/IdPhotoPopup.vue';
import OldPhotoPopup from '../components/OldPhotoPopup.vue';
import AiBackgroundPopup from '../components/AiBackgroundPopup.vue';
import ToolCard from '../components/ToolCard.vue';
import CloseButton from '../components/CloseButton.vue';
import IngredientLabel from './IngredientLabel.vue';
import { trackPageView, trackEvent } from '../../utils/analytics';
import { setMeta } from '../../utils/seo';
import { img2img, type GenerateImageInput } from '../services/text';
import { downloadBlob } from '../logic/formatFactory/url';
import { useConsoleStore } from '@/stores/console';
import { getAuthToken, getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import { useLanguageStore } from '@/stores/language';

const isIdPhotoPopupOpen = ref(false);
const isOldPhotoPopupOpen = ref(false);
const isIngredientPopupOpen = ref(false);
const isAiBackgroundPopupOpen = ref(false);

const resultVisible = ref(false);
const resultTitle = ref('');
const resultUrl = ref('');
const resultError = ref('');
const resultLoading = ref(false);
const activeRequestId = ref('');

const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const idPhotoCost = 5;
const oldPhotoCost = 5;
const aiBackgroundCost = 5;
const ingredientLabelCost = 10;

const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    status: en ? 'AI LAB' : 'AI 实验室',
    titleMain: en ? 'AI Image' : 'AI 影像',
    titleHighlight: en ? 'Workshop' : '工坊',
    beta: en ? '✨ Cloud encrypted processing' : '✨ 云端加密处理',
    desc: en
      ? 'Explore AI tools for ID photos, restoration, background editing, and FDA ingredient label creation.'
      : '探索 AI 驱动的影像处理工具：证件照、修复、AI 背景与 FDA 配料表标签图生成。',
    toolIdTitle: en ? 'Smart ID Photo' : '智能证件照',
    toolIdDesc: en
      ? 'Multiple specs, one-click standard ID photo.'
      : '支持多种规格，一键生成标准证件照',
    toolOldTitle: en ? 'Old Photo Restoration' : '老照片修复',
    toolOldDesc: en
      ? 'Restore blurry/damaged photos, optional colorization.'
      : '修复模糊、破损照片，支持智能上色',
    toolIngredientTitle: en ? 'FDA Ingredient Label' : 'FDA 配料表',
    toolIngredientDesc: en
      ? 'Paste text and generate a clean label image.'
      : '粘贴配料/成分文本，一键生成规范标签图',
    toolBgTitle: en ? 'AI Background' : 'AI 背景',
    toolBgDesc: en
      ? 'Replace or add realistic backgrounds with local preview.'
      : '一键换背景/加场景，支持本地预览与主体可调',
    launch: 'LAUNCH',
    resultTitle: en ? 'Result' : '生成结果',
    download: en ? 'Download' : '下载',
    close: en ? 'Close' : '关闭',
    loading: en ? 'Generating, please wait…' : '正在生成，请稍候…',
    fileReadFailed: en ? 'Failed to read image. Please try again.' : '图片读取失败，请重试',
    loginRequired: en ? 'Please sign in to use this feature.' : '请先登录后使用（当前免费）',

    contentTitle: en ? 'Usage Guide' : '使用专栏',
    contentDesc: en
      ? 'AI Lab includes Smart ID Photos, Old Photo Restoration, AI Background, and FDA ingredient label generation.'
      : 'AI 实验室包含：智能证件照、老照片修复（可选上色/去噪）、AI 背景以及 FDA 配料表标签图生成。',
    useCasesTitle: en ? 'Use Cases' : '使用场景',
    useCases: en
      ? [
          'ID Photo: crop/resize, background replacement, common specs export.',
          'Restoration: denoise, enhance clarity, optional colorization.',
          'AI Background: replace/add scenes for product shots and portraits.',
          'Ingredient Label: paste label text and generate a clean label image.',
          'E-commerce: quick assets for listings and packaging drafts.',
          'Personal: restore old photos and export higher quality copies.'
        ]
      : [
          '证件照：裁切/尺寸标准化、换底色、常用规格一键导出。',
          '老照片修复：去噪、清晰增强、可选智能上色。',
          'AI 背景：商品图/人物图一键换背景或补充场景。',
          'FDA 配料表：粘贴配料/成分文本，生成规范标签图。',
          '电商/品牌：快速产出可用素材，用于商品页与包装打样。',
          '个人留存：修复旧照片并导出更高质量版本。'
        ],
    longTailTitle: en ? 'Popular Keywords' : '热门关键词',
    longTailKeywords: en
      ? [
          'ID photo background',
          '1-inch / 2-inch photo',
          'passport photo',
          'old photo colorize',
          'photo denoise',
          'FDA ingredient label',
          'ingredient list generator',
          'label image'
        ]
      : [
          '证件照换底',
          '一寸二寸',
          '护照签证照',
          '老照片上色',
          '照片去噪',
          'FDA 配料表',
          '配料表生成器',
          '标签图生成'
        ],
    faqTitle: en ? 'FAQ' : '常见问题',
    faqSubtitle: en ? 'Modules, beta notes, and quality tips.' : '关于模块、Beta 与效果的说明',
    faqs: en
      ? [
          {
            q: 'What modules are included in Image Workshop?',
            a: 'Currently includes Smart ID Photo, Old Photo Restoration, AI Background, and FDA ingredient label generation.'
          },
          {
            q: 'Is Image Workshop in beta?',
            a: 'Yes. We are iterating quickly and may adjust workflows or outputs based on feedback.'
          },
          {
            q: 'Will a failed generation charge credits?',
            a: 'No. If the request fails due to system reasons, credits are refunded automatically.'
          },
          {
            q: 'What ID photo specs are supported?',
            a: 'Common sizes and aspect ratios are supported. Choose the preset in the tool and export instantly.'
          },
          {
            q: 'How do I choose denoise / colorize for old photos?',
            a: 'Enable denoise for grainy photos. Enable colorize if you want a colorized result; keep it off for a more faithful restoration.'
          },
          {
            q: 'Is the FDA ingredient label output guaranteed compliant?',
            a: 'We generate a clean label-style image from your text, but you should still review wording and formatting for your product and jurisdiction.'
          },
          {
            q: 'Do you store my uploaded photos?',
            a: 'Files are used only for processing your request. We aim to clear task-related temporary data as soon as possible after completion.'
          }
        ]
      : [
          {
            q: '影像工坊目前有哪些模块？',
            a: '当前包含：智能证件照、老照片修复、AI 背景、FDA 配料表标签图生成。'
          },
          {
            q: '影像工坊是 Beta 吗？',
            a: '是的。当前处于 Beta 阶段，我们会根据反馈持续优化流程与效果。'
          },
          {
            q: '生成失败会扣点吗？',
            a: '不会。若因系统原因生成失败，点数会自动退回。'
          },
          {
            q: '证件照支持哪些规格？',
            a: '覆盖常见尺寸与比例。进入工具后选择预设规格即可一键导出。'
          },
          {
            q: '老照片去噪/上色怎么选？',
            a: '噪点明显建议开去噪；想要彩色效果再打开上色。追求“更还原”的修复可以只开去噪。'
          },
          {
            q: 'FDA 配料表生成能保证完全合规吗？',
            a: '这里输出的是“标签图样式”的排版结果，便于快速出图；最终上线前仍建议人工校对用词、顺序与法规要求。'
          },
          {
            q: '上传的照片会被保存吗？',
            a: '文件仅用于完成本次处理。任务完成后我们会尽快清理临时数据。'
          }
        ]
  };
});

onMounted(() => {
  consoleStore.init();
  consoleStore.recordTraffic({
    type: 'page_view',
    page: '/artigen/image-workshop',
    meta: { referrer: document.referrer }
  });
  trackPageView('/artigen/image-workshop');
  setMeta({
    title:
      currentLang.value === 'zh'
        ? 'AI 影像工坊 - 证件照/老照片修复/AI背景/FDA配料表'
        : 'AI Image Workshop - ID Photo / Restoration / AI Background / FDA Ingredient Label',
    description:
      currentLang.value === 'zh'
        ? 'Artigen AI 影像工坊提供智能证件照、老照片修复、AI 背景与 FDA 配料表标签图生成。'
        : 'Artigen AI Image Workshop provides ID photos, restoration, AI background editing, and FDA ingredient label generation.',
    keywords:
      currentLang.value === 'zh'
        ? 'AI证件照,老照片修复,AI背景,背景替换,电商背景,人物背景,FDA配料表,配料表生成器,标签图生成'
        : 'AI ID photo, old photo restoration, AI background, background replacement, product background, FDA ingredient label, ingredient generator, label image'
  });
});

const openIdPhotoPopup = () => {
  isIdPhotoPopupOpen.value = true;
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'id_photo'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'id_photo');
};

const openOldPhotoPopup = () => {
  isOldPhotoPopupOpen.value = true;
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'old_photo'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'old_photo');
};

const openIngredientList = () => {
  isIngredientPopupOpen.value = true;
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'ingredient_list'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'ingredient_list');
};

const openAiBackgroundPopup = () => {
  isAiBackgroundPopupOpen.value = true;
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'ai_background'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'ai_background');
};

const fileToGenerateInput = (f: File): Promise<GenerateImageInput | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const raw = String(reader.result || '');
      const toInput = (dataUrl: string): GenerateImageInput => {
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        return {
          mimeType: (m?.[1] || f.type || 'image/png').trim(),
          dataBase64: String(m?.[2] || '').trim()
        };
      };

      const shouldCompress = f.size > 2.5 * 1024 * 1024;
      if (!shouldCompress) return resolve(toInput(raw));

      const img = new Image();
      img.onload = () => {
        const maxDim = 1536;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        if (scale >= 1) return resolve(toInput(raw));

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(toInput(raw));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(toInput(raw));
            const r2 = new FileReader();
            r2.onerror = () => resolve(toInput(raw));
            r2.onload = () => resolve(toInput(String(r2.result || raw)));
            r2.readAsDataURL(blob);
          },
          'image/jpeg',
          0.92
        );
      };
      img.onerror = () => resolve(toInput(raw));
      img.src = raw;
    };
    reader.readAsDataURL(f);
  });
};

const humanizeError = (code: string) => {
  const c = String(code || '').trim();
  if (!c) return '请求失败，请稍后再试';
  if (c === 'INSUFFICIENT_CREDITS') return '积分不足，请前往「点数商城」充值';
  if (c === 'LOGIN_REQUIRED') return '请先登录后再试';
  if (c === 'MISSING_SILICONFLOW_API_KEY') return '服务未配置，请稍后再试';
  if (/failed to fetch/i.test(c)) return '网络异常或服务不可用，请稍后再试';
  if (/timeout/i.test(c) || c === 'UPSTREAM_TIMEOUT') return '请求超时，请稍后再试';
  return c.length > 160 ? `${c.slice(0, 160)}…` : c;
};

const openResult = (args: { title: string; url?: string; error?: string }) => {
  resultTitle.value = args.title;
  resultUrl.value = String(args.url || '').trim();
  resultError.value = String(args.error || '').trim();
  resultVisible.value = true;
};

const closeResult = () => {
  resultVisible.value = false;
  resultUrl.value = '';
  resultError.value = '';
  resultTitle.value = '';
  resultLoading.value = false;
  activeRequestId.value = '';
};

const extFromMime = (mime: string) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
};

const fetchImageBlob = async (url: string): Promise<Blob | null> => {
  try {
    const u = String(url || '').trim();
    if (!u) return null;
    const res = await fetch(u);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (
      !String(blob.type || '')
        .toLowerCase()
        .startsWith('image/')
    )
      return null;
    return blob;
  } catch {
    return null;
  }
};

const downloadResult = async () => {
  const url = String(resultUrl.value || '').trim();
  if (!url) return;
  const blob = await fetchImageBlob(url);
  if (blob) {
    const ext = extFromMime(blob.type);
    downloadBlob(blob, `artigen_${Date.now().toString(36)}.${ext}`);
    return;
  }
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'image';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {}
  }
};

const buildIdPhotoPrompt = (type: string) => {
  const base = [
    'Create a high-quality realistic ID photo portrait from the reference photo.',
    'Keep the same person identity and facial features; do not beautify excessively.',
    'Front-facing, neutral expression, eyes open, clean skin texture, natural color.',
    'Even soft lighting, sharp focus, no motion blur.',
    'Plain light gray background, no patterns, no objects.',
    'Head and shoulders framing, centered composition.'
  ].join(' ');

  const styleByType: Record<string, string> = {
    finance: 'Formal, trustworthy corporate look; subtle contrast; conservative styling.',
    tech: 'Modern, confident startup founder look; clean minimal aesthetic.',
    scholar: 'Warm, intelligent academic look; gentle lighting; calm demeanor.',
    creative: 'Distinct but professional creative look; tasteful color tone; not exaggerated.',
    leader: 'Executive leader look; strong presence; premium lighting; classic elegance.'
  };
  const extra = styleByType[String(type || '').trim()] || styleByType.finance;
  return `${base} ${extra}`;
};

const buildOldPhotoPrompt = (opts: { colorize: boolean; denoise: boolean }) => {
  const base = [
    'Restore and enhance the old photo from the reference image.',
    'Keep identity and original composition; do not change face shape.',
    'Remove scratches, stains, dust, and crease marks.',
    'Increase clarity and details naturally; avoid over-sharpening.',
    'Reduce noise and blur; preserve realistic textures.'
  ].join(' ');
  const color = opts.colorize
    ? 'If the photo is black-and-white, colorize it with natural, historically plausible skin tones and clothing colors.'
    : 'Keep original colors; do not colorize.';
  const denoise = opts.denoise ? 'Strong denoise and deblur.' : 'Light denoise.';
  return `${base} ${denoise} ${color}`;
};

const NEGATIVE = [
  'nsfw',
  'nudity',
  'gore',
  'violence',
  'lowres',
  'bad anatomy',
  'blurry',
  'watermark',
  'signature',
  'text',
  'cartoon',
  'anime',
  'oversaturated',
  'over-smoothed skin',
  'distorted face'
].join(', ');

const runImg2Img = async (args: {
  title: string;
  prompt: string;
  file: File;
  userText: string;
  reason: 'ai_design' | 'id_photo' | 'old_photo' | 'ai_background' | 'img2img';
}) => {
  const requestId = `imgwork_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  activeRequestId.value = requestId;
  resultLoading.value = true;
  openResult({ title: args.title });
  consoleStore.recordTraffic({
    type: 'conversion',
    page: '/artigen/image-workshop',
    target: args.userText
  });
  trackEvent('ImageWorkshop', 'generate_start', args.userText);
  const input = await fileToGenerateInput(args.file);
  if (!input) {
    if (activeRequestId.value !== requestId) return;
    resultLoading.value = false;
    openResult({ title: args.title, error: ui.value.fileReadFailed });
    consoleStore.recordTraffic({
      type: 'generate_fail',
      page: '/artigen/image-workshop',
      target: 'FILE_READ_FAILED'
    });
    trackEvent('ImageWorkshop', 'generate_fail', 'FILE_READ_FAILED');
    return;
  }

  const res = await img2img({
    prompt: args.prompt,
    userText: args.userText,
    negativePrompt: NEGATIVE,
    images: [input],
    timeoutMs: 120000,
    requestId,
    reason: args.reason,
    requestSource: 'image_workshop'
  });
  if (!res.ok) {
    if (activeRequestId.value !== requestId) return;
    const msg = humanizeError(res.errorCode || res.error);
    resultLoading.value = false;
    openResult({ title: args.title, error: msg });
    consoleStore.recordTraffic({
      type: 'generate_fail',
      page: '/artigen/image-workshop',
      target: String(res.errorCode || res.error || 'UNKNOWN')
    });
    trackEvent('ImageWorkshop', 'generate_fail', String(res.errorCode || res.error || 'UNKNOWN'));
    return;
  }
  const url = String(res.images?.[0]?.url || '').trim();
  if (!url) {
    if (activeRequestId.value !== requestId) return;
    resultLoading.value = false;
    openResult({ title: args.title, error: humanizeError('EMPTY_IMAGE_RESULT') });
    consoleStore.recordTraffic({
      type: 'generate_fail',
      page: '/artigen/image-workshop',
      target: 'EMPTY_IMAGE_RESULT'
    });
    trackEvent('ImageWorkshop', 'generate_fail', 'EMPTY_IMAGE_RESULT');
    return;
  }
  if (activeRequestId.value !== requestId) return;
  resultLoading.value = false;
  openResult({ title: args.title, url });
  consoleStore.recordTraffic({
    type: 'generate_success',
    page: '/artigen/image-workshop',
    target: args.userText
  });
  trackEvent('ImageWorkshop', 'generate_success', args.userText);
};

const handleGenerateIdPhoto = async (file: File, type: string) => {
  isIdPhotoPopupOpen.value = false;
  const prompt = buildIdPhotoPrompt(type);
  await runImg2Img({
    title: ui.value.toolIdTitle,
    prompt,
    file,
    userText: `id_photo:${String(type || '').trim() || 'finance'}`,
    reason: 'id_photo'
  });
};

const buildAiBackgroundPrompt = (args: { mode: 'replace' | 'add'; background: string }) => {
  const base = [
    'Edit the reference photo to produce a high-quality realistic result.',
    'Preserve the subject identity, shape, logo/text, and fine details.',
    'Keep edges clean and natural; keep lighting and shadows consistent.',
    'Do not add any text, watermark, or extra objects on the subject.',
    'Photorealistic, sharp focus, natural colors.'
  ].join(' ');
  const modeText =
    args.mode === 'add'
      ? 'Add a complementary background scene and atmosphere consistent with the style description, while keeping the subject unchanged and clearly separated.'
      : 'Replace the original background completely with the style description, while keeping the subject unchanged and clearly separated.';
  const bg = String(args.background || '').trim();
  return `${base} ${modeText} Style description: ${bg}`;
};

const handleGenerateAiBackground = async (
  file: File,
  args: {
    mode: 'replace' | 'add';
    background: string;
    presetId: string;
    presetSrc: string;
    presetW: number;
    presetH: number;
    localResultUrl?: string;
    subjectScale?: number;
    subjectOffset?: { x: number; y: number };
  }
) => {
  isAiBackgroundPopupOpen.value = false;
  const mode = args?.mode === 'add' ? 'add' : 'replace';
  const presetId = String(args?.presetId || '').trim();
  const localResultUrl = String(args?.localResultUrl || '').trim();

  if (localResultUrl) {
    resultLoading.value = false;
    openResult({ title: ui.value.toolBgTitle, url: localResultUrl });
    consoleStore.recordTraffic({
      type: 'generate_success',
      page: '/artigen/image-workshop',
      target: `ai_background_local:${presetId || 'preset'}`
    });
    trackEvent('ImageWorkshop', 'generate_success', `ai_background_local:${presetId || 'preset'}`);
    return;
  }

  const prompt = buildAiBackgroundPrompt({
    mode,
    background: String(args?.background || '').trim()
  });
  await runImg2Img({
    title: ui.value.toolBgTitle,
    prompt,
    file,
    userText: `ai_background:${mode}:${presetId || 'preset'}`,
    reason: 'ai_background'
  });
};

const handleRestoreOldPhoto = async (file: File, options: any) => {
  isOldPhotoPopupOpen.value = false;
  const uid = String(getCurrentUserId() || '').trim();
  const token = String(getAuthToken() || '').trim();
  const authed = !!uid && !uid.startsWith('guest_') && !!token && isLocalLoggedIn();
  if (!authed) {
    openResult({ title: ui.value.toolOldTitle, error: ui.value.loginRequired });
    consoleStore.recordTraffic({
      type: 'click',
      page: '/artigen/image-workshop',
      target: 'old_photo_login_required'
    });
    trackEvent('ImageWorkshop', 'login_required', 'old_photo');
    return;
  }
  const opts = {
    colorize: !!options?.colorize,
    denoise: !!options?.denoise
  };
  const prompt = buildOldPhotoPrompt(opts);
  await runImg2Img({
    title: ui.value.toolOldTitle,
    prompt,
    file,
    userText: `old_photo:${opts.colorize ? 'colorize' : 'no_colorize'}:${opts.denoise ? 'denoise' : 'basic'}`,
    reason: 'old_photo'
  });
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;700;900&display=swap');
@import '../styles/cyberpunk.css';

.image-workshop-page {
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: 'Inter', sans-serif;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding: 80px 40px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  position: relative;
  z-index: 1;
}

.page-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  row-gap: 20px;
  margin-bottom: 60px;
  align-items: start;
}

.badge-row {
  grid-column: 1;
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 10px;
}

.badge-dot {
  width: 8px;
  height: 8px;
  background: #ccff00;
  border-radius: 50%;
  box-shadow: 0 0 8px #ccff00;
}

.badge-text {
  color: #ccff00;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
}

.title-stack {
  grid-column: 1 / -1;
  justify-self: center;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.page-title {
  font-size: 64px;
  font-weight: 900;
  margin: 0;
  letter-spacing: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}

.title-text-group {
  white-space: nowrap;
}

.badges-group {
  display: inline-flex;
  align-items: center;
}

.highlight {
  color: #ccff00;
}

.real-beta-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  color: #ff9900;
  font-weight: 700;
  margin-left: 2px;
  margin-right: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.9;
}

.beta-badge {
  font-size: 14px;
  background: rgba(147, 51, 234, 0.2);
  border: 1px solid rgba(147, 51, 234, 0.5);
  color: #e9d5ff;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: normal;
  letter-spacing: 0;
  vertical-align: middle;
}

.page-desc {
  color: #94a3b8;
  font-size: 18px;
  margin: 0;
  max-width: 860px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 40px;
  padding: 0 40px;
  position: relative;
  z-index: 100;
}

.disabled {
  opacity: 0.8;
}

.result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-container {
  width: 920px;
  max-width: 95vw;
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.result-title {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
}

.result-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-loading {
  width: 100%;
  height: 520px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.loading-spinner {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 3px solid rgba(255, 255, 255, 0.16);
  border-top-color: rgba(204, 255, 0, 0.95);
  animation: spin 0.9s linear infinite;
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.18);
}

.loading-text {
  font-size: 13px;
  color: rgba(226, 232, 240, 0.75);
  font-weight: 700;
}

.result-error {
  color: #ff6b6b;
  font-size: 14px;
  line-height: 1.5;
}

.result-image-wrap {
  width: 100%;
  height: 520px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.result-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.result-btn {
  appearance: none;
  border: 1px solid rgba(204, 255, 0, 0.6);
  background: rgba(204, 255, 0, 0.14);
  color: #ccff00;
  padding: 10px 14px;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.result-btn.secondary {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #ddd;
}

.result-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .page-title {
    font-size: 26px;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    white-space: normal;
  }

  .tools-grid {
    grid-template-columns: 1fr;
    padding: 0;
    gap: 20px;
  }

  .main-content {
    padding: 40px 20px;
  }
}

@media (max-width: 350px) {
  .page-title {
    font-size: 22px;
  }
  .tools-grid {
    gap: 12px;
    padding: 0 12px;
  }

  :deep(.tool-card) {
    padding: 20px !important;
    min-height: auto !important;
  }

  :deep(.tool-title) {
    font-size: 20px !important;
  }

  :deep(.tool-icon) {
    font-size: 32px !important;
    padding: 6px 12px !important;
  }

  :deep(.tool-desc) {
    font-size: 13px !important;
  }
}
</style>
