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
  resizeImage,
  rotateFlipImage,
  videoToGif
} from '../logic/formatFactory/processors';
import type { FormatFactoryProgress } from '../logic/formatFactory/processors';
import type { FormatFactoryTool, FormatFactoryToolId } from '../logic/formatFactory/types';
import { downloadBlob, revokeUrl } from '../logic/formatFactory/url';
import { extractFirstJsonObject, safeJsonStringify } from '../logic/json';
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

    if (toolId === 'pdf') {
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

        const buildLabelSectionsUnifiedQwen = async (
          inputText: string,
          productType: string,
          opts?: { signal?: AbortSignal }
        ): Promise<{
          sections: any[];
          layoutType: 'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts';
        }> => {
          let systemInstruction = '';
          let jsonStructure = '';
          const productTypeUpper = String(productType || '').toUpperCase();

          if (productTypeUpper === 'DRUG') {
            systemInstruction = `Generate FDA-compliant Drug Facts JSON from: ${inputText}. Titles in ALL CAPS. Required sections and order: ACTIVE INGREDIENTS, PURPOSE, USES, WARNINGS, DIRECTIONS, OTHER INFORMATION, INACTIVE INGREDIENTS, MANUFACTURER, NET CONTENT, NDC, LOT NUMBER, EXPIRATION DATE. 
    
    CRITICAL: If the user input is minimal, YOU MUST INFER and GENERATE realistic standard FDA content for 'WARNINGS', 'DIRECTIONS', and 'OTHER INFORMATION' based on the active ingredients identified. Do not return empty objects. 
    - WARNINGS must be an object with keys: do_not_use, ask_doctor_before_use, ask_doctor_or_pharmacist, when_using_this_product, stop_use_and_ask_doctor, pregnancy_breastfeeding, keep_out_of_reach. Populate these with standard warnings for the drug type. KEEP WARNINGS EXTREMELY CONCISE (3–5 words per bullet, no full sentences) while maintaining FDA compliance.
    - DIRECTIONS may be an object with groups [{age,dose,frequency}] and general []. Populate with standard dosages.
    - OTHER INFORMATION: Populate with standard storage info (e.g., Store at 20-25°C).
    - USES: Provide concise bullet-point style uses.
    - MANUFACTURER: Generate a realistic manufacturer name and address if not provided (e.g., "HealthPharma Inc., New York, NY 10001").
    - NET CONTENT: Generate realistic net quantity in dual units if missing (e.g., "100 tablets" or "Net Wt 1 oz (28 g)").
    - NDC: Generate a realistic National Drug Code (e.g., "12345-678-90").
    - LOT NUMBER: Generate a realistic lot number (e.g., "A1234567").
    - EXPIRATION DATE: Generate a realistic expiration date (e.g., "Exp: 12/2026").
    
    Content must be concise, direct, and in American English.`;
            const js = {
              layoutType: 'drug_facts' as const,
              sections: [
                { title: 'ACTIVE INGREDIENTS', content: '...' },
                { title: 'PURPOSE', content: '...' },
                { title: 'USES', content: '...' },
                { title: 'WARNINGS', content: { do_not_use: ['...'] } },
                {
                  title: 'DIRECTIONS',
                  content: {
                    groups: [{ age: 'Adults', dose: '2 tablets', frequency: 'every 6 hours' }]
                  }
                },
                { title: 'OTHER INFORMATION', content: ['...'] },
                { title: 'INACTIVE INGREDIENTS', content: '...' },
                { title: 'MANUFACTURER', content: '...' },
                { title: 'NET CONTENT', content: '...' },
                { title: 'NDC', content: '...' },
                { title: 'LOT NUMBER', content: '...' },
                { title: 'EXPIRATION DATE', content: '...' }
              ]
            };
            jsonStructure = safeJsonStringify(js);
          } else if (productTypeUpper === 'DIETARY SUPPLEMENT') {
            systemInstruction = `FDA Supplement Facts expert. Convert the user's text (${inputText}) into the Supplement Facts JSON format. INGREDIENTS MUST be a single, comma-separated list (e.g., Gelatin, Cellulose). 
    
    CRITICAL EXPANSION: 
    1. If the user text is minimal (1-2 words/ingredients) or implies 'pure'/'only', you MUST infer and expand it into a realistic, full commercial ingredient list.
    2. %DV Handling: For ingredients where Daily Value (DV) is not established (e.g. herbal extracts, specific amino acids), set 'dv' to '*' (asterisk). Do NOT use 'N/A'.
    3. WARNINGS: If warnings are missing, you MUST generate these EXACT standard warnings: "Keep out of reach of children.", "Do not use if safety seal is broken or missing.", and "Consult a physician if pregnant, nursing, taking medication, or have a medical condition."
    4. MANUFACTURER: You MUST generate a realistic Manufacturer Name AND Full US Physical Address (Street, City, State Zip) if not provided (e.g., "Vitality Supps LLC, 123 Wellness Dr, Austin, TX 78701").
    5. NET CONTENT: You MUST generate realistic net content in dual units if missing (e.g., "60 Capsules" or "Net Wt 5 oz (140 g)").
    
    Infer necessary content for all required sections. CRITICAL: Translate all user content to American English. Keep content extremely concise, capitalized, and without special formatting symbols. All titles must be ENGLISH and UPPERCASE. Output ONLY the JSON object.`;
            jsonStructure = safeJsonStringify({
              layoutType: 'supplement_facts',
              sections: [
                {
                  title: 'SERVE HEADER',
                  content: { servingSize: '...', servingsPerContainer: '...' },
                  isHeader: true
                },
                {
                  title: 'SUPPLEMENT FACTS TABLE',
                  content: [{ name: '...', amount: '...', dv: '*' }],
                  isTable: true
                },
                { title: 'OTHER INGREDIENTS', content: '...' },
                { title: 'SUGGESTED USE', content: '...' },
                { title: 'WARNINGS', content: '...' },
                { title: 'MANUFACTURER', content: '...' },
                { title: 'NET CONTENT', content: '...' }
              ]
            });
          } else if (productTypeUpper === 'COSMETIC') {
            systemInstruction = `FDA/INCI Cosmetic Label Expert. Convert the user's text (${inputText}) into a strictly compliant Cosmetic Ingredient List JSON.
    
    STRICT RULES:
    1. INCI Naming: All non-colorant ingredients MUST use INCI names (e.g., 'Water' -> 'Aqua', 'Vitamin E' -> 'Tocopherol').
    2. Descending Order: Ingredients > 1% MUST be listed in descending order of weight. Ingredients <= 1% can follow in any order.
    3. Colorants (FDA Legal Names): Provide FDA-required legal colorant names with CI numbers in parentheses and list them in a unified 'MAY CONTAIN' section at the end (e.g., "Titanium Dioxide (CI 77891)", "Iron Oxides (CI 77491, CI 77492, 77499)", "Red 7 Lake (CI 15850)", "Mica"). Do NOT scatter colorants inside the main ingredients.
    4. Fragrance: Use "Fragrance" or "Parfum" instead of individual components. If the fragrance contains any of FDA's 26 cosmetic contact allergens (e.g., Benzyl Alcohol, Cinnamal, Citral), list those specific allergens in the 'CONTAINS' section (not "Fragrance").
    5. Allergens (CONTAINS Section): If NO allergens are present, OMIT the 'CONTAINS' section entirely (do NOT output "None").
    6. Title: Use "INGREDIENTS" as the main section title (UPPERCASE).
    7. Exclusions: DO NOT include Manufacturer/Distributor information. DO NOT include Net Content/Quantity information.
    
    CRITICAL EXPANSION: Unless the user explicitly says 'pure' or 'only', infer and expand minimal inputs into a realistic commercial formula (base, emulsifiers, preservatives, actives). When 'pure' or 'only' is stated, do not expand.
    
    NO DRUG CLAIMS: Do NOT include any therapeutic or drug claims in the text.
    
    Output ONLY the JSON object.`;

            jsonStructure = safeJsonStringify({
              layoutType: 'standard',
              sections: [
                { title: 'INGREDIENTS', content: 'Aqua, Glycerin, ...' },
                { title: 'CONTAINS', content: 'Cinnamal, Peanuts, ...' },
                { title: 'MAY CONTAIN', content: 'Titanium Dioxide (CI 77891), ...' }
              ]
            });
          } else if (productTypeUpper === 'FOOD') {
            systemInstruction = `FDA Food Label Expert. Convert the user's text (${inputText}) into a strictly compliant Food Ingredient List JSON.
    
    STRICT RULES:
    1. Layout: Use 'standard' layout ONLY. DO NOT generate 'nutrition_facts' or 'supplement_facts'.
    2. Sections: Return ONLY 'INGREDIENTS' and 'CONTAINS'.
    3. Net Content: DO NOT generate or include 'NET CONTENT' or any quantity information (e.g. "10 fl oz").
    4. Ingredients Expansion: Expand ingredients by default into a realistic, full commercial list (including excipients/preservatives if applicable). If the user explicitly says 'pure' or 'only', DO NOT expand and only list provided items.
    5. Contains (Allergens): If NO allergens are present, DO NOT include the 'CONTAINS' section in the JSON. Omit it entirely. DO NOT output "None".
    
    Translate all content to American English. Keep content concise and capitalized. All titles ENGLISH and UPPERCASE. Output ONLY the JSON object.`;

            jsonStructure = safeJsonStringify({
              layoutType: 'standard',
              sections: [
                { title: 'INGREDIENTS', content: '...' },
                { title: 'CONTAINS', content: '...' }
              ]
            });
          } else {
            systemInstruction = `Convert the user's text (${inputText}) into the Standard JSON format.
    
    INTELLIGENT MODE:
    1. Check if the user provided any quantitative nutritional information (e.g., Calories, Fat).
    2. IF YES: Generate a 'NUTRITION FACTS' JSON structure (layoutType: 'nutrition_facts').
       - Include 'NUTRITION FACTS' section with: servingSize, servingsPerContainer, calories, totalFat (g/%), sodium (mg/%), totalCarb (g/%), protein (g).
       - Include 'INGREDIENTS' and 'CONTAINS' as usual.
    3. IF NO (just simple ingredients): Use 'standard' layout with 'INGREDIENTS' and 'CONTAINS'.
    
    CRITICAL EXPANSION for Ingredients: Expand by default into a realistic commercial list. If the user explicitly says 'pure' or 'only', DO NOT expand.
    For 'CONTAINS', if NO allergens are present, omit the 'CONTAINS' section entirely.
    Translate all content to American English. Keep content concise and capitalized. All titles ENGLISH and UPPERCASE. Output ONLY the JSON object.`;

            jsonStructure = safeJsonStringify({
              layoutType: 'nutrition_facts',
              sections: [
                {
                  title: 'NUTRITION FACTS',
                  content: {
                    servingSize: '...',
                    servingsPerContainer: '...',
                    calories: '...',
                    totalFat: { amount: '...g', dv: '...%' },
                    sodium: { amount: '...mg', dv: '...%' },
                    totalCarbohydrate: { amount: '...g', dv: '...%' },
                    protein: '...g'
                  },
                  isTable: true
                },
                { title: 'INGREDIENTS', content: '...' },
                { title: 'CONTAINS', content: '...' }
              ]
            });
          }

          const prompt = `${systemInstruction}\nReturn ONLY the JSON object conforming to this structure: ${jsonStructure}`;
          const requestId = `ff_ingredient_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          const res = await generateText(prompt, {
            signal: opts?.signal,
            timeoutMs: 45000,
            requestId,
            model: 'qwen'
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
        const { sections, layoutType } = await buildLabelSectionsUnifiedQwen(
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
