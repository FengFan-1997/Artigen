<template>
  <time class="message-timestamp" :datetime="date ? value : undefined" :title="details">{{ shortTime }}</time>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ value: string; zh: boolean }>();
const date = computed(() => {
  const parsed = new Date(props.value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
});
const shortTime = computed(() => date.value?.toLocaleTimeString(props.zh ? 'zh-CN' : 'en-US', {
  hour: '2-digit', minute: '2-digit'
}) || '—');
const details = computed(() => date.value?.toLocaleString(props.zh ? 'zh-CN' : 'en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
}) || (props.zh ? '时间不可用' : 'Time unavailable'));
</script>

<style scoped>
.message-timestamp { flex-shrink: 0; color: var(--muted); font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
