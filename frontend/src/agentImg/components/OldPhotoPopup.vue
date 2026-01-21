<template>
  <transition name="fade">
    <div v-if="visible" class="modal-overlay" @click="close">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <div class="header-left">
            <span class="header-icon">FIX</span>
            <span class="header-title">{{ ui.title }}</span>
          </div>
          <CloseButton @click="close" />
        </div>
        <div class="modal-subtitle">{{ ui.subtitle }}</div>

        <div class="modal-body">
          <ImageUploadArea
            v-model="selectedFile"
            :upload-text="ui.uploadText"
            :upload-hint="ui.uploadHint"
            :reupload-text="ui.reupload"
            placeholder-icon="🕰️"
            :disabled="loading"
          />

          <div class="config-panel">
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

              <button
                class="generate-btn"
                @click="handleRestore"
                :disabled="!selectedFile || loading"
              >
                <span>{{ loading ? ui.restoring : ui.start }}</span>
                <span v-if="!loading && costText" class="generate-cost">{{ costText }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { trackEvent } from '../../utils/analytics';
import { useLanguageStore } from '@/stores/language';
import CloseButton from './CloseButton.vue';
import ImageUploadArea from './ImageUploadArea.vue';

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
  return `⚡${n}`;
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
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-container {
  width: 900px;
  max-width: 95vw;
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid #fff;
  padding: 2px 6px;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.header-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.modal-subtitle {
  color: #888;
  font-size: 12px;
  margin-bottom: 24px;
  margin-left: 54px;
}

:deep(.close-btn) {
  background: transparent;
  border: none;
  color: #666;
  font-size: 24px;
  cursor: pointer;
  transition: color 0.2s;
}

:deep(.close-btn:hover) {
  color: #fff;
}

.modal-body {
  display: flex;
  gap: 24px;
  height: 500px;
}

/* Checkbox Styles */
.option-row {
  margin-bottom: 16px;
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
  content: '✓';
  position: absolute;
  color: #ccff00;
  font-size: 14px;
  font-weight: bold;
  left: 3px;
  top: -1px;
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

.config-panel {
  width: 300px;
  background: #161616;
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.section-title {
  color: #888;
  font-size: 12px;
  margin-bottom: 24px;
  text-align: center;
}

.option-row {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}

.type-desc {
  background: #222;
  padding: 12px;
  border-radius: 4px;
  color: #888;
  font-size: 12px;
  margin-bottom: 24px;
  margin-top: auto;
  min-height: 40px;
}

.generate-btn {
  width: 100%;
  background: #ccff00;
  color: #000;
  border: none;
  padding: 12px;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.generate-cost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.28);
  background: rgba(0, 0, 0, 0.18);
  color: rgba(0, 0, 0, 0.88);
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
}

.generate-btn:hover:not(:disabled) {
  background: #b3e600;
  transform: translateY(-1px);
}

.generate-btn:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 960px) {
  .modal-container {
    width: 100%;
    height: 100%;
    max-width: none;
    border-radius: 0;
    padding: 16px;
  }

  .modal-body {
    flex-direction: column;
    height: auto;
    flex: 1;
    overflow-y: auto;
  }

  .config-panel {
    width: 100% !important;
    flex: none;
  }

  .modal-subtitle {
    margin-left: 0;
    text-align: center;
  }
}
</style>
