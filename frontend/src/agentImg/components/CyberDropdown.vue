<template>
  <div class="cyber-dropdown" :class="{ open: isOpen }" ref="dropdownRef">
    <div class="dropdown-trigger" @click="toggleDropdown">
      <span class="selected-label">{{ selectedLabel }}</span>
      <span class="arrow-icon">›</span>
    </div>

    <transition name="dropdown-fade">
      <div v-if="isOpen" class="dropdown-menu">
        <div
          v-for="option in options"
          :key="option.value"
          class="dropdown-option"
          :class="{ active: modelValue === option.value }"
          @click="selectOption(option)"
        >
          <span class="option-label">{{ option.label }}</span>
          <span v-if="modelValue === option.value" class="check-icon">✓</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  options: { label: string; value: any; [key: string]: any }[];
  modelValue: any;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'change', value: any): void;
}>();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const selectedLabel = computed(() => {
  const found = props.options.find((opt) => opt.value === props.modelValue);
  return found ? found.label : '';
});

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const selectOption = (option: any) => {
  emit('update:modelValue', option.value);
  emit('change', option.value);
  isOpen.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.cyber-dropdown {
  position: relative;
  width: 100%;
  font-family: 'Inter', sans-serif;
  user-select: none;
}

.dropdown-trigger {
  background: rgba(10, 10, 10, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 48px;
  backdrop-filter: blur(10px);
}

.dropdown-trigger:hover {
  border-color: rgba(204, 255, 0, 0.5);
  background: rgba(17, 17, 17, 0.9);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.1);
}

.cyber-dropdown.open .dropdown-trigger {
  border-color: #ccff00;
  background: rgba(10, 10, 10, 0.95);
  box-shadow: 0 0 20px rgba(204, 255, 0, 0.2);
}

.selected-label {
  color: #fff;
  font-size: 14px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.5px;
}

.arrow-icon {
  color: #666;
  font-size: 18px;
  font-weight: bold;
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.3s;
  transform: rotate(90deg);
}

.cyber-dropdown.open .arrow-icon {
  transform: rotate(-90deg);
  color: #ccff00;
  text-shadow: 0 0 8px #ccff00;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 100%;
  background: rgba(10, 10, 10, 0.95);
  border: 1px solid rgba(204, 255, 0, 0.3);
  border-radius: 4px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.8),
    0 0 20px rgba(204, 255, 0, 0.1);
  z-index: 100;
  overflow: hidden;
  max-height: 300px;
  overflow-y: auto;
  backdrop-filter: blur(20px);
}

.dropdown-option {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
}

.dropdown-option::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ccff00;
  transform: scaleY(0);
  transition: transform 0.2s ease;
}

.dropdown-option:hover {
  background: rgba(204, 255, 0, 0.05);
  padding-left: 20px;
}

.dropdown-option:hover::before {
  transform: scaleY(1);
}

.dropdown-option.active {
  background: rgba(204, 255, 0, 0.1);
}

.dropdown-option.active::before {
  transform: scaleY(1);
}

.option-label {
  color: #cbd5e1;
  font-size: 14px;
  transition: color 0.2s;
}

.dropdown-option:hover .option-label,
.dropdown-option.active .option-label {
  color: #fff;
}

.check-icon {
  color: #ccff00;
  font-size: 14px;
  font-weight: bold;
}

/* Scrollbar */
.dropdown-menu::-webkit-scrollbar {
  width: 6px;
}

.dropdown-menu::-webkit-scrollbar-track {
  background: #0a0a0a;
}

.dropdown-menu::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.dropdown-menu::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Transition */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
