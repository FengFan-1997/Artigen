import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../services/agentRuns';
import {
  agentEventSummary,
  buildAgentActivity,
  toolActivityDuration,
  toolActivityStatus,
  type ToolActivity
} from './agentActivity';

const event = (
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  extra: Partial<AgentEvent> = {}
): AgentEvent => ({
  eventId: id,
  runId: 'run-a',
  subagentId: null,
  type,
  phase: 'production',
  summary: 'Public summary',
  data,
  createdAt: `2026-10-15T03:00:0${id}.000Z`,
  ...extra
});
const call = (events: AgentEvent[]) => buildAgentActivity(events)[0] as ToolActivity;

describe('persisted activity projection', () => {
  it('pairs a started/completed call around other context events without dropping receipts', () => {
    const rows = buildAgentActivity([
      event('1', 'tool.call.started', { callId: 'a', toolName: 'browser_dom' }),
      event('2', 'context.compacted'),
      event('3', 'tool.call.completed', { callId: 'a', toolName: 'browser_dom', ok: true })
    ]);
    expect(rows).toHaveLength(2);
    expect((rows[0] as ToolActivity).events.map((item) => item.eventId)).toEqual(['1', '3']);
    expect(toolActivityStatus(rows[0] as ToolActivity)).toBe('completed');
    expect(rows[1].kind).toBe('event');
  });
  it('isolates equal call IDs across executors and runs', () => {
    expect(
      buildAgentActivity([
        event('1', 'tool.call.started', { callId: 'same' }),
        event('2', 'tool.call.completed', { callId: 'same' }, { subagentId: 'child' }),
        event('3', 'tool.call.completed', { callId: 'same' }, { runId: 'run-b' })
      ])
    ).toHaveLength(3);
  });
  it('does not guess a pairing from tool names when IDs are missing', () => {
    expect(
      buildAgentActivity([
        event('1', 'tool.call.started', { toolName: 'browser_dom' }),
        event('2', 'tool.call.completed', { toolName: 'browser_dom', ok: true })
      ])
    ).toHaveLength(2);
  });
  it('handles a completion received first and ignores replayed copies', () => {
    const completed = event('2', 'tool.call.completed', {
      callId: 'a',
      toolName: 'browser_dom',
      ok: true
    });
    const row = call([completed, event('1', 'tool.call.started', { callId: 'a' }), completed]);
    expect(row.events).toHaveLength(2);
    expect(row.toolName).toBe('browser_dom');
    expect(toolActivityDuration(row)).toBe(1);
  });
  it('requires a boolean receipt for success/failure and marks a terminal missing result unknown', () => {
    expect(toolActivityStatus(call([event('1', 'tool.call.started', { callId: 'a' })]))).toBe(
      'running'
    );
    expect(toolActivityStatus(call([event('1', 'tool.call.started', { callId: 'a' })]), true)).toBe(
      'unknown'
    );
    for (const ok of [undefined, null, 'false', 0])
      expect(toolActivityStatus(call([event('1', 'tool.call.completed', { ok })]))).toBe('unknown');
    expect(toolActivityStatus(call([event('1', 'tool.call.completed', { ok: false })]))).toBe(
      'failed'
    );
  });
  it('never infers a negative or invalid duration', () => {
    const rows = [
      event('2', 'tool.call.started', { callId: 'a' }),
      event('1', 'tool.call.completed', { callId: 'a' })
    ];
    expect(toolActivityDuration(call(rows))).toBeNull();
    expect(toolActivityDuration(call([event('1', 'tool.call.started')]))).toBeNull();
  });
  it('excludes user and final-answer events from process groups', () => {
    expect(
      buildAgentActivity([
        event('1', 'run.input_received'),
        event('2', 'run.succeeded'),
        event('3', 'approval.approved')
      ])
    ).toEqual([]);
  });
  it('only derives a public label and never prints arguments or tool output', () => {
    const e = event('1', 'tool.call.completed', {
      toolName: 'browser_dom',
      arguments: 'PRIVATE_TEST_MARKER',
      output: 'PRIVATE_TEST_MARKER'
    });
    expect(agentEventSummary(e, true)).toBe('调用结果待确认：操作网页');
    expect(agentEventSummary(e, false)).not.toContain('PRIVATE_TEST_MARKER');
  });
  it('tolerates a legacy event without a data object', () => {
    const e = event('1', 'tool.call.completed', null as unknown as Record<string, unknown>);
    expect(toolActivityStatus(call([e]))).toBe('unknown');
    expect(agentEventSummary(e, true)).toBe('调用结果待确认：工具');
  });
});
