<template>
  <ul v-if="attachments.length" class="message-attachments" :aria-label="zh ? '已发送附件' : 'Sent attachments'">
    <li v-for="file in attachments" :key="file.assetId" :title="file.filename">
      <WorkspaceIcon name="attachment" :size="16" />
      <span>{{ file.filename }}</span>
      <small>{{ Number.isFinite(file.byteSize) ? (file.byteSize < 1048576 ? Math.max(1, Math.round(file.byteSize / 1024)) + ' KB' : (file.byteSize / 1048576).toFixed(1) + ' MB') : '' }}</small>
    </li>
  </ul>
</template>
<script setup lang="ts">
import WorkspaceIcon from './WorkspaceIcon.vue';
import type { MessageAttachment } from '../../services/workspaceFiles';
defineProps<{ attachments: MessageAttachment[]; zh: boolean }>();
</script>
<style scoped>
.message-attachments { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 0; padding:0; list-style:none; }
li { display:flex; align-items:center; gap:7px; min-width:0; max-width:100%; padding:8px 10px; border-radius:8px; background:var(--surface-hover); font-size:12px; }
li > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
li svg,li small { flex-shrink:0; }
li small { color:var(--muted); }
</style>
