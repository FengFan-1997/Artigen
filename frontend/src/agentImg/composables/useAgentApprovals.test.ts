import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { approvalIsAvailable, useAgentApprovals } from './useAgentApprovals';
import type { AgentApproval } from '../services/agentRuns';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T08:00:00Z'));
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const pending = (expiry: number): AgentApproval => ({
  approvalId: 'fixture-approval',
  actionType: 'publish',
  recipient: 'https://example.invalid',
  riskLevel: 'high',
  changeSummary: 'Publish',
  evidenceSummary: '',
  impactSummary: '',
  rollbackSummary: '',
  status: 'pending',
  expiresAt: new Date(expiry).toISOString(),
  createdAt: new Date().toISOString(),
  decidedAt: null
});

it('expires the visible approval without waiting for another API response', async () => {
  const source = ref([pending(Date.now() + 1000)]);
  const scope = effectScope();
  const state = scope.run(() => useAgentApprovals(() => source.value))!;
  expect(state.pendingApprovals.value).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1001);
  expect(state.pendingApprovals.value).toHaveLength(0);
  expect(state.expiredApprovals.value).toHaveLength(1);
  expect(approvalIsAvailable(source.value[0]!)).toBe(false);
  scope.stop();
});

it('reschedules changed expiry and clears its timer when the page leaves', async () => {
  const source = ref([pending(Date.now() + 1000)]);
  const scope = effectScope();
  const state = scope.run(() => useAgentApprovals(() => source.value))!;
  source.value = [pending(Date.now() + 5000)];
  await vi.advanceTimersByTimeAsync(1100);
  expect(state.pendingApprovals.value).toHaveLength(1);
  scope.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it('refuses invalid deadlines and already decided approvals', () => {
  expect(approvalIsAvailable({ ...pending(Date.now() + 1000), expiresAt: 'invalid' })).toBe(false);
  expect(approvalIsAvailable({ ...pending(Date.now() + 1000), status: 'approved' })).toBe(false);
});
