<script lang="ts">
export default {
  name: 'IngredientLabelTypeSelect'
};
</script>

<script setup lang="ts">
import { nextTick, ref, onMounted, onUnmounted } from 'vue';

interface OptionItem {
  label: string;
  value: number;
  gtm: string;
}

const props = defineProps<{
  modelValue: number;
  options: OptionItem[];
  label?: string;
  mobile?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'open-mobile'): void;
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);

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
  void nextTick(() => triggerRef.value?.focus());
};

const openAndFocus = async (index: number) => {
  if (props.disabled) return;
  if (props.mobile) {
    emit('open-mobile');
    return;
  }
  isOpen.value = true;
  await nextTick();
  const options = menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="option"]');
  options?.[Math.max(0, Math.min((options.length || 1) - 1, index))]?.focus();
};

const onTriggerKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    void openAndFocus(0);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    void openAndFocus(props.options.length - 1);
  } else if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault();
    isOpen.value = false;
  }
};

const onOptionKeydown = (event: KeyboardEvent, index: number) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    isOpen.value = false;
    triggerRef.value?.focus();
    return;
  }
  const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (!direction && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const target = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? props.options.length - 1
      : (index + direction + props.options.length) % props.options.length;
  void openAndFocus(target);
};

const handleClickOutside = (e: Event) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
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
    <button
      ref="triggerRef"
      class="select-trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-controls="ingredient-label-type-options"
      :aria-label="label || 'Product type'"
      :aria-expanded="isOpen"
      :disabled="disabled"
      :class="{ 'is-disabled': disabled }"
      @click.stop="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="selected-text">{{ selectedLabel() }}</span>
      <span class="select-arrow" :class="{ 'is-rotated': isOpen }" aria-hidden="true"></span>
    </button>

    <div
      v-if="isOpen && !props.mobile"
      id="ingredient-label-type-options"
      ref="menuRef"
      class="dropdown-menu"
      role="listbox"
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        role="option"
        :aria-selected="modelValue === opt.value"
        class="dropdown-option"
        :class="{ 'is-selected': modelValue === opt.value }"
        :data-gtm="opt.gtm"
        @click.stop="select(opt.value)"
        @keydown="onOptionKeydown($event, options.indexOf(opt))"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style lang="less" scoped>
@bg-root: #0b0d0e;
@bg-surface: #111617;
@bg-element: #151a1b;
@border-color: rgba(245, 247, 242, 0.14);
@primary-color: #c8ff3d;
@primary-hover: #b7f12c;
@text-main: #f5f7f2;
@text-secondary: #c7cec3;
@text-muted: #9ca69a;
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
  color: inherit;
  font: inherit;
}

.select-trigger:focus-visible,
.dropdown-option:focus-visible {
  outline: 3px solid @primary-color;
  outline-offset: 2px;
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
  width: 9px;
  height: 9px;
  border-right: 2px solid @text-secondary;
  border-bottom: 2px solid @text-secondary;
  transform: rotate(45deg) translateY(-2px);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex: 0 0 auto;
  opacity: 0.5;
}

.select-arrow.is-rotated {
  transform: rotate(225deg) translate(-2px, -1px);
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
  z-index: 2505;
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
  width: 100%;
  min-height: 44px;
  border: 0;
  background: transparent;
  text-align: left;
}

@media (prefers-reduced-motion: reduce) {
  .select-trigger,
  .select-arrow,
  .dropdown-menu,
  .dropdown-option {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
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
