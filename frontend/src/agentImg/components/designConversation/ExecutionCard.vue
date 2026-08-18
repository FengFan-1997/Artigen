<template>
  <article class="execution-card" :class="[`route-${execution.routeKind}`, `status-${displayStatus}`]">
    <header>
      <div class="executor-icon">
        <svg v-if="execution.routeKind === 'agent_run'" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l3 4v8l-3 4H8l-3-4V8l3-4Z"/><path d="M9 10h.01M15 10h.01M9 15h6"/></svg>
        <svg v-else-if="execution.routeKind === 'local_tool'" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4zM8 4h8v3M8 12h8M8 15h5"/></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM7 15l3-3 3 2 4-5 3 4"/><path d="M8 9h.01"/></svg>
      </div>
      <div>
        <p>{{ executorLabel }}</p>
        <h3>{{ execution.plan.label || executorLabel }}</h3>
      </div>
      <span class="status-chip" role="status" aria-live="polite"><i></i>{{ statusLabel }}</span>
    </header>

    <div class="execution-body">
      <div v-if="steps.length" class="plan">
        <div v-for="(step, index) in steps" :key="`${step}:${index}`" class="plan-step" :class="stepClass(index)">
          <span>{{ index + 1 }}</span>
          <p>{{ step }}</p>
        </div>
      </div>

      <div class="execution-meta" aria-live="polite" aria-atomic="true">
        <span><b>{{ zh ? '执行器' : 'Executor' }}</b>{{ executorLabel }}</span>
        <span v-if="execution.quotedCredits !== null"><b>{{ zh ? '报价' : 'Quote' }}</b>{{ execution.quotedCredits }} {{ zh ? '点' : 'credits' }}</span>
        <span><b>{{ zh ? '自动上限' : 'Auto cap' }}</b>{{ execution.maxCredits }} {{ zh ? '点' : 'credits' }}</span>
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
          <img v-if="asset.mimeType.startsWith('image/')" :src="taskAssetUrl(asset.assetId)" alt="Generated design" width="64" height="56" />
          <span>{{ zh ? '打开设计结果' : 'Open design result' }}</span>
        </a>
      </div>

      <div v-if="run?.artifacts?.length" class="deliverables agent-deliverables">
        <p>{{ zh ? '已验证交付物' : 'Verified deliverables' }}</p>
        <a v-for="artifact in run.artifacts" :key="artifact.artifactId" :href="agentAssetUrl(artifact)" target="_blank" rel="noopener">
          <img v-if="artifact.mimeType.startsWith('image/')" :src="agentAssetUrl(artifact)" :alt="artifact.filename" width="64" height="56" />
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
const steps = computed(() => props.run?.progress.plan?.length
  ? props.run.progress.plan.map((item) => item.label)
  : props.execution.plan.steps || []);
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
const stepClass = (index: number) => {
  const live = props.run?.progress.plan?.[index]?.status;
  if (live) return live;
  const percent = progressPercent.value;
  const threshold = ((index + 1) / Math.max(1, steps.value.length)) * 100;
  return percent >= threshold ? 'completed' : percent >= threshold - 30 ? 'in_progress' : 'pending';
};
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
.execution-card { max-width: 920px; margin: 2px auto 30px; border: 1px solid var(--border); border-radius: 18px; overflow: hidden; color: var(--text); background: var(--surface); box-shadow: 0 10px 30px rgb(0 0 0 / 10%); }
.execution-card > header { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); background: var(--surface-raised); }
.execution-card > header > div:nth-child(2) { min-width: 0; }
.executor-icon { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid var(--acid); border-radius: 10px; color: var(--acid-ink); background: var(--acid); }
.executor-icon svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.7; }
header p { margin: 0 0 2px; color: var(--muted); font-size: 11px; font-weight: 820; letter-spacing: .12em; text-transform: uppercase; }
header h3 { margin: 0; overflow-wrap: anywhere; font-size: 15px; }
.status-chip { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 7px; margin-left: auto; padding: 6px 9px; border: 1px solid var(--border); border-radius: 999px; font-size: 11px; font-weight: 780; white-space: nowrap; background: var(--surface); }
.status-chip i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
.status-running .status-chip i,.status-queued .status-chip i,.status-provisioning .status-chip i { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb,var(--acid) 24%,transparent); }
.status-failed .status-chip i { background: var(--danger); }.status-waiting_budget .status-chip i,.status-waiting_authorization .status-chip i { background: var(--warning); }.status-succeeded .status-chip i,.status-success .status-chip i { background: var(--success); }
.execution-body { padding: 18px; }
.plan { display: grid; gap: 0; }
.plan-step { position: relative; display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; min-height: 44px; }
.plan-step:not(:last-child)::after { position: absolute; top: 25px; bottom: 3px; left: 13px; width: 1px; background: var(--border); content: ''; }
.plan-step > span { position: relative; z-index: 1; display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 50%; color: var(--muted); font-size: 11px; font-weight: 800; background: var(--surface); }
.plan-step p { margin: 5px 0 0; color: var(--muted); font-size: 13px; }
.plan-step.completed > span { border-color: var(--acid); color: var(--acid-ink); background: var(--acid); }.plan-step.completed p { color: var(--text); }.plan-step.in_progress > span { border-color: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb,var(--acid) 24%,transparent); }
.execution-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding-top: 13px; border-top: 1px solid var(--border); }
.execution-meta span { display: flex; min-width: 0; gap: 6px; padding: 6px 8px; overflow-wrap: anywhere; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: 11px; background: var(--surface); }.execution-meta b { flex: 0 0 auto; color: var(--text); }
.local-note,.upload-note,.budget-block { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-raised); }
.local-note,.upload-note { flex-wrap: wrap; }.local-note b,.upload-note b { font-size: 12px; }.local-note span,.upload-note span { color: var(--muted); font-size: 11px; }
.upload-note { border-color: color-mix(in srgb,var(--acid) 22%,var(--border)); background: color-mix(in srgb,var(--acid) 4%,var(--surface-raised)); }
.budget-block { justify-content: space-between; border-color: color-mix(in srgb,var(--warning) 55%,var(--border)); background: color-mix(in srgb,var(--warning) 7%,var(--surface)); }.budget-block div { display: grid; min-width: 0; gap: 3px; }.budget-block b { font-size: 12px; }.budget-block span { overflow-wrap: anywhere; color: var(--muted); font-size: 11px; }.budget-block a { flex: 0 0 auto; color: var(--text); font-size: 12px; font-weight: 800; }
.failure-block { display: grid; gap: 5px; margin-top: 14px; padding: 12px; border: 1px solid color-mix(in srgb,var(--danger) 48%,var(--border)); border-radius: 10px; background: color-mix(in srgb,var(--danger) 7%,var(--surface)); }.failure-block b { color: var(--danger); font-size: 12px; }.failure-block span { color: var(--muted); font-size: 11px; line-height: 1.5; }
.deliverables { margin-top: 16px; }.deliverables > p { margin: 0 0 9px; font-size: 11px; font-weight: 820; letter-spacing: .08em; text-transform: uppercase; }
.deliverables > a { display: inline-flex; align-items: center; gap: 10px; min-width: 180px; max-width: 300px; margin: 0 8px 8px 0; padding: 8px; border: 1px solid var(--border); border-radius: 11px; color: var(--text); text-decoration: none; background: var(--surface); }.deliverables img { width: 64px; height: 56px; border-radius: 7px; object-fit: cover; }.deliverables span { display: grid; gap: 3px; min-width: 0; font-size: 11px; }.deliverables b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.deliverables small { color: var(--success); }
.approval-list { display: grid; gap: 10px; margin-top: 16px; }.approval-card { min-width: 0; padding: 14px; border: 1px solid color-mix(in srgb,var(--warning) 60%,var(--border)); border-radius: 12px; background: color-mix(in srgb,var(--warning) 7%,var(--surface)); }.approval-kicker { color: var(--warning); font-size: 11px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }.approval-card h4 { margin: 5px 0; overflow-wrap: anywhere; }.approval-card p { margin: 0 0 6px; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; line-height: 1.5; }.approval-card small { display: block; overflow-wrap: anywhere; color: var(--muted); }.approval-card .authorization-scope { margin-top: 10px; padding: 9px; border: 1px solid color-mix(in srgb,var(--warning) 35%,var(--border)); border-radius: 8px; color: var(--text); background: var(--surface); }.approval-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }.approval-actions button,.approval-card a { min-height: 40px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; color: var(--acid-ink); font-size: 11px; text-decoration: none; background: var(--acid); cursor: pointer; }.approval-actions .session { border-color: var(--warning); color: var(--text); background: transparent; }.approval-actions .deny { border-color: color-mix(in srgb,var(--danger) 52%,var(--border)); color: var(--danger); background: transparent; }
.execution-card > footer { padding: 0 18px 15px; }.progress-track { height: 3px; overflow: hidden; background: var(--border); }.progress-track span { display: block; height: 100%; background: var(--acid); transform-origin: left center; transition: transform 220ms ease; }.footer-actions { display: flex; align-items: center; gap: 8px; padding-top: 12px; }.footer-actions > span { margin-right: auto; color: var(--muted); font-size: 11px; }.footer-actions button,.footer-actions a { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 11px; text-decoration: none; background: var(--surface-raised); cursor: pointer; }.footer-actions .primary { border-color: var(--acid); color: var(--acid-ink); font-weight: 780; background: var(--acid); }.footer-actions .cancel { color: var(--danger); }
@media (max-width: 799px) {
  .execution-card > header,.execution-body { padding: 14px; }.execution-card > header { align-items: flex-start; }.status-chip { max-width: 112px; overflow: hidden; text-overflow: ellipsis; }.execution-meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }.budget-block { align-items: flex-start; flex-wrap: wrap; }.approval-actions { display: grid; grid-template-columns: 1fr; }.approval-actions button { min-height: 44px; font-size: 12px; line-height: 1.35; }.footer-actions { flex-wrap: wrap; }.footer-actions > span { width: 100%; }.footer-actions button,.footer-actions a { min-height: 44px; flex: 1; text-align: center; }.deliverables > a { max-width: 100%; width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .progress-track span { transition: none; } }
</style>
