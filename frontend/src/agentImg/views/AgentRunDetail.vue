<template>
  <div class="run-page">
    <TitleBar />
    <main class="run-shell">
      <header class="run-header">
        <div>
          <router-link to="/artigen/agent" class="back">← {{ zh ? '全部 Agent 任务' : 'All agent runs' }}</router-link>
          <div class="status-line">
            <span class="pulse" :class="run?.status"></span>
            <strong>{{ run ? statusLabel(run.status) : (zh ? '读取中' : 'Loading') }}</strong>
            <code>{{ shortId }}</code>
          </div>
        </div>
        <div v-if="run" class="controls">
          <button
            v-if="canPause"
            type="button"
            :disabled="controlBusy"
            @click="control('pause')"
          >
            Ⅱ {{ zh ? '暂停' : 'Pause' }}
          </button>
          <button
            v-if="canResume"
            class="resume"
            type="button"
            :disabled="controlBusy"
            @click="control('resume')"
          >
            ▶ {{ zh ? '恢复' : 'Resume' }}
          </button>
          <button
            v-if="!terminal"
            class="danger"
            :class="{ armed: stopArmed }"
            type="button"
            :disabled="controlBusy"
            @click="requestCancel"
          >
            ■ {{
              stopArmed
                ? (zh ? '再次点击，确认停止' : 'Click again to stop')
                : (zh ? '停止' : 'Stop')
            }}
          </button>
        </div>
      </header>

      <section v-if="run" class="budget-bar">
        <div>
          <span>{{ zh ? '已用' : 'Used' }}</span>
          <strong>{{ run.budget.used.toFixed(1) }}</strong>
        </div>
        <div>
          <span>{{ zh ? '已冻结' : 'Held' }}</span>
          <strong>{{ run.budget.frozen }}</strong>
        </div>
        <div>
          <span>{{ zh ? '预计剩余' : 'Est. remaining' }}</span>
          <strong>{{ budgetRemaining.toFixed(1) }}</strong>
        </div>
        <div class="budget-track">
          <span :style="{ width: budgetPercent + '%' }"></span>
        </div>
        <div>
          <span>{{ zh ? '最高预算' : 'Maximum' }}</span>
          <strong>{{ run.budget.maximum }}</strong>
        </div>
      </section>

      <div v-if="notice || failureText" class="notice">{{ notice || failureText }}</div>

      <section v-if="run" class="run-grid">
        <aside class="conversation pane">
          <div class="pane-head">
            <div>
              <p>01 / {{ zh ? '任务' : 'TASK' }}</p>
              <h2>{{ zh ? '对话与审批' : 'Conversation & approvals' }}</h2>
            </div>
          </div>
          <article v-if="run.objective" class="objective-card">
            <span>{{ zh ? '你的目标' : 'Your objective' }}</span>
            <p>{{ run.objective }}</p>
          </article>

          <div class="plan">
            <div
              v-for="stage in stages"
              :key="stage.id"
              :class="{ active: stage.active, done: stage.done }"
            >
              <span>{{ stage.done ? '✓' : stage.index }}</span>
              <div>
                <strong>{{ stage.label }}</strong>
                <small>{{ stage.description }}</small>
              </div>
            </div>
          </div>

          <article
            v-for="approval in pendingApprovals"
            :key="approval.approvalId"
            class="approval"
          >
            <span>{{ zh ? '需要确认' : 'Approval required' }}</span>
            <strong>{{ actionLabel(approval.actionType) }}</strong>
            <p>{{ approval.changeSummary }}</p>
            <dl class="approval-context">
              <div v-if="approval.evidenceSummary">
                <dt>{{ zh ? '为什么需要' : 'Evidence' }}</dt>
                <dd>{{ approval.evidenceSummary }}</dd>
              </div>
              <div v-if="approval.impactSummary">
                <dt>{{ zh ? '批准后会发生' : 'Impact' }}</dt>
                <dd>{{ approval.impactSummary }}</dd>
              </div>
              <div v-if="approval.rollbackSummary">
                <dt>{{ zh ? '撤销方式' : 'Rollback' }}</dt>
                <dd>{{ approval.rollbackSummary }}</dd>
              </div>
            </dl>
            <small v-if="approval.recipient">
              {{ zh ? '目标：' : 'Target: ' }}{{ approval.recipient }}
            </small>
            <small class="approval-operation">
              {{ zh ? '仅批准这一次' : 'One-time approval' }}
              · #{{ approval.approvalId.slice(0, 8) }}
              · {{ zh ? '到期' : 'expires' }} {{ formatTime(approval.expiresAt) }}
            </small>
            <small class="approval-expiry">
              {{
                zh
                  ? '到期未处理会停止任务；保留已实际使用费用，释放剩余冻结点数。'
                  : 'If this expires, the run stops. Used costs remain and unused held credits are released.'
              }}
            </small>
            <input
              v-model.trim="approvalReasons[approval.approvalId]"
              class="approval-reason"
              type="text"
              maxlength="500"
              :placeholder="zh ? '拒绝原因（可选，帮助 Agent 调整）' : 'Reason for denial (optional)'"
            />
            <div>
              <button
                type="button"
                :disabled="approvalBusyId === approval.approvalId"
                @click="decide(approval.approvalId, 'denied')"
              >
                {{ zh ? '拒绝' : 'Deny' }}
              </button>
              <button
                v-if="approval.riskLevel === 'blocked'"
                class="approve"
                type="button"
                :disabled="approvalBusyId === approval.approvalId"
                @click="beginTakeover(approval.approvalId)"
              >
                {{ zh ? '接管云电脑' : 'Take over desktop' }}
              </button>
              <button
                v-else
                class="approve"
                type="button"
                :disabled="approvalBusyId === approval.approvalId"
                @click="decide(approval.approvalId, 'approved')"
              >
                {{ zh ? '批准这一次' : 'Approve once' }}
              </button>
            </div>
          </article>

          <div class="messages">
            <article v-for="event in conversationEvents" :key="event.eventId">
              <span>{{ event.type.startsWith('run.input') ? (zh ? '你' : 'You') : 'Agent' }}</span>
              <p>{{ event.summary }}</p>
              <time>{{ formatTime(event.createdAt) }}</time>
            </article>
          </div>

          <form class="input-box" @submit.prevent="sendInput">
            <textarea
              v-model.trim="message"
              rows="3"
              :disabled="terminal || sending"
              :placeholder="zh ? '补充要求或回答 Agent 的问题…' : 'Add requirements or answer the agent…'"
            />
            <button type="submit" :disabled="!message || terminal || sending">↑</button>
          </form>
        </aside>

        <section class="desktop pane">
          <div class="pane-head">
            <div>
              <p>02 / {{ zh ? '实时云电脑' : 'LIVE DESKTOP' }}</p>
              <h2>{{ run.sandbox.provider }} · {{ run.sandbox.version }}</h2>
            </div>
            <span v-if="takingOver" class="relay-state">{{ zh ? '加密中继已连接' : 'Encrypted relay connected' }}</span>
          </div>
          <div class="screen">
            <div v-show="takingOver" ref="desktopScreen" class="novnc-screen" aria-label="Agent desktop takeover"></div>
            <div v-if="!takingOver" class="screen-empty">
              <span>▧</span>
              <strong>{{ desktopMessage }}</strong>
              <small>{{ zh ? '画面仅在需要密码、OTP 或验证码时，通过一次性票据临时接通。原始 VNC 地址不会发给浏览器。' : 'The screen connects temporarily with a one-time ticket only for passwords, OTPs, or CAPTCHAs. The raw VNC address is never sent to the browser.' }}</small>
            </div>
          </div>
          <div class="desktop-foot">
            <span><i></i>{{ run.status === 'running' ? (zh ? '实时' : 'Live') : statusLabel(run.status) }}</span>
            <span>Linux · 4 GiB · 10 GiB</span>
            <span v-if="run.progress.durableCheckpointSaved" class="checkpoint-safe">
              ✓ {{ zh ? '安全检查点已保存' : 'Safe checkpoint saved' }}
            </span>
            <button
              v-if="takeoverRequired && !takingOver"
              type="button"
              @click="beginTakeover()"
            >
              {{ zh ? '接管云电脑' : 'Take over desktop' }}
            </button>
            <button
              v-else-if="takingOver"
              class="takeover-done"
              type="button"
              @click="finishTakeover"
            >
              {{ zh ? '我已完成，交还 Agent' : 'Done, return to Agent' }}
            </button>
            <button v-else type="button" disabled>{{ zh ? '无需接管' : 'No takeover needed' }}</button>
          </div>
        </section>

        <aside class="artifacts pane">
          <div class="pane-head">
            <div>
              <p>03 / {{ zh ? '交付物' : 'DELIVERABLES' }}</p>
              <h2>{{ artifacts.length }} {{ zh ? '个文件' : 'files' }}</h2>
            </div>
          </div>
          <div v-if="!artifacts.length" class="artifact-empty">
            <span>◇</span>
            <strong>{{ zh ? '还没有可交付文件' : 'No deliverables yet' }}</strong>
            <small>{{ zh ? '文件生成后会先验证，再出现在这里。' : 'Files appear here only after verification.' }}</small>
          </div>
          <a
            v-for="artifact in artifacts"
            v-else
            :key="artifact.artifactId"
            class="artifact-card"
            :href="agentAssetUrl(artifact)"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="file-code">{{ fileCode(artifact.mimeType) }}</span>
            <div>
              <strong>{{ artifact.filename }}</strong>
              <small>{{ formatBytes(artifact.byteSize) }} · v{{ artifact.version }}</small>
              <em :class="artifact.verificationStatus">
                {{ artifact.verificationStatus === 'passed' ? '✓ ' + (zh ? '已验证' : 'Verified') : artifact.verificationStatus }}
              </em>
            </div>
            <b>↓</b>
          </a>
          <button
            v-for="artifact in websiteArtifacts"
            :key="`preview:${artifact.artifactId}`"
            class="preview-button"
            type="button"
            @click="previewWebsite(artifact)"
          >
            ◉ {{ zh ? `在线预览 ${artifact.filename}` : `Preview ${artifact.filename}` }}
          </button>
          <div v-if="run.progress.checklist && Object.keys(run.progress.checklist).length" class="checklist">
            <strong>{{ zh ? '完成检查' : 'Completion check' }}</strong>
            <span v-for="(value, key) in run.progress.checklist" :key="key">
              <i :class="{ pass: value === true }">{{ value === true ? '✓' : '·' }}</i>
              {{ checklistLabel(String(key)) }}
            </span>
          </div>
        </aside>
      </section>

      <section v-if="run" class="timeline pane">
        <div class="pane-head">
          <div>
            <p>04 / {{ zh ? '审计时间线' : 'AUDIT TIMELINE' }}</p>
            <h2>{{ events.length }} events</h2>
          </div>
          <span>{{ run.progress.stepCount }}/{{ run.progress.maxSteps }} steps</span>
        </div>
        <div class="event-list">
          <article v-for="event in events" :key="event.eventId">
            <time>{{ formatTime(event.createdAt) }}</time>
            <span></span>
            <div>
              <strong>{{ eventLabel(event.type) }}</strong>
              <p>{{ event.summary }}</p>
            </div>
            <code>#{{ event.eventId }}</code>
          </article>
        </div>
      </section>
      <section v-if="previewHtml" class="preview-modal" role="dialog" aria-modal="true">
        <header>
          <strong>{{ previewName }}</strong>
          <button type="button" @click="closePreview">×</button>
        </header>
        <iframe
          :srcdoc="previewHtml"
          :title="previewName"
          sandbox="allow-scripts"
          referrerpolicy="no-referrer"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import RFB from '@novnc/novnc/lib/rfb';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import TitleBar from '../components/TitleBar.vue';
import {
  agentAssetUrl,
  controlAgentRun,
  createAgentDesktopTicket,
  getAgentRun,
  loadAgentWebsitePreview,
  openAgentEventStream,
  submitAgentInput,
  type AgentApproval,
  type AgentArtifact,
  type AgentEvent,
  type AgentRun,
  type AgentRunStatus
} from '../services/agentRuns';

const route = useRoute();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const zh = computed(() => currentLang.value === 'zh');
const runId = computed(() => String(route.params.runId || ''));
const run = ref<AgentRun | null>(null);
const events = ref<AgentEvent[]>([]);
const message = ref('');
const notice = ref('');
const controlBusy = ref(false);
const sending = ref(false);
const approvalBusyId = ref('');
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
const canPause = computed(() => ['queued', 'provisioning', 'running', 'waiting_user'].includes(run.value?.status || ''));
const canResume = computed(() => run.value?.status === 'paused');
const shortId = computed(() => runId.value ? runId.value.slice(0, 8) : '—');
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
    event.type.includes('approval') ||
    event.type.includes('takeover') ||
    event.type === 'run.failed' ||
    event.type === 'run.succeeded'
  )
);
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
    } catch (error) {
      notice.value = errorText(error || 'AGENT_RUN_LOAD_FAILED');
    } finally {
      loadInFlight = null;
    }
  })();
  return loadInFlight;
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
    'takeover.ended': ['接管已结束', 'Takeover ended']
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
const checklistLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

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
.run-page { min-height: 100vh; color: #f4f6f0; background: #090b0c; }.run-shell { width: min(1600px, calc(100% - 32px)); margin: 0 auto; padding: 25px 0 70px; }
.run-header { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }.back { display: inline-block; margin-bottom: 14px; color: #7c8389; font-size: 12px; text-decoration: none; }.status-line { display: flex; align-items: center; gap: 10px; }.status-line strong { font-size: 25px; }.status-line code { color: #666d72; }.pulse { width: 9px; height: 9px; border-radius: 50%; background: #777; }.pulse.running,.pulse.provisioning,.pulse.verifying { background: #ccff00; box-shadow: 0 0 12px #ccff00; }.pulse.succeeded { background: #55e292; }.pulse.failed,.pulse.cancelled { background: #ff6d63; }.pulse.waiting_user { background: #ffb84d; }
.controls { display: flex; gap: 8px; }.controls button,.desktop-foot button { min-height: 38px; padding: 0 14px; border: 1px solid #383d41; color: #d8dcdf; background: #15181a; }.controls .resume { color: #0a0c0d; border-color: #ccff00; background: #ccff00; }.controls .danger { color: #ff9289; border-color: #66342f; }.controls .danger.armed { color: #0b0c0d; border-color: #ff7f73; background: #ff7f73; }
.budget-bar { display: flex; align-items: center; gap: 20px; padding: 13px 16px; border: 1px solid #292d30; background: #111416; }.budget-bar > div:not(.budget-track) { display: grid; grid-template-columns: auto auto; gap: 6px; font: 11px monospace; }.budget-bar span { color: #747b80; }.budget-bar strong { color: #f3f5f0; }.budget-track { flex: 1; height: 4px; overflow: hidden; background: #262a2d; }.budget-track span { display: block; height: 100%; background: #ccff00; transition: width .3s ease; }
.notice { margin-top: 12px; padding: 10px 14px; color: #ff9d94; border: 1px solid #5c302c; background: #21120f; font: 12px monospace; }
.run-grid { display: grid; grid-template-columns: minmax(260px,.65fr) minmax(500px,1.5fr) minmax(260px,.65fr); gap: 12px; margin-top: 12px; }.pane { border: 1px solid #292d30; background: #111416; }.conversation,.desktop,.artifacts { min-height: 620px; }.conversation,.artifacts { padding: 18px; }.desktop { display: flex; flex-direction: column; padding: 18px; }
.pane-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #2a2e31; }.pane-head p { margin: 0 0 7px; color: #ccff00; font: 700 10px monospace; letter-spacing: .08em; }.pane-head h2 { margin: 0; font-size: 15px; }.pane-head a { color: #ccff00; font-size: 11px; text-decoration: none; }
.objective-card { margin: 14px 0 0; padding: 12px; border: 1px solid #2a2e31; background: #101214; }.objective-card span { color: #ccff00; font: 9px monospace; letter-spacing: .12em; text-transform: uppercase; }.objective-card p { max-height: 132px; margin: 8px 0 0; overflow: auto; color: #c9cdd0; font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
.plan { display: grid; padding: 14px 0; }.plan > div { display: flex; gap: 10px; padding: 9px 0; opacity: .4; }.plan > div.active,.plan > div.done { opacity: 1; }.plan > div > span { display: grid; place-items: center; flex: 0 0 27px; height: 27px; border: 1px solid #3b4044; color: #787f84; font: 9px monospace; }.plan > div.active > span { color: #080a0b; border-color: #ccff00; background: #ccff00; }.plan > div.done > span { color: #ccff00; border-color: #617711; }.plan div div { display: grid; gap: 3px; }.plan strong { font-size: 11px; }.plan small { color: #6d7479; font-size: 9px; }
.approval { margin-bottom: 12px; padding: 14px; border: 1px solid #83641c; background: #211c0d; }.approval > span { color: #ffca55; font: 700 9px monospace; text-transform: uppercase; }.approval > strong { display: block; margin-top: 6px; }.approval p { color: #c7bea8; font-size: 11px; line-height: 1.5; }.approval small { display: block; margin-top: 7px; color: #817963; }.approval > div { display: flex; gap: 7px; margin-top: 12px; }.approval button { flex: 1; min-height: 34px; border: 1px solid #554c35; color: #ddd4bd; background: transparent; font-size: 10px; }.approval button:disabled { opacity: .5; cursor: wait; }.approval .approve { color: #101207; border-color: #ccff00; background: #ccff00; }.approval-context { display: grid; gap: 7px; margin: 10px 0 0; }.approval-context div { padding: 8px; border-left: 2px solid #5c5130; background: #19160d; }.approval-context dt { color: #ffca55; font: 700 8px monospace; text-transform: uppercase; }.approval-context dd { margin: 4px 0 0; color: #a9a18e; font-size: 9px; line-height: 1.45; }.approval-operation { font-family: monospace; }.approval-reason { width: 100%; min-height: 34px; box-sizing: border-box; margin-top: 10px; padding: 0 9px; color: #e9e5dc; border: 1px solid #514933; background: #120f09; font-size: 10px; }
.messages { max-height: 190px; overflow: auto; border-top: 1px solid #292d30; }.messages article { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; padding: 10px 0; border-bottom: 1px solid #222629; }.messages span { color: #ccff00; font: 9px monospace; }.messages p { margin: 0; color: #a5abb0; font-size: 10px; line-height: 1.45; }.messages time { grid-column: 2; color: #555c61; font: 8px monospace; }
.input-box { position: relative; margin-top: 12px; }.input-box textarea { width: 100%; box-sizing: border-box; resize: none; padding: 11px 40px 11px 11px; border: 1px solid #363b3f; color: #f4f6f0; background: #0a0d0e; font: 11px/1.5 inherit; }.input-box button { position: absolute; right: 7px; bottom: 7px; width: 28px; height: 28px; border: 0; color: #090b0c; background: #ccff00; }
.screen { position: relative; flex: 1; min-height: 460px; margin-top: 14px; overflow: hidden; border: 1px solid #303538; background: #070909; }.novnc-screen { width: 100%; min-height: 500px; height: 100%; outline: none; }.novnc-screen :deep(canvas) { max-width: 100%; }.screen-empty { display: grid; place-items: center; align-content: center; gap: 10px; height: 100%; min-height: 500px; text-align: center; }.screen-empty > span { color: #ccff00; font-size: 50px; }.screen-empty small { max-width: 360px; color: #61686d; font-size: 10px; line-height: 1.5; }.relay-state { color: #66dd9b; font: 9px monospace; }
.desktop-foot { display: flex; align-items: center; gap: 18px; padding-top: 12px; color: #777e83; font: 9px monospace; }.desktop-foot span:first-child { color: #cbd0d3; }.desktop-foot i { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #ccff00; }.desktop-foot button { margin-left: auto; font-size: 9px; opacity: .5; }
.desktop-foot .checkpoint-safe { color: #66dd9b; }
.artifact-empty { display: grid; place-items: center; gap: 8px; min-height: 250px; text-align: center; color: #8c9398; }.artifact-empty > span { color: #ccff00; font-size: 40px; }.artifact-empty small { color: #62696e; font-size: 10px; }
.artifact-card { display: grid; grid-template-columns: 42px 1fr auto; gap: 10px; align-items: center; padding: 13px 0; color: inherit; text-decoration: none; border-bottom: 1px solid #292d30; }.file-code { display: grid; place-items: center; height: 42px; border: 1px solid #3a4044; color: #ccff00; font: 800 9px monospace; }.artifact-card div { min-width: 0; display: grid; gap: 3px; }.artifact-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }.artifact-card small { color: #6f767b; font-size: 9px; }.artifact-card em { color: #858c91; font: normal 9px monospace; }.artifact-card em.passed { color: #64dd98; }.artifact-card b { color: #ccff00; }
.preview-button { width: 100%; margin-top: 8px; padding: 9px; border: 1px solid #526617; color: #ccff00; background: #121807; font-size: 10px; text-align: left; }.preview-modal { position: fixed; z-index: 10000; inset: 18px; display: grid; grid-template-rows: auto 1fr; border: 1px solid #41474b; background: #090b0c; box-shadow: 0 20px 80px #000c; }.preview-modal header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #303538; }.preview-modal header button { width: 34px; height: 34px; border: 1px solid #454b50; color: #fff; background: #16191b; font-size: 20px; }.preview-modal iframe { width: 100%; height: 100%; border: 0; background: #fff; }
.checklist { display: grid; gap: 8px; margin-top: 18px; padding: 13px; background: #0c0f10; }.checklist > strong { margin-bottom: 4px; font-size: 11px; }.checklist span { color: #777e83; font-size: 9px; }.checklist i { display: inline-grid; place-items: center; width: 15px; height: 15px; margin-right: 5px; border: 1px solid #34393d; font-style: normal; }.checklist i.pass { color: #ccff00; border-color: #5f7415; }
.timeline { margin-top: 12px; padding: 18px; }.timeline .pane-head > span { color: #747b80; font: 10px monospace; }.event-list { max-height: 330px; overflow: auto; }.event-list article { display: grid; grid-template-columns: 75px 12px 1fr auto; gap: 12px; align-items: start; padding: 12px 0; border-bottom: 1px solid #25292c; }.event-list time,.event-list code { color: #5f666b; font: 9px monospace; }.event-list article > span { width: 6px; height: 6px; margin-top: 4px; border-radius: 50%; background: #ccff00; }.event-list strong { font-size: 10px; }.event-list p { margin: 4px 0 0; color: #838a8f; font-size: 10px; }
@media (max-width: 1150px) { .run-grid { grid-template-columns: 1fr 1fr; }.desktop { grid-column: 1 / -1; grid-row: 1; }.conversation,.artifacts { min-height: auto; } }
@media (max-width: 700px) { .run-shell { width: min(100% - 20px,1600px); }.run-header,.budget-bar { align-items: stretch; flex-direction: column; }.controls button { flex: 1; }.budget-bar { gap: 9px; }.run-grid { grid-template-columns: 1fr; }.desktop { grid-column: auto; }.conversation,.desktop,.artifacts { min-height: auto; }.screen,.novnc-screen,.screen-empty { min-height: 360px; }.desktop-foot { flex-wrap: wrap; }.desktop-foot button { width: 100%; margin-left: 0; } }
</style>
