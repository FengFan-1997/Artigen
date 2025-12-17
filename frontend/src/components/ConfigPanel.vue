<template>
  <div class="config-panel" :class="{ embedded }">
    <div class="config-item">
      <label>Mode:</label>
      <div class="custom-select" ref="selectRef" @click="toggleDropdown">
        <div class="selected-option">
          {{ options.find((o) => o.value === modelValue)?.label || 'Select Mode' }}
          <span class="arrow" :class="{ open: isOpen }">▼</span>
        </div>
        <transition name="dropdown">
          <ul v-if="isOpen" class="options-list">
            <li
              v-for="option in options"
              :key="option.value"
              class="option-item"
              :class="{ active: modelValue === option.value }"
              @click.stop="selectOption(option.value)"
            >
              {{ option.label }}
            </li>
          </ul>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

defineProps<{
  modelValue: string;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const isOpen = ref(false);
const selectRef = ref<HTMLElement | null>(null);

const options = [
  { value: '0', label: 'Ripple' },
  { value: '1', label: 'Kaleidoscope' },
  { value: '2', label: 'Starburst' }
];

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const selectOption = (value: string) => {
  emit('update:modelValue', value);
  isOpen.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.config-panel {
  display: block; /* Ensure it is visible */
  position: absolute;
  top: 40px;
  left: 70px;
  z-index: 2000; /* Higher z-index to stay on top */
  background: rgba(15, 23, 42, 0.9);
  padding: 8px 15px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
}

.config-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-item label {
  font-size: 0.9rem;
  color: #cbd5e1;
  font-weight: 500;
}

.custom-select {
  position: relative;
  width: 140px;
  font-family: 'Inter', system-ui, sans-serif;
}

.selected-option {
  background: rgba(30, 41, 59, 0.6);
  color: #f1f5f9;
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
}

.selected-option:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: #38bdf8;
}

.arrow {
  font-size: 0.7rem;
  transition: transform 0.3s ease;
  color: #38bdf8;
}

.arrow.open {
  transform: rotate(180deg);
}

.options-list {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  margin-top: 8px;
  padding: 0;
  list-style: none;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  transform-origin: top;
}

.option-item {
  padding: 10px 12px;
  font-size: 0.9rem;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-item:hover {
  background: rgba(56, 189, 248, 0.1);
  color: #fff;
}

.option-item.active {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  font-weight: 600;
}

/* Dropdown Animation */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.3s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
@media (max-width: 980px) {
  .config-panel:not(.embedded) {
    top: 16px;
    right: 80px;
    left: auto;
    padding: 6px 10px;
    transform: scale(0.9);
    transform-origin: top right;
  }

  .config-panel.embedded {
    position: relative;
    top: auto;
    left: auto;
    right: auto;
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
    margin-right: 15px;
    backdrop-filter: none;
  }

  .config-panel.embedded .config-item label {
    display: none; /* Save space on mobile nav */
  }

  .config-panel.embedded .custom-select {
    width: 110px;
  }

  .custom-select {
    width: 100px;
  }
}
</style>
