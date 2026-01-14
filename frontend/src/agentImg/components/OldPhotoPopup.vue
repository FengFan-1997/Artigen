<template>
  <transition name="fade">
    <div v-if="visible" class="modal-overlay" @click="close">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <div class="header-left">
            <span class="header-icon">FIX</span>
            <span class="header-title">{{ ui.title }}</span>
          </div>
          <button class="close-btn" @click="close">×</button>
        </div>
        <div class="modal-subtitle">{{ ui.subtitle }}</div>

        <div class="modal-body">
          <div
            class="upload-area"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="onDrop"
            @click="triggerFileSelect"
            :class="{ 'drag-over': isDragOver, 'has-file': !!previewUrl }"
          >
            <input
              type="file"
              ref="fileInput"
              class="hidden-input"
              accept="image/*"
              @change="onFileSelect"
            />

            <template v-if="previewUrl">
              <img :src="previewUrl" class="preview-img" alt="Preview" />
              <div class="reupload-overlay">
                <span>{{ ui.reupload }}</span>
              </div>
            </template>
            <template v-else>
              <div class="upload-placeholder">
                <div class="folder-icon">🕰️</div>
                <div class="upload-text">{{ ui.uploadText }}</div>
                <div class="upload-hint">{{ ui.uploadHint }}</div>
              </div>
            </template>
          </div>

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
                :disabled="!previewUrl || loading"
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

const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string>('');
const loading = ref(false);
const previewObjectUrl = ref<string>('');

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
  try {
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  } catch {}
  previewObjectUrl.value = '';
  previewUrl.value = '';
  selectedFile.value = null;
  loading.value = false;
  isDragOver.value = false;
  enableColorize.value = true;
  enableDenoise.value = true;
  try {
    if (fileInput.value) fileInput.value.value = '';
  } catch {}
};

watch(
  () => !!props.visible,
  (v) => {
    if (!v) resetState();
  }
);

const triggerFileSelect = () => {
  fileInput.value?.click();
};

const handleFile = (file: File) => {
  if (!file.type.startsWith('image/')) return;
  selectedFile.value = file;
  try {
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  } catch {}
  const u = URL.createObjectURL(file);
  previewObjectUrl.value = u;
  previewUrl.value = u;
};

const onFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    handleFile(input.files[0]);
  }
};

const onDrop = (e: DragEvent) => {
  isDragOver.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
};

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

.close-btn {
  background: transparent;
  border: none;
  color: #666;
  font-size: 24px;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #fff;
}

.modal-body {
  display: flex;
  gap: 24px;
  height: 500px;
}

.upload-area {
  margin-top: 10px;
  flex: 1;
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  background: rgba(10, 10, 10, 0.6);
}

.upload-area::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    linear-gradient(90deg, transparent 0%, rgba(204, 255, 0, 0.03) 50%, transparent 100%),
    radial-gradient(circle at center, rgba(204, 255, 0, 0.05) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.upload-area.drag-over,
.upload-area:hover {
  border-color: #ccff00;
  background: rgba(15, 15, 15, 0.9);
  box-shadow:
    0 0 40px rgba(204, 255, 0, 0.15),
    inset 0 0 20px rgba(204, 255, 0, 0.05);
  transform: translateY(-2px);
}

.upload-area:hover::before {
  opacity: 1;
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

.hidden-input {
  display: none;
}

.upload-placeholder {
  text-align: center;
  transition: transform 0.3s ease;
}

.upload-area:hover .upload-placeholder {
  transform: scale(1.05);
}

.folder-icon {
  font-size: 64px;
  margin-bottom: 24px;
  opacity: 0.8;
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.1));
}

.upload-area:hover .folder-icon {
  filter: drop-shadow(0 0 15px rgba(204, 255, 0, 0.3));
}

.upload-text {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #fff;
}

.upload-hint {
  font-size: 12px;
  color: #666;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.reupload-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.reupload-overlay span {
  color: #fff;
  border: 1px solid #fff;
  padding: 8px 16px;
  border-radius: 4px;
}

.upload-area:hover .reupload-overlay {
  opacity: 1;
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

  .upload-area {
    min-height: 300px;
    flex: none;
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
