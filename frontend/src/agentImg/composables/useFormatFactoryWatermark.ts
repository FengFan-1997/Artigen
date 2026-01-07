import { computed, nextTick, ref, type Ref } from 'vue';
import { canvasToBlob, loadImageFromUrl, scaleToMaxSide } from '../logic/formatFactory/canvas';
import { safeBaseName } from '../logic/formatFactory/format';

export const useFormatFactoryWatermark = (input: {
  activeToolId: Ref<string | null>;
  sourceUrl: Ref<string | null>;
  sourceFile: Ref<File | null>;
}) => {
  const wmCanvasRef = ref<HTMLCanvasElement | null>(null);
  const wmOverlayCanvasRef = ref<HTMLCanvasElement | null>(null);
  const wmMode = ref<'blur' | 'pixelate' | 'fill'>('blur');
  const wmBlurPx = ref(12);
  const wmPixelSize = ref(14);
  const wmFillColor = ref('#000000');
  const wmOutFormat = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const wmOutQuality = ref(0.92);
  const wmMaxSide = 1600;

  const wmIsSelecting = ref(false);
  const wmStart = ref<{ x: number; y: number } | null>(null);
  const wmRect = ref<{ x: number; y: number; w: number; h: number } | null>(null);
  const wmUndoStack = ref<ImageData[]>([]);
  const wmUndoLimit = 8;

  const wmHasSelection = computed(() => {
    const r = wmRect.value;
    return !!r && r.w >= 4 && r.h >= 4;
  });
  const wmCanApply = computed(
    () => wmHasSelection.value && !!wmCanvasRef.value && !!wmOverlayCanvasRef.value
  );
  const wmCanUndo = computed(() => wmUndoStack.value.length > 0 && !!wmCanvasRef.value);

  const clearWmCanvas = () => {
    const c = wmCanvasRef.value;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const clearWmOverlay = () => {
    const c = wmOverlayCanvasRef.value;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const clampRectToCanvas = (
    r: { x: number; y: number; w: number; h: number },
    c: HTMLCanvasElement
  ) => {
    const x = Math.max(0, Math.min(c.width - 1, r.x));
    const y = Math.max(0, Math.min(c.height - 1, r.y));
    const w = Math.max(1, Math.min(c.width - x, r.w));
    const h = Math.max(1, Math.min(c.height - y, r.h));
    return { x, y, w, h };
  };

  const drawWmOverlayRect = () => {
    const c = wmOverlayCanvasRef.value;
    const r = wmRect.value;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!r) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(204, 255, 0, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.restore();
  };

  const reset = () => {
    wmIsSelecting.value = false;
    wmStart.value = null;
    wmRect.value = null;
    wmUndoStack.value = [];
    clearWmOverlay();
    clearWmCanvas();
  };

  const initEditor = async () => {
    const toolId = input.activeToolId.value;
    if (toolId !== 'watermark') return;
    const src = input.sourceUrl.value;
    if (!src) throw new Error('请先选择图片');

    const img = await loadImageFromUrl(src);
    const { w, h } = scaleToMaxSide(img.naturalWidth, img.naturalHeight, wmMaxSide);

    await nextTick();
    const base = wmCanvasRef.value;
    const overlay = wmOverlayCanvasRef.value;
    if (!base || !overlay) throw new Error('画布初始化失败');
    base.width = w;
    base.height = h;
    overlay.width = w;
    overlay.height = h;

    const ctx = base.getContext('2d');
    if (!ctx) throw new Error('Canvas 初始化失败');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    wmUndoStack.value = [];
    wmRect.value = null;
    wmStart.value = null;
    wmIsSelecting.value = false;
    clearWmOverlay();
  };

  const getWmCanvasOrThrow = () => {
    const c = wmCanvasRef.value;
    if (!c) throw new Error('画布未初始化');
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas 初始化失败');
    return { c, ctx };
  };

  const pushWmUndo = () => {
    const { c, ctx } = getWmCanvasOrThrow();
    const snap = ctx.getImageData(0, 0, c.width, c.height);
    wmUndoStack.value = [snap, ...wmUndoStack.value].slice(0, wmUndoLimit);
  };

  const undoWatermark = () => {
    const { ctx } = getWmCanvasOrThrow();
    const snap = wmUndoStack.value[0];
    if (!snap) return;
    ctx.putImageData(snap, 0, 0);
    wmUndoStack.value = wmUndoStack.value.slice(1);
  };

  const clearWatermarkSelection = () => {
    wmRect.value = null;
    wmStart.value = null;
    wmIsSelecting.value = false;
    clearWmOverlay();
  };

  const onWmPointerDown = (e: PointerEvent) => {
    if (input.activeToolId.value !== 'watermark') return;
    const c = wmOverlayCanvasRef.value;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * c.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * c.height);
    wmIsSelecting.value = true;
    wmStart.value = { x, y };
    wmRect.value = { x, y, w: 1, h: 1 };
    drawWmOverlayRect();
    try {
      c.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onWmPointerMove = (e: PointerEvent) => {
    if (!wmIsSelecting.value) return;
    const start = wmStart.value;
    const c = wmOverlayCanvasRef.value;
    if (!start || !c) return;
    const rect = c.getBoundingClientRect();
    const x2 = Math.round(((e.clientX - rect.left) / rect.width) * c.width);
    const y2 = Math.round(((e.clientY - rect.top) / rect.height) * c.height);
    const x = Math.min(start.x, x2);
    const y = Math.min(start.y, y2);
    const w = Math.abs(x2 - start.x);
    const h = Math.abs(y2 - start.y);
    wmRect.value = clampRectToCanvas({ x, y, w, h }, c);
    drawWmOverlayRect();
  };

  const onWmPointerUp = (e: PointerEvent) => {
    if (!wmIsSelecting.value) return;
    wmIsSelecting.value = false;
    const c = wmOverlayCanvasRef.value;
    if (!c) return;
    try {
      c.releasePointerCapture(e.pointerId);
    } catch {}
    drawWmOverlayRect();
  };

  const applyWatermarkSelection = async () => {
    if (input.activeToolId.value !== 'watermark')
      return { ok: false as const, error: 'TOOL_MISMATCH' };
    const r0 = wmRect.value;
    if (!r0) return { ok: false as const, error: '请先在图片上框选区域' };
    const { c, ctx } = getWmCanvasOrThrow();
    const r = clampRectToCanvas(r0, c);
    if (r.w < 4 || r.h < 4) return { ok: false as const, error: '选区太小' };

    pushWmUndo();

    if (wmMode.value === 'fill') {
      ctx.save();
      ctx.fillStyle = wmFillColor.value || '#000000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      return { ok: true as const };
    }

    if (wmMode.value === 'pixelate') {
      const pixelSize = Math.max(2, Math.round(wmPixelSize.value));
      const sw = r.w;
      const sh = r.h;
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.floor(sw / pixelSize));
      small.height = Math.max(1, Math.floor(sh / pixelSize));
      const sctx = small.getContext('2d');
      if (!sctx) throw new Error('Canvas 初始化失败');
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(c, r.x, r.y, sw, sh, 0, 0, small.width, small.height);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, small.width, small.height, r.x, r.y, sw, sh);
      ctx.restore();
      return { ok: true as const };
    }

    const blurPx = Math.max(1, Math.round(wmBlurPx.value));
    const pad = blurPx * 2;
    const temp = document.createElement('canvas');
    temp.width = r.w + pad * 2;
    temp.height = r.h + pad * 2;
    const tctx = temp.getContext('2d');
    if (!tctx) throw new Error('Canvas 初始化失败');
    tctx.clearRect(0, 0, temp.width, temp.height);
    tctx.filter = `blur(${blurPx}px)`;
    tctx.drawImage(c, r.x, r.y, r.w, r.h, pad, pad, r.w, r.h);
    tctx.filter = 'none';

    ctx.drawImage(temp, pad, pad, r.w, r.h, r.x, r.y, r.w, r.h);
    return { ok: true as const };
  };

  const exportWatermark = async () => {
    const { c } = getWmCanvasOrThrow();
    const type = wmOutFormat.value;
    const quality = type === 'image/png' ? undefined : wmOutQuality.value;
    const blob = await canvasToBlob(c, type, quality);
    const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
    const file = input.sourceFile.value;
    const filename = `${safeBaseName(file?.name || 'output')}.${ext}`;
    return { blob, filename };
  };

  return {
    wmCanvasRef,
    wmOverlayCanvasRef,
    wmMode,
    wmBlurPx,
    wmPixelSize,
    wmFillColor,
    wmOutFormat,
    wmOutQuality,
    wmHasSelection,
    wmCanApply,
    wmCanUndo,
    reset,
    initEditor,
    undoWatermark,
    clearWatermarkSelection,
    onWmPointerDown,
    onWmPointerMove,
    onWmPointerUp,
    applyWatermarkSelection,
    exportWatermark
  };
};
