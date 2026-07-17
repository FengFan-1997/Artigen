<template>
  <div class="editor-v2" @dragover.prevent @drop.prevent="onDrop">
    <header class="editor-topbar">
      <div class="topbar-group brand-group">
        <button class="icon-button" type="button" aria-label="返回" title="返回" @click="goBack">←</button>
        <div class="product-title">
          <strong>图片编辑器</strong>
          <span>2.0</span>
        </div>
      </div>

      <div class="topbar-group history-group" aria-label="编辑历史">
        <button class="icon-button" type="button" :disabled="!canUndo" aria-label="撤销" @click="store.undo">
          ↶
        </button>
        <button class="icon-button" type="button" :disabled="!canRedo" aria-label="重做" @click="store.redo">
          ↷
        </button>
        <span
          class="save-status"
          :class="`is-${autosaveState.status}`"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >{{ saveStatusText }}</span>
      </div>

      <div class="topbar-group action-group">
        <button class="quiet-button desktop-action" type="button" @click="store.newProject">新建设计</button>
        <button class="quiet-button" type="button" @click="openFilePicker">导入</button>
        <button
          class="primary-button"
          type="button"
          :disabled="!hasLayers"
          @click="exportPanelOpen = true"
        >
          导出
        </button>
        <button
          ref="layersPanelButtonRef"
          class="icon-button mobile-only"
          type="button"
          :aria-label="mobilePanel === 'layers' ? '关闭图层面板' : '打开图层面板'"
          aria-controls="editor-v2-layers-panel"
          :aria-expanded="mobilePanel === 'layers'"
          @click="toggleMobilePanel('layers')"
        >
          ☰
        </button>
        <button
          ref="propertiesPanelButtonRef"
          class="icon-button mobile-only"
          type="button"
          :aria-label="mobilePanel === 'properties' ? '关闭属性面板' : '打开属性面板'"
          aria-controls="editor-v2-properties-panel"
          :aria-expanded="mobilePanel === 'properties'"
          @click="toggleMobilePanel('properties')"
        >
          ◫
        </button>
      </div>
    </header>

    <div v-if="recoveredDraft" class="recovery-banner" role="status">
      已恢复上次自动保存的草稿。
      <button type="button" @click="recoveredDraft = false">知道了</button>
    </div>
    <div v-if="storageError" class="storage-warning" role="alert">{{ storageError }}</div>

    <div class="editor-workspace">
      <aside
        id="editor-v2-layers-panel"
        ref="layersPanelRef"
        class="left-panel"
        :class="{
          'mobile-open': mobilePanel === 'layers',
          'mobile-suppressed': isCompactViewport && mobilePanel !== null && mobilePanel !== 'layers'
        }"
        aria-label="工具和图层"
        :role="isCompactViewport ? 'dialog' : undefined"
        :aria-modal="isCompactViewport && mobilePanel === 'layers' ? 'true' : undefined"
        :aria-hidden="isCompactViewport && mobilePanel !== 'layers'"
        :inert="isCompactViewport && mobilePanel !== 'layers'"
        @keydown="onMobilePanelKeydown($event, 'layers')"
      >
        <div class="mobile-panel-heading mobile-only">
          <strong>工具与图层</strong>
          <button class="icon-button" type="button" aria-label="关闭面板" @click="mobilePanel = null">×</button>
        </div>

        <section class="panel-section tool-section" aria-labelledby="tools-title">
          <div class="section-heading">
            <h2 id="tools-title">添加</h2>
          </div>
          <div class="tool-grid">
            <button type="button" aria-label="添加图片图层" @click="openFilePicker"><span>▧</span>图片</button>
            <button type="button" aria-label="添加文字图层" @click="store.addText"><span>T</span>文字</button>
            <button type="button" aria-label="添加矩形图层" @click="store.addRect"><span>□</span>矩形</button>
            <button type="button" aria-label="添加椭圆图层" @click="store.addEllipse"><span>○</span>椭圆</button>
            <button type="button" aria-label="添加直线图层" @click="store.addLine"><span>╱</span>直线</button>
          </div>
        </section>

        <section class="panel-section layers-section" aria-labelledby="layers-title">
          <div class="section-heading">
            <h2 id="layers-title">图层</h2>
            <button
              class="small-icon-button"
              type="button"
              :disabled="!canDeleteSelection"
              aria-label="删除所选图层"
              title="删除"
              @click="store.removeSelectedLayers"
            >
              ⌫
            </button>
          </div>
          <div v-if="!orderedLayers.length" class="panel-empty">导入图片或添加元素后，图层会显示在这里。</div>
          <ol v-else class="layer-list">
            <li
              v-for="layer in [...orderedLayers].reverse()"
              :key="layer.id"
              :class="{ selected: selectedLayerIds.includes(layer.id), muted: !layer.visible }"
            >
              <button
                class="layer-main"
                type="button"
                :aria-pressed="selectedLayerIds.includes(layer.id)"
                @click="selectLayerFromPanel(layer.id, $event)"
              >
                <span class="layer-kind">{{ layerTypeLabel(layer.type) }}</span>
                <span class="layer-name">{{ layer.name }}</span>
              </button>
              <button
                class="small-icon-button"
                type="button"
                :aria-label="layer.visible ? `隐藏 ${layer.name}` : `显示 ${layer.name}`"
                @click="store.toggleLayerVisibility(layer.id)"
              >
                {{ layer.visible ? '◉' : '○' }}
              </button>
              <button
                class="small-icon-button"
                type="button"
                :aria-label="layer.locked ? `解锁 ${layer.name}` : `锁定 ${layer.name}`"
                @click="store.toggleLayerLock(layer.id)"
              >
                {{ layer.locked ? '▣' : '▢' }}
              </button>
            </li>
          </ol>
          <div v-if="selectedLayer" class="layer-order-actions">
            <button type="button" @click="store.moveLayer(selectedLayer.id, 'up')">上移</button>
            <button type="button" @click="store.moveLayer(selectedLayer.id, 'down')">下移</button>
            <button type="button" @click="store.moveLayer(selectedLayer.id, 'front')">置顶</button>
            <button type="button" @click="store.moveLayer(selectedLayer.id, 'back')">置底</button>
          </div>
        </section>
      </aside>

      <main ref="stageRef" class="editor-stage" aria-label="设计画板">
        <div v-if="isRendering" class="stage-status" role="status">正在更新画板…</div>
        <div v-if="!hasLayers" class="empty-stage">
          <div class="empty-mark">＋</div>
          <h1>从一张图片开始</h1>
          <p>每次导入只创建一个普通图层，不会自动拆分或破坏原图。</p>
          <button class="primary-button large" type="button" @click="openFilePicker">选择图片</button>
          <span>也可以把图片拖到这里</span>
        </div>
        <div ref="canvasHostRef" class="canvas-host" :class="{ empty: !hasLayers }">
          <canvas ref="canvasRef" aria-label="可交互图片画板"></canvas>
        </div>
        <div v-if="hasLayers" class="zoom-chip">{{ Math.round(viewportScale * 100) }}%</div>
        <div v-if="imageToolMode === 'crop'" ref="mobileToolStripRef" class="mobile-tool-strip">
          <strong>裁剪</strong>
          <button type="button" @click="insetCrop">向内 5%</button>
          <button type="button" @click="resetCrop">重置</button>
          <button class="done" type="button" @click="imageToolMode = 'none'">完成</button>
        </div>
        <div v-if="processing" class="processing-card" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <div>
            <strong>{{ processing.label }}</strong>
            <small>像素处理在本地 Worker 中运行</small>
          </div>
          <button type="button" @click="store.cancelProcessing">取消</button>
        </div>
      </main>

      <aside
        id="editor-v2-properties-panel"
        ref="propertiesPanelRef"
        class="right-panel"
        :class="{
          'mobile-open': mobilePanel === 'properties',
          'mobile-suppressed': isCompactViewport && mobilePanel !== null && mobilePanel !== 'properties'
        }"
        aria-label="属性面板"
        :role="isCompactViewport ? 'dialog' : undefined"
        :aria-modal="isCompactViewport && mobilePanel === 'properties' ? 'true' : undefined"
        :aria-hidden="isCompactViewport && mobilePanel !== 'properties'"
        :inert="isCompactViewport && mobilePanel !== 'properties'"
        @keydown="onMobilePanelKeydown($event, 'properties')"
      >
        <div class="mobile-panel-heading mobile-only">
          <strong>属性</strong>
          <button class="icon-button" type="button" aria-label="关闭面板" @click="mobilePanel = null">×</button>
        </div>

        <section class="panel-section" aria-labelledby="artboard-title">
          <div class="section-heading"><h2 id="artboard-title">画板</h2></div>
          <div class="preset-row">
            <button type="button" @click="applyArtboardPreset(1080, 1080)">方形</button>
            <button type="button" @click="applyArtboardPreset(1080, 1350)">竖版</button>
            <button type="button" @click="applyArtboardPreset(1920, 1080)">横版</button>
          </div>
          <div class="field-grid two-columns">
            <label>
              宽度 px
              <input
                type="number"
                min="1"
                max="16384"
                :value="document.artboard.width"
                @change="updateArtboardNumber('width', $event)"
              />
            </label>
            <label>
              高度 px
              <input
                type="number"
                min="1"
                max="16384"
                :value="document.artboard.height"
                @change="updateArtboardNumber('height', $event)"
              />
            </label>
          </div>
          <div class="background-row">
            <button
              class="transparent-choice"
              type="button"
              :aria-pressed="document.artboard.background.type === 'transparent'"
              @click="store.updateArtboard({ background: { type: 'transparent' } })"
            >
              透明
            </button>
            <label class="color-choice">
              背景
              <input
                type="color"
                :value="artboardColor"
                @change="updateArtboardColor"
              />
            </label>
          </div>
        </section>

        <template v-if="selectedLayer">
          <section class="panel-section" aria-labelledby="layer-properties-title">
            <div class="section-heading"><h2 id="layer-properties-title">所选图层</h2></div>
            <label class="stacked-field">
              名称
              <input type="text" :value="selectedLayer.name" @change="updateLayerName" />
            </label>
            <div class="field-grid two-columns compact">
              <label>
                X
                <input type="number" :value="roundedTransform.x" @change="updateTransformNumber('x', $event)" />
              </label>
              <label>
                Y
                <input type="number" :value="roundedTransform.y" @change="updateTransformNumber('y', $event)" />
              </label>
              <label>
                旋转 °
                <input type="number" :value="roundedTransform.rotation" @change="updateTransformNumber('rotation', $event)" />
              </label>
              <label>
                不透明度 %
                <input
                  type="number"
                  min="0"
                  max="100"
                  :value="Math.round(selectedLayer.transform.opacity * 100)"
                  @change="updateOpacity"
                />
              </label>
            </div>
            <div class="button-row">
              <button type="button" @click="store.flipSelected('x')">水平翻转</button>
              <button type="button" @click="store.flipSelected('y')">垂直翻转</button>
            </div>
          </section>

          <section v-if="selectedLayerIds.length > 1" class="panel-section" aria-labelledby="align-title">
            <div class="section-heading"><h2 id="align-title">多选对齐</h2></div>
            <div class="button-grid three-columns">
              <button type="button" @click="store.alignSelected('left')">左</button>
              <button type="button" @click="store.alignSelected('center')">中</button>
              <button type="button" @click="store.alignSelected('right')">右</button>
              <button type="button" @click="store.alignSelected('top')">上</button>
              <button type="button" @click="store.alignSelected('middle')">居中</button>
              <button type="button" @click="store.alignSelected('bottom')">下</button>
            </div>
            <div class="button-grid two-columns distribution-actions">
              <button
                type="button"
                :disabled="selectedLayerIds.length < 3"
                @click="store.distributeSelected('horizontal')"
              >水平分布</button>
              <button
                type="button"
                :disabled="selectedLayerIds.length < 3"
                @click="store.distributeSelected('vertical')"
              >垂直分布</button>
            </div>
          </section>

          <section v-if="selectedLayer.type === 'text'" class="panel-section" aria-labelledby="text-title">
            <div class="section-heading"><h2 id="text-title">文字</h2></div>
            <label class="stacked-field">
              内容
              <textarea rows="4" :value="selectedLayer.text" @input="updateText"></textarea>
            </label>
            <div class="field-grid two-columns">
              <label>
                字号
                <input type="number" min="8" max="800" :value="selectedLayer.fontSize" @change="updateTextSize" />
              </label>
              <label class="color-choice inline-color">
                颜色
                <input type="color" :value="selectedLayer.fill" @change="updateLayerFill" />
              </label>
            </div>
          </section>

          <section
            v-if="selectedLayer.type === 'rect' || selectedLayer.type === 'ellipse'"
            class="panel-section"
            aria-labelledby="shape-title"
          >
            <div class="section-heading"><h2 id="shape-title">形状</h2></div>
            <label class="color-choice inline-color">
              填充颜色
              <input type="color" :value="selectedLayer.fill" @change="updateLayerFill" />
            </label>
          </section>

          <template v-if="selectedLayer.type === 'image'">
            <section class="panel-section" aria-labelledby="local-pixel-title">
              <div class="section-heading">
                <h2 id="local-pixel-title">本地实验工具</h2>
                <span class="local-badge">零上传</span>
              </div>
              <div class="local-tool-grid">
                <button
                  type="button"
                  :disabled="Boolean(processing)"
                  @pointerdown.prevent="enterCropMode"
                  @click="onCropModeClick"
                >非破坏裁剪</button>
                <button
                  type="button"
                  :disabled="Boolean(processing)"
                  @pointerdown.prevent="startManualCutout"
                  @click="onManualCutoutClick"
                >多边形抠图</button>
                <button type="button" :disabled="Boolean(processing)" @click="store.removeSelectedBackground">
                  实验去背景
                </button>
                <button type="button" :disabled="Boolean(processing)" @click="store.enhanceSelectedClarity">
                  清晰度增强
                </button>
              </div>
              <p class="fine-print">均在本地 Worker 运行。去背景依赖均匀边缘检测；复杂发丝与透明材质需人工检查。</p>
            </section>

            <section class="panel-section" aria-labelledby="adjust-title">
              <div class="section-heading">
                <h2 id="adjust-title">非破坏调整</h2>
                <span class="local-badge">本地</span>
              </div>
              <label v-for="control in adjustmentControls" :key="control.key" class="range-field">
                <span>{{ control.label }}</span>
                <input
                  type="range"
                  :min="control.min"
                  :max="control.max"
                  :step="control.step"
                  :value="selectedLayer.adjustments[control.key]"
                  @change="updateAdjustment(control.key, $event)"
                />
                <output>{{ formatAdjustment(control.key, selectedLayer.adjustments[control.key]) }}</output>
              </label>
            </section>

            <section class="panel-section" aria-labelledby="crop-title">
              <div class="section-heading"><h2 id="crop-title">非破坏裁剪</h2></div>
              <div class="field-grid two-columns compact">
                <label v-for="field in cropFields" :key="field.key">
                  {{ field.label }} %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    :value="Math.round(selectedLayer.crop[field.key] * 1000) / 10"
                    @change="updateCrop(field.key, $event)"
                  />
                </label>
              </div>
              <button
                class="full-width-button"
                type="button"
                :disabled="Boolean(processing)"
                @click="store.upscaleSelected"
              >
                本地实验 2× 放大
              </button>
              <p class="fine-print">在 Worker 中插值处理；不会上传。撤销可恢复原始资产。</p>
            </section>
          </template>
        </template>

        <section v-else class="panel-section inspector-empty">
          <strong>未选择图层</strong>
          <p>点击画板元素或图层列表，编辑位置、颜色和图像参数。</p>
        </section>
      </aside>
    </div>

    <div v-if="mobilePanel" class="mobile-scrim mobile-only" aria-hidden="true" @click="mobilePanel = null"></div>

    <ManualCutoutDialog
      :visible="cutoutOpen"
      :image-url="cutoutImageUrl"
      :image-width="cutoutImageWidth"
      :image-height="cutoutImageHeight"
      :processing="Boolean(processing && processing.layerId === cutoutLayerId)"
      @close="closeManualCutout"
      @cancel="store.cancelProcessing"
      @apply="applyManualCutout"
    />

    <div v-if="exportPanelOpen" class="dialog-scrim" @click.self="exportPanelOpen = false">
      <section
        ref="exportDialogRef"
        class="export-dialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        @keydown="onExportDialogKeydown"
      >
        <div class="dialog-heading">
          <div>
            <span class="eyebrow">所见即所得</span>
            <h2 id="export-title">导出设计</h2>
          </div>
          <button class="icon-button" type="button" aria-label="关闭导出面板" @click="exportPanelOpen = false">×</button>
        </div>
        <div class="export-fields">
          <label class="stacked-field">
            文件名
            <input v-model="exportOptions.filename" type="text" />
          </label>
          <div class="field-grid two-columns">
            <label>
              格式
              <select v-model="exportOptions.format">
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
            </label>
            <label>
              尺寸
              <select v-model.number="exportOptions.scale">
                <option :value="1">1×</option>
                <option :value="2">2×</option>
                <option :value="3">3×</option>
              </select>
            </label>
            <label>
              范围
              <select v-model="exportOptions.bounds">
                <option value="artboard">完整画板</option>
                <option value="content">内容边界</option>
              </select>
            </label>
            <label>
              质量 {{ Math.round(exportOptions.quality * 100) }}%
              <input v-model.number="exportOptions.quality" type="range" min="0.1" max="1" step="0.05" />
            </label>
          </div>
          <div class="background-row export-background">
            <button
              type="button"
              :aria-pressed="exportOptions.background.type === 'transparent'"
              @click="exportOptions.background = { type: 'transparent' }"
            >
              透明背景
            </button>
            <label class="color-choice">
              实色背景
              <input type="color" :value="exportBackgroundColor" @change="updateExportBackground" />
            </label>
          </div>
        </div>
        <p class="export-summary">
          {{ exportSummary }} · sRGB
        </p>
        <button class="primary-button large full-width-button" type="button" :disabled="isExporting" @click="performExport">
          {{ isExporting ? '正在导出…' : '下载图片' }}
        </button>
        <button v-if="isExporting" class="secondary-button full-width-button" type="button" @click="store.cancelExport">
          取消导出
        </button>
      </section>
    </div>

    <input
      ref="fileInputRef"
      class="visually-hidden"
      type="file"
      aria-label="导入图片"
      accept="image/png,image/jpeg,image/webp"
      @change="onFileChange"
    />
    <div class="visually-hidden" aria-live="polite">{{ operationError }}</div>
    <button v-if="operationError" class="error-toast" type="button" @click="store.clearError">
      {{ operationError }} <span>关闭</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import type { EditorLayerType, ImageAdjustments, NormalizedCrop } from '../editor/domain/types';
import type { EditorExportOptions } from '../editor/export/exportRenderer';
import { FabricEditorEngine } from '../editor/engine/FabricEditorEngine';
import ManualCutoutDialog from '../editor/components/ManualCutoutDialog.vue';
import { useImageEditorV2Store } from '../editor/store/editorStore';
import type { NormalizedPixelPoint } from '../editor/workers/protocol';
import {
  loadInitialEditorImport,
  takeInitialEditorImport,
  type InitialEditorImport
} from '../editor/import/editorImport';

const store = useImageEditorV2Store();
const route = useRoute();
const router = useRouter();
const {
  document,
  selectedLayerIds,
  selectedLayer,
  orderedLayers,
  canUndo,
  canRedo,
  hasLayers,
  canDeleteSelection,
  recoveredDraft,
  autosaveState,
  storageError,
  operationError,
  processing
} = storeToRefs(store);

const fileInputRef = ref<HTMLInputElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const stageRef = ref<HTMLElement | null>(null);
const canvasHostRef = ref<HTMLElement | null>(null);
const exportDialogRef = ref<HTMLElement | null>(null);
const layersPanelRef = ref<HTMLElement | null>(null);
const propertiesPanelRef = ref<HTMLElement | null>(null);
const mobileToolStripRef = ref<HTMLElement | null>(null);
const layersPanelButtonRef = ref<HTMLButtonElement | null>(null);
const propertiesPanelButtonRef = ref<HTMLButtonElement | null>(null);
const engine = shallowRef<FabricEditorEngine | null>(null);
const resizeObserver = shallowRef<ResizeObserver | null>(null);
const viewportScale = ref(1);
const isRendering = ref(false);
const isExporting = ref(false);
const exportPanelOpen = ref(false);
const mobilePanel = ref<'layers' | 'properties' | null>(null);
const isCompactViewport = ref(false);
const imageToolMode = ref<'none' | 'crop' | 'cutout'>('none');
const cutoutOpen = ref(false);
const cutoutImageUrl = ref('');
const cutoutLayerId = ref('');
let exportReturnFocus: HTMLElement | null = null;
let mobilePanelReturnFocus: HTMLElement | null = null;
let compactViewportQuery: MediaQueryList | null = null;

const adjustmentControls: Array<{
  key: keyof ImageAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'brightness', label: '亮度', min: -1, max: 1, step: 0.05 },
  { key: 'contrast', label: '对比度', min: -1, max: 1, step: 0.05 },
  { key: 'saturation', label: '饱和度', min: -1, max: 1, step: 0.05 },
  { key: 'hue', label: '色相', min: -180, max: 180, step: 1 },
  { key: 'blur', label: '模糊', min: 0, max: 40, step: 1 },
  { key: 'grayscale', label: '灰度', min: 0, max: 1, step: 0.05 },
  { key: 'sepia', label: '棕褐色', min: 0, max: 1, step: 0.05 }
];
const cropFields: Array<{ key: keyof NormalizedCrop; label: string }> = [
  { key: 'x', label: '左' },
  { key: 'y', label: '上' },
  { key: 'width', label: '宽' },
  { key: 'height', label: '高' }
];
const exportOptions = reactive<EditorExportOptions>({
  format: 'png',
  scale: 1,
  quality: 0.92,
  bounds: 'artboard',
  background: { type: 'transparent' },
  filename: 'artigen-design'
});

const saveStatusText = computed(() => {
  if (autosaveState.value.status === 'pending') return '等待自动保存';
  if (autosaveState.value.status === 'saving') return '正在保存';
  if (autosaveState.value.status === 'saved') return '已自动保存';
  if (autosaveState.value.status === 'error') return '保存失败';
  return '本地草稿';
});
const artboardColor = computed(() =>
  document.value.artboard.background.type === 'color' ? document.value.artboard.background.color : '#ffffff'
);
const exportBackgroundColor = computed(() =>
  exportOptions.background.type === 'color' ? exportOptions.background.color : '#ffffff'
);
const roundedTransform = computed(() => {
  const transform = selectedLayer.value?.transform;
  return {
    x: Math.round(transform?.x ?? 0),
    y: Math.round(transform?.y ?? 0),
    rotation: Math.round((transform?.rotation ?? 0) * 10) / 10
  };
});
const exportSummary = computed(() => {
  const width = Math.round(document.value.artboard.width * exportOptions.scale);
  const height = Math.round(document.value.artboard.height * exportOptions.scale);
  return exportOptions.bounds === 'content'
    ? `内容边界 · ${exportOptions.scale}×`
    : `${width} × ${height} px`;
});
const cutoutImageWidth = computed(() =>
  selectedLayer.value?.type === 'image' ? selectedLayer.value.naturalWidth : 1
);
const cutoutImageHeight = computed(() =>
  selectedLayer.value?.type === 'image' ? selectedLayer.value.naturalHeight : 1
);

onMounted(async () => {
  const initialImport = takeInitialEditorImport(route.query, window.localStorage);
  if (initialImport) clearCompatibilityImportQuery();
  compactViewportQuery = window.matchMedia('(max-width: 820px)');
  isCompactViewport.value = compactViewportQuery.matches;
  compactViewportQuery.addEventListener('change', onCompactViewportChange);
  await store.initialize();
  await nextTick();
  if (!canvasRef.value) return;
  engine.value = new FabricEditorEngine(canvasRef.value, {
    onSelectionChange: store.setSelection,
    onTransform: store.updateLayerTransform
  });
  await projectDocument();
  if (stageRef.value) {
    resizeObserver.value = new ResizeObserver(fitCanvas);
    resizeObserver.value.observe(stageRef.value);
  }
  window.addEventListener('keydown', onGlobalKeydown);
  if (initialImport) await importCompatibilityAsset(initialImport);
});

watch(document, () => {
  void projectDocument();
});

watch(selectedLayerIds, (ids) => {
  engine.value?.setSelection(ids);
  if (cutoutLayerId.value && !ids.includes(cutoutLayerId.value)) closeManualCutout();
  if (selectedLayer.value?.type !== 'image') imageToolMode.value = 'none';
});

watch(exportPanelOpen, async (open) => {
  if (!open) {
    if (isExporting.value) store.cancelExport();
    exportReturnFocus?.focus();
    exportReturnFocus = null;
    return;
  }
  exportReturnFocus = globalThis.document.activeElement instanceof HTMLElement
    ? globalThis.document.activeElement
    : null;
  exportOptions.background = document.value.artboard.background.type === 'transparent'
    ? { type: 'transparent' }
    : { type: 'color', color: document.value.artboard.background.color };
  await nextTick();
  exportDialogRef.value?.focus();
});

watch(mobilePanel, async (panel) => {
  if (!isCompactViewport.value) return;
  if (!panel) {
    await nextTick();
    mobilePanelReturnFocus?.focus();
    mobilePanelReturnFocus = null;
    return;
  }
  await nextTick();
  const panelElement = panel === 'layers' ? layersPanelRef.value : propertiesPanelRef.value;
  panelElement?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  resizeObserver.value?.disconnect();
  compactViewportQuery?.removeEventListener('change', onCompactViewportChange);
  void store.disposeRuntime();
  engine.value?.dispose();
});

async function projectDocument(): Promise<void> {
  if (!engine.value) return;
  isRendering.value = true;
  try {
    await engine.value.project(document.value, store.getAssetUrl);
    fitCanvas();
  } catch (error) {
    console.error('Editor projection failed', error);
  } finally {
    isRendering.value = false;
  }
}

function fitCanvas(): void {
  if (!engine.value || !stageRef.value) return;
  viewportScale.value = engine.value.fitToViewport(
    stageRef.value.clientWidth,
    stageRef.value.clientHeight,
    window.innerWidth < 900 ? 24 : 64
  );
}

function openFilePicker(): void {
  fileInputRef.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await importFile(file);
}

async function onDrop(event: DragEvent): Promise<void> {
  const file = event.dataTransfer?.files?.[0];
  if (file) await importFile(file);
}

async function importFile(file: File): Promise<void> {
  try {
    await store.addImage(file);
    mobilePanel.value = null;
  } catch (error) {
    console.error('Import failed', error);
  }
}

async function importCompatibilityAsset(source: InitialEditorImport): Promise<void> {
  try {
    const file = await loadInitialEditorImport(source);
    await store.addImage(file);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
      EDITOR_TRANSFER_INVALID: '编辑器传输链接无效。',
      EDITOR_TRANSFER_NOT_AVAILABLE: '编辑器传输已过期、已使用或不属于当前账号。',
      EDITOR_TRANSFER_FAILED: '暂时无法读取编辑器传输，请重新发起编辑。',
      EDITOR_TRANSFER_ASSET_FAILED: '传输图片已不可用，请重新发起编辑。',
      EDITOR_PREFILL_FETCH_FAILED: '无法读取旧版预填图片；外域图片可能未允许浏览器跨域访问。',
      EDITOR_PREFILL_PROTOCOL_UNSUPPORTED: '旧版预填仅支持 HTTPS/HTTP 图片。',
      EDITOR_IMPORT_TOO_LARGE: '预填图片不能超过 50MB。'
    };
    store.reportOperationError(messages[code] ?? '无法导入预填图片，请保存后手动导入。');
  }
}

function clearCompatibilityImportQuery(): void {
  const query = { ...route.query };
  delete query.transferId;
  delete query.img;
  delete query.image;
  delete query.prefill;
  void router.replace({ path: route.path, query, hash: route.hash }).catch(() => {});
}

function selectLayerFromPanel(layerId: string, event: MouseEvent): void {
  if (event.shiftKey || event.metaKey || event.ctrlKey) {
    const selected = new Set(selectedLayerIds.value);
    if (selected.has(layerId)) selected.delete(layerId);
    else selected.add(layerId);
    store.setSelection([...selected]);
  } else {
    store.setSelection([layerId]);
  }
}

function updateLayerName(event: Event): void {
  store.patchSelectedLayer({ name: (event.currentTarget as HTMLInputElement).value }, '重命名图层');
}

function updateTransformNumber(key: 'x' | 'y' | 'rotation', event: Event): void {
  const layer = selectedLayer.value;
  if (!layer) return;
  const value = readNumber(event, layer.transform[key]);
  store.updateLayerTransform(layer.id, { ...layer.transform, [key]: value });
}

function updateOpacity(event: Event): void {
  const layer = selectedLayer.value;
  if (!layer) return;
  const value = Math.min(100, Math.max(0, readNumber(event, layer.transform.opacity * 100))) / 100;
  store.updateLayerTransform(layer.id, { ...layer.transform, opacity: value });
}

function updateText(event: Event): void {
  store.updateText((event.currentTarget as HTMLTextAreaElement).value);
}

function updateTextSize(event: Event): void {
  const layer = selectedLayer.value;
  if (layer?.type !== 'text') return;
  store.patchSelectedLayer({ fontSize: readNumber(event, layer.fontSize) } as Partial<typeof layer>, '修改字号');
}

function updateLayerFill(event: Event): void {
  const layer = selectedLayer.value;
  if (!layer || layer.type === 'image' || layer.type === 'line') return;
  store.patchSelectedLayer(
    { fill: (event.currentTarget as HTMLInputElement).value } as Partial<typeof layer>,
    '修改颜色'
  );
}

function updateAdjustment(key: keyof ImageAdjustments, event: Event): void {
  const layer = selectedLayer.value;
  if (layer?.type !== 'image') return;
  store.updateImageAdjustments({ [key]: readNumber(event, layer.adjustments[key]) });
}

function updateCrop(key: keyof NormalizedCrop, event: Event): void {
  const layer = selectedLayer.value;
  if (layer?.type !== 'image') return;
  const next = { ...layer.crop, [key]: readNumber(event, layer.crop[key] * 100) / 100 };
  store.updateImageCrop(next);
}

function enterCropMode(): void {
  if (selectedLayer.value?.type !== 'image') return;
  imageToolMode.value = 'crop';
  // This action moves keyboard interaction to the compact crop controls, so it
  // must not restore focus to the sheet trigger. On WebKit that restoration can
  // re-activate the trigger while the originating pointer event is settling.
  mobilePanelReturnFocus = null;
  mobilePanel.value = null;
  void nextTick(() => mobileToolStripRef.value?.querySelector<HTMLElement>('button')?.focus());
}

function onCropModeClick(event: MouseEvent): void {
  // Pointer input is handled on pointerdown before WebKit can lose the click
  // while the sheet starts moving. Native keyboard activation has detail 0.
  if (event.detail === 0) enterCropMode();
}

async function startManualCutout(): Promise<void> {
  const layer = selectedLayer.value;
  if (layer?.type !== 'image') return;
  imageToolMode.value = 'cutout';
  cutoutLayerId.value = layer.id;
  mobilePanelReturnFocus = null;
  mobilePanel.value = null;
  try {
    const url = await store.getAssetUrl(layer.assetId);
    if (selectedLayer.value?.id !== layer.id) return;
    cutoutImageUrl.value = url;
    cutoutOpen.value = true;
  } catch (error) {
    console.error('Unable to open manual cutout', error);
    imageToolMode.value = 'none';
  }
}

function onManualCutoutClick(event: MouseEvent): void {
  if (event.detail === 0) void startManualCutout();
}

async function applyManualCutout(points: NormalizedPixelPoint[]): Promise<void> {
  const applied = await store.applySelectedPolygonCutout(points);
  if (applied) closeManualCutout();
}

function closeManualCutout(): void {
  if (processing.value?.layerId === cutoutLayerId.value) store.cancelProcessing();
  cutoutOpen.value = false;
  cutoutImageUrl.value = '';
  cutoutLayerId.value = '';
  imageToolMode.value = 'none';
}

function resetCrop(): void {
  store.updateImageCrop({ x: 0, y: 0, width: 1, height: 1 });
}

function insetCrop(): void {
  const layer = selectedLayer.value;
  if (layer?.type !== 'image') return;
  const amountX = Math.min(0.025, layer.crop.width / 4);
  const amountY = Math.min(0.025, layer.crop.height / 4);
  store.updateImageCrop({
    x: layer.crop.x + amountX,
    y: layer.crop.y + amountY,
    width: layer.crop.width - amountX * 2,
    height: layer.crop.height - amountY * 2
  });
}

function updateArtboardNumber(key: 'width' | 'height', event: Event): void {
  store.updateArtboard({ [key]: readNumber(event, document.value.artboard[key]) });
}

function updateArtboardColor(event: Event): void {
  store.updateArtboard({
    background: { type: 'color', color: (event.currentTarget as HTMLInputElement).value }
  });
}

function updateExportBackground(event: Event): void {
  exportOptions.background = {
    type: 'color',
    color: (event.currentTarget as HTMLInputElement).value
  };
}

function applyArtboardPreset(width: number, height: number): void {
  store.updateArtboard({ width, height });
}

async function performExport(): Promise<void> {
  if (isExporting.value) return;
  isExporting.value = true;
  try {
    await store.exportDesign({
      ...exportOptions,
      background: exportOptions.background.type === 'transparent'
        ? { type: 'transparent' }
        : { type: 'color', color: exportOptions.background.color }
    });
    exportPanelOpen.value = false;
  } catch {
    // The store exposes a localized aria-live error.
  } finally {
    isExporting.value = false;
  }
}

function onGlobalKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const editingText = target?.matches('input, textarea, select, [contenteditable="true"]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (!editingText && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    store.removeSelectedLayers();
  }
  if (event.key === 'Escape') {
    exportPanelOpen.value = false;
    mobilePanel.value = null;
  }
}

function toggleMobilePanel(panel: 'layers' | 'properties'): void {
  if (mobilePanel.value !== panel) {
    mobilePanelReturnFocus = panel === 'layers'
      ? layersPanelButtonRef.value
      : propertiesPanelButtonRef.value;
  }
  mobilePanel.value = mobilePanel.value === panel ? null : panel;
}

function onCompactViewportChange(event: MediaQueryListEvent): void {
  isCompactViewport.value = event.matches;
  if (!event.matches) {
    mobilePanel.value = null;
    mobilePanelReturnFocus = null;
  }
}

function onMobilePanelKeydown(event: KeyboardEvent, panel: 'layers' | 'properties'): void {
  if (!isCompactViewport.value || mobilePanel.value !== panel) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    mobilePanel.value = null;
    return;
  }
  if (event.key !== 'Tab') return;
  const panelElement = panel === 'layers' ? layersPanelRef.value : propertiesPanelRef.value;
  if (!panelElement) return;
  const focusable = Array.from(panelElement.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) return;
  cycleFocus(event, focusable);
}

function onExportDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    exportPanelOpen.value = false;
    return;
  }
  if (event.key !== 'Tab' || !exportDialogRef.value) return;
  const focusable = Array.from(
    exportDialogRef.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getClientRects().length > 0 && !element.hasAttribute('hidden'));
  if (!focusable.length) return;
  cycleFocus(event, focusable);
}

function cycleFocus(event: KeyboardEvent, focusable: HTMLElement[]): void {
  const currentIndex = focusable.indexOf(globalThis.document.activeElement as HTMLElement);
  const nextIndex = event.shiftKey
    ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
    : currentIndex < 0 || currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1;
  event.preventDefault();
  focusable[nextIndex]?.focus();
}

function goBack(): void {
  if (window.history.length > 1) window.history.back();
  else window.location.assign('/artigen/image-workshop');
}

function readNumber(event: Event, fallback: number): number {
  const value = Number((event.currentTarget as HTMLInputElement).value);
  return Number.isFinite(value) ? value : fallback;
}

function layerTypeLabel(type: EditorLayerType): string {
  return { image: '图', text: '字', rect: '矩', ellipse: '圆', line: '线' }[type];
}

function formatAdjustment(key: keyof ImageAdjustments, value: number): string {
  if (key === 'hue') return `${Math.round(value)}°`;
  if (key === 'blur') return `${Math.round(value)}px`;
  return `${Math.round(value * 100)}%`;
}
</script>

<style scoped>
.editor-v2 {
  --editor-bg: #0b0d0e;
  --editor-panel: #121617;
  --editor-panel-raised: #1a1f20;
  --editor-text: #f5f7f2;
  --editor-muted: #a3aca5;
  --editor-accent: #c8ff3d;
  --editor-border: rgba(245, 247, 242, 0.14);
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  min-width: 320px;
  overflow: hidden;
  color: var(--editor-text);
  background: var(--editor-bg);
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  color: inherit;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--editor-accent);
  outline-offset: 2px;
}

.editor-topbar {
  position: relative;
  z-index: 30;
  min-height: 64px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--editor-border);
  background: rgba(11, 13, 14, 0.96);
}

.topbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-group {
  justify-content: flex-end;
}

.product-title {
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: -0.02em;
}

.product-title strong {
  font-size: 16px;
}

.product-title span,
.local-badge {
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--editor-bg);
  background: var(--editor-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.icon-button,
.small-icon-button,
.quiet-button,
.primary-button,
.tool-grid button,
.layer-order-actions button,
.button-row button,
.button-grid button,
.local-tool-grid button,
.mobile-tool-strip button,
.preset-row button,
.background-row button,
.full-width-button {
  min-height: 44px;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  cursor: pointer;
  background: var(--editor-panel-raised);
  transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease;
}

.icon-button {
  width: 44px;
  padding: 0;
  font-size: 21px;
}

.small-icon-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border-color: transparent;
  background: transparent;
}

.quiet-button,
.primary-button {
  padding: 0 16px;
  font-weight: 700;
}

.primary-button {
  color: var(--editor-bg);
  border-color: var(--editor-accent);
  background: var(--editor-accent);
}

.primary-button.large {
  min-height: 48px;
  padding-inline: 24px;
}

button:hover:not(:disabled) {
  border-color: var(--editor-accent);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.save-status {
  min-width: 88px;
  color: var(--editor-muted);
  font-size: 12px;
}

.save-status.is-error {
  color: #ff928a;
}

.recovery-banner,
.storage-warning {
  position: relative;
  z-index: 20;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  padding: 6px 16px;
  color: var(--editor-bg);
  background: var(--editor-accent);
  font-size: 13px;
  font-weight: 700;
}

.recovery-banner button {
  border: 0;
  text-decoration: underline;
  background: transparent;
  cursor: pointer;
}

.storage-warning {
  color: #ffeae7;
  background: #7d2925;
}

.editor-workspace {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 304px;
}

.left-panel,
.right-panel {
  position: relative;
  z-index: 10;
  min-height: 0;
  overflow: auto;
  background: var(--editor-panel);
  scrollbar-color: #394042 transparent;
}

.left-panel {
  border-right: 1px solid var(--editor-border);
}

.right-panel {
  border-left: 1px solid var(--editor-border);
}

.panel-section {
  padding: 18px 16px;
  border-bottom: 1px solid var(--editor-border);
}

.section-heading,
.dialog-heading,
.mobile-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-heading h2,
.dialog-heading h2 {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.05em;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.tool-grid button {
  min-height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--editor-muted);
  font-size: 12px;
}

.tool-grid button span {
  color: var(--editor-text);
  font-size: 19px;
  font-weight: 800;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.layer-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px 44px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.layer-list li.selected {
  border-color: rgba(200, 255, 61, 0.65);
  background: rgba(200, 255, 61, 0.08);
}

.layer-list li.muted {
  opacity: 0.55;
}

.layer-main {
  min-width: 0;
  min-height: 48px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 0;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.layer-kind {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: var(--editor-bg);
  background: var(--editor-accent);
  font-size: 12px;
  font-weight: 800;
}

.layer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.panel-empty,
.inspector-empty p,
.fine-print {
  margin: 0;
  color: var(--editor-muted);
  font-size: 12px;
  line-height: 1.55;
}

.layer-order-actions,
.button-row,
.preset-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 10px;
}

.layer-order-actions button,
.button-row button,
.preset-row button,
.button-grid button,
.background-row button {
  padding: 0 8px;
  font-size: 12px;
}

.button-row,
.preset-row {
  grid-template-columns: repeat(2, 1fr);
}

.preset-row {
  grid-template-columns: repeat(3, 1fr);
  margin: 0 0 12px;
}

.editor-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background-color: #171b1c;
  background-image:
    linear-gradient(45deg, #1c2122 25%, transparent 25%),
    linear-gradient(-45deg, #1c2122 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1c2122 75%),
    linear-gradient(-45deg, transparent 75%, #1c2122 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}

.canvas-host {
  position: relative;
  max-width: calc(100% - 64px);
  max-height: calc(100% - 64px);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.4);
}

.canvas-host.empty {
  opacity: 0;
  pointer-events: none;
}

.canvas-host :deep(.canvas-container) {
  touch-action: none;
}

.empty-stage {
  position: absolute;
  z-index: 3;
  width: min(430px, calc(100% - 32px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  border: 1px dashed rgba(200, 255, 61, 0.55);
  border-radius: 18px;
  text-align: center;
  background: rgba(11, 13, 14, 0.9);
}

.empty-stage h1 {
  margin: 12px 0 8px;
  font-size: clamp(22px, 3vw, 32px);
}

.empty-stage p {
  margin: 0 0 20px;
  color: var(--editor-muted);
  line-height: 1.6;
}

.empty-stage > span {
  margin-top: 12px;
  color: var(--editor-muted);
  font-size: 12px;
}

.empty-mark {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--editor-bg);
  background: var(--editor-accent);
  font-size: 30px;
}

.zoom-chip,
.stage-status {
  position: absolute;
  z-index: 5;
  bottom: 14px;
  padding: 7px 10px;
  border: 1px solid var(--editor-border);
  border-radius: 999px;
  color: var(--editor-muted);
  background: rgba(11, 13, 14, 0.85);
  font-size: 12px;
}

.zoom-chip {
  right: 14px;
}

.stage-status {
  top: 14px;
  bottom: auto;
}

.processing-card {
  position: absolute;
  z-index: 8;
  bottom: 18px;
  left: 50%;
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 12px;
  min-width: min(420px, calc(100% - 28px));
  padding: 12px;
  border: 1px solid var(--editor-accent);
  border-radius: 13px;
  background: rgba(11, 13, 14, 0.96);
  transform: translateX(-50%);
}

.processing-card div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.processing-card small {
  color: var(--editor-muted);
}

.processing-card button {
  min-height: 44px;
  padding: 0 13px;
  border: 1px solid var(--editor-border);
  border-radius: 9px;
  background: var(--editor-panel-raised);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(200, 255, 61, 0.25);
  border-top-color: var(--editor-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.field-grid {
  display: grid;
  gap: 10px;
}

.field-grid.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-grid label,
.stacked-field,
.range-field,
.color-choice {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--editor-muted);
  font-size: 12px;
}

.field-grid input,
.field-grid select,
.stacked-field input,
.stacked-field textarea,
.export-fields select {
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  padding: 9px 10px;
  color: var(--editor-text);
  border: 1px solid var(--editor-border);
  border-radius: 9px;
  background: var(--editor-bg);
}

.stacked-field textarea {
  min-height: 96px;
  resize: vertical;
}

.background-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.color-choice {
  min-height: 44px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  background: var(--editor-panel-raised);
}

.color-choice input {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
}

.inline-color {
  margin-top: 10px;
}

.button-grid {
  display: grid;
  gap: 6px;
}

.button-grid.three-columns {
  grid-template-columns: repeat(3, 1fr);
}

.button-grid.two-columns {
  grid-template-columns: repeat(2, 1fr);
}

.distribution-actions {
  margin-top: 6px;
}

.local-tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 10px;
}

.local-tool-grid button {
  padding: 0 8px;
  font-size: 12px;
}

.mobile-tool-strip {
  display: none;
}

.range-field {
  display: grid;
  grid-template-columns: 56px 1fr 44px;
  align-items: center;
  margin: 10px 0;
}

.range-field input {
  accent-color: var(--editor-accent);
}

.range-field output {
  color: var(--editor-text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.full-width-button {
  width: 100%;
  margin-top: 12px;
  padding-inline: 12px;
}

.dialog-scrim {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(5px);
}

.export-dialog {
  width: min(520px, 100%);
  max-height: calc(100vh - 36px);
  overflow: auto;
  padding: 24px;
  border: 1px solid rgba(200, 255, 61, 0.45);
  border-radius: 18px;
  background: var(--editor-panel);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55);
}

.dialog-heading h2 {
  margin-top: 4px;
  font-size: 24px;
}

.eyebrow {
  color: var(--editor-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.export-fields {
  display: grid;
  gap: 14px;
}

.export-background {
  margin-top: 0;
}

.export-summary {
  margin: 16px 0 0;
  color: var(--editor-muted);
  font-size: 12px;
  text-align: center;
}

.error-toast {
  position: fixed;
  z-index: 150;
  right: 18px;
  bottom: 18px;
  max-width: min(440px, calc(100vw - 36px));
  min-height: 48px;
  padding: 12px 16px;
  color: #fff;
  border: 1px solid #ff928a;
  border-radius: 12px;
  text-align: left;
  background: #7d2925;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.4);
}

.error-toast span {
  margin-left: 8px;
  text-decoration: underline;
}

.mobile-only {
  display: none;
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

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1040px) {
  .editor-workspace {
    grid-template-columns: 224px minmax(0, 1fr) 270px;
  }

  .desktop-action {
    display: none;
  }
}

@media (max-width: 820px) {
  .mobile-only {
    display: inline-grid;
  }

  .editor-topbar {
    grid-template-columns: 1fr auto;
    gap: 8px;
    min-height: 58px;
    padding: 7px 8px;
  }

  .history-group {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .history-group .save-status {
    display: none;
  }

  .quiet-button {
    display: none;
  }

  .editor-workspace {
    display: block;
    position: relative;
  }

  .editor-stage {
    width: 100%;
    height: 100%;
  }

  .left-panel,
  .right-panel {
    position: absolute;
    z-index: 40;
    left: 10px;
    right: 10px;
    bottom: 10px;
    width: auto;
    max-height: min(62vh, 560px);
    border: 1px solid var(--editor-border);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
    transform: translateY(calc(100% + 24px));
    transition: transform 180ms ease;
  }

  .left-panel.mobile-open,
  .right-panel.mobile-open {
    transform: translateY(0);
  }

  .left-panel.mobile-suppressed,
  .right-panel.mobile-suppressed {
    display: none;
  }

  .mobile-panel-heading {
    position: sticky;
    top: 0;
    z-index: 3;
    min-height: 54px;
    margin: 0;
    padding: 5px 12px;
    border-bottom: 1px solid var(--editor-border);
    background: var(--editor-panel);
  }

  .mobile-scrim {
    position: fixed;
    inset: 58px 0 0;
    z-index: 35;
    border: 0;
    background: rgba(0, 0, 0, 0.55);
  }

  .canvas-host {
    max-width: calc(100% - 24px);
    max-height: calc(100% - 24px);
  }

  .empty-stage {
    padding: 24px 18px;
  }

  .mobile-tool-strip {
    position: absolute;
    z-index: 12;
    right: 10px;
    bottom: 10px;
    left: 10px;
    display: grid;
    grid-template-columns: auto 1fr 1fr 1fr;
    align-items: center;
    gap: 6px;
    padding: 7px;
    border: 1px solid var(--editor-border);
    border-radius: 13px;
    background: rgba(11, 13, 14, 0.95);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
  }

  .mobile-tool-strip strong {
    padding: 0 7px;
    font-size: 12px;
  }

  .mobile-tool-strip button {
    padding: 0 7px;
    font-size: 11px;
  }

  .mobile-tool-strip .done {
    color: var(--editor-bg);
    border-color: var(--editor-accent);
    background: var(--editor-accent);
    font-weight: 800;
  }
}

@media (max-width: 520px) {
  .editor-topbar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .history-group {
    position: static;
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: center;
    transform: none;
  }

  .mobile-scrim {
    inset: 110px 0 0;
  }

  .product-title strong {
    display: none;
  }

  .action-group {
    gap: 5px;
  }

  .primary-button,
  .quiet-button {
    padding-inline: 12px;
  }

  .export-dialog {
    padding: 18px;
  }

  .export-dialog .field-grid.two-columns {
    grid-template-columns: 1fr;
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
}
</style>
