<template>
  <button ref="button" class="close-btn" type="button" :aria-label="label" @click="emit('click')">
    <WorkspaceIcon name="close" :size="18" />
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import WorkspaceIcon from './workspace/WorkspaceIcon.vue';
withDefaults(defineProps<{ label?: string }>(), { label: 'Close / 关闭' });
const emit = defineEmits<{ (e: 'click'): void }>();
const button = ref<HTMLButtonElement | null>(null);
defineExpose({ focus: (options?: FocusOptions) => button.value?.focus(options) });
</script>

<style scoped>
.close-btn {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--muted, #b8bec9);
  background: transparent;
  cursor: pointer;
}
.close-btn:focus-visible {
  outline: 2px solid var(--focus, #ccff00);
  outline-offset: -2px;
}
@media (hover: hover) and (pointer: fine) {
  .close-btn:hover:not(:disabled) {
    color: var(--text, #fff);
    background: var(--surface-hover, rgba(255, 255, 255, 0.08));
  }
}
.close-btn:disabled { opacity: 0.5; cursor: default; }
</style>
