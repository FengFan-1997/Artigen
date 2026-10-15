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
  let revision = 0;
  const receive = (event: AgentEvent) => {
    if (!disposed) records[event.runId] = mergeAgentEvents(records[event.runId] || [], [event]);
  };
  const refresh = (runId: string): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending.has(runId)) return pending.get(runId)!;
    loading[runId] = !cursors.has(runId);
    const ticket = revision;
    const work = (async () => {
      try {
        let more = true;
        while (more && !disposed && ticket === revision) {
          const page = await listAgentEventHistory(runId, cursors.get(runId) || '0');
          if (disposed || ticket !== revision) return;
          records[runId] = mergeAgentEvents(records[runId] || [], page);
          if (page.length) cursors.set(runId, page[page.length - 1].eventId);
          else if (!cursors.has(runId)) cursors.set(runId, '0');
          more = page.length === 500;
        }
        if (ticket === revision) errors[runId] = false;
      } catch {
        if (!disposed && ticket === revision) errors[runId] = true;
      } finally {
        if (!disposed && ticket === revision) {
          loading[runId] = false;
          pending.delete(runId);
        }
      }
    })();
    pending.set(runId, work);
    return work;
  };
  onBeforeUnmount(() => {
    disposed = true;
  });
  const clear = () => {
    revision++;
    cursors.clear();
    pending.clear();
    for (const state of [records, loading, errors])
      Object.keys(state).forEach((key) => delete state[key]);
  };
  return { records, loading, errors, receive, refresh, clear };
};
