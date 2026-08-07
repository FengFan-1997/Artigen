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

        <label class="upload-consent" :class="{ disabled: quoteLoading || !!quoteError }">
          <input v-model="uploadConsent" type="checkbox" :disabled="quoteLoading || !!quoteError" />
          <span>{{ consentText }}</span>
        </label>
        <p v-if="quoteLoading" class="quote-status" role="status">{{ ui.quoteLoading }}</p>
        <p v-else-if="quoteError" class="quote-status error" role="alert">{{ quoteErrorText }}</p>

        <button
          class="generate-btn"
          @click="handleRestore"
          :disabled="!selectedFile || loading || quoteLoading || !!quoteError || !uploadConsent"
        >
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
  quoteLoading?: boolean;
  quoteError?: string;
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
const uploadConsent = ref(false);

const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    title: en ? 'AI Old Photo Enhancement' : 'AI 老照片增强',
    subtitle: en
      ? 'Paid enhancement with optional inferred colorization; results are not historical evidence.'
      : '付费增强与可选推测性上色；结果不代表历史事实复原。',
    reupload: en ? 'Click or drag to replace image' : '点击或拖拽替换图片',
    uploadText: en ? 'Click or drag old photo' : '点击或拖拽老照片',
    uploadHint: en ? 'Supports JPG, PNG, WEBP' : '支持 JPG, PNG, WEBP',
    sectionTitle: en ? 'Restore Options' : '修复选项',
    colorizeLabel: en ? 'Colorize (B/W)' : '黑白上色',
    denoiseLabel: en ? 'Smart Denoise' : '智能降噪',
    restoring: en ? 'Restoring...' : '修复中...',
    start: en ? 'Enhance with AI' : '开始 AI 增强',
    quoteLoading: en ? 'Loading the server quote…' : '正在读取服务端报价…',
    loginRequired: en ? 'Sign in before requesting a quote.' : '请先登录后获取报价。',
    paidUnavailable: en ? 'Paid enhancement is currently unavailable.' : '付费增强当前不可用。'
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
      ? 'Infer plausible colors for black-and-white photos; colors must be reviewed.'
      : '为黑白照片推测可能的色彩；上色结果需要人工核对。';
  if (enableDenoise.value)
    return en ? 'Reduce noise and blur for better clarity.' : '去除照片噪点和模糊，提升清晰度';
  return en ? 'Basic restoration only.' : '仅进行基础修复';
});

const costText = computed(() => {
  const n = Math.max(0, Math.trunc(Number(props.creditsCost ?? 0) || 0));
  if (!n) return '';
  return `${n}`;
});

const consentText = computed(() => {
  const credits = costText.value || '?';
  return currentLang.value === 'en'
    ? `I agree to upload this image for AI processing (retained up to 24 hours) and reserve ${credits} credits. Failed or cancelled tasks are refunded.`
    : `我同意上传此图片进行 AI 处理（最长保留 24 小时），并预占 ${credits} 点数；失败或取消会退款。`;
});

const quoteErrorText = computed(() => {
  if (props.quoteError === 'LOGIN_REQUIRED') return ui.value.loginRequired;
  return ui.value.paidUnavailable;
});

const close = () => {
  emit('close');
};

const resetState = () => {
  selectedFile.value = null;
  loading.value = false;
  enableColorize.value = true;
  enableDenoise.value = true;
  uploadConsent.value = false;
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
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type='checkbox']:focus-visible,
.upload-consent input:focus-visible,
.generate-btn:focus-visible {
  outline: 2px solid #ccff00;
  outline-offset: 3px;
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

.upload-consent {
  min-height: 44px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(204, 255, 0, 0.32);
  border-radius: 8px;
  color: #cbd5e1;
  background: rgba(204, 255, 0, 0.06);
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.upload-consent.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.upload-consent input {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  margin: 0;
  accent-color: #ccff00;
}

.quote-status {
  margin: -6px 0 0;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

.quote-status.error {
  color: #fca5a5;
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

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }

  .generate-btn:hover:not(:disabled) {
    transform: none;
  }
}
</style>
