<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import LabelTypeSelect from './utils/LabelTypeSelect.vue';
import generateImageWithAI from './utils/generateImageWithAI';
import { message } from 'ant-design-vue';
import gsap from 'gsap';

import { exportPdf } from '../utils/export';

const router = useRouter();
const editorBoxRef = ref<HTMLElement | null>(null);
const editorWrapRef = ref<HTMLElement | null>(null);
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
const lastLayoutType = ref<
  'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts' | null
>(null);
const pendingLayoutType = ref<
  'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts' | null
>(null);
const errorMsg = ref('');
const canDownload = ref(false);

const PLACEHOLDERS: Record<string, string> = {
  Drug: 'Provide drug active ingredients (e.g., "Acetaminophen 500mg"), uses (e.g., "relieving headaches"), inactive ingredients. For limited info, enter core ingredients/uses only. System auto-supplements FDA-compliant warnings (contraindications, precautions), dosage (age-based), storage, manufacturer, NDC code & other content.',
  Food: 'Provide food raw materials (e.g., "beef", "milk chocolate"). Add "pure/only" for single pure ingredients (e.g., "pure beef", "only soybean"). Enter core materials only for processed foods (e.g., "roasted steak", "canned soup").',
  Cosmetic:
    'Provide cosmetic raw materials (e.g., "water, vitamin E", "rose cream"). Add "pure/only" for single pure ingredients (e.g., "pure aloe vera", "only squalane"). Enter core materials only for regular cosmetics (e.g., "hyaluronic acid + mica").',
  'Dietary Supplement':
    'Enter main ingredients (e.g., "Vitamin C, Zinc"), specs (e.g., "60 capsules/bottle"). System expands to full commercial formula, generating FDA-compliant %DV, other ingredients, usage (e.g., "1 capsule daily with meals") and standard warnings (e.g., "Keep out of reach of children").',
  default: 'Ingredients (comma or newline separated)'
};
const placeholderText = computed(() => PLACEHOLDERS[productType.value] ?? PLACEHOLDERS.default);

const DEFAULT_DEMO_IMAGES: Record<'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement', string> = {
  Food: 'https://cdn.packify.ai/image-resize/800xauto_outside/image/a71233c8-731a-4a42-a4bb-0c01d53bc289.png',
  Drug: 'https://cdn.packify.ai/image-resize/800xauto_outside/image/8ec56657-ed79-4328-b4dd-3442a7c45f03.png',
  Cosmetic:
    'https://cdn.packify.ai/image-resize/800xauto_outside/image/b09f6f23-3afd-4069-9d2f-d9a6f37f047f.png',
  'Dietary Supplement':
    'https://cdn.packify.ai/image-resize/800xauto_outside/image/f054e841-e2c6-4569-8356-47a3f48332ed.png'
};
const DEFAULT_LAYOUT_BY_TYPE: Record<
  'Food' | 'Drug' | 'Cosmetic' | 'Dietary Supplement',
  'drug_facts' | 'supplement_facts' | 'standard' | 'nutrition_facts'
> = {
  Food: 'nutrition_facts',
  Drug: 'drug_facts',
  Cosmetic: 'standard',
  'Dietary Supplement': 'supplement_facts'
};
const isDemoImage = computed(() => {
  const vals = Object.values(DEFAULT_DEMO_IMAGES);
  return !!imgSrc.value && vals.includes(imgSrc.value);
});

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
  const demoMode = imgSrc.value === placeholderUrl || isDemoImage.value;
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

const onGenerate = async () => {
  if (isLoading.value) return;
  if (!ingredientsInput.value) return;
  isLoading.value = true;
  errorMsg.value = '';
  startProgress();
  try {
    const { url, layoutType } = await generateImageWithAI(
      '',
      ingredientsInput.value,
      productType.value
    );
    imgSrc.value = url || placeholderUrl;
    pendingLayoutType.value = layoutType || null;
  } catch {
    errorMsg.value = 'Generation failed, please try again later';
    message.error('Generation failed, please try again later');
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
  const target = e.target as Element;
  if (!target.closest('.btn-primary') && !target.closest('.download-popover')) {
    isDownloadPopoverOpen.value = false;
  }
};

let onWindowResize: ((this: Window, ev: UIEvent) => any) | null = null;
onMounted(() => {
  isMobile.value = window.innerWidth <= 979;
  imgSrc.value = DEFAULT_DEMO_IMAGES[productType.value];
  pendingLayoutType.value = DEFAULT_LAYOUT_BY_TYPE[productType.value];
  onWindowResize = () => {
    isMobile.value = window.innerWidth <= 979;
    updateWatermark();
    updateProgressBarPosition();
  };
  window.addEventListener('resize', onWindowResize);
  document.addEventListener('click', handleClickOutside);
  updateWatermark();

  // Entrance Animations
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
});

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
  if (onWindowResize) window.removeEventListener('resize', onWindowResize);
  document.removeEventListener('click', handleClickOutside);
});

watch([isLoading, imgSrc], () => {
  updateWatermark();
  updateProgressBarPosition();
  canDownload.value = !!(!isLoading.value && imgSrc.value && imgSrc.value !== placeholderUrl);
});

watch(typeIndex, (nv) => {
  productType.value = productTypeMap[nv];
  imgSrc.value = DEFAULT_DEMO_IMAGES[productType.value];
  pendingLayoutType.value = DEFAULT_LAYOUT_BY_TYPE[productType.value];
  errorMsg.value = '';
  isLoading.value = false;
  progressValue.value = 0;
  updateWatermark();
  updateProgressBarPosition();
});
</script>

<template>
  <div class="tools-root" @mousemove="handleMouseMove">
    <!-- Dynamic Background -->
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
        <h1 class="main-title">AI Ingredients</h1>
        <div class="section-title">Product type</div>
        <div class="select-wrapper">
          <LabelTypeSelect
            v-model="typeIndex"
            :options="typeOptions"
            :mobile="isMobile"
            :disabled="false"
            @open-mobile="isLabelTypeModalOpen = true"
          />
        </div>
        <div class="section-title title-product">Ingredients</div>
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
            <span class="generate-text">Generate</span>
          </button>
        </div>
      </div>

      <div class="right-panel-container">
        <div class="right-panel" :class="{ 'is-drug': lastLayoutType === 'drug_facts' }">
          <div
            class="preview-inner floating-anim"
            :class="{ 'is-drug': lastLayoutType === 'drug_facts' }"
          >
            <div ref="editorWrapRef" class="editor-wrap">
              <div
                id="editorBoxRef"
                ref="editorBoxRef"
                class="editorBox"
                :class="{ 'is-loading': isLoading, generated: imgSrc && imgSrc !== placeholderUrl }"
              >
                <div class="image-container">
                  <img
                    :src="imgSrc"
                    style="width: 100%; height: 100%; object-fit: contain; display: block"
                    @load="onImageLoaded"
                  />
                  <div v-if="isLoading" class="progress-bar">
                    <div class="progress-fill" :style="{ width: progressValue + '%' }"></div>
                  </div>
                </div>
              </div>
              <div ref="watermarkRef" class="demo-watermark" aria-hidden="true">DEMO</div>
            </div>
          </div>
          <div v-if="!isMobile" class="operation-buttons">
            <button class="btn btn-secondary hover-effect" @click="router.push('/portfolio-home')">
              <img
                class="button-icon"
                src="https://cdn.packify.ai/image/9e25c93e-da3f-452e-962f-13e959ff632f.svg"
                alt=""
                width="19"
                height="18"
              />
              <span>Back to Profile</span>
            </button>
            <div style="position: relative">
              <button class="btn btn-primary hover-effect" @click="openDownload">
                <img
                  class="button-icon"
                  src="https://cdn.packify.ai/image/31ffedbf-fd56-4280-a55f-9cc1bc2cf848.svg"
                  alt=""
                  width="19"
                  height="18"
                />
                <span>Download ( PNG, SVG, PDF )</span>
              </button>
              <div v-if="isDownloadPopoverOpen && !isMobile" class="download-popover glass-popover">
                <button
                  v-for="option in downloadOptions"
                  :key="option.type"
                  class="download-option"
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
        <div v-if="isMobile" class="operation-buttons stack-mobile">
          <button class="btn btn-secondary hover-effect" @click="router.push('/portfolio-home')">
            <img
              class="button-icon"
              src="https://cdn.packify.ai/image/9e25c93e-da3f-452e-962f-13e959ff632f.svg"
              alt=""
              width="19"
              height="18"
            />
            <span>Back to Profile</span>
          </button>
          <div style="position: relative">
            <button class="btn btn-primary hover-effect" @click="openDownload">
              <img
                class="button-icon"
                src="https://cdn.packify.ai/image/31ffedbf-fd56-4280-a55f-9cc1bc2cf848.svg"
                alt=""
                width="19"
                height="18"
              />
              <span>Download ( PNG, SVG, PDF )</span>
            </button>
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
            <button class="modal-close" @click="closeDownloadModal">
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
            <div class="modal-title">Product type</div>
            <button class="modal-close" @click="isLabelTypeModalOpen = false">
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
</template>

<style lang="less" scoped>
/* Variables */
@primary-color: #1d4ed8; /* deeper blue */
@secondary-color: #334155;
@accent-color: #0ea5e9; /* cyan stronger */
@text-main: #0f172a; /* darker text */
@text-secondary: #334155;
@glass-bg: rgba(255, 255, 255, 0.8);
@glass-border: rgba(255, 255, 255, 0.8);
@glass-shadow: 0 8px 32px 0 rgba(15, 23, 42, 0.25);

/* Animations */
@keyframes float {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
  100% {
    transform: translateY(0px);
  }
}

.floating-anim {
  animation: float 6s ease-in-out infinite;
}

.tools-root {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #dbeafe 0%, #60a5fa 100%);
  font-family: 'Inter', sans-serif;
  color: @text-main;
}

.parallax-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.8;
  transition: transform 0.1s linear;

  &.orb-1 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, #fb7185 0%, #fca5a5 100%);
    top: -50px;
    left: -100px;
  }
  &.orb-2 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #7c3aed 0%, #a78bfa 100%);
    bottom: -100px;
    right: -100px;
  }
  &.orb-3 {
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, #22c55e 0%, #38bdf8 100%);
    top: 40%;
    left: 40%;
  }
}

/* Glassmorphism Container */
.glass-container {
  background: @glass-bg;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 24px;
  border: 1px solid @glass-border;
  box-shadow: @glass-shadow;
  z-index: 1;
}

.tools-main-frame {
  display: flex;
  width: 90%;
  max-width: 1200px;
  height: auto;
  min-height: 680px;
  padding: 40px;
  gap: 40px;
  box-sizing: border-box;
  transition: all 0.5s ease;

  &.is-drug {
    /* Specific styles for drug layout if needed */
  }
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.main-title {
  font-size: 48px;
  font-weight: 700;
  margin: 0 0 10px 0;
  background: linear-gradient(to right, @primary-color, @accent-color);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  color: @text-main;
  margin-bottom: 8px;
}

.select-wrapper {
  :deep(.labeltype-select) {
    width: 100%;
    .select-trigger {
      background: rgba(255, 255, 255, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(4px);
      box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.05);
      &:hover {
        border-color: @primary-color;
      }
    }
    .selected-text {
      color: @text-main;
    }
    /* Override dropdown menu */
    .dropdown-menu {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.15);
    }
    .dropdown-option {
      color: @text-main;
      &:hover {
        background: rgba(74, 144, 226, 0.1);
      }
      &.is-selected {
        background: rgba(74, 144, 226, 0.2);
        border: 1px solid @primary-color;
      }
    }
  }
}

.product-describe {
  height: 275px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.textarea-content {
  flex: 1;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow:
    inset 2px 2px 6px rgba(0, 0, 0, 0.05),
    inset -2px -2px 6px rgba(255, 255, 255, 0.8);
  padding: 16px;
  transition: all 0.3s ease;

  &:focus-within {
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
    background: rgba(255, 255, 255, 0.8);
  }
}

.product-textarea {
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  resize: none;
  font-size: 16px;
  line-height: 1.6;
  color: @text-main;
  outline: none;

  &::placeholder {
    color: #999;
  }
}

.generate-button {
  height: 56px;
  border-radius: 12px;
  background: linear-gradient(135deg, @primary-color 0%, darken(@primary-color, 10%) 100%);
  color: #fff;
  border: none;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-shadow: 0 4px 15px rgba(74, 144, 226, 0.4);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(74, 144, 226, 0.5);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.hover-effect {
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;
  &:hover {
    transform: translateY(-2px);
  }
}

.right-panel-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.preview-inner {
  flex: 1;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.editor-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editorBox {
  max-width: 100%;
  max-height: 100%;
  transition: filter 0.3s ease;

  &.is-loading {
    filter: blur(4px);
  }
}

.image-container {
  position: relative;
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  overflow: hidden;
  width: 100%;
}

.progress-fill {
  height: 100%;
  background: @accent-color;
  transition: width 0.1s linear;
}

.operation-buttons {
  display: flex;
  gap: 16px;
  margin-top: auto;

  &.stack-mobile {
    flex-direction: column;
  }
}

.btn {
  height: 48px;
  padding: 0 24px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: none;
  transition: all 0.3s ease;

  &.btn-secondary {
    background: rgba(255, 255, 255, 0.8);
    color: @text-main;
    border: 1px solid rgba(0, 0, 0, 0.1);

    &:hover {
      background: #fff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
  }

  &.btn-primary {
    background: @primary-color;
    color: #fff;
    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);

    &:hover {
      background: darken(@primary-color, 5%);
      box-shadow: 0 6px 16px rgba(74, 144, 226, 0.4);
    }
  }
}

/* Popover & Modals */
.download-popover {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  z-index: 100;
}

.download-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .opt-text {
    font-size: 14px;
    font-weight: 500;
    color: @text-main;
  }
}

/* Mobile Modal Styles */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bottom-modal {
  width: 100%;
  background: #fff;
  border-radius: 24px 24px 0 0;
  padding: 24px;
  animation: slideUp 0.3s ease-out;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 600px; /* tablet safeguard */
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: @text-main;
}

.modal-close {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}

.modal-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
    transform: translateX(4px);
  }

  .modal-icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .opt-text {
    font-size: 16px;
    font-weight: 500;
    color: @text-main;
  }

  &.is-selected {
    background: rgba(74, 144, 226, 0.1);
    border-color: @primary-color;
    .opt-text {
      color: @primary-color;
      font-weight: 600;
    }
  }
}

/* Mobile Adaptation */
@media (max-width: 979px) {
  .tools-main-frame {
    flex-direction: column;
    height: auto;
    padding: 30px 20px;
    width: 95%;
    margin-top: 16px;
    margin-bottom: 100px;
  }

  .main-title {
    font-size: 32px;
    text-align: center;
  }

  .section-title {
    font-size: 20px;
  }

  .left-panel,
  .right-panel-container {
    width: 100%;
  }

  .preview-inner {
    min-height: 380px;
  }

  .operation-buttons {
    flex-direction: column;
    width: 100%;

    .btn {
      width: 100%;
    }
  }

  .bg-orb {
    transform: scale(0.7);
  }
}
</style>
