<template>
  <div v-if="visible" class="cutout-overlay" @click.self="close">
    <section
      ref="dialogRef"
      class="cutout-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cutout-title"
      tabindex="-1"
      @keydown="onDialogKeydown"
    >
      <header>
        <div>
          <span>LOCAL EXPERIMENT</span>
          <h2 id="cutout-title">手动多边形抠图</h2>
          <p>沿主体边缘依次点击，至少添加 3 个锚点；最后由本地 Worker 生成透明区域。</p>
        </div>
        <button type="button" aria-label="关闭抠图" @click="close">×</button>
      </header>

      <div ref="stageRef" class="cutout-stage">
        <img :src="imageUrl" alt="待抠图图层" draggable="false" @load="drawOverlay" />
        <canvas
          ref="overlayRef"
          role="img"
          aria-label="多边形锚点画布"
          @pointerdown="addPoint"
        ></canvas>
        <div v-if="!points.length" class="cutout-hint">从主体轮廓任意位置开始点击</div>
        <div v-if="processing" class="cutout-processing" role="status">
          <span></span>
          <strong>正在本地应用蒙版…</strong>
          <button type="button" @click="emit('cancel')">取消</button>
        </div>
      </div>

      <footer>
        <div class="point-status" role="status" aria-live="polite" aria-atomic="true">
          <strong>{{ points.length }}</strong> 个锚点
          <span v-if="points.length > 2">· 多边形已闭合</span>
        </div>
        <div class="keyboard-point-entry" aria-label="键盘添加锚点">
          <label>X% <input v-model.number="keyboardX" type="number" min="0" max="100" /></label>
          <label>Y% <input v-model.number="keyboardY" type="number" min="0" max="100" /></label>
          <button type="button" :disabled="processing" @click="addKeyboardPoint">添加锚点</button>
        </div>
        <div class="cutout-actions">
          <button type="button" :disabled="!points.length || processing" @click="undoPoint">撤销锚点</button>
          <button type="button" :disabled="!points.length || processing" @click="clearPoints">清空</button>
          <button class="apply-button" type="button" :disabled="points.length < 3 || processing" @click="apply">
            应用抠图
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { NormalizedPixelPoint } from '../workers/protocol';

const props = defineProps<{
  visible: boolean;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  processing: boolean;
}>();
const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'cancel'): void;
  (event: 'apply', points: NormalizedPixelPoint[]): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const stageRef = ref<HTMLElement | null>(null);
const overlayRef = ref<HTMLCanvasElement | null>(null);
const points = ref<NormalizedPixelPoint[]>([]);
const keyboardX = ref(50);
const keyboardY = ref(50);
let resizeObserver: ResizeObserver | null = null;
let returnFocus: HTMLElement | null = null;

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      resizeObserver?.disconnect();
      resizeObserver = null;
      points.value = [];
      returnFocus?.focus();
      returnFocus = null;
      return;
    }
    returnFocus = globalThis.document.activeElement instanceof HTMLElement
      ? globalThis.document.activeElement
      : null;
    await nextTick();
    if (stageRef.value) {
      resizeObserver = new ResizeObserver(drawOverlay);
      resizeObserver.observe(stageRef.value);
    }
    drawOverlay();
    dialogRef.value?.focus();
  }
);

watch(points, drawOverlay, { deep: true });
onBeforeUnmount(() => resizeObserver?.disconnect());

function addPoint(event: PointerEvent): void {
  if (props.processing || !overlayRef.value) return;
  const canvas = overlayRef.value;
  const bounds = canvas.getBoundingClientRect();
  const imageBounds = fittedImageBounds(bounds.width, bounds.height);
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (
    x < imageBounds.x ||
    y < imageBounds.y ||
    x > imageBounds.x + imageBounds.width ||
    y > imageBounds.y + imageBounds.height
  ) return;
  points.value.push({
    x: (x - imageBounds.x) / imageBounds.width,
    y: (y - imageBounds.y) / imageBounds.height
  });
}

function undoPoint(): void {
  points.value.pop();
}

function clearPoints(): void {
  points.value = [];
}

function addKeyboardPoint(): void {
  if (props.processing) return;
  points.value.push({
    x: clampPercent(keyboardX.value) / 100,
    y: clampPercent(keyboardY.value) / 100
  });
}

function apply(): void {
  if (points.value.length < 3 || props.processing) return;
  emit('apply', points.value.map((point) => ({ ...point })));
}

function close(): void {
  if (props.processing) emit('cancel');
  emit('close');
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0);
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

function drawOverlay(): void {
  const canvas = overlayRef.value;
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(bounds.width * pixelRatio);
  canvas.height = Math.round(bounds.height * pixelRatio);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (!points.value.length) return;
  const imageBounds = fittedImageBounds(bounds.width, bounds.height);
  const projected = points.value.map((point) => ({
    x: imageBounds.x + point.x * imageBounds.width,
    y: imageBounds.y + point.y * imageBounds.height
  }));
  context.beginPath();
  context.moveTo(projected[0].x, projected[0].y);
  for (const point of projected.slice(1)) context.lineTo(point.x, point.y);
  if (projected.length >= 3) context.closePath();
  context.fillStyle = 'rgba(200, 255, 61, 0.16)';
  context.fill();
  context.strokeStyle = '#C8FF3D';
  context.lineWidth = 2;
  context.stroke();
  for (const [index, point] of projected.entries()) {
    context.beginPath();
    context.arc(point.x, point.y, index === 0 ? 6 : 5, 0, Math.PI * 2);
    context.fillStyle = index === 0 ? '#F5F7F2' : '#C8FF3D';
    context.fill();
    context.strokeStyle = '#0B0D0E';
    context.lineWidth = 2;
    context.stroke();
  }
}

function fittedImageBounds(containerWidth: number, containerHeight: number) {
  const sourceWidth = Math.max(1, props.imageWidth);
  const sourceHeight = Math.max(1, props.imageHeight);
  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 50));
}
</script>

<style scoped>
.cutout-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 18px;
  color: #f5f7f2;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(6px);
}

.cutout-dialog {
  width: min(920px, 100%);
  max-height: calc(100vh - 36px);
  display: grid;
  grid-template-rows: auto minmax(320px, 1fr) auto;
  overflow: hidden;
  border: 1px solid rgba(200, 255, 61, 0.5);
  border-radius: 18px;
  background: #0b0d0e;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.6);
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(245, 247, 242, 0.14);
}

.keyboard-point-entry {
  display: flex;
  align-items: end;
  gap: 6px;
}

.keyboard-point-entry label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #a3aca5;
  font-size: 10px;
}

.keyboard-point-entry input {
  width: 58px;
  min-height: 44px;
  box-sizing: border-box;
  padding: 5px;
  color: #f5f7f2;
  border: 1px solid rgba(245, 247, 242, 0.16);
  border-radius: 8px;
  background: #1a1f20;
}

.keyboard-point-entry button {
  min-height: 44px;
  padding: 0 9px;
  color: #f5f7f2;
  border: 1px solid rgba(245, 247, 242, 0.16);
  border-radius: 8px;
  background: #1a1f20;
}

header span {
  color: #c8ff3d;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.13em;
}

header h2 {
  margin: 3px 0;
  font-size: 21px;
}

header p {
  margin: 0;
  color: #a3aca5;
  font-size: 12px;
}

header button,
.cutout-actions button,
.cutout-processing button {
  min-height: 44px;
  padding: 0 14px;
  color: #f5f7f2;
  border: 1px solid rgba(245, 247, 242, 0.16);
  border-radius: 10px;
  background: #1a1f20;
  cursor: pointer;
}

header button {
  width: 44px;
  padding: 0;
  font-size: 22px;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid #c8ff3d;
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.cutout-stage {
  position: relative;
  min-height: 440px;
  overflow: hidden;
  background-color: #202627;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25%);
  background-size: 16px 16px;
}

.cutout-stage img,
.cutout-stage canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.cutout-stage img {
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.cutout-stage canvas {
  touch-action: none;
  cursor: crosshair;
}

.cutout-hint {
  position: absolute;
  z-index: 2;
  left: 50%;
  bottom: 16px;
  padding: 8px 11px;
  border: 1px solid rgba(245, 247, 242, 0.15);
  border-radius: 999px;
  color: #a3aca5;
  background: rgba(11, 13, 14, 0.88);
  font-size: 11px;
  pointer-events: none;
  transform: translateX(-50%);
}

.cutout-processing {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(11, 13, 14, 0.78);
  backdrop-filter: blur(3px);
}

.cutout-processing > span {
  width: 26px;
  height: 26px;
  border: 3px solid rgba(200, 255, 61, 0.2);
  border-top-color: #c8ff3d;
  border-radius: 50%;
  animation: cutout-spin 0.8s linear infinite;
}

footer {
  border-top: 1px solid rgba(245, 247, 242, 0.14);
  border-bottom: 0;
}

.point-status {
  color: #a3aca5;
  font-size: 12px;
}

.point-status strong {
  color: #c8ff3d;
}

.cutout-actions {
  display: flex;
  gap: 8px;
}

.cutout-actions .apply-button {
  color: #0b0d0e;
  border-color: #c8ff3d;
  background: #c8ff3d;
  font-weight: 800;
}

@keyframes cutout-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 680px) {
  .cutout-overlay {
    align-items: stretch;
    padding: 0;
  }

  .cutout-dialog {
    width: 100%;
    max-height: none;
    border: 0;
    border-radius: 0;
  }

  header {
    padding: 12px;
  }

  header p {
    max-width: 280px;
  }

  .cutout-stage {
    min-height: 0;
  }

  footer {
    position: relative;
    z-index: 5;
    flex-direction: column;
    align-items: stretch;
    padding: 10px;
    background: #0b0d0e;
  }

  .keyboard-point-entry {
    justify-content: center;
  }

  .point-status {
    text-align: center;
  }

  .cutout-actions {
    display: grid;
    grid-template-columns: 1fr 1fr 1.4fr;
  }

  .cutout-actions button {
    padding: 0 8px;
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
</style>
