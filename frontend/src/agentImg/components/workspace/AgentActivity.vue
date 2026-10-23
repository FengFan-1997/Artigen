<template>
  <details v-if="rows.length" class="agent-activity" @toggle="emit('layout-change')">
    <summary>
      <WorkspaceIcon name="terminal" :size="18" />
      <span class="activity-heading"><b>{{ zh ? '执行记录' : 'Activity' }}</b><small>{{ zh ? `${calls.length} 次工具调用` : `${calls.length} tool calls` }}<template v-if="updates"> · {{ zh ? `${updates} 条过程更新` : `${updates} updates` }}</template></small></span>
      <span v-if="failed" class="failed-count">{{ zh ? `${failed} 次调用失败` : `${failed} failed calls` }}</span>
      <WorkspaceIcon class="disclosure-icon" name="chevron-down" />
    </summary>
    <ol class="activity-list">
      <li v-for="row in rows" :key="row.key">
        <details v-if="row.kind === 'tool'" class="tool-call" :data-state="toolActivityStatus(row, terminal)" @toggle="emit('layout-change')">
          <summary>
            <WorkspaceIcon :name="row.toolName === 'sandbox_shell' ? 'terminal' : row.toolName === 'browser_dom' ? 'monitor' : 'tools'" />
            <span class="tool-title"><b>{{ toolNameLabel(row.toolName, zh) }}</b><small v-if="row.subagentId">{{ executorLabel(row.subagentId) }}</small></span>
            <span class="tool-result">{{ statusLabel(toolActivityStatus(row, terminal)) }}</span>
            <time v-if="toolActivityDuration(row) !== null" class="duration">{{ toolActivityDuration(row)!.toFixed(1) }} s</time>
            <WorkspaceIcon class="disclosure-icon" name="chevron-down" :size="14" />
          </summary>
          <div class="call-evidence">
            <p v-if="typeof row.events[0]?.data?.callId === 'string'" class="call-id"><b>{{ zh ? '调用 ID' : 'Call ID' }}</b><code>{{ row.events[0].data.callId }}</code></p>
            <div v-for="event in row.events" :key="event.eventId" class="call-event">
              <time :datetime="event.createdAt">{{ formatTime(event.createdAt) }}</time>
              <span>{{ agentEventSummary(event, zh) }}</span><small>#{{ event.eventId }}</small>
            </div>
            <p v-if="!row.started || !row.completed" class="missing-receipt">{{ zh ? '当前只有部分回执；不会推测未收到的结果。' : 'Only partial receipts are available; missing results are not inferred.' }}</p>
          </div>
        </details>
        <div v-else class="context-update">
          <WorkspaceIcon :name="row.event.type === 'context.compacted' ? 'list' : 'file'" />
          <span><b>{{ eventLabel(row.event.type) }}</b><small>{{ row.event.summary }}</small></span>
          <time :datetime="row.event.createdAt">{{ formatTime(row.event.createdAt) }}</time>
        </div>
      </li>
    </ol>
    <p class="audit-location">{{ zh ? '完整事件保留在检查器的「计划 → 审计记录」。' : 'All events remain in the inspector under Plan → Audit log.' }}</p>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import WorkspaceIcon from './WorkspaceIcon.vue';
import type { AgentEvent } from '../../services/agentRuns';
import { agentEventSummary, buildAgentActivity, toolActivityDuration, toolActivityStatus, toolNameLabel } from '../../utils/agentActivity';

const props = defineProps<{ events: AgentEvent[]; zh: boolean; terminal: boolean; subagents: Array<{ subagentId: string; label: string; ordinal: number }> }>();
const emit = defineEmits<{ 'layout-change': [] }>();
const rows = computed(() => buildAgentActivity(props.events));
const calls = computed(() => rows.value.filter(row => row.kind === 'tool'));
const updates = computed(() => rows.value.length - calls.value.length);
const failed = computed(() => calls.value.filter(row => toolActivityStatus(row, props.terminal) === 'failed').length);
const executorLabel = (id: string) => {
  const agent = props.subagents.find(item => item.subagentId === id);
  return agent?.label || (props.zh ? `子 Agent${agent ? ` ${agent.ordinal}` : ''}` : `Subagent${agent ? ` ${agent.ordinal}` : ''}`);
};
const statusLabel = (status: ReturnType<typeof toolActivityStatus>) => ({
  running: props.zh ? '正在调用' : 'Running', completed: props.zh ? '已完成' : 'Completed',
  failed: props.zh ? '调用失败' : 'Failed', unknown: props.zh ? '结果待确认' : 'Unconfirmed'
})[status];
const eventLabel = (type: string) => {
  const names: Record<string, [string, string]> = {
    'plan.compiled': ['执行计划已更新', 'Plan updated'], 'context.compacted': ['上下文已整理', 'Context organized'],
    'verification.started': ['开始验证', 'Verification started'], 'verification.passed': ['验证通过', 'Verification passed'],
    'verification.failed': ['验证未通过', 'Verification failed'], 'verification.repair_requested': ['正在定向修复', 'Targeted repair'],
    'budget.warning': ['预算范围已收紧', 'Budget tightened'], 'budget.lockdown': ['仅继续验证与交付', 'Verification and delivery only'],
    'tool.call.ambiguous': ['调用结果待确认', 'Call result unconfirmed']
  };
  return names[type]?.[props.zh ? 0 : 1] || type;
};
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(props.zh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date) : '—';
};
</script>

<style scoped>
.agent-activity { margin: 22px 0 26px 41px; color: var(--text); }
summary { display: flex; align-items: center; min-width: 0; gap: 10px; min-height: 44px; cursor: pointer; list-style: none; border-radius: 8px; }
summary::-webkit-details-marker { display: none; }
summary:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.agent-activity > summary { padding: 9px 10px; background: var(--surface); }
.activity-heading { display: flex; flex: 1; flex-wrap: wrap; min-width: 0; align-items: baseline; gap: 4px 12px; }
b { font-size: 13px; font-weight: 580; }
small,time,.tool-result,.audit-location,.missing-receipt { color: var(--muted); font-size: 12px; line-height: 1.5; }
.failed-count { color: var(--danger); font-size: 12px; }
.disclosure-icon { color: var(--muted); }
details[open] > summary > .disclosure-icon { transform: rotate(180deg); }
.activity-list { margin: 10px 0 0; padding: 0; list-style: none; }
.activity-list > li { min-width: 0; }
.tool-call > summary { padding: 9px 10px; }
.tool-call > summary:hover { background: var(--surface); }
.tool-title { display: flex; flex: 1; flex-wrap: wrap; min-width: 0; gap: 4px 10px; align-items: baseline; overflow-wrap: anywhere; }
.tool-result { flex: none; }
.tool-call[data-state="failed"] .tool-result { color: var(--danger); }
.tool-call[data-state="running"] .tool-result { color: var(--acid-text); }
.duration { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
.call-evidence { display: grid; gap: 8px; padding: 7px 10px 16px 36px; }
.call-id { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 0; }
.call-id b { color: var(--muted); font-size: 12px; }
code { font-size: 12px; overflow-wrap: anywhere; }
.call-event { display: grid; grid-template-columns: 68px minmax(0,1fr) auto; align-items: start; gap: 8px; font-size: 12px; overflow-wrap: anywhere; }
.call-event > time { white-space: nowrap; font-variant-numeric: tabular-nums; }
.call-event > small { justify-self: end; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.5; white-space: nowrap; font-variant-numeric: tabular-nums; }
.missing-receipt,.audit-location { margin: 0; }
.audit-location { padding: 12px 10px 0; }
.context-update { display: flex; min-width: 0; gap: 10px; align-items: flex-start; padding: 13px 10px; }
.context-update > span { display: grid; flex: 1; min-width: 0; gap: 3px; overflow-wrap: anywhere; }
.context-update > time { flex: none; font-variant-numeric: tabular-nums; }
@media (max-width: 799px) {
  .agent-activity { margin-left: 0; }
  .activity-heading { display: grid; }
  .failed-count { max-width: 70px; }
  .tool-call > summary { gap: 7px; }
  .duration { display: none; }
  .call-evidence { padding-left: 10px; }
  .call-event { grid-template-columns: 56px minmax(0,1fr) auto; gap: 6px; font-size: 11px; }
}
</style>
