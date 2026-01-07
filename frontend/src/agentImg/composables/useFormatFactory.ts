import { computed, onBeforeUnmount, ref } from 'vue';
import { formatFactoryTools } from '../data/formatFactoryTools';
import { acceptForTool, acceptHintForTool } from '../logic/formatFactory/accept';
import { loadImageFromUrl } from '../logic/formatFactory/canvas';
import { formatBytes, parsePositiveInt } from '../logic/formatFactory/format';
import {
  convertImage,
  convertToJpeg,
  generateIco,
  getPdfPageCount,
  imagesToPdf,
  pdfToImage,
  videoToGif
} from '../logic/formatFactory/processors';
import type { FormatFactoryProgress } from '../logic/formatFactory/processors';
import type { FormatFactoryTool, FormatFactoryToolId } from '../logic/formatFactory/types';
import { downloadBlob, revokeUrl } from '../logic/formatFactory/url';
import { useFormatFactoryLive } from './useFormatFactoryLive';
import { useFormatFactoryWatermark } from './useFormatFactoryWatermark';

export const useFormatFactory = () => {
  const tools = ref<FormatFactoryTool[]>(formatFactoryTools);

  const activeToolId = ref<FormatFactoryToolId | null>(null);
  const activeTool = computed(() => tools.value.find((t) => t.id === activeToolId.value) || null);

  const soonTip = ref('');
  let soonTipTimer: number | null = null;

  const sourceFile = ref<File | null>(null);
  const sourceFiles = ref<File[]>([]);
  const sourceUrl = ref<string | null>(null);
  const outputUrl = ref<string | null>(null);
  const outputBlob = ref<Blob | null>(null);
  const isProcessing = ref(false);
  const toolError = ref<string | null>(null);
  const progress = ref<FormatFactoryProgress | null>(null);
  const runController = ref<AbortController | null>(null);
  const runNonce = ref(0);

  const sourceMeta = ref<{ name: string; size: number; dimensions?: string } | null>(null);
  const outputMeta = ref<{ name: string; size: number } | null>(null);

  const webpOutFormat = ref<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  const webpQuality = ref(0.9);

  const jpegQuality = ref(0.75);
  const jpegMaxSide = ref<string>('');

  const icoSizeOptions = [16, 32, 48, 64, 128, 256] as const;
  const icoSizes = ref<number[]>([16, 32, 48, 64, 128, 256]);

  const pdfPageCount = ref(0);
  const pdfMode = ref<'stitch' | 'page'>('stitch');
  const pdfPageNumber = ref(1);
  const pdfScale = ref(1.4);
  const pdfOutFormat = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const pdfQuality = ref(0.9);
  const pdfMaxPages = ref(12);

  const img2pdfPageSize = ref<'A4' | 'auto'>('A4');
  const img2pdfMarginMm = ref(10);
  const img2pdfQuality = ref(0.86);

  const gifStartSec = ref(0);
  const gifDurationSec = ref(3);
  const gifFps = ref(10);
  const gifWidth = ref(480);
  const gifMaxColors = ref(256);

  const toUserError = (err: unknown, fallback: string) => {
    const msg = typeof (err as any)?.message === 'string' ? (err as any).message : '';
    if (msg === 'ABORTED') return '已取消';
    if (msg === 'CANVAS_CONTEXT_FAIL') return '浏览器 Canvas 初始化失败';
    if (msg === 'VIDEO_LOAD_FAIL') return '视频加载失败，请换一个文件或浏览器再试';
    if (msg === 'VIDEO_META_FAIL') return '无法读取视频信息';
    if (msg === 'VIDEO_DIM_FAIL') return '无法读取视频尺寸';
    if (msg === 'VIDEO_SEEK_FAIL') return '视频跳转失败（可能是编码不支持）';
    return msg || fallback;
  };

  const live = useFormatFactoryLive({ sourceFile });
  const watermark = useFormatFactoryWatermark({ activeToolId, sourceUrl, sourceFile });

  const resetTool = () => {
    try {
      runController.value?.abort();
    } catch {}
    runController.value = null;
    progress.value = null;
    runNonce.value += 1;
    isProcessing.value = false;
    toolError.value = null;
    sourceFile.value = null;
    sourceFiles.value = [];
    sourceMeta.value = null;
    outputMeta.value = null;
    outputBlob.value = null;
    revokeUrl(sourceUrl.value);
    revokeUrl(outputUrl.value);
    sourceUrl.value = null;
    outputUrl.value = null;
    pdfPageCount.value = 0;
    watermark.reset();
    live.reset();
  };

  const closeModal = () => {
    resetTool();
    activeToolId.value = null;
  };

  const handleToolClick = (tool: FormatFactoryTool) => {
    if (tool.status !== 'ready') {
      soonTip.value = `${tool.name} 即将上线`;
      if (soonTipTimer) window.clearTimeout(soonTipTimer);
      soonTipTimer = window.setTimeout(() => {
        soonTip.value = '';
        soonTipTimer = null;
      }, 1600);
      return;
    }
    resetTool();
    activeToolId.value = tool.id;
  };

  const acceptFor = (toolId: FormatFactoryToolId) => acceptForTool(toolId);
  const acceptHintFor = (toolId: FormatFactoryToolId) => acceptHintForTool(toolId);

  const isDragging = ref(false);

  const processInputFiles = async (files: File[]) => {
    if (files.length === 0) return;

    toolError.value = null;
    outputMeta.value = null;
    outputBlob.value = null;
    progress.value = null;
    revokeUrl(outputUrl.value);
    outputUrl.value = null;

    const toolId = activeTool.value?.id;
    sourceFiles.value = toolId === 'img2pdf' ? files : [];
    const file = files[0];
    sourceFile.value = file;

    revokeUrl(sourceUrl.value);
    sourceUrl.value = URL.createObjectURL(file);

    if (toolId === 'img2pdf') {
      const totalSize = files.reduce((sum, f) => sum + (f?.size || 0), 0);
      sourceMeta.value = { name: `${files.length} files`, size: totalSize };
      return;
    }

    if (toolId === 'live' || toolId === 'gif') {
      sourceMeta.value = { name: file.name, size: file.size };
      live.reset();
      return;
    }

    if (toolId === 'pdf') {
      sourceMeta.value = { name: file.name, size: file.size };
      try {
        const pages = await getPdfPageCount(file);
        pdfPageCount.value = pages;
        sourceMeta.value = {
          name: file.name,
          size: file.size,
          dimensions: pages ? `${pages} pages` : undefined
        };
      } catch {}
      return;
    }

    try {
      const img = await loadImageFromUrl(sourceUrl.value);
      sourceMeta.value = {
        name: file.name,
        size: file.size,
        dimensions: `${img.naturalWidth}×${img.naturalHeight}`
      };
    } catch {
      sourceMeta.value = { name: file.name, size: file.size };
    }

    if (toolId === 'watermark') {
      try {
        await watermark.initEditor();
      } catch (err: any) {
        toolError.value = toUserError(err, '初始化失败，请换一个文件再试');
      }
    }
  };

  const onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement | null;
    const files = Array.from(input?.files || []);
    if (files.length === 0) return;
    if (input) input.value = '';
    processInputFiles(files);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    isDragging.value = true;
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    isDragging.value = false;
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    isDragging.value = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      processInputFiles(files);
    }
  };

  const runTool = async () => {
    toolError.value = null;
    outputMeta.value = null;
    outputBlob.value = null;
    revokeUrl(outputUrl.value);
    outputUrl.value = null;
    progress.value = null;

    const tool = activeTool.value;
    const file = sourceFile.value;
    if (!tool || !file) return;

    isProcessing.value = true;
    try {
      runController.value?.abort();
    } catch {}
    const nonce = (runNonce.value += 1);
    const controller = new AbortController();
    runController.value = controller;
    const setProgress = (p: FormatFactoryProgress) => {
      if (nonce !== runNonce.value) return;
      progress.value = p;
    };
    try {
      if (tool.id === 'webp') {
        const { blob, filename } = await convertImage(
          file,
          webpOutFormat.value,
          webpOutFormat.value === 'image/png' ? undefined : webpQuality.value,
          {
            signal: controller.signal,
            onProgress: setProgress
          }
        );
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = URL.createObjectURL(blob);
        return;
      }

      if (tool.id === 'jpeg') {
        const maxSide = parsePositiveInt(jpegMaxSide.value);
        const { blob, filename } = await convertToJpeg(file, jpegQuality.value, maxSide, {
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = URL.createObjectURL(blob);
        return;
      }

      if (tool.id === 'ico') {
        const sizes = icoSizes.value.slice().sort((a, b) => a - b);
        if (sizes.length === 0) {
          toolError.value = '请至少选择一个尺寸';
          return;
        }
        const { blob, filename } = await generateIco(file, sizes, {
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        return;
      }

      if (tool.id === 'watermark') {
        const { blob, filename } = await watermark.exportWatermark();
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = URL.createObjectURL(blob);
        return;
      }

      if (tool.id === 'live') {
        const { blob, filename } = await live.captureVideoFrame();
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = URL.createObjectURL(blob);
        return;
      }

      if (tool.id === 'pdf') {
        const safePageNumber = Math.max(1, Math.floor(pdfPageNumber.value || 1));
        const pageNumber = pdfPageCount.value
          ? Math.min(pdfPageCount.value, safePageNumber)
          : safePageNumber;
        const { blob, filename } = await pdfToImage(file, {
          mode: pdfMode.value,
          pageNumber,
          scale: pdfScale.value,
          outType: pdfOutFormat.value,
          quality: pdfQuality.value,
          maxPages: pdfMaxPages.value,
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = URL.createObjectURL(blob);
        return;
      }

      if (tool.id === 'img2pdf') {
        const list = sourceFiles.value.length ? sourceFiles.value : [file];
        const { blob, filename } = await imagesToPdf(list, {
          pageSize: img2pdfPageSize.value,
          marginMm: img2pdfMarginMm.value,
          quality: img2pdfQuality.value,
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        return;
      }

      if (tool.id === 'gif') {
        const { blob, filename } = await videoToGif(file, {
          startSec: gifStartSec.value,
          durationSec: gifDurationSec.value,
          fps: gifFps.value,
          width: gifWidth.value,
          maxColors: gifMaxColors.value,
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = URL.createObjectURL(blob);
        return;
      }
    } catch (err: any) {
      toolError.value = toUserError(err, '处理失败，请换一个文件再试');
    } finally {
      isProcessing.value = false;
      runController.value = null;
    }
  };

  const downloadOutput = () => {
    const blob = outputBlob.value;
    const meta = outputMeta.value;
    if (!blob || !meta) return;
    downloadBlob(blob, meta.name);
  };

  const toggleIcoSize = (s: number) => {
    const next = new Set(icoSizes.value);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    icoSizes.value = Array.from(next);
  };

  const applyWatermarkSelection = async () => {
    toolError.value = null;
    progress.value = null;
    isProcessing.value = true;
    try {
      const res = await watermark.applyWatermarkSelection();
      if (!res.ok) {
        toolError.value = res.error;
      }
    } catch (err: any) {
      toolError.value = typeof err?.message === 'string' ? err.message : '处理失败，请换一张图再试';
    } finally {
      isProcessing.value = false;
    }
  };

  const undoWatermark = () => {
    toolError.value = null;
    try {
      watermark.undoWatermark();
    } catch (err: any) {
      toolError.value = toUserError(err, '撤销失败');
    }
  };

  const clearWatermarkSelection = () => {
    toolError.value = null;
    try {
      watermark.clearWatermarkSelection();
    } catch (err: any) {
      toolError.value = toUserError(err, '清除失败');
    }
  };

  const onLiveLoadedMeta = () => {
    const meta = live.onLiveLoadedMeta();
    if (meta) sourceMeta.value = meta;
  };

  onBeforeUnmount(() => {
    try {
      runController.value?.abort();
    } catch {}
    revokeUrl(sourceUrl.value);
    revokeUrl(outputUrl.value);
    if (soonTipTimer) window.clearTimeout(soonTipTimer);
  });

  const progressPercent = computed(() => {
    const p = progress.value;
    if (!p) return 0;
    const total = Number(p.total || 0);
    const done = Number(p.done || 0);
    if (!Number.isFinite(total) || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  });

  const cancelProcessing = () => {
    try {
      runController.value?.abort();
    } catch {}
    runController.value = null;
    progress.value = null;
    runNonce.value += 1;
    isProcessing.value = false;
    toolError.value = '已取消';
  };

  return {
    tools,
    soonTip,
    activeToolId,
    activeTool,
    handleToolClick,
    closeModal,
    resetTool,
    acceptFor,
    acceptHintFor,
    onFileChange,
    runTool,
    downloadOutput,
    toggleIcoSize,
    formatBytes,
    sourceFile,
    sourceUrl,
    sourceMeta,
    outputUrl,
    outputBlob,
    outputMeta,
    isProcessing,
    toolError,
    progress,
    progressPercent,
    cancelProcessing,
    webpOutFormat,
    webpQuality,
    jpegQuality,
    jpegMaxSide,
    icoSizeOptions,
    icoSizes,
    pdfPageCount,
    pdfMode,
    pdfPageNumber,
    pdfScale,
    pdfOutFormat,
    pdfQuality,
    pdfMaxPages,
    img2pdfPageSize,
    img2pdfMarginMm,
    img2pdfQuality,
    gifStartSec,
    gifDurationSec,
    gifFps,
    gifWidth,
    gifMaxColors,
    wmCanvasRef: watermark.wmCanvasRef,
    wmOverlayCanvasRef: watermark.wmOverlayCanvasRef,
    wmMode: watermark.wmMode,
    wmBlurPx: watermark.wmBlurPx,
    wmPixelSize: watermark.wmPixelSize,
    wmFillColor: watermark.wmFillColor,
    wmOutFormat: watermark.wmOutFormat,
    wmOutQuality: watermark.wmOutQuality,
    wmHasSelection: watermark.wmHasSelection,
    wmCanApply: watermark.wmCanApply,
    wmCanUndo: watermark.wmCanUndo,
    onWmPointerDown: watermark.onWmPointerDown,
    onWmPointerMove: watermark.onWmPointerMove,
    onWmPointerUp: watermark.onWmPointerUp,
    applyWatermarkSelection,
    undoWatermark,
    clearWatermarkSelection,
    liveVideoRef: live.liveVideoRef,
    liveDuration: live.liveDuration,
    liveTime: live.liveTime,
    liveOutFormat: live.liveOutFormat,
    liveOutQuality: live.liveOutQuality,
    onLiveLoadedMeta,
    onLiveTimeUpdate: live.onLiveTimeUpdate,
    onLiveSeekInput: live.onLiveSeekInput,
    isDragging,
    onDragOver,
    onDragLeave,
    onDrop
  };
};
