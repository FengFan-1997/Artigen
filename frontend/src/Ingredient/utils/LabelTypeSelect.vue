<script lang="ts">
export default {
  name: 'LabelTypeSelect'
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
.labeltype-select {
  position: relative;
  width: 100%; /* Flexible width */
  min-width: 200px;
}

.select-trigger {
  display: flex;
  width: 100%;
  padding: 12px;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.select-trigger:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
}

.select-trigger.is-disabled {
  cursor: not-allowed;
  pointer-events: none;
  opacity: 0.6;
}

.selected-text {
  color: #333;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  flex: 1 0 0;
  text-align: left;
}

.select-arrow {
  width: 10px;
  height: 10px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.6;
}

.select-arrow.is-rotated {
  transform: rotate(180deg);
}

.dropdown-menu {
  display: flex;
  width: 100%; /* Match parent width */
  padding: 6px;
  flex-direction: column;
  align-items: flex-start;
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  animation: slideDown 0.2s ease-out;
  max-height: 250px; /* Limit height */
  overflow-y: auto; /* Enable scroll */
}

/* Custom scrollbar for dropdown */
.dropdown-menu::-webkit-scrollbar {
  width: 6px;
}
.dropdown-menu::-webkit-scrollbar-track {
  background: transparent;
}
.dropdown-menu::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-option {
  display: flex;
  padding: 10px 16px;
  align-items: center;
  gap: 5px;
  align-self: stretch;
  border-radius: 8px;
  cursor: pointer;
  color: #333;
  transition: all 0.2s;
  font-size: 14px;
}

.dropdown-option:hover {
  background: rgba(0, 0, 0, 0.05);
}

.dropdown-option.is-selected {
  background: rgba(74, 144, 226, 0.1);
  color: #4a90e2;
  font-weight: 500;
}

@media (max-width: 768px) {
  .labeltype-select {
    width: 100%;
    min-width: 0;
  }

  .select-trigger {
    padding: 10px;
  }
}
</style>
