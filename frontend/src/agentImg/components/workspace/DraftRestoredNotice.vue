<template>
  <div class="draft-restored" role="status">
    <WorkspaceIcon name="file" :size="16" />
    <div>
      <strong>{{ zh ? '已恢复本机草稿' : 'Local draft restored' }}</strong>
      <small v-if="references">{{ zh ? '参考文件需重新选择。' : 'Choose reference files again.' }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import WorkspaceIcon from './WorkspaceIcon.vue';

withDefaults(defineProps<{ zh: boolean; references?: boolean }>(), { references: true });
</script>

<style scoped>
.draft-restored { display: grid; min-width: 0; grid-template-columns: 16px minmax(0, 1fr); align-items: start; gap: 8px; color: var(--muted); text-align: left; }
.draft-restored > svg { margin-top: 2px; }
.draft-restored > div { display: grid; min-width: 0; gap: 2px; }
strong { color: var(--text); font-size: 13px; font-weight: 500; line-height: 20px; overflow-wrap: anywhere; }
small { font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
</style>
