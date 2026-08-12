<template>
  <section
    class="generation-controls"
    :class="{ 'is-compact': isCompact, 'is-collapsed': isCompact && !isExpanded }"
    aria-label="Generation setup"
  >
    <button
      v-if="isCompact"
      class="generation-controls-toggle"
      type="button"
      :aria-expanded="isExpanded"
      aria-controls="generation-controls-body"
      @click="isExpanded = !isExpanded"
    >
      <span class="generation-controls-toggle-label">{{ copy.setup }}</span>
      <span class="generation-controls-summary">{{ compactSummary }}</span>
      <span class="generation-controls-chevron" :class="{ expanded: isExpanded }" aria-hidden="true"
        >⌄</span
      >
    </button>

    <div
      id="generation-controls-body"
      v-show="!isCompact || isExpanded"
      class="generation-controls-body"
    >
      <div v-if="showTemplates" class="generation-template-row">
        <span class="generation-control-label">{{ copy.starters }}</span>
        <div class="generation-chip-list">
          <button
            v-for="template in templates"
            :key="template.id"
            class="generation-chip"
            type="button"
            :disabled="disabled"
            @click="applyTemplate(language === 'zh' ? template.promptZh : template.promptEn)"
          >
            {{ language === 'zh' ? template.zh : template.en }}
          </button>
        </div>
      </div>

      <div class="generation-setup-grid">
        <div class="generation-ratio-group">
          <span class="generation-control-label">{{ copy.ratio }}</span>
          <div class="generation-chip-list generation-chip-list--compact">
            <button
              v-for="ratio in aspectRatios"
              :key="ratio"
              class="generation-chip generation-chip--ratio"
              :class="{ active: ratio === selectedAspectRatio }"
              type="button"
              :aria-pressed="ratio === selectedAspectRatio"
              :disabled="disabled"
              @click="emit('ratio', ratio)"
            >
              {{ ratio }}
            </button>
          </div>
        </div>

        <div v-if="maxReferences > 0" class="generation-reference-group">
          <span class="generation-control-label">{{ copy.references }}</span>
          <div class="generation-reference-list">
            <div
              v-for="(label, index) in slotLabels"
              :key="label"
              class="generation-reference-slot"
              :class="{ filled: Boolean(previewUrls[index]) }"
            >
              <button
                class="generation-reference-main"
                type="button"
                :disabled="disabled"
                :aria-label="`${copy.upload} ${label}`"
                @click="emit('upload', index)"
              >
                <img v-if="previewUrls[index]" :src="previewUrls[index]" alt="" />
                <span v-else class="generation-reference-plus" aria-hidden="true">+</span>
                <span>{{ label }}</span>
              </button>
              <button
                v-if="previewUrls[index]"
                class="generation-reference-remove"
                type="button"
                :disabled="disabled"
                :aria-label="`${copy.remove} ${label}`"
                @click="emit('clear', index)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
      <p class="generation-privacy-note">{{ copy.privacy }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  GENERATION_STARTER_TEMPLATES,
  generationReferenceSlotLabels
} from '../domain/generationWorkspace';

const props = defineProps<{
  language: string;
  disabled: boolean;
  showTemplates: boolean;
  aspectRatios: string[];
  selectedAspectRatio: string;
  previewUrls: string[];
  maxReferences: number;
}>();

const emit = defineEmits<{
  (event: 'template', prompt: string): void;
  (event: 'ratio', ratio: string): void;
  (event: 'upload', index: number): void;
  (event: 'clear', index: number): void;
}>();

const templates = GENERATION_STARTER_TEMPLATES;
const slotLabels = computed(() =>
  generationReferenceSlotLabels(props.language).slice(0, Math.max(0, props.maxReferences))
);
const isCompact = ref(false);
const isExpanded = ref(true);
let compactMediaQuery: MediaQueryList | null = null;

const syncCompactMode = (matches: boolean) => {
  const wasCompact = isCompact.value;
  isCompact.value = matches;
  if (!matches) isExpanded.value = true;
  else if (!wasCompact) isExpanded.value = false;
};

const onCompactMediaChange = (event: MediaQueryListEvent) => syncCompactMode(event.matches);

onMounted(() => {
  compactMediaQuery = window.matchMedia('(max-width: 760px)');
  syncCompactMode(compactMediaQuery.matches);
  compactMediaQuery.addEventListener('change', onCompactMediaChange);
});

onBeforeUnmount(() => compactMediaQuery?.removeEventListener('change', onCompactMediaChange));

const referenceCount = computed(() => props.previewUrls.filter(Boolean).length);
const compactSummary = computed(() =>
  props.language === 'zh'
    ? props.maxReferences > 0
      ? `${props.selectedAspectRatio} · ${referenceCount.value} 张参考图`
      : `${props.selectedAspectRatio} · 文生图`
    : props.maxReferences > 0
      ? `${props.selectedAspectRatio} · ${referenceCount.value} ${referenceCount.value === 1 ? 'reference' : 'references'}`
      : `${props.selectedAspectRatio} · Text to image`
);

const applyTemplate = (prompt: string) => {
  emit('template', prompt);
  if (isCompact.value) isExpanded.value = false;
};

const copy = computed(() =>
  props.language === 'zh'
    ? {
        setup: '生成设置',
        starters: '快速开始',
        ratio: '画面比例',
        references: '语义参考图（商品图必填）',
        upload: '上传',
        remove: '移除',
        privacy: props.maxReferences > 0
          ? '上传 1 张商品参考图；确认 60 点报价后才会提交素材。'
          : '标准文生图不接收参考图；确认 10 点报价后才会提交提示词。'
      }
    : {
        setup: 'Generation setup',
        starters: 'Start with a recipe',
        ratio: 'Aspect ratio',
        references: 'Semantic references (product required)',
        upload: 'Upload',
        remove: 'Remove',
        privacy: props.maxReferences > 0
          ? 'Upload one product reference. The asset is submitted only after you confirm the 60-credit quote.'
          : 'Standard text-to-image accepts no references. Your prompt is submitted only after you confirm the 10-credit quote.'
      }
);
</script>

<style scoped>
.generation-controls {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid rgba(200, 255, 61, 0.12);
  background: rgba(8, 11, 12, 0.72);
}

.generation-controls-body {
  display: grid;
  gap: 10px;
}

.generation-controls-toggle {
  width: 100%;
  min-height: 44px;
  display: none;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(245, 247, 242, 0.12);
  border-radius: 10px;
  background: rgba(245, 247, 242, 0.04);
  color: rgba(245, 247, 242, 0.9);
  font: inherit;
  text-align: left;
}

.generation-controls-toggle-label {
  font-size: 13px;
  font-weight: 800;
}

.generation-controls-summary {
  min-width: 0;
  overflow: hidden;
  color: rgba(245, 247, 242, 0.56);
  font-size: 12px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generation-controls-chevron {
  color: #c8ff3d;
  font-size: 18px;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 0.18s ease;
}

.generation-controls-chevron.expanded {
  transform: rotate(180deg);
}

.generation-template-row,
.generation-ratio-group,
.generation-reference-group {
  display: grid;
  gap: 7px;
}

.generation-setup-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(320px, 1.2fr);
  gap: 12px;
}

.generation-control-label {
  color: rgba(245, 247, 242, 0.7);
  font-size: 12px;
  font-weight: 700;
}

.generation-chip-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.generation-chip-list--compact {
  flex-wrap: wrap;
  overflow: visible;
}

.generation-chip {
  min-height: 36px;
  flex: 0 0 auto;
  padding: 7px 10px;
  border: 1px solid rgba(245, 247, 242, 0.14);
  border-radius: 8px;
  background: rgba(245, 247, 242, 0.04);
  color: rgba(245, 247, 242, 0.82);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.generation-chip:hover:not(:disabled),
.generation-chip.active {
  border-color: rgba(200, 255, 61, 0.65);
  background: rgba(200, 255, 61, 0.1);
  color: #eaffb3;
}

.generation-chip--ratio {
  min-width: 48px;
}

.generation-reference-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.generation-reference-slot {
  position: relative;
  min-width: 0;
}

.generation-reference-main {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border: 1px dashed rgba(245, 247, 242, 0.22);
  border-radius: 8px;
  background: rgba(245, 247, 242, 0.025);
  color: rgba(245, 247, 242, 0.7);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.generation-reference-main:hover:not(:disabled) {
  border-color: rgba(200, 255, 61, 0.55);
}

.generation-reference-main img {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 6px;
  object-fit: cover;
}

.generation-reference-plus {
  width: 24px;
  flex: 0 0 24px;
  color: #c8ff3d;
  font-size: 22px;
  line-height: 1;
  text-align: center;
}

.generation-reference-remove {
  position: absolute;
  top: -6px;
  right: -4px;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: #1a1d1e;
  color: #fff;
  cursor: pointer;
}

.generation-privacy-note {
  margin: 0;
  color: rgba(245, 247, 242, 0.48);
  font-size: 11px;
  line-height: 1.4;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 760px) {
  .generation-controls {
    gap: 8px;
    padding: 8px 10px;
  }

  .generation-controls.is-collapsed {
    padding-block: 7px;
  }

  .generation-controls-toggle {
    display: grid;
  }

  .generation-template-row .generation-chip-list {
    flex-wrap: wrap;
    overflow: visible;
  }

  .generation-setup-grid {
    grid-template-columns: 1fr;
  }

  .generation-reference-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 2px 6px;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }

  .generation-reference-slot {
    flex: 0 0 min(160px, 72vw);
    scroll-snap-align: start;
  }

  .generation-reference-main {
    min-height: 44px;
    padding: 6px 8px;
  }

  .generation-reference-main span:last-child {
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
}
</style>
