<template>
  <details class="technical-details" @toggle="syncOpen">
    <summary :aria-expanded="open" :aria-controls="contentId">
      <WorkspaceIcon name="chevron-right" :size="14" />
      <span>{{ label }}</span>
    </summary>
    <div :id="contentId" class="technical-details-content"><slot /></div>
  </details>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import WorkspaceIcon from './WorkspaceIcon.vue';

withDefaults(defineProps<{
  label?: string;
}>(), {
  label: '技术详情'
});

const open = ref(false);
const contentId = `technical-details-content-${useId()}`;
const syncOpen = (event: Event) => {
  open.value = (event.currentTarget as HTMLDetailsElement).open;
};
</script>

<style scoped>
.technical-details {
  margin-top: 6px;
  color: var(--text);
}

.technical-details summary {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  list-style: none;
}

.technical-details summary::-webkit-details-marker { display: none; }
.technical-details summary span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.technical-details summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.technical-details summary :deep(.workspace-icon) { color: var(--muted); }
.technical-details[open] summary :deep(.workspace-icon) { transform: rotate(90deg); }
.technical-details-content { padding: 4px 8px 12px 30px; }

@media (hover: hover) and (pointer: fine) {
  .technical-details summary:hover { color: var(--text); background: var(--surface-hover); }
}

@media (max-width: 799px), (pointer: coarse) {
  .technical-details summary { min-height: 44px; }
}
</style>
