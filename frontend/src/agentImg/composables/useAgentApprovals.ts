import { computed, onScopeDispose, ref, watch } from 'vue';
import type { AgentApproval } from '../services/agentRuns';

export const approvalIsAvailable = (approval: AgentApproval, now = Date.now()) =>
  approval.status === 'pending' && new Date(approval.expiresAt).getTime() > now;

export function useAgentApprovals(source: () => AgentApproval[]) {
  const now = ref(Date.now());
  let expiryTimer: number | null = null;
  const update = () => {
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    expiryTimer = null;
    now.value = Date.now();
    const future = source()
      .filter((item) => approvalIsAvailable(item, now.value))
      .map((item) => new Date(item.expiresAt).getTime());
    if (future.length) {
      expiryTimer = window.setTimeout(
        update,
        Math.min(2_147_483_647, Math.max(1, Math.min(...future) - now.value + 1))
      );
    }
  };
  watch(
    () =>
      source()
        .map((item) => `${item.approvalId}:${item.status}:${item.expiresAt}`)
        .join('|'),
    update,
    { immediate: true }
  );
  onScopeDispose(() => {
    if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  });
  return {
    pendingApprovals: computed(() =>
      source().filter((item) => approvalIsAvailable(item, now.value))
    ),
    expiredApprovals: computed(() =>
      source().filter(
        (item) =>
          item.status === 'expired' ||
          (item.status === 'pending' && !approvalIsAvailable(item, now.value))
      )
    )
  };
}
