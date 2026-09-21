<template>
  <details class="technical-details" @toggle="syncOpen">
    <summary :aria-expanded="open" :aria-controls="contentId">
      <span>{{ label }}</span>
      <WorkspaceIcon name="chevron-down" />
    </summary>
    <div :id="contentId" class="technical-details-content"><slot /></div>
  </details>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import WorkspaceIcon from './WorkspaceIcon.vue';

let nextDetailsId = 0;

withDefaults(defineProps<{
  label?: string;
}>(), {
  label: '技术详情'
});

const open = ref(false);
const contentId = `technical-details-content-${++nextDetailsId}`;
const syncOpen = (event: Event) => {
  open.value = (event.currentTarget as HTMLDetailsElement).open;
};
</script>

<style scoped>
.technical-details {
  margin-top: 6px;
  color: var(--text);
  background: color-mix(in srgb, var(--surface-raised) 58%, transparent);
  border-radius: 10px;
}

.technical-details summary {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 10px;
  color: var(--muted);
  font-size: var(--font-control, 12px);
  font-weight: 620;
  cursor: pointer;
  list-style: none;
}

.technical-details summary::-webkit-details-marker { display: none; }
.technical-details summary:hover { color: var(--text); }
.technical-details summary:focus-visible { outline: 2px solid var(--acid); outline-offset: 2px; }
.technical-details summary :deep(.workspace-icon) {
  transition: transform 160ms cubic-bezier(.23, 1, .32, 1);
}
.technical-details[open] summary :deep(.workspace-icon) { transform: rotate(180deg); }
.technical-details-content { padding: 0 10px 10px; }

@media (max-width: 799px) {
  .technical-details summary { min-height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .technical-details summary :deep(.workspace-icon) { transition: none; }
}
</style>
