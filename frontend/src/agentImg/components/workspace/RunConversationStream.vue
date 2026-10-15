<template>
  <div class="run-conversation-stream">
    <p v-if="error" class="message-error" role="status">
      {{ zh ? '部分消息暂时无法读取。' : 'Some messages could not load.' }}
      <button @click="load">{{ zh ? '重试' : 'Retry' }}</button>
    </p>
    <AgentConversationTimeline v-if="legacyEvents.length" :events="legacyEvents" :zh="zh" />
    <template v-for="row in rows" :key="row.key"
      ><article v-if="row.kind === 'message'" class="timeline-message" :class="row.message.role">
        <header>
          <span>{{ row.message.role === 'user' ? (zh ? '你' : 'You') : 'Artigen Agent' }}</span
          ><time>{{
            new Date(row.message.createdAt).toLocaleTimeString(zh ? 'zh-CN' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })
          }}</time>
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
  </div>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { getCurrentUserId } from '@/login/session';
const WorkspaceMarkdown = defineAsyncComponent(() => import('./WorkspaceMarkdown.vue'));
import AgentActivity from './AgentActivity.vue';
import AgentConversationTimeline from './AgentConversationTimeline.vue';
import { eventText } from '../../domain/agentTimeline';
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
// Deployed pre-workspace runs persist public commentary and inputs as events.
// Keep that real history until it has a matching canonical message; never invent a body.
const legacyEvents = computed(() => {
  const firstModernTool = props.events.find((event) => event.type.startsWith('tool.call.'));
  return props.events.filter((event) => {
    if (event.type === 'step.recorded')
      return !firstModernTool || event.createdAt < firstModernTool.createdAt;
    if (!['assistant.message', 'run.input_received', 'context.input_applied'].includes(event.type))
      return false;
    if (event.type === 'context.input_applied') return true;
    const text = eventText(event).trim();
    const role = event.type === 'run.input_received' ? 'user' : 'assistant';
    return !messages.value.some(
      (message) =>
        message.role === role &&
        Math.abs(Date.parse(message.createdAt) - Date.parse(event.createdAt)) < 3000 &&
        message.text.trim().startsWith(text)
    );
  });
});
let revision = 0;
let running = false;
let again = false;
type Row =
  | { kind: 'message'; key: string; message: PublicMessage; time: number }
  | { kind: 'activity'; key: string; events: AgentEvent[]; time: number };
const rows = computed<Row[]>(() => {
  const visibleMessages = messages.value.filter((message, index, all) => {
    const next = all[index + 1];
    return !(message.kind === 'commentary' && next?.kind === 'final' &&
      message.role === next.role && message.text === next.text);
  });
  const all: Row[] = visibleMessages.map((m) => ({
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
async function load() {
  if (running) {
    again = true;
    return;
  }
  running = true;
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
    running = false;
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
  messages.value = [];
  error.value = false;
  void load();
};
onMounted(() => window.addEventListener('app-auth-changed', onAuth));
onBeforeUnmount(() => {
  window.removeEventListener('app-auth-changed', onAuth);
  revision++;
  again = false;
});
</script>
<style scoped>
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
.timeline-message.user {
  margin-left: auto;
  width: fit-content;
  max-width: min(100%, 640px);
  padding: 14px 18px;
  background: var(--surface);
  border-radius: 16px;
}
.message-error {
  font-size: 12px;
  color: var(--muted);
}
.message-error button {
  background: transparent;
  color: var(--text);
  border: 0;
  text-decoration: underline;
  cursor: pointer;
}
@media (max-width: 799px) {
  .timeline-message.user {
    max-width: 100%;
    padding: 12px;
  }
  .timeline-message button {
    min-height: 44px;
  }
}
</style>
