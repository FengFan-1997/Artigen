<template>
  <AgentWorkspaceShell
    :zh="zh"
    :title="run?.objectivePreview || (zh ? 'Agent 运行' : 'Agent run')"
    subtitle=""
    :status-label="run ? statusLabel(run.status) : (zh ? '读取中' : 'Loading')"
    :status-tone="workspaceTone"
    :credit-label="run ? `${run.budget.used.toFixed(1)} / ${run.budget.maximum} ${zh ? '点' : 'cr'}` : '—'"
    :badges="{ subagents: activeSubagents, computer: takeoverRequired ? 1 : 0, files: artifacts.length, plan: pendingApprovals.length }"
    :live-announcement="notice || failureText"
    @new-task="$router.push('/artigen/agent')"
  >
    <template #history="{ search }">
      <div class="history-group">
        <div class="history-label">{{ zh ? '运行历史' : 'Run history' }}</div>
        <router-link
          v-for="item in filteredRuns(search)"
          :key="item.runId"
          class="history-run"
          :to="`/artigen/agent/runs/${item.runId}`"
        >
          <i :class="item.status"></i>
          <span><b>{{ item.objectivePreview || (zh ? '未命名任务' : 'Untitled task') }}</b><small>{{ statusLabel(item.status) }} · {{ formatTime(item.updatedAt) }}</small></span>
        </router-link>
        <div v-if="!filteredRuns(search).length" class="history-empty">{{ zh ? '没有匹配任务' : 'No matching runs' }}</div>
      </div>
    </template>

    <template #topbar-actions>
      <div v-if="run" class="run-controls">
        <button v-if="canPause" type="button" :disabled="controlBusy" @click="control('pause')">
          <WorkspaceIcon name="pause" />
          {{ zh ? '暂停' : 'Pause' }}
        </button>
        <button v-if="canResume" class="primary-control" type="button" :disabled="controlBusy" @click="control('resume')">
          <WorkspaceIcon name="play" />
          {{ retryRequired ? (zh ? '重试' : 'Retry') : (zh ? '恢复' : 'Resume') }}
        </button>
        <button v-if="!terminal" class="danger-control" :class="{ armed: stopArmed }" type="button" :disabled="controlBusy" @click="requestCancel">
          <WorkspaceIcon name="stop" />
          {{ stopArmed ? (zh ? '确认停止' : 'Confirm stop') : (zh ? '停止' : 'Stop') }}
        </button>
      </div>
    </template>

    <section v-if="run" class="conversation-workspace">
      <div class="conversation-scroll">
        <article class="message user-message">
          <header><span>{{ zh ? '你' : 'You' }}</span><time>{{ formatTime(run.createdAt) }}</time></header>
          <p>{{ run.objective }}</p>
        </article>

        <article class="message agent-message">
          <span class="agent-avatar" aria-hidden="true">A</span>
          <div>
            <header><span>Artigen Agent</span><small>{{ statusLabel(run.status) }}</small></header>
            <p>{{ run.progress.plan?.length ? (zh ? '计划已建立，正在按步骤推进。' : 'The plan is ready and moving forward.') : desktopMessage }}</p>
          </div>
        </article>

        <article v-if="retryRequired" class="retry-required" role="status">
          <div>
            <b>{{ zh ? '这次调用结果无法确认' : 'This call could not be confirmed' }}</b>
            <p>{{ zh ? '系统没有自动重试，也没有把这次未落账调用计入费用。你可以确认后安全重试。' : 'It was not retried automatically or charged without a receipt. You can explicitly retry it now.' }}</p>
          </div>
          <button type="button" :disabled="controlBusy" @click="control('resume')">
            {{ zh ? '确认重试' : 'Retry now' }}
          </button>
        </article>

        <article v-for="approval in pendingApprovals" :key="approval.approvalId" class="approval-card">
          <header>
            <span>{{ zh ? '需要你的确认' : 'Approval required' }}</span>
            <code>#{{ approval.approvalId.slice(0, 8) }}</code>
          </header>
          <h2>{{ actionLabel(approval.actionType) }}</h2>
          <p>{{ approval.changeSummary }}</p>
          <dl>
            <div v-if="approval.evidenceSummary"><dt>{{ zh ? '依据' : 'Evidence' }}</dt><dd>{{ approval.evidenceSummary }}</dd></div>
            <div v-if="approval.impactSummary"><dt>{{ zh ? '影响' : 'Impact' }}</dt><dd>{{ approval.impactSummary }}</dd></div>
            <div v-if="approval.rollbackSummary"><dt>{{ zh ? '撤销' : 'Rollback' }}</dt><dd>{{ approval.rollbackSummary }}</dd></div>
          </dl>
          <label class="denial-reason" :for="`denial-reason-${approval.approvalId}`">{{ zh ? '拒绝原因（可选）' : 'Reason for denial (optional)' }}</label>
          <input :id="`denial-reason-${approval.approvalId}`" v-model.trim="approvalReasons[approval.approvalId]" :name="`denial-reason-${approval.approvalId}`" type="text" maxlength="500" autocomplete="off" :placeholder="zh ? '说明拒绝原因，帮助 Agent 调整计划…' : 'Explain the denial so the Agent can replan…'" />
          <footer>
            <button type="button" :disabled="approvalBusyId === approval.approvalId" @click="decide(approval.approvalId, 'denied')">{{ zh ? '拒绝' : 'Deny' }}</button>
            <button v-if="approval.riskLevel === 'blocked'" class="approval-primary" type="button" :disabled="approvalBusyId === approval.approvalId" @click="beginTakeover(approval.approvalId)">{{ zh ? '接管电脑' : 'Take over' }}</button>
            <button v-else class="approval-primary" type="button" :disabled="approvalBusyId === approval.approvalId" @click="decide(approval.approvalId, 'approved')">{{ zh ? '仅批准这一次' : 'Approve once' }}</button>
          </footer>
        </article>

        <article v-for="event in conversationEvents" :key="event.eventId" class="message event-message" :class="{ child: event.subagentId }">
          <span class="agent-avatar" aria-hidden="true">{{ event.subagentId ? 'S' : 'A' }}</span>
          <div>
            <header>
              <span>{{ event.subagentId ? (zh ? '子 Agent' : 'Subagent') : event.type.startsWith('run.input') ? (zh ? '你' : 'You') : 'Artigen Agent' }}</span>
              <time>{{ formatTime(event.createdAt) }}</time>
            </header>
            <p>{{ event.summary }}</p>
          </div>
        </article>

        <div v-if="terminal && artifacts.length" class="delivery-summary">
          <header><span>{{ zh ? '交付完成' : 'Delivery complete' }}</span><b>{{ artifacts.length }}</b></header>
          <a v-for="artifact in artifacts" :key="`center-${artifact.artifactId}`" :href="agentAssetUrl(artifact)" target="_blank" rel="noopener noreferrer">
            <span>{{ fileCode(artifact.mimeType) }}</span>
            <div><b>{{ artifact.filename }}</b><small>{{ formatBytes(artifact.byteSize) }} · {{ artifact.verificationStatus }}</small></div>
            <WorkspaceIcon name="download" />
          </a>
        </div>
      </div>

      <p v-if="notice || failureText" class="run-notice">{{ notice || failureText }}</p>
      <form class="message-composer" @submit.prevent="sendInput">
        <label>
          <span class="sr-only">{{ zh ? '补充要求' : 'Additional instructions' }}</span>
          <textarea v-model.trim="message" name="agent-run-input" rows="2" autocomplete="off" :disabled="terminal || sending" :placeholder="terminal ? (zh ? '运行已结束' : 'Run completed') : (zh ? '补充要求或回答 Agent 的问题…' : 'Add requirements or answer the Agent…')" />
        </label>
        <footer>
          <span>{{ zh ? '外部写操作会先请求审批' : 'External writes require approval' }}</span>
          <button type="submit" :disabled="!message || terminal || sending" :aria-label="zh ? '发送' : 'Send'">
            <WorkspaceIcon name="send" :size="18" />
          </button>
        </footer>
      </form>
    </section>

    <template #environment>
      <div v-if="run" class="inspector-stack">
        <section class="inspector-card budget-card">
          <header><span>{{ zh ? '费用' : 'Budget' }}</span><b>{{ run.budget.used.toFixed(1) }} / {{ run.budget.maximum }}</b></header>
          <div><span :style="{ transform: `scaleX(${budgetPercent / 100})` }"></span></div>
          <dl>
            <div><dt>{{ zh ? '冻结' : 'Held' }}</dt><dd>{{ run.budget.frozen }}</dd></div>
            <div><dt>{{ zh ? '预计剩余' : 'Est. remaining' }}</dt><dd>{{ budgetRemaining.toFixed(1) }}</dd></div>
            <div><dt>{{ zh ? '结算次数' : 'Settlements' }}</dt><dd>1</dd></div>
          </dl>
        </section>
        <section class="inspector-card">
          <header><span>{{ zh ? '能力' : 'Capabilities' }}</span></header>
          <div class="grant-list">
            <span v-for="(enabled, capability) in run.capabilities" :key="capability" :class="{ enabled }"><i></i>{{ capabilityLabel(String(capability)) }}</span>
          </div>
        </section>
        <TechnicalDetails :label="zh ? '技术详情' : 'Technical details'">
          <dl class="technical-list">
            <div v-if="run.runtime"><dt>{{ zh ? '运行时' : 'Runtime' }}</dt><dd>V{{ run.runtime.version }} · {{ run.runtime.promptProfile || 'legacy' }}</dd></div>
            <div v-if="run.runtime?.skills?.length"><dt>{{ zh ? '已加载规范' : 'Loaded skills' }}</dt><dd>{{ run.runtime.skills.map((skill) => `${skill.id}@${skill.version}`).join(' · ') }}</dd></div>
            <div><dt>{{ zh ? '父与子文本模型' : 'Parent & child text' }}</dt><dd>Qwen/Qwen3-8B</dd></div>
            <div><dt>{{ zh ? '所有图片' : 'All images' }}</dt><dd>Kwai-Kolors/Kolors</dd></div>
            <div><dt>{{ zh ? '沙箱' : 'Sandbox' }}</dt><dd>{{ run.sandbox.provider }} · {{ run.sandbox.version }}</dd></div>
            <div><dt>{{ zh ? '最大步骤' : 'Maximum steps' }}</dt><dd>{{ run.progress.maxSteps }}</dd></div>
          </dl>
        </TechnicalDetails>
      </div>
    </template>

    <template #plan>
      <div class="execution-spine">
        <article v-for="stage in stages" :key="stage.id" :class="{ active: stage.active, complete: stage.done }">
          <i></i>
          <div><b>{{ stage.label }}</b><span>{{ stage.description }}</span></div>
        </article>
      </div>
      <TechnicalDetails class="audit-details" :label="`${zh ? '审计记录' : 'Audit log'} · ${events.length}`">
        <div>
          <article v-for="event in events" :key="`audit-${event.eventId}`">
            <time>{{ formatTime(event.createdAt) }}</time>
            <span><b>{{ eventLabel(event.type) }}</b><small>{{ event.summary }}</small></span>
          </article>
        </div>
      </TechnicalDetails>
    </template>

    <template #subagents>
      <div v-if="run" class="inspector-stack">
        <section class="parent-agent-card">
          <span class="agent-node">P</span>
          <div><b>{{ zh ? '父 Agent' : 'Parent Agent' }}</b><small>{{ statusLabel(run.status) }} · {{ run.progress.stepCount }}/{{ run.progress.maxSteps }} steps</small></div>
        </section>
        <div class="subagent-rail">
          <article v-for="child in run.subagents" :key="child.subagentId" class="subagent-card">
            <span class="agent-node">S{{ child.ordinal }}</span>
            <div>
              <header><b>{{ child.label || child.role }}</b><i :class="child.status"></i></header>
              <p>{{ child.summary || child.role }}</p>
              <small>{{ subagentStatusLabel(child.status) }} · {{ child.progress.stepCount }}/{{ child.progress.maxSteps }} steps · {{ child.usage.credits.toFixed(2) }} cr</small>
              <button v-if="['queued', 'running'].includes(child.status)" type="button" :disabled="subagentBusyId === child.subagentId" @click="cancelChild(child.subagentId)">{{ zh ? '取消这个子 Agent' : 'Cancel this subagent' }}</button>
            </div>
          </article>
          <div v-if="!run.subagents.length" class="inspector-empty">{{ zh ? '父 Agent 尚未委派子任务。' : 'The parent has not delegated a task.' }}</div>
        </div>
      </div>
    </template>

    <template #computer>
      <div v-if="run" class="computer-panel">
        <header>
          <div><span>{{ zh ? '安全桌面' : 'Secure desktop' }}</span><small>{{ desktopMessage }}</small></div>
          <i :class="{ healthy: takingOver || run.status === 'running' }"></i>
        </header>
        <div class="computer-screen">
          <div v-show="takingOver" ref="desktopScreen" class="novnc-screen" aria-label="Agent desktop takeover"></div>
          <div v-if="!takingOver" class="screen-placeholder">
            <WorkspaceIcon name="monitor" :size="20" />
            <span>{{ zh ? '画面仅在需要接管时连接' : 'Connects only for takeover' }}</span>
          </div>
        </div>
        <button v-if="takeoverRequired && !takingOver" type="button" @click="beginTakeover()">{{ zh ? '接管电脑' : 'Take over computer' }}</button>
        <button v-else-if="takingOver" class="return-control" type="button" @click="finishTakeover">{{ zh ? '完成并交还 Agent' : 'Return control to Agent' }}</button>
        <small>{{ zh ? '密码、OTP、验证码和安全警告不会发送给模型。' : 'Passwords, OTPs, CAPTCHAs, and security warnings never go to the model.' }}</small>
      </div>
    </template>

    <template #files>
      <div class="inspector-stack">
        <section class="inspector-card">
          <header><span>{{ zh ? '已验证交付' : 'Verified delivery' }}</span><b>{{ artifacts.length }}</b></header>
          <div v-if="artifacts.length" class="file-list">
            <a v-for="artifact in artifacts" :key="artifact.artifactId" :href="agentAssetUrl(artifact)" target="_blank" rel="noopener noreferrer">
              <span>{{ fileCode(artifact.mimeType) }}</span>
              <div><b>{{ artifact.filename }}</b><small>{{ formatBytes(artifact.byteSize) }} · v{{ artifact.version }}</small><em :class="artifact.verificationStatus">{{ artifact.verificationStatus }}</em></div>
              <WorkspaceIcon name="download" />
            </a>
          </div>
          <div v-else class="inspector-empty">{{ zh ? '文件通过验证后才会显示。' : 'Files appear only after verification.' }}</div>
        </section>
        <button v-for="artifact in websiteArtifacts" :key="`preview:${artifact.artifactId}`" class="preview-control" type="button" @click="previewWebsite(artifact)">{{ zh ? `预览 ${artifact.filename}` : `Preview ${artifact.filename}` }}</button>
      </div>
    </template>

    <section v-if="previewHtml" class="preview-modal" role="dialog" aria-modal="true">
      <header><strong>{{ previewName }}</strong><button type="button" :aria-label="zh ? '关闭预览' : 'Close preview'" @click="closePreview"><WorkspaceIcon name="close" :size="18" /></button></header>
      <iframe :srcdoc="previewHtml" :title="previewName" sandbox="allow-scripts" referrerpolicy="no-referrer" />
    </section>
  </AgentWorkspaceShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import RFB from '@novnc/novnc/lib/rfb';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import AgentWorkspaceShell from '../components/workspace/AgentWorkspaceShell.vue';
import TechnicalDetails from '../components/workspace/TechnicalDetails.vue';
import WorkspaceIcon from '../components/workspace/WorkspaceIcon.vue';
import {
  agentAssetUrl,
  cancelAgentSubagent,
  controlAgentRun,
  createAgentDesktopTicket,
  getAgentRun,
  listAgentRuns,
  loadAgentWebsitePreview,
  openAgentEventStream,
  submitAgentInput,
  type AgentApproval,
  type AgentArtifact,
  type AgentEvent,
  type AgentRun,
  type AgentRunStatus,
  type AgentSubagentStatus
} from '../services/agentRuns';

const route = useRoute();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const zh = computed(() => currentLang.value === 'zh');
const runId = computed(() => String(route.params.runId || ''));
const run = ref<AgentRun | null>(null);
const runs = ref<AgentRun[]>([]);
const events = ref<AgentEvent[]>([]);
const message = ref('');
const notice = ref('');
const controlBusy = ref(false);
const sending = ref(false);
const approvalBusyId = ref('');
const subagentBusyId = ref('');
const approvalReasons = ref<Record<string, string>>({});
const stopArmed = ref(false);
const takingOver = ref(false);
const activeTakeoverApprovalId = ref('');
const desktopScreen = ref<HTMLDivElement | null>(null);
const previewHtml = ref('');
const previewName = ref('');
let closeStream: (() => void) | null = null;
let pollTimer: number | null = null;
let eventRefreshTimer: number | null = null;
let stopArmTimer: number | null = null;
let loadInFlight: Promise<void> | null = null;
let desktopClient: RFB | null = null;
const eventIds = new Set<string>();

const terminal = computed(() => ['succeeded', 'failed', 'cancelled'].includes(run.value?.status || ''));
const workspaceTone = computed<'ready' | 'busy' | 'warning' | 'offline'>(() => {
  if (!run.value) return 'offline';
  if (run.value.status === 'waiting_user' || pendingApprovals.value.length) return 'warning';
  if (['queued', 'provisioning', 'running', 'verifying'].includes(run.value.status)) return 'busy';
  if (run.value.status === 'succeeded') return 'ready';
  return 'offline';
});
const canPause = computed(() => ['queued', 'provisioning', 'running', 'waiting_user'].includes(run.value?.status || ''));
const retryRequired = computed(() => run.value?.status === 'waiting_user' && run.value?.progress.retryRequired === true);
const canResume = computed(() => run.value?.status === 'paused' || retryRequired.value);
const artifacts = computed<AgentArtifact[]>(() => run.value?.artifacts || []);
const websiteArtifacts = computed(() =>
  artifacts.value.filter((artifact) =>
    ['website', 'package'].includes(artifact.role) &&
    artifact.mimeType === 'application/zip'
  )
);
const pendingApprovals = computed<AgentApproval[]>(() =>
  (run.value?.approvals || []).filter((approval) => (
    approval.status === 'pending' && new Date(approval.expiresAt).getTime() > Date.now()
  ))
);
const failureText = computed(() => run.value?.error?.code ? errorText(run.value.error.code) : '');
const takeoverRequired = computed(() =>
  Boolean(run.value?.sandbox.takeoverAvailable) &&
  pendingApprovals.value.some((approval) => approval.riskLevel === 'blocked')
);
const conversationEvents = computed(() =>
  events.value.filter((event) =>
    event.type.includes('input') ||
    event.type.includes('takeover') ||
    event.type === 'approval.decided' ||
    event.type === 'run.failed' ||
    event.type === 'run.succeeded'
  )
);
const activeSubagents = computed(() => (run.value?.subagents || []).filter((child) => ['queued', 'running'].includes(child.status)).length);
const filteredRuns = (search: string) => {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return runs.value;
  return runs.value.filter((item) => `${item.objectivePreview || ''} ${item.status}`.toLocaleLowerCase().includes(query));
};
const budgetPercent = computed(() => {
  if (!run.value?.budget.maximum) return 0;
  return Math.min(100, (run.value.budget.used / run.value.budget.maximum) * 100);
});
const budgetRemaining = computed(() => Math.max(
  0,
  Number(run.value?.budget.maximum || 0) - Number(run.value?.budget.used || 0)
));
const desktopMessage = computed(() => {
  if (!run.value) return '';
  if (run.value.status === 'queued') return zh.value ? '等待可用容量' : 'Waiting for capacity';
  if (run.value.status === 'provisioning') return zh.value ? '正在创建隔离云电脑' : 'Provisioning isolated desktop';
  if (run.value.status === 'paused') return zh.value ? '云电脑已暂停并保存状态' : 'Desktop suspended with state saved';
  if (terminal.value) return zh.value ? '运行已结束，云电脑已销毁' : 'Run ended; desktop destroyed';
  return zh.value ? '实时画面正在连接' : 'Connecting live view';
});

const stageOrder: AgentRunStatus[] = ['queued', 'provisioning', 'running', 'verifying', 'succeeded'];
const stages = computed(() => {
  const actualPlan = run.value?.progress.plan || [];
  if (actualPlan.length) {
    return actualPlan.map((step, index) => ({
      id: `plan-${index}`,
      index: String(index + 1).padStart(2, '0'),
      label: step.label,
      description: step.status === 'completed'
        ? (zh.value ? '已完成' : 'Completed')
        : step.status === 'in_progress'
          ? (zh.value ? '正在执行' : 'In progress')
          : (zh.value ? '待执行' : 'Pending'),
      active: step.status === 'in_progress',
      done: step.status === 'completed'
    }));
  }
  const current = run.value?.status || 'queued';
  const currentIndex = stageOrder.indexOf(current);
  const pausedAt = current === 'waiting_user' || current === 'paused' ? 2 : currentIndex;
  const labels = [
    [zh.value ? '排队' : 'Queue', zh.value ? '冻结预算并分配 Worker' : 'Hold budget and assign worker'],
    [zh.value ? '云电脑' : 'Sandbox', zh.value ? '创建隔离 Linux 环境' : 'Provision isolated Linux'],
    [zh.value ? '执行' : 'Execute', zh.value ? '研究、网页与文件操作' : 'Research, browser, and files'],
    [zh.value ? '验证' : 'Verify', zh.value ? '打开、解析、渲染检查' : 'Open, parse, and render'],
    [zh.value ? '交付' : 'Deliver', zh.value ? '结算并释放未使用点数' : 'Settle and release unused credits']
  ];
  return labels.map(([label, description], index) => ({
    id: stageOrder[index],
    index: String(index + 1).padStart(2, '0'),
    label,
    description,
    active: pausedAt === index,
    done: pausedAt > index || current === 'succeeded'
  }));
});

const errorText = (error: unknown) => {
  const code = String((error as any)?.code || (error as Error)?.message || error || 'AGENT_REQUEST_FAILED');
  const labels: Record<string, [string, string]> = {
    AGENT_BETA_ACCESS_DENIED: ['Agent 目前仅对 Beta 所有者账号开放。', 'Agent is currently limited to the Beta owner account.'],
    AGENT_RUN_LOAD_FAILED: ['暂时无法读取任务，请稍后重试。', 'Unable to load this run. Try again shortly.'],
    AGENT_CONTROL_FAILED: ['控制请求没有成功，请刷新后重试。', 'The control request failed. Refresh and try again.'],
    AGENT_INPUT_FAILED: ['补充信息没有发送成功，请重试。', 'Your update was not sent. Try again.'],
    AGENT_APPROVAL_FAILED: ['这项审批已经失效或被处理，请刷新任务。', 'This approval expired or was already handled. Refresh the run.'],
    AGENT_APPROVAL_NOT_AVAILABLE: ['这项审批已经失效或被处理，请刷新任务。', 'This approval expired or was already handled. Refresh the run.'],
    AGENT_APPROVAL_EXPIRED: ['关键操作未在时限内确认，任务已停止；已释放剩余冻结点数。', 'A critical action was not confirmed in time. The run stopped and unused held credits were released.'],
    AGENT_RUN_TERMINAL: ['任务已经结束，不能再执行该操作。', 'This run has already ended.'],
    AGENT_TAKEOVER_APPROVAL_REQUIRED: ['请从对应审批卡片进入接管。', 'Start takeover from its approval card.'],
    AGENT_TAKEOVER_NOT_AVAILABLE: ['当前任务没有可接管的桌面。', 'Desktop takeover is not available for this run.'],
    AGENT_DESKTOP_RELAY_UNAVAILABLE: ['Mac Worker、中继或安全出口尚未就绪，请确认 Mac 醒着且 Docker 正在运行。', 'The Mac worker, relay, or secure egress is not ready. Keep the Mac awake and Docker running.'],
    AGENT_DESKTOP_CONNECTION_FAILED: ['桌面临时中继连接失败，请重新申请接管。', 'The temporary desktop relay failed. Request takeover again.'],
    AGENT_WEBSITE_PREVIEW_FAILED: ['网站预览无法打开，请下载源码包检查。', 'The website preview could not open. Download the source package instead.'],
    AGENT_WEBSITE_ARCHIVE_INVALID: ['网站源码包损坏，验证未通过。', 'The website archive is invalid.'],
    AGENT_BUDGET_EXCEEDED: ['任务达到最高预算，已安全停止并释放剩余点数。', 'The run reached its budget and stopped safely.'],
    AGENT_TIME_LIMIT_REACHED: ['任务达到最长运行时间，已安全停止。', 'The run reached its time limit and stopped safely.'],
    AGENT_STEP_LIMIT_REACHED: ['任务达到最大步骤数，已安全停止。', 'The run reached its step limit and stopped safely.'],
    AGENT_REPEATED_ACTION_FAILED: ['同一动作连续失败，系统已停止循环。', 'The same action failed repeatedly, so the loop was stopped.'],
    AGENT_SCREEN_STALLED: ['云电脑画面没有变化，系统已停止循环。', 'The desktop stopped changing, so the loop was stopped.'],
    AGENT_REPLAN_LIMIT_REACHED: ['Agent 多次重规划仍无法继续，任务已停止。', 'The agent could not recover after several replans.'],
    AGENT_VERIFICATION_INCOMPLETE: ['交付物没有通过完整性验证，本次不会标记为完成。', 'Deliverables did not pass completion verification.'],
    AGENT_TRAJECTORY_VERIFICATION_FAILED: ['执行过程未通过安全验证，本次不会标记为完成。', 'The execution trace did not pass safety verification.'],
    AGENT_QUEUE_UNAVAILABLE: ['任务队列暂时不可用，冻结点数会自动释放。', 'The queue is unavailable; held credits will be released.'],
    AGENT_RUNTIME_FAILED: ['Agent 运行失败，系统费用将按规则退款。', 'The agent failed; system costs will be refunded by policy.'],
    AGENT_CANCELLED: ['任务已由你停止，未使用点数已经释放。', 'You stopped the run; unused credits were released.']
  };
  return labels[code]?.[zh.value ? 0 : 1] || (
    zh.value
      ? '任务发生了意外，系统不会把未验证的结果标记为完成；请稍后重试或联系支持。'
      : 'The run hit an unexpected problem. Unverified work will not be marked complete; try again or contact support.'
  );
};

const load = () => {
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    try {
      run.value = await getAgentRun(runId.value);
      runs.value = await listAgentRuns();
    } catch (error) {
      notice.value = errorText(error || 'AGENT_RUN_LOAD_FAILED');
    } finally {
      loadInFlight = null;
    }
  })();
  return loadInFlight;
};

const cancelChild = async (subagentId: string) => {
  subagentBusyId.value = subagentId;
  try {
    await cancelAgentSubagent(runId.value, subagentId);
    notice.value = '';
    await load();
  } catch (error) {
    notice.value = errorText(error || 'AGENT_SUBAGENT_CANCEL_FAILED');
  } finally {
    subagentBusyId.value = '';
  }
};

const control = async (action: 'pause' | 'resume' | 'cancel') => {
  controlBusy.value = true;
  try {
    run.value = await controlAgentRun(runId.value, action);
    notice.value = '';
    await load();
  } catch (error) {
    notice.value = errorText(error || 'AGENT_CONTROL_FAILED');
  } finally {
    controlBusy.value = false;
  }
};

const requestCancel = async () => {
  if (!stopArmed.value) {
    stopArmed.value = true;
    notice.value = zh.value
      ? '停止后不会继续产生费用；已实际使用的费用保留，未使用冻结点数会释放。再次点击确认停止。'
      : 'Stopping prevents new charges. Used costs remain and unused held credits are released. Click again to confirm.';
    if (stopArmTimer !== null) window.clearTimeout(stopArmTimer);
    stopArmTimer = window.setTimeout(() => {
      stopArmed.value = false;
      stopArmTimer = null;
    }, 8000);
    return;
  }
  stopArmed.value = false;
  if (stopArmTimer !== null) window.clearTimeout(stopArmTimer);
  stopArmTimer = null;
  await control('cancel');
};

const sendInput = async () => {
  if (!message.value) return;
  sending.value = true;
  try {
    await submitAgentInput(runId.value, { message: message.value });
    message.value = '';
    await load();
  } catch (error) {
    notice.value = errorText(error || 'AGENT_INPUT_FAILED');
  } finally {
    sending.value = false;
  }
};

const decide = async (approvalId: string, decision: 'approved' | 'denied') => {
  approvalBusyId.value = approvalId;
  try {
    await submitAgentInput(runId.value, {
      approvalId,
      decision,
      decisionReason: decision === 'denied'
        ? approvalReasons.value[approvalId]?.trim()
        : undefined
    });
    delete approvalReasons.value[approvalId];
    notice.value = '';
    await load();
  } catch (error) {
    notice.value = errorText(error || 'AGENT_APPROVAL_FAILED');
  } finally {
    approvalBusyId.value = '';
  }
};

const disconnectDesktop = () => {
  const client = desktopClient;
  desktopClient = null;
  takingOver.value = false;
  if (client) client.disconnect();
  if (desktopScreen.value) desktopScreen.value.replaceChildren();
};

const beginTakeover = async (approvalId?: string) => {
  if (!run.value?.sandbox.takeoverAvailable) return;
  const target = approvalId || pendingApprovals.value.find(
    (approval) => approval.riskLevel === 'blocked'
  )?.approvalId;
  if (!target) return;
  approvalBusyId.value = target;
  try {
    disconnectDesktop();
    const ticket = await createAgentDesktopTicket(runId.value, target);
    activeTakeoverApprovalId.value = target;
    takingOver.value = true;
    await nextTick();
    if (!desktopScreen.value) throw new Error('AGENT_DESKTOP_CONNECTION_FAILED');
    const client = new RFB(desktopScreen.value, ticket.websocketUrl, {
      shared: true,
      wsProtocols: []
    });
    desktopClient = client;
    client.scaleViewport = true;
    client.resizeSession = false;
    client.viewOnly = false;
    client.addEventListener('connect', () => client.focus(), { once: true });
    client.addEventListener('securityfailure', () => {
      if (desktopClient === client) {
        disconnectDesktop();
        notice.value = errorText('AGENT_DESKTOP_CONNECTION_FAILED');
      }
    }, { once: true });
    client.addEventListener('disconnect', () => {
      if (desktopClient === client) {
        desktopClient = null;
        takingOver.value = false;
        notice.value = errorText('AGENT_DESKTOP_CONNECTION_FAILED');
      }
    }, { once: true });
    notice.value = '';
  } catch (error) {
    disconnectDesktop();
    activeTakeoverApprovalId.value = '';
    notice.value = errorText(error || 'AGENT_DESKTOP_CONNECTION_FAILED');
  } finally {
    approvalBusyId.value = '';
  }
};

const finishTakeover = async () => {
  sending.value = true;
  try {
    if (!activeTakeoverApprovalId.value) {
      throw new Error('AGENT_TAKEOVER_APPROVAL_REQUIRED');
    }
    await submitAgentInput(runId.value, {
      takeoverEnded: true,
      takeoverApprovalId: activeTakeoverApprovalId.value
    });
    disconnectDesktop();
    activeTakeoverApprovalId.value = '';
    await load();
  } catch (error) {
    notice.value = errorText(error || 'AGENT_TAKEOVER_END_FAILED');
  } finally {
    sending.value = false;
  }
};

const previewWebsite = async (artifact: AgentArtifact) => {
  try {
    previewHtml.value = await loadAgentWebsitePreview(artifact);
    previewName.value = artifact.filename;
  } catch (error) {
    notice.value = errorText(error || 'AGENT_WEBSITE_PREVIEW_FAILED');
  }
};
const closePreview = () => {
  previewHtml.value = '';
  previewName.value = '';
};

const onEvent = (event: AgentEvent) => {
  if (!eventIds.has(event.eventId)) {
    eventIds.add(event.eventId);
    events.value.push(event);
    events.value.sort((a, b) => Number(a.eventId) - Number(b.eventId));
  }
  if (eventRefreshTimer === null) {
    eventRefreshTimer = window.setTimeout(() => {
      eventRefreshTimer = null;
      void load();
    }, 250);
  }
};

const statusLabel = (status: AgentRunStatus) => {
  const labels: Record<AgentRunStatus, [string, string]> = {
    draft: ['草稿', 'Draft'], queued: ['排队中', 'Queued'], provisioning: ['创建云电脑', 'Provisioning'],
    running: ['执行中', 'Running'], waiting_user: ['等待你确认', 'Needs your input'], paused: ['已暂停', 'Paused'],
    verifying: ['验证中', 'Verifying'], succeeded: ['已完成', 'Completed'], failed: ['失败', 'Failed'], cancelled: ['已取消', 'Cancelled']
  };
  return labels[status]?.[zh.value ? 0 : 1] || status;
};
const subagentStatusLabel = (status: AgentSubagentStatus) => {
  const labels: Record<AgentSubagentStatus, [string, string]> = {
    queued: ['排队中', 'Queued'],
    running: ['执行中', 'Running'],
    succeeded: ['已完成', 'Completed'],
    failed: ['失败', 'Failed'],
    cancelled: ['已取消', 'Cancelled']
  };
  return labels[status][zh.value ? 0 : 1];
};
const capabilityLabel = (capability: string) => {
  const labels: Record<string, [string, string]> = {
    research: ['调研', 'Research'],
    browser: ['网页操作', 'Web actions'],
    files: ['文档与文件', 'Documents & files'],
    shell: ['离线处理', 'Offline processing'],
    subagents: ['并行处理', 'Parallel work'],
    generate_images: ['生成图片', 'Generate images']
  };
  return labels[capability]?.[zh.value ? 0 : 1] || capability.replace(/_/g, ' ');
};
const actionLabel = (type: string) => {
  const labels: Record<string, [string, string]> = {
    send: ['发送内容', 'Send content'],
    publish: ['发布内容', 'Publish content'],
    submit: ['提交表单', 'Submit form'],
    delete: ['删除数据', 'Delete data'],
    change_permissions: ['修改权限', 'Change permissions'],
    payment: ['确认付款', 'Confirm payment'],
    install_software: ['安装软件', 'Install software'],
    security_setting: ['修改安全设置', 'Change security settings'],
    password_change: ['修改密码', 'Change password'],
    captcha: ['完成人机验证', 'Complete CAPTCHA'],
    enter_password: ['输入密码', 'Enter password'],
    enter_otp: ['输入验证码', 'Enter one-time code'],
    visual_interaction: ['接管纯视觉操作', 'Take over visual action']
  };
  return labels[type]?.[zh.value ? 0 : 1] || type.replace(/_/g, ' ');
};
const eventLabel = (type: string) => {
  const labels: Record<string, [string, string]> = {
    'run.queued': ['进入队列', 'Queued'],
    'run.provisioning': ['创建云电脑', 'Provisioning desktop'],
    'sandbox.ready': ['云电脑已就绪', 'Desktop ready'],
    'sandbox.resumed': ['云电脑已恢复', 'Desktop resumed'],
    'step.recorded': ['步骤完成', 'Step recorded'],
    'artifact.created': ['产物已验证', 'Artifact verified'],
    'cost.updated': ['费用已更新', 'Cost updated'],
    'approval.required': ['等待你的确认', 'Approval required'],
    'takeover.required': ['等待你接管', 'Takeover required'],
    'approval.approved': ['你已批准', 'Approved'],
    'approval.denied': ['你已拒绝', 'Denied'],
    'run.pause_requested': ['正在暂停', 'Pause requested'],
    'run.paused': ['已暂停', 'Paused'],
    'run.resumed': ['已恢复', 'Resumed'],
    'run.recovered': ['已从检查点恢复', 'Recovered from checkpoint'],
    'run.verifying': ['开始独立验证', 'Verification started'],
    'run.succeeded': ['任务完成', 'Run completed'],
    'run.failed': ['任务失败', 'Run failed'],
    'run.cancelled': ['任务已停止', 'Run stopped'],
    'run.input_received': ['收到你的补充', 'User input received'],
    'takeover.ended': ['接管已结束', 'Takeover ended'],
    'subagent.created': ['子 Agent 已创建', 'Subagent created'],
    'subagent.started': ['子 Agent 已启动', 'Subagent started'],
    'subagent.progress': ['子 Agent 有新进展', 'Subagent progress'],
    'subagent.succeeded': ['子 Agent 已完成', 'Subagent completed'],
    'subagent.failed': ['子 Agent 失败', 'Subagent failed'],
    'subagent.cancelled': ['子 Agent 已取消', 'Subagent cancelled'],
    'plan.compiled': ['计划已编译', 'Plan compiled'],
    'context.compacted': ['上下文已压缩', 'Context compacted'],
    'verification.started': ['语义核对开始', 'Semantic verification started'],
    'verification.repair_requested': ['需要定向返修', 'Targeted repair requested'],
    'verification.passed': ['语义核对通过', 'Semantic verification passed'],
    'verification.failed': ['语义核对未通过', 'Semantic verification failed'],
    'budget.warning': ['预算计划已收紧', 'Budget plan tightened'],
    'budget.lockdown': ['仅保留验证与交付', 'Verification and delivery only']
  };
  return labels[type]?.[zh.value ? 0 : 1] || type.replace(/\./g, ' / ').toUpperCase();
};
const formatTime = (value: string) => new Intl.DateTimeFormat(
  zh.value ? 'zh-CN' : 'en-US',
  { hour: '2-digit', minute: '2-digit', second: '2-digit' }
).format(new Date(value));
const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};
const fileCode = (mime: string) => {
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('spreadsheet')) return 'XLSX';
  if (mime.includes('presentation')) return 'PPTX';
  if (mime.includes('zip')) return 'ZIP';
  if (mime.startsWith('image/')) return 'IMG';
  return 'FILE';
};
onMounted(async () => {
  await load();
  closeStream = openAgentEventStream(runId.value, { onEvent });
  pollTimer = window.setInterval(() => void load(), 5000);
});
onBeforeUnmount(() => {
  disconnectDesktop();
  closeStream?.();
  if (pollTimer !== null) window.clearInterval(pollTimer);
  if (eventRefreshTimer !== null) window.clearTimeout(eventRefreshTimer);
  if (stopArmTimer !== null) window.clearTimeout(stopArmTimer);
});
</script>

<style scoped>
.conversation-workspace { display: grid; grid-template-rows: minmax(0, 1fr) auto auto; height: 100%; min-height: 0; }
.conversation-scroll { width: min(820px, calc(100% - 56px)); margin: 0 auto; padding: 44px 0 56px; overflow: auto; overscroll-behavior: contain; scrollbar-color: var(--border) transparent; }
.message { margin-bottom: 26px; color: var(--text); }
.message header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px; }
.message header span { font-size: 12px; font-weight: 700; }
.message header time, .message header small { color: var(--muted-2); font-size: 12px; }
.message p { margin: 0; overflow-wrap: anywhere; color: var(--text); font-size: 15px; line-height: 1.72; white-space: pre-wrap; }
.user-message { max-width: 74%; margin-left: auto; padding: 13px 15px; border: 0; border-radius: 12px 12px 3px 12px; background: var(--surface); }
.user-message header { justify-content: flex-end; }
.user-message p { color: var(--text); }
.agent-message, .event-message { display: grid; grid-template-columns: 30px 1fr; gap: 11px; align-items: start; }
.agent-avatar { display: grid; width: 30px; height: 30px; place-items: center; color: var(--text); border: 0; border-radius: 9px; background: var(--surface-raised); font-size: 12px; font-weight: 720; }
.event-message.child .agent-avatar { color: var(--text); background: var(--surface-raised); }
.event-message p { color: var(--muted); font-size: 12px; }
.approval-card { margin: 26px 0; padding: 16px 16px 16px 19px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--warning) 7%, var(--surface)); box-shadow: inset 3px 0 var(--warning); }
.approval-card > header { display: flex; align-items: center; justify-content: space-between; color: var(--warning); font-size: 11px; font-weight: 720; }
.approval-card code { color: var(--muted); font-size: 11px; }
.approval-card h2 { margin: 12px 0 6px; font-size: 14px; }
.approval-card > p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.approval-card dl { display: grid; gap: 7px; margin: 12px 0; }
.approval-card dl div { display: grid; gap: 3px; padding: 8px 10px; border: 0; border-radius: 7px; background: color-mix(in srgb, var(--surface) 82%, transparent); }
.approval-card dt { color: var(--warning); font-size: 11px; font-weight: 700; }
.approval-card dd { margin: 0; overflow-wrap: anywhere; color: var(--muted); font-size: 11px; line-height: 1.5; }
.denial-reason { display: block; margin-bottom: 6px; color: var(--text); font-size: 11px; font-weight: 620; }
.approval-card > input { width: 100%; min-height: 38px; box-sizing: border-box; padding: 0 10px; color: var(--text); border: 1px solid var(--border); border-radius: 8px; background: var(--surface); font-size: 11px; }
.approval-card footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.approval-card button { min-height: 36px; padding: 0 12px; color: var(--text); border: 0; border-radius: 8px; background: var(--surface); font-size: 11px; }
.approval-card .approval-primary { color: var(--acid-ink); background: var(--acid); font-weight: 720; }
.retry-required { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 26px 0; padding: 15px 16px 15px 19px; border-radius: 10px; background: color-mix(in srgb, var(--warning) 7%, var(--surface)); box-shadow: inset 3px 0 var(--warning); }
.retry-required div { display: grid; gap: 5px; }
.retry-required b { color: var(--text); font-size: 13px; }
.retry-required p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.retry-required button { min-height: 36px; flex: 0 0 auto; padding: 0 12px; color: var(--acid-ink); border: 0; border-radius: 8px; background: var(--acid); font-size: 11px; font-weight: 720; }
.delivery-summary { padding: 14px 14px 14px 17px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--success) 6%, var(--surface)); box-shadow: inset 3px 0 var(--success); }
.delivery-summary > header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: var(--success); font-size: 11px; font-weight: 720; }
.delivery-summary > header b { font: 700 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.delivery-summary a { display: grid; grid-template-columns: 36px 1fr 18px; gap: 10px; align-items: center; padding: 9px; color: inherit; border-radius: 8px; text-decoration: none; }
.delivery-summary a:hover { background: var(--surface-raised); }
.delivery-summary a > span { color: var(--acid-text); font: 700 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.delivery-summary a div { display: grid; gap: 2px; min-width: 0; }
.delivery-summary a b { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.delivery-summary a small { color: var(--muted); font-size: 11px; }
.delivery-summary svg { width: 16px; height: 16px; }
.run-notice { width: min(820px, calc(100% - 56px)); margin: 0 auto 10px; padding: 10px 12px 10px 15px; color: var(--danger); border: 0; border-radius: 9px; background: color-mix(in srgb, var(--danger) 7%, var(--surface)); box-shadow: inset 3px 0 var(--danger); font-size: 12px; }
.message-composer { width: min(820px, calc(100% - 56px)); margin: 0 auto max(20px,env(safe-area-inset-bottom)); overflow: hidden; border: 0; border-radius: 20px; background: var(--surface); box-shadow: 0 18px 54px rgb(0 0 0 / 24%); transition: box-shadow 180ms cubic-bezier(.23,1,.32,1),background-color 180ms ease; }
.message-composer:focus-within { background: var(--surface-raised); box-shadow: 0 22px 62px rgb(0 0 0 / 30%),0 0 0 2px var(--acid); }
.message-composer textarea { display: block; width: 100%; min-height: 72px; resize: none; box-sizing: border-box; padding: 16px 17px 7px; color: var(--text); border: 0; outline: 0; background: transparent; font: 15px/1.58 inherit; }
.message-composer footer { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px 10px 17px; }
.message-composer footer span { color: var(--muted-2); font-size: 12px; }
.message-composer button { display: grid; width: 42px; height: 42px; padding: 0; place-items: center; color: var(--acid-ink); border: 0; border-radius: 999px; background: var(--acid); transition: transform 120ms cubic-bezier(.23,1,.32,1),opacity 120ms ease; }
.message-composer button:active:not(:disabled) { transform: scale(.96); }
.message-composer button:disabled { opacity: .4; }
.message-composer svg { width: 18px; height: 18px; }
.run-controls svg, .file-list svg { width: 16px; height: 16px; }
.preview-modal svg { width: 18px; height: 18px; }
.run-controls { display: flex; gap: 5px; }
.run-controls button { display: inline-flex; min-height: 30px; align-items: center; gap: 5px; padding: 0 8px; color: var(--muted); border: 0; border-radius: 7px; background: var(--surface); font-size: 11px; }
.run-controls .primary-control { color: var(--acid-ink); background: var(--acid); }
.run-controls .danger-control { color: var(--danger); }
.run-controls .danger-control.armed { color: #fff; background: var(--danger); }
.history-group { padding: 4px 8px 16px; }
.history-label { padding: 5px 8px 8px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.history-run { display: grid; grid-template-columns: 8px 1fr; gap: 8px; align-items: start; padding: 9px 8px; color: inherit; border-radius: 8px; text-decoration: none; }
.history-run:hover, .history-run.router-link-active { background: var(--surface-raised); }
.history-run i { width: 6px; height: 6px; margin-top: 5px; border-radius: 50%; background: var(--muted); }
.history-run i.running, .history-run i.provisioning, .history-run i.verifying { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acid) 12%, transparent); }
.history-run i.succeeded { background: var(--success); }
.history-run i.failed, .history-run i.cancelled { background: var(--danger); }
.history-run span { display: grid; min-width: 0; gap: 3px; }
.history-run b { overflow: hidden; color: var(--text); font-size: 13px; font-weight: 580; text-overflow: ellipsis; white-space: nowrap; }
.history-run small, .history-empty { color: var(--muted); font-size: 12px; }
.history-empty { padding: 16px 8px; text-align: center; }
.inspector-stack { display: grid; gap: 14px; }
.inspector-card { padding: 9px 4px; border: 0; border-radius: 10px; background: transparent; }
.inspector-card header, .computer-panel > header { display: flex; min-height: 22px; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.inspector-card header > span, .computer-panel header span { color: var(--text); font-size: 13px; font-weight: 680; }
.inspector-card header > b { color: var(--text); font: 680 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.inspector-card header > i, .computer-panel header > i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
.inspector-card header > i.healthy, .computer-panel header > i.healthy { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acid) 12%, transparent); }
.inspector-card dl { display: grid; gap: 7px; margin: 0; }
.inspector-card dl div { display: flex; justify-content: space-between; gap: 10px; }
.inspector-card dt, .inspector-card p { color: var(--muted); font-size: 12px; line-height: 1.55; }
.inspector-card dd { min-width: 0; max-width: 66%; margin: 0; overflow-wrap: anywhere; color: var(--text); font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.budget-card > div { height: 4px; margin: 3px 0 11px; overflow: hidden; border-radius: 4px; background: var(--border); }
.budget-card > div span { display: block; width: 100%; height: 100%; background: var(--acid); transform-origin: left center; transition: transform 180ms ease; }
.grant-list { display: flex; flex-wrap: wrap; gap: 5px; }
.grant-list span { display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; color: var(--muted-2); border: 0; border-radius: 6px; background: var(--surface-raised); font-size: 11px; }
.grant-list i { width: 5px; height: 5px; border-radius: 50%; background: var(--muted-2); }
.grant-list span.enabled { color: var(--text); }
.grant-list span.enabled i { background: var(--acid); }
.execution-spine { position: relative; display: grid; }
.execution-spine::before { position: absolute; top: 16px; bottom: 16px; left: 8px; width: 1px; content: ''; background: var(--border); }
.execution-spine article { position: relative; display: grid; grid-template-columns: 17px 1fr; gap: 10px; min-height: 62px; }
.execution-spine i { z-index: 1; width: 9px; height: 9px; margin: 5px 0 0 4px; border: 2px solid var(--border); border-radius: 50%; background: var(--sidebar); }
.execution-spine article.complete i { border-color: var(--acid); background: var(--acid); box-shadow: 0 0 0 4px color-mix(in srgb, var(--acid) 10%, transparent); }
.execution-spine article.active i { border-color: var(--acid); box-shadow: 0 0 0 4px color-mix(in srgb, var(--acid) 10%, transparent); }
.execution-spine div { display: grid; align-content: start; gap: 4px; }
.execution-spine b { color: var(--text); font-size: 11px; }
.execution-spine span { color: var(--muted); font-size: 11px; line-height: 1.5; }
.audit-details { margin-top: 10px; }
.audit-details :deep(.technical-details-content) { max-height: 300px; overflow: auto; }
.audit-details :deep(.technical-details-content) > div { display: grid; gap: 9px; }
.audit-details article { display: grid; grid-template-columns: 52px 1fr; gap: 8px; }
.audit-details time { color: var(--muted-2); font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.audit-details article span { display: grid; gap: 2px; }
.audit-details b { font-size: 11px; }
.audit-details small { color: var(--muted); font-size: 11px; line-height: 1.4; }
.parent-agent-card, .subagent-card { display: grid; grid-template-columns: 34px 1fr; gap: 9px; align-items: start; padding: 11px; border: 0; border-radius: 9px; background: var(--surface); }
.agent-node { display: grid; width: 30px; height: 30px; place-items: center; color: var(--acid-ink); border: 0; border-radius: 8px; background: var(--acid); font: 800 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.parent-agent-card div { display: grid; gap: 3px; }
.parent-agent-card b, .subagent-card b { color: var(--text); font-size: 11px; }
.parent-agent-card small, .subagent-card small { color: var(--muted); font-size: 11px; }
.subagent-rail { position: relative; display: grid; gap: 7px; padding-left: 13px; }
.subagent-rail::before { position: absolute; top: 0; bottom: 0; left: 0; width: 1px; content: ''; background: var(--border); }
.subagent-card { grid-template-columns: 32px 1fr; }
.subagent-card > div { display: grid; min-width: 0; justify-items: start; gap: 5px; }
.subagent-card .agent-node { width: 28px; height: 28px; color: var(--text); background: var(--surface-raised); }
.subagent-card header { display: flex; width: 100%; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; }
.subagent-card header b { min-width: 0; overflow-wrap: anywhere; }
.subagent-card header i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.subagent-card header i.running { background: var(--acid); }
.subagent-card header i.succeeded { background: var(--success); }
.subagent-card header i.failed, .subagent-card header i.cancelled { background: var(--danger); }
.subagent-card p { max-height: 46px; margin: 1px 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.4; }
.subagent-card small { line-height: 1.45; overflow-wrap: anywhere; }
.subagent-card button { min-height: 32px; margin-top: 2px; padding: 0 4px; color: var(--danger); border: 0; background: transparent; font-size: 11px; }
.inspector-empty { padding: 20px 8px; color: var(--muted); text-align: center; font-size: 11px; line-height: 1.5; }
.computer-panel { display: grid; gap: 10px; }
.computer-panel > header { margin: 0; }
.computer-panel header div { display: grid; gap: 2px; }
.computer-panel header small, .computer-panel > small { color: var(--muted); font-size: 11px; line-height: 1.5; }
.computer-screen { position: relative; min-height: 220px; overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); }
.novnc-screen { width: 100%; min-height: 220px; outline: none; }
.novnc-screen:focus-visible, .approval-card > input:focus-visible { outline: 2px solid var(--acid); outline-offset: 2px; }
.novnc-screen :deep(canvas) { max-width: 100%; }
.screen-placeholder { display: grid; min-height: 220px; place-content: center; place-items: center; gap: 9px; color: var(--muted); }
.screen-placeholder svg { width: 20px; height: 20px; color: var(--acid-text); }
.screen-placeholder span { font-size: 11px; }
.computer-panel > button, .preview-control { min-height: 36px; color: var(--acid-ink); border: 0; border-radius: 8px; background: var(--acid); font-size: 11px; font-weight: 700; }
.computer-panel > button.return-control { color: var(--text); background: var(--surface); }
.technical-list { display: grid; gap: 7px; margin: 0; }
.technical-list > div { display: flex; justify-content: space-between; gap: 10px; }
.technical-list dt { color: var(--muted); font-size: 11px; }
.technical-list dd { min-width: 0; max-width: 66%; margin: 0; overflow-wrap: anywhere; color: var(--text); font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.file-list { display: grid; gap: 4px; }
.file-list a { display: grid; grid-template-columns: 34px 1fr 16px; gap: 8px; align-items: center; padding: 8px; color: inherit; border-radius: 8px; text-decoration: none; }
.file-list a:hover { background: var(--surface-raised); }
.file-list a > span { color: var(--acid-text); font: 700 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.file-list a div { display: grid; min-width: 0; gap: 2px; }
.file-list b { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.file-list small, .file-list em { color: var(--muted); font-size: 11px; font-style: normal; }
.file-list em.passed { color: var(--success); }
.preview-control { width: 100%; }
.preview-modal { position: fixed; z-index: 500; inset: 16px; display: grid; grid-template-rows: auto 1fr; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); box-shadow: 0 24px 100px color-mix(in srgb, var(--bg) 70%, transparent); }
.preview-modal header { display: flex; min-height: 50px; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.preview-modal header button { display: grid; width: 34px; height: 34px; place-items: center; color: var(--text); border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.preview-modal iframe { width: 100%; height: 100%; border: 0; background: #fff; }
.sr-only { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

@media (max-width: 800px) {
  .conversation-scroll, .run-notice, .message-composer { width: min(100% - 24px, 780px); }
  .conversation-scroll { padding-top: 24px; }
  .user-message { max-width: 88%; }
  .message-composer { margin-bottom: max(10px,env(safe-area-inset-bottom)); }
  .message-composer textarea { min-height: 74px; font-size: 16px; }
  .approval-card > input { min-height: 44px; font-size: 16px; }
  .message-composer button, .approval-card button, .computer-panel > button, .preview-control, .subagent-card button { min-width: 44px; min-height: 44px; }
  .retry-required { align-items: stretch; flex-direction: column; }
  .retry-required button { min-height: 44px; }
  .run-controls button { width: 44px; padding: 0; justify-content: center; font-size: 0; }
  .run-controls svg { width: 16px; }
  .preview-modal { inset: 0; border: 0; border-radius: 0; }
}
@media (max-width: 960px) {
  .run-controls button { width: 44px; min-height: 44px; padding: 0; justify-content: center; font-size: 0; }
  .run-controls svg { width: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .budget-card > div span { transition: none; }
}
</style>
