<template>
  <section class="generation-controls" aria-label="Generation setup">
    <div v-if="showTemplates" class="generation-template-row">
      <span class="generation-control-label">{{ copy.starters }}</span>
      <div class="generation-chip-list">
        <button
          v-for="template in templates"
          :key="template.id"
          class="generation-chip"
          type="button"
          :disabled="disabled"
          @click="emit('template', language === 'zh' ? template.promptZh : template.promptEn)"
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

      <div class="generation-reference-group">
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
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
}>();

const emit = defineEmits<{
  (event: 'template', prompt: string): void;
  (event: 'ratio', ratio: string): void;
  (event: 'upload', index: number): void;
  (event: 'clear', index: number): void;
}>();

const templates = GENERATION_STARTER_TEMPLATES;
const slotLabels = computed(() => generationReferenceSlotLabels(props.language));
const copy = computed(() =>
  props.language === 'zh'
    ? {
        starters: '快速开始',
        ratio: '画面比例',
        references: '参考图（可选）',
        upload: '上传',
        remove: '移除',
        privacy: '选择模板不会生成或扣费；仅在确认生成后上传必要的提示词与参考图。'
      }
    : {
        starters: 'Start with a recipe',
        ratio: 'Aspect ratio',
        references: 'References (optional)',
        upload: 'Upload',
        remove: 'Remove',
        privacy: 'Recipes never generate or charge automatically. Required prompts and references upload only after confirmation.'
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
    padding: 10px;
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
