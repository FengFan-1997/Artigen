<template>
  <transition name="fade">
    <div v-if="visible" class="modal-overlay" @click="close">
      <div class="modal-container" @click.stop>
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
              <div class="start-title">{{ ui.startTitle }}</div>
              <div class="start-desc">{{ ui.startDesc }}</div>
              <div class="start-tips">
                <div v-for="(t, idx) in ui.tips" :key="idx" class="tip-item">{{ t }}</div>
              </div>

              <div class="start-controls">
                <div class="mode-toggle">
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
                    @click="bgMode = 'replace'"
                  >
                    {{ ui.modeReplace }}
                  </button>
                  <button
                    class="mode-btn"
                    type="button"
                    :class="{ active: bgMode === 'add' }"
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
                <div class="editor-title">{{ ui.editorTitle }}</div>
                <div class="editor-tools">
                  <div class="mode-toggle">
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
                      @click="bgMode = 'replace'"
                    >
                      {{ ui.modeReplace }}
                    </button>
                    <button
                      class="mode-btn"
                      type="button"
                      :class="{ active: bgMode === 'add' }"
                      @click="bgMode = 'add'"
                    >
                      {{ ui.modeAdd }}
                    </button>
                  </div>
                  <button class="tool-btn" type="button" @click="resetTransform">
                    {{ ui.reset }}
                  </button>
                  <div class="zoom-row">
                    <div class="zoom-label">{{ ui.zoom }}</div>
                    <input
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
                  @pointerdown="onStagePointerDown"
                  @pointermove="onStagePointerMove"
                  @pointerup="onStagePointerUp"
                  @pointercancel="onStagePointerUp"
                  @wheel.prevent="onStageWheel"
                  @dblclick="resetTransform"
                >
                  <div class="cutout-layer">
                    <img
                      v-if="cutoutUrl"
                      class="cutout-img"
                      :src="cutoutUrl"
                      alt="Cutout"
                      :style="cutoutStyle"
                    />
                    <img
                      v-else
                      class="cutout-img"
                      :src="previewUrl"
                      alt="Preview"
                      :style="cutoutStyle"
                    />
                  </div>
                  <div v-if="!hasInteracted" class="stage-hint">{{ ui.helperHint }}</div>
                </div>

                <div v-if="processing" class="processing-mask">
                  <div class="processing-card">
                    <div class="spinner"></div>
                    <div class="processing-text">{{ ui.processing }}</div>
                  </div>
                </div>
              </div>

              <div class="editor-actions">
                <button
                  class="add-btn"
                  type="button"
                  :disabled="!selectedFile || processing || loading"
                  @click="handleAdd"
                >
                  <span>{{ loading ? ui.adding : ui.add }}</span>
                  <span v-if="!loading && costText" class="add-cost">{{ costText }}</span>
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
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { trackEvent } from '../../utils/analytics';
import { useLanguageStore } from '@/stores/language';
import CloseButton from './CloseButton.vue';

const props = defineProps<{
  visible: boolean;
  creditsCost?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (
    e: 'generate',
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
  ): void;
}>();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string>('');
const loading = ref(false);
const previewObjectUrl = ref<string>('');
const step = ref<'start' | 'edit'>('start');
const processing = ref(false);
const cutoutUrl = ref('');
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
let cutoutJobId = 0;

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

const selectedPresetResolvedSrc = computed(() => resolvePublicSrc(selectedPreset.value.src));

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
    reset: en ? 'Reset' : '重置',
    zoom: en ? 'Zoom' : '缩放',
    reupload: en ? 'Re-upload' : '重新上传',
    processing: en ? 'Detecting subject…' : '识别主体中…',
    selectedBg: en ? 'Selected background' : '已选背景',
    helperHint: en ? 'Drag to move. Pinch or wheel to zoom.' : '拖拽移动，双指或滚轮缩放',
    add: en
      ? bgMode.value === 'add'
        ? 'Generate'
        : 'Apply'
      : bgMode.value === 'add'
        ? '生成'
        : '添加',
    adding: en ? 'Processing…' : '处理中…'
  };
});

const costText = computed(() => {
  if (bgMode.value === 'replace') return '';
  const n = Math.max(0, Math.trunc(Number(props.creditsCost ?? 0) || 0));
  if (!n) return '';
  return `⚡${n}`;
});

const close = () => {
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

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close();
};

const resetState = () => {
  cutoutJobId += 1;
  try {
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  } catch {}
  previewObjectUrl.value = '';
  previewUrl.value = '';
  selectedFile.value = null;
  loading.value = false;
  isDragOver.value = false;
  selectedPresetId.value = 'studio-white';
  step.value = 'start';
  processing.value = false;
  cutoutUrl.value = '';
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

watch(
  () => !!props.visible,
  (v) => {
    if (v) {
      resetState();
      lockScroll();
      document.addEventListener('keydown', onKeydown);
      return;
    }
    document.removeEventListener('keydown', onKeydown);
    unlockScroll();
    resetState();
  }
);

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  unlockScroll();
});

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

const avgCornerColor = (data: Uint8ClampedArray, w: number, h: number) => {
  const block = Math.max(4, Math.round(Math.min(w, h) * 0.02));
  const samples: Array<{ x0: number; y0: number }> = [
    { x0: 0, y0: 0 },
    { x0: Math.max(0, w - block), y0: 0 },
    { x0: 0, y0: Math.max(0, h - block) },
    { x0: Math.max(0, w - block), y0: Math.max(0, h - block) }
  ];

  const cornerMeans = samples.map(({ x0, y0 }) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = y0; y < Math.min(h, y0 + block); y += 1) {
      for (let x = x0; x < Math.min(w, x0 + block); x += 1) {
        const i = (y * w + x) * 4;
        r += data[i] || 0;
        g += data[i + 1] || 0;
        b += data[i + 2] || 0;
        n += 1;
      }
    }
    return { r: r / Math.max(1, n), g: g / Math.max(1, n), b: b / Math.max(1, n) };
  });

  const mean = cornerMeans.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 }
  );
  mean.r /= cornerMeans.length;
  mean.g /= cornerMeans.length;
  mean.b /= cornerMeans.length;

  const maxCornerDist = cornerMeans.reduce((m, c) => {
    const dr = c.r - mean.r;
    const dg = c.g - mean.g;
    const db = c.b - mean.b;
    return Math.max(m, Math.sqrt(dr * dr + dg * dg + db * db));
  }, 0);

  return { mean, maxCornerDist };
};

const createCutoutFromFile = async (file: File) => {
  const fileUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(fileUrl);
    const w = Math.max(1, Math.round(img.naturalWidth || img.width || 1));
    const h = Math.max(1, Math.round(img.naturalHeight || img.height || 1));

    const maxMaskDim = 760;
    const s = Math.min(1, maxMaskDim / Math.max(w, h));
    const sw = Math.max(1, Math.round(w * s));
    const sh = Math.max(1, Math.round(h * s));

    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (!sctx) return '';
    sctx.drawImage(img, 0, 0, sw, sh);
    const sData = sctx.getImageData(0, 0, sw, sh);

    const rgbToLab = (r8: number, g8: number, b8: number) => {
      const r = (r8 || 0) / 255;
      const g = (g8 || 0) / 255;
      const b = (b8 || 0) / 255;
      const rl = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
      const gl = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
      const bl = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
      const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) * 100;
      const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) * 100;
      const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) * 100;
      const fx0 = x / 95.047;
      const fy0 = y / 100;
      const fz0 = z / 108.883;
      const d = 6 / 29;
      const d3 = d * d * d;
      const f = (t: number) => (t > d3 ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29);
      const fx = f(fx0);
      const fy = f(fy0);
      const fz = f(fz0);
      const l = 116 * fy - 16;
      const a = 500 * (fx - fy);
      const bb = 200 * (fy - fz);
      return { l, a, b: bb };
    };

    const borderIdx: number[] = [];
    const borderBand = Math.min(3, Math.max(1, Math.round(Math.min(sw, sh) / 120)));
    const borderStep = Math.max(1, Math.round(Math.min(sw, sh) / 240));
    for (let x = 0; x < sw; x += borderStep) {
      for (let by = 0; by < borderBand; by += 1) {
        borderIdx.push(by * sw + x);
        borderIdx.push((sh - 1 - by) * sw + x);
      }
    }
    for (let y = 0; y < sh; y += borderStep) {
      for (let bx = 0; bx < borderBand; bx += 1) {
        borderIdx.push(y * sw + bx);
        borderIdx.push(y * sw + (sw - 1 - bx));
      }
    }

    const pts = new Float32Array(borderIdx.length * 3);
    for (let i = 0; i < borderIdx.length; i += 1) {
      const p = borderIdx[i];
      const o = p * 4;
      const lab = rgbToLab(sData.data[o] || 0, sData.data[o + 1] || 0, sData.data[o + 2] || 0);
      pts[i * 3] = lab.l;
      pts[i * 3 + 1] = lab.a;
      pts[i * 3 + 2] = lab.b;
    }

    const kMeans = (points: Float32Array, k: number, iters: number) => {
      const n = Math.trunc(points.length / 3);
      const kk = Math.max(1, Math.min(Math.trunc(k) || 1, n || 1));
      const centers = new Float32Array(kk * 3);
      const init = new Int32Array(k);
      init[0] = 0;
      for (let ci = 1; ci < kk; ci += 1) {
        let best = 0;
        let bestD = -1;
        for (let i = 0; i < n; i += 1) {
          const pl = points[i * 3];
          const pa = points[i * 3 + 1];
          const pb = points[i * 3 + 2];
          let minD = Number.POSITIVE_INFINITY;
          for (let j = 0; j < ci; j += 1) {
            const jj = init[j] * 3;
            const dl = pl - points[jj];
            const da = pa - points[jj + 1];
            const db = pb - points[jj + 2];
            const d2 = dl * dl + da * da + db * db;
            if (d2 < minD) minD = d2;
          }
          if (minD > bestD) {
            bestD = minD;
            best = i;
          }
        }
        init[ci] = best;
      }
      for (let c = 0; c < kk; c += 1) {
        const src = init[c] * 3;
        centers[c * 3] = points[src];
        centers[c * 3 + 1] = points[src + 1];
        centers[c * 3 + 2] = points[src + 2];
      }
      const assign = new Int32Array(n);
      for (let it = 0; it < iters; it += 1) {
        const sum = new Float32Array(kk * 3);
        const cnt = new Int32Array(kk);
        for (let i = 0; i < n; i += 1) {
          const pl = points[i * 3];
          const pa = points[i * 3 + 1];
          const pb = points[i * 3 + 2];
          let bestK = 0;
          let bestD = Number.POSITIVE_INFINITY;
          for (let c = 0; c < kk; c += 1) {
            const cl = centers[c * 3];
            const ca = centers[c * 3 + 1];
            const cb = centers[c * 3 + 2];
            const dl = pl - cl;
            const da = pa - ca;
            const db = pb - cb;
            const d2 = dl * dl + da * da + db * db;
            if (d2 < bestD) {
              bestD = d2;
              bestK = c;
            }
          }
          assign[i] = bestK;
          cnt[bestK] += 1;
          sum[bestK * 3] += pl;
          sum[bestK * 3 + 1] += pa;
          sum[bestK * 3 + 2] += pb;
        }
        for (let c = 0; c < kk; c += 1) {
          const cCount = cnt[c] || 0;
          if (!cCount) continue;
          centers[c * 3] = sum[c * 3] / cCount;
          centers[c * 3 + 1] = sum[c * 3 + 1] / cCount;
          centers[c * 3 + 2] = sum[c * 3 + 2] / cCount;
        }
      }
      return centers;
    };

    const centersAll = kMeans(pts, 6, 12);
    const kAll = Math.max(1, Math.trunc(centersAll.length / 3));
    const labL = new Float32Array(sw * sh);
    const labA = new Float32Array(sw * sh);
    const labB = new Float32Array(sw * sh);
    for (let p = 0; p < sw * sh; p += 1) {
      const o = p * 4;
      const lab = rgbToLab(sData.data[o] || 0, sData.data[o + 1] || 0, sData.data[o + 2] || 0);
      labL[p] = lab.l;
      labA[p] = lab.a;
      labB[p] = lab.b;
    }

    const nearestCenter = (l: number, a: number, b: number, centers: Float32Array, k: number) => {
      let bestK = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let c = 0; c < k; c += 1) {
        const cl = centers[c * 3];
        const ca = centers[c * 3 + 1];
        const cb = centers[c * 3 + 2];
        const dl = l - cl;
        const da = a - ca;
        const db = b - cb;
        const d2 = dl * dl + da * da + db * db;
        if (d2 < bestD) {
          bestD = d2;
          bestK = c;
        }
      }
      return { idx: bestK, d2: bestD };
    };

    const borderCounts = new Int32Array(kAll);
    for (let i = 0; i < borderIdx.length; i += 1) {
      const p = borderIdx[i];
      const res = nearestCenter(labL[p] || 0, labA[p] || 0, labB[p] || 0, centersAll, kAll);
      borderCounts[res.idx] += 1;
    }

    const centerCounts = new Int32Array(kAll);
    const cx0 = Math.round(sw * 0.28);
    const cx1 = Math.round(sw * 0.72);
    const cy0 = Math.round(sh * 0.28);
    const cy1 = Math.round(sh * 0.72);
    const centerStep = Math.max(1, Math.round(Math.min(sw, sh) / 220));
    for (let y = cy0; y < cy1; y += centerStep) {
      for (let x = cx0; x < cx1; x += centerStep) {
        const p = y * sw + x;
        const res = nearestCenter(labL[p] || 0, labA[p] || 0, labB[p] || 0, centersAll, kAll);
        centerCounts[res.idx] += 1;
      }
    }

    const clusterOrder = Array.from({ length: kAll }, (_, i) => i).sort((i, j) => {
      const si = (borderCounts[i] || 0) - (centerCounts[i] || 0) * 0.85;
      const sj = (borderCounts[j] || 0) - (centerCounts[j] || 0) * 0.85;
      if (sj !== si) return sj - si;
      return (borderCounts[j] || 0) - (borderCounts[i] || 0);
    });
    const bgClusters: number[] = [];
    const borderTotal = Math.max(1, borderIdx.length);
    for (let i = 0; i < clusterOrder.length; i += 1) {
      const c = clusterOrder[i];
      if ((borderCounts[c] || 0) / borderTotal < 0.08) continue;
      bgClusters.push(c);
      if (bgClusters.length >= 3) break;
    }
    if (!bgClusters.length) bgClusters.push(clusterOrder[0] ?? 0);

    const bgDistSq = new Float32Array(sw * sh);
    for (let p = 0; p < sw * sh; p += 1) {
      const pl = labL[p];
      const pa = labA[p];
      const pb = labB[p];
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < bgClusters.length; i += 1) {
        const c = bgClusters[i] ?? 0;
        const cl = centersAll[c * 3];
        const ca = centersAll[c * 3 + 1];
        const cb = centersAll[c * 3 + 2];
        const dl = pl - cl;
        const da = pa - ca;
        const db = pb - cb;
        const d2 = dl * dl + da * da + db * db;
        if (d2 < best) best = d2;
      }
      bgDistSq[p] = best;
    }

    const gray = new Float32Array(sw * sh);
    for (let p = 0; p < sw * sh; p += 1) {
      const o = p * 4;
      const r = sData.data[o] || 0;
      const g = sData.data[o + 1] || 0;
      const b = sData.data[o + 2] || 0;
      gray[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const edge = new Float32Array(sw * sh);
    for (let y = 1; y < sh - 1; y += 1) {
      for (let x = 1; x < sw - 1; x += 1) {
        const idx = y * sw + x;
        const g00 = gray[idx - sw - 1] || 0;
        const g01 = gray[idx - sw] || 0;
        const g02 = gray[idx - sw + 1] || 0;
        const g10 = gray[idx - 1] || 0;
        const g12 = gray[idx + 1] || 0;
        const g20 = gray[idx + sw - 1] || 0;
        const g21 = gray[idx + sw] || 0;
        const g22 = gray[idx + sw + 1] || 0;
        const gx = -g00 - 2 * g10 - g20 + g02 + 2 * g12 + g22;
        const gy = -g00 - 2 * g01 - g02 + g20 + 2 * g21 + g22;
        edge[idx] = Math.min(255, (Math.abs(gx) + Math.abs(gy)) / 8);
      }
    }

    const pick = (arr: number[], p: number) => {
      if (!arr.length) return 0;
      const a = [...arr].sort((x, y) => x - y);
      const idx = Math.max(0, Math.min(a.length - 1, Math.round((a.length - 1) * p)));
      return a[idx] || 0;
    };

    const borderDist: number[] = [];
    const borderEdge: number[] = [];
    for (let i = 0; i < borderIdx.length; i += 1) {
      const p = borderIdx[i];
      borderDist.push(bgDistSq[p] || 0);
      borderEdge.push(edge[p] || 0);
    }
    const centerDist: number[] = [];
    const centerEdge: number[] = [];
    for (let y = cy0; y < cy1; y += centerStep) {
      for (let x = cx0; x < cx1; x += centerStep) {
        const p = y * sw + x;
        centerDist.push(bgDistSq[p] || 0);
        centerEdge.push(edge[p] || 0);
      }
    }
    const distP95 = pick(borderDist, 0.95);
    const distP80 = pick(borderDist, 0.8);
    const distP60 = pick(borderDist, 0.6);
    const centerP30 = pick(centerDist, 0.3);
    const centerP60 = pick(centerDist, 0.6);
    const centerP80 = pick(centerDist, 0.8);
    const edgeP90 = pick(borderEdge, 0.9);
    const edgeP60 = pick(borderEdge, 0.6);
    const edgeP40 = pick(borderEdge, 0.4);
    const centerEdgeP70 = pick(centerEdge, 0.7);
    let distT = Math.max(180, Math.min(56000, distP95 * 2 + distP80 * 0.55 + distP60 * 0.25));
    if (centerDist.length && centerP30 > distP80 * 1.15) distT = Math.min(distT, centerP30 * 1.25);
    if (centerDist.length && centerP60 < distP60 * 0.9) distT = Math.max(160, distT * 0.88);
    if (centerDist.length && centerP80 > distP80 * 1.4) distT = Math.min(60000, distT * 1.08);
    if (edgeP60 < 12) distT *= 1.05;
    distT = Math.max(160, Math.min(60000, distT));
    let edgeT = Math.max(16, Math.min(140, edgeP90 + 14));
    if (centerEdgeP70 > edgeT * 0.9) edgeT = Math.max(14, edgeT * 0.88);
    if (edgeP40 < 8) edgeT = Math.max(12, edgeT * 0.9);
    if (edgeP90 > 70 && edgeP60 > 25) edgeT = Math.min(140, edgeT * 1.12);

    const cand = new Uint8Array(sw * sh);
    const strong = new Uint8Array(sw * sh);
    const strongT = Math.max(80, Math.min(distT * 0.3, distP80 * 1.05));
    const guardX0 = Math.round(sw * 0.18);
    const guardX1 = Math.round(sw * 0.82);
    const guardY0 = Math.round(sh * 0.18);
    const guardY1 = Math.round(sh * 0.82);
    const borderBand2 = Math.max(2, Math.round(Math.min(sw, sh) / 60));
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const p = y * sw + x;
        const d = bgDistSq[p] || 0;
        const e = edge[p] || 0;
        let ok = d <= distT && (e <= edgeT || d <= distT * 0.48);
        if (x >= guardX0 && x <= guardX1 && y >= guardY0 && y <= guardY1) {
          if (e >= edgeT * 0.75 && d >= distT * 0.22) ok = false;
        }
        if (!ok) {
          const nearBorder =
            x < borderBand2 || y < borderBand2 || x >= sw - borderBand2 || y >= sh - borderBand2;
          if (nearBorder && d <= distT * 1.22 && e <= edgeT * 0.65) ok = true;
        }
        cand[p] = ok ? 1 : 0;
        strong[p] = d <= strongT && e <= edgeT * 0.75 ? 1 : 0;
      }
    }

    const bg = new Uint8Array(sw * sh);
    const qx = new Int32Array(sw * sh);
    const qy = new Int32Array(sw * sh);
    let qs = 0;
    let qe = 0;
    const push = (x: number, y: number) => {
      qx[qe] = x;
      qy[qe] = y;
      qe += 1;
    };

    for (let x = 0; x < sw; x += 1) {
      if (cand[x]) push(x, 0);
      const btm = (sh - 1) * sw + x;
      if (cand[btm]) push(x, sh - 1);
    }
    for (let y = 0; y < sh; y += 1) {
      const l = y * sw;
      const r = y * sw + (sw - 1);
      if (cand[l]) push(0, y);
      if (cand[r]) push(sw - 1, y);
    }

    while (qs < qe) {
      const x = qx[qs];
      const y = qy[qs];
      qs += 1;
      const idx = y * sw + x;
      if (bg[idx]) continue;
      if (!cand[idx]) continue;
      bg[idx] = 1;
      if (x > 0) push(x - 1, y);
      if (x + 1 < sw) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y + 1 < sh) push(x, y + 1);
    }

    const qStrong = new Int32Array(sw * sh);
    let qs3 = 0;
    let qe3 = 0;
    for (let p = 0; p < sw * sh; p += 1) {
      if (!bg[p]) continue;
      qStrong[qe3] = p;
      qe3 += 1;
    }
    while (qs3 < qe3) {
      const idx = qStrong[qs3];
      qs3 += 1;
      const y = Math.trunc(idx / sw);
      const x = idx - y * sw;
      if (x > 0) {
        const n = idx - 1;
        if (!bg[n] && strong[n]) {
          bg[n] = 1;
          qStrong[qe3] = n;
          qe3 += 1;
        }
      }
      if (x + 1 < sw) {
        const n = idx + 1;
        if (!bg[n] && strong[n]) {
          bg[n] = 1;
          qStrong[qe3] = n;
          qe3 += 1;
        }
      }
      if (y > 0) {
        const n = idx - sw;
        if (!bg[n] && strong[n]) {
          bg[n] = 1;
          qStrong[qe3] = n;
          qe3 += 1;
        }
      }
      if (y + 1 < sh) {
        const n = idx + sw;
        if (!bg[n] && strong[n]) {
          bg[n] = 1;
          qStrong[qe3] = n;
          qe3 += 1;
        }
      }
    }
    const pcx0 = Math.round(sw * 0.22);
    const pcx1 = Math.round(sw * 0.78);
    const pcy0 = Math.round(sh * 0.22);
    const pcy1 = Math.round(sh * 0.78);
    for (let y = pcy0; y < pcy1; y += 1) {
      for (let x = pcx0; x < pcx1; x += 1) {
        const idx = y * sw + x;
        if (!bg[idx]) continue;
        const d = bgDistSq[idx] || 0;
        const e = edge[idx] || 0;
        if (e >= edgeT * 0.8 && d >= distT * 0.25) bg[idx] = 0;
      }
    }

    const comp = new Int32Array(sw * sh);
    comp.fill(-1);
    const q = new Int32Array(sw * sh);
    let compId = 0;
    let bestId = -1;
    let bestScore = -1;
    let maxId = -1;
    let maxArea = 0;
    const bx0 = Math.round(sw * 0.22);
    const bx1 = Math.round(sw * 0.78);
    const by0 = Math.round(sh * 0.22);
    const by1 = Math.round(sh * 0.78);
    for (let p = 0; p < sw * sh; p += 1) {
      if (bg[p]) continue;
      if (comp[p] !== -1) continue;
      let qs2 = 0;
      let qe2 = 0;
      q[qe2] = p;
      qe2 += 1;
      comp[p] = compId;
      let area = 0;
      let touchesCenter = false;
      let edgeSum = 0;
      while (qs2 < qe2) {
        const idx = q[qs2];
        qs2 += 1;
        area += 1;
        const y = Math.trunc(idx / sw);
        const x = idx - y * sw;
        edgeSum += edge[idx] || 0;
        if (!touchesCenter && x >= bx0 && x <= bx1 && y >= by0 && y <= by1) touchesCenter = true;
        if (x > 0) {
          const n = idx - 1;
          if (!bg[n] && comp[n] === -1) {
            comp[n] = compId;
            q[qe2] = n;
            qe2 += 1;
          }
        }
        if (x + 1 < sw) {
          const n = idx + 1;
          if (!bg[n] && comp[n] === -1) {
            comp[n] = compId;
            q[qe2] = n;
            qe2 += 1;
          }
        }
        if (y > 0) {
          const n = idx - sw;
          if (!bg[n] && comp[n] === -1) {
            comp[n] = compId;
            q[qe2] = n;
            qe2 += 1;
          }
        }
        if (y + 1 < sh) {
          const n = idx + sw;
          if (!bg[n] && comp[n] === -1) {
            comp[n] = compId;
            q[qe2] = n;
            qe2 += 1;
          }
        }
      }
      if (area > maxArea) {
        maxArea = area;
        maxId = compId;
      }
      const edgeDensity = edgeSum / Math.max(1, area);
      let score = area * (0.65 + Math.min(1.1, edgeDensity / 30) * 0.55);
      if (touchesCenter) score *= 1.1;
      if (score > bestScore) {
        bestScore = score;
        bestId = compId;
      }
      compId += 1;
    }

    if (bestId === -1 && maxId !== -1) bestId = maxId;

    if (bestId !== -1) {
      for (let p = 0; p < sw * sh; p += 1) {
        if (bg[p]) continue;
        if (comp[p] !== bestId) bg[p] = 1;
      }
      const aggressiveT = distT * 0.4;
      const edgeLoose = edgeT * 1.05;
      for (let p = 0; p < sw * sh; p += 1) {
        if (bg[p]) continue;
        if ((bgDistSq[p] || 0) <= aggressiveT && (edge[p] || 0) <= edgeLoose) bg[p] = 1;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const out = imgData.data;

    const bgCount = bg.reduce((acc, v) => acc + (v ? 1 : 0), 0);
    const bgRatio = bgCount / Math.max(1, sw * sh);
    const useFloodFillMask = bgRatio >= 0.002 && bgRatio <= 0.998;

    if (useFloodFillMask) {
      const expandMask = (mask: Uint8Array, width: number, height: number, radius: number) => {
        let cur = mask;
        for (let r = 0; r < radius; r += 1) {
          const next = new Uint8Array(cur.length);
          next.set(cur);
          for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
              const idx = y * width + x;
              if (!cur[idx]) continue;
              next[idx - 1] = 1;
              next[idx + 1] = 1;
              next[idx - width] = 1;
              next[idx + width] = 1;
              next[idx - width - 1] = 1;
              next[idx - width + 1] = 1;
              next[idx + width - 1] = 1;
              next[idx + width + 1] = 1;
            }
          }
          cur = next;
        }
        return cur;
      };
      const radius = 2;
      let cur = new Float32Array(sw * sh);
      const expandedBg = expandMask(bg, sw, sh, 1);
      for (let i = 0; i < bg.length; i += 1) bg[i] = expandedBg[i] ? 1 : 0;
      for (let i = 0; i < cur.length; i += 1) cur[i] = bg[i] ? 1 : 0;

      const blurOnce = (src: Float32Array) => {
        const dst = new Float32Array(sw * sh);
        for (let y = 0; y < sh; y += 1) {
          for (let x = 0; x < sw; x += 1) {
            let sum = 0;
            let n = 0;
            for (let oy = -radius; oy <= radius; oy += 1) {
              const yy = y + oy;
              if (yy < 0 || yy >= sh) continue;
              for (let ox = -radius; ox <= radius; ox += 1) {
                const xx = x + ox;
                if (xx < 0 || xx >= sw) continue;
                sum += src[yy * sw + xx] || 0;
                n += 1;
              }
            }
            dst[y * sw + x] = sum / Math.max(1, n);
          }
        }
        return dst;
      };

      cur = blurOnce(cur);
      cur = blurOnce(cur);

      const sample = (sx: number, sy: number) => {
        const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
        const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
        const x1 = Math.min(sw - 1, x0 + 1);
        const y1 = Math.min(sh - 1, y0 + 1);
        const fx = Math.max(0, Math.min(1, sx - x0));
        const fy = Math.max(0, Math.min(1, sy - y0));
        const m00 = cur[y0 * sw + x0] || 0;
        const m10 = cur[y0 * sw + x1] || 0;
        const m01 = cur[y1 * sw + x0] || 0;
        const m11 = cur[y1 * sw + x1] || 0;
        const mx0 = m00 * (1 - fx) + m10 * fx;
        const mx1 = m01 * (1 - fx) + m11 * fx;
        return mx0 * (1 - fy) + mx1 * fy;
      };

      for (let y = 0; y < h; y += 1) {
        const sy = (y / Math.max(1, h - 1)) * (sh - 1);
        for (let x = 0; x < w; x += 1) {
          const sx = (x / Math.max(1, w - 1)) * (sw - 1);
          const m = sample(sx, sy);
          const a = Math.round(Math.pow(Math.max(0, Math.min(1, 1 - m)), 1.15) * 255);
          out[(y * w + x) * 4 + 3] = Math.max(0, Math.min(255, a));
        }
      }
    } else {
      const { mean: cMean, maxCornerDist } = avgCornerColor(out, w, h);
      const t0 = Math.max(16, Math.min(46, 14 + maxCornerDist * 1.05));
      const t1 = Math.max(t0 + 16, Math.min(110, t0 + 50));
      for (let i = 0; i < out.length; i += 4) {
        const dr = (out[i] || 0) - cMean.r;
        const dg = (out[i + 1] || 0) - cMean.g;
        const db = (out[i + 2] || 0) - cMean.b;
        const d = Math.sqrt(dr * dr + dg * dg + db * db);
        if (d <= t0) {
          out[i + 3] = 0;
          continue;
        }
        if (d >= t1) continue;
        out[i + 3] = Math.max(0, Math.min(255, Math.round(((d - t0) / (t1 - t0)) * 255)));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  } finally {
    try {
      URL.revokeObjectURL(fileUrl);
    } catch {}
  }
};

const composeLocal = async (cutoutDataUrl: string) => {
  const bgUrl = selectedPresetResolvedSrc.value;
  const bgImg = await loadImage(bgUrl);
  const fgImg = await loadImage(cutoutDataUrl);

  const targetW = Math.max(1, Math.trunc(Number(selectedPreset.value.size.w) || 1024));
  const targetH = Math.max(1, Math.trunc(Number(selectedPreset.value.size.h) || 1024));

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
    Math.max(0.6, Math.min(1.6, Number(subjectScale.value) || 1));
  const drawW = Math.max(1, Math.round(fgW * fgScale));
  const drawH = Math.max(1, Math.round(fgH * fgScale));
  const ox = Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.x) || 0));
  const oy = Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.y) || 0));
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
  if (processing.value) return;
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
  if (processing.value) return;
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
  if (processing.value) return;
  hasInteracted.value = true;
  const step = 0.06;
  const dir = (e.deltaY || 0) > 0 ? -1 : 1;
  subjectScale.value = clamp(Number(subjectScale.value || 1) + dir * step, 0.6, 1.6);
};

const handleFile = (file: File) => {
  if (!file.type.startsWith('image/')) return;
  selectedFile.value = file;
  try {
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  } catch {}
  const u = URL.createObjectURL(file);
  previewObjectUrl.value = u;
  previewUrl.value = u;
  step.value = 'edit';
  cutoutUrl.value = '';
  hasInteracted.value = false;
  pointerCache = new Map();
  dragState.value = { active: false, mode: 'none', px: 0, py: 0, dist: 0, mx: 0, my: 0 };
  resetTransform();
  const jobId = (cutoutJobId += 1);
  void (async () => {
    processing.value = true;
    try {
      const url = await createCutoutFromFile(file);
      if (jobId !== cutoutJobId) return;
      if (selectedFile.value !== file) return;
      cutoutUrl.value = url || '';
    } finally {
      if (jobId === cutoutJobId) processing.value = false;
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
  loading.value = true;
  trackEvent('ai_bg_add_click', {
    presetId: String(selectedPresetId.value || '').trim(),
    mode: String(bgMode.value || '').trim(),
    hasCutout: !!cutoutUrl.value,
    subjectScale: Math.max(0.6, Math.min(1.6, Number(subjectScale.value) || 1)),
    offsetX: Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.x) || 0)),
    offsetY: Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.y) || 0)),
    fileName: String(file.name || '').slice(0, 120),
    fileType: String(file.type || '').slice(0, 80),
    fileSize: Number(file.size || 0) || 0
  });

  const preset = selectedPreset.value;
  const prompt = currentLang.value === 'en' ? preset.prompt.en : preset.prompt.zh;

  try {
    let cutout = cutoutUrl.value || '';
    if (!cutout) {
      cutout = await createCutoutFromFile(file);
      cutoutUrl.value = cutout || '';
    }
    let localResultUrl = '';
    try {
      localResultUrl = bgMode.value === 'replace' && cutout ? await composeLocal(cutout) : '';
    } catch {}
    emit('generate', file, {
      mode: bgMode.value,
      background: prompt,
      presetId: preset.id,
      presetSrc: preset.src,
      presetW: preset.size.w,
      presetH: preset.size.h,
      localResultUrl: localResultUrl || undefined,
      subjectScale: Math.max(0.6, Math.min(1.6, Number(subjectScale.value) || 1)),
      subjectOffset: {
        x: Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.x) || 0)),
        y: Math.max(-0.5, Math.min(0.5, Number(subjectOffset.value.y) || 0))
      }
    });
  } finally {
    loading.value = false;
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
  width: 32px;
  height: 32px;
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
  color: rgba(255, 255, 255, 0.45);
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
  color: rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  padding: 6px 16px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
  transition: color 0.2s ease;
  min-width: 64px;
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
  color: rgba(255, 255, 255, 0.4);
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
  color: rgba(255, 255, 255, 0.5);
}

.zoom-slider {
  width: 100px;
  accent-color: #ccff00;
}

.reupload-btn {
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

.editor-actions {
  padding: 12px 0 26px;
  display: flex;
  align-items: center;
  justify-content: center;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
