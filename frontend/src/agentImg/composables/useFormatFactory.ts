import { computed, onBeforeUnmount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { formatFactoryTools } from '../data/formatFactoryTools';
import { acceptForTool, acceptHintForTool } from '../logic/formatFactory/accept';
import { loadImageFromUrl } from '../logic/formatFactory/canvas';
import { formatBytes, parsePositiveInt, safeBaseName } from '../logic/formatFactory/format';
import {
  buildIngredientLabelSvg,
  buildIngredientLabelSvgUrl
} from '../logic/formatFactory/ingredientLabel';
import {
  convertImage,
  convertToJpeg,
  filterImage,
  generateIco,
  getPdfPageCount,
  imagesToPdf,
  pdfToImage,
  pdfToWord,
  docxToPdf,
  resizeImage,
  rotateFlipImage,
  txtToPdf,
  videoToGif
} from '../logic/formatFactory/processors';
import type { FormatFactoryProgress } from '../logic/formatFactory/processors';
import type { FormatFactoryTool, FormatFactoryToolId } from '../logic/formatFactory/types';
import { downloadBlob, revokeUrl } from '../logic/formatFactory/url';
import { extractFirstJsonObject } from '../logic/json';
import { generateText } from '../services/text';
import { useFormatFactoryLive } from './useFormatFactoryLive';
import { useFormatFactoryWatermark } from './useFormatFactoryWatermark';
import { useLanguageStore } from '@/stores/language';

type FormatFactoryOutputItem = { name: string; size: number; blob: Blob; url: string };

export const useFormatFactory = () => {
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);
  const isZh = computed(() => currentLang.value === 'zh');

  const tools = computed<FormatFactoryTool[]>(() => {
    if (isZh.value) return formatFactoryTools;
    const map: Partial<
      Record<FormatFactoryToolId, Pick<FormatFactoryTool, 'name' | 'description' | 'tag'>>
    > = {
      webp: {
        name: 'WebP Converter',
        description: 'Web format · two-way conversion',
        tag: 'Modern Web'
      },
      jpeg: { name: 'JPEG Compressor', description: 'Extreme compression · batch', tag: 'General' },
      resize: { name: 'Resize Image', description: 'Change size · keep ratio', tag: 'General' },
      rotate: {
        name: 'Rotate / Flip',
        description: 'Rotate degrees · mirror flip',
        tag: 'General'
      },
      filter: { name: 'Image Filters', description: 'B/W · sepia · invert', tag: 'General' },
      watermark: {
        name: 'Watermark Remover',
        description: 'Smart crop · manual select',
        tag: 'General'
      },
      live: {
        name: 'Live Photo Converter',
        description: 'HEIC still · MOV frame pick',
        tag: 'Mobile'
      },
      pdf: {
        name: 'PDF to Images',
        description: 'Split pages · stitch long image',
        tag: 'PDF Tools'
      },
      pdf2word: { name: 'PDF to Word', description: 'Extract text · export DOC', tag: 'Docs' },
      word2pdf: { name: 'Word to PDF', description: 'Extract text · export PDF', tag: 'Docs' },
      txt2pdf: { name: 'TXT to PDF', description: 'Plain text · export PDF', tag: 'Docs' },
      img2pdf: { name: 'Images to PDF', description: 'Merge multiple images', tag: 'PDF Tools' },
      gif: { name: 'Video to GIF', description: 'Clip video · export GIF', tag: 'Video' },
      ico: { name: 'ICO Generator', description: 'Pack multi-size PNGs', tag: 'General' },
      'ingredient-list': {
        name: 'Ingredient Label',
        description: 'Paste text · generate label image',
        tag: 'Free AI Tool'
      }
    };
    return formatFactoryTools.map((t) => {
      const tr = map[t.id];
      return tr ? { ...t, ...tr } : t;
    });
  });

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
  const outputItems = ref<FormatFactoryOutputItem[]>([]);

  const webpOutFormat = ref<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  const webpQuality = ref(0.9);

  const jpegQuality = ref(0.75);
  const jpegMaxSide = ref<string>('');

  const resizeWidth = ref<string>('');
  const resizeHeight = ref<string>('');
  const resizeMaxSide = ref<string>('');
  const resizeOutFormat = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const resizeQuality = ref(0.9);

  const rotateDeg = ref<0 | 90 | 180 | 270>(0);
  const rotateFlipH = ref(false);
  const rotateFlipV = ref(false);
  const rotateOutFormat = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const rotateQuality = ref(0.9);

  const filterPreset = ref<'grayscale' | 'sepia' | 'invert'>('grayscale');
  const filterIntensity = ref(1);
  const filterOutFormat = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const filterQuality = ref(0.9);

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

  const ingredientProductName = ref('');
  const ingredientText = ref('');
  const ingredientProductType = ref<'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement' | 'Auto'>(
    'Food'
  );

  const toUserError = (err: unknown, fallback: string) => {
    const msg = typeof (err as any)?.message === 'string' ? (err as any).message : '';
    if (msg === 'ABORTED' || msg.includes('AbortError')) return isZh.value ? '已取消' : 'Cancelled';
    if (msg === 'IMAGE_LOAD_FAIL')
      return isZh.value ? '图片加载失败，请换一张图再试' : 'Image load failed. Try another image.';
    if (msg === 'CANVAS_EXPORT_FAIL')
      return isZh.value ? '导出失败，请换一个文件再试' : 'Export failed. Try another file.';
    if (msg === 'CANVAS_TOO_LARGE')
      return isZh.value
        ? '输出尺寸过大，建议降低清晰度/页数或改为单页模式'
        : 'Output is too large. Reduce quality/pages or use single-page mode.';
    if (msg === 'VIDEO_NOT_SELECTED')
      return isZh.value ? '请先选择视频' : 'Please select a video first.';
    if (msg === 'CANVAS_CONTEXT_FAIL')
      return isZh.value ? '浏览器 Canvas 初始化失败' : 'Canvas initialization failed';
    if (msg === 'WM_NO_IMAGE') return isZh.value ? '请先选择图片' : 'Please select an image first.';
    if (msg === 'WM_CANVAS_INIT_FAIL')
      return isZh.value ? '画布初始化失败' : 'Canvas initialization failed.';
    if (msg === 'WM_CANVAS_NOT_READY')
      return isZh.value ? '画布未初始化' : 'Canvas is not initialized.';
    if (msg === 'VIDEO_LOAD_FAIL')
      return isZh.value
        ? '视频加载失败，请换一个文件或浏览器再试'
        : 'Video load failed. Try another file/browser.';
    if (msg === 'VIDEO_META_FAIL')
      return isZh.value ? '无法读取视频信息' : 'Failed to read video metadata';
    if (msg === 'VIDEO_DIM_FAIL')
      return isZh.value ? '无法读取视频尺寸' : 'Failed to read video dimensions';
    if (msg === 'VIDEO_SEEK_FAIL')
      return isZh.value
        ? '视频跳转失败（可能是编码不支持）'
        : 'Video seek failed (codec may be unsupported)';
    if (msg === 'DOCX_PARSE_FAIL')
      return isZh.value
        ? '无法解析 Word 内容，请确认文件是否损坏'
        : 'Failed to parse Word content.';
    if (msg === 'DOCX_ONLY') return isZh.value ? '仅支持 .docx 文件' : 'Only .docx is supported.';
    return msg || fallback;
  };

  const live = useFormatFactoryLive({ sourceFile });
  const watermark = useFormatFactoryWatermark({ activeToolId, sourceUrl, sourceFile });

  const revokeOutputItems = () => {
    for (const it of outputItems.value) {
      revokeUrl(it.url);
    }
    outputItems.value = [];
  };

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
    revokeOutputItems();
    revokeUrl(sourceUrl.value);
    revokeUrl(outputUrl.value);
    sourceUrl.value = null;
    outputUrl.value = null;
    pdfPageCount.value = 0;
    watermark.reset();
    live.reset();
    ingredientProductName.value = '';
    ingredientText.value = '';
    ingredientProductType.value = 'Food';
  };

  const closeModal = () => {
    resetTool();
    activeToolId.value = null;
  };

  const handleToolClick = (tool: FormatFactoryTool) => {
    if (tool.status !== 'ready') {
      soonTip.value = isZh.value ? `${tool.name} 即将上线` : `${tool.name} is coming soon`;
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
  const acceptHintFor = (toolId: FormatFactoryToolId) => {
    return acceptHintForTool(toolId, isZh.value ? 'zh' : 'en');
  };

  const isDragging = ref(false);

  const processInputFiles = async (files: File[]) => {
    if (files.length === 0) return;

    toolError.value = null;
    outputMeta.value = null;
    outputBlob.value = null;
    revokeOutputItems();
    progress.value = null;
    revokeUrl(outputUrl.value);
    outputUrl.value = null;

    const toolId = activeTool.value?.id;
    const isBatchTool = toolId === 'webp' || toolId === 'jpeg' || toolId === 'ico';
    sourceFiles.value = toolId === 'img2pdf' || isBatchTool ? files : [];
    const file = files[0];
    sourceFile.value = file;

    revokeUrl(sourceUrl.value);
    sourceUrl.value = URL.createObjectURL(file);

    if (toolId === 'img2pdf') {
      const totalSize = files.reduce((sum, f) => sum + (f?.size || 0), 0);
      sourceMeta.value = {
        name: isZh.value ? `${files.length} 个文件` : `${files.length} files`,
        size: totalSize
      };
      return;
    }

    if (isBatchTool) {
      const totalSize = files.reduce((sum, f) => sum + (f?.size || 0), 0);
      sourceMeta.value = {
        name: isZh.value ? `${files.length} 个文件` : `${files.length} files`,
        size: totalSize
      };
      return;
    }

    if (toolId === 'live' || toolId === 'gif') {
      sourceMeta.value = { name: file.name, size: file.size };
      live.reset();
      return;
    }

    if (toolId === 'pdf' || toolId === 'pdf2word') {
      sourceMeta.value = { name: file.name, size: file.size };
      try {
        const pages = await getPdfPageCount(file);
        pdfPageCount.value = pages;
        sourceMeta.value = {
          name: file.name,
          size: file.size,
          dimensions: pages ? (isZh.value ? `${pages} 页` : `${pages} pages`) : undefined
        };
      } catch {}
      return;
    }

    if (toolId === 'word2pdf') {
      sourceMeta.value = { name: file.name, size: file.size };
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
        toolError.value = toUserError(
          err,
          isZh.value ? '初始化失败，请换一个文件再试' : 'Initialization failed. Try another file.'
        );
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
    revokeOutputItems();
    revokeUrl(outputUrl.value);
    outputUrl.value = null;
    progress.value = null;

    const tool = activeTool.value;
    if (!tool) return;

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
      if (tool.id === 'ingredient-list') {
        const userText = ingredientText.value.trim();
        if (!userText) {
          toolError.value = isZh.value
            ? '请输入配料/描述文本'
            : 'Please paste ingredient/description text';
          return;
        }

        const parseJsonFromAi = (raw: string) => {
          const first = extractFirstJsonObject(raw);
          if (first) return first;
          const match = String(raw || '').match(/\{[\s\S]*\}/);
          if (!match) return null;
          try {
            return JSON.parse(match[0]);
          } catch {
            return null;
          }
        };

        const buildLabelSectionsUnified = async (
          inputText: string,
          productType: string,
          opts?: { signal?: AbortSignal }
        ): Promise<{
          sections: any[];
          layoutType: 'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts';
        }> => {
          const requestId = `ff_ingredient_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const res = await generateText('', {
            signal: opts?.signal,
            timeoutMs: 120000,
            requestId,
            purpose: 'agentimg_ingredient_label',
            requestSource: 'format_factory_ingredient_label',
            userText: inputText,
            agentImg: { userText: inputText, productType }
          });
          if (!res.ok) throw new Error(res.errorCode || res.error);
          const json = parseJsonFromAi(res.text);
          const sections = Array.isArray((json as any)?.sections) ? (json as any).sections : [];
          const layoutTypeRaw = String((json as any)?.layoutType || '').trim();
          const layoutType =
            layoutTypeRaw === 'drug_facts' ||
            layoutTypeRaw === 'supplement_facts' ||
            layoutTypeRaw === 'nutrition_facts' ||
            layoutTypeRaw === 'standard'
              ? (layoutTypeRaw as any)
              : 'standard';
          return { sections, layoutType };
        };

        setProgress({
          done: 0,
          total: 3,
          label: isZh.value ? '生成配料结构' : 'Generating structure'
        });
        const { sections, layoutType } = await buildLabelSectionsUnified(
          userText,
          ingredientProductType.value === 'Auto' ? '' : ingredientProductType.value,
          { signal: controller.signal }
        );
        if (nonce !== runNonce.value) return;

        setProgress({ done: 1, total: 3, label: isZh.value ? '渲染标签' : 'Rendering label' });
        const svg = buildIngredientLabelSvg({
          productName: ingredientProductName.value.trim(),
          sections,
          layoutType: layoutType as any
        });
        const url = buildIngredientLabelSvgUrl(svg);
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const base = ingredientProductName.value.trim() || 'ingredient_label';
        const filename = `${safeBaseName(base)}.svg`;

        setProgress({ done: 3, total: 3, label: isZh.value ? '完成' : 'Done' });
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      const file = sourceFile.value;
      if (!file) return;

      const isBatchTool = tool.id === 'webp' || tool.id === 'jpeg' || tool.id === 'ico';
      const batchFiles: File[] = isBatchTool
        ? sourceFiles.value.length
          ? sourceFiles.value
          : [file]
        : [];

      if (isBatchTool && batchFiles.length > 1) {
        const results: FormatFactoryOutputItem[] = [];
        const totalFiles = batchFiles.length;
        if (totalFiles > 60) {
          toolError.value = isZh.value
            ? '文件数量过多，请分批处理'
            : 'Too many files. Please process in batches.';
          return;
        }
        setProgress({
          done: 0,
          total: totalFiles * 100,
          label: isZh.value ? '准备处理' : 'Preparing'
        });
        for (let i = 0; i < totalFiles; i += 1) {
          const f = batchFiles[i];
          const onFileProgress = (p: FormatFactoryProgress) => {
            const innerTotal = Number(p.total || 0);
            const innerDone = Number(p.done || 0);
            const inner = innerTotal > 0 ? Math.max(0, Math.min(1, innerDone / innerTotal)) : 0;
            setProgress({
              done: i * 100 + inner * 100,
              total: totalFiles * 100,
              label: `${i + 1}/${totalFiles} ${p.label || (isZh.value ? '处理中' : 'Processing')}`
            });
          };

          if (tool.id === 'webp') {
            const { blob, filename } = await convertImage(
              f,
              webpOutFormat.value,
              webpOutFormat.value === 'image/png' ? undefined : webpQuality.value,
              { signal: controller.signal, onProgress: onFileProgress }
            );
            if (nonce !== runNonce.value) return;
            const url = URL.createObjectURL(blob);
            results.push({ blob, name: filename, size: blob.size, url });
            setProgress({
              done: (i + 1) * 100,
              total: totalFiles * 100,
              label: `${i + 1}/${totalFiles} ${isZh.value ? '完成' : 'Done'}`
            });
            continue;
          }

          if (tool.id === 'jpeg') {
            const maxSide = parsePositiveInt(jpegMaxSide.value);
            const { blob, filename } = await convertToJpeg(f, jpegQuality.value, maxSide, {
              signal: controller.signal,
              onProgress: onFileProgress
            });
            if (nonce !== runNonce.value) return;
            const url = URL.createObjectURL(blob);
            results.push({ blob, name: filename, size: blob.size, url });
            setProgress({
              done: (i + 1) * 100,
              total: totalFiles * 100,
              label: `${i + 1}/${totalFiles} ${isZh.value ? '完成' : 'Done'}`
            });
            continue;
          }

          if (tool.id === 'ico') {
            const sizes = icoSizes.value.slice().sort((a, b) => a - b);
            if (sizes.length === 0) {
              toolError.value = isZh.value
                ? '请至少选择一个尺寸'
                : 'Please select at least one size';
              return;
            }
            const { blob, filename } = await generateIco(f, sizes, {
              signal: controller.signal,
              onProgress: onFileProgress
            });
            if (nonce !== runNonce.value) return;
            const url = URL.createObjectURL(blob);
            results.push({ blob, name: filename, size: blob.size, url });
            setProgress({
              done: (i + 1) * 100,
              total: totalFiles * 100,
              label: `${i + 1}/${totalFiles} ${isZh.value ? '完成' : 'Done'}`
            });
            continue;
          }
        }

        setProgress({
          done: totalFiles * 100,
          total: totalFiles * 100,
          label: isZh.value ? '完成' : 'Done'
        });
        outputItems.value = results;
        outputMeta.value = {
          name: isZh.value ? `${results.length} 个输出` : `${results.length} outputs`,
          size: results.reduce((sum, it) => sum + it.size, 0)
        };
        return;
      }

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
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'jpeg') {
        const maxSide = parsePositiveInt(jpegMaxSide.value);
        const { blob, filename } = await convertToJpeg(file, jpegQuality.value, maxSide, {
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'resize') {
        const width = parsePositiveInt(resizeWidth.value);
        const height = parsePositiveInt(resizeHeight.value);
        const maxSide = parsePositiveInt(resizeMaxSide.value);
        const { blob, filename } = await resizeImage(
          file,
          {
            width,
            height,
            maxSide,
            outType: resizeOutFormat.value,
            quality: resizeOutFormat.value === 'image/png' ? undefined : resizeQuality.value
          },
          { signal: controller.signal, onProgress: setProgress }
        );
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'rotate') {
        const { blob, filename } = await rotateFlipImage(
          file,
          {
            rotate: rotateDeg.value,
            flipH: rotateFlipH.value,
            flipV: rotateFlipV.value,
            outType: rotateOutFormat.value,
            quality: rotateOutFormat.value === 'image/png' ? undefined : rotateQuality.value
          },
          { signal: controller.signal, onProgress: setProgress }
        );
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'filter') {
        const { blob, filename } = await filterImage(
          file,
          {
            preset: filterPreset.value,
            intensity: filterIntensity.value,
            outType: filterOutFormat.value,
            quality: filterOutFormat.value === 'image/png' ? undefined : filterQuality.value
          },
          { signal: controller.signal, onProgress: setProgress }
        );
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'ico') {
        const sizes = icoSizes.value.slice().sort((a, b) => a - b);
        if (sizes.length === 0) {
          toolError.value = isZh.value ? '请至少选择一个尺寸' : 'Please select at least one size';
          return;
        }
        const { blob, filename } = await generateIco(file, sizes, {
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'watermark') {
        const { blob, filename } = await watermark.exportWatermark();
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'live') {
        const { blob, filename } = await live.captureVideoFrame();
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
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
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'pdf2word') {
        const { blob, filename } = await pdfToWord(file, {
          lang: isZh.value ? 'zh' : 'en',
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'word2pdf') {
        const { blob, filename } = await docxToPdf(file, {
          lang: isZh.value ? 'zh' : 'en',
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
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
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }

      if (tool.id === 'txt2pdf') {
        const { blob, filename } = await txtToPdf(file, {
          lang: isZh.value ? 'zh' : 'en',
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
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
        const url = URL.createObjectURL(blob);
        outputBlob.value = blob;
        outputMeta.value = { name: filename, size: blob.size };
        outputUrl.value = url;
        outputItems.value = [{ blob, name: filename, size: blob.size, url }];
        return;
      }
    } catch (err: any) {
      if (nonce !== runNonce.value) return;
      const aborted =
        controller.signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
      if (aborted) return;
      toolError.value = toUserError(
        err,
        isZh.value ? '处理失败，请换一个文件再试' : 'Processing failed. Try another file.'
      );
    } finally {
      if (nonce === runNonce.value) {
        isProcessing.value = false;
        runController.value = null;
      }
    }
  };

  const downloadOutput = () => {
    const single = outputItems.value.length === 1 ? outputItems.value[0] : null;
    if (single) {
      downloadBlob(single.blob, single.name);
      return;
    }
    const blob = outputBlob.value;
    const meta = outputMeta.value;
    if (!blob || !meta) return;
    downloadBlob(blob, meta.name);
  };

  const downloadAllOutputs = async () => {
    const list = outputItems.value.slice();
    if (list.length === 0) return;
    for (let i = 0; i < list.length; i += 1) {
      const it = list[i];
      downloadBlob(it.blob, it.name);
      await new Promise((r) => window.setTimeout(r, 180));
    }
  };

  const downloadOutputItem = (it: { blob: Blob; name: string }) => {
    downloadBlob(it.blob, it.name);
  };

  const openOutputPreview = (url: string | null) => {
    const s = String(url || '').trim();
    if (!s) return;
    try {
      const u = new URL(s, window.location.href);
      const p = String(u.protocol || '').toLowerCase();
      if (p === 'data:') {
        const href = String(u.href || '');
        if (!/^data:(image\/|application\/pdf)/i.test(href)) return;
      } else if (p !== 'http:' && p !== 'https:' && p !== 'blob:') {
        return;
      }
      window.open(u.href, '_blank', 'noopener,noreferrer');
    } catch {}
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
      toolError.value =
        typeof err?.message === 'string'
          ? err.message
          : isZh.value
            ? '处理失败，请换一张图再试'
            : 'Processing failed. Try another image.';
    } finally {
      isProcessing.value = false;
    }
  };

  const undoWatermark = () => {
    toolError.value = null;
    try {
      watermark.undoWatermark();
    } catch (err: any) {
      toolError.value = toUserError(err, isZh.value ? '撤销失败' : 'Undo failed');
    }
  };

  const clearWatermarkSelection = () => {
    toolError.value = null;
    try {
      watermark.clearWatermarkSelection();
    } catch (err: any) {
      toolError.value = toUserError(err, isZh.value ? '清除失败' : 'Clear failed');
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
    toolError.value = isZh.value ? '已取消' : 'Cancelled';
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
    downloadAllOutputs,
    downloadOutputItem,
    openOutputPreview,
    toggleIcoSize,
    formatBytes,
    sourceFile,
    sourceUrl,
    sourceMeta,
    outputUrl,
    outputBlob,
    outputMeta,
    outputItems,
    isProcessing,
    toolError,
    progress,
    progressPercent,
    cancelProcessing,
    webpOutFormat,
    webpQuality,
    jpegQuality,
    jpegMaxSide,
    resizeWidth,
    resizeHeight,
    resizeMaxSide,
    resizeOutFormat,
    resizeQuality,
    rotateDeg,
    rotateFlipH,
    rotateFlipV,
    rotateOutFormat,
    rotateQuality,
    filterPreset,
    filterIntensity,
    filterOutFormat,
    filterQuality,
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
    ingredientProductName,
    ingredientText,
    ingredientProductType,
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
