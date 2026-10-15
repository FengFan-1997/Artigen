import type { AgentEvent } from '../services/agentRuns';

const toolNames: Record<string, [string, string]> = {
  update_plan: ['制定执行计划', 'Update execution plan'],
  delegate_tasks: ['委派子任务', 'Delegate subtasks'],
  browser_dom: ['操作网页', 'Interact with a webpage'],
  generate_image: ['生成图片', 'Generate an image'],
  connector_request: ['连接外部服务', 'Use an external service'],
  sandbox_shell: ['执行离线命令', 'Run an offline command'],
  declare_artifact: ['登记交付文件', 'Register a deliverable'],
  request_user_approval: ['请求你的审批', 'Request your approval']
};
export const toolNameLabel = (name: string, zh: boolean) =>
  toolNames[name]?.[zh ? 0 : 1] || name || (zh ? '工具' : 'Tool');

export const isAgentActivity = (event: AgentEvent) =>
  event.type.startsWith('tool.call.') ||
  event.type === 'plan.compiled' ||
  event.type === 'context.compacted' ||
  event.type.startsWith('verification.') ||
  event.type.startsWith('budget.');

export type ToolActivity = {
  kind: 'tool';
  key: string;
  toolName: string;
  subagentId: string | null;
  events: AgentEvent[];
  started?: AgentEvent;
  completed?: AgentEvent;
};
export type AgentActivity = ToolActivity | { kind: 'event'; key: string; event: AgentEvent };

// This is a projection of the persisted events, not another lifecycle store.
// A call ID belongs to a run AND an executor. Missing IDs must never merge.
export function buildAgentActivity(events: readonly AgentEvent[]): AgentActivity[] {
  const rows: AgentActivity[] = [];
  const calls = new Map<string, ToolActivity>();
  for (const event of events) {
    if (!isAgentActivity(event)) continue;
    if (!['tool.call.started', 'tool.call.completed'].includes(event.type)) {
      rows.push({ kind: 'event', key: `event:${event.eventId}`, event });
      continue;
    }
    const id = typeof event.data?.callId === 'string' ? event.data.callId.trim() : '';
    const key = id
      ? JSON.stringify([event.runId, event.subagentId, id])
      : `unpaired:${event.eventId}`;
    let row = calls.get(key);
    if (!row) {
      row = {
        kind: 'tool',
        key,
        toolName: typeof event.data?.toolName === 'string' ? event.data.toolName : '',
        subagentId: event.subagentId,
        events: []
      };
      rows.push(row);
      calls.set(key, row);
    }
    if (row.events.some((item) => item.eventId === event.eventId)) continue;
    row.events.push(event);
    if (!row.toolName && typeof event.data?.toolName === 'string')
      row.toolName = event.data.toolName;
    if (event.type === 'tool.call.started') row.started ||= event;
    else row.completed = event;
  }
  return rows;
}

export const toolActivityStatus = (row: ToolActivity, terminal = false) => {
  if (!row.completed) return terminal ? 'unknown' : 'running';
  if (row.completed.data?.ok === true) return 'completed';
  if (row.completed.data?.ok === false) return 'failed';
  return 'unknown';
};

export function toolActivityDuration(row: ToolActivity) {
  if (!row.started || !row.completed) return null;
  const ms = Date.parse(row.completed.createdAt) - Date.parse(row.started.createdAt);
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null;
}

export function agentEventSummary(event: AgentEvent, zh: boolean) {
  if (!['tool.call.started', 'tool.call.completed'].includes(event.type)) return event.summary;
  const name = toolNameLabel(
    typeof event.data?.toolName === 'string' ? event.data.toolName : '',
    zh
  );
  if (event.type === 'tool.call.started') return zh ? `正在调用：${name}` : `Calling: ${name}`;
  if (event.data?.ok === true) return zh ? `调用成功：${name}` : `Completed: ${name}`;
  if (event.data?.ok === false) return zh ? `调用失败：${name}` : `Failed: ${name}`;
  return zh ? `调用结果待确认：${name}` : `Result unconfirmed: ${name}`;
}
