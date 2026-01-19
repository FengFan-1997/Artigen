<script lang="ts">
export default {
  name: 'IngredientLabelTypeSelect'
};
</script>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface OptionItem {
  label: string;
  value: number;
  gtm: string;
}

const props = defineProps<{
  modelValue: number;
  options: OptionItem[];
  mobile?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'open-mobile'): void;
}>();

const isOpen = ref(false);

const toggle = () => {
  if (props.disabled) return;
  if (props.mobile) {
    emit('open-mobile');
  } else {
    isOpen.value = !isOpen.value;
  }
};

const select = (val: number) => {
  emit('update:modelValue', val);
  isOpen.value = false;
};

const handleClickOutside = (e: Event) => {
  const target = e.target as Element;
  if (!target.closest('.labeltype-select')) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

const selectedLabel = () => props.options.find((o) => o.value === props.modelValue)?.label || '';
</script>

<template>
  <div class="labeltype-select">
    <div class="select-trigger" :class="{ 'is-disabled': disabled }" @click.stop="toggle">
      <span class="selected-text">{{ selectedLabel() }}</span>
      <img
        class="select-arrow"
        :class="{ 'is-rotated': isOpen }"
        src="https://cdn.packify.ai/image/8cfedda5-f070-4102-8dfd-33593ac1a29a.svg"
        alt="arrow"
        width="9"
        height="6"
      />
    </div>

    <div v-if="isOpen && !props.mobile" class="dropdown-menu">
      <div
        v-for="opt in options"
        :key="opt.value"
        class="dropdown-option"
        :class="{ 'is-selected': modelValue === opt.value }"
        :data-gtm="opt.gtm"
        @click.stop="select(opt.value)"
      >
        {{ opt.label }}
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
/* Color Palette - Clean Light Mode (Matching Parent) */
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

.labeltype-select {
  position: relative;
  width: 100%;
  min-width: 200px;
}

.select-trigger {
  display: flex;
  width: 100%;
  padding: 0 16px;
  height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  border: 1px solid @border-color;
  background: @bg-element;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.select-trigger:hover {
  border-color: @primary-color;
}

.select-trigger.is-disabled {
  background: @bg-surface;
  cursor: not-allowed;
  pointer-events: none;
  opacity: 0.6;
}

.selected-text {
  color: @text-main;
  font-size: 15px;
  font-weight: 500;
  line-height: 20px;
  flex: 1 0 0;
  text-align: left;
}

.select-arrow {
  width: 10px;
  height: 10px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.5;
  filter: brightness(0); /* Make black/dark */
}

.select-arrow.is-rotated {
  transform: rotate(180deg);
}

.dropdown-menu {
  display: flex;
  width: 100%;
  padding: 6px;
  flex-direction: column;
  align-items: flex-start;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  border-radius: 10px;
  border: 1px solid @border-color;
  background: @bg-root;
  box-shadow: @glass-shadow;
  z-index: 1000;
  animation: slideDown 0.2s ease-out;
  max-height: 250px;
  overflow-y: auto;
}

.dropdown-menu::-webkit-scrollbar {
  width: 6px;
}
.dropdown-menu::-webkit-scrollbar-track {
  background: transparent;
}
.dropdown-menu::-webkit-scrollbar-thumb {
  background: @border-color;
  border-radius: 3px;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-option {
  display: flex;
  padding: 10px 12px;
  align-items: center;
  gap: 5px;
  align-self: stretch;
  border-radius: 6px;
  cursor: pointer;
  color: @text-main;
  transition: all 0.2s;
  font-size: 14px;
}

.dropdown-option:hover {
  background: @bg-surface;
  color: @primary-color;
}

.dropdown-option.is-selected {
  background: fade(@primary-color, 10%);
  color: @primary-color;
  font-weight: 600;
}

@media (max-width: 768px) {
  .labeltype-select {
    width: 100%;
    min-width: 0;
  }
}
</style>
