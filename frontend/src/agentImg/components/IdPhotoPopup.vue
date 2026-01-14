<template>
  <transition name="fade">
    <div v-if="visible" class="modal-overlay" @click="close">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <div class="header-left">
            <span class="header-icon">ID</span>
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
                <div class="folder-icon">📁</div>
                <div class="upload-text">{{ ui.uploadText }}</div>
                <div class="upload-hint">{{ ui.uploadHint }}</div>
              </div>
            </template>
          </div>

          <div class="config-panel">
            <div class="config-section">
              <div class="section-title">{{ ui.sectionTitle }}</div>

              <div class="form-item">
                <label>{{ ui.typeLabel }}</label>
                <div class="select-wrapper">
                  <CyberDropdown
                    v-model="selectedType"
                    :options="photoTypes"
                    @change="(val) => trackEvent('ID_Photo', 'select_type', val)"
                  />
                </div>
              </div>

              <div class="type-desc">
                {{ currentTypeDesc }}
              </div>

              <button
                class="generate-btn"
                @click="handleGenerate"
                :disabled="!previewUrl || loading"
              >
                <span>{{ loading ? ui.generating : ui.start }}</span>
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
import CyberDropdown from './CyberDropdown.vue';
import { trackEvent } from '../../utils/analytics';
import { useLanguageStore } from '@/stores/language';

const props = defineProps<{
  visible: boolean;
  creditsCost?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'generate', file: File, type: string): void;
}>();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string>('');
const loading = ref(false);
const previewObjectUrl = ref<string>('');

const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    title: en ? 'Smart ID Photo' : '智能证件照',
    subtitle: en
      ? 'Multiple specs, one-click standard ID photo.'
      : '支持多种规格，一键生成标准证件照',
    reupload: en ? 'Click or drag to replace image' : '点击或拖拽替换图片',
    uploadText: en ? 'Click or drag image' : '点击或拖拽图片',
    uploadHint: en ? 'Supports JPG, PNG, WEBP' : '支持 JPG, PNG, WEBP',
    sectionTitle: en ? 'Setup & Generate' : '配置与生成',
    typeLabel: en ? 'Photo Type' : '证件类型',
    generating: en ? 'Generating...' : '生成中...',
    start: en ? 'Generate' : '开始生成'
  };
});

const photoTypes = computed(() => {
  const en = currentLang.value === 'en';
  return [
    {
      value: 'finance',
      label: en ? 'Finance / Law' : '金融/法律行业',
      desc: en ? 'Professional, rigorous, trustworthy.' : '专业、严谨、值得信赖的职业形象'
    },
    {
      value: 'tech',
      label: en ? 'Tech / Startup' : '科技新贵/创业家',
      desc: en ? 'Modern, innovative, energetic.' : '现代、创新、充满活力的商业形象'
    },
    {
      value: 'scholar',
      label: en ? 'Scholar / Expert' : '学者/专家/作家',
      desc: en ? 'Intellectual, wise, gentle.' : '知性、睿智、温文尔雅的专业形象'
    },
    {
      value: 'creative',
      label: en ? 'Creative Professional' : '创意领域专业人士',
      desc: en ? 'Distinct, tasteful, not exaggerated.' : '个性、独特、富有艺术感的个人形象'
    },
    {
      value: 'leader',
      label: en ? 'Executive Leader' : '经典企业领袖',
      desc: en ? 'Steady, premium, leadership presence.' : '稳重、大气、具有领导力的领袖形象'
    }
  ];
});

const selectedType = ref('finance');

const currentTypeDesc = computed(() => {
  return photoTypes.value.find((t) => t.value === selectedType.value)?.desc || '';
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

const handleGenerate = () => {
  if (!selectedFile.value) return;
  loading.value = true;
  trackEvent('ID_Photo', 'generate_click', selectedType.value);
  emit('generate', selectedFile.value, selectedType.value);
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

/* ... existing styles ... */

.select-wrapper select {
  display: none; /* Hide old select if present */
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

.form-item {
  margin-bottom: 16px;
}

.form-item label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}

.select-wrapper select {
  width: 100%;
  background: #222;
  border: 1px solid #333;
  color: #fff;
  padding: 10px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}

.select-wrapper select:focus {
  border-color: #ccff00;
}

.type-desc {
  background: #222;
  padding: 12px;
  border-radius: 4px;
  color: #888;
  font-size: 12px;
  margin-bottom: 24px;
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
</style>
