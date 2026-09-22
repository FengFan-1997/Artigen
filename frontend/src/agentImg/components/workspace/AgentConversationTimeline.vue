<template>
  <section class="agent-timeline" :aria-label="zh ? '协作记录' : 'Conversation activity'">
    <template v-for="event in timeline" :key="`${event.runId}:${event.eventId}`">
      <details v-if="event.type === 'step.recorded'" class="tool-entry" :class="{ failed: event.data.status === 'failed' }">
        <summary>
          <WorkspaceIcon name="tools" :size="16" />
          <span>{{ toolLabel(event.data.toolName, zh) }}</span>
          <span class="tool-purpose">{{ event.summary }}</span>
          <small>{{ resultLabel(event.data.status) }}</small>
        </summary>
        <div class="tool-detail">
          <p>{{ event.summary }}</p>
          <dl>
            <div><dt>{{ zh ? '工具' : 'Tool' }}</dt><dd>{{ event.data.toolName || '—' }}</dd></div>
            <div><dt>{{ zh ? '结果' : 'Result' }}</dt><dd>{{ resultLabel(event.data.status) }}</dd></div>
            <div><dt>{{ zh ? '时间' : 'Time' }}</dt><dd>{{ formatTime(event.createdAt) }}</dd></div>
          </dl>
        </div>
      </details>
      <article v-else class="timeline-message" :class="{ user: event.type === 'run.input_received', commentary: event.type === 'assistant.message' }">
        <header>
          <span>{{ event.type === 'run.input_received' ? (zh ? '你' : 'You') : event.subagentId ? (zh ? '子 Agent' : 'Subagent') : 'Artigen Agent' }}</span>
          <time :datetime="event.createdAt">{{ formatTime(event.createdAt) }}</time>
          <small v-if="event.type === 'assistant.message'">{{ zh ? '进展' : 'Update' }}</small>
        </header>
        <p>{{ eventText(event) }}</p>
      </article>
    </template>
    <p v-if="loading" class="history-note" role="status">{{ zh ? '正在恢复过程记录…' : 'Restoring activity…' }}</p>
    <p v-if="error" class="history-note" role="status">{{ zh ? '过程记录暂未同步完整，正在重连；已显示的记录会保留。' : 'Some activity is not synced yet. Reconnecting; existing records are preserved.' }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import WorkspaceIcon from './WorkspaceIcon.vue';
import { conversationTimeline, eventText, toolLabel } from '../../domain/agentTimeline';
import type { AgentEvent } from '../../services/agentRuns';
const props = defineProps<{ events: AgentEvent[]; zh: boolean; loading?: boolean; error?: boolean }>();
const timeline = computed(() => conversationTimeline(props.events));
const formatTime = (value: string) => new Date(value).toLocaleTimeString(props.zh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
const resultLabel = (status: unknown) => ({
  succeeded: props.zh ? '已完成' : 'Completed', failed: props.zh ? '失败' : 'Failed',
  skipped: props.zh ? '已跳过' : 'Skipped', running: props.zh ? '执行中' : 'Running',
  pending: props.zh ? '等待执行' : 'Pending'
}[String(status)] || (props.zh ? '已记录' : 'Recorded'));
</script>

<style scoped>
.agent-timeline { display: grid; gap: 20px; min-width: 0; margin: 24px 0; color: var(--text); }
.timeline-message { min-width: 0; }
.timeline-message header { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 12px; }
.timeline-message header span { font-weight: 650; }
.timeline-message p { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; line-height: 1.85; }
.timeline-message.user { padding: 14px 18px; border-radius: 14px; background: var(--surface); }
.tool-entry { color: var(--muted); font-size: 12px; min-width: 0; }
.tool-entry summary { display: flex; gap: 10px; align-items: center; cursor: pointer; padding: 8px 0; list-style: none; }
.tool-entry summary::-webkit-details-marker { display: none; }
.tool-entry summary::after { content: '›'; font-size: 18px; }
.tool-entry[open] summary::after { transform: rotate(90deg); }
.tool-entry summary:focus-visible { outline: 2px solid var(--acid-text); outline-offset: 4px; border-radius: 3px; }
.tool-entry summary > span:first-of-type { flex-shrink: 0; color: var(--text); }
.tool-purpose { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.tool-entry summary small { flex-shrink: 0; }
.tool-detail { margin: 6px 0 0 25px; padding: 12px 16px; border-left: 1px solid var(--border); background: var(--surface); overflow-wrap: anywhere; }
.tool-detail p { margin: 0 0 12px; white-space: pre-wrap; line-height: 1.7; }
.tool-detail dl { display: grid; gap: 7px; margin: 0; }
.tool-detail dl div { display: flex; gap: 16px; }
.tool-detail dt { min-width: 40px; }
.tool-detail dd { margin: 0; color: var(--text); }
.tool-entry.failed summary small { color: var(--danger, #f08b8b); }
.history-note { margin: 0; font-size: 12px; color: var(--muted); }
@media (max-width: 600px) { .tool-purpose { display: none; } .tool-entry summary > span:first-of-type { flex: 1; } .timeline-message p { font-size: 15px; } }
</style>
