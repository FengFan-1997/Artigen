<template>
  <button
    class="conversation-jump"
    :class="{ unread }"
    type="button"
    :aria-label="label"
    :title="label"
    @click="$emit('jump', $event)"
  >
    <WorkspaceIcon name="arrow-down" :size="18" />
    <span v-if="unread">{{ zh ? '有新内容' : 'New updates' }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import WorkspaceIcon from './WorkspaceIcon.vue';

const props = defineProps<{ unread: boolean; zh: boolean }>();
defineEmits<{ jump: [event: MouseEvent] }>();
const label = computed(() => props.unread
  ? (props.zh ? '有新内容 · 回到底部' : 'New updates · Jump to latest')
  : (props.zh ? '回到底部' : 'Jump to latest'));
</script>

<style scoped>
.conversation-jump {
  position: absolute;
  z-index: 1;
  left: 50%;
  bottom: calc(100% + 10px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--surface-raised);
  color: var(--text);
  box-shadow: 0 2px 10px rgb(0 0 0 / 18%), 0 0 0 1px var(--border);
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transform: translateX(-50%);
}
.conversation-jump.unread {
  width: auto;
  gap: 8px;
  padding-inline: 13px;
  border-radius: 22px;
}
.conversation-jump:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
@media (hover: hover) and (pointer: fine) {
  .conversation-jump:hover { background: var(--surface-hover); }
}
</style>
