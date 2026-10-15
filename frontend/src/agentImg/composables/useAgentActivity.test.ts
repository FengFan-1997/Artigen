import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAgentEventHistory, type AgentEvent } from '../services/agentRuns';
import { useAgentActivity } from './useAgentActivity';
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  onBeforeUnmount: vi.fn()
}));
vi.mock('../services/agentRuns', () => ({ listAgentEventHistory: vi.fn() }));
const event = (id: number, summary = `event ${id}`) =>
  ({
    eventId: String(id),
    runId: 'owned-run',
    type: 'assistant.message',
    summary,
    createdAt: '2026-10-15T00:00:00Z',
    data: {},
    subagentId: null
  }) as AgentEvent;
beforeEach(() => vi.resetAllMocks());
describe('durable activity isolation', () => {
  it('drains history with its own cursor even when a newer SSE event arrives first', async () => {
    vi.mocked(listAgentEventHistory)
      .mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => event(i + 1)))
      .mockResolvedValueOnce([event(501)]);
    const activity = useAgentActivity();
    activity.receive(event(1000));
    await activity.refresh('owned-run');
    expect(listAgentEventHistory).toHaveBeenNthCalledWith(1, 'owned-run', '0');
    expect(listAgentEventHistory).toHaveBeenNthCalledWith(2, 'owned-run', '500');
    expect(activity.records['owned-run']).toHaveLength(502);
    expect(activity.records['owned-run'].at(-1)?.eventId).toBe('1000');
  });
  it('clearing the owner scope rejects an old response without clearing the new in-flight request', async () => {
    let resolveOld!: (events: AgentEvent[]) => void;
    let resolveNew!: (events: AgentEvent[]) => void;
    vi.mocked(listAgentEventHistory)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveOld = r;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveNew = r;
          })
      );
    const activity = useAgentActivity();
    const old = activity.refresh('owned-run');
    activity.clear();
    const current = activity.refresh('owned-run');
    resolveOld([event(1, 'previous owner')]);
    await old;
    expect(activity.records['owned-run']).toBeUndefined();
    expect(activity.refresh('owned-run')).toBe(current);
    resolveNew([event(2, 'current owner')]);
    await current;
    expect(activity.records['owned-run'].map((e) => e.summary)).toEqual(['current owner']);
    expect(activity.loading['owned-run']).toBe(false);
  });
});
