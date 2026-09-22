import type { AgentEvent } from '../services/agentRuns';

export const mergeAgentEvents = (current: AgentEvent[], incoming: AgentEvent[]) => {
  const byId = new Map(current.map((event) => [event.eventId, event]));
  for (const event of incoming) byId.set(event.eventId, event);
  return [...byId.values()].sort((a, b) => {
    if (/^\d+$/.test(a.eventId) && /^\d+$/.test(b.eventId)) {
      return BigInt(a.eventId) < BigInt(b.eventId) ? -1 : BigInt(a.eventId) > BigInt(b.eventId) ? 1 : 0;
    }
    return a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId);
  });
};

const visibleTypes = new Set([
  'assistant.message', 'step.recorded', 'run.queued', 'run.provisioning', 'sandbox.ready',
  'sandbox.resumed', 'artifact.created', 'run.input_received', 'context.input_applied',
  'context.compacted', 'plan.updated', 'approval.required', 'approval.approved', 'approval.denied',
  'takeover.required', 'takeover.ended', 'run.pause_requested', 'run.paused', 'run.resumed',
  'run.recovered', 'run.verifying', 'run.succeeded', 'run.failed', 'run.cancelled', 'run.input_required',
  'subagent.created', 'subagent.started', 'subagent.progress', 'subagent.succeeded', 'subagent.failed', 'subagent.cancelled'
]);
export const conversationTimeline = (events: AgentEvent[]) => mergeAgentEvents([], events)
  .filter((event) => visibleTypes.has(event.type));

export const toolLabel = (name: unknown, zh: boolean) => {
  const labels: Record<string, [string, string]> = {
    update_plan: ['更新计划', 'Update plan'], sandbox_shell: ['运行命令', 'Run command'],
    browser: ['操作网页', 'Use browser'], browser_action: ['操作网页', 'Use browser'],
    generate_image: ['生成图片', 'Generate image'], declare_artifact: ['登记文件', 'Register file'],
    verify_artifact: ['验证文件', 'Verify file'], connector: ['调用连接器', 'Use connector'],
    delegate_tasks: ['分配子任务', 'Delegate tasks']
  };
  return labels[String(name)]?.[zh ? 0 : 1] || (zh ? '调用工具' : 'Use tool');
};
export const eventText = (event: AgentEvent) =>
  typeof event.data.messageText === 'string' ? event.data.messageText : event.summary;
