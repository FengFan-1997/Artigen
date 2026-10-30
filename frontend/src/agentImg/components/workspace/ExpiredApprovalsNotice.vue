<template>
  <section v-if="count" class="approval-expired" role="region" :aria-label="zh ? '过期审批' : 'Expired approvals'" :aria-busy="busy">
    <WorkspaceIcon name="list" :size="16" />
    <div class="notice-content">
      <b>{{ zh ? `${count} 项审批已过期` : `${count} approval${count === 1 ? '' : 's'} expired` }}</b>
      <p role="status">{{ zh ? '这些审批已无法批准。读取任务的最新状态，查看是否需要新的审批。' : 'These approvals can no longer be granted. Check the current task status for any new approvals.' }}</p>
      <p v-if="error && !busy" role="alert">{{ error }}</p>
      <div v-if="$slots.actions" class="notice-actions"><slot name="actions" /></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import WorkspaceIcon from './WorkspaceIcon.vue';
withDefaults(defineProps<{ count: number; zh: boolean; busy?: boolean; error?: string }>(), { busy: false, error: '' });
</script>

<style scoped>
.approval-expired { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 10px; margin: 18px 0; padding: 14px; border-radius: 8px; background: var(--surface); color: var(--text); }
.approval-expired > svg { margin-top: 2px; color: var(--muted); }
.notice-content { min-width: 0; }
b { font-size: 13px; font-weight: 600; line-height: 20px; }
p { margin: 4px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
p[role="alert"] { margin-top: 8px; color: var(--text); }
.notice-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
:slotted(button), :slotted(a) { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; max-width: 100%; padding: 6px 10px; border: 0; border-radius: 6px; background: var(--surface-raised); color: var(--text); font: inherit; font-size: 13px; line-height: 20px; text-decoration: none; cursor: pointer; }
:slotted(button:disabled) { cursor: wait; opacity: .65; }
:slotted(button:focus-visible), :slotted(a:focus-visible) { outline: 2px solid var(--focus); outline-offset: 3px; }
@media (hover: hover) and (pointer: fine) { :slotted(button:not(:disabled):hover), :slotted(a:hover) { background: var(--surface-hover); } }
@media (pointer: coarse), (max-width: 799px) { :slotted(button), :slotted(a) { min-height: 44px; } }
</style>
