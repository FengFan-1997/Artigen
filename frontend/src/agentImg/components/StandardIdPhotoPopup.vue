<template>
  <transition name="standard-photo-fade">
    <div v-if="visible" class="standard-photo-overlay" @click.self="closePopup">
      <section
        ref="dialogRef"
        class="standard-photo-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="mode === 'choose' ? 'photo-mode-title' : 'standard-photo-title'"
        tabindex="-1"
        @keydown="onDialogKeydown"
      >
        <header class="dialog-header">
          <div>
            <span class="eyebrow">{{ ui.eyebrow }}</span>
            <h2 :id="mode === 'choose' ? 'photo-mode-title' : 'standard-photo-title'">
              {{ mode === 'choose' ? ui.chooseTitle : ui.localTitle }}
            </h2>
            <p>{{ mode === 'choose' ? ui.chooseSubtitle : ui.localSubtitle }}</p>
          </div>
          <button class="icon-button" type="button" :aria-label="ui.close" @click="closePopup">×</button>
        </header>

        <div v-if="mode === 'choose'" class="mode-grid">
          <article class="mode-card local-card">
            <div class="mode-icon">▣</div>
            <div class="mode-badges">
              <span>{{ ui.local }}</span>
              <span>{{ ui.free }}</span>
            </div>
            <h3>{{ ui.standardTitle }}</h3>
            <p>{{ ui.standardDesc }}</p>
            <ul>
              <li>{{ ui.standardFeature1 }}</li>
              <li>{{ ui.standardFeature2 }}</li>
              <li>{{ ui.standardFeature3 }}</li>
            </ul>
            <button class="primary-button" type="button" @click="enterLocalMode">
              {{ ui.startLocal }}
            </button>
          </article>

          <article class="mode-card cloud-card">
            <div class="mode-icon">✦</div>
            <div class="mode-badges cloud">
              <span>{{ ui.cloud }}</span>
              <span>{{ ui.paid }}</span>
            </div>
            <h3>{{ ui.aiTitle }}</h3>
            <p>{{ ui.aiDesc }}</p>
            <ul>
              <li>{{ ui.aiFeature1 }}</li>
              <li>{{ ui.aiFeature2 }}</li>
              <li>{{ ui.aiFeature3 }}</li>
            </ul>
            <button class="secondary-button" type="button" @click="openAiPortrait">
              {{ ui.openAi }}
            </button>
          </article>

          <p class="mode-privacy">{{ ui.modePrivacy }}</p>
        </div>

        <div v-else class="local-editor">
          <aside class="controls-panel">
            <button class="back-mode-button" type="button" @click="backToModes">← {{ ui.backModes }}</button>

            <section class="control-section">
              <div class="section-heading">
                <h3>1. {{ ui.importTitle }}</h3>
                <span v-if="originalFile" class="kept-badge">{{ ui.originalKept }}</span>
              </div>
              <button class="upload-button" type="button" @click="openFilePicker">
                <strong>{{ originalFile ? ui.replaceImage : ui.chooseImage }}</strong>
                <span>{{ ui.fileHint }}</span>
              </button>
              <div v-if="originalFile" class="file-summary">
                <span>{{ originalFile.name }}</span>
                <span>{{ sourceWidth }} × {{ sourceHeight }} px</span>
              </div>
            </section>

            <section class="control-section">
              <div class="section-heading"><h3>2. {{ ui.backgroundTitle }}</h3></div>
              <div class="background-options">
                <button
                  v-for="option in backgroundOptions"
                  :key="option.value"
                  type="button"
                  :class="{ selected: backgroundMode === option.value }"
                  :aria-pressed="backgroundMode === option.value"
                  @click="selectBackground(option.value)"
                >
                  <span class="color-dot" :style="{ backgroundColor: option.color }"></span>
                  {{ option.label }}
                </button>
                <label class="custom-color" :class="{ selected: backgroundMode === 'custom' }">
                  <input v-model="customBackground" type="color" @change="selectBackground('custom')" />
                  {{ ui.custom }}
                </label>
              </div>
              <label class="range-control compact-range">
                <span>{{ ui.edgeTolerance }}</span>
                <input
                  v-model.number="edgeTolerance"
                  type="range"
                  min="12"
                  max="120"
                  step="2"
                  :disabled="!originalFile"
                  @change="processBackground"
                />
                <output>{{ edgeTolerance }}</output>
              </label>
              <p class="experiment-notice">
                <strong>{{ ui.localExperiment }}</strong>
                {{ ui.edgeNotice }}
              </p>
            </section>

            <section class="control-section">
              <div class="section-heading"><h3>3. {{ ui.sizeTitle }}</h3></div>
              <div class="segmented-control">
                <button type="button" :class="{ active: sizeMode === 'preset' }" @click="sizeMode = 'preset'">
                  {{ ui.common }}
                </button>
                <button type="button" :class="{ active: sizeMode === 'px' }" @click="sizeMode = 'px'">
                  px
                </button>
                <button type="button" :class="{ active: sizeMode === 'mm' }" @click="sizeMode = 'mm'">
                  mm + DPI
                </button>
              </div>

              <div v-if="sizeMode === 'preset'" class="preset-grid">
                <button
                  v-for="preset in presets"
                  :key="preset.id"
                  type="button"
                  :class="{ selected: selectedPreset === preset.id }"
                  @click="selectedPreset = preset.id"
                >
                  <strong>{{ localizedPresetLabel(preset.id) }}</strong>
                  <span>{{ preset.width }} × {{ preset.height }}</span>
                </button>
              </div>

              <div v-else-if="sizeMode === 'px'" class="number-grid">
                <label>
                  {{ ui.widthPx }}
                  <input v-model.number="customPxWidth" type="number" min="1" max="6000" />
                </label>
                <label>
                  {{ ui.heightPx }}
                  <input v-model.number="customPxHeight" type="number" min="1" max="6000" />
                </label>
              </div>

              <div v-else class="number-grid mm-grid">
                <label>
                  {{ ui.widthMm }}
                  <input v-model.number="customMmWidth" type="number" min="1" max="300" step="0.1" />
                </label>
                <label>
                  {{ ui.heightMm }}
                  <input v-model.number="customMmHeight" type="number" min="1" max="300" step="0.1" />
                </label>
                <label>
                  DPI
                  <input v-model.number="customDpi" type="number" min="72" max="1200" step="1" />
                </label>
              </div>
              <p class="resolved-size">
                {{ ui.outputSize }} <strong>{{ targetSize.width }} × {{ targetSize.height }} px</strong>
              </p>
            </section>

            <section class="control-section">
              <div class="section-heading"><h3>4. {{ ui.subjectTitle }}</h3></div>
              <label class="range-control">
                <span>{{ ui.scale }}</span>
                <input v-model.number="subjectScale" type="range" min="0.7" max="1.5" step="0.01" />
                <output>{{ Math.round(subjectScale * 100) }}%</output>
              </label>
              <label class="range-control">
                <span>{{ ui.horizontal }}</span>
                <input v-model.number="subjectOffsetX" type="range" min="-40" max="40" step="1" />
                <output>{{ subjectOffsetX }}%</output>
              </label>
              <label class="range-control">
                <span>{{ ui.vertical }}</span>
                <input v-model.number="subjectOffsetY" type="range" min="-40" max="40" step="1" />
                <output>{{ subjectOffsetY }}%</output>
              </label>
              <button class="text-button" type="button" @click="resetTransform">{{ ui.resetPosition }}</button>
            </section>
          </aside>

          <main class="preview-panel">
            <div class="preview-toolbar">
              <div>
                <strong>{{ ui.preview }}</strong>
                <span>{{ targetSize.width }} × {{ targetSize.height }} px</span>
              </div>
              <span class="no-upload-badge">{{ ui.noUpload }}</span>
            </div>

            <div class="preview-stage">
              <div v-if="!originalFile" class="preview-empty">
                <div>＋</div>
                <strong>{{ ui.emptyPreview }}</strong>
                <button class="primary-button" type="button" @click="openFilePicker">{{ ui.chooseImage }}</button>
              </div>
              <canvas
                v-show="originalFile"
                ref="previewCanvasRef"
                class="photo-preview-canvas"
                :style="previewAspectStyle"
                aria-label="证件照本地预览"
              ></canvas>
              <div v-if="processing" class="processing-overlay" role="status">
                <span class="spinner" aria-hidden="true"></span>
                <strong>{{ ui.processing }}</strong>
                <button type="button" @click="cancelProcessing">{{ ui.cancel }}</button>
              </div>
            </div>

            <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

            <section class="export-card">
              <div class="export-row">
                <label>
                  {{ ui.format }}
                  <select v-model="exportFormat">
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </label>
                <label v-if="exportFormat === 'jpeg'">
                  {{ ui.quality }} {{ Math.round(exportQuality * 100) }}%
                  <input v-model.number="exportQuality" type="range" min="0.6" max="1" step="0.05" />
                </label>
              </div>
              <div class="export-actions">
                <button
                  class="primary-button"
                  type="button"
                  :disabled="!processedCanvas || processing || exporting"
                  @click="exportSingle"
                >
                  {{ exporting ? ui.exporting : ui.exportSingle }}
                </button>
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="!processedCanvas || processing || exporting || sheetLayout.placements.length === 0"
                  @click="exportSixInchSheet"
                >
                  {{ ui.exportSheet }}
                </button>
              </div>
              <p class="sheet-summary">
                {{ ui.sheetSummary }}：{{ sheetLayout.sheetWidth }} × {{ sheetLayout.sheetHeight }} px，
                {{ sheetLayout.placements.length }} {{ ui.copies }}，{{ sheetDpi }} DPI。
              </p>
            </section>
          </main>
        </div>

        <input
          ref="fileInputRef"
          class="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          @change="onFileChange"
        />
      </section>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { IdPhotoWorkerClient } from '../logic/idPhoto/IdPhotoWorkerClient';
import {
  calculateSixInchLayout,
  fitDimensionsWithin,
  ID_PHOTO_PRESETS,
  millimetersToPixels,
  type IdPhotoPresetId
} from '../logic/idPhoto/idPhotoMath';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'open-ai'): void;
}>();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const dialogRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const previewCanvasRef = ref<HTMLCanvasElement | null>(null);
const mode = ref<'choose' | 'local'>('choose');
const originalFile = shallowRef<File | null>(null);
const sourceWidth = ref(0);
const sourceHeight = ref(0);
const processedCanvas = shallowRef<HTMLCanvasElement | null>(null);
const processing = ref(false);
const exporting = ref(false);
const errorMessage = ref('');
const revision = ref(0);
const backgroundMode = ref<'white' | 'blue' | 'red' | 'custom'>('white');
const customBackground = ref('#E9EEF5');
const edgeTolerance = ref(58);
const sizeMode = ref<'preset' | 'px' | 'mm'>('preset');
const selectedPreset = ref<IdPhotoPresetId>('one-inch');
const customPxWidth = ref(295);
const customPxHeight = ref(413);
const customMmWidth = ref(25);
const customMmHeight = ref(35);
const customDpi = ref(300);
const subjectScale = ref(1);
const subjectOffsetX = ref(0);
const subjectOffsetY = ref(0);
const exportFormat = ref<'png' | 'jpeg'>('png');
const exportQuality = ref(0.92);
const workerClient = shallowRef<IdPhotoWorkerClient | null>(null);
let sourcePixels: Uint8ClampedArray | null = null;
let sourceCanvas: HTMLCanvasElement | null = null;
let returnFocus: HTMLElement | null = null;
let previewAnimationFrame: number | null = null;

const presets = ID_PHOTO_PRESETS;
const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    eyebrow: en ? 'ID PHOTO WORKFLOWS' : '证件照工作流',
    chooseTitle: en ? 'ID Photo & Professional Portrait' : '证件照与职业形象',
    chooseSubtitle: en
      ? 'Choose a free local standard photo or a paid cloud professional portrait.'
      : '请选择免费本地标准证件照，或付费云端 AI 职业形象。',
    localTitle: en ? 'Standard ID Photo · Local' : '标准证件照 · 本地免费',
    localSubtitle: en
      ? 'Exact pixels, background replacement and print layout stay on this device.'
      : '精确像素、换底色和打印排版均在当前设备完成。',
    close: en ? 'Close' : '关闭',
    local: en ? 'LOCAL' : '本地处理',
    free: en ? 'FREE' : '免费',
    cloud: en ? 'CLOUD AI' : '云端 AI',
    paid: en ? 'PAID' : '付费',
    standardTitle: en ? 'Standard ID Photo' : '标准证件照',
    standardDesc: en
      ? 'Resize, replace a uniform background and create a 6×4 inch print sheet without uploading.'
      : '不上传图片，完成标准尺寸、均匀背景换色与 6 寸排版。',
    standardFeature1: en ? '1-inch / 2-inch / passport presets' : '一寸 / 二寸 / 护照常用规格',
    standardFeature2: en ? 'Custom px or mm + DPI' : '自定义 px 或 mm + DPI',
    standardFeature3: en ? 'PNG / JPEG and print sheet' : 'PNG / JPEG 单张与打印排版',
    startLocal: en ? 'Create locally for free' : '免费本地制作',
    aiTitle: en ? 'AI Professional Portrait' : 'AI 职业形象',
    aiDesc: en
      ? 'Upload after confirmation and generate a professional style portrait using paid cloud AI.'
      : '明确确认后上传，由付费云端 AI 生成职业风格形象。',
    aiFeature1: en ? 'Finance / tech / scholar styles' : '金融 / 科技 / 学者等职业风格',
    aiFeature2: en ? 'Requires sign-in and credits' : '需要登录并消耗点数',
    aiFeature3: en ? 'Not a standard ID-photo spec tool' : '不用于标准证件照尺寸排版',
    openAi: en ? 'Open paid AI portrait' : '打开付费 AI 职业形象',
    modePrivacy: en
      ? 'The local mode never calls a cloud generation or credits API.'
      : '本地标准照不会调用云端生成接口，也不会扣除点数。',
    backModes: en ? 'Back to modes' : '返回模式选择',
    importTitle: en ? 'Import original' : '导入原图',
    originalKept: en ? 'ORIGINAL KEPT' : '原图保留',
    replaceImage: en ? 'Replace image' : '替换图片',
    chooseImage: en ? 'Choose JPG / PNG / WebP' : '选择 JPG / PNG / WebP',
    fileHint: en ? 'Up to 30MB and 20MP' : '不超过 30MB、2000 万像素',
    backgroundTitle: en ? 'Background' : '背景颜色',
    custom: en ? 'Custom' : '自定义',
    edgeTolerance: en ? 'Edge tolerance' : '边缘容差',
    localExperiment: en ? 'Algorithm note:' : '算法说明：',
    edgeNotice: en
      ? 'Uniform-background edge detection; complex hair must be checked manually.'
      : '均匀背景边缘检测，本地实验性，复杂发丝需人工检查。',
    sizeTitle: en ? 'Output size' : '输出尺寸',
    common: en ? 'Presets' : '常用规格',
    widthPx: en ? 'Width px' : '宽度 px',
    heightPx: en ? 'Height px' : '高度 px',
    widthMm: en ? 'Width mm' : '宽度 mm',
    heightMm: en ? 'Height mm' : '高度 mm',
    outputSize: en ? 'Resolved output:' : '实际输出：',
    subjectTitle: en ? 'Subject position' : '主体位置',
    scale: en ? 'Scale' : '缩放',
    horizontal: en ? 'Horizontal' : '水平位移',
    vertical: en ? 'Vertical' : '垂直位移',
    resetPosition: en ? 'Reset position' : '重置位移与缩放',
    preview: en ? 'Live preview' : '实时预览',
    noUpload: en ? 'ZERO UPLOAD' : '零上传',
    emptyPreview: en ? 'Import an evenly lit portrait' : '请导入光线均匀的人像照片',
    processing: en ? 'Processing locally…' : '正在本地处理…',
    cancel: en ? 'Cancel' : '取消',
    format: en ? 'Format' : '格式',
    quality: en ? 'Quality' : '质量',
    exporting: en ? 'Exporting…' : '正在导出…',
    exportSingle: en ? 'Download single photo' : '下载单张证件照',
    exportSheet: en ? 'Download 6-inch sheet' : '下载 6 寸排版纸',
    sheetSummary: en ? '6×4 inch sheet' : '6×4 英寸排版纸',
    copies: en ? 'copies' : '张'
  };
});

const backgroundOptions = computed(() => [
  { value: 'white' as const, label: currentLang.value === 'en' ? 'White' : '白色', color: '#FFFFFF' },
  { value: 'blue' as const, label: currentLang.value === 'en' ? 'Blue' : '蓝色', color: '#438EDB' },
  { value: 'red' as const, label: currentLang.value === 'en' ? 'Red' : '红色', color: '#D83A3A' }
]);
const activeBackground = computed(() => {
  if (backgroundMode.value === 'custom') return customBackground.value;
  return backgroundOptions.value.find((item) => item.value === backgroundMode.value)?.color ?? '#FFFFFF';
});
const targetSize = computed(() => {
  if (sizeMode.value === 'preset') {
    const preset = presets.find((item) => item.id === selectedPreset.value) ?? presets[0];
    return { width: preset.width, height: preset.height };
  }
  if (sizeMode.value === 'px') {
    return {
      width: clampInteger(customPxWidth.value, 1, 6000),
      height: clampInteger(customPxHeight.value, 1, 6000)
    };
  }
  const dpi = clampNumber(customDpi.value, 72, 1200, 300);
  return {
    width: Math.min(6000, millimetersToPixels(clampNumber(customMmWidth.value, 1, 300, 25), dpi)),
    height: Math.min(6000, millimetersToPixels(clampNumber(customMmHeight.value, 1, 300, 35), dpi))
  };
});
const sheetDpi = computed(() => sizeMode.value === 'mm'
  ? Math.round(clampNumber(customDpi.value, 72, 1200, 300))
  : 300
);
const sheetLayout = computed(() =>
  calculateSixInchLayout(targetSize.value.width, targetSize.value.height, sheetDpi.value)
);
const previewAspectStyle = computed(() => ({
  aspectRatio: `${targetSize.value.width} / ${targetSize.value.height}`,
  backgroundColor: activeBackground.value
}));

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      returnFocus = globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;
      await nextTick();
      dialogRef.value?.focus();
    } else {
      cleanupSession();
      returnFocus?.focus();
      returnFocus = null;
    }
  },
  { immediate: true }
);

watch(
  [targetSize, subjectScale, subjectOffsetX, subjectOffsetY, activeBackground],
  () => {
    void nextTick(schedulePreviewRender);
  },
  { deep: true }
);

onBeforeUnmount(cleanupSession);

function enterLocalMode(): void {
  mode.value = 'local';
  void nextTick(schedulePreviewRender);
}

function backToModes(): void {
  cancelProcessing();
  mode.value = 'choose';
}

function closePopup(): void {
  cleanupSession();
  emit('close');
}

function openAiPortrait(): void {
  cleanupSession();
  emit('open-ai');
}

function openFilePicker(): void {
  fileInputRef.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await importImage(file);
}

async function importImage(file: File): Promise<void> {
  errorMessage.value = '';
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error(ui.value.fileHint);
    const mimeType = await detectImageMime(file);
    if (!mimeType) throw new Error(currentLang.value === 'en'
      ? 'The file content is not a valid JPG, PNG or WebP image.'
      : '文件内容不是有效的 JPG、PNG 或 WebP 图片。');
    const normalized = file.type === mimeType
      ? file
      : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
    const decoded = await decodeImage(normalized);
    if (decoded.width * decoded.height > 20_000_000) {
      decoded.bitmap.close();
      throw new Error(currentLang.value === 'en'
        ? 'Local processing supports images up to 20 megapixels.'
        : '本地处理支持不超过 2000 万像素的图片。');
    }
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.drawImage(decoded.bitmap, 0, 0);
    decoded.bitmap.close();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    sourcePixels = new Uint8ClampedArray(imageData.data);
    sourceCanvas = canvas;
    originalFile.value = normalized;
    sourceWidth.value = canvas.width;
    sourceHeight.value = canvas.height;
    processedCanvas.value = null;
    resetTransform();
    await processBackground();
  } catch (value) {
    errorMessage.value = friendlyError(value);
  }
}

async function processBackground(): Promise<void> {
  if (!sourcePixels || !sourceCanvas || !originalFile.value) return;
  cancelProcessing();
  const runRevision = revision.value + 1;
  revision.value = runRevision;
  processing.value = true;
  errorMessage.value = '';
  const client = workerClient.value ?? new IdPhotoWorkerClient();
  workerClient.value = client;
  const target = hexToRgb(activeBackground.value);
  try {
    const { accepted, result } = await client.run({
      revision: runRevision,
      width: sourceCanvas.width,
      height: sourceCanvas.height,
      data: new Uint8ClampedArray(sourcePixels).buffer,
      target,
      tolerance: edgeTolerance.value
    });
    if (!accepted || runRevision !== revision.value || !props.visible) return;
    if (result.type === 'failed') throw new Error(result.message);
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.putImageData(
      new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
      0,
      0
    );
    processedCanvas.value = canvas;
    await nextTick();
    schedulePreviewRender();
  } catch (value) {
    if (isCancellation(value)) return;
    if (runRevision === revision.value) errorMessage.value = friendlyError(value);
  } finally {
    if (runRevision === revision.value) processing.value = false;
  }
}

function cancelProcessing(): void {
  revision.value += 1;
  workerClient.value?.cancelCurrent();
  processing.value = false;
}

function selectBackground(modeValue: 'white' | 'blue' | 'red' | 'custom'): void {
  backgroundMode.value = modeValue;
  void processBackground();
}

function resetTransform(): void {
  subjectScale.value = 1;
  subjectOffsetX.value = 0;
  subjectOffsetY.value = 0;
}

function renderPreview(): void {
  const canvas = previewCanvasRef.value;
  if (!canvas || !originalFile.value) return;
  const rendered = renderPhotoCanvas(1200);
  canvas.width = rendered.width;
  canvas.height = rendered.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(rendered, 0, 0);
}

function schedulePreviewRender(): void {
  if (previewAnimationFrame !== null) return;
  previewAnimationFrame = requestAnimationFrame(() => {
    previewAnimationFrame = null;
    renderPreview();
  });
}

function renderPhotoCanvas(previewMaxSide?: number): HTMLCanvasElement {
  const size = targetSize.value;
  const renderSize = previewMaxSide
    ? fitDimensionsWithin(size.width, size.height, previewMaxSide)
    : size;
  const canvas = document.createElement('canvas');
  canvas.width = renderSize.width;
  canvas.height = renderSize.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  context.fillStyle = activeBackground.value;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const source = processedCanvas.value ?? sourceCanvas;
  if (!source) return canvas;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const coverScale = Math.max(canvas.width / source.width, canvas.height / source.height);
  const scale = coverScale * subjectScale.value;
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  const x = (canvas.width - drawWidth) / 2 + (subjectOffsetX.value / 100) * canvas.width;
  const y = (canvas.height - drawHeight) / 2 + (subjectOffsetY.value / 100) * canvas.height;
  context.drawImage(source, x, y, drawWidth, drawHeight);
  return canvas;
}

async function exportSingle(): Promise<void> {
  if (!processedCanvas.value) return;
  exporting.value = true;
  errorMessage.value = '';
  try {
    const canvas = renderPhotoCanvas();
    const blob = await canvasToBlob(canvas, exportFormat.value, exportQuality.value);
    downloadBlob(blob, buildFilename('single'));
  } catch (value) {
    errorMessage.value = friendlyError(value);
  } finally {
    exporting.value = false;
  }
}

async function exportSixInchSheet(): Promise<void> {
  if (!processedCanvas.value) return;
  exporting.value = true;
  errorMessage.value = '';
  try {
    const photo = renderPhotoCanvas();
    const layout = sheetLayout.value;
    if (!layout.placements.length) throw new Error(currentLang.value === 'en'
      ? 'This photo is larger than the selected 6-inch sheet.'
      : '当前照片尺寸大于 6 寸排版纸，无法排版。');
    const sheet = document.createElement('canvas');
    sheet.width = layout.sheetWidth;
    sheet.height = layout.sheetHeight;
    const context = sheet.getContext('2d');
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, sheet.width, sheet.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    for (const placement of layout.placements) {
      context.save();
      if (placement.rotated) {
        context.translate(placement.x + placement.width / 2, placement.y + placement.height / 2);
        context.rotate(Math.PI / 2);
        context.drawImage(photo, -photo.width / 2, -photo.height / 2, photo.width, photo.height);
      } else {
        context.drawImage(photo, placement.x, placement.y, placement.width, placement.height);
      }
      context.restore();
      context.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      context.lineWidth = Math.max(1, Math.round(sheetDpi.value / 300));
      context.strokeRect(placement.x, placement.y, placement.width, placement.height);
    }
    const blob = await canvasToBlob(sheet, exportFormat.value, exportQuality.value);
    downloadBlob(blob, buildFilename('6inch'));
  } catch (value) {
    errorMessage.value = friendlyError(value);
  } finally {
    exporting.value = false;
  }
}

function buildFilename(kind: 'single' | '6inch'): string {
  const base = (originalFile.value?.name ?? 'id-photo')
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-');
  const extension = exportFormat.value === 'jpeg' ? 'jpg' : 'png';
  return `${base}-${targetSize.value.width}x${targetSize.value.height}-${kind}.${extension}`;
}

function localizedPresetLabel(id: IdPhotoPresetId): string {
  if (currentLang.value === 'en') {
    return { 'one-inch': '1-inch', 'two-inch': '2-inch', passport: 'Passport' }[id];
  }
  return { 'one-inch': '一寸', 'two-inch': '二寸', passport: '护照' }[id];
}

function cleanupSession(): void {
  if (previewAnimationFrame !== null) {
    cancelAnimationFrame(previewAnimationFrame);
    previewAnimationFrame = null;
  }
  revision.value += 1;
  workerClient.value?.dispose();
  workerClient.value = null;
  sourcePixels = null;
  sourceCanvas = null;
  processedCanvas.value = null;
  originalFile.value = null;
  sourceWidth.value = 0;
  sourceHeight.value = 0;
  processing.value = false;
  exporting.value = false;
  errorMessage.value = '';
  mode.value = 'choose';
  resetTransform();
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePopup();
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
  ));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && globalThis.document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && globalThis.document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function detectImageMime(blob: Blob): Promise<'image/jpeg' | 'image/png' | 'image/webp' | null> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const ascii = String.fromCharCode(...bytes);
  if (bytes.length >= 12 && ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function decodeImage(blob: Blob): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : 'FFFFFF';
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg',
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('EXPORT_FAILED'));
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', quality);
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 5000);
}

function friendlyError(value: unknown): string {
  if (!(value instanceof Error)) return currentLang.value === 'en' ? 'Operation failed.' : '操作失败，请重试。';
  const known: Record<string, string> = {
    CANVAS_UNAVAILABLE: currentLang.value === 'en' ? 'Canvas is unavailable.' : '当前浏览器无法创建画布。',
    EXPORT_FAILED: currentLang.value === 'en' ? 'Image export failed.' : '图片导出失败。'
  };
  return known[value.message] ?? value.message;
}

function isCancellation(value: unknown): boolean {
  return value instanceof Error && /ID_PHOTO_(CANCELLED|SUPERSEDED|DISPOSED)/.test(value.message);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max, min));
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, finite));
}
</script>

<style scoped>
.standard-photo-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  color: #f5f7f2;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(8px);
  box-sizing: border-box;
  overflow-x: clip;
}

.standard-photo-dialog {
  width: min(1120px, 100%);
  min-width: 0;
  box-sizing: border-box;
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid rgba(200, 255, 61, 0.42);
  border-radius: 20px;
  background: #0b0d0e;
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.65);
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.dialog-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(245, 247, 242, 0.14);
  background: rgba(11, 13, 14, 0.96);
}

.dialog-header h2 {
  margin: 4px 0 5px;
  font-size: clamp(22px, 3vw, 30px);
  letter-spacing: -0.03em;
}

.dialog-header p {
  margin: 0;
  color: #a3aca5;
  font-size: 13px;
}

.eyebrow {
  color: #c8ff3d;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.15em;
}

button,
input,
select {
  font: inherit;
}

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid #c8ff3d;
  outline-offset: 2px;
}

.icon-button,
.primary-button,
.secondary-button,
.back-mode-button,
.upload-button,
.background-options button,
.segmented-control button,
.preset-grid button,
.text-button,
.processing-overlay button {
  min-height: 44px;
  border: 1px solid rgba(245, 247, 242, 0.16);
  border-radius: 10px;
  color: #f5f7f2;
  background: #1a1f20;
  cursor: pointer;
}

.icon-button {
  flex: 0 0 44px;
  width: 44px;
  padding: 0;
  font-size: 24px;
}

.primary-button,
.secondary-button {
  padding: 0 18px;
  font-weight: 800;
}

.primary-button {
  color: #0b0d0e;
  border-color: #c8ff3d;
  background: #c8ff3d;
}

.secondary-button:hover,
button:hover:not(:disabled) {
  border-color: #c8ff3d;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  padding: 28px;
}

.mode-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 390px;
  padding: 26px;
  border: 1px solid rgba(245, 247, 242, 0.14);
  border-radius: 16px;
  background: #121617;
}

.mode-card.local-card {
  border-color: rgba(200, 255, 61, 0.52);
  background: linear-gradient(145deg, rgba(200, 255, 61, 0.09), #121617 48%);
}

.mode-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  margin-bottom: 18px;
  border-radius: 14px;
  color: #0b0d0e;
  background: #c8ff3d;
  font-size: 24px;
}

.cloud-card .mode-icon {
  color: #f5f7f2;
  background: #303839;
}

.mode-badges {
  display: flex;
  gap: 7px;
}

.mode-badges span,
.kept-badge,
.no-upload-badge {
  padding: 4px 7px;
  border-radius: 999px;
  color: #0b0d0e;
  background: #c8ff3d;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.05em;
}

.mode-badges.cloud span {
  color: #dce3dd;
  background: #303839;
}

.mode-card h3 {
  margin: 14px 0 8px;
  font-size: 23px;
}

.mode-card button,
.mode-card p,
.mode-card li {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.mode-card p,
.mode-card li,
.mode-privacy {
  color: #a3aca5;
  font-size: 13px;
  line-height: 1.65;
}

.mode-card ul {
  flex: 1;
  margin: 12px 0 22px;
  padding-left: 20px;
}

.mode-privacy {
  grid-column: 1 / -1;
  margin: 0;
  text-align: center;
}

.local-editor {
  min-height: 640px;
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
}

.controls-panel {
  min-height: 0;
  border-right: 1px solid rgba(245, 247, 242, 0.14);
  background: #121617;
}

.back-mode-button {
  margin: 14px 16px 2px;
  padding: 0 12px;
  color: #a3aca5;
  background: transparent;
}

.control-section {
  padding: 18px 16px;
  border-bottom: 1px solid rgba(245, 247, 242, 0.12);
}

.section-heading,
.preview-toolbar,
.file-summary,
.export-row,
.export-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-heading {
  margin-bottom: 12px;
}

.section-heading h3 {
  margin: 0;
  font-size: 13px;
}

.upload-button {
  width: 100%;
  min-height: 70px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 10px 14px;
  border-style: dashed;
  text-align: left;
}

.upload-button span,
.file-summary,
.resolved-size,
.sheet-summary {
  color: #a3aca5;
  font-size: 11px;
}

.file-summary {
  margin-top: 8px;
}

.file-summary span:first-child {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.background-options button,
.custom-color {
  min-width: 0;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 6px;
  border: 1px solid rgba(245, 247, 242, 0.14);
  border-radius: 9px;
  color: #a3aca5;
  background: #1a1f20;
  font-size: 11px;
  cursor: pointer;
}

.background-options .selected,
.custom-color.selected {
  color: #f5f7f2;
  border-color: #c8ff3d;
}

.color-dot {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border: 1px solid rgba(0, 0, 0, 0.28);
  border-radius: 50%;
}

.custom-color input {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
}

.range-control {
  min-height: 44px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 48px;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  color: #a3aca5;
  font-size: 11px;
}

.range-control input {
  accent-color: #c8ff3d;
}

.range-control output {
  color: #f5f7f2;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.compact-range {
  margin-top: 14px;
}

.experiment-notice {
  margin: 10px 0 0;
  padding: 10px;
  border-left: 3px solid #c8ff3d;
  color: #a3aca5;
  background: rgba(200, 255, 61, 0.06);
  font-size: 11px;
  line-height: 1.55;
}

.experiment-notice strong {
  color: #c8ff3d;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 3px;
  border-radius: 10px;
  background: #0b0d0e;
}

.segmented-control button {
  min-height: 44px;
  border-color: transparent;
  background: transparent;
  font-size: 11px;
}

.segmented-control button.active {
  color: #0b0d0e;
  background: #c8ff3d;
}

.preset-grid,
.number-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-top: 10px;
}

.preset-grid button {
  min-height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
}

.preset-grid button span {
  color: #a3aca5;
  font-size: 9px;
}

.preset-grid button.selected {
  border-color: #c8ff3d;
  background: rgba(200, 255, 61, 0.08);
}

.number-grid label,
.export-row label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #a3aca5;
  font-size: 11px;
}

.number-grid input,
.export-row select {
  min-width: 0;
  min-height: 44px;
  box-sizing: border-box;
  padding: 8px;
  color: #f5f7f2;
  border: 1px solid rgba(245, 247, 242, 0.14);
  border-radius: 9px;
  background: #0b0d0e;
}

.mm-grid {
  grid-template-columns: repeat(3, 1fr);
}

.resolved-size {
  margin: 10px 0 0;
}

.resolved-size strong {
  color: #f5f7f2;
}

.text-button {
  width: 100%;
  margin-top: 6px;
  color: #a3aca5;
  background: transparent;
}

.preview-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: #171b1c;
}

.preview-toolbar {
  margin-bottom: 12px;
}

.preview-toolbar > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.preview-toolbar span:not(.no-upload-badge) {
  color: #a3aca5;
  font-size: 11px;
}

.preview-stage {
  position: relative;
  min-height: 420px;
  flex: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: 20px;
  border: 1px solid rgba(245, 247, 242, 0.1);
  border-radius: 14px;
  background-color: #202627;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.025) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.025) 25%, transparent 25%);
  background-size: 16px 16px;
}

.photo-preview-canvas {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
  box-shadow: 0 16px 45px rgba(0, 0, 0, 0.45);
}

.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: #a3aca5;
  text-align: center;
}

.preview-empty > div {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #0b0d0e;
  background: #c8ff3d;
  font-size: 28px;
}

.processing-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(11, 13, 14, 0.76);
  backdrop-filter: blur(3px);
}

.processing-overlay button {
  padding: 0 14px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(200, 255, 61, 0.2);
  border-top-color: #c8ff3d;
  border-radius: 50%;
  animation: standard-photo-spin 0.8s linear infinite;
}

.error-message {
  margin: 10px 0 0;
  padding: 10px 12px;
  color: #ffd8d4;
  border: 1px solid #a8463f;
  border-radius: 9px;
  background: rgba(125, 41, 37, 0.68);
  font-size: 12px;
}

.export-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(245, 247, 242, 0.12);
  border-radius: 13px;
  background: #121617;
}

.export-row label {
  flex: 1;
}

.export-row input {
  accent-color: #c8ff3d;
}

.export-actions {
  margin-top: 12px;
}

.export-actions button {
  flex: 1;
}

.sheet-summary {
  margin: 10px 0 0;
  text-align: center;
}

.visually-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

.standard-photo-fade-enter-active,
.standard-photo-fade-leave-active {
  transition: opacity 160ms ease;
}

.standard-photo-fade-enter-from,
.standard-photo-fade-leave-to {
  opacity: 0;
}

@keyframes standard-photo-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 860px) {
  .standard-photo-overlay {
    align-items: end;
    padding: 0;
  }

  .standard-photo-dialog {
    width: 100%;
    max-height: 94vh;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 18px 18px 0 0;
  }

  .mode-grid,
  .local-editor {
    grid-template-columns: 1fr;
  }

  .mode-card {
    min-height: 0;
  }

  .controls-panel {
    border-right: 0;
  }

  .preview-panel {
    padding: 14px;
  }

  .preview-stage {
    min-height: 340px;
  }
}

@media (max-width: 520px) {
  .dialog-header {
    padding: 16px;
  }

  .mode-grid {
    padding: 16px;
  }

  .mode-card {
    padding: 20px;
  }

  .background-options,
  .preset-grid,
  .number-grid,
  .mm-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .export-actions,
  .export-row {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
