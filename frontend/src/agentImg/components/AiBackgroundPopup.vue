<template>
  <transition name="fade">
    <div v-if="visible" class="modal-overlay" @click.self="close">
      <section
        ref="dialogRef"
        class="modal-container"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="step === 'start' ? 'ai-background-start-title' : 'ai-background-editor-title'"
        tabindex="-1"
        @keydown="onDialogKeydown"
      >
        <CloseButton @click="close" />

        <div class="layout">
          <aside class="bg-sidebar">
            <div class="sidebar-title">{{ ui.sidebarTitle }}</div>
            <div class="sidebar-scroll">
              <div v-for="g in groupedPresets" :key="g.key" class="bg-group">
                <div class="group-title">{{ g.label }}</div>
                <div class="bg-grid">
                  <button
                    v-for="p in g.items"
                    :key="p.id"
                    type="button"
                    class="bg-card"
                    :class="{ active: selectedPresetId === p.id }"
                    :aria-pressed="selectedPresetId === p.id"
                    @click="selectPreset(p.id)"
                  >
                    <img class="bg-thumb" :src="p.src" :alt="p.title" />
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <section class="main-panel">
            <div v-if="step === 'start'" class="start-panel">
              <h2 id="ai-background-start-title" class="start-title">{{ ui.startTitle }}</h2>
              <div class="start-desc">{{ ui.startDesc }}</div>
              <div class="start-tips">
                <div v-for="(t, idx) in ui.tips" :key="idx" class="tip-item">{{ t }}</div>
              </div>

              <div class="start-controls">
                <div class="mode-toggle" role="group" :aria-label="ui.modeLabel">
                  <div
                    class="mode-pill"
                    :style="{
                      transform: bgMode === 'replace' ? 'translateX(0)' : 'translateX(100%)'
                    }"
                  ></div>
                  <button
                    class="mode-btn"
                    type="button"
                    :class="{ active: bgMode === 'replace' }"
                    :aria-pressed="bgMode === 'replace'"
                    @click="bgMode = 'replace'"
                  >
                    {{ ui.modeReplace }}
                  </button>
                  <button
                    class="mode-btn"
                    type="button"
                    :class="{ active: bgMode === 'add' }"
                    :aria-pressed="bgMode === 'add'"
                    @click="bgMode = 'add'"
                  >
                    {{ ui.modeAdd }}
                  </button>
                </div>
              </div>

              <div
                class="dropzone"
                :class="{ 'drag-over': isDragOver }"
                @click="triggerFileSelect"
                @dragover.prevent="isDragOver = true"
                @dragleave.prevent="isDragOver = false"
                @drop.prevent="onDrop"
              >
                <div class="dropzone-title">{{ ui.dropTitle }}</div>
                <div class="dropzone-sub">{{ ui.dropSub }}</div>
                <button class="upload-btn" type="button" @click.stop="triggerFileSelect">
                  {{ ui.uploadBtn }}
                </button>
              </div>
            </div>

            <div v-else class="editor-panel">
              <div class="editor-topbar">
                <h2 id="ai-background-editor-title" class="editor-title">{{ ui.editorTitle }}</h2>
                <div class="editor-tools">
                  <div class="mode-toggle" role="group" :aria-label="ui.modeLabel">
                    <div
                      class="mode-pill"
                      :style="{
                        transform: bgMode === 'replace' ? 'translateX(0)' : 'translateX(100%)'
                      }"
                    ></div>
                    <button
                      class="mode-btn"
                      type="button"
                      :class="{ active: bgMode === 'replace' }"
                      :aria-pressed="bgMode === 'replace'"
                      @click="bgMode = 'replace'"
                    >
                      {{ ui.modeReplace }}
                    </button>
                    <button
                      class="mode-btn"
                      type="button"
                      :class="{ active: bgMode === 'add' }"
                      :aria-pressed="bgMode === 'add'"
                      @click="bgMode = 'add'"
                    >
                      {{ ui.modeAdd }}
                    </button>
                  </div>
                  <button class="tool-btn" type="button" @click="resetTransform">
                    {{ ui.reset }}
                  </button>
                  <div class="zoom-row">
                    <label class="zoom-label" for="ai-background-zoom">{{ ui.zoom }}</label>
                    <input
                      id="ai-background-zoom"
                      class="zoom-slider"
                      type="range"
                      min="0.6"
                      max="1.6"
                      step="0.02"
                      v-model="subjectScale"
                      @input="hasInteracted = true"
                    />
                  </div>
                  <button class="reupload-btn" type="button" @click="triggerFileSelect">
                    {{ ui.reupload }}
                  </button>
                </div>
              </div>

              <div class="editor-stage">
                <div
                  ref="stageRef"
                  class="checkerboard"
                  :class="{ dragging: dragState.active }"
                  role="group"
                  tabindex="0"
                  :aria-label="ui.stageLabel"
                  @pointerdown="onStagePointerDown"
                  @pointermove="onStagePointerMove"
                  @pointerup="onStagePointerUp"
                  @pointercancel="onStagePointerUp"
                  @wheel.prevent="onStageWheel"
                  @dblclick="resetTransform"
                  @keydown="onStageKeyboard"
                >
                  <div class="cutout-layer">
                    <img
                      v-if="cutoutUrl"
                      class="cutout-img"
                      :src="cutoutUrl"
                      :alt="ui.subjectPreview"
                      :style="cutoutStyle"
                    />
                    <img
                      v-else
                      class="cutout-img"
                      :src="previewUrl"
                      :alt="ui.subjectPreview"
                      :style="cutoutStyle"
                    />
                  </div>
                  <div v-if="!hasInteracted" class="stage-hint">
                    {{ ui.helperHint }}
                  </div>
                </div>

                <div v-if="processing" class="processing-mask" role="status" aria-live="polite">
                  <div class="processing-card">
                    <div class="spinner" aria-hidden="true"></div>
                    <div class="processing-text">{{ ui.processing }}</div>
                  </div>
                </div>
              </div>

              <div v-if="cutoutFailed" class="cutout-error" role="alert">
                {{ ui.localFailed }}
              </div>

              <div class="editor-actions">
                <label v-if="bgMode === 'add'" class="upload-consent" :class="{ disabled: quoteLoading || !!quoteError }">
                  <input v-model="uploadConsent" type="checkbox" :disabled="quoteLoading || !!quoteError" />
                  <span>{{ consentText }}</span>
                </label>
                <p v-if="bgMode === 'add' && quoteLoading" class="quote-status" role="status">
                  {{ ui.quoteLoading }}
                </p>
                <p v-else-if="bgMode === 'add' && quoteError" class="quote-status error" role="alert">
                  {{ quoteErrorText }}
                </p>
                <button
                  class="add-btn"
                  type="button"
                  :disabled="!selectedFile || processing || loading || (bgMode === 'add' && (quoteLoading || !!quoteError || !uploadConsent))"
                  @click="handleAdd"
                >
                  <span>{{ loading ? ui.adding : ui.add }}</span>
                  <span v-if="!loading && costText" class="add-cost">
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      stroke="currentColor"
                      stroke-width="2"
                      fill="none"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      style="margin-right: 1px; position: relative; top: 1px"
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                    {{ costText }}
                  </span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <input
          ref="fileInput"
          class="hidden-input"
          type="file"
          accept="image/*"
          @change="onFileSelect"
        />
      </section>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { trackEvent } from '../../utils/analytics';
import { useLanguageStore } from '@/stores/language';
import {
  AiBackgroundCutoutWorkerClient,
  CutoutCancelledError
} from '../logic/aiBackground/AiBackgroundCutoutWorkerClient';
import { enforceLocalBackgroundPolicy } from '../logic/aiBackground/backgroundWorkflow';
import CloseButton from './CloseButton.vue';

const props = defineProps<{
  visible: boolean;
  creditsCost?: number;
  quoteLoading?: boolean;
  quoteError?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (
    e: 'generate',
    file: File,
    args: {
      mode: 'replace' | 'add';
      presetId: string;
      presetSrc: string;
      presetW: number;
      presetH: number;
      localResultUrl?: string;
      subjectScale?: number;
      subjectOffset?: { x: number; y: number };
    }
  ): void;
}>();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string>('');
const loading = ref(false);
const uploadConsent = ref(false);
const previewObjectUrl = ref<string>('');
const step = ref<'start' | 'edit'>('start');
const processing = ref(false);
const cutoutUrl = ref('');
const cutoutFailed = ref(false);
const stageRef = ref<HTMLDivElement | null>(null);
const subjectScale = ref(1);
const subjectOffset = ref({ x: 0, y: 0 });
const bgMode = ref<'replace' | 'add'>('replace');
const hasInteracted = ref(false);
const dragState = ref<{
  active: boolean;
  mode: 'none' | 'pan' | 'pinch';
  px: number;
  py: number;
  dist: number;
  mx: number;
  my: number;
}>({
  active: false,
  mode: 'none',
  px: 0,
  py: 0,
  dist: 0,
  mx: 0,
  my: 0
});
let pointerCache = new Map<number, { x: number; y: number }>();
let returnFocus: HTMLElement | null = null;
let sourceRevision = 0;
const cutoutClient = new AiBackgroundCutoutWorkerClient();

type BgCategory = 'ecommerce' | 'daily' | 'portrait' | 'landscape';
type BgPreset = {
  id: string;
  category: BgCategory;
  src: string;
  size: { w: number; h: number };
  title: { zh: string; en: string };
  prompt: { zh: string; en: string };
};

const PRESETS: BgPreset[] = [
  {
    id: 'studio-white',
    category: 'ecommerce',
    src: '/backgrounds/ai-bg/studio-white.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '纯白摄影棚', en: 'White studio' },
    prompt: {
      zh: '纯白摄影棚背景，柔和自然阴影，干净无杂物',
      en: 'white studio background, soft natural shadow, clean minimal scene'
    }
  },
  {
    id: 'studio-dark',
    category: 'ecommerce',
    src: '/backgrounds/ai-bg/studio-dark.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '暗色摄影棚', en: 'Dark studio' },
    prompt: {
      zh: '暗色摄影棚背景，边缘柔和轮廓光，干净高级',
      en: 'dark studio background, subtle rim light, premium minimal scene'
    }
  },
  {
    id: 'tabletop-wood',
    category: 'ecommerce',
    src: '/backgrounds/ai-bg/tabletop-wood.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '木质桌面', en: 'Wood tabletop' },
    prompt: {
      zh: '木质桌面陈列场景，背景浅色墙面，柔和自然光',
      en: 'wood tabletop scene, light wall background, soft natural light'
    }
  },
  {
    id: 'indoor-sunlight-shadow',
    category: 'ecommerce',
    src: '/backgrounds/ai-bg/indoor-sunlight-shadow.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '窗边光影', en: 'Sunlight window' },
    prompt: {
      zh: '窗边光影背景，干净台面，自然树影，高级感',
      en: 'sunlit window background, clean surface, natural tree shadow, premium'
    }
  },
  {
    id: 'indoor-wood-counter',
    category: 'ecommerce',
    src: '/backgrounds/ai-bg/indoor-wood-counter.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '木质吧台', en: 'Wood counter' },
    prompt: {
      zh: '木质台面背景，浅色瓷砖墙，柔和自然光',
      en: 'wood counter background, light tile wall, soft natural light'
    }
  },
  {
    id: 'nature-podium-cloud',
    category: 'ecommerce',
    src: '/backgrounds/ai-bg/nature-podium-cloud.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '云端展台', en: 'Cloud podium' },
    prompt: {
      zh: '天空云端展台，纯净蓝色背景，漂浮感',
      en: 'sky cloud podium, pure blue background, floating feel'
    }
  },
  {
    id: 'cafe',
    category: 'daily',
    src: '/backgrounds/ai-bg/cafe.svg',
    size: { w: 1280, h: 720 },
    title: { zh: '咖啡馆', en: 'Cafe' },
    prompt: {
      zh: '温暖咖啡馆背景，柔和窗光，浅景深氛围',
      en: 'warm cafe background, soft window light, shallow depth of field'
    }
  },
  {
    id: 'indoor-table-plant',
    category: 'daily',
    src: '/backgrounds/ai-bg/indoor-table-plant.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '居家圆桌', en: 'Living room table' },
    prompt: {
      zh: '居家圆桌背景，前景植物虚化，温馨光感',
      en: 'living room round table, foreground plant blur, warm lighting'
    }
  },
  {
    id: 'neon-city',
    category: 'portrait',
    src: '/backgrounds/ai-bg/neon-city.svg',
    size: { w: 1024, h: 1024 },
    title: { zh: '霓虹城市夜景', en: 'Neon city night' },
    prompt: {
      zh: '霓虹城市夜景背景，电影感光影，轻微散景',
      en: 'neon city night background, cinematic lighting, slight bokeh'
    }
  },
  {
    id: 'ocean',
    category: 'landscape',
    src: '/backgrounds/ai-bg/ocean.svg',
    size: { w: 1280, h: 720 },
    title: { zh: '海边日落', en: 'Ocean sunset' },
    prompt: {
      zh: '海边日落背景，柔和金色光线，清透氛围',
      en: 'ocean sunset background, soft golden light, clean airy atmosphere'
    }
  },
  {
    id: 'mountains',
    category: 'landscape',
    src: '/backgrounds/ai-bg/mountains.svg',
    size: { w: 1280, h: 720 },
    title: { zh: '群山薄雾', en: 'Misty mountains' },
    prompt: {
      zh: '群山薄雾背景，冷色调，层次清晰，电影感',
      en: 'misty mountains background, cool tone, layered depth, cinematic'
    }
  },
  {
    id: 'forest',
    category: 'landscape',
    src: '/backgrounds/ai-bg/forest.svg',
    size: { w: 1280, h: 720 },
    title: { zh: '森林光斑', en: 'Forest light' },
    prompt: {
      zh: '森林背景，光斑与体积光，清新自然',
      en: 'forest background, dappled light, volumetric rays, fresh natural mood'
    }
  },
  {
    id: 'nature-water-surface',
    category: 'landscape',
    src: '/backgrounds/ai-bg/nature-water-surface.svg',
    size: { w: 1280, h: 720 },
    title: { zh: '清透水面', en: 'Water ripple' },
    prompt: {
      zh: '清透蓝色水面背景，波纹光斑，清新自然',
      en: 'clear blue water surface, ripples and caustics, fresh natural'
    }
  },
  {
    id: 'nature-beach-soft',
    category: 'landscape',
    src: '/backgrounds/ai-bg/nature-beach-soft.svg',
    size: { w: 1280, h: 720 },
    title: { zh: '柔和沙滩', en: 'Soft beach' },
    prompt: {
      zh: '柔和沙滩海景，梦幻光感，浅景深',
      en: 'soft beach seascape, dreamy lighting, shallow depth of field'
    }
  }
];

const resolvePublicSrc = (src: string) => {
  const s = String(src || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
  const baseUrlRaw = String(import.meta.env.BASE_URL || '/');
  const baseUrl = baseUrlRaw.endsWith('/') ? baseUrlRaw : `${baseUrlRaw}/`;
  const p = s.startsWith('/') ? s.slice(1) : s;
  return `${baseUrl}${p}`;
};

const selectedPresetId = ref(PRESETS[0]?.id || '');

const selectedPreset = computed(
  () => PRESETS.find((p) => p.id === selectedPresetId.value) || PRESETS[0]
);

const groupedPresets = computed(() => {
  const en = currentLang.value === 'en';
  const labelByCat: Record<BgCategory, string> = {
    ecommerce: en ? 'E-commerce' : '电商',
    daily: en ? 'Daily' : '日常',
    portrait: en ? 'Portrait' : '人物',
    landscape: en ? 'Landscape' : '风景'
  };
  const order: BgCategory[] = ['ecommerce', 'daily', 'portrait', 'landscape'];
  return order.map((cat) => ({
    key: cat,
    label: labelByCat[cat],
    items: PRESETS.filter((p) => p.category === cat).map((p) => ({
      id: p.id,
      src: resolvePublicSrc(p.src),
      title: en ? p.title.en : p.title.zh
    }))
  }));
});

const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    sidebarTitle: en ? 'Select Background Styles' : '选择背景风格',
    startTitle: en ? 'Get Started with AI Product Photography Now' : '立即开始生成商品场景图',
    startDesc: en
      ? 'Pick a background style on the left, then upload your product photo.'
      : '左侧选择背景风格，然后上传你的商品图。',
    tips: en
      ? [
          'We detect the foreground locally to remove the original background.',
          'Choose Replace/Add, then apply the selected style.'
        ]
      : ['上传后会在本地识别主体并扣掉背景。', '选择「替换/添加」后，一键生成对应背景。'],
    dropTitle: en ? 'Drag and drop your image here' : '拖拽图片到这里',
    dropSub: en ? 'or click to upload' : '或点击上传',
    uploadBtn: en ? 'Upload your product image' : '上传商品图片',
    editorTitle: en ? 'Preview (background removed)' : '预览（已去背景）',
    modeReplace: en ? 'Replace' : '替换',
    modeAdd: en ? 'Add' : '添加',
    modeLabel: en ? 'Background processing mode' : '背景处理模式',
    reset: en ? 'Reset' : '重置',
    zoom: en ? 'Zoom' : '缩放',
    reupload: en ? 'Re-upload' : '重新上传',
    processing: en ? 'Detecting subject…' : '识别主体中…',
    localFailed: en
      ? 'Local background processing failed. Try another image or retry. No cloud request was sent.'
      : '本地背景处理失败，请更换图片或重试。本次未发送云端请求。',
    selectedBg: en ? 'Selected background' : '已选背景',
    helperHint: en ? 'Drag to move. Pinch or wheel to zoom.' : '拖拽移动，双指或滚轮缩放',
    stageLabel: en
      ? 'Subject positioning canvas. Use arrow keys to move, plus or minus to zoom, and Home to reset.'
      : '主体定位画布。方向键移动，加减键缩放，Home 键重置。',
    subjectPreview: en ? 'Subject preview' : '主体预览',
    add: en
      ? bgMode.value === 'add'
        ? 'Generate'
        : 'Apply'
      : bgMode.value === 'add'
        ? '生成'
        : '添加',
    adding: en ? 'Processing…' : '处理中…',
    quoteLoading: en ? 'Loading the server quote…' : '正在读取服务端报价…',
    loginRequired: en ? 'Sign in before requesting a quote.' : '请先登录后获取报价。',
    paidUnavailable: en ? 'AI scene generation is currently unavailable.' : 'AI 场景生成当前不可用。'
  };
});

const costText = computed(() => {
  if (bgMode.value === 'replace') return '';
  const n = Math.max(0, Math.trunc(Number(props.creditsCost ?? 0) || 0));
  if (!n) return '';
  return `${n}`;
});

const consentText = computed(() => {
  const credits = costText.value || '?';
  return currentLang.value === 'en'
    ? `I agree to upload this image for AI scene generation (retained up to 24 hours) and reserve ${credits} credits. Failed or cancelled tasks are refunded.`
    : `我同意上传此图片生成 AI 场景（最长保留 24 小时），并预占 ${credits} 点数；失败或取消会退款。`;
});

const quoteErrorText = computed(() => {
  if (props.quoteError === 'LOGIN_REQUIRED') return ui.value.loginRequired;
  return ui.value.paidUnavailable;
});

const close = () => {
  sourceRevision += 1;
  cutoutClient.cancelCurrent('AI_BACKGROUND_POPUP_CLOSED');
  processing.value = false;
  emit('close');
};

let prevBodyOverflow = '';
let prevBodyPaddingRight = '';
let prevHtmlOverflow = '';
let scrollLocked = false;

const lockScroll = () => {
  if (scrollLocked) return;
  try {
    prevBodyOverflow = document.body.style.overflow;
    prevBodyPaddingRight = document.body.style.paddingRight;
    prevHtmlOverflow = document.documentElement.style.overflow;
    const scrollbarW = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = scrollbarW ? `${scrollbarW}px` : prevBodyPaddingRight;
    scrollLocked = true;
  } catch {}
};

const unlockScroll = () => {
  if (!scrollLocked) return;
  try {
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
    document.body.style.paddingRight = prevBodyPaddingRight;
  } catch {}
  scrollLocked = false;
};

const resetState = () => {
  sourceRevision += 1;
  cutoutClient.cancelCurrent('AI_BACKGROUND_SOURCE_RESET');
  try {
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  } catch {}
  previewObjectUrl.value = '';
  previewUrl.value = '';
  selectedFile.value = null;
  loading.value = false;
  uploadConsent.value = false;
  isDragOver.value = false;
  selectedPresetId.value = 'studio-white';
  step.value = 'start';
  processing.value = false;
  try {
    if (cutoutUrl.value) URL.revokeObjectURL(cutoutUrl.value);
  } catch {}
  cutoutUrl.value = '';
  cutoutFailed.value = false;
  subjectScale.value = 1;
  subjectOffset.value = { x: 0, y: 0 };
  bgMode.value = 'replace';
  hasInteracted.value = false;
  dragState.value = { active: false, mode: 'none', px: 0, py: 0, dist: 0, mx: 0, my: 0 };
  pointerCache = new Map();
  try {
    if (fileInput.value) fileInput.value.value = '';
  } catch {}
};

watch(bgMode, (mode) => {
  if (mode !== 'add') uploadConsent.value = false;
});

watch(
  () => !!props.visible,
  async (v) => {
    if (v) {
      returnFocus = globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;
      resetState();
      lockScroll();
      await nextTick();
      dialogRef.value?.focus();
      return;
    }
    unlockScroll();
    resetState();
    returnFocus?.focus();
    returnFocus = null;
  },
  { immediate: true }
);

onUnmounted(() => {
  sourceRevision += 1;
  cutoutClient.dispose();
  unlockScroll();
  returnFocus?.focus();
  returnFocus = null;
});

const onDialogKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) {
    event.preventDefault();
    dialogRef.value.focus();
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

const triggerFileSelect = () => {
  fileInput.value?.click();
};

const loadImage = async (src: string) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    await img.decode();
    return img;
  } catch {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    });
  }
};

const composeLocal = async (
  cutoutDataUrl: string,
  options: {
    preset: BgPreset;
    presetSrc: string;
    scale: number;
    offset: { x: number; y: number };
  }
) => {
  const bgUrl = options.presetSrc;
  const bgImg = await loadImage(bgUrl);
  const fgImg = await loadImage(cutoutDataUrl);

  const targetW = Math.max(1, Math.trunc(Number(options.preset.size.w) || 1024));
  const targetH = Math.max(1, Math.trunc(Number(options.preset.size.h) || 1024));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const bgScale = Math.max(
    targetW / (bgImg.naturalWidth || bgImg.width || 1),
    targetH / (bgImg.naturalHeight || bgImg.height || 1)
  );
  const bgW = Math.round((bgImg.naturalWidth || bgImg.width || 1) * bgScale);
  const bgH = Math.round((bgImg.naturalHeight || bgImg.height || 1) * bgScale);
  const bgX = Math.round((targetW - bgW) / 2);
  const bgY = Math.round((targetH - bgH) / 2);
  ctx.drawImage(bgImg, bgX, bgY, bgW, bgH);

  const fgW = Math.max(1, Math.round(fgImg.naturalWidth || fgImg.width || 1));
  const fgH = Math.max(1, Math.round(fgImg.naturalHeight || fgImg.height || 1));
  const maxSubjectW = Math.round(targetW * 0.86);
  const maxSubjectH = Math.round(targetH * 0.86);
  const fgScale =
    Math.min(maxSubjectW / fgW, maxSubjectH / fgH) *
    Math.max(0.6, Math.min(1.6, Number(options.scale) || 1));
  const drawW = Math.max(1, Math.round(fgW * fgScale));
  const drawH = Math.max(1, Math.round(fgH * fgScale));
  const ox = Math.max(-0.5, Math.min(0.5, Number(options.offset.x) || 0));
  const oy = Math.max(-0.5, Math.min(0.5, Number(options.offset.y) || 0));
  const dx = Math.round((targetW - drawW) / 2 + ox * targetW);
  const dy = Math.round((targetH - drawH) / 2 + oy * targetH);
  ctx.drawImage(fgImg, dx, dy, drawW, drawH);

  return canvas.toDataURL('image/png');
};

const cutoutStyle = computed(() => {
  const s = Math.max(0.6, Math.min(1.6, Number(subjectScale.value) || 1));
  const ox = Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.x) || 0));
  const oy = Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.y) || 0));
  return {
    transform: `translate(-50%, -50%) translate(${(ox * 100).toFixed(2)}%, ${(oy * 100).toFixed(2)}%) scale(${s})`
  };
});

const resetTransform = () => {
  subjectScale.value = 1;
  subjectOffset.value = { x: 0, y: 0 };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const applyPan = (dx: number, dy: number, rect: DOMRect) => {
  const nx = dx / Math.max(1, rect.width);
  const ny = dy / Math.max(1, rect.height);
  subjectOffset.value = {
    x: clamp(subjectOffset.value.x + nx, -0.5, 0.5),
    y: clamp(subjectOffset.value.y + ny, -0.5, 0.5)
  };
};

const syncPinchState = () => {
  const pts = Array.from(pointerCache.values());
  if (pts.length < 2) return;
  const a = pts[0];
  const b = pts[1];
  const dx = (b?.x || 0) - (a?.x || 0);
  const dy = (b?.y || 0) - (a?.y || 0);
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const mx = ((a?.x || 0) + (b?.x || 0)) / 2;
  const my = ((a?.y || 0) + (b?.y || 0)) / 2;
  dragState.value = { active: true, mode: 'pinch', px: 0, py: 0, dist, mx, my };
};

const onStagePointerDown = (e: PointerEvent) => {
  const el = stageRef.value;
  if (!el) return;
  hasInteracted.value = true;
  pointerCache.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try {
    el.setPointerCapture(e.pointerId);
  } catch {}
  if (pointerCache.size >= 2) {
    syncPinchState();
    return;
  }
  dragState.value = {
    active: true,
    mode: 'pan',
    px: e.clientX,
    py: e.clientY,
    dist: 0,
    mx: 0,
    my: 0
  };
};

const onStagePointerMove = (e: PointerEvent) => {
  const el = stageRef.value;
  if (!el) return;
  if (!pointerCache.has(e.pointerId)) return;
  if (!dragState.value.active) return;
  pointerCache.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const rect = el.getBoundingClientRect();

  if (pointerCache.size < 2) {
    if (dragState.value.mode !== 'pan') {
      dragState.value = {
        active: true,
        mode: 'pan',
        px: e.clientX,
        py: e.clientY,
        dist: 0,
        mx: 0,
        my: 0
      };
      return;
    }
    const dx = e.clientX - dragState.value.px;
    const dy = e.clientY - dragState.value.py;
    dragState.value.px = e.clientX;
    dragState.value.py = e.clientY;
    applyPan(dx, dy, rect);
    return;
  }

  const pts = Array.from(pointerCache.values());
  const a = pts[0];
  const b = pts[1];
  const dx = (b?.x || 0) - (a?.x || 0);
  const dy = (b?.y || 0) - (a?.y || 0);
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const mx = ((a?.x || 0) + (b?.x || 0)) / 2;
  const my = ((a?.y || 0) + (b?.y || 0)) / 2;

  const scaleRatio = dist / Math.max(1, dragState.value.dist || dist);
  subjectScale.value = clamp(Number(subjectScale.value || 1) * scaleRatio, 0.6, 1.6);

  const mdx = mx - (dragState.value.mx || mx);
  const mdy = my - (dragState.value.my || my);
  applyPan(mdx, mdy, rect);

  dragState.value = { active: true, mode: 'pinch', px: 0, py: 0, dist, mx, my };
};

const onStagePointerUp = (e: PointerEvent) => {
  pointerCache.delete(e.pointerId);
  if (pointerCache.size >= 2) {
    syncPinchState();
    return;
  }
  if (pointerCache.size === 1) {
    const p = Array.from(pointerCache.values())[0];
    dragState.value = {
      active: true,
      mode: 'pan',
      px: p?.x || 0,
      py: p?.y || 0,
      dist: 0,
      mx: 0,
      my: 0
    };
    return;
  }
  dragState.value = { active: false, mode: 'none', px: 0, py: 0, dist: 0, mx: 0, my: 0 };
};

const onStageWheel = (e: WheelEvent) => {
  hasInteracted.value = true;
  const step = 0.06;
  const dir = (e.deltaY || 0) > 0 ? -1 : 1;
  subjectScale.value = clamp(Number(subjectScale.value || 1) + dir * step, 0.6, 1.6);
};

const onStageKeyboard = (event: KeyboardEvent) => {
  const moveStep = event.shiftKey ? 0.05 : 0.02;
  const scaleStep = event.shiftKey ? 0.1 : 0.04;
  const offset = subjectOffset.value;
  if (event.key === 'ArrowLeft') subjectOffset.value = { ...offset, x: clamp(offset.x - moveStep, -0.5, 0.5) };
  else if (event.key === 'ArrowRight') subjectOffset.value = { ...offset, x: clamp(offset.x + moveStep, -0.5, 0.5) };
  else if (event.key === 'ArrowUp') subjectOffset.value = { ...offset, y: clamp(offset.y - moveStep, -0.5, 0.5) };
  else if (event.key === 'ArrowDown') subjectOffset.value = { ...offset, y: clamp(offset.y + moveStep, -0.5, 0.5) };
  else if (event.key === '+' || event.key === '=') subjectScale.value = clamp(Number(subjectScale.value) + scaleStep, 0.6, 1.6);
  else if (event.key === '-' || event.key === '_') subjectScale.value = clamp(Number(subjectScale.value) - scaleStep, 0.6, 1.6);
  else if (event.key === 'Home') resetTransform();
  else return;
  event.preventDefault();
  hasInteracted.value = true;
};

const isCurrentSource = (file: File, revision: number) =>
  props.visible && sourceRevision === revision && selectedFile.value === file;

const replaceCutoutUrl = (nextUrl: string) => {
  try {
    if (cutoutUrl.value) URL.revokeObjectURL(cutoutUrl.value);
  } catch {}
  cutoutUrl.value = nextUrl;
};

const createCutoutForSource = async (file: File, revision: number) => {
  const output = await cutoutClient.run({ source: file, sourceRevision: revision });
  if (!isCurrentSource(file, revision)) {
    throw new CutoutCancelledError('AI_BACKGROUND_CUTOUT_STALE');
  }
  return URL.createObjectURL(output);
};

const handleFile = (file: File) => {
  if (!file.type.startsWith('image/')) return;
  sourceRevision += 1;
  cutoutClient.cancelCurrent('AI_BACKGROUND_SOURCE_CHANGED');
  const revision = sourceRevision;
  selectedFile.value = file;
  try {
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  } catch {}
  const u = URL.createObjectURL(file);
  previewObjectUrl.value = u;
  previewUrl.value = u;
  step.value = 'edit';
  replaceCutoutUrl('');
  cutoutFailed.value = false;
  loading.value = false;
  hasInteracted.value = false;
  pointerCache = new Map();
  dragState.value = { active: false, mode: 'none', px: 0, py: 0, dist: 0, mx: 0, my: 0 };
  resetTransform();
  void (async () => {
    processing.value = true;
    try {
      const url = await createCutoutForSource(file, revision);
      if (!isCurrentSource(file, revision)) {
        URL.revokeObjectURL(url);
        return;
      }
      replaceCutoutUrl(url);
    } catch (value) {
      if (isCurrentSource(file, revision) && !(value instanceof CutoutCancelledError)) {
        cutoutFailed.value = true;
      }
    } finally {
      if (isCurrentSource(file, revision)) processing.value = false;
    }
  })();
};

const onFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    handleFile(input.files[0]);
  }
};

const onDrop = (e: DragEvent) => {
  isDragOver.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
};

const handleAdd = async () => {
  const file = selectedFile.value;
  if (!file) return;
  if (processing.value) return;
  const revision = sourceRevision;
  const mode = bgMode.value;
  const scale = Math.max(0.6, Math.min(1.6, Number(subjectScale.value) || 1));
  const offset = {
    x: Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.x) || 0)),
    y: Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.y) || 0))
  };
  loading.value = true;
  trackEvent('ai_bg_add_click', {
    presetId: String(selectedPresetId.value || '').trim(),
    mode: String(bgMode.value || '').trim(),
    hasCutout: !!cutoutUrl.value,
    subjectScale: scale,
    offsetX: offset.x,
    offsetY: offset.y,
    fileName: String(file.name || '').slice(0, 120),
    fileType: String(file.type || '').slice(0, 80),
    fileSize: Number(file.size || 0) || 0
  });

  const preset = selectedPreset.value;
  const presetSrc = resolvePublicSrc(preset.src);
  try {
    if (mode === 'add') {
      if (!isCurrentSource(file, revision)) return;
      emit('generate', file, {
        mode,
        presetId: preset.id,
        presetSrc: preset.src,
        presetW: preset.size.w,
        presetH: preset.size.h,
        subjectScale: scale,
        subjectOffset: offset
      });
      return;
    }

    cutoutFailed.value = false;
    let cutout = cutoutUrl.value || '';
    if (!cutout) {
      processing.value = true;
      cutout = await createCutoutForSource(file, revision);
      if (!isCurrentSource(file, revision)) {
        URL.revokeObjectURL(cutout);
        return;
      }
      replaceCutoutUrl(cutout);
    }
    if (!cutout) throw new Error('AI_BACKGROUND_CUTOUT_EMPTY_RESULT');
    const composedResultUrl = await composeLocal(cutout, {
      preset,
      presetSrc,
      scale,
      offset
    });
    if (!isCurrentSource(file, revision)) return;
    const localResultUrl = enforceLocalBackgroundPolicy(mode, composedResultUrl);
    emit('generate', file, {
      mode,
      presetId: preset.id,
      presetSrc: preset.src,
      presetW: preset.size.w,
      presetH: preset.size.h,
      localResultUrl,
      subjectScale: scale,
      subjectOffset: offset
    });
  } catch (value) {
    if (isCurrentSource(file, revision) && !(value instanceof CutoutCancelledError)) {
      cutoutFailed.value = true;
    }
  } finally {
    if (isCurrentSource(file, revision)) {
      loading.value = false;
      processing.value = false;
    }
  }
};

const selectPreset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  selectedPresetId.value = id;
  trackEvent('ai_bg_select_preset', {
    presetId: String(id || '').trim(),
    mode: String(bgMode.value || '').trim()
  });
};
</script>

<style scoped>
:deep(.close-btn) {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2700;
  backdrop-filter: blur(4px);
  transition: all 0.2s ease;
  padding: 0;
  line-height: 1;
}

:deep(.close-btn:hover) {
  background: rgba(204, 255, 0, 0.15);
  color: #ccff00;
  border-color: #ccff00;
  transform: none; /* Fixed: rotation causes off-center alignment */
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  backdrop-filter: blur(6px);
  z-index: 2600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-container {
  width: min(1280px, 96vw);
  height: min(860px, 92vh);
  background: #0d1117;
  background-image: radial-gradient(
    circle at 1px 1px,
    rgba(204, 255, 0, 0.08) 1px,
    transparent 1px
  );
  background-size: 28px 28px;
  position: relative;
  border-radius: 22px;
  border: 1px solid rgba(204, 255, 0, 0.2);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  caret-color: transparent;
}

.layout {
  height: 100%;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 28px;
  padding: 24px;
  box-sizing: border-box;
  min-height: 0;
}

.bg-sidebar {
  background: rgba(22, 27, 34, 0.92);
  border: 1px solid rgba(204, 255, 0, 0.15);
  border-radius: 18px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.sidebar-title {
  padding: 18px 16px 12px;
  font-weight: 700;
  color: #ccff00;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.sidebar-scroll {
  padding: 8px 12px 16px;
  overflow: auto;
  flex: 1;
  min-height: 0;
  scrollbar-gutter: stable;
}

/* 自定义滚动条 */
.sidebar-scroll::-webkit-scrollbar,
.main-panel::-webkit-scrollbar {
  width: 5px;
}
.sidebar-scroll::-webkit-scrollbar-track,
.main-panel::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-scroll::-webkit-scrollbar-thumb,
.main-panel::-webkit-scrollbar-thumb {
  background: rgba(204, 255, 0, 0.2);
  border-radius: 10px;
}
.sidebar-scroll::-webkit-scrollbar-thumb:hover,
.main-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(204, 255, 0, 0.4);
}

.bg-group + .bg-group {
  margin-top: 18px;
}

.group-title {
  font-size: 11px;
  font-weight: 800;
  color: rgba(204, 255, 0, 0.5);
  margin: 8px 4px 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bg-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.bg-card {
  appearance: none;
  border: 2px solid transparent;
  border-radius: 14px;
  padding: 0;
  background: #161b22;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.bg-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: #ccff00;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.bg-card:hover {
  transform: translateY(-2px);
  border-color: rgba(204, 255, 0, 0.4);
  box-shadow: 0 8px 20px rgba(204, 255, 0, 0.15);
}

.bg-card.active {
  border-color: #ccff00;
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.3);
}

.bg-thumb {
  width: 100%;
  height: 86px;
  object-fit: cover;
  display: block;
}

.main-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}

.start-panel {
  max-width: 760px;
  margin: 0 auto;
  padding-top: 64px;
  text-align: center;
}

.start-title {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
}

.start-desc {
  margin-top: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.start-tips {
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tip-item {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.start-controls {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
}

.mode-toggle {
  position: relative;
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: rgba(22, 27, 34, 0.6);
  isolation: isolate;
  border: none;
  outline: none;
}

.mode-pill {
  position: absolute;
  top: 4px;
  left: 4px;
  bottom: 4px;
  width: calc(50% - 4px);
  border-radius: 999px;
  background: #ccff00;
  box-shadow: 0 2px 10px rgba(204, 255, 0, 0.3);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 1;
}

.mode-btn {
  position: relative;
  z-index: 2;
  flex: 1;
  border: none;
  background: transparent !important;
  color: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 6px 16px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
  transition: color 0.2s ease;
  min-width: 64px;
  min-height: 44px;
  text-align: center;
}

.mode-btn.active {
  color: #0d1117;
  box-shadow: none;
}

.dropzone {
  margin: 34px auto 0;
  width: min(820px, 100%);
  border-radius: 20px;
  border: 2px dashed rgba(204, 255, 0, 0.3);
  background: rgba(22, 27, 34, 0.4);
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;
  cursor: pointer;
}

.dropzone.drag-over {
  border-color: #ccff00;
  background: rgba(204, 255, 0, 0.05);
  transform: scale(1.01);
}

.dropzone-title {
  font-size: 16px;
  color: #ccff00;
  font-weight: 800;
}

.dropzone-sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.upload-btn {
  margin-top: 10px;
  border: none;
  background: #ccff00;
  color: #000;
  border-radius: 999px;
  padding: 12px 28px;
  cursor: pointer;
  font-weight: 800;
  font-size: 14px;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(204, 255, 0, 0.2);
}

.upload-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(204, 255, 0, 0.4);
  background: #d4ff33;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 14px;
}

.editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 56px 16px 8px;
}

.editor-title {
  margin: 0;
  font-weight: 800;
  color: #fff;
  font-size: 14px;
}

.editor-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.tool-btn {
  min-height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(22, 27, 34, 0.6);
  color: rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  padding: 7px 16px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.zoom-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(22, 27, 34, 0.6);
  border-radius: 999px;
  padding: 6px 14px;
}

.zoom-label {
  font-weight: 800;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}

.zoom-slider {
  width: 100px;
  accent-color: #ccff00;
}

.reupload-btn {
  min-height: 44px;
  border: 1px solid rgba(204, 255, 0, 0.3);
  background: rgba(204, 255, 0, 0.05);
  color: #ccff00;
  border-radius: 999px;
  padding: 7px 16px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
  transition: all 0.2s ease;
}

.reupload-btn:hover {
  background: rgba(204, 255, 0, 0.15);
  border-color: #ccff00;
}

.editor-stage {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
}

.checkerboard {
  width: min(720px, 100%);
  height: min(62vh, 620px);
  position: relative;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: #161b22;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.03) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.03) 75%);
  background-size: 24px 24px;
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  touch-action: none;
  cursor: grab;
}

.checkerboard.dragging {
  cursor: grabbing;
}

.stage-hint {
  position: absolute;
  left: 50%;
  top: 14px;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(204, 255, 0, 0.3);
  background: rgba(13, 17, 23, 0.85);
  color: #ccff00;
  font-weight: 800;
  font-size: 12px;
  pointer-events: none;
  backdrop-filter: blur(8px);
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.cutout-layer {
  position: relative;
  width: 100%;
  height: 100%;
}

.cutout-img {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: 92%;
  max-height: 92%;
  object-fit: contain;
  transform-origin: center;
  will-change: transform;
  user-select: none;
  pointer-events: none;
}

.processing-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 17, 23, 0.6);
  backdrop-filter: blur(4px);
  z-index: 20;
}

.processing-card {
  background: rgba(22, 27, 34, 0.9);
  border: 1px solid rgba(204, 255, 0, 0.2);
  border-radius: 14px;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
}

.processing-text {
  color: #ccff00;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.5px;
}

.spinner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(204, 255, 0, 0.2);
  border-top-color: #ccff00;
  animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.cutout-error {
  align-self: center;
  max-width: min(720px, calc(100% - 32px));
  margin: 4px auto 0;
  padding: 9px 14px;
  border: 1px solid rgba(255, 107, 107, 0.4);
  border-radius: 10px;
  background: rgba(255, 107, 107, 0.08);
  color: #ffb3b3;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.editor-actions {
  padding: 12px 0 26px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  justify-content: center;
}

.upload-consent {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: #b7bdb4;
  font-size: 12px;
  line-height: 1.5;
}

.upload-consent input {
  margin-top: 2px;
}

.upload-consent.disabled {
  opacity: 0.6;
}

.quote-status {
  margin: 0;
  color: #aeb6aa;
  font-size: 12px;
  text-align: center;
}

.quote-status.error {
  color: #fca5a5;
}

.add-btn {
  align-self: center;
}

.add-btn {
  border: none;
  background: #ccff00;
  color: #000;
  border-radius: 999px;
  padding: 14px 32px;
  cursor: pointer;
  font-weight: 800;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(204, 255, 0, 0.2);
}

.add-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(204, 255, 0, 0.4);
  background: #d4ff33;
}

.add-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
  box-shadow: none;
}

.add-cost {
  font-weight: 900;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.hidden-input {
  display: none;
}

.modal-container:focus-visible {
  outline: none;
}

.modal-container :is(button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid #ccff00;
  outline-offset: 3px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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

  .bg-card:hover,
  .upload-btn:hover,
  .add-btn:hover {
    transform: none;
  }
}

@media (max-width: 960px) {
  .modal-container {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    border-radius: 0;
  }

  .close-btn {
    top: calc(env(safe-area-inset-top, 0px) + 24px);
    right: calc(env(safe-area-inset-right, 0px) + 24px);
    z-index: 3000;
  }

  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: 270px 1fr;
    gap: 14px;
    padding: 14px;
  }

  .bg-sidebar {
    border-radius: 16px;
  }

  .sidebar-scroll {
    padding: 8px 10px 14px;
  }

  .bg-thumb {
    height: 76px;
  }

  .start-panel {
    padding-top: 26px;
  }

  .start-title {
    font-size: 22px;
  }

  .start-controls {
    margin-top: 14px;
    flex-direction: column;
    align-items: stretch;
  }

  .start-selected-bg {
    justify-content: space-between;
  }

  .start-selected-thumb {
    width: 110px;
    height: 60px;
  }

  .stage-hint {
    top: 10px;
    font-size: 11px;
    padding: 7px 10px;
  }

  .editor-topbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .editor-tools {
    width: 100%;
    justify-content: flex-start;
  }

  .zoom-slider {
    width: 92px;
  }

  .checkerboard {
    height: min(60vh, 520px);
  }

  .selected-bg-preview {
    left: 14px;
    bottom: 78px;
    width: 128px;
  }
}
</style>
