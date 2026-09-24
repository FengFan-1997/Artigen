import { describe, expect, it } from 'vitest';
import { conversationTimeline, eventText, mergeAgentEvents } from './agentTimeline';
import type { AgentEvent } from '../services/agentRuns';
const event = (id: string, type = 'step.recorded', data = {}): AgentEvent => ({ eventId: id, type, data, runId: 'test-run', subagentId: null, phase: 'running', summary: '公开动作摘要', createdAt: '2026-09-22T08:00:00Z' });
describe('durable conversation timeline', () => {
  it('merges replay and live events without duplicates or reversing large IDs', () => {
    const a = event('9007199254740992'), b = event('9007199254740993');
    expect(mergeAgentEvents([b], [a, b]).map((e) => e.eventId)).toEqual([a.eventId, b.eventId]);
  });
  it('keeps a full chronological history beyond the recent eight actions, but hides cost noise', () => {
    const events = Array.from({ length: 20 }, (_, i) => event(String(i + 1)));
    expect(conversationTimeline([...events.reverse(), event('21', 'cost.updated')])).toHaveLength(20);
    expect(conversationTimeline(events)[0].eventId).toBe('1');
  });
  it('keeps ignored plan updates visible so task recovery is transparent', () => {
    const ignored = event('22', 'plan.update.ignored');
    expect(conversationTimeline([ignored])).toEqual([ignored]);
  });
  it('renders the owned user message verbatim and supports older generic receipts', () => {
    expect(eventText(event('1', 'run.input_received', { messageText: '保留蓝色\n只修改标题' }))).toBe('保留蓝色\n只修改标题');
    expect(eventText(event('2', 'run.input_received'))).toBe('公开动作摘要');
  });
});
