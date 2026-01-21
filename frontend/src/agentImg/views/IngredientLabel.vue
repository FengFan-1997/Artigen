<script setup lang="ts">
import { ref, onBeforeUnmount, watch, computed, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { message } from 'ant-design-vue';
import gsap from 'gsap';
import IngredientLabelTypeSelect from '../components/IngredientLabelTypeSelect.vue';
import ActionButton from '@/components/ActionButton.vue';
import { useLanguageStore } from '@/stores/language';
import { generateText } from '../services/text';
import {
  buildIngredientLabelSvg,
  buildIngredientLabelSvgUrl,
  type IngredientLabelLayoutType
} from '../logic/formatFactory/ingredientLabel';
import { exportPdf } from '@/utils/export';

const props = defineProps<{ visible: boolean; creditsCost?: number }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const editorBoxRef = ref<HTMLElement | null>(null);
const watermarkRef = ref<HTMLElement | null>(null);
const isLoading = ref(false);
const progressValue = ref(0);
const isDownloadModalOpen = ref(false);
const isDownloadPopoverOpen = ref(false);
const isLabelTypeModalOpen = ref(false);
const isMobile = ref(false);
let progressInterval: number | null = null;

const ingredientsInput = ref('');
const productType = ref<'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement'>('Food');
const typeOptions = [
  { label: 'Food', value: 0, gtm: 'ga-click-demo-food' },
  { label: 'Drug', value: 1, gtm: 'ga-click-demo-drug' },
  { label: 'Cosmetic', value: 2, gtm: 'ga-click-demo-cosmetic' },
  { label: 'Dietary Supplement', value: 3, gtm: 'ga-click-demo-dietary-supplement' }
];
const productTypeMap: Record<number, 'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement'> = {
  0: 'Food',
  1: 'Drug',
  2: 'Cosmetic',
  3: 'Dietary Supplement'
};
const typeIndex = ref(0);

const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300" viewBox="0 0 500 300" font-family="Arial, sans-serif"><rect width="500" height="300" fill="#fff"/><rect x="0.75" y="0.75" width="498.5" height="298.5" fill="none" stroke="#000" stroke-width="1.5"/></svg>`;
const placeholderUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(placeholderSvg);
const imgSrc = ref<string>(placeholderUrl);
const lastLayoutType = ref<IngredientLabelLayoutType | null>(null);
const pendingLayoutType = ref<IngredientLabelLayoutType | null>(null);
const errorMsg = ref('');
const canDownload = ref(false);

const PLACEHOLDERS: Record<string, { zh: string; en: string }> = {
  Drug: {
    zh: '请提供有效成分/用途/辅料等信息，支持用逗号或换行分隔。信息不足时系统会补全常见 FDA 规范内容。',
    en: 'Provide active ingredients/uses/inactive ingredients. Use commas or new lines. If info is limited, the system will infer standard FDA content.'
  },
  Food: {
    zh: '请输入食品配料（逗号或换行分隔），例如：beef, milk chocolate。',
    en: 'Provide food ingredients (comma or newline separated), e.g., "beef, milk chocolate".'
  },
  Cosmetic: {
    zh: '请输入化妆品成分（逗号或换行分隔），例如：water, vitamin E。',
    en: 'Provide cosmetic ingredients (comma or newline separated), e.g., "water, vitamin E".'
  },
  'Dietary Supplement': {
    zh: '请输入补充剂主要成分与规格，例如：Vitamin C, Zinc; 60 capsules/bottle。',
    en: 'Enter main ingredients and specs, e.g., "Vitamin C, Zinc; 60 capsules/bottle".'
  },
  default: {
    zh: '配料/成分文本（逗号或换行分隔）',
    en: 'Ingredients (comma or newline separated)'
  }
};
const placeholderText = computed(() => {
  const en = currentLang.value === 'en';
  const k = PLACEHOLDERS[productType.value] ?? PLACEHOLDERS.default;
  return en ? k.en : k.zh;
});

const costText = computed(() => {
  const n = Math.max(0, Math.trunc(Number(props.creditsCost ?? 10) || 0));
  if (!n) return '';
  return `⚡${n}`;
});

const DEFAULT_LAYOUT_BY_TYPE: Record<
  'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement',
  IngredientLabelLayoutType
> = {
  Food: 'standard',
  Drug: 'drug_facts',
  Cosmetic: 'standard',
  'Dietary Supplement': 'supplement_facts'
};

const updateProgressBarPosition = () => {
  const editor = editorBoxRef.value as HTMLElement;
  if (!editor) return;
  const img = editor.querySelector('img') as HTMLImageElement;
  const progressBar = editor.querySelector('.progress-bar') as HTMLElement;
  if (!img || !progressBar || !img.complete) return;
  const containerRect = editor.getBoundingClientRect();
  const imageRatio = img.naturalWidth / img.naturalHeight;
  const containerRatio = containerRect.width / containerRect.height;
  let actualDisplayWidth, actualDisplayHeight;
  if (imageRatio > containerRatio) {
    actualDisplayWidth = containerRect.width;
    actualDisplayHeight = containerRect.width / imageRatio;
  } else {
    actualDisplayWidth = containerRect.height * imageRatio;
    actualDisplayHeight = containerRect.height;
  }
  const offsetX = (containerRect.width - actualDisplayWidth) / 2;
  const offsetY = (containerRect.height - actualDisplayHeight) / 2;
  progressBar.style.width = `${actualDisplayWidth}px`;
  progressBar.style.left = `${offsetX}px`;
  progressBar.style.bottom = `${offsetY + 0}px`;
  progressBar.style.right = 'auto';
};

const startProgress = () => {
  if (progressInterval) clearInterval(progressInterval);
  progressValue.value = 0;
  setTimeout(() => updateProgressBarPosition(), 0);
  const allTime = 10000;
  const step = 100 / (allTime / (1000 / 60));
  progressInterval = window.setInterval(() => {
    if (progressValue.value < 85) progressValue.value += step;
  }, 16);
};

const completeProgress = () => {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  progressValue.value = 100;
  setTimeout(() => {
    isLoading.value = false;
    progressValue.value = 0;
  }, 300);
};

const onImageLoaded = () => {
  if (isLoading.value) completeProgress();
  if (pendingLayoutType.value) {
    lastLayoutType.value = pendingLayoutType.value;
    pendingLayoutType.value = null;
  }
  updateWatermark();
  updateProgressBarPosition();
  canDownload.value = !!(!isLoading.value && imgSrc.value && imgSrc.value !== placeholderUrl);
};

const updateWatermark = () => {
  const watermark = watermarkRef.value as HTMLElement;
  const editor = editorBoxRef.value as HTMLElement;
  if (!watermark || !editor) return;
  const demoMode = imgSrc.value === placeholderUrl;
  if (!isLoading.value && demoMode) {
    const img = editor.querySelector('img') as HTMLImageElement;
    if (!img?.complete) return;
    const containerRect = editor.getBoundingClientRect();
    const imageRatio = img.naturalWidth / img.naturalHeight;
    const containerRatio = containerRect.width / containerRect.height;
    let actualDisplayWidth;
    if (imageRatio > containerRatio) {
      actualDisplayWidth = containerRect.width;
    } else {
      actualDisplayWidth = containerRect.height * imageRatio;
    }
    const watermarkWidth = actualDisplayWidth * 0.78;
    const fontSize = 72 * (watermarkWidth / 500);
    watermark.style.cssText = `display: flex; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: ${watermarkWidth}px; height: ${watermarkWidth / 4}px; font-size: ${fontSize}px; font-weight: 600; color: rgba(0,0,0,0.08); z-index: 10; pointer-events: none; align-items: center; justify-content: center; text-align: center; line-height: 1;`;
  } else {
    watermark.style.display = 'none';
  }
};

const parseJsonFromAi = (raw: string) => {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

const buildLabelPrompt = (inputText: string, type: string) => {
  const productTypeUpper = String(type || '').toUpperCase();
  if (productTypeUpper === 'DRUG') {
    const systemInstruction = `Generate FDA-compliant Drug Facts JSON from: ${inputText}. Titles in ALL CAPS. Required sections and order: ACTIVE INGREDIENTS, PURPOSE, USES, WARNINGS, DIRECTIONS, OTHER INFORMATION, INACTIVE INGREDIENTS, MANUFACTURER, NET CONTENT, NDC, LOT NUMBER, EXPIRATION DATE.

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
    const jsonStructure = JSON.stringify({
      layoutType: 'drug_facts',
      sections: [
        { title: 'ACTIVE INGREDIENTS', content: '...' },
        { title: 'PURPOSE', content: '...' },
        { title: 'USES', content: '...' },
        { title: 'WARNINGS', content: { do_not_use: ['...'] } },
        {
          title: 'DIRECTIONS',
          content: { groups: [{ age: 'Adults', dose: '2 tablets', frequency: 'every 6 hours' }] }
        },
        { title: 'OTHER INFORMATION', content: ['...'] },
        { title: 'INACTIVE INGREDIENTS', content: '...' },
        { title: 'MANUFACTURER', content: '...' },
        { title: 'NET CONTENT', content: '...' },
        { title: 'NDC', content: '...' },
        { title: 'LOT NUMBER', content: '...' },
        { title: 'EXPIRATION DATE', content: '...' }
      ]
    });
    return `${systemInstruction}\nReturn ONLY the JSON object conforming to this structure: ${jsonStructure}`;
  }

  if (productTypeUpper === 'DIETARY SUPPLEMENT') {
    const systemInstruction = `FDA Supplement Facts expert. Convert the user's text (${inputText}) into the Supplement Facts JSON format. INGREDIENTS MUST be a single, comma-separated list (e.g., Gelatin, Cellulose).

CRITICAL EXPANSION:
1. If the user text is minimal (1-2 words/ingredients) or implies 'pure'/'only', you MUST infer and expand it into a realistic, full commercial ingredient list.
2. %DV Handling: For ingredients where Daily Value (DV) is not established (e.g. herbal extracts, specific amino acids), set 'dv' to '*' (asterisk). Do NOT use 'N/A'.
3. WARNINGS: If warnings are missing, you MUST generate these EXACT standard warnings: "Keep out of reach of children.", "Do not use if safety seal is broken or missing.", and "Consult a physician if pregnant, nursing, taking medication, or have a medical condition."
4. MANUFACTURER: You MUST generate a realistic Manufacturer Name AND Full US Physical Address (Street, City, State Zip) if not provided (e.g., "Vitality Supps LLC, 123 Wellness Dr, Austin, TX 78701").
5. NET CONTENT: You MUST generate realistic net content in dual units if missing (e.g., "60 Capsules" or "Net Wt 5 oz (140 g)").

Infer necessary content for all required sections. CRITICAL: Translate all user content to American English. Keep content extremely concise, capitalized, and without special formatting symbols. All titles must be ENGLISH and UPPERCASE. Output ONLY the JSON object.`;
    const jsonStructure = JSON.stringify({
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
    return `${systemInstruction}\nReturn ONLY the JSON object conforming to this structure: ${jsonStructure}`;
  }

  if (productTypeUpper === 'COSMETIC') {
    const systemInstruction = `FDA/INCI Cosmetic Label Expert. Convert the user's text (${inputText}) into a strictly compliant Cosmetic Ingredient List JSON.

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
    const jsonStructure = JSON.stringify({
      layoutType: 'standard',
      sections: [
        { title: 'INGREDIENTS', content: 'Aqua, Glycerin, ...' },
        { title: 'CONTAINS', content: 'Cinnamal, Peanuts, ...' },
        { title: 'MAY CONTAIN', content: 'Titanium Dioxide (CI 77891), ...' }
      ]
    });
    return `${systemInstruction}\nReturn ONLY the JSON object conforming to this structure: ${jsonStructure}`;
  }

  const systemInstruction = `FDA Food Label Expert. Convert the user's text (${inputText}) into a strictly compliant Food Ingredient List JSON.

STRICT RULES:
1. Layout: Use 'standard' layout ONLY.
2. Sections: Return ONLY 'INGREDIENTS' and 'CONTAINS'.
3. Net Content: DO NOT generate or include 'NET CONTENT' or any quantity information.
4. Ingredients Expansion: Expand ingredients by default into a realistic, full commercial list. If the user explicitly says 'pure' or 'only', DO NOT expand and only list provided items.
5. Contains (Allergens): Identify major food allergens. If NO allergens are present, omit the 'CONTAINS' section entirely.

Translate all content to American English. Keep content concise and capitalized. All titles ENGLISH and UPPERCASE. Output ONLY the JSON object.`;
  const jsonStructure = JSON.stringify({
    layoutType: 'standard',
    sections: [
      { title: 'INGREDIENTS', content: '...' },
      { title: 'CONTAINS', content: '...' }
    ]
  });
  return `${systemInstruction}\nReturn ONLY the JSON object conforming to this structure: ${jsonStructure}`;
};

const onGenerate = async () => {
  if (isLoading.value) return;
  if (!ingredientsInput.value.trim()) return;
  isLoading.value = true;
  errorMsg.value = '';
  startProgress();

  try {
    const inputText = ingredientsInput.value.trim();
    const prompt = buildLabelPrompt(inputText, productType.value);
    const res = await generateText(prompt, {
      timeoutMs: 120000,
      purpose: 'ingredient_label',
      cost: Math.max(0, Math.trunc(Number(props.creditsCost ?? 10) || 0))
    });
    if (!res.ok) {
      const en = currentLang.value === 'en';
      const err = res.errorCode || res.error || 'AI_ERROR';
      errorMsg.value = en ? `Generation failed: ${err}` : `生成失败：${err}`;
      message.error(errorMsg.value);
      pendingLayoutType.value = null;
      completeProgress();
      return;
    }

    const parsed = parseJsonFromAi(res.text);
    if (!parsed || typeof parsed !== 'object') {
      const en = currentLang.value === 'en';
      errorMsg.value = en ? 'Invalid AI response' : 'AI 返回格式异常';
      message.error(errorMsg.value);
      pendingLayoutType.value = null;
      completeProgress();
      return;
    }

    const layoutTypeRaw = String((parsed as any).layoutType || '').trim();
    const layoutType = ((): IngredientLabelLayoutType => {
      if (layoutTypeRaw === 'drug_facts') return 'drug_facts';
      if (layoutTypeRaw === 'supplement_facts') return 'supplement_facts';
      if (layoutTypeRaw === 'nutrition_facts') return 'nutrition_facts';
      return 'standard';
    })();

    const sections = Array.isArray((parsed as any).sections) ? (parsed as any).sections : [];
    const svg = buildIngredientLabelSvg({
      productName: '',
      sections,
      layoutType: layoutType || DEFAULT_LAYOUT_BY_TYPE[productType.value]
    });
    imgSrc.value = buildIngredientLabelSvgUrl(svg) || placeholderUrl;
    pendingLayoutType.value = layoutType;
    errorMsg.value = '';
  } catch {
    const en = currentLang.value === 'en';
    errorMsg.value = en ? 'Generation failed, please try again later' : '生成失败，请稍后再试';
    message.error(errorMsg.value);
    pendingLayoutType.value = null;
    completeProgress();
  }
};

const getImg = (isBlob?: boolean) => {
  return new Promise((resolve) => {
    const svgDataUrl = imgSrc.value;
    if (!svgDataUrl || svgDataUrl === placeholderUrl) {
      resolve('');
      return;
    }
    const img = new Image();
    img.src = svgDataUrl;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const targetWidth = 2000;
      canvas.width = targetWidth;
      canvas.height = (targetWidth / img.width) * img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (isBlob) {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } else {
        const imgDataUrl = canvas.toDataURL();
        resolve(imgDataUrl);
      }
    };
    img.onerror = () => resolve('');
  });
};

const downLoadImg = async () => {
  const imgDataUrl = (await getImg()) as string;
  if (!imgDataUrl) return;
  const a = document.createElement('a');
  a.href = imgDataUrl;
  a.download = 'ingredients.png';
  a.click();
};

const downLoadSvg = () => {
  if (!imgSrc.value || imgSrc.value === placeholderUrl) return;
  const svgContent = decodeURIComponent(
    imgSrc.value.replace('data:image/svg+xml;charset=utf-8,', '')
  );
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
  const a = document.createElement('a');
  a.href = svgDataUrl;
  a.download = 'ingredients.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const onExportPdf = () => {
  if (!imgSrc.value || imgSrc.value === placeholderUrl) return;
  const svgContent = decodeURIComponent(
    imgSrc.value.replace('data:image/svg+xml;charset=utf-8,', '')
  );
  exportPdf(svgContent, 0);
};

const openDownload = async () => {
  if (isMobile.value) {
    isDownloadModalOpen.value = true;
  } else {
    isDownloadPopoverOpen.value = !isDownloadPopoverOpen.value;
    if (isDownloadPopoverOpen.value) {
      await nextTick();
      gsap.fromTo(
        '.download-popover',
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
      gsap.fromTo(
        '.download-option',
        { x: -10, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, stagger: 0.05, delay: 0.1 }
      );
    }
  }
};
const closeDownloadModal = () => {
  isDownloadModalOpen.value = false;
};
const handleDownload = (type: 'png' | 'svg' | 'pdf') => {
  if (type === 'png') downLoadImg();
  else if (type === 'svg') downLoadSvg();
  else onExportPdf();
  closeDownloadModal();
  isDownloadPopoverOpen.value = false;
};
const downloadOptions = [
  {
    type: 'png' as const,
    label: 'PNG',
    icon: 'https://cdn.packify.ai/image/9285df4e-a3b7-4d4c-8e40-537dea15ae08.svg'
  },
  {
    type: 'svg' as const,
    label: 'SVG',
    icon: 'https://cdn.packify.ai/image/4243bd45-7dd6-44e5-9176-9887062b197c.svg'
  },
  {
    type: 'pdf' as const,
    label: 'PDF',
    icon: 'https://cdn.packify.ai/image/1263cda7-1751-4833-9064-8b1f12ade129.svg'
  }
];

const handleClickOutside = (e: Event) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('.btn-primary') && !target.closest('.download-popover')) {
    isDownloadPopoverOpen.value = false;
  }
};

const close = () => {
  emit('close');
};

const resetState = () => {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  isLoading.value = false;
  progressValue.value = 0;
  isDownloadModalOpen.value = false;
  isDownloadPopoverOpen.value = false;
  isLabelTypeModalOpen.value = false;
  errorMsg.value = '';
};

const syncMobile = () => {
  isMobile.value = window.innerWidth <= 979;
};

let onWindowResize: ((this: Window, ev: UIEvent) => any) | null = null;
let globalEventsBound = false;
const bindGlobalEvents = () => {
  if (globalEventsBound) return;
  onWindowResize = () => {
    syncMobile();
    updateWatermark();
    updateProgressBarPosition();
  };
  window.addEventListener('resize', onWindowResize);
  document.addEventListener('click', handleClickOutside);
  globalEventsBound = true;
};
const unbindGlobalEvents = () => {
  if (!globalEventsBound) return;
  if (onWindowResize) window.removeEventListener('resize', onWindowResize);
  document.removeEventListener('click', handleClickOutside);
  onWindowResize = null;
  globalEventsBound = false;
};

watch(
  () => !!props.visible,
  async (v) => {
    if (!v) {
      unbindGlobalEvents();
      resetState();
      return;
    }

    syncMobile();
    pendingLayoutType.value = DEFAULT_LAYOUT_BY_TYPE[productType.value];
    bindGlobalEvents();
    await nextTick();
    updateWatermark();
    updateProgressBarPosition();

    gsap.from('.tools-main-frame', {
      y: 60,
      opacity: 0,
      duration: 1.2,
      ease: 'power3.out',
      delay: 0.2
    });

    gsap.from('.bg-orb', {
      scale: 0,
      opacity: 0,
      duration: 2,
      stagger: 0.3,
      ease: 'elastic.out(1, 0.5)'
    });
  },
  { immediate: true }
);

const handleMouseMove = (e: MouseEvent) => {
  const orbs = document.querySelectorAll('.bg-orb');
  const x = (e.clientX / window.innerWidth - 0.5) * 2;
  const y = (e.clientY / window.innerHeight - 0.5) * 2;

  orbs.forEach((orb) => {
    const speed = parseFloat(orb.getAttribute('data-speed') || '0');
    gsap.to(orb, {
      x: x * 100 * speed,
      y: y * 100 * speed,
      duration: 1,
      ease: 'power2.out'
    });
  });
};

onBeforeUnmount(() => {
  unbindGlobalEvents();
  resetState();
});

watch([isLoading, imgSrc], () => {
  updateWatermark();
  updateProgressBarPosition();
  canDownload.value = !!(!isLoading.value && imgSrc.value && imgSrc.value !== placeholderUrl);
});

watch(typeIndex, (nv) => {
  productType.value = productTypeMap[nv];
  imgSrc.value = placeholderUrl;
  pendingLayoutType.value = DEFAULT_LAYOUT_BY_TYPE[productType.value];
  errorMsg.value = '';
  isLoading.value = false;
  progressValue.value = 0;
  updateWatermark();
  updateProgressBarPosition();
});

const backText = computed(() => (currentLang.value === 'en' ? 'Back' : '返回'));
const downloadText = computed(() => {
  return 'Download';
});
const titleText = computed(() => (currentLang.value === 'en' ? 'AI Ingredients' : 'AI 配料表'));
const typeText = computed(() => (currentLang.value === 'en' ? 'Product type' : '产品类型'));
const ingredientsText = computed(() => (currentLang.value === 'en' ? 'Ingredients' : '配料/成分'));
const generateTextLabel = computed(() => (currentLang.value === 'en' ? 'Generate' : '生成'));
const actionButtonStyles = {
  primary: {
    '--btn-height': '48px',
    '--btn-radius': '12px',
    '--btn-font-size': '15px',
    '--btn-gap': '8px',
    '--btn-transition': 'all 0.2s',
    '--btn-bg': '#3b82f6',
    '--btn-border': '1px solid #3b82f6',
    '--btn-color': '#ffffff',
    '--btn-shadow': '0 4px 6px rgba(59, 130, 246, 0.2)',
    '--btn-hover-bg': '#2563eb',
    '--btn-hover-border': '1px solid #2563eb',
    '--btn-hover-shadow': '0 6px 10px rgba(59, 130, 246, 0.25)'
  },
  secondary: {
    '--btn-height': '48px',
    '--btn-radius': '12px',
    '--btn-font-size': '15px',
    '--btn-gap': '8px',
    '--btn-transition': 'all 0.2s',
    '--btn-bg': '#ffffff',
    '--btn-border': '1px solid #e2e8f0',
    '--btn-color': '#0f172a',
    '--btn-hover-bg': '#f8fafc',
    '--btn-hover-border': '1px solid #475569'
  }
} as const;
</script>

<template>
  <transition name="fade">
    <div v-if="visible" class="ingredient-modal-overlay" @click="close">
      <div class="ingredient-modal-container" @click.stop>
        <div class="ingredient-modal-header">
          <div class="ingredient-modal-title">{{ titleText }}</div>
          <button class="ingredient-close-btn" type="button" @click="close">×</button>
        </div>

        <div class="ingredient-modal-body">
          <div class="tools-root" @mousemove="handleMouseMove">
            <div class="parallax-bg">
              <div class="bg-orb orb-1" data-speed="0.05"></div>
              <div class="bg-orb orb-2" data-speed="-0.08"></div>
              <div class="bg-orb orb-3" data-speed="0.02"></div>
            </div>

            <div
              class="glass-container tools-main-frame"
              :class="{ 'is-drug': lastLayoutType === 'drug_facts' }"
            >
              <div class="left-panel">
                <div class="section-title">{{ typeText }}</div>
                <div class="select-wrapper">
                  <IngredientLabelTypeSelect
                    v-model="typeIndex"
                    :options="typeOptions"
                    :mobile="isMobile"
                    :disabled="false"
                    @open-mobile="isLabelTypeModalOpen = true"
                  />
                </div>
                <div class="section-title title-product">{{ ingredientsText }}</div>
                <div class="textarea-container product-describe">
                  <div class="textarea-content">
                    <textarea
                      v-model="ingredientsInput"
                      class="product-textarea"
                      :placeholder="placeholderText"
                    ></textarea>
                  </div>
                  <button
                    class="generate-button hover-effect"
                    :disabled="!ingredientsInput || isLoading"
                    @click="onGenerate"
                  >
                    <span v-if="!isLoading" class="iconfont icon-ai1"></span>
                    <img
                      v-else
                      class="iconfont icon-ai1 generate-icon--loading"
                      src="https://cdn.packify.ai/image/0a0ab795-dc73-476b-8de8-3c7add824da3.svg"
                      alt=""
                      width="16"
                      height="16"
                    />
                    <span class="generate-text">{{ generateTextLabel }}</span>
                    <span v-if="costText && !isLoading" class="generate-cost">{{ costText }}</span>
                  </button>
                </div>
                <div v-if="errorMsg" class="error-text">{{ errorMsg }}</div>
              </div>

              <div class="right-panel-container">
                <div class="right-panel" :class="{ 'is-drug': lastLayoutType === 'drug_facts' }">
                  <div
                    class="preview-inner floating-anim"
                    :class="{ 'is-drug': lastLayoutType === 'drug_facts' }"
                  >
                    <div class="editor-wrap">
                      <div
                        id="editorBoxRef"
                        ref="editorBoxRef"
                        class="editorBox"
                        :class="{
                          'is-loading': isLoading,
                          generated: imgSrc && imgSrc !== placeholderUrl
                        }"
                      >
                        <div class="image-container">
                          <img
                            :src="imgSrc"
                            style="width: 100%; height: 100%; object-fit: contain; display: block"
                            @load="onImageLoaded"
                          />
                          <div v-if="isLoading" class="progress-bar">
                            <div
                              class="progress-fill"
                              :style="{ width: progressValue + '%' }"
                            ></div>
                          </div>
                        </div>
                      </div>
                      <div ref="watermarkRef" class="demo-watermark" aria-hidden="true">DEMO</div>
                    </div>
                  </div>

                  <div class="operation-buttons" :class="{ 'stack-mobile': isMobile }">
                    <ActionButton
                      class="hover-effect"
                      variant="secondary"
                      type="button"
                      :style="actionButtonStyles.secondary"
                      icon="https://cdn.packify.ai/image/9e25c93e-da3f-452e-962f-13e959ff632f.svg"
                      icon-alt=""
                      :icon-width="19"
                      :icon-height="18"
                      @click="close"
                    >
                      {{ backText }}
                    </ActionButton>
                    <div style="position: relative">
                      <ActionButton
                        class="hover-effect"
                        variant="primary"
                        type="button"
                        :style="actionButtonStyles.primary"
                        icon="https://cdn.packify.ai/image/31ffedbf-fd56-4280-a55f-9cc1bc2cf848.svg"
                        icon-alt=""
                        :icon-width="19"
                        :icon-height="18"
                        :disabled="!canDownload"
                        @click="openDownload"
                      >
                        {{ downloadText }}
                      </ActionButton>
                      <div
                        v-if="isDownloadPopoverOpen && !isMobile"
                        class="download-popover glass-popover"
                      >
                        <button
                          v-for="option in downloadOptions"
                          :key="option.type"
                          class="download-option"
                          type="button"
                          @click="handleDownload(option.type)"
                        >
                          <div class="file-icon-wrapper">
                            <img
                              class="modal-icon"
                              :src="option.icon"
                              width="24"
                              height="24"
                              :alt="option.label"
                            />
                          </div>
                          <span class="opt-text">{{ option.label }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <teleport to="body">
              <div
                v-if="isDownloadModalOpen"
                class="modal-mask glass-mask"
                @click.self="closeDownloadModal"
              >
                <div class="bottom-modal download-modal glass-modal">
                  <div class="modal-header">
                    <div class="modal-title">Download</div>
                    <button class="modal-close" type="button" @click="closeDownloadModal">
                      <img
                        src="https://cdn.packify.ai/image/704466e6-ea37-4ea5-9821-1014fbb93a75.svg"
                        width="20"
                        height="20"
                        alt=""
                      />
                    </button>
                  </div>
                  <div class="modal-options">
                    <button
                      v-for="option in downloadOptions"
                      :key="option.type"
                      class="modal-option"
                      type="button"
                      @click="handleDownload(option.type)"
                    >
                      <img
                        class="modal-icon"
                        :src="option.icon"
                        width="24"
                        height="24"
                        :alt="option.label"
                      />
                      <span class="opt-text">{{ option.label }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </teleport>

            <teleport to="body">
              <div
                v-if="isLabelTypeModalOpen && isMobile"
                class="modal-mask glass-mask"
                @click.self="isLabelTypeModalOpen = false"
              >
                <div class="bottom-modal labeltype-modal glass-modal">
                  <div class="modal-header">
                    <div class="modal-title">{{ typeText }}</div>
                    <button class="modal-close" type="button" @click="isLabelTypeModalOpen = false">
                      <img
                        src="https://cdn.packify.ai/image/704466e6-ea37-4ea5-9821-1014fbb93a75.svg"
                        width="20"
                        height="20"
                        alt=""
                      />
                    </button>
                  </div>
                  <div class="modal-options">
                    <button
                      v-for="option in typeOptions"
                      :key="option.value"
                      class="modal-option"
                      :class="{ 'is-selected': typeIndex === option.value }"
                      type="button"
                      @click="
                        () => {
                          typeIndex = option.value;
                          isLabelTypeModalOpen = false;
                        }
                      "
                    >
                      <span class="opt-text">{{ option.label }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </teleport>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style lang="less" scoped>
/* Color Palette - Clean Light Mode */
@bg-root: #ffffff;
@bg-surface: #f8fafc; /* Slate-50 */
@bg-element: #ffffff;
@border-color: #e2e8f0; /* Slate-200 */
@primary-color: #3b82f6; /* Blue-500 */
@primary-hover: #2563eb; /* Blue-600 */
@text-main: #0f172a; /* Slate-900 */
@text-secondary: #475569; /* Slate-600 */
@text-muted: #94a3b8; /* Slate-400 */
@glass-shadow:
  0 10px 15px -3px rgba(0, 0, 0, 0.1),
  0 4px 6px -2px rgba(0, 0, 0, 0.05);

@keyframes float {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
  100% {
    transform: translateY(0px);
  }
}

.floating-anim {
  animation: float 6s ease-in-out infinite;
}

.tools-root {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  position: relative;
  overflow: hidden;
  background: transparent;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  color: @text-main;
}

.ingredient-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  box-sizing: border-box;
}

.ingredient-modal-container {
  width: min(1280px, 96vw);
  height: min(860px, 92vh);
  border-radius: 16px;
  overflow: hidden;
  background: @bg-root;
  border: 1px solid @border-color;
  box-shadow: @glass-shadow;
  display: flex;
  flex-direction: column;
}

.ingredient-modal-header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: @bg-surface;
  border-bottom: 1px solid @border-color;
  box-sizing: border-box;
}

.ingredient-modal-title {
  font-size: 18px;
  font-weight: 700;
  color: @text-main;
  letter-spacing: -0.01em;
}

.ingredient-close-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: @text-secondary;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: @bg-element;
    color: @text-main;
    border-color: @border-color;
  }
}

.ingredient-modal-body {
  flex: 1;
  overflow: hidden;
  background: @bg-root;
  display: flex;
}

/* Background Effects - Hidden */
.parallax-bg {
  display: none;
}

.glass-container {
  background: transparent;
  border: none;
  box-shadow: none;
}

.tools-main-frame {
  display: flex;
  width: 100%;
  height: 100%;
  padding: 32px;
  gap: 40px;
  box-sizing: border-box;
  overflow: auto;
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 320px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: @text-secondary;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-wrapper {
  /* Child component updated to match theme */
}

.product-describe {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 200px;
}

.textarea-content {
  flex: 1;
  border-radius: 12px;
  background: @bg-surface;
  border: 1px solid @border-color;
  padding: 16px;
  transition: all 0.2s ease;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);

  &:focus-within {
    background: @bg-root;
    border-color: @primary-color;
    box-shadow: 0 0 0 3px fade(@primary-color, 15%);
  }
}

.product-textarea {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  resize: none;
  font-size: 15px;
  line-height: 1.6;
  color: @text-main;
  outline: none;
  font-family: inherit;
}

.product-textarea::placeholder {
  color: @text-muted;
}

.generate-button {
  height: 52px;
  border: none;
  border-radius: 12px;
  background: @primary-color;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px rgba(59, 130, 246, 0.25);
}

.generate-cost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.12);
  color: rgba(255, 255, 255, 0.95);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.generate-button:hover:not(:disabled) {
  background: @primary-hover;
  transform: translateY(-1px);
  box-shadow: 0 6px 10px rgba(59, 130, 246, 0.3);
}

.generate-button:active:not(:disabled) {
  transform: translateY(0);
}

.generate-button:disabled {
  background: @border-color;
  color: @text-muted;
  cursor: not-allowed;
  box-shadow: none;
}

.generate-icon--loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}

.right-panel-container {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.preview-inner {
  flex: 1;
  position: relative;
  background: @bg-surface;
  border-radius: 12px;
  border: 1px solid @border-color;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.editorBox {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.operation-buttons {
  display: flex;
  gap: 16px;
  align-items: center;
}

.operation-buttons :deep(.btn),
.operation-buttons > div {
  flex: 1;
}

.operation-buttons > div :deep(.btn) {
  width: 100%;
}

.glass-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  padding: 6px;
  border-radius: 12px;
  border: 1px solid @border-color;
  background: @bg-root;
  box-shadow: @glass-shadow;
  z-index: 1000;
  min-width: 200px;
}

.download-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: @text-main;
  font-size: 14px;

  &:hover {
    background: @bg-surface;
    color: @primary-color;
  }
}

.file-icon-wrapper {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: @bg-surface;
  color: @text-secondary;
  transition: all 0.2s;
}

.download-option:hover .file-icon-wrapper {
  background: fade(@primary-color, 10%);
  color: @primary-color;
}

/* Modals */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.bottom-modal {
  width: min(520px, 100%);
  background: @bg-root;
  border-radius: 20px 20px 0 0;
  border-top: 1px solid @border-color;
  padding: 24px;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: @text-main;
}

.modal-close {
  border: none;
  background: transparent;
  padding: 8px;
  cursor: pointer;
  color: @text-secondary;

  &:hover {
    color: @text-main;
    background: @bg-surface;
    border-radius: 50%;
  }
}

.modal-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-option {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid @border-color;
  background: @bg-surface;
  cursor: pointer;
  color: @text-main;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s;
  gap: 8px;

  &:hover {
    background: darken(@bg-surface, 2%);
    border-color: @text-secondary;
  }

  &.is-selected {
    border-color: @primary-color;
    background: fade(@primary-color, 10%);
    color: @primary-color;
  }
}

.progress-bar {
  position: absolute;
  height: 4px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  left: 0;
  bottom: 0;
  overflow: hidden;
  width: 100%;
}

.progress-fill {
  height: 100%;
  background: @primary-color;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.error-text {
  font-size: 14px;
  color: #ef4444;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fef2f2;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #fee2e2;
}

/* Legacy classes - hidden or neutral */
.glass-mask {
}
.glass-modal {
}

@media (max-width: 979px) {
  .ingredient-modal-container {
    width: 100%;
    height: 100%;
    border-radius: 0;
    border: none;
  }
  .tools-main-frame {
    flex-direction: column;
    padding: 20px;
    height: auto;
    overflow: visible;
  }
  .product-describe {
    min-height: auto;
  }
  .right-panel-container {
    min-height: 400px;
  }
  .operation-buttons {
    flex-direction: column;
  }
  .operation-buttons > div {
    width: 100%;
  }
}
</style>
