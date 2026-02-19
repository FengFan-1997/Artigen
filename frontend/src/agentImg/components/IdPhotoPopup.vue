<template>
  <BaseTaskPopup
    :visible="visible"
    :title="ui.title"
    :subtitle="ui.subtitle"
    icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>'
    :upload-text="ui.uploadText"
    :upload-hint="ui.uploadHint"
    :reupload-text="ui.reupload"
    placeholder-icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>'
    :loading="loading"
    v-model:selected-file="selectedFile"
    @close="close"
  >
    <template #config>
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

        <button class="generate-btn" :disabled="!selectedFile || loading" @click="handleGenerate">
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
            {{ ui.generating }}
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
import { computed, ref, watch } from 'vue';
import CyberDropdown from './CyberDropdown.vue';
import BaseTaskPopup from './BaseTaskPopup.vue';
import { trackEvent } from '../../utils/analytics';
import { useLanguageStore } from '@/stores/language';
import { storeToRefs } from 'pinia';

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

const loading = ref(false);
const selectedFile = ref<File | null>(null);

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

const selectedType = ref('finance');

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

const currentTypeDesc = computed(() => {
  return photoTypes.value.find((t) => t.value === selectedType.value)?.desc || '';
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
};

watch(
  () => !!props.visible,
  (v) => {
    if (!v) resetState();
  }
);

const handleGenerate = () => {
  if (!selectedFile.value) return;
  loading.value = true;
  trackEvent('ID_Photo', 'generate_click', selectedType.value);
  emit('generate', selectedFile.value, selectedType.value);
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

.form-item {
  margin-bottom: 8px;
}

.form-item label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}

.select-wrapper {
  position: relative;
}

.type-desc {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  color: #aaa;
  line-height: 1.4;
  min-height: 60px;
}

.generate-btn {
  margin-top: auto;
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ccff00;
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  gap: 8px;
  transition: all 0.2s;
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

.generate-btn:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(204, 255, 0, 0.3);
}

.cost-badge {
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 4px;
}
</style>
