<template>
  <AgentWorkspaceShell
    :project-id="run?.projectId"
    :artifacts="artifacts"
    :zh="zh"
    :title="run?.objectivePreview || (zh ? 'Agent 运行' : 'Agent run')"
    subtitle=""
    :status-label="run ? statusLabel(run.status) : loadError ? (zh ? '读取失败' : 'Could not load') : (zh ? '读取中' : 'Loading')"
    :status-tone="workspaceTone"
    :task-cost-label="run ? `${zh ? '已用' : 'Used'} ${run.budget.used.toFixed(1)} / ${run.budget.maximum} ${zh ? '点' : 'credits'}` : ''"
    :badges="{ subagents: activeSubagents, computer: takeoverRequired ? 1 : 0, files: artifacts.length, plan: pendingApprovals.length }"
    :live-announcement="loadError || notice || failureText"
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
          <span><b>{{ item.objectivePreview || (zh ? '未命名任务' : 'Untitled task') }}</b><small>{{ statusLabel(item.status) }} · {{ formatHistoryDate(item.updatedAt) }}</small></span>
        </router-link>
        <div v-if="!filteredRuns(search).length" class="history-empty">{{ zh ? '没有匹配任务' : 'No matching runs' }}</div>
      </div>
    </template>

    <template #topbar-actions>
      <div v-if="run" class="run-controls">
        <button v-if="canPause" type="button" :disabled="controlBusy" :aria-label="zh ? '暂停' : 'Pause'" @click="control('pause')">
          <WorkspaceIcon name="pause" />
          <span>{{ zh ? '暂停' : 'Pause' }}</span>
        </button>
        <button v-if="canResume" class="primary-control" type="button" :disabled="controlBusy" :aria-label="retryRequired ? (zh ? '重试' : 'Retry') : (zh ? '恢复' : 'Resume')" @click="control('resume')">
          <WorkspaceIcon name="play" />
          <span>{{ retryRequired ? (zh ? '重试' : 'Retry') : (zh ? '恢复' : 'Resume') }}</span>
        </button>
        <button v-if="!terminal" class="danger-control" :class="{ armed: stopArmed }" type="button" :disabled="controlBusy" :aria-label="stopArmed ? (zh ? '确认停止' : 'Confirm stop') : (zh ? '停止' : 'Stop')" @click="requestCancel">
          <WorkspaceIcon name="stop" />
          <span>{{ stopArmed ? (zh ? '确认停止' : 'Confirm stop') : (zh ? '停止' : 'Stop') }}</span>
        </button>
      </div>
    </template>

    <section v-if="!run" class="run-load-state" :aria-busy="loadingRun">
      <template v-if="loadError">
        <WorkspaceIcon name="file" :size="20" />
        <h1>{{ zh ? '任务暂时无法打开' : 'This task could not open' }}</h1>
        <p role="alert">{{ loadError }}</p>
        <div class="load-actions">
          <router-link v-if="loadErrorKind === 'auth'" :to="{ path: '/login', query: { returnTo: route.fullPath } }">{{ zh ? '重新登录' : 'Sign in again' }}</router-link>
          <button v-else-if="loadErrorKind !== 'not-found'" type="button" :disabled="loadingRun" @click="load()">{{ loadingRun ? (zh ? '正在重试…' : 'Retrying…') : (zh ? '重新读取任务' : 'Retry loading') }}</button>
          <router-link to="/artigen/agent">{{ zh ? '返回任务历史' : 'Back to task history' }}</router-link>
        </div>
      </template>
      <template v-else><h1>{{ zh ? '正在读取任务…' : 'Loading this task…' }}</h1><p role="status">{{ zh ? '读取完成后会显示已有进度和成果。' : 'Your saved progress and results will appear here.' }}</p></template>
    </section>
    <section v-else class="conversation-workspace">
      <div ref="scrollArea" class="conversation-scroll" @scroll="onConversationScroll">
        <details class="run-progress-panel">
          <summary class="run-progress-header">
            <strong :title="currentAction">{{ currentAction }}</strong>
            <span>{{ run.progress.stepCount }} / {{ run.progress.maxSteps }} {{ zh ? '步' : 'steps' }}</span>
            <WorkspaceIcon name="list" :size="16" />
          </summary>
          <div v-if="phaseStages.length" class="phase-track">
            <span v-for="stage in phaseStages" :key="stage.id" :class="{ active: stage.active, done: stage.done }"><i></i>{{ stage.label }}</span>
          </div>
        </details>
        <section v-if="run.progress.clarificationRequired && run.progress.clarification" class="clarification-card" aria-live="assertive">
          <span class="progress-kicker">{{ zh ? '需要你的输入' : 'Needs your input' }}</span>
          <h2>{{ run.progress.clarification.question }}</h2>
          <div class="quick-answers">
            <button v-for="option in run.progress.clarification.options || []" :key="option" type="button" @click="submitClarification(option)">{{ option }}</button>
          </div>
        </section>
        <article class="message user-message">
          <header><span>{{ zh ? '你' : 'You' }}</span><time>{{ formatTime(run.createdAt) }}</time></header>
          <p>{{ run.objective }}</p>
        </article>

        <article class="message agent-message">
          <span class="agent-avatar" aria-hidden="true">A</span>
          <div>
            <header><span>Artigen Agent</span><small>{{ statusLabel(run.status) }}</small></header>
            <p>{{ runSummary }}</p>
            <dl v-if="terminal" class="settlement-summary">
              <div><dt>{{ zh ? '已结算' : 'Charged' }}</dt><dd>{{ run.budget.charged }} {{ zh ? '点' : 'credits' }}</dd></div>
              <div><dt>{{ zh ? '已退还' : 'Refunded' }}</dt><dd>{{ run.budget.refunded }} {{ zh ? '点' : 'credits' }}</dd></div>
              <div><dt>{{ zh ? '已释放冻结' : 'Released hold' }}</dt><dd>{{ run.budget.released }} {{ zh ? '点' : 'credits' }}</dd></div>
            </dl>
          </div>
        </article>

        <p v-if="expiredApprovals.length" class="approval-expired" role="status">{{ zh ? '有审批已过期，不能再批准；请刷新任务查看最新状态。' : 'An approval expired and can no longer be granted. Refresh for the current status.' }}</p>

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
            <button type="button" :disabled="Boolean(approvalBusyId)" @click="decide(approval.approvalId, 'denied')">{{ zh ? '拒绝' : 'Deny' }}</button>
            <button v-if="approval.riskLevel === 'blocked'" class="approval-primary" type="button" :disabled="Boolean(approvalBusyId)" @click="beginTakeover(approval.approvalId)">{{ zh ? '接管电脑' : 'Take over' }}</button>
            <button v-else class="approval-primary" type="button" :disabled="Boolean(approvalBusyId)" @click="decide(approval.approvalId, 'approved')">{{ zh ? '仅批准这一次' : 'Approve once' }}</button>
          </footer>
        </article>

        <RunConversationStream :run-id="runId" :events="events" :files="conversationFiles" :zh="zh" :terminal="terminal" :subagents="run.subagents" @layout-change="scrollToLatest()" />

        <article v-for="event in conversationEvents.filter(event => event.type !== 'message.created' && !event.type.startsWith('run.input'))" :key="event.eventId" class="message event-message" :class="{ child: event.subagentId }">
          <span class="agent-avatar" aria-hidden="true">{{ event.subagentId ? 'S' : 'A' }}</span>
          <div>
            <header>
              <span>{{ event.subagentId ? (zh ? '子 Agent' : 'Subagent') : event.type.startsWith('run.input') ? (zh ? '你' : 'You') : 'Artigen Agent' }}</span>
              <time>{{ formatTime(event.createdAt) }}</time>
            </header>
            <p>{{ eventSummary(event) }}</p>
          </div>
        </article>

        <div v-if="terminal && artifacts.length" class="delivery-summary">
          <header><span>{{ run.status === 'succeeded' ? (zh ? '交付完成' : 'Delivery complete') : (zh ? '已保留的成果' : 'Saved partial results') }}</span><b>{{ artifacts.length }}</b></header>
          <a v-for="artifact in artifacts" :key="`center-${artifact.artifactId}`" :href="agentAssetUrl(artifact)" target="_blank" rel="noopener noreferrer">
            <span>{{ fileCode(artifact.mimeType) }}</span>
            <div><b>{{ artifact.filename }}</b><small>{{ formatBytes(artifact.byteSize) }} · {{ artifact.verificationStatus }}</small></div>
            <WorkspaceIcon name="download" />
          </a>
        </div>
      </div>

      <p v-if="loadError || notice" class="run-notice" :role="loadError ? 'alert' : 'status'" aria-live="polite">{{ loadError || notice }}</p>
      <p v-if="draftRestored && !terminal" class="draft-restored" role="status">{{ zh ? '已恢复本机草稿。' : 'Your local draft was restored.' }}</p>
      <div class="run-composer">
        <button v-if="hasUnreadUpdates" class="run-new-updates" type="button" @click="scrollToLatest(true)">{{ zh ? '有新内容 · 回到底部' : 'New updates · Jump to latest' }}</button>
        <div v-if="terminal && !message.trim()" class="run-ended-bar" role="group" :aria-label="zh ? '任务结束后的操作' : 'Run ended actions'">
          <span class="run-ended-status" :class="run.status" aria-hidden="true">
            <WorkspaceIcon :name="run.status === 'succeeded' ? 'check' : run.status === 'cancelled' ? 'stop' : 'file'" :size="16" />
          </span>
          <span class="run-ended-copy">
            <strong>{{ run.status === 'failed' ? (zh ? '任务未完成' : 'Run did not complete') : run.status === 'cancelled' ? (zh ? '任务已停止' : 'Run stopped') : (zh ? '任务已完成' : 'Run completed') }}</strong>
            <small>{{ artifacts.length ? (zh ? `已保留 ${artifacts.length} 份成果；执行记录和结算信息仍在此任务中。` : `${artifacts.length} result${artifacts.length === 1 ? '' : 's'} saved; activity and settlement remain here.`) : (zh ? '执行记录和结算信息仍保留在当前任务中。' : 'Activity and settlement remain available in this task.') }}</small>
          </span>
          <router-link class="run-ended-action" :to="run.projectId ? { path: '/artigen/agent', query: { projectId: run.projectId } } : '/artigen/agent'">
            <span>{{ zh ? '新建任务' : 'New task' }}</span>
            <WorkspaceIcon name="arrow-right" :size="16" />
          </router-link>
        </div>
        <ComposerBox
          v-else
          :draft="message"
          :attachments="[]"
          :allow-attachments="false"
          :busy="sending"
          :disabled="terminal"
          :placeholder="terminal ? (zh ? '运行已结束' : 'Run completed') : (zh ? '补充要求或回答 Agent 的问题…' : 'Add requirements or answer the Agent…')"
          :request-label="zh ? '补充要求' : 'Additional instructions'"
          :send-label="run.progress.clarificationRequired ? (zh ? '回复并继续' : 'Reply and continue') : (zh ? '发送' : 'Send')"
          :busy-label="zh ? '正在发送…你可以继续编辑下一条。' : 'Sending… You can draft the next message.'"
          :help-text="terminal ? '' : (zh ? '可补充文字；新文件需在新任务中添加。' : 'Add text here; attach new files when starting a new task.')"
          :keyboard-hint="terminal ? '' : (zh ? 'Enter 发送 · Shift+Enter 换行' : 'Enter to send · Shift+Enter for a new line')"
          input-name="agent-run-input"
          compact
          @update:draft="message = $event"
          @submit="sendInput"
        />
      </div>
    </section>

    <template #environment>
      <div v-if="run" class="inspector-stack">
        <section class="inspector-card run-overview-card">
          <header><span>{{ zh ? '运行概览' : 'Run overview' }}</span><i :class="{ healthy: workspaceTone === 'ready' }"></i></header>
          <dl>
            <div><dt>{{ zh ? '状态' : 'Status' }}</dt><dd>{{ statusLabel(run.status) }}</dd></div>
            <div><dt>{{ zh ? '执行进度' : 'Progress' }}</dt><dd>{{ run.progress.stepCount }} / {{ run.progress.maxSteps }}</dd></div>
            <div><dt>{{ zh ? '已验证交付' : 'Verified files' }}</dt><dd>{{ artifacts.filter((item) => item.verificationStatus === 'passed').length }}</dd></div>
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
            <div><dt>{{ zh ? '父与子文本模型' : 'Parent & child text' }}</dt><dd>{{ run.model.name }}</dd></div>
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
            <span><b>{{ eventLabel(event.type) }}</b><small>{{ eventSummary(event) }}</small></span>
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
              <header>
                <b>{{ child.label || child.role }}</b>
                <span class="subagent-status" :data-status="child.status">
                  <i aria-hidden="true"></i>
                  <span class="subagent-status-label">{{ subagentStatusLabel(child.status) }}</span>
                </span>
              </header>
              <p>{{ child.summary || child.role }}</p>
              <small class="subagent-meta">
                <span>{{ child.progress.stepCount }} / {{ child.progress.maxSteps }} {{ zh ? '步' : 'steps' }}</span>
                <span>{{ child.usage.credits.toFixed(2) }} {{ zh ? '点' : 'cr' }}</span>
              </small>
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
        <button v-for="artifact in websiteArtifacts" :key="`preview:${artifact.artifactId}`" class="preview-control" type="button" @click="previewWebsite(artifact, $event)">{{ zh ? `预览 ${artifact.filename}` : `Preview ${artifact.filename}` }}</button>
      </div>
    </template>

    <section v-if="previewHtml" ref="previewModal" class="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title" @keydown="onPreviewKeydown">
      <header><strong id="preview-modal-title">{{ previewName }}</strong><button ref="previewCloseButton" type="button" :aria-label="zh ? '关闭预览' : 'Close preview'" @click="closePreview"><WorkspaceIcon name="close" :size="18" /></button></header>
      <iframe :srcdoc="previewHtml" :title="previewName" sandbox="allow-scripts" referrerpolicy="no-referrer" />
    </section>
  </AgentWorkspaceShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import RFB from '@novnc/novnc/lib/rfb';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { getCurrentUserId } from '@/login/session';
import { useWorkspaceDraft } from '../composables/useWorkspaceDraft';
import { approvalIsAvailable, useAgentApprovals } from '../composables/useAgentApprovals';
import AgentWorkspaceShell from '../components/workspace/AgentWorkspaceShell.vue';
import TechnicalDetails from '../components/workspace/TechnicalDetails.vue';
import WorkspaceIcon from '../components/workspace/WorkspaceIcon.vue';
import ComposerBox from '../components/designConversation/ComposerBox.vue';
import RunConversationStream from '../components/workspace/RunConversationStream.vue';
import type { WorkspaceFile } from '../services/workspaceFiles';
import { agentEventSummary, isAgentActivity } from '../utils/agentActivity';
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
const loadingRun = ref(true);
const loadError = ref('');
const loadErrorKind = ref<'auth' | 'not-found' | 'unavailable' | null>(null);
const runs = ref<AgentRun[]>([]);
const events = ref<AgentEvent[]>([]);
const conversationFiles = computed<WorkspaceFile[]>(() => artifacts.value.filter(a => a.assetId && a.url).map(a => ({ id: 'artifact:' + a.artifactId, path: a.filename, assetId: a.assetId!, revision: a.version, mimeType: a.mimeType, byteSize: a.byteSize, sha256: a.sha256 || '', url: a.url!, originArtifactId: a.artifactId })));

const scrollArea = ref<HTMLElement | null>(null);
const nearBottom = ref(true);
const hasUnreadUpdates = ref(false);
const message = ref('');
const { restored: draftRestored, discardSaved } = useWorkspaceDraft({ owner: getCurrentUserId, task: () => `run:${runId.value}`, draft: message });
let pendingInput: { runId: string; owner: string; message: string; inputId: string } | null = null;
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
const previewModal = ref<HTMLElement | null>(null);
const previewCloseButton = ref<HTMLButtonElement | null>(null);
let previewReturnFocus: HTMLElement | null = null;
let closeStream: (() => void) | null = null;
let pollTimer: number | null = null;
let eventRefreshTimer: number | null = null;
let stopArmTimer: number | null = null;
let loadInFlight: { runId: string; promise: Promise<void> } | null = null;
let loadRevision = 0;
let disposed = false;
let desktopClient: RFB | null = null;
const eventIds = new Set<string>();

const terminal = computed(() => ['succeeded', 'failed', 'cancelled'].includes(run.value?.status || ''));
const workspaceTone = computed<'ready' | 'busy' | 'warning' | 'offline'>(() => {
  if (!run.value) return 'offline';
  if (['waiting_user', 'paused'].includes(run.value.status) || pendingApprovals.value.length) return 'warning';
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
const { pendingApprovals, expiredApprovals } = useAgentApprovals(() => run.value?.approvals || []);
const failureText = computed(() => run.value?.error?.code ? errorText(run.value.error.code) : '');
const takeoverRequired = computed(() =>
  Boolean(run.value?.sandbox.takeoverAvailable) &&
  pendingApprovals.value.some((approval) => approval.riskLevel === 'blocked')
);
const conversationEvents = computed(() =>
  events.value.filter((event) => !isAgentActivity(event) && (
    event.type.includes('input') ||
    event.type.includes('takeover') ||
    event.type.startsWith('approval.') ||
    event.type === 'run.failed' ||
    event.type === 'run.succeeded'
  ))
);
const currentAction = computed(() => {
  if (run.value?.progress.clarificationRequired) return zh.value ? '等待你的补充' : 'Waiting for your input';
  if (run.value?.status === 'queued') return zh.value ? '等待执行容量' : 'Waiting for capacity';
  if (run.value?.status === 'provisioning') return zh.value ? '正在准备隔离环境' : 'Preparing isolated environment';
  if (run.value?.status === 'verifying') return zh.value ? '正在验证交付结果' : 'Verifying deliverables';
  if (run.value?.status === 'succeeded') return zh.value ? '交付已完成' : 'Delivery complete';
  if (run.value?.status === 'failed') return zh.value ? '任务需要处理' : 'Run needs attention';
  if (run.value?.status === 'cancelled') return zh.value ? '任务已停止' : 'Run stopped';
  if (run.value?.status === 'paused') return zh.value ? '任务已暂停' : 'Run paused';
  if (run.value?.status === 'waiting_user') return zh.value ? '等待你的确认' : 'Waiting for your decision';
  const latest = events.value.at(-1);
  return latest ? agentEventSummary(latest, zh.value) : (zh.value ? 'Agent 正在执行' : 'Agent is working');
});
const phaseStages = computed(() => {
  return (run.value?.progress.plan || []).map((step, index) => ({
    id: `step-${index}`, label: step.label,
    active: step.status === 'in_progress' && !terminal.value,
    done: step.status === 'completed'
  }));
});
const runSummary = computed(() => {
  if (run.value?.status === 'failed') return failureText.value || (zh.value ? '任务未完成，已有成果和记录保留在这里。' : 'The task did not complete. Saved results and records remain available.');
  if (run.value?.status === 'cancelled') return zh.value ? '任务已停止，已有成果和记录保留在这里。' : 'The task stopped. Saved results and records remain available.';
  if (run.value?.status === 'succeeded') return zh.value ? '任务已完成，可以查看下方成果与本次结算。' : 'The task completed. Review the results and settlement below.';
  if (run.value?.status === 'paused') return zh.value ? '任务已暂停。确认后可以恢复执行。' : 'The task is paused. Resume when you are ready.';
  if (run.value?.status === 'waiting_user') return run.value.progress.clarificationRequired
    ? (zh.value ? '需要你补充信息后才能继续。' : 'Your answer is needed before continuing.')
    : (zh.value ? '正在等待你的确认；请查看需要处理的事项。' : 'Your decision is needed. Review the pending action.');
  return run.value?.progress.plan?.length ? (zh.value ? '正在执行已保存的计划。展开当前动作或检查器可查看记录。' : 'Working through the saved plan. Expand the current action or inspector to review the record.') : currentAction.value;
});
const activeSubagents = computed(() => (run.value?.subagents || []).filter((child) => ['queued', 'running'].includes(child.status)).length);
const filteredRuns = (search: string) => {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return runs.value;
  return runs.value.filter((item) => `${item.objectivePreview || ''} ${item.status}`.toLocaleLowerCase().includes(query));
};
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
    AGENT_APPROVAL_EXPIRED: ['关键操作未在时限内确认，任务已停止。', 'A critical action was not confirmed in time. The run stopped.'],
    AGENT_RUN_TERMINAL: ['任务已经结束，不能再执行该操作。', 'This run has already ended.'],
    AGENT_TAKEOVER_APPROVAL_REQUIRED: ['请从对应审批卡片进入接管。', 'Start takeover from its approval card.'],
    AGENT_TAKEOVER_NOT_AVAILABLE: ['当前任务没有可接管的桌面。', 'Desktop takeover is not available for this run.'],
    AGENT_DESKTOP_RELAY_UNAVAILABLE: ['Mac Worker、中继或安全出口尚未就绪，请确认 Mac 醒着且 Docker 正在运行。', 'The Mac worker, relay, or secure egress is not ready. Keep the Mac awake and Docker running.'],
    AGENT_DESKTOP_CONNECTION_FAILED: ['桌面临时中继连接失败，请重新申请接管。', 'The temporary desktop relay failed. Request takeover again.'],
    AGENT_WEBSITE_PREVIEW_FAILED: ['网站预览无法打开，请下载源码包检查。', 'The website preview could not open. Download the source package instead.'],
    AGENT_WEBSITE_ARCHIVE_INVALID: ['网站源码包损坏，验证未通过。', 'The website archive is invalid.'],
    AGENT_BUDGET_EXCEEDED: ['任务达到最高预算，已安全停止。', 'The run reached its budget and stopped safely.'],
    AGENT_TIME_LIMIT_REACHED: ['任务达到最长运行时间，已安全停止。', 'The run reached its time limit and stopped safely.'],
    AGENT_STEP_LIMIT_REACHED: ['任务达到最大步骤数，已安全停止。', 'The run reached its step limit and stopped safely.'],
    AGENT_REPEATED_ACTION_FAILED: ['同一动作连续失败，系统已停止循环。', 'The same action failed repeatedly, so the loop was stopped.'],
    AGENT_SCREEN_STALLED: ['云电脑画面没有变化，系统已停止循环。', 'The desktop stopped changing, so the loop was stopped.'],
    AGENT_REPLAN_LIMIT_REACHED: ['Agent 多次重规划仍无法继续，任务已停止。', 'The agent could not recover after several replans.'],
    AGENT_VERIFICATION_INCOMPLETE: ['交付物没有通过完整性验证，本次不会标记为完成。', 'Deliverables did not pass completion verification.'],
    AGENT_TRAJECTORY_VERIFICATION_FAILED: ['执行过程未通过安全验证，本次不会标记为完成。', 'The execution trace did not pass safety verification.'],
    AGENT_QUEUE_UNAVAILABLE: ['任务队列暂时不可用。', 'The task queue is temporarily unavailable.'],
    AGENT_RUNTIME_FAILED: ['Agent 运行失败，请查看已保留的记录和成果。', 'The agent failed. Review the saved records and results.'],
    AGENT_CANCELLED: ['任务已由你停止。', 'You stopped the run.']
  };
  return labels[code]?.[zh.value ? 0 : 1] || (
    zh.value
      ? '任务发生了意外，系统不会把未验证的结果标记为完成；请稍后重试或联系支持。'
      : 'The run hit an unexpected problem. Unverified work will not be marked complete; try again or contact support.'
  );
};

const load = (targetRunId = runId.value) => {
  if (loadInFlight?.runId === targetRunId) return loadInFlight.promise;
  const revision = ++loadRevision;
  loadingRun.value = true;
  const request: { runId: string; promise: Promise<void> } = {
    runId: targetRunId,
    promise: Promise.resolve()
  };
  loadInFlight = request;
  request.promise = (async () => {
    try {
      const [loadedRun, loadedRuns] = await Promise.allSettled([
        getAgentRun(targetRunId),
        listAgentRuns()
      ]);
      if (disposed || revision !== loadRevision || targetRunId !== runId.value) return;
      if (loadedRun.status === 'rejected') throw loadedRun.reason;
      run.value = loadedRun.value;
      loadError.value = '';
      loadErrorKind.value = null;
      if (loadedRuns.status === 'fulfilled') runs.value = loadedRuns.value;
    } catch (error) {
      if (!disposed && revision === loadRevision && targetRunId === runId.value) {
        const failed = error as { status?: number; code?: string };
        loadErrorKind.value = failed.status === 401 || failed.code === 'LOGIN_REQUIRED' ? 'auth'
          : failed.status === 404 || failed.code === 'AGENT_RUN_NOT_FOUND' ? 'not-found' : 'unavailable';
        loadError.value = loadErrorKind.value === 'auth'
          ? (zh.value ? '登录已失效，请重新登录后读取任务。' : 'Your session expired. Sign in again to load this task.')
          : loadErrorKind.value === 'not-found'
            ? (zh.value ? '任务不存在或无法访问，请从历史选择其他任务。' : 'This task is missing or inaccessible. Choose another task from history.')
            : (zh.value ? '暂时无法读取任务，请重试。已有任务不会因此重新创建。' : 'The task could not load. Retry without creating another task.');
      }
    } finally {
      if (!disposed && revision === loadRevision && targetRunId === runId.value) loadingRun.value = false;
      if (loadInFlight === request) loadInFlight = null;
    }
  })();
  return request.promise;
};

const cancelChild = async (subagentId: string) => {
  const targetRunId = runId.value;
  subagentBusyId.value = subagentId;
  try {
    await cancelAgentSubagent(targetRunId, subagentId);
    if (targetRunId !== runId.value) return;
    notice.value = '';
    await load(targetRunId);
  } catch (error) {
    if (targetRunId === runId.value) {
      notice.value = errorText(error || 'AGENT_SUBAGENT_CANCEL_FAILED');
    }
  } finally {
    if (targetRunId === runId.value) subagentBusyId.value = '';
  }
};

const control = async (action: 'pause' | 'resume' | 'cancel') => {
  const targetRunId = runId.value;
  controlBusy.value = true;
  try {
    const updatedRun = await controlAgentRun(targetRunId, action);
    if (targetRunId !== runId.value) return;
    run.value = updatedRun;
    notice.value = '';
    await load(targetRunId);
  } catch (error) {
    if (targetRunId === runId.value) {
      notice.value = errorText(error || 'AGENT_CONTROL_FAILED');
    }
  } finally {
    if (targetRunId === runId.value) controlBusy.value = false;
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
  if (!message.value.trim() || sending.value || terminal.value || !run.value) return;
  const targetRunId = runId.value;
  const owner = getCurrentUserId();
  const submittedDraft = message.value;
  const submittedMessage = submittedDraft.trim();
  const request = pendingInput?.runId === targetRunId && pendingInput.owner === owner && pendingInput.message === submittedMessage
    ? pendingInput : { runId: targetRunId, owner, message: submittedMessage, inputId: crypto.randomUUID() };
  pendingInput = request;
  sending.value = true;
  notice.value = '';
  try {
    await submitAgentInput(targetRunId, { message: submittedMessage, inputId: request.inputId });
    discardSaved(owner, `run:${targetRunId}`, submittedDraft);
    if (targetRunId !== runId.value || owner !== getCurrentUserId()) return;
    if (pendingInput === request) pendingInput = null;
    if (message.value === submittedDraft) message.value = '';
    await load(targetRunId);
    await scrollToLatest();
  } catch (error) {
    if (targetRunId === runId.value && owner === getCurrentUserId()) {
      notice.value = errorText(error || 'AGENT_INPUT_FAILED');
    }
  } finally {
    if (targetRunId === runId.value) sending.value = false;
  }
};

const submitClarification = async (answer: string) => {
  message.value = answer;
  await sendInput();
};

const decide = async (approvalId: string, decision: 'approved' | 'denied') => {
  if (approvalBusyId.value) return;
  if (!run.value?.approvals?.some((approval) => approval.approvalId === approvalId && approvalIsAvailable(approval))) {
    notice.value = errorText('AGENT_APPROVAL_NOT_AVAILABLE');
    return;
  }
  const targetRunId = runId.value;
  const decisionReason = approvalReasons.value[approvalId]?.trim();
  approvalBusyId.value = approvalId;
  try {
    await submitAgentInput(targetRunId, {
      approvalId,
      decision,
      decisionReason: decision === 'denied' ? decisionReason : undefined
    });
    if (targetRunId !== runId.value) return;
    delete approvalReasons.value[approvalId];
    notice.value = '';
    await load(targetRunId);
  } catch (error) {
    if (targetRunId === runId.value) {
      notice.value = errorText(error || 'AGENT_APPROVAL_FAILED');
    }
  } finally {
    if (targetRunId === runId.value) approvalBusyId.value = '';
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
  if (approvalBusyId.value) return;
  if (!run.value?.sandbox.takeoverAvailable) return;
  const targetRunId = runId.value;
  const target = approvalId || pendingApprovals.value.find(
    (approval) => approval.riskLevel === 'blocked'
  )?.approvalId;
  if (!target) return;
  if (!run.value.approvals?.some((approval) => approval.approvalId === target && approvalIsAvailable(approval))) {
    notice.value = errorText('AGENT_APPROVAL_NOT_AVAILABLE');
    return;
  }
  approvalBusyId.value = target;
  try {
    disconnectDesktop();
    const ticket = await createAgentDesktopTicket(targetRunId, target);
    if (targetRunId !== runId.value) return;
    activeTakeoverApprovalId.value = target;
    takingOver.value = true;
    await nextTick();
    if (targetRunId !== runId.value) return;
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
      if (desktopClient === client && targetRunId === runId.value) {
        disconnectDesktop();
        notice.value = errorText('AGENT_DESKTOP_CONNECTION_FAILED');
      }
    }, { once: true });
    client.addEventListener('disconnect', () => {
      if (desktopClient === client && targetRunId === runId.value) {
        desktopClient = null;
        takingOver.value = false;
        notice.value = errorText('AGENT_DESKTOP_CONNECTION_FAILED');
      }
    }, { once: true });
    notice.value = '';
  } catch (error) {
    if (targetRunId === runId.value) {
      disconnectDesktop();
      activeTakeoverApprovalId.value = '';
      notice.value = errorText(error || 'AGENT_DESKTOP_CONNECTION_FAILED');
    }
  } finally {
    if (targetRunId === runId.value) approvalBusyId.value = '';
  }
};

const finishTakeover = async () => {
  const targetRunId = runId.value;
  const takeoverApprovalId = activeTakeoverApprovalId.value;
  sending.value = true;
  try {
    if (!takeoverApprovalId) {
      throw new Error('AGENT_TAKEOVER_APPROVAL_REQUIRED');
    }
    await submitAgentInput(targetRunId, {
      takeoverEnded: true,
      takeoverApprovalId
    });
    if (targetRunId !== runId.value) return;
    disconnectDesktop();
    activeTakeoverApprovalId.value = '';
    await load(targetRunId);
  } catch (error) {
    if (targetRunId === runId.value) {
      notice.value = errorText(error || 'AGENT_TAKEOVER_END_FAILED');
    }
  } finally {
    if (targetRunId === runId.value) sending.value = false;
  }
};

const previewWebsite = async (artifact: AgentArtifact, event?: MouseEvent) => {
  const targetRunId = runId.value;
  previewReturnFocus = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  try {
    const html = await loadAgentWebsitePreview(artifact);
    if (targetRunId !== runId.value) return;
    previewHtml.value = html;
    previewName.value = artifact.filename;
    await nextTick();
    previewCloseButton.value?.focus({ preventScroll: true });
  } catch (error) {
    if (targetRunId === runId.value) {
      notice.value = errorText(error || 'AGENT_WEBSITE_PREVIEW_FAILED');
    }
  }
};
const closePreview = () => {
  previewHtml.value = '';
  previewName.value = '';
  const target = previewReturnFocus;
  previewReturnFocus = null;
  if (target?.isConnected) void nextTick(() => target.focus({ preventScroll: true }));
};
const previewFocusable = () => Array.from(
  previewModal.value?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],iframe,[tabindex]:not([tabindex="-1"])') || []
).filter((item) => item.offsetParent !== null);
const onPreviewKeydown = (event: KeyboardEvent) => {
  if (!previewModal.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closePreview();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = previewFocusable();
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
const onPreviewWindowKeydown = (event: KeyboardEvent) => {
  if (previewHtml.value && event.key === 'Escape') onPreviewKeydown(event);
};

const onEvent = (event: AgentEvent) => {
  if (event.runId !== runId.value) return;
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

const onConversationScroll = () => {
  const area = scrollArea.value;
  if (!area) return;
  nearBottom.value = area.scrollHeight - area.scrollTop - area.clientHeight < 96;
  if (nearBottom.value) hasUnreadUpdates.value = false;
};
const scrollToLatest = async (force = false) => {
  if (!force && !nearBottom.value) { hasUnreadUpdates.value = true; return; }
  const id = runId.value;
  const owner = getCurrentUserId();
  await nextTick();
  if (disposed || id !== runId.value || owner !== getCurrentUserId()) return;
  if (!force && !nearBottom.value) { hasUnreadUpdates.value = true; return; }
  scrollArea.value?.scrollTo({ top: scrollArea.value.scrollHeight, behavior: 'auto' });
  nearBottom.value = true;
  hasUnreadUpdates.value = false;
};
watch(() => events.value.length, (next, previous) => {
  if (next > previous) void scrollToLatest();
});

const resetSelectedRun = () => {
  const nextRunId = runId.value;
  loadRevision++;
  closeStream?.();
  closeStream = null;
  disconnectDesktop();
  activeTakeoverApprovalId.value = '';
  previewHtml.value = '';
  previewName.value = '';
  previewReturnFocus = null;
  eventIds.clear();
  events.value = [];
  nearBottom.value = true;
  hasUnreadUpdates.value = false;
  run.value = null;
  loadError.value = '';
  loadErrorKind.value = null;
  notice.value = '';
  approvalReasons.value = {};
  approvalBusyId.value = '';
  subagentBusyId.value = '';
  controlBusy.value = false;
  sending.value = false;
  pendingInput = null;
  stopArmed.value = false;
  if (eventRefreshTimer !== null) {
    window.clearTimeout(eventRefreshTimer);
    eventRefreshTimer = null;
  }
  if (stopArmTimer !== null) {
    window.clearTimeout(stopArmTimer);
    stopArmTimer = null;
  }
  void load(nextRunId).then(() => {
    if (!disposed && nextRunId === runId.value) {
      closeStream = openAgentEventStream(nextRunId, { onEvent });
    }
  });
};
watch(runId, resetSelectedRun, { flush: 'sync' });

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
    'tool.call.started': ['工具调用', 'Tool call'],
    'tool.call.completed': ['工具结果', 'Tool result'],
    'verification.started': ['语义核对开始', 'Semantic verification started'],
    'verification.repair_requested': ['需要定向返修', 'Targeted repair requested'],
    'verification.passed': ['语义核对通过', 'Semantic verification passed'],
    'verification.failed': ['语义核对未通过', 'Semantic verification failed'],
    'budget.warning': ['预算计划已收紧', 'Budget plan tightened'],
    'budget.lockdown': ['仅保留验证与交付', 'Verification and delivery only']
  };
  return labels[type]?.[zh.value ? 0 : 1] || type.replace(/\./g, ' / ').toUpperCase();
};
const eventSummary = (event: AgentEvent) => agentEventSummary(event, zh.value);
const formatTime = (value: string) => new Intl.DateTimeFormat(
  zh.value ? 'zh-CN' : 'en-US',
  { hour: '2-digit', minute: '2-digit', second: '2-digit' }
).format(new Date(value));
const formatHistoryDate = (value: string) => new Intl.DateTimeFormat(
  zh.value ? 'zh-CN' : 'en-US',
  { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
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
  window.addEventListener('keydown', onPreviewWindowKeydown);
  window.addEventListener('app-auth-changed', resetSelectedRun);
  const initialRunId = runId.value;
  await load(initialRunId);
  if (!disposed && initialRunId === runId.value) {
    closeStream = openAgentEventStream(initialRunId, { onEvent });
  }
  if (disposed) return;
  pollTimer = window.setInterval(() => {
    if (!terminal.value && !['auth', 'not-found'].includes(loadErrorKind.value || '')) void load();
  }, 5000);
});
onBeforeUnmount(() => {
  disposed = true;
  loadRevision += 1;
  window.removeEventListener('keydown', onPreviewWindowKeydown);
  window.removeEventListener('app-auth-changed', resetSelectedRun);
  disconnectDesktop();
  closeStream?.();
  if (pollTimer !== null) window.clearInterval(pollTimer);
  if (eventRefreshTimer !== null) window.clearTimeout(eventRefreshTimer);
  if (stopArmTimer !== null) window.clearTimeout(stopArmTimer);
});
</script>

<style scoped>
.conversation-workspace { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.conversation-scroll { flex: 1; min-height: 0; width: min(var(--conversation-max), calc(100% - var(--conversation-gutter) * 2)); margin: 0 auto; padding: 28px 0 40px; overflow: auto; overscroll-behavior: contain; scrollbar-color: var(--border) transparent; }
.run-progress-panel { margin-bottom: 26px; padding: 0; border: 0; border-radius: 14px; background: color-mix(in srgb, var(--surface) 82%, transparent); }
.run-progress-header { display: flex; min-height: 48px; align-items: center; padding: 12px 14px; list-style: none; cursor: pointer; justify-content: space-between; gap: 12px; }
.run-progress-header div { display: grid; gap: 4px; }
.progress-kicker { color: var(--acid-text); font-size: 12px; font-weight: 760; letter-spacing: .06em; text-transform: uppercase; }
.run-progress-header strong { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--text); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.run-progress-header > span { color: var(--muted); font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.phase-track { display: grid; gap: 12px; padding: 6px 14px 14px; }
.phase-track span { display: grid; grid-template-columns: 6px 1fr; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
.phase-track i { display: block; width: 6px; height: 6px; border-radius: 99px; background: var(--border); }
.phase-track span.active { color: var(--text); }
.phase-track span.active i { background: var(--acid); box-shadow: 0 0 12px color-mix(in srgb, var(--acid) 44%, transparent); animation: progress-flow 1.6s ease-in-out infinite; }
.phase-track span.done i { background: var(--success); }
.clarification-card { display: grid; gap: 10px; margin: 0 0 26px; padding: 16px; border: 1px solid color-mix(in srgb, var(--warning) 38%, var(--border)); border-radius: 14px; background: color-mix(in srgb, var(--warning) 8%, var(--surface)); }
.clarification-card h2 { margin: 0; color: var(--text); font-size: 15px; line-height: 1.45; }
.quick-answers { display: flex; flex-wrap: wrap; gap: 7px; }
.quick-answers button { min-height: 34px; padding: 0 11px; color: var(--text); border: 1px solid var(--border); border-radius: 8px; background: var(--surface); font-size: 12px; cursor: pointer; }
.quick-answers button:hover, .quick-answers button:focus-visible { border-color: var(--acid); }
@keyframes progress-flow { 50% { opacity: .45; } }
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
.approval-card > header { display: flex; align-items: center; justify-content: space-between; color: var(--warning); font-size: 12px; font-weight: 720; }
.approval-card code { color: var(--muted); font-size: 12px; }
.approval-card h2 { margin: 12px 0 6px; font-size: 14px; }
.approval-card > p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.approval-card dl { display: grid; gap: 0; margin: 12px 0 10px; }
.approval-card dl div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 4px 0; }
.approval-card dt { color: var(--muted); font-size: 12px; font-weight: 620; }
.approval-card dd { margin: 0; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; line-height: 1.4; }
.denial-reason { display: block; margin-bottom: 6px; color: var(--text); font-size: 12px; font-weight: 620; }
.approval-card > input { width: 100%; min-height: 38px; box-sizing: border-box; padding: 0 10px; color: var(--text); border: 1px solid var(--border); border-radius: 8px; background: var(--surface); font-size: 12px; }
.approval-card footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.approval-card button { min-height: 36px; padding: 0 12px; color: var(--text); border: 0; border-radius: 8px; background: var(--surface); font-size: 12px; }
.approval-card .approval-primary { color: var(--acid-ink); background: var(--acid); font-weight: 720; }
.retry-required { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 26px 0; padding: 15px 16px 15px 19px; border-radius: 10px; background: color-mix(in srgb, var(--warning) 7%, var(--surface)); box-shadow: inset 3px 0 var(--warning); }
.retry-required div { display: grid; gap: 5px; }
.retry-required b { color: var(--text); font-size: 13px; }
.retry-required p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.retry-required button { min-height: 36px; flex: 0 0 auto; padding: 0 12px; color: var(--acid-ink); border: 0; border-radius: 8px; background: var(--acid); font-size: 12px; font-weight: 720; }
.delivery-summary { padding: 14px 14px 14px 17px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--success) 6%, var(--surface)); box-shadow: inset 3px 0 var(--success); }
.delivery-summary > header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: var(--success); font-size: 12px; font-weight: 720; }
.delivery-summary > header b { font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.delivery-summary a { display: grid; grid-template-columns: 36px 1fr 18px; gap: 10px; align-items: center; padding: 9px; color: inherit; border-radius: 8px; text-decoration: none; }
.delivery-summary a:hover { background: var(--surface-raised); }
.delivery-summary a > span { color: var(--acid-text); font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.delivery-summary a div { display: grid; gap: 2px; min-width: 0; }
.delivery-summary a b { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.delivery-summary a small { color: var(--muted); font-size: 12px; }
.delivery-summary svg { width: 16px; height: 16px; }
.run-notice { width: min(var(--conversation-max), calc(100% - var(--conversation-gutter) * 2)); margin: 0 auto 10px; padding: 10px 12px; color: var(--danger); border: 0; border-radius: 9px; background: color-mix(in srgb, var(--danger) 7%, var(--surface)); font-size: 12px; }
.run-controls svg, .file-list svg { width: 16px; height: 16px; }
.preview-modal svg { width: 18px; height: 18px; }
.run-controls { display: flex; gap: 5px; }
.run-controls button { display: inline-flex; min-height: 30px; align-items: center; gap: 5px; padding: 0 8px; color: var(--muted); border: 0; border-radius: 7px; background: var(--surface); font-size: 12px; }
.run-controls .primary-control { color: var(--acid-ink); background: var(--acid); }
.run-controls .danger-control { color: var(--danger); }
.run-controls .danger-control.armed { color: #fff; background: var(--danger); }
.history-group { padding: 4px 8px 16px; }
.history-label { padding: 5px 8px 8px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
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
.grant-list { display: flex; flex-wrap: wrap; gap: 5px; }
.grant-list span { display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; color: var(--muted-2); border: 0; border-radius: 6px; background: var(--surface-raised); font-size: 12px; }
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
.execution-spine b { color: var(--text); font-size: 12px; }
.execution-spine span { color: var(--muted); font-size: 12px; line-height: 1.5; }
.audit-details { margin-top: 10px; }
.audit-details :deep(.technical-details-content) { max-height: 300px; overflow: auto; }
.audit-details :deep(.technical-details-content) > div { display: grid; gap: 9px; }
.audit-details article { display: grid; grid-template-columns: 52px 1fr; gap: 8px; }
.audit-details time { color: var(--muted-2); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.audit-details article span { display: grid; gap: 2px; }
.audit-details b { font-size: 12px; }
.audit-details small { color: var(--muted); font-size: 12px; line-height: 1.4; }
.parent-agent-card, .subagent-card { display: grid; grid-template-columns: 34px 1fr; gap: 9px; align-items: start; padding: 11px; border: 0; border-radius: 9px; background: var(--surface); }
.agent-node { display: grid; width: 30px; height: 30px; place-items: center; color: var(--acid-ink); border: 0; border-radius: 8px; background: var(--acid); font: 800 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.parent-agent-card div { display: grid; gap: 3px; }
.parent-agent-card b, .subagent-card b { color: var(--text); font-size: 12px; }
.parent-agent-card small, .subagent-card small { color: var(--muted); font-size: 12px; }
.subagent-rail { position: relative; display: grid; gap: 7px; padding-left: 13px; }
.subagent-rail::before { position: absolute; top: 0; bottom: 0; left: 0; width: 1px; content: ''; background: var(--border); }
.subagent-card { grid-template-columns: 32px 1fr; }
.subagent-card > div { display: grid; min-width: 0; justify-items: start; gap: 5px; }
.subagent-card .agent-node { width: 28px; height: 28px; color: var(--text); background: var(--surface-raised); }
.subagent-card header { display: flex; width: 100%; min-width: 0; align-items: baseline; justify-content: space-between; gap: 8px; }
.subagent-card header b { min-width: 0; overflow-wrap: anywhere; }
.subagent-status { display: inline-flex; flex: none; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; line-height: 1.4; white-space: nowrap; }
.subagent-status i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--muted); }
.subagent-status[data-status="running"] { color: var(--acid-text); }
.subagent-status[data-status="running"] i { background: var(--acid); }
.subagent-status[data-status="succeeded"] { color: var(--success); }
.subagent-status[data-status="succeeded"] i { background: var(--success); }
.subagent-status[data-status="failed"] { color: var(--danger); }
.subagent-status[data-status="failed"] i { background: var(--danger); }
.subagent-status[data-status="cancelled"] { color: var(--danger); }
.subagent-status[data-status="cancelled"] i { background: var(--danger); }
.subagent-card p { max-height: 46px; margin: 1px 0; overflow: hidden; color: var(--muted); font-size: 12px; line-height: 1.4; }
.subagent-card small { line-height: 1.45; overflow-wrap: anywhere; }
.subagent-card .subagent-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-variant-numeric: tabular-nums; }
.subagent-card button { min-height: 32px; margin-top: 2px; padding: 0 4px; color: var(--danger); border: 0; background: transparent; font-size: 12px; }
.inspector-empty { padding: 20px 8px; color: var(--muted); text-align: center; font-size: 12px; line-height: 1.5; }
.computer-panel { display: grid; gap: 10px; }
.computer-panel > header { margin: 0; }
.computer-panel header div { display: grid; gap: 2px; }
.computer-panel header small, .computer-panel > small { color: var(--muted); font-size: 12px; line-height: 1.5; }
.computer-screen { position: relative; min-height: 220px; overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); }
.novnc-screen { width: 100%; min-height: 220px; outline: none; }
.novnc-screen:focus-visible, .approval-card > input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.novnc-screen :deep(canvas) { max-width: 100%; }
.screen-placeholder { display: grid; min-height: 220px; place-content: center; place-items: center; gap: 9px; color: var(--muted); }
.screen-placeholder svg { width: 20px; height: 20px; color: var(--acid-text); }
.screen-placeholder span { font-size: 12px; }
.computer-panel > button, .preview-control { min-height: 36px; color: var(--acid-ink); border: 0; border-radius: 8px; background: var(--acid); font-size: 12px; font-weight: 700; }
.computer-panel > button.return-control { color: var(--text); background: var(--surface); }
.technical-list { display: grid; gap: 7px; margin: 0; }
.technical-list > div { display: flex; justify-content: space-between; gap: 10px; }
.technical-list dt { color: var(--muted); font-size: 12px; }
.technical-list dd { min-width: 0; max-width: 66%; margin: 0; overflow-wrap: anywhere; color: var(--text); font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.file-list { display: grid; gap: 4px; }
.file-list a { display: grid; grid-template-columns: 34px 1fr 16px; gap: 8px; align-items: center; padding: 8px; color: inherit; border-radius: 8px; text-decoration: none; }
.file-list a:hover { background: var(--surface-raised); }
.file-list a > span { color: var(--acid-text); font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.file-list a div { display: grid; min-width: 0; gap: 2px; }
.file-list b { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.file-list small, .file-list em { color: var(--muted); font-size: 12px; font-style: normal; }
.file-list em.passed { color: var(--success); }
.preview-control { width: 100%; }
.preview-modal { position: fixed; z-index: 500; inset: 16px; display: grid; grid-template-rows: auto 1fr; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); box-shadow: 0 24px 100px color-mix(in srgb, var(--bg) 70%, transparent); }
.preview-modal header { display: flex; min-height: 50px; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.preview-modal header button { display: grid; width: 34px; height: 34px; place-items: center; color: var(--text); border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.preview-modal iframe { width: 100%; height: 100%; border: 0; background: #fff; }
.sr-only { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

.run-load-state { display: grid; width: min(var(--conversation-max),calc(100% - var(--conversation-gutter) * 2)); height: 100%; margin: 0 auto; align-content: center; justify-items: start; gap: 16px; }
.run-load-state h1 { margin: 0; font-size: 24px; }
.run-load-state p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.6; }
.load-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.load-actions :is(button,a) { display: inline-flex; align-items: center; min-height: 44px; padding: 10px 14px; border: 0; border-radius: 10px; color: var(--text); font-size: 13px; text-decoration: none; background: var(--surface-raised); cursor: pointer; }
.run-progress-header::-webkit-details-marker { display: none; }
.run-progress-header > span { margin-left: auto; white-space: nowrap; }
.settlement-summary { display: flex; flex-wrap: wrap; gap: 16px; margin: 14px 0 0; }
.settlement-summary div { display: grid; gap: 4px; }
.settlement-summary dt { color: var(--muted); font-size: 12px; }
.settlement-summary dd { margin: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
.approval-expired { color: var(--warning); font-size: 13px; line-height: 1.6; }
.draft-restored { width: min(var(--conversation-max),calc(100% - var(--conversation-gutter) * 2)); margin: 0 auto 8px; color: var(--muted); font-size: 12px; }
.run-notice,.run-composer,.draft-restored { flex: 0 0 auto; }
@media (max-width: 800px) {
  .conversation-scroll, .run-notice, .run-composer { width: min(var(--conversation-max), calc(100% - var(--conversation-gutter) * 2)); }
  .conversation-scroll { padding-top: 24px; }
  .user-message { max-width: 88%; }
  .approval-card > input { min-height: 44px; font-size: 16px; }
  .retry-required { align-items: stretch; flex-direction: column; }
  .retry-required button { min-height: 44px; }
  .run-controls button { width: 44px; padding: 0; justify-content: center; font-size: 0; }
  .run-controls svg { width: 18px; }
  .run-controls button span { display: none; }
  .preview-modal { inset: 0; border: 0; border-radius: 0; }
}
@media (max-width: 960px) {
  .run-controls button { width: 44px; min-height: 44px; padding: 0; justify-content: center; font-size: 0; }
  .run-controls svg { width: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0s !important; animation-duration: 0s !important; animation-iteration-count: 1 !important; }
  .phase-track span.active i { animation: none; }
}

.run-composer { width: min(var(--conversation-max), calc(100% - var(--conversation-gutter) * 2)); margin: 0 auto max(20px,env(safe-area-inset-bottom)); }
.run-new-updates { display: block; min-height: 44px; margin: 0 auto 10px; padding: 9px 14px; color: var(--acid-text); border: 0; border-radius: 9px; font-size: 13px; background: var(--surface-raised); cursor: pointer; }
.run-new-updates:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.run-ended-bar { display: flex; min-height: 68px; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 16px; background: var(--surface); }
.run-ended-status { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: var(--success); background: color-mix(in srgb,var(--success) 12%,transparent); }
.run-ended-status.failed { color: var(--danger); background: color-mix(in srgb,var(--danger) 12%,transparent); }
.run-ended-status.cancelled { color: var(--muted); background: var(--surface-raised); }
.run-ended-copy { display: grid; flex: 1 1 auto; min-width: 0; gap: 3px; }
.run-ended-copy strong { font-size: 13px; font-weight: 620; line-height: 1.35; }
.run-ended-copy small { color: var(--muted); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.run-ended-action { display: inline-flex; min-height: 44px; flex: 0 0 auto; align-items: center; justify-content: center; gap: 8px; padding: 0 13px; border: 0; border-radius: 10px; color: var(--acid-ink); font-size: 13px; font-weight: 620; text-decoration: none; background: var(--acid); }
.run-ended-action:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (max-width: 799px) {
  .run-composer { margin-bottom: max(10px,env(safe-area-inset-bottom)); }
  .approval-card button, .computer-panel > button, .preview-control, .subagent-card button, .quick-answers button, .preview-modal header button { min-width: 44px; min-height: 44px; }
  .run-ended-bar { gap: 9px; padding: 9px; }
  .run-ended-action { gap: 5px; padding: 0 10px; }
}
</style>
