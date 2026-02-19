<template>
  <BaseTaskPopup
    :visible="visible"
    :title="ui.title"
    :subtitle="ui.subtitle"
    icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>'
    :upload-text="ui.uploadText"
    :upload-hint="ui.uploadHint"
    :reupload-text="ui.reupload"
    placeholder-icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="64" height="64"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
    :loading="loading"
    v-model:selected-file="selectedFile"
    @close="close"
  >
    <template #config>
      <div class="config-section">
        <div class="section-title">{{ ui.sectionTitle }}</div>

        <!-- Simple options for now -->
        <div class="option-row">
          <label class="checkbox-label">
            <input type="checkbox" v-model="enableColorize" />
            <span class="checkbox-text">{{ ui.colorizeLabel }}</span>
          </label>
        </div>
        <div class="option-row">
          <label class="checkbox-label">
            <input type="checkbox" v-model="enableDenoise" />
            <span class="checkbox-text">{{ ui.denoiseLabel }}</span>
          </label>
        </div>

        <div class="type-desc">
          {{ currentDesc }}
        </div>

        <button class="generate-btn" @click="handleRestore" :disabled="!selectedFile || loading">
          <span v-if="loading">
            <svg
              class="spinner-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              width="16"
              height="16"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            {{ ui.restoring }}
          </span>
          <span v-else>
            {{ ui.start }}
            <span class="cost-badge" v-if="costText">
              <svg
                viewBox="0 0 24 24"
                width="10"
                height="10"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="margin-right: 2px"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              {{ costText }}
            </span>
          </span>
        </button>
      </div>
    </template>
  </BaseTaskPopup>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { trackEvent } from '../../utils/analytics';
import { useLanguageStore } from '@/stores/language';
import BaseTaskPopup from './BaseTaskPopup.vue';

const props = defineProps<{
  visible: boolean;
  creditsCost?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'restore', file: File, options: any): void;
}>();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const selectedFile = ref<File | null>(null);
const loading = ref(false);

const enableColorize = ref(true);
const enableDenoise = ref(true);

const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    title: en ? 'Old Photo Restoration' : '老照片修复',
    subtitle: en
      ? 'Restore blurry/damaged photos, optional colorization.'
      : '修复模糊、破损照片，支持智能上色',
    reupload: en ? 'Click or drag to replace image' : '点击或拖拽替换图片',
    uploadText: en ? 'Click or drag old photo' : '点击或拖拽老照片',
    uploadHint: en ? 'Supports JPG, PNG, WEBP' : '支持 JPG, PNG, WEBP',
    sectionTitle: en ? 'Restore Options' : '修复选项',
    colorizeLabel: en ? 'Colorize (B/W)' : '黑白上色',
    denoiseLabel: en ? 'Smart Denoise' : '智能降噪',
    restoring: en ? 'Restoring...' : '修复中...',
    start: en ? 'Restore' : '开始修复'
  };
});

const currentDesc = computed(() => {
  const en = currentLang.value === 'en';
  if (enableColorize.value && enableDenoise.value)
    return en
      ? 'Colorize and denoise together; best for blurry black-and-white photos.'
      : '同时进行上色和降噪处理，适合模糊的黑白老照片';
  if (enableColorize.value)
    return en
      ? 'Colorize black-and-white photos with natural colors.'
      : '对黑白照片进行智能上色，还原真实色彩';
  if (enableDenoise.value)
    return en ? 'Reduce noise and blur for better clarity.' : '去除照片噪点和模糊，提升清晰度';
  return en ? 'Basic restoration only.' : '仅进行基础修复';
});

const costText = computed(() => {
  const n = Math.max(0, Math.trunc(Number(props.creditsCost ?? 0) || 0));
  if (!n) return '';
  return `${n}`;
});

const close = () => {
  emit('close');
};

const resetState = () => {
  selectedFile.value = null;
  loading.value = false;
  enableColorize.value = true;
  enableDenoise.value = true;
};

watch(
  () => !!props.visible,
  (v) => {
    if (!v) resetState();
  }
);

const handleRestore = () => {
  if (!selectedFile.value) return;
  loading.value = true;
  trackEvent('Old_Photo', 'restore_click', enableColorize.value ? 'colorize' : 'basic');
  emit('restore', selectedFile.value, {
    colorize: enableColorize.value,
    denoise: enableDenoise.value
  });
};
</script>

<style scoped>
.config-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: var(--common-font);
}

.section-title {
  color: #888;
  font-size: 12px;
  margin-bottom: 8px;
  text-align: center;
}

/* Checkbox Styles */
.option-row {
  margin-bottom: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  margin-right: 12px;
  background: rgba(0, 0, 0, 0.3);
  position: relative;
  transition: all 0.2s;
  cursor: pointer;
}

.checkbox-label input[type='checkbox']:checked {
  background: rgba(204, 255, 0, 0.2);
  border-color: #ccff00;
}

.checkbox-label input[type='checkbox']:checked::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  left: 2px;
  top: 2px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ccff00' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
}

.checkbox-text {
  color: #ccc;
  font-size: 14px;
  transition: color 0.2s;
}

.checkbox-label:hover .checkbox-text {
  color: #fff;
}

.checkbox-label:hover input[type='checkbox'] {
  border-color: rgba(255, 255, 255, 0.6);
}

.type-desc {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  color: #aaa;
  line-height: 1.4;
  min-height: 60px;
  margin-top: auto;
}

.generate-btn {
  margin-top: auto;
  width: 100%;
  height: 48px;
  background: #ccff00;
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.generate-btn:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(204, 255, 0, 0.3);
}

.spinner-icon {
  animation: spin 1s linear infinite;
  margin-right: 8px;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.cost-badge {
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 4px;
}
</style>
