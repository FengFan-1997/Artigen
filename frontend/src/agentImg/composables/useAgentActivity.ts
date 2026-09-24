import { onBeforeUnmount, reactive } from 'vue';
import { listAgentEventHistory, type AgentEvent } from '../services/agentRuns';
import { mergeAgentEvents } from '../domain/agentTimeline';

// The history cursor is independent of SSE: a live event must never skip an
// older page that is still loading. Reconnects and HTTP replay share event IDs.
export const useAgentActivity = () => {
  const records = reactive<Record<string, AgentEvent[]>>({});
  const loading = reactive<Record<string, boolean>>({});
  const errors = reactive<Record<string, boolean>>({});
  const cursors = new Map<string, string>();
  const pending = new Map<string, Promise<void>>();
  let disposed = false;
  const receive = (event: AgentEvent) => {
    if (!disposed) records[event.runId] = mergeAgentEvents(records[event.runId] || [], [event]);
  };
  const refresh = (runId: string): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending.has(runId)) return pending.get(runId)!;
    loading[runId] = !cursors.has(runId);
    const work = (async () => {
      try {
        let more = true;
        while (more && !disposed) {
          const page = await listAgentEventHistory(runId, cursors.get(runId) || '0');
          if (disposed) return;
          records[runId] = mergeAgentEvents(records[runId] || [], page);
          if (page.length) cursors.set(runId, page[page.length - 1].eventId);
          else if (!cursors.has(runId)) cursors.set(runId, '0');
          more = page.length === 500;
        }
        errors[runId] = false;
      } catch {
        if (!disposed) errors[runId] = true;
      } finally {
        if (!disposed) loading[runId] = false;
        pending.delete(runId);
      }
    })();
    pending.set(runId, work);
    return work;
  };
  onBeforeUnmount(() => { disposed = true; });
  return { records, loading, errors, receive, refresh };
};
