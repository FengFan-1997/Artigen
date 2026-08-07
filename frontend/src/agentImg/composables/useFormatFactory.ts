import { computed, onBeforeUnmount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { formatFactoryTools } from '../data/formatFactoryTools';
import { acceptAndLimitHintForTool, acceptForTool } from '../logic/formatFactory/accept';
import { formatBytes, parsePositiveInt, safeBaseName } from '../logic/formatFactory/format';
import {
  getFormatFactoryInputPolicy,
  validateFormatFactoryFileContents,
  validateFormatFactorySelection,
  validateFormatFactorySelectionDuration,
  validateFormatFactoryVideoMetadata
} from '../logic/formatFactory/inputContracts';
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
  pdfPagesToImages,
  pdfToImage,
  pdfToWord,
  resizeImage,
  rotateFlipImage,
  txtToPdf,
  videoToGif
} from '../logic/formatFactory/processors';
import type { FormatFactoryProgress } from '../logic/formatFactory/processors';
import type { FormatFactoryTool, FormatFactoryToolId } from '../logic/formatFactory/types';
import { downloadBlob, revokeUrl } from '../logic/formatFactory/url';
import { createZipBlob } from '../logic/formatFactory/zip';
import { moveListItem } from '../logic/formatFactory/ordering';
import {
  runOrderedImagePipeline,
  type ImagePipelineStep,
  type ImagePipelineStepType
} from '../logic/formatFactory/imagePipeline';
import {
  assertFormatFactoryResourceBudget,
  assertZipResourceBudget,
  hasFilterWorkerCapability,
  type ImageOutputMime,
  type ResourceInputMetric
} from '../logic/formatFactory/resourceBudget';
import { validateIngredientSourceTrace } from '../logic/ingredientSourceTrace';
import { extractFirstJsonObject } from '../logic/json';
import { convertWithBackend, preflightWordToPdf } from '../services/convert';
import { generateText } from '../services/text';
import { useFormatFactoryLive } from './useFormatFactoryLive';
import { useFormatFactoryWatermark } from './useFormatFactoryWatermark';
import { useLanguageStore } from '@/stores/language';

type FormatFactoryOutputItem = { name: string; size: number; blob: Blob; url: string };
export type FormatFactoryRunStatus = 'success' | 'failed' | 'cancelled' | 'superseded';
export type FormatFactoryRunResult = {
  status: FormatFactoryRunStatus;
  error?: string;
};

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
        name: 'Privacy Redaction',
        description: 'Blur · pixelate · solid cover',
        tag: 'General'
      },
      live: {
        name: 'Video Frame Picker',
        description: 'Browser-decodable video · frame selection',
        tag: 'Mobile'
      },
      pdf: {
        name: 'PDF to Images',
        description: 'Split pages · stitch long image',
        tag: 'PDF Tools'
      },
      pdf2word: { name: 'PDF Text to Word', description: 'Embedded text only · no OCR', tag: 'Docs' },
      word2pdf: {
        name: 'Word to PDF (Server Fidelity)',
        description: 'Explicit consent · LibreOffice preflight',
        tag: 'Docs'
      },
      txt2pdf: {
        name: 'TXT to PDF',
        description: 'Local · searchable text · no upload',
        tag: 'Docs'
      },
      img2pdf: { name: 'Images to PDF', description: 'Merge multiple images', tag: 'PDF Tools' },
      gif: { name: 'Video to GIF', description: 'Worker · 30s/12 MP/memory budget', tag: 'Video' },
      ico: { name: 'Favicon / ICO', description: 'Real multi-size ICO · preserve ratio', tag: 'General' },
      'ingredient-list': {
        name: 'Ingredient Label Layout',
        description: 'Source-only layout · no invented content',
        tag: 'Layout Tool'
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
  const isInspectingInput = ref(false);
  const isProcessing = ref(false);
  const isDownloadingAll = ref(false);
  let downloadAllLockUntil = 0;
  let downloadAllController: AbortController | null = null;
  const toolError = ref<string | null>(null);
  const progress = ref<FormatFactoryProgress | null>(null);
  const runController = ref<AbortController | null>(null);
  const runNonce = ref(0);
  let selectionNonce = 0;
  const blockedBatchInputs = new WeakSet<File>();
  const inputDimensions = new WeakMap<File, { width: number; height: number }>();

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

  const imagePipelineMode = ref(false);
  const imagePipelineOrder = ref<ImagePipelineStepType[]>([
    'resize',
    'rotate',
    'filter',
    'convert'
  ]);
  const imagePipelineEnabled = ref<Record<ImagePipelineStepType, boolean>>({
    resize: false,
    rotate: false,
    filter: false,
    convert: true
  });

  const toggleImagePipelineStep = (type: ImagePipelineStepType) => {
    imagePipelineEnabled.value = {
      ...imagePipelineEnabled.value,
      [type]: !imagePipelineEnabled.value[type]
    };
  };

  const moveImagePipelineStep = (type: ImagePipelineStepType, direction: -1 | 1) => {
    const current = imagePipelineOrder.value.slice();
    const index = current.indexOf(type);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    imagePipelineOrder.value = current;
  };

  const buildImagePipelineSteps = (): ImagePipelineStep[] => {
    const definitions: Record<ImagePipelineStepType, ImagePipelineStep> = {
      resize: {
        id: 'resize',
        type: 'resize',
        enabled: imagePipelineEnabled.value.resize,
        width: parsePositiveInt(resizeWidth.value),
        height: parsePositiveInt(resizeHeight.value),
        maxSide: parsePositiveInt(resizeMaxSide.value)
      },
      rotate: {
        id: 'rotate',
        type: 'rotate',
        enabled: imagePipelineEnabled.value.rotate,
        rotate: rotateDeg.value,
        flipH: rotateFlipH.value,
        flipV: rotateFlipV.value
      },
      filter: {
        id: 'filter',
        type: 'filter',
        enabled: imagePipelineEnabled.value.filter,
        preset: filterPreset.value,
        intensity: filterIntensity.value
      },
      convert: {
        id: 'convert',
        type: 'convert',
        enabled: imagePipelineEnabled.value.convert,
        outType: webpOutFormat.value,
        quality: webpQuality.value
      }
    };
    return imagePipelineOrder.value.map((type) => definitions[type]);
  };

  const rememberInputDimensions = (
    files: readonly File[],
    dimensions: readonly ({ width: number; height: number } | null)[]
  ) => {
    files.forEach((file, index) => {
      const current = dimensions[index];
      if (current?.width && current?.height) inputDimensions.set(file, current);
    });
  };

  const resizeDimensions = (
    dimensions: { width: number; height: number },
    input: {
      width: number | null;
      height: number | null;
      maxSide: number | null;
    }
  ) => {
    const width = input.width && input.width > 0 ? Math.floor(input.width) : null;
    const height = input.height && input.height > 0 ? Math.floor(input.height) : null;
    const maxSide = input.maxSide && input.maxSide > 0 ? Math.floor(input.maxSide) : null;
    if (width && height) return { width, height };
    if (width) {
      return {
        width,
        height: Math.max(1, Math.round((dimensions.height * width) / dimensions.width))
      };
    }
    if (height) {
      return {
        width: Math.max(1, Math.round((dimensions.width * height) / dimensions.height)),
        height
      };
    }
    if (maxSide && Math.max(dimensions.width, dimensions.height) > maxSide) {
      const ratio = maxSide / Math.max(dimensions.width, dimensions.height);
      return {
        width: Math.max(1, Math.round(dimensions.width * ratio)),
        height: Math.max(1, Math.round(dimensions.height * ratio))
      };
    }
    return dimensions;
  };

  const estimateImageOutput = (
    toolId: FormatFactoryToolId,
    file: File,
    dimensions: { width: number; height: number }
  ): { mimeType: ImageOutputMime; pixels: number; usesFilter: boolean } => {
    let current = { ...dimensions };
    let mimeType: ImageOutputMime =
      file.type === 'image/jpeg' || file.type === 'image/webp' ? file.type : 'image/png';
    let usesFilter = false;

    if (imagePipelineMode.value) {
      for (const step of buildImagePipelineSteps().filter((entry) => entry.enabled)) {
        if (step.type === 'resize') current = resizeDimensions(current, step);
        if (step.type === 'rotate' && (step.rotate === 90 || step.rotate === 270)) {
          current = { width: current.height, height: current.width };
        }
        if (step.type === 'filter') usesFilter = true;
        if (step.type === 'convert') mimeType = step.outType;
      }
      return { mimeType, pixels: current.width * current.height, usesFilter };
    }

    if (toolId === 'jpeg') {
      current = resizeDimensions(current, {
        width: null,
        height: null,
        maxSide: parsePositiveInt(jpegMaxSide.value)
      });
      mimeType = 'image/jpeg';
    } else if (toolId === 'resize') {
      current = resizeDimensions(current, {
        width: parsePositiveInt(resizeWidth.value),
        height: parsePositiveInt(resizeHeight.value),
        maxSide: parsePositiveInt(resizeMaxSide.value)
      });
      mimeType = resizeOutFormat.value;
    } else if (toolId === 'rotate') {
      if (rotateDeg.value === 90 || rotateDeg.value === 270) {
        current = { width: current.height, height: current.width };
      }
      mimeType = rotateOutFormat.value;
    } else if (toolId === 'filter') {
      mimeType = filterOutFormat.value;
      usesFilter = true;
    } else if (toolId === 'webp') {
      mimeType = webpOutFormat.value;
    } else if (toolId === 'img2pdf') {
      mimeType = 'image/jpeg';
    } else if (toolId === 'ico') {
      return {
        mimeType: 'image/png',
        pixels: icoSizes.value.reduce((sum, size) => sum + size * size, 0),
        usesFilter: false
      };
    }

    return { mimeType, pixels: current.width * current.height, usesFilter };
  };

  const assertSelectedResourceBudget = (
    toolId: FormatFactoryToolId,
    files: readonly File[]
  ) => {
    const policy = getFormatFactoryInputPolicy(toolId);
    const metrics: ResourceInputMetric[] = [];
    let outputMimeType: ImageOutputMime =
      toolId === 'pdf' ? pdfOutFormat.value : 'image/jpeg';
    let usesFilter = false;
    const mimeCost: Record<ImageOutputMime, number> = {
      'image/jpeg': 1,
      'image/webp': 2,
      'image/png': 3
    };

    for (const file of files) {
      if (blockedBatchInputs.has(file)) continue;
      const dimensions = inputDimensions.get(file);
      const pixels = dimensions ? dimensions.width * dimensions.height : 0;
      let outputPixels = pixels;
      if (dimensions) {
        const estimate = estimateImageOutput(toolId, file, dimensions);
        if (mimeCost[estimate.mimeType] > mimeCost[outputMimeType]) {
          outputMimeType = estimate.mimeType;
        }
        outputPixels = estimate.pixels;
        usesFilter ||= estimate.usesFilter;
      }
      metrics.push({ bytes: file.size, pixels, outputPixels });
    }

    if (policy.kind !== 'image' && toolId !== 'pdf') return;
    assertFormatFactoryResourceBudget({
      toolId: usesFilter ? 'filter' : toolId,
      metrics,
      outputMimeType,
      filterWorkerAvailable: usesFilter ? hasFilterWorkerCapability() : undefined
    });
  };

  const icoSizeOptions = [16, 32, 48, 64, 128, 256] as const;
  const icoSizes = ref<number[]>([16, 32, 48, 64, 128, 256]);
  const icoFit = ref<'contain' | 'cover' | 'stretch'>('contain');

  const pdfPageCount = ref(0);
  const pdfMode = ref<'stitch' | 'page' | 'range'>('stitch');
  const pdfPageNumber = ref(1);
  const pdfPageRange = ref('');
  const pdfScale = ref(1.4);
  const pdfOutFormat = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const pdfQuality = ref(0.9);
  const pdfMaxPages = ref(12);

  const img2pdfPageSize = ref<'A4' | 'auto'>('A4');
  const img2pdfMarginMm = ref(10);
  const img2pdfQuality = ref(0.86);

  const wordUploadConsent = ref(false);
  const wordCapabilityStatus = ref<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const wordMaxFileBytes = ref(0);
  const wordFileWithinLimit = ref(true);
  let wordPreflightNonce = 0;

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
    if (msg === 'IMAGE_OUTPUT_INVALID' || msg === 'PDF_OUTPUT_INVALID')
      return isZh.value
        ? '输出文件校验失败，未提供损坏文件，请调整参数后重试'
        : 'Output validation failed, so the damaged file was withheld. Adjust settings and retry.';
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
    if (msg === 'OCR_NOT_SUPPORTED')
      return isZh.value
        ? '此工具不支持 OCR，扫描版 PDF 无法提取文字'
        : 'OCR is not supported. Text cannot be extracted from scanned PDFs.';
    if (msg === 'PDF_PAGE_RANGE_INVALID')
      return isZh.value
        ? '页范围无效，请使用如 1-3,5 的格式，并确保页码存在'
        : 'Invalid page range. Use a format like 1-3,5 and keep pages within the document.';
    if (msg === 'PDF_PAGE_RANGE_TOO_LARGE')
      return isZh.value
        ? '一次最多导出 50 页，请缩小页范围'
        : 'Export at most 50 pages at a time. Narrow the page range.';
    if (msg === 'TEXT_TOO_LARGE')
      return isZh.value ? '文本内容过长，请拆分后再试' : 'Text is too long. Please split it.';
    if (msg === 'INVALID_FILE_TYPE')
      return isZh.value ? '文件格式不支持，请换一个文件' : 'Unsupported file type.';
    if (msg === 'FILE_TOO_LARGE')
      return isZh.value ? '文件过大，请压缩或分批处理' : 'File is too large.';
    if (msg === 'TOO_MANY_FILES')
      return isZh.value
        ? '文件数量超过此工具上限，请分批处理'
        : 'Too many files for this tool. Process a smaller batch.';
    if (msg === 'IMAGE_PIXEL_LIMIT')
      return isZh.value
        ? '图片超过像素上限，为避免浏览器内存溢出，未开始处理'
        : 'The image exceeds the pixel limit and was not processed to protect browser memory.';
    if (msg === 'BATCH_TOTAL_BYTES_LIMIT')
      return isZh.value
        ? '这批文件总大小超过当前设备的安全预算，请减少文件或分批处理'
        : 'This batch exceeds the safe input budget for this device. Use a smaller batch.';
    if (msg === 'BATCH_TOTAL_PIXELS_LIMIT')
      return isZh.value
        ? '这批内容的总像素超过当前设备的安全预算，请降低尺寸或分批处理'
        : 'The total pixels exceed this device safety budget. Reduce dimensions or batch size.';
    if (msg === 'OUTPUT_BUDGET_EXCEEDED')
      return isZh.value
        ? '预计输出过大，请降低尺寸、页数或改用 JPEG/WebP'
        : 'The estimated output is too large. Reduce dimensions/pages or use JPEG/WebP.';
    if (msg === 'DEVICE_MEMORY_BUDGET_EXCEEDED')
      return isZh.value
        ? '预计处理内存超过当前设备安全预算，请降低尺寸或分批处理'
        : 'Estimated working memory exceeds this device safety budget. Reduce the workload.';
    if (msg === 'ZIP_MEMORY_BUDGET_EXCEEDED')
      return isZh.value
        ? 'ZIP 打包预计占用过多内存，请减少输出数量后重试'
        : 'ZIP creation would use too much memory. Download a smaller group.';
    if (msg === 'FILTER_WORKER_UNAVAILABLE')
      return isZh.value
        ? '当前浏览器不支持大图滤镜 Worker；请改用最新版浏览器或将图片降到 200 万像素以内'
        : 'This browser cannot process large filters in a worker. Update it or use images under 2 MP.';
    if (msg === 'FILTER_WORKER_FAILED')
      return isZh.value
        ? '滤镜 Worker 启动或执行失败，请重试或更换浏览器'
        : 'The filter worker failed to start or process this image. Try again or use another browser.';
    if (msg === 'IMAGE_METADATA_UNREADABLE')
      return isZh.value
        ? '无法安全读取图片尺寸，请确认文件未损坏且格式真实'
        : 'Image dimensions could not be read safely. Check that the file is valid.';
    if (msg === 'VIDEO_PIXEL_LIMIT')
      return isZh.value
        ? '视频分辨率超过此工具上限'
        : 'The video resolution exceeds this tool limit.';
    if (msg === 'VIDEO_DURATION_LIMIT')
      return isZh.value
        ? '视频或所选片段超过此工具的时长上限'
        : 'The video or selected clip exceeds this tool duration limit.';
    if (msg === 'BATCH_ALL_FAILED')
      return isZh.value
        ? '这批文件都处理失败了，请换文件或分批重试'
        : 'All files failed. Try different files or a smaller batch.';
    if (msg === 'PIPELINE_EMPTY')
      return isZh.value ? '请至少启用一个流水线步骤' : 'Enable at least one pipeline step.';
    if (msg === 'PIPELINE_RESIZE_MISSING_SIZE')
      return isZh.value
        ? '已启用缩放，请填写宽、高或最长边'
        : 'Resize is enabled. Enter width, height, or max side.';
    if (msg === 'CONVERTER_UNAVAILABLE')
      return isZh.value
        ? 'LibreOffice 保真转换服务暂不可用；不会静默降级为本地文本模式'
        : 'The LibreOffice fidelity service is unavailable; no silent local downgrade will occur.';
    if (msg === 'WORD_UPLOAD_CONSENT_REQUIRED')
      return isZh.value
        ? '请先明确同意将 Word 文件上传到转换服务'
        : 'Explicitly consent to uploading the Word file to the conversion service first.';
    if (msg === 'GIF_SOURCE_PIXEL_LIMIT')
      return isZh.value
        ? '源视频超过 1200 万像素上限，请先降低分辨率'
        : 'The source video exceeds the 12 MP limit. Reduce its resolution first.';
    if (msg === 'GIF_OUTPUT_PIXEL_LIMIT')
      return isZh.value
        ? 'GIF 输出画布超过 150 万像素，请降低宽度或改用更宽高比的视频'
        : 'The GIF output canvas exceeds 1.5 MP. Reduce width or use a less extreme aspect ratio.';
    if (msg === 'GIF_MEMORY_BUDGET_EXCEEDED')
      return isZh.value
        ? '预计 GIF 超出 192MB 内存预算，请降低宽度、帧率或时长'
        : 'The GIF exceeds the 192 MB memory budget. Reduce width, FPS, or duration.';
    if (msg === 'GIF_FRAME_LIMIT')
      return isZh.value
        ? 'GIF 帧数超过 720 帧上限，请降低帧率或时长'
        : 'The GIF exceeds the 720-frame limit. Reduce FPS or duration.';
    if (msg === 'GIF_WORKER_FAILED' || msg === 'GIF_OUTPUT_INVALID')
      return isZh.value
        ? 'GIF Worker 输出无效，请降低参数或更换视频'
        : 'The GIF Worker produced invalid output. Reduce settings or try another video.';
    if (msg === 'CONVERT_FAILED')
      return isZh.value ? '转换失败，请换一个文件再试' : 'Conversion failed. Try another file.';
    if (msg === 'CONVERT_TIMEOUT')
      return isZh.value ? '转换超时，请稍后重试' : 'Conversion timed out. Please try again later.';
    if (msg === 'MISSING_FILE')
      return isZh.value ? '文件读取失败，请重新选择' : 'File read failed. Please choose it again.';
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

  const checkWordCapability = async (file?: File | null) => {
    const nonce = ++wordPreflightNonce;
    wordCapabilityStatus.value = 'checking';
    const preflight = await preflightWordToPdf();
    if (nonce !== wordPreflightNonce) return false;
    wordMaxFileBytes.value = preflight.maxFileBytes;
    if (file && preflight.maxFileBytes > 0 && file.size > preflight.maxFileBytes) {
      wordFileWithinLimit.value = false;
      wordCapabilityStatus.value = preflight.available ? 'available' : 'unavailable';
      toolError.value = toUserError(new Error('FILE_TOO_LARGE'), '');
      return false;
    }
    wordFileWithinLimit.value = true;
    wordCapabilityStatus.value = preflight.available ? 'available' : 'unavailable';
    return preflight.available;
  };

  const moveImg2PdfSourceFile = (index: number, direction: -1 | 1) => {
    sourceFiles.value = moveListItem(sourceFiles.value, index, direction);
    sourceFile.value = sourceFiles.value[0] || null;
    revokeUrl(sourceUrl.value);
    sourceUrl.value = sourceFile.value ? URL.createObjectURL(sourceFile.value) : null;
  };

  const resetTool = () => {
    selectionNonce += 1;
    try {
      runController.value?.abort('superseded');
    } catch {}
    runController.value = null;
    try {
      downloadAllController?.abort('superseded');
    } catch {}
    downloadAllController = null;
    progress.value = null;
    runNonce.value += 1;
    isInspectingInput.value = false;
    isProcessing.value = false;
    isDownloadingAll.value = false;
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
    pdfPageRange.value = '';
    wordPreflightNonce += 1;
    wordUploadConsent.value = false;
    wordCapabilityStatus.value = 'idle';
    wordMaxFileBytes.value = 0;
    wordFileWithinLimit.value = true;
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
    return acceptAndLimitHintForTool(toolId, isZh.value ? 'zh' : 'en');
  };
  const multipleFor = (toolId: FormatFactoryToolId) =>
    getFormatFactoryInputPolicy(toolId).multiple;

  const isDragging = ref(false);

  const clearSelectedInput = () => {
    selectionNonce += 1;
    isInspectingInput.value = false;
    sourceFile.value = null;
    sourceFiles.value = [];
    sourceMeta.value = null;
    revokeUrl(sourceUrl.value);
    sourceUrl.value = null;
    watermark.reset();
    live.reset();
  };

  const supersedeActiveRun = () => {
    try {
      runController.value?.abort('superseded');
    } catch {}
    runController.value = null;
    runNonce.value += 1;
    isProcessing.value = false;
    progress.value = null;
  };

  const inspectImageBatchInputs = async (toolId: FormatFactoryToolId, files: File[]) => {
    const dimensions: Array<{ width: number; height: number } | null> = [];
    for (const file of files) {
      try {
        const [current] = await validateFormatFactoryFileContents(toolId, [file]);
        if (current) inputDimensions.set(file, current);
        dimensions.push(current || null);
      } catch {
        // Damaged or over-limit inputs remain represented as per-file failures so a mixed batch
        // can still finish, but they are marked here and never reach an image decoder or Canvas.
        blockedBatchInputs.add(file);
        dimensions.push(null);
      }
    }
    return dimensions;
  };

  const processInputFiles = async (files: File[]) => {
    if (files.length === 0) return;

    supersedeActiveRun();
    toolError.value = null;
    outputMeta.value = null;
    outputBlob.value = null;
    revokeOutputItems();
    progress.value = null;
    revokeUrl(outputUrl.value);
    outputUrl.value = null;

    const toolId = activeTool.value?.id;
    if (!toolId) return;
    clearSelectedInput();
    const nonce = selectionNonce;
    isInspectingInput.value = true;
    try {
      validateFormatFactorySelection(toolId, files);
      const policy = getFormatFactoryInputPolicy(toolId);
      const isImageBatchOperation = policy.workflowId === 'image-batch';
      const dimensions = isImageBatchOperation
        ? await inspectImageBatchInputs(toolId, files)
        : await validateFormatFactoryFileContents(toolId, files);
      if (nonce !== selectionNonce) return;
      rememberInputDimensions(files, dimensions);

      sourceFiles.value = toolId === 'img2pdf' || isImageBatchOperation ? files : [];
      const file = files[0];
      sourceFile.value = file;

      sourceUrl.value = URL.createObjectURL(file);

      if (toolId === 'img2pdf' || isImageBatchOperation) {
        const totalSize = files.reduce((sum, current) => sum + (current?.size || 0), 0);
        sourceMeta.value = {
          name: isZh.value ? `${files.length} 个文件` : `${files.length} files`,
          size: totalSize,
          dimensions:
            files.length === 1 && dimensions[0]
              ? `${dimensions[0].width}×${dimensions[0].height}`
              : undefined
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
          if (nonce !== selectionNonce) return;
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
        wordUploadConsent.value = false;
        await checkWordCapability(file);
        return;
      }

      const imageDimensions = dimensions[0];
      sourceMeta.value = {
        name: file.name,
        size: file.size,
        dimensions: imageDimensions
          ? `${imageDimensions.width}×${imageDimensions.height}`
          : undefined
      };

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
    } catch (error) {
      if (nonce !== selectionNonce) return;
      clearSelectedInput();
      toolError.value = toUserError(error, '');
      return;
    } finally {
      if (nonce === selectionNonce) isInspectingInput.value = false;
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

  const runTool = async (): Promise<FormatFactoryRunResult> => {
    toolError.value = null;
    outputMeta.value = null;
    outputBlob.value = null;
    revokeOutputItems();
    revokeUrl(outputUrl.value);
    outputUrl.value = null;
    progress.value = null;

    const tool = activeTool.value;
    if (!tool) return { status: 'failed', error: 'TOOL_NOT_SELECTED' };
    if (isInspectingInput.value) {
      return { status: 'failed', error: 'INPUT_INSPECTION_PENDING' };
    }

    isProcessing.value = true;
    try {
      runController.value?.abort('superseded');
    } catch {}
    const nonce = (runNonce.value += 1);
    const controller = new AbortController();
    runController.value = controller;
    const ownedRunUrls = new Set<string>();
    let published = false;
    let outcome: FormatFactoryRunResult = { status: 'failed' };
    const createRunUrl = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      ownedRunUrls.add(url);
      return url;
    };
    const buildRunItem = (blob: Blob, name: string, url?: string) => {
      const resolvedUrl = url || createRunUrl(blob);
      if (url) ownedRunUrls.add(url);
      return {
        blob,
        name,
        size: blob.size,
        url: resolvedUrl
      };
    };
    const publishOutputs = (
      items: FormatFactoryOutputItem[],
      options?: {
        metaName?: string;
        primary?: FormatFactoryOutputItem;
      }
    ) => {
      if (nonce !== runNonce.value || controller.signal.aborted) {
        throw new Error('RUN_SUPERSEDED');
      }
      const single = items.length === 1 ? items[0] : null;
      const primary = options?.primary || single;
      outputItems.value = items;
      outputBlob.value = primary?.blob || null;
      outputUrl.value = primary?.url || null;
      outputMeta.value = {
        name:
          primary?.name ||
          options?.metaName ||
          (isZh.value ? `${items.length} 个输出` : `${items.length} outputs`),
        size: primary?.size || items.reduce((sum, item) => sum + item.size, 0)
      };
      published = true;
      for (const item of items) ownedRunUrls.delete(item.url);
      if (primary) ownedRunUrls.delete(primary.url);
    };
    const terminationStatus = (): FormatFactoryRunStatus | null => {
      const reason = String(controller.signal.reason || '');
      if (reason === 'cancelled') return 'cancelled';
      if (controller.signal.aborted || nonce !== runNonce.value) return 'superseded';
      return null;
    };
    const setProgress = (p: FormatFactoryProgress) => {
      if (nonce !== runNonce.value) return;
      progress.value = p;
    };

    const execute = async () => {
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
          if (!validateIngredientSourceTrace(json, inputText)) {
            throw new Error('INGREDIENT_SOURCE_MISMATCH');
          }
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
        publishOutputs([buildRunItem(blob, filename, url)]);
        return;
      }

      const file = sourceFile.value;
      if (!file) return;

      const inputPolicy = getFormatFactoryInputPolicy(tool.id);
      const isBatchTool = inputPolicy.workflowId === 'image-batch';
      const selectedFiles =
        (isBatchTool || tool.id === 'img2pdf') && sourceFiles.value.length
          ? sourceFiles.value
          : [file];
      validateFormatFactorySelection(tool.id, selectedFiles);
      const validatedDimensions = isBatchTool
        ? await inspectImageBatchInputs(tool.id, selectedFiles)
        : await validateFormatFactoryFileContents(tool.id, selectedFiles);
      rememberInputDimensions(selectedFiles, validatedDimensions);
      if (tool.id === 'gif') {
        validateFormatFactorySelectionDuration(tool.id, gifDurationSec.value);
      }
      if (nonce !== runNonce.value) return;
      assertSelectedResourceBudget(tool.id, selectedFiles);

      const batchFiles: File[] = isBatchTool
        ? sourceFiles.value.length
          ? sourceFiles.value
          : [file]
        : [];

      if (imagePipelineMode.value) {
        const files = sourceFiles.value.length ? sourceFiles.value : [file];
        const results: FormatFactoryOutputItem[] = [];
        const failures: string[] = [];
        const steps = buildImagePipelineSteps();
        for (let index = 0; index < files.length; index += 1) {
          const input = files[index];
          if (blockedBatchInputs.has(input)) {
            failures.push(input.name);
            setProgress({
              done: index + 1,
              total: files.length,
              label: `${index + 1}/${files.length} ${isZh.value ? '已跳过' : 'Skipped'}`
            });
            continue;
          }
          try {
            const result = await runOrderedImagePipeline(input, steps, {
              signal: controller.signal,
              lang: isZh.value ? 'zh' : 'en',
              onProgress: (current) => {
                const ratio = current.total > 0 ? current.done / current.total : 0;
                setProgress({
                  done: index + Math.max(0, Math.min(1, ratio)),
                  total: files.length,
                  label: `${index + 1}/${files.length} ${current.label || ''}`.trim()
                });
              }
            });
            if (nonce !== runNonce.value) return;
            results.push(buildRunItem(result.blob, result.filename));
          } catch (error: any) {
            const aborted =
              controller.signal.aborted ||
              error?.name === 'AbortError' ||
              error?.message === 'ABORTED';
            if (aborted || nonce !== runNonce.value) return;
            if (
              error?.message === 'PIPELINE_EMPTY' ||
              error?.message === 'PIPELINE_RESIZE_MISSING_SIZE'
            ) {
              throw error;
            }
            failures.push(input.name);
          }
          setProgress({
            done: index + 1,
            total: files.length,
            label: `${index + 1}/${files.length} ${isZh.value ? '完成' : 'Done'}`
          });
        }
        if (!results.length) throw new Error('BATCH_ALL_FAILED');
        if (failures.length) {
          toolError.value = isZh.value
            ? `${failures.length} 个文件失败，其余结果已保留`
            : `${failures.length} file(s) failed; other results were kept.`;
        }
        publishOutputs(results);
        return;
      }

      if (isBatchTool && batchFiles.length > 1) {
        const results: FormatFactoryOutputItem[] = [];
        const failures: string[] = [];
        const totalFiles = batchFiles.length;
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
          if (blockedBatchInputs.has(f)) {
            failures.push(f?.name || String(i + 1));
            setProgress({
              done: (i + 1) * 100,
              total: totalFiles * 100,
              label: `${i + 1}/${totalFiles} ${isZh.value ? '已跳过' : 'Skipped'}`
            });
            continue;
          }

          try {
            if (tool.id === 'webp') {
              const { blob, filename } = await convertImage(
                f,
                webpOutFormat.value,
                webpOutFormat.value === 'image/png' ? undefined : webpQuality.value,
                { signal: controller.signal, onProgress: onFileProgress }
              );
              if (nonce !== runNonce.value) return;
              results.push(buildRunItem(blob, filename));
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
              results.push(buildRunItem(blob, filename));
              setProgress({
                done: (i + 1) * 100,
                total: totalFiles * 100,
                label: `${i + 1}/${totalFiles} ${isZh.value ? '完成' : 'Done'}`
              });
              continue;
            }

            if (tool.id === 'resize') {
              const width = parsePositiveInt(resizeWidth.value);
              const height = parsePositiveInt(resizeHeight.value);
              const maxSide = parsePositiveInt(resizeMaxSide.value);
              const { blob, filename } = await resizeImage(
                f,
                {
                  width,
                  height,
                  maxSide,
                  outType: resizeOutFormat.value,
                  quality:
                    resizeOutFormat.value === 'image/png' ? undefined : resizeQuality.value
                },
                { signal: controller.signal, onProgress: onFileProgress }
              );
              if (nonce !== runNonce.value) return;
              results.push(buildRunItem(blob, filename));
              setProgress({
                done: (i + 1) * 100,
                total: totalFiles * 100,
                label: `${i + 1}/${totalFiles} ${isZh.value ? '完成' : 'Done'}`
              });
              continue;
            }

            if (tool.id === 'rotate') {
              const { blob, filename } = await rotateFlipImage(
                f,
                {
                  rotate: rotateDeg.value,
                  flipH: rotateFlipH.value,
                  flipV: rotateFlipV.value,
                  outType: rotateOutFormat.value,
                  quality:
                    rotateOutFormat.value === 'image/png' ? undefined : rotateQuality.value
                },
                { signal: controller.signal, onProgress: onFileProgress }
              );
              if (nonce !== runNonce.value) return;
              results.push(buildRunItem(blob, filename));
              setProgress({
                done: (i + 1) * 100,
                total: totalFiles * 100,
                label: `${i + 1}/${totalFiles} ${isZh.value ? '完成' : 'Done'}`
              });
              continue;
            }

            if (tool.id === 'filter') {
              const { blob, filename } = await filterImage(
                f,
                {
                  preset: filterPreset.value,
                  intensity: filterIntensity.value,
                  outType: filterOutFormat.value,
                  quality:
                    filterOutFormat.value === 'image/png' ? undefined : filterQuality.value
                },
                {
                  signal: controller.signal,
                  onProgress: onFileProgress
                }
              );
              if (nonce !== runNonce.value) return;
              results.push(buildRunItem(blob, filename));
              setProgress({
                done: (i + 1) * 100,
                total: totalFiles * 100,
                label: `${i + 1}/${totalFiles} ${isZh.value ? '完成' : 'Done'}`
              });
              continue;
            }

            throw new Error('OPERATION_NOT_SUPPORTED');
          } catch (err: any) {
            if (nonce !== runNonce.value) return;
            const aborted =
              controller.signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
            if (aborted) return;
            failures.push(f?.name || String(i + 1));
            setProgress({
              done: (i + 1) * 100,
              total: totalFiles * 100,
              label: `${i + 1}/${totalFiles} ${isZh.value ? '已跳过' : 'Skipped'}`
            });
          }
        }

        if (results.length === 0 && failures.length > 0) {
          throw new Error('BATCH_ALL_FAILED');
        }
        if (failures.length > 0) {
          toolError.value = isZh.value
            ? `${failures.length} 个文件处理失败，已保留其余结果`
            : `${failures.length} file(s) failed. Other results are kept.`;
        }
        setProgress({
          done: totalFiles * 100,
          total: totalFiles * 100,
          label: isZh.value ? '完成' : 'Done'
        });
        publishOutputs(results);
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
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'jpeg') {
        const maxSide = parsePositiveInt(jpegMaxSide.value);
        const { blob, filename } = await convertToJpeg(file, jpegQuality.value, maxSide, {
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
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
        publishOutputs([buildRunItem(blob, filename)]);
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
        publishOutputs([buildRunItem(blob, filename)]);
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
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'ico') {
        const sizes = icoSizes.value.slice().sort((a, b) => a - b);
        if (sizes.length === 0) {
          toolError.value = isZh.value ? '请至少选择一个尺寸' : 'Please select at least one size';
          return;
        }
        const { blob, filename } = await generateIco(file, sizes, {
          fit: icoFit.value,
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'watermark') {
        const { blob, filename } = await watermark.exportWatermark();
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'live') {
        const { blob, filename } = await live.captureVideoFrame(inputPolicy.limits);
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'pdf') {
        if (pdfMode.value === 'range') {
          const rangeResult = await pdfPagesToImages(file, {
            pageRange: pdfPageRange.value,
            scale: pdfScale.value,
            outType: pdfOutFormat.value,
            quality: pdfQuality.value,
            maxPages: 50,
            signal: controller.signal,
            onProgress: setProgress
          });
          assertZipResourceBudget(rangeResult.items.map((item) => item.blob.size));
          const zip = await createZipBlob(
            rangeResult.items.map((item) => ({ name: item.filename, blob: item.blob })),
            { signal: controller.signal }
          );
          if (nonce !== runNonce.value) return;
          const primary = buildRunItem(zip, rangeResult.filename);
          const items = rangeResult.items.map((item) =>
            buildRunItem(item.blob, item.filename)
          );
          publishOutputs(items, { primary });
          return;
        }
        const safePageNumber = Math.max(1, Math.floor(pdfPageNumber.value || 1));
        const pageNumber = pdfPageCount.value
          ? Math.min(pdfPageCount.value, safePageNumber)
          : safePageNumber;
        const { blob, filename } = await pdfToImage(file, {
          mode: pdfMode.value === 'page' ? 'page' : 'stitch',
          pageNumber,
          pageRange: pdfMode.value === 'stitch' ? pdfPageRange.value : '',
          scale: pdfScale.value,
          outType: pdfOutFormat.value,
          quality: pdfQuality.value,
          maxPages: pdfMaxPages.value,
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'pdf2word') {
        const { blob, filename } = await pdfToWord(file, {
          lang: isZh.value ? 'zh' : 'en',
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'word2pdf') {
        if (!wordUploadConsent.value) throw new Error('WORD_UPLOAD_CONSENT_REQUIRED');
        const capabilityReady =
          wordCapabilityStatus.value === 'available' || (await checkWordCapability(file));
        if (!capabilityReady) throw new Error('CONVERTER_UNAVAILABLE');
        setProgress({
          done: 0,
          total: 2,
          label: isZh.value ? '上传到 LibreOffice 转换服务' : 'Uploading to LibreOffice service'
        });
        const { blob, filename } = await convertWithBackend('word2pdf', file, {
          signal: controller.signal,
          uploadConsent: wordUploadConsent.value
        });
        setProgress({
          done: 2,
          total: 2,
          label: isZh.value ? '服务端保真转换完成' : 'Server fidelity conversion complete'
        });
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
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
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }

      if (tool.id === 'txt2pdf') {
        const { blob, filename } = await txtToPdf(file, {
          lang: isZh.value ? 'zh' : 'en',
          signal: controller.signal,
          onProgress: setProgress
        });
        if (nonce !== runNonce.value) return;
        publishOutputs([buildRunItem(blob, filename)]);
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
        publishOutputs([buildRunItem(blob, filename)]);
        return;
      }
    };

    try {
      await execute();
      const termination = terminationStatus();
      if (termination) {
        outcome = { status: termination };
      } else if (published) {
        outcome = { status: 'success' };
      } else {
        const error =
          String(toolError.value || '').trim() ||
          (isZh.value ? '处理未完成' : 'Processing did not complete.');
        toolError.value = error;
        outcome = { status: 'failed', error };
      }
    } catch (err: any) {
      const termination = terminationStatus();
      if (termination || err?.message === 'RUN_SUPERSEDED') {
        outcome = { status: termination || 'superseded' };
      } else {
        const error = toUserError(
          err,
          isZh.value ? '处理失败，请换一个文件再试' : 'Processing failed. Try another file.'
        );
        toolError.value = error;
        outcome = { status: 'failed', error };
      }
    } finally {
      for (const url of ownedRunUrls) revokeUrl(url);
      ownedRunUrls.clear();
      if (nonce === runNonce.value) {
        isProcessing.value = false;
        runController.value = null;
      }
    }
    return outcome;
  };

  const downloadOutput = () => {
    if (outputMeta.value?.name.endsWith('.zip') && outputBlob.value) {
      downloadBlob(outputBlob.value, outputMeta.value.name);
      return;
    }
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
    const now = Date.now();
    if (isDownloadingAll.value || now < downloadAllLockUntil) return;
    const list = outputItems.value.slice();
    if (list.length === 0) return;
    if (list.length === 1) {
      downloadBlob(list[0].blob, list[0].name);
      return;
    }
    isDownloadingAll.value = true;
    try {
      downloadAllController?.abort('superseded');
    } catch {}
    const controller = new AbortController();
    downloadAllController = controller;
    // ZIP creation can finish between the two click events of a double click.
    // Keep a short interaction lock so one user gesture cannot emit duplicate downloads.
    downloadAllLockUntil = now + 750;
    try {
      assertZipResourceBudget(list.map((item) => item.blob.size));
      const zip = await createZipBlob(list, { signal: controller.signal });
      if (controller.signal.aborted) return;
      downloadBlob(zip, `artigen-outputs-${Date.now().toString(36)}.zip`);
    } catch (error: any) {
      if (controller.signal.aborted || error?.message === 'ABORTED') return;
      toolError.value = toUserError(
        error,
        isZh.value ? 'ZIP 导出失败，请重试' : 'ZIP export failed. Please try again.'
      );
    } finally {
      if (downloadAllController === controller) {
        downloadAllController = null;
        isDownloadingAll.value = false;
      }
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
    const toolId = activeTool.value?.id;
    const video = live.liveVideoRef.value;
    if (!meta || !video || (toolId !== 'live' && toolId !== 'gif')) return;
    try {
      validateFormatFactoryVideoMetadata(toolId, {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: video.duration
      });
      sourceMeta.value = meta;
    } catch (error) {
      clearSelectedInput();
      toolError.value = toUserError(error, '');
    }
  };

  onBeforeUnmount(() => {
    selectionNonce += 1;
    try {
      runController.value?.abort('superseded');
    } catch {}
    runNonce.value += 1;
    runController.value = null;
    try {
      downloadAllController?.abort('superseded');
    } catch {}
    downloadAllController = null;
    revokeOutputItems();
    revokeUrl(sourceUrl.value);
    revokeUrl(outputUrl.value);
    sourceUrl.value = null;
    outputUrl.value = null;
    watermark.reset();
    live.reset();
    if (soonTipTimer) window.clearTimeout(soonTipTimer);
    soonTipTimer = null;
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
      runController.value?.abort('cancelled');
    } catch {}
    runController.value = null;
    try {
      downloadAllController?.abort('cancelled');
    } catch {}
    downloadAllController = null;
    progress.value = null;
    runNonce.value += 1;
    isProcessing.value = false;
    isDownloadingAll.value = false;
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
    multipleFor,
    onFileChange,
    runTool,
    downloadOutput,
    downloadAllOutputs,
    downloadOutputItem,
    openOutputPreview,
    toggleIcoSize,
    formatBytes,
    sourceFile,
    sourceFiles,
    sourceUrl,
    sourceMeta,
    outputUrl,
    outputBlob,
    outputMeta,
    outputItems,
    isInspectingInput,
    isProcessing,
    isDownloadingAll,
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
    imagePipelineMode,
    imagePipelineOrder,
    imagePipelineEnabled,
    toggleImagePipelineStep,
    moveImagePipelineStep,
    icoSizeOptions,
    icoSizes,
    icoFit,
    pdfPageCount,
    pdfMode,
    pdfPageNumber,
    pdfPageRange,
    pdfScale,
    pdfOutFormat,
    pdfQuality,
    pdfMaxPages,
    img2pdfPageSize,
    img2pdfMarginMm,
    img2pdfQuality,
    moveImg2PdfSourceFile,
    wordUploadConsent,
    wordCapabilityStatus,
    wordMaxFileBytes,
    wordFileWithinLimit,
    checkWordCapability,
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
