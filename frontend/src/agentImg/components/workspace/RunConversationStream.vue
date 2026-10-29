<template>
  <div class="run-conversation-stream">
    <section v-if="error" class="message-error" role="region" :aria-label="zh ? '消息读取提示' : 'Message loading notice'" :aria-busy="running">
      <WorkspaceIcon name="list" :size="16" />
      <div>
        <p class="message-error-title" role="status">{{ zh ? '部分消息暂时无法读取' : 'Some messages could not load' }}</p>
        <p>{{ zh ? '已显示的内容会保留。' : 'Visible content is kept.' }}</p>
        <button type="button" :aria-disabled="running" @click="retry"><WorkspaceIcon name="refresh" :size="16" />{{ running ? (zh ? '正在读取…' : 'Loading…') : (zh ? '重新读取消息' : 'Reload messages') }}</button>
      </div>
    </section>
    <template v-for="row in rows" :key="row.key"
      ><article v-if="row.kind === 'message'" class="timeline-message" :class="[row.message.role, { 'workspace-user-bubble': row.message.role === 'user' }]">
        <header>
          <span>{{ row.message.role === 'user' ? (zh ? '你' : 'You') : 'Artigen Agent' }}</span
          ><MessageTimestamp :value="row.message.createdAt" :zh="zh" />
          <button
            class="copy-message"
            type="button"
            :aria-label="copyLabel(row.message.id)"
            :title="copyLabel(row.message.id)"
            :disabled="copyState?.id === row.message.id && copyState.status === 'copying'"
            @click="copyMessage(row.message)"
          >
            <WorkspaceIcon :name="copyState?.id === row.message.id && copyState.status === 'copied' ? 'check' : 'copy'" />
          </button>
        </header>
        <WorkspaceMarkdown :text="row.message.text" :files="files" />
      </article>
      <AgentActivity
        v-else
        :events="row.events"
        :zh="zh"
        :terminal="terminal"
        :subagents="subagents"
        @layout-change="$emit('layout-change')"
    /></template>
    <span class="sr-only copy-announcement" aria-live="polite" aria-atomic="true">{{ copyAnnouncement }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { getCurrentUserId } from '@/login/session';
const WorkspaceMarkdown = defineAsyncComponent(() => import('./WorkspaceMarkdown.vue'));
import AgentActivity from './AgentActivity.vue';
import WorkspaceIcon from './WorkspaceIcon.vue';
import MessageTimestamp from './MessageTimestamp.vue';
import { buildAgentActivity } from '../../utils/agentActivity';
import {
  getRunMessages,
  type PublicMessage,
  type WorkspaceFile
} from '../../services/workspaceFiles';
import type { AgentEvent } from '../../services/agentRuns';
const props = defineProps<{
  runId: string;
  events: AgentEvent[];
  files: WorkspaceFile[];
  zh: boolean;
  terminal: boolean;
  subagents: Array<{ subagentId: string; label: string; ordinal: number }>;
}>();
const emit = defineEmits<{ 'layout-change': [] }>();
const messages = ref<PublicMessage[]>([]);
const error = ref(false);
const copyState = ref<{ id: string; status: 'copying' | 'copied' | 'failed' } | null>(null);
const copyAnnouncement = ref('');
let copyRevision = 0;
let copyTimer: number | null = null;
let revision = 0;
const running = ref(false);
let again = false;
type Row =
  | { kind: 'message'; key: string; message: PublicMessage; time: number }
  | { kind: 'activity'; key: string; events: AgentEvent[]; time: number };
const rows = computed<Row[]>(() => {
  const all: Row[] = messages.value.map((m) => ({
    kind: 'message',
    key: 'message:' + m.id,
    message: m,
    time: Date.parse(m.createdAt)
  }));
  for (const row of buildAgentActivity(props.events)) {
    const events = row.kind === 'tool' ? row.events : [row.event];
    all.push({ kind: 'activity', key: row.key, events, time: Date.parse(events[0].createdAt) });
  }
  all.sort((a, b) => a.time - b.time);
  const grouped: Row[] = [];
  for (const row of all) {
    const previous = grouped.at(-1);
    if (row.kind === 'activity' && previous?.kind === 'activity')
      previous.events.push(...row.events);
    else grouped.push(row.kind === 'activity' ? { ...row, events: [...row.events] } : row);
  }
  return grouped;
});
function copyLabel(messageId: string) {
  const state = copyState.value;
  if (state?.id !== messageId) return props.zh ? '复制消息' : 'Copy message';
  if (state.status === 'copying') return props.zh ? '正在复制消息' : 'Copying message';
  if (state.status === 'copied') return props.zh ? '已复制消息' : 'Message copied';
  return props.zh ? '复制失败，请重试' : 'Copy failed; try again';
}
async function copyMessage(message: PublicMessage) {
  const request = ++copyRevision;
  if (copyTimer !== null) window.clearTimeout(copyTimer);
  copyTimer = null;
  copyState.value = { id: message.id, status: 'copying' };
  try {
    await navigator.clipboard.writeText(message.text);
    if (request !== copyRevision) return;
    copyState.value = { id: message.id, status: 'copied' };
    copyAnnouncement.value = props.zh ? '消息已复制' : 'Message copied';
  } catch {
    if (request !== copyRevision) return;
    copyState.value = { id: message.id, status: 'failed' };
    copyAnnouncement.value = props.zh ? '复制失败，请检查剪贴板权限后重试' : 'Copy failed. Check clipboard access and try again.';
  }
  copyTimer = window.setTimeout(() => {
    if (request !== copyRevision) return;
    copyState.value = null;
    copyAnnouncement.value = '';
    copyTimer = null;
  }, 1800);
}
function clearCopyState() {
  copyRevision++;
  if (copyTimer !== null) window.clearTimeout(copyTimer);
  copyTimer = null;
  copyState.value = null;
  copyAnnouncement.value = '';
}
function retry() {
  if (running.value) return;
  void load();
}
async function load() {
  if (running.value) {
    again = true;
    return;
  }
  running.value = true;
  const ticket = revision;
  const id = props.runId;
  const owner = getCurrentUserId();
  try {
    let cursor = '';
    const loaded: PublicMessage[] = [];
    do {
      const page = await getRunMessages(id, cursor);
      if (ticket !== revision || id !== props.runId || owner !== getCurrentUserId()) return;
      loaded.push(...page.messages);
      cursor = page.nextCursor || '';
    } while (cursor);
    messages.value = [...new Map(loaded.map((m) => [m.id, m])).values()];
    error.value = false;
    emit('layout-change');
  } catch {
    if (ticket === revision) error.value = true;
  } finally {
    running.value = false;
    if (again) {
      again = false;
      void load();
    }
  }
}
watch(
  () => props.runId,
  () => {
    revision++;
    clearCopyState();
    messages.value = [];
    error.value = false;
    void load();
  },
  { immediate: true }
);
watch(
  () =>
    props.events
      .filter((e) => e.type === 'message.created' || e.type === 'run.input_received')
      .at(-1)?.eventId,
  () => void load()
);
const onAuth = () => {
  revision++;
  clearCopyState();
  messages.value = [];
  error.value = false;
  void load();
};
onMounted(() => window.addEventListener('app-auth-changed', onAuth));
onBeforeUnmount(() => {
  window.removeEventListener('app-auth-changed', onAuth);
  clearCopyState();
  revision++;
  again = false;
});
</script>
<style scoped>
.message-error { display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: start; gap: 10px; margin: 18px 0; padding: 14px; border-radius: 8px; background: var(--surface); }
.message-error > .workspace-icon { margin-top: 2px; color: var(--muted); }
.message-error > div { display: grid; min-width: 0; gap: 6px; }
.message-error p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.message-error .message-error-title { color: var(--text); font-weight: 600; }
.message-error button { display: inline-flex; align-items: center; justify-self: start; gap: 6px; min-height: 32px; margin-top: 4px; padding: 6px 10px; border: 0; border-radius: 6px; background: var(--surface-raised); color: var(--text); font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; }
.message-error button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.message-error button[aria-disabled="true"] { color: var(--muted); cursor: progress; }
@media (hover: hover) and (pointer: fine) { .message-error button:hover:not([aria-disabled="true"]) { background: var(--surface-hover); } }
@media (max-width: 799px), (pointer: coarse) { .message-error button { min-height: 44px; } }
.timeline-message {
  margin: 22px 0 28px;
  min-width: 0;
}
.timeline-message header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 10px;
}
.timeline-message header > span {
  color: var(--text);
  font-weight: 600;
}
.copy-message {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  margin-inline-start: auto;
  padding: 0;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
  transition: opacity 140ms ease, color 140ms ease, background 140ms ease;
}
.timeline-message:hover .copy-message,
.copy-message:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
.copy-message:hover { color: var(--text); background: var(--surface-hover); }
.copy-message:focus:not(:focus-visible) { outline: none; }
.copy-message:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.copy-message:disabled { cursor: progress; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.timeline-message.user {
  margin-left: auto;
  width: fit-content;
}
@media (max-width: 799px), (pointer: coarse) {
  .timeline-message button {
    min-height: 44px;
  }
  .copy-message {
    width: 44px;
    height: 44px;
    opacity: 1;
    pointer-events: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .copy-message { transition: none; }
}
</style>
