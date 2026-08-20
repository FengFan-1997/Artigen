<template>
  <article class="execution-card" :class="[`route-${execution.routeKind}`, `status-${displayStatus}`]">
    <header>
      <div class="executor-icon">
        <WorkspaceIcon v-if="execution.routeKind === 'agent_run'" name="agent" />
        <WorkspaceIcon v-else-if="execution.routeKind === 'local_tool'" name="tools" />
        <WorkspaceIcon v-else name="image" />
      </div>
      <div>
        <p>{{ executorLabel }}</p>
        <h3>{{ execution.plan.label || executorLabel }}</h3>
      </div>
      <span class="status-chip" role="status" aria-live="polite"><i></i>{{ statusLabel }}</span>
    </header>

    <div class="execution-body">
      <div class="execution-meta" aria-live="polite" aria-atomic="true">
        <span v-if="execution.quotedCredits !== null"><b>{{ zh ? '报价' : 'Quote' }}</b>{{ execution.quotedCredits }} {{ zh ? '点' : 'credits' }}</span>
        <span v-if="run"><b>{{ zh ? '已用' : 'Used' }}</b>{{ run.budget.used }} {{ zh ? '点' : 'credits' }}</span>
      </div>

      <div v-if="execution.routeKind === 'local_tool'" class="local-note">
        <b>{{ zh ? '文件不会上传' : 'Files stay local' }}</b>
        <span>{{ zh ? '点击后通过 5 分钟、单次使用的浏览器内 handoff 打开准确工具。' : 'A five-minute, one-time browser handoff opens the exact tool.' }}</span>
      </div>

      <div v-if="execution.status === 'waiting_upload' && !execution.toolTaskId && !execution.agentRunId" class="upload-note">
        <b>{{ zh ? '需要文件才能继续' : 'A file is required' }}</b>
        <span>{{ zh ? '现在选择后，只有这个云端任务需要的文件才会上传。' : 'Choose it now; only files needed by this cloud execution will upload.' }}</span>
      </div>

      <div v-if="execution.status === 'waiting_budget'" class="budget-block">
        <div>
          <b>{{ budgetTitle }}</b>
          <span>{{ budgetDescription }}</span>
        </div>
        <router-link to="/artigen/market">{{ zh ? '充值' : 'Add credits' }}</router-link>
      </div>

      <div v-if="displayStatus === 'failed'" class="failure-block" role="alert">
        <b>{{ zh ? `任务未完成 · ${failureCode}` : `Execution failed · ${failureCode}` }}</b>
        <span>{{ failureFinancialNote }}</span>
        <span>{{ zh ? '根据失败原因修改要求或附件，再从下方输入框重新发送。' : 'Adjust the request or attachments using this reason, then send again from the composer.' }}</span>
      </div>

      <div v-if="task?.status === 'success' && task.assets.length" class="deliverables">
        <p>{{ zh ? '生成结果' : 'Generated result' }}</p>
        <a v-for="asset in task.assets" :key="asset.assetId" :href="taskAssetUrl(asset.assetId)" target="_blank" rel="noopener">
          <img v-if="asset.mimeType.startsWith('image/')" :src="taskAssetUrl(asset.assetId)" alt="Generated design" width="64" height="56" loading="lazy" />
          <span>{{ zh ? '打开设计结果' : 'Open design result' }}</span>
        </a>
      </div>

      <div v-if="run?.artifacts?.length" class="deliverables agent-deliverables">
        <p>{{ zh ? '已验证交付物' : 'Verified deliverables' }}</p>
        <a v-for="artifact in run.artifacts" :key="artifact.artifactId" :href="agentAssetUrl(artifact)" target="_blank" rel="noopener">
          <img v-if="artifact.mimeType.startsWith('image/')" :src="agentAssetUrl(artifact)" :alt="artifact.filename" width="64" height="56" loading="lazy" />
          <span>
            <b>{{ artifact.filename }}</b>
            <small>{{ artifact.verificationStatus === 'passed' ? (zh ? '验证通过' : 'Verified') : artifact.verificationStatus }}</small>
          </span>
        </a>
      </div>

      <div v-if="pendingApprovals.length" class="approval-list" aria-live="assertive">
        <div v-for="approval in pendingApprovals" :key="approval.approvalId" class="approval-card">
          <span class="approval-kicker">{{ approval.riskLevel === 'blocked' ? (zh ? '需要接管' : 'Takeover required') : (zh ? '外部写操作' : 'External write') }}</span>
          <h4>{{ approval.changeSummary || actionLabel(approval.actionType) }}</h4>
          <p>{{ approval.impactSummary }}</p>
          <small>{{ approval.recipient }}</small>
          <p v-if="canAuthorizeSession(approval)" class="authorization-scope">
            {{ authorizationScope(approval) }}
          </p>
          <div v-if="approval.riskLevel !== 'blocked'" class="approval-actions">
            <button type="button" @click="emit('approve', approval)">{{ zh ? '仅批准这一次' : 'Approve once' }}</button>
            <button v-if="canAuthorizeSession(approval)" class="session" type="button" @click="emit('authorize', approval)">{{ authorizationButtonLabel(approval) }}</button>
            <button class="deny" type="button" @click="emit('deny', approval)">{{ zh ? '拒绝' : 'Deny' }}</button>
          </div>
          <router-link v-else :to="`/artigen/agent/runs/${run?.runId}`">{{ zh ? '打开安全接管' : 'Open secure takeover' }}</router-link>
        </div>
      </div>
    </div>

    <footer>
      <div class="progress-track" aria-hidden="true"><span :style="{ transform: `scaleX(${progressPercent / 100})` }"></span></div>
      <div class="footer-actions">
        <span>{{ footerNote }}</span>
        <button v-if="execution.routeKind === 'local_tool'" class="primary" type="button" @click="emit('open-local')">{{ zh ? '打开本地工具' : 'Open local tool' }}</button>
        <button v-else-if="execution.status === 'waiting_upload' && !execution.toolTaskId && !execution.agentRunId" class="primary" type="button" :disabled="busy" @click="emit('attach')">{{ zh ? '选择文件并继续' : 'Choose file and continue' }}</button>
        <button v-else-if="execution.status === 'waiting_budget' && execution.error?.code !== 'INSUFFICIENT_CREDITS'" class="primary" type="button" @click="emit('increase-budget')">{{ increaseBudgetLabel }}</button>
        <button v-else-if="displayStatus === 'failed'" class="primary" type="button" @click="emit('retry')">{{ zh ? '载入原要求并修改' : 'Load request and adjust' }}</button>
        <button v-else-if="canStart" class="primary" type="button" :disabled="busy" @click="emit('start')">{{ busy ? (zh ? '正在启动…' : 'Starting…') : (zh ? '启动任务' : 'Start task') }}</button>
        <button v-if="canCancel" class="cancel" type="button" @click="emit('cancel')">{{ zh ? '取消' : 'Cancel' }}</button>
        <router-link v-if="execution.agentRunId" :to="`/artigen/agent/runs/${execution.agentRunId}`">{{ zh ? '高级详情 ↗' : 'Advanced details ↗' }}</router-link>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import WorkspaceIcon from '../workspace/WorkspaceIcon.vue';
import type { DesignExecution } from '../../services/designConversations';
import { agentAssetUrl, type AgentApproval, type AgentRun } from '../../services/agentRuns';
import { taskAssetUrl, type ServerToolTask } from '../../services/toolTasks';

const props = defineProps<{
  execution: DesignExecution;
  task?: ServerToolTask;
  run?: AgentRun;
  busy: boolean;
  zh: boolean;
}>();
const emit = defineEmits<{
  start: [];
  attach: [];
  'open-local': [];
  'increase-budget': [];
  cancel: [];
  retry: [];
  approve: [approval: AgentApproval];
  authorize: [approval: AgentApproval];
  deny: [approval: AgentApproval];
}>();

const displayStatus = computed(() => {
  if (props.task) return props.task.status === 'success' ? 'succeeded' : props.task.status;
  if (props.run) return props.run.status === 'waiting_user' ? 'waiting_authorization' : props.run.status;
  return props.execution.status;
});
const executorLabel = computed(() => {
  const labels: Record<string, [string, string]> = {
    reply: ['设计对话', 'Design conversation'],
    local_tool: ['本地工具', 'Local tool'],
    tool_task: ['专项工作流', 'Specialist workflow'],
    agent_run: ['电脑 Agent', 'Computer Agent']
  };
  return labels[props.execution.routeKind]?.[props.zh ? 0 : 1] || props.execution.routeKind;
});
const statusLabel = computed(() => {
  const labels: Record<string, [string, string]> = {
    waiting_clarification: ['等待补充', 'Needs details'], waiting_upload: ['等待文件', 'Needs file'], waiting_budget: ['预算阻断', 'Budget blocked'],
    queued: ['排队中', 'Queued'], provisioning: ['准备环境', 'Provisioning'], running: ['执行中', 'Running'], waiting_authorization: ['等待授权', 'Needs approval'],
    waiting_user: ['等待你', 'Needs you'], verifying: ['验证中', 'Verifying'], succeeded: ['已完成', 'Completed'], success: ['已完成', 'Completed'],
    failed: ['失败', 'Failed'], cancelled: ['已取消', 'Cancelled'], planning: ['规划中', 'Planning'], paused: ['已暂停', 'Paused']
  };
  return labels[displayStatus.value]?.[props.zh ? 0 : 1] || displayStatus.value;
});
const progressPercent = computed(() => {
  const terminal: Record<string, number> = { succeeded: 100, success: 100, failed: 100, cancelled: 100 };
  if (terminal[displayStatus.value] !== undefined) return terminal[displayStatus.value];
  if (props.run?.progress.maxSteps) return Math.min(94, Math.max(8, props.run.progress.stepCount / props.run.progress.maxSteps * 100));
  return ({ waiting_upload: 8, waiting_budget: 8, queued: 18, provisioning: 28, running: 62, verifying: 88, waiting_authorization: 70 } as Record<string, number>)[displayStatus.value] || 12;
});
const pendingApprovals = computed(() => props.run?.approvals?.filter((item) => item.status === 'pending') || []);
const canStart = computed(() => !props.execution.toolTaskId && !props.execution.agentRunId && props.execution.status === 'queued' && props.execution.routeKind !== 'reply');
const canCancel = computed(() => Boolean(
  !['succeeded', 'success', 'failed', 'cancelled'].includes(displayStatus.value) &&
  (props.execution.toolTaskId || props.execution.agentRunId)
));
const footerNote = computed(() => {
  if (props.execution.routeKind === 'local_tool') return props.zh ? '浏览器内处理，不扣点' : 'Runs in-browser, no credits';
  if (props.execution.status === 'waiting_budget') return props.zh ? '未创建任务 · 未冻结点数' : 'No task created · no credit hold';
  if (props.run) return props.zh ? `${props.run.progress.stepCount} / ${props.run.progress.maxSteps} 步` : `${props.run.progress.stepCount} / ${props.run.progress.maxSteps} steps`;
  if (props.task?.status === 'success') return props.zh ? `已结算 ${props.task.receipt.chargedCredits} 点` : `${props.task.receipt.chargedCredits} credits settled`;
  return props.zh ? '真实报价后才会创建任务' : 'Created only after a verified quote';
});
const budgetTitle = computed(() => props.execution.error?.code === 'INSUFFICIENT_CREDITS'
  ? (props.zh ? '余额不足' : 'Insufficient credits')
  : (props.zh ? '真实报价超过自动上限' : 'Verified quote exceeds the auto cap'));
const budgetDescription = computed(() => props.execution.error?.code === 'INSUFFICIENT_CREDITS'
  ? (props.zh ? '任务没有创建。充值后可从这里继续。' : 'No task was created. Add credits, then continue here.')
  : (props.zh ? `当前报价 ${props.execution.quotedCredits ?? '—'} 点，高于 ${props.execution.maxCredits} 点上限。` : `The ${props.execution.quotedCredits ?? '—'}-credit quote exceeds the ${props.execution.maxCredits}-credit cap.`));
const nextBudget = computed(() => Math.min(500, Math.max(
  props.execution.quotedCredits || 0,
  props.execution.maxCredits + 10
)));
const increaseBudgetLabel = computed(() => props.zh
  ? `将本次上限提高到 ${nextBudget.value} 点`
  : `Raise only this execution to ${nextBudget.value} credits`);
const failureCode = computed(() => props.task?.error?.code || props.run?.error?.code || props.execution.error?.code || 'UNKNOWN_ERROR');
const failureFinancialNote = computed(() => {
  if (props.task) {
    return props.zh
      ? `点数处理：已扣 ${props.task.receipt.chargedCredits} 点，已退 ${props.task.receipt.refundedCredits} 点。`
      : `Credits: ${props.task.receipt.chargedCredits} charged, ${props.task.receipt.refundedCredits} refunded.`;
  }
  if (props.run) {
    return props.zh
      ? `点数处理：已扣 ${props.run.budget.charged} 点，已退 ${props.run.budget.refunded} 点，已释放 ${props.run.budget.released} 点冻结。`
      : `Credits: ${props.run.budget.charged} charged, ${props.run.budget.refunded} refunded, ${props.run.budget.released} released.`;
  }
  return props.zh ? '任务未创建时不会冻结或扣除点数。' : 'No credits are held or charged when no task was created.';
});
const actionLabel = (action: string) => {
  const labels: Record<string, [string, string]> = {
    send: ['发送', 'send'],
    publish: ['发布', 'publish'],
    submit: ['提交', 'submit'],
    delete: ['删除', 'delete'],
    change_permissions: ['权限变更', 'permission changes'],
    browser_fill: ['填写页面', 'page filling'],
    browser_interaction: ['页面操作', 'page interactions']
  };
  return labels[action]?.[props.zh ? 0 : 1] || action.replace(/_/g, ' ');
};
const sessionAuthorizationActions = new Set([
  'send',
  'publish',
  'submit',
  'delete',
  'change_permissions',
  'browser_fill',
  'browser_interaction'
]);
const canAuthorizeSession = (approval: AgentApproval) => {
  if (!sessionAuthorizationActions.has(approval.actionType)) return false;
  try {
    const target = new URL(approval.recipient);
    return target.protocol === 'https:' && !target.username && !target.password;
  } catch {
    return false;
  }
};
const authorizationOrigin = (approval: AgentApproval) => {
  try {
    return new URL(approval.recipient).origin;
  } catch {
    return approval.recipient;
  }
};
const authorizationScope = (approval: AgentApproval) => props.zh
  ? `持续授权范围：仅限 ${authorizationOrigin(approval)} 的“${actionLabel(approval.actionType)}”；连续 30 分钟未使用后失效，可随时撤销。`
  : `Ongoing scope: only “${actionLabel(approval.actionType)}” on ${authorizationOrigin(approval)}. Expires after 30 idle minutes and can be revoked.`;
const authorizationButtonLabel = (approval: AgentApproval) => props.zh
  ? `30 分钟内仅自动批准该站点的${actionLabel(approval.actionType)}操作`
  : `Allow only ${actionLabel(approval.actionType)} on this site for 30 minutes`;
</script>

<style scoped>
.execution-card { position: relative; max-width: 920px; margin: 4px auto 28px; overflow: hidden; border: 0; border-radius: 12px; color: var(--text); background: color-mix(in srgb,var(--surface) 86%,transparent); box-shadow: none; }
.execution-card::before { position: absolute; inset: 0 auto 0 0; width: 1px; background: var(--muted-2); content: ''; }
.status-running::before,.status-queued::before,.status-provisioning::before,.status-verifying::before { background: var(--acid); }
.status-failed::before { background: var(--danger); }.status-waiting_budget::before,.status-waiting_authorization::before { background: var(--warning); }.status-succeeded::before,.status-success::before { background: var(--success); }
.execution-card > header { display: flex; min-width: 0; align-items: center; gap: 10px; padding: 13px 14px 9px; border: 0; background: transparent; }
.execution-card > header > div:nth-child(2) { min-width: 0; }
.executor-icon { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; color: var(--acid-text); background: var(--surface-raised); }
.executor-icon svg { width: 16px; height: 16px; }
header p { margin: 0 0 1px; color: var(--muted); font-size: 11px; font-weight: 620; }
header h3 { margin: 0; overflow-wrap: anywhere; font-size: 14px; font-weight: 660; }
.status-chip { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 7px; margin-left: auto; padding: 5px 3px; border: 0; border-radius: 0; color: var(--muted); font-size: 11px; font-weight: 620; white-space: nowrap; background: transparent; }
.status-chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.status-running .status-chip i,.status-queued .status-chip i,.status-provisioning .status-chip i { background: var(--acid); }
.status-failed .status-chip i { background: var(--danger); }.status-waiting_budget .status-chip i,.status-waiting_authorization .status-chip i { background: var(--warning); }.status-succeeded .status-chip i,.status-success .status-chip i { background: var(--success); }
.execution-body { padding: 6px 14px 12px; }
.execution-meta { display: flex; flex-wrap: wrap; gap: 12px; min-height: 20px; }
.execution-meta:empty { display: none; }
.execution-meta span { display: flex; min-width: 0; gap: 5px; overflow-wrap: anywhere; border: 0; color: var(--muted); font-size: 11px; background: transparent; }.execution-meta b { flex: 0 0 auto; color: var(--text); }
.local-note,.upload-note,.budget-block { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 11px 12px; border: 0; border-radius: 9px; background: var(--surface-raised); }
.local-note,.upload-note { flex-wrap: wrap; }.local-note b,.upload-note b { font-size: 12px; }.local-note span,.upload-note span { color: var(--muted); font-size: 11px; }
.upload-note { background: color-mix(in srgb,var(--acid) 5%,var(--surface-raised)); }
.budget-block { justify-content: space-between; background: color-mix(in srgb,var(--warning) 8%,var(--surface-raised)); box-shadow: inset 1px 0 var(--warning); }.budget-block div { display: grid; min-width: 0; gap: 3px; }.budget-block b { font-size: 12px; }.budget-block span { overflow-wrap: anywhere; color: var(--muted); font-size: 11px; }.budget-block a { flex: 0 0 auto; color: var(--text); font-size: 12px; font-weight: 720; }
.failure-block { display: grid; gap: 5px; margin-top: 12px; padding: 11px 12px; border: 0; border-radius: 9px; background: color-mix(in srgb,var(--danger) 8%,var(--surface-raised)); box-shadow: inset 1px 0 var(--danger); }.failure-block b { color: var(--danger); font-size: 12px; }.failure-block span { color: var(--muted); font-size: 11px; line-height: 1.5; }
.deliverables { margin-top: 14px; }.deliverables > p { margin: 0 0 8px; font-size: 12px; font-weight: 660; }
.deliverables > a { display: inline-flex; align-items: center; gap: 10px; min-width: 180px; max-width: 300px; margin: 0 8px 8px 0; padding: 8px; border: 0; border-radius: 9px; color: var(--text); text-decoration: none; background: var(--surface-raised); }.deliverables > a:hover { background: var(--surface-hover,var(--surface)); }.deliverables img { width: 64px; height: 56px; border-radius: 7px; object-fit: cover; }.deliverables span { display: grid; gap: 3px; min-width: 0; font-size: 11px; }.deliverables b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.deliverables small { color: var(--success); }
.approval-list { display: grid; gap: 10px; margin-top: 14px; }.approval-card { min-width: 0; padding: 13px 14px; border: 0; border-radius: 10px; background: color-mix(in srgb,var(--warning) 8%,var(--surface-raised)); box-shadow: inset 1px 0 var(--warning); }.approval-kicker { color: var(--warning); font-size: 11px; font-weight: 720; }.approval-card h4 { margin: 5px 0; overflow-wrap: anywhere; }.approval-card p { margin: 0 0 6px; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; line-height: 1.5; }.approval-card small { display: block; overflow-wrap: anywhere; color: var(--muted); }.approval-card .authorization-scope { margin-top: 10px; padding: 9px; border: 0; border-radius: 8px; color: var(--text); background: color-mix(in srgb,var(--surface) 70%,transparent); }.approval-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }.approval-actions button,.approval-card a { min-height: 40px; padding: 8px 10px; border: 0; border-radius: 8px; color: var(--acid-ink); font-size: 11px; text-decoration: none; background: var(--acid); cursor: pointer; }.approval-actions .session { color: var(--text); background: var(--surface); }.approval-actions .deny { color: var(--danger); background: transparent; }
.execution-card > footer { padding: 0 14px 13px; }.progress-track { height: 2px; overflow: hidden; border-radius: 2px; background: var(--surface-raised); }.progress-track span { display: block; height: 100%; background: var(--acid); transform-origin: left center; transition: transform 220ms cubic-bezier(.23,1,.32,1); }.footer-actions { display: flex; align-items: center; gap: 8px; padding-top: 10px; }.footer-actions > span { margin-right: auto; color: var(--muted); font-size: 11px; }.footer-actions button,.footer-actions a { padding: 8px 9px; border: 0; border-radius: 8px; color: var(--text); font-size: 11px; text-decoration: none; background: transparent; cursor: pointer; }.footer-actions button:hover,.footer-actions a:hover { background: var(--surface-raised); }.footer-actions .primary { color: var(--acid-ink); font-weight: 720; background: var(--acid); }.footer-actions .cancel { color: var(--danger); }
.footer-actions button:focus-visible,.footer-actions a:focus-visible,.approval-actions button:focus-visible,.approval-card a:focus-visible,.deliverables a:focus-visible { outline: 2px solid var(--acid); outline-offset: 2px; }
.footer-actions button:active,.approval-actions button:active { transform: scale(.97); }
@media (max-width: 799px) {
  .execution-card > header { align-items: flex-start; padding: 12px; }.execution-body { padding: 6px 12px 12px; }.status-chip { max-width: 112px; overflow: hidden; text-overflow: ellipsis; }.execution-meta { gap: 8px 12px; }.budget-block { align-items: flex-start; flex-wrap: wrap; }.approval-actions { display: grid; grid-template-columns: 1fr; }.approval-actions button { min-height: 44px; font-size: 12px; line-height: 1.35; }.footer-actions { flex-wrap: wrap; }.footer-actions > span { width: 100%; }.footer-actions button,.footer-actions a { min-height: 44px; flex: 1; text-align: center; }.deliverables > a { max-width: 100%; width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .progress-track span { transition: none; } }
</style>
