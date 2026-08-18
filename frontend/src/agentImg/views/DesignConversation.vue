<template>
  <AgentWorkspaceShell
    :zh="zh"
    :title="conversation?.title || (zh ? '设计 Agent' : 'Design Agent')"
    :subtitle="executorSummary"
    :status-label="runtimeLabel"
    :status-tone="workspaceStatusTone"
    :credit-label="zh ? '自动上限 ' + (status?.autoCreditCap ?? 50) + ' 点' : 'Auto cap ' + (status?.autoCreditCap ?? 50)"
    :account-label="zh ? '账户与偏好' : 'Account & preferences'"
    :inspector-subtitle="status ? status.model + ' · ' + status.imageModel : 'Qwen3 · Kolors'"
    :badges="inspectorBadges"
    :live-announcement="notice"
    @new-task="newConversation"
    @search="workspaceSearch = $event"
  >
    <template #history>
      <div class="history-group">
        <p>{{ zh ? '今天' : 'Today' }}</p>
        <button
          v-for="item in visibleConversations"
          :key="item.conversationId"
          class="history-item"
          :class="{ active: item.conversationId === conversation?.conversationId }"
          type="button"
          @click="openConversation(item.conversationId)"
        >
          <span class="history-state" :class="{ running: conversationIsRunning(item.conversationId) }"></span>
          <span><b>{{ item.title }}</b><small>{{ formatRelative(item.updatedAt) }}</small></span>
        </button>
        <div v-if="!visibleConversations.length" class="history-empty">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>
          <span>{{ zh ? '任务会保存在这里' : 'Your tasks will appear here' }}</span>
        </div>
      </div>
    </template>

    <template #topbar>
      <div class="conversation-heading">
        <span class="executor-mark" :class="latestExecution?.routeKind || 'reply'"></span>
        <div>
          <strong>{{ conversation?.title || (zh ? '新的设计任务' : 'New design task') }}</strong>
          <small>{{ executorSummary }} · {{ currentCostLabel }}</small>
        </div>
      </div>
    </template>

    <template #topbar-actions>
      <button v-if="conversation" class="quiet-action" type="button" @click="removeCurrentConversation">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l1 14h9l1-14"/></svg>
        <span>{{ zh ? '删除' : 'Delete' }}</span>
      </button>
    </template>

    <section v-if="!hasConversation" class="workspace-zero">
      <div class="zero-copy">
        <span class="zero-signal" aria-hidden="true"><i></i><i></i><i></i></span>
        <div>
          <p>ARTIGEN DESIGN AGENT</p>
          <h1>{{ zh ? '你想完成什么？' : 'What should we make?' }}</h1>
          <span>{{ zh ? '描述结果，Artigen 会自动选择最快且安全的执行器。' : 'Describe the outcome. Artigen chooses the fastest safe executor.' }}</span>
        </div>
      </div>
      <ComposerBox
        :draft="draft"
        :attachments="selectedAttachments"
        :busy="sending"
        :placeholder="zh ? '描述一个设计、图片、调研或多文件交付任务…' : 'Describe a design, image, research, or multi-file task…'"
        @update:draft="draft = $event"
        @submit="submitMessage"
        @attach="openFilePicker()"
        @remove-attachment="removeAttachment"
      />
      <div class="zero-meta">
        <span><i></i>{{ zh ? '附件先保留在浏览器' : 'Files stay in your browser first' }}</span>
        <span>Qwen/Qwen3-8B</span>
        <span>Kwai-Kolors/Kolors</span>
      </div>
      <div class="suggestion-grid">
        <header>
          <span>{{ zh ? '从真实任务开始' : 'Start with real work' }}</span>
          <button type="button" :aria-label="zh ? '换一组建议' : 'Rotate suggestions'" @click="rotateSuggestions">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 8.5A7 7 0 0 1 18.5 7M17.9 15.5A7 7 0 0 1 5.5 17"/></svg>
          </button>
        </header>
        <button v-for="(suggestion, index) in visibleSuggestions" :key="suggestion" type="button" @click="useSuggestion(suggestion)">
          <span>0{{ index + 1 }}</span>
          <b>{{ suggestion }}</b>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>
        </button>
      </div>
    </section>

    <section v-else class="workspace-chat">
      <div ref="scrollArea" class="message-scroll">
        <section v-if="activeAuthorizations.length" class="authorization-strip" aria-live="polite">
          <header>
            <span>{{ zh ? '会话授权' : 'Session authorization' }}</span>
            <small>{{ zh ? '按站点与动作绑定，30 分钟未使用后失效' : 'Bound to site and action; expires after 30 idle minutes' }}</small>
          </header>
          <article v-for="authorization in activeAuthorizations" :key="authorization.authorizationId">
            <span><b>{{ authorization.siteOrigin }}</b><small>{{ authorizationActionLabel(authorization.actionType) }} · {{ formatAuthorizationExpiry(authorization.expiresAt) }}</small></span>
            <button type="button" @click="revokeAuthorization(authorization.authorizationId)">{{ zh ? '撤销' : 'Revoke' }}</button>
          </article>
        </section>

        <template v-for="message in conversation?.messages || []" :key="message.messageId">
          <article class="message" :class="message.role">
            <div v-if="message.role === 'assistant'" class="assistant-mark" aria-hidden="true">A</div>
            <div class="message-body">
              <p>{{ message.text }}</p>
              <div v-if="message.attachments.length" class="message-files">
                <span v-for="file in message.attachments" :key="file.clientId">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h9l5 5v12H5zM14 3.5v5h5"/></svg>
                  {{ file.name }} · {{ formatBytes(file.byteSize) }}
                </span>
              </div>
              <div v-if="message.questions.length" class="clarification">
                <button v-for="question in message.questions" :key="question" type="button" @click="draft = question">{{ question }}</button>
                <button class="recommended" type="button" @click="sendRecommended">{{ zh ? '按推荐直接做' : 'Use recommended assumptions' }}</button>
              </div>
            </div>
          </article>

          <ExecutionCard
            v-for="execution in executionsForMessage(message.messageId)"
            :key="execution.executionId"
            :execution="execution"
            :task="execution.toolTaskId ? toolTasks[execution.toolTaskId] : undefined"
            :run="execution.agentRunId ? agentRuns[execution.agentRunId] : undefined"
            :busy="startingExecutions.has(execution.executionId)"
            :zh="zh"
            @start="startExecution(execution)"
            @attach="openFilePicker(execution.executionId)"
            @open-local="openLocalTool(execution)"
            @increase-budget="increaseBudget(execution)"
            @cancel="cancelExecution(execution)"
            @retry="prepareRetry(execution)"
            @approve="approveAgentAction(execution, $event, false)"
            @authorize="approveAgentAction(execution, $event, true)"
            @deny="denyAgentAction(execution, $event)"
          />
        </template>

        <article v-if="planning" class="message assistant planning-message" aria-live="polite">
          <div class="assistant-mark" aria-hidden="true">A</div>
          <div class="message-body">
            <div class="planning-line"><span></span><span></span><span></span></div>
            <p>{{ zh ? '正在理解需求并选择执行器…' : 'Understanding the request and choosing an executor…' }}</p>
          </div>
        </article>
      </div>

      <div class="docked-composer">
        <ComposerBox
          :draft="draft"
          :attachments="selectedAttachments"
          :busy="sending"
          :placeholder="zh ? '继续对话，或提出一个新的设计任务…' : 'Continue, or describe a new design task…'"
          compact
          @update:draft="draft = $event"
          @submit="submitMessage"
          @attach="openFilePicker()"
          @remove-attachment="removeAttachment"
        />
        <p>{{ zh ? 'Enter 发送 · Shift+Enter 换行 · 文件仅在选定云端执行后上传' : 'Enter to send · Shift+Enter for newline · files upload only after cloud routing' }}</p>
      </div>
    </section>

    <template #environment>
      <div class="inspector-stack">
        <section class="inspector-section">
          <header><span>{{ zh ? '模型锁定' : 'Model lock' }}</span><b class="verified">{{ zh ? '已锁定' : 'Locked' }}</b></header>
          <dl>
            <div><dt>{{ zh ? '理解与规划' : 'Reasoning' }}</dt><dd>Qwen/Qwen3-8B</dd></div>
            <div><dt>{{ zh ? '全部图片' : 'All images' }}</dt><dd>Kwai-Kolors/Kolors</dd></div>
          </dl>
        </section>
        <section class="inspector-section">
          <header><span>{{ zh ? '执行环境' : 'Execution environment' }}</span><b>{{ activeRun ? activeRun.sandbox.provider : '—' }}</b></header>
          <dl>
            <div><dt>{{ zh ? '执行器' : 'Executor' }}</dt><dd>{{ executorSummary }}</dd></div>
            <div><dt>{{ zh ? '预算上限' : 'Budget cap' }}</dt><dd>{{ activeRun?.budget.maximum ?? latestExecution?.maxCredits ?? status?.autoCreditCap ?? 50 }} cr</dd></div>
            <div><dt>{{ zh ? '保留时间' : 'Retention' }}</dt><dd>{{ status?.retentionDays ?? 30 }} days</dd></div>
          </dl>
        </section>
        <section v-if="activeRun?.browserConfig.allowedOrigins?.length" class="inspector-section">
          <header><span>{{ zh ? '允许站点' : 'Allowed origins' }}</span><b>{{ activeRun.browserConfig.allowedOrigins.length }}</b></header>
          <ul><li v-for="origin in activeRun.browserConfig.allowedOrigins" :key="origin">{{ origin }}</li></ul>
        </section>
      </div>
    </template>

    <template #plan>
      <div class="execution-spine">
        <header><span>{{ activeRun?.progress.planExplanation || (zh ? '实时执行计划' : 'Live execution plan') }}</span><b>{{ planProgressLabel }}</b></header>
        <ol v-if="activePlan.length">
          <li v-for="(step, index) in activePlan" :key="step.label + index" :class="step.status">
            <span><i></i></span>
            <div><small>0{{ index + 1 }}</small><b>{{ step.label }}</b><em>{{ planStatusLabel(step.status) }}</em></div>
          </li>
        </ol>
        <div v-else class="inspector-inline-empty">{{ zh ? '发送第一条消息后，计划会在这里展开。' : 'The plan appears here after your first message.' }}</div>
      </div>
    </template>

    <template #subagents>
      <div class="subagent-panel">
        <header>
          <span>{{ zh ? '父 Agent 与并行上下文' : 'Parent and parallel contexts' }}</span>
          <b>{{ activeRun?.subagents?.length || 0 }}/3</b>
        </header>
        <article class="subagent-card parent">
          <span class="agent-node"><i></i></span>
          <div><b>{{ zh ? '父 Agent' : 'Parent Agent' }}</b><small>Qwen/Qwen3-8B · {{ zh ? '独占浏览器、电脑、Kolors 与最终交付' : 'owns browser, computer, Kolors, and delivery' }}</small></div>
          <em :class="activeRun?.status">{{ activeRun ? runStatusLabel(activeRun.status) : (zh ? '待命' : 'Idle') }}</em>
        </article>
        <div class="subagent-branch" v-if="activeRun?.subagents?.length"></div>
        <article v-for="subagent in activeRun?.subagents || []" :key="subagent.subagentId" class="subagent-card">
          <span class="agent-node"><i></i></span>
          <div>
            <b>{{ subagent.label }}</b>
            <small>{{ subagent.role }} · {{ subagent.progress.stepCount }}/{{ subagent.progress.maxSteps }} steps · {{ subagent.usage.credits.toFixed(2) }} cr</small>
            <p v-if="subagent.summary">{{ subagent.summary }}</p>
          </div>
          <em :class="subagent.status">{{ subagentStatusLabel(subagent.status) }}</em>
          <button v-if="['queued','running'].includes(subagent.status)" type="button" @click="cancelSubagentRun(subagent.subagentId)">{{ zh ? '取消' : 'Cancel' }}</button>
        </article>
        <div v-if="!activeRun?.subagents?.length" class="inspector-inline-empty">{{ zh ? '父 Agent 只会在任务可真正并行时自动创建，最多 3 个。' : 'The parent creates up to three only when work is genuinely parallel.' }}</div>
      </div>
    </template>

    <template #computer>
      <div class="computer-panel">
        <div class="computer-screen" :class="{ active: activeRun && ['provisioning','running','waiting_user'].includes(activeRun.status) }">
          <span class="screen-bar"><i></i><i></i><i></i></span>
          <div>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            <b>{{ activeRun?.sandbox.takeoverAvailable ? (zh ? '等待你接管' : 'Waiting for takeover') : (zh ? '安全桌面' : 'Secure desktop') }}</b>
            <small>{{ activeRun ? runStatusLabel(activeRun.status) : (zh ? '任务启动后才会创建' : 'Created only after a run starts') }}</small>
          </div>
        </div>
        <section class="inspector-section">
          <dl>
            <div><dt>{{ zh ? '外部写操作' : 'External writes' }}</dt><dd>{{ zh ? '逐次审批' : 'Per-action approval' }}</dd></div>
            <div><dt>{{ zh ? '密码 / OTP' : 'Password / OTP' }}</dt><dd>{{ zh ? '仅用户接管' : 'Takeover only' }}</dd></div>
            <div><dt>{{ zh ? '付款' : 'Payments' }}</dt><dd>{{ zh ? '禁止' : 'Forbidden' }}</dd></div>
          </dl>
        </section>
      </div>
    </template>

    <template #files>
      <div class="file-panel">
        <header><span>{{ zh ? '验证交付物' : 'Verified deliverables' }}</span><b>{{ activeRun?.artifacts?.length || 0 }}</b></header>
        <a v-for="artifact in activeRun?.artifacts || []" :key="artifact.artifactId" :href="artifact.url || undefined" target="_blank" rel="noopener">
          <span class="file-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h9l5 5v12H5zM14 3.5v5h5"/></svg></span>
          <span><b>{{ artifact.filename }}</b><small>{{ artifact.role }} · {{ formatBytes(artifact.byteSize) }}</small></span>
          <em :class="artifact.verificationStatus">{{ artifact.verificationStatus }}</em>
        </a>
        <div v-if="!activeRun?.artifacts?.length" class="inspector-inline-empty">{{ zh ? '生成、扫描和验证中的文件会在这里出现。' : 'Generating, scanning, and verified files appear here.' }}</div>
      </div>
    </template>

    <div v-if="notice" class="workspace-notice" role="status">
      <span>{{ notice }}</span>
      <button type="button" :aria-label="zh ? '关闭通知' : 'Dismiss notification'" @click="notice = ''">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
    </div>
  </AgentWorkspaceShell>

  <input
    ref="fileInput"
    class="visually-hidden"
    type="file"
    tabindex="-1"
    multiple
    accept=".pdf,.zip,.docx,.xlsx,.pptx,.txt,.md,.csv,image/png,image/jpeg,image/webp"
    :aria-label="zh ? '添加参考文件' : 'Add reference files'"
    @change="onFilesSelected"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AgentWorkspaceShell from '../components/workspace/AgentWorkspaceShell.vue';
import ComposerBox from '../components/designConversation/ComposerBox.vue';
import ExecutionCard from '../components/designConversation/ExecutionCard.vue';
import { useLanguageStore } from '@/stores/language';
import { useAgentImgAuth } from '../composables/useAgentImgAuth';
import {
  attachDesignExecutionTarget,
  cancelDesignExecution,
  createDesignConversation,
  deleteDesignConversation,
  getDesignAssistantStatus,
  getDesignConversation,
  grantDesignSessionAuthorization,
  increaseDesignExecutionBudget,
  listDesignConversations,
  listDesignSessionAuthorizations,
  openDesignEventStream,
  quoteDesignAgentExecution,
  recordDesignToolQuote,
  revokeDesignSessionAuthorization,
  sendDesignMessage,
  uploadDesignAttachments,
  type DesignAssistantStatus,
  type DesignAttachmentManifest,
  type DesignConversation,
  type DesignExecution,
  type DesignSessionAuthorization
} from '../services/designConversations';
import {
  createAgentRun,
  cancelAgentSubagent,
  getAgentRun,
  openAgentEventStream,
  submitAgentInput,
  type AgentApproval,
  type AgentRun,
  type AgentRunStatus,
  type AgentSubagentStatus
} from '../services/agentRuns';
import {
  createToolTask,
  getToolTask,
  quoteToolTask,
  waitForToolTask,
  type ServerToolTask
} from '../services/toolTasks';
import { createLocalToolHandoff } from '../services/localToolHandoff';

type SelectedAttachment = DesignAttachmentManifest & { file: File };

const router = useRouter();
const route = useRoute();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const { isAuthed, ensureAuthed, syncAuth } = useAgentImgAuth();
const zh = computed(() => currentLang.value === 'zh');

const status = ref<DesignAssistantStatus | null>(null);
const conversations = ref<DesignConversation[]>([]);
const conversation = ref<DesignConversation | null>(null);
const authorizations = ref<DesignSessionAuthorization[]>([]);
const draft = ref('');
const selectedAttachments = ref<SelectedAttachment[]>([]);
const notice = ref('');
const sending = ref(false);
const planning = ref(false);
const workspaceSearch = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const scrollArea = ref<HTMLElement | null>(null);
const attachmentTarget = ref('');
const suggestionOffset = ref(0);
const localFiles = new Map<string, File>();
const executionFileIds = reactive<Record<string, string[]>>({});
const toolTasks = reactive<Record<string, ServerToolTask>>({});
const agentRuns = reactive<Record<string, AgentRun>>({});
const startingExecutions = reactive(new Set<string>());
const executionStreams = new Map<string, () => void>();
let closeConversationStream: null | (() => void) = null;
let refreshTimer: number | null = null;
const scheduledAutoStarts = new Set<string>();

const suggestionsZh = [
  '为一款柚子气泡水生成夏日主视觉',
  '把这张商品图换成干净的咖啡店场景',
  '审计我的品牌官网并交付 PDF 和可编辑提案',
  '把一批图片压缩到适合网页使用',
  '修复并自然上色一张旧照片',
  '为独立香氛品牌规划一套发布视觉'
];
const suggestionsEn = [
  'Create a summer key visual for a yuzu soda',
  'Move this product into a clean café scene',
  'Audit my brand site and deliver a PDF and editable proposal',
  'Compress a batch of images for the web',
  'Restore and naturally colorize an old photo',
  'Plan a launch visual system for an indie fragrance brand'
];
const visibleSuggestions = computed(() => {
  const source = zh.value ? suggestionsZh : suggestionsEn;
  return Array.from({ length: 3 }, (_, index) => source[(suggestionOffset.value + index) % source.length]);
});
const hasConversation = computed(() => Boolean(conversation.value?.messages?.length));
const visibleConversations = computed(() => {
  const query = workspaceSearch.value.trim().toLowerCase();
  return query
    ? conversations.value.filter((item) => item.title.toLowerCase().includes(query))
    : conversations.value;
});
const latestExecution = computed(() => conversation.value?.executions?.at(-1) || null);
const activeRun = computed(() => {
  const runs = conversation.value?.executions
    ?.map((execution) => execution.agentRunId ? agentRuns[execution.agentRunId] : null)
    .filter((run): run is AgentRun => Boolean(run)) || [];
  return runs.at(-1) || null;
});
const workspaceStatusTone = computed<'ready' | 'busy' | 'warning' | 'offline'>(() => {
  if (!status.value?.enabled || !status.value?.plannerReady) return 'offline';
  if (planning.value || ['queued', 'provisioning', 'running', 'verifying'].includes(activeRun.value?.status || '')) return 'busy';
  if (activeRun.value?.status === 'waiting_user') return 'warning';
  return 'ready';
});
const currentCostLabel = computed(() => activeRun.value
  ? `${activeRun.value.budget.used.toFixed(1)} / ${activeRun.value.budget.maximum} cr`
  : (zh.value ? '未创建付费任务' : 'No paid run'));
const inspectorBadges = computed(() => ({
  subagents: activeRun.value?.subagents?.filter((item) => ['queued', 'running'].includes(item.status)).length || 0,
  computer: activeRun.value?.approvals?.filter((item) => item.status === 'pending').length || 0,
  files: activeRun.value?.artifacts?.filter((item) => item.verificationStatus === 'passed').length || 0
}));
const activePlan = computed(() => {
  if (activeRun.value?.progress.plan?.length) return activeRun.value.progress.plan;
  return (latestExecution.value?.plan.steps || []).map((label, index) => ({
    label,
    status: (index === 0 && latestExecution.value?.status === 'running'
      ? 'in_progress'
      : latestExecution.value?.status === 'succeeded'
        ? 'completed'
        : 'pending') as 'pending' | 'in_progress' | 'completed'
  }));
});
const planProgressLabel = computed(() => {
  const complete = activePlan.value.filter((step) => step.status === 'completed').length;
  return `${complete}/${activePlan.value.length || 0}`;
});
const runtimeLabel = computed(() => {
  if (!status.value) return zh.value ? '正在检查执行器' : 'Checking executors';
  if (!status.value.enabled) return zh.value ? '对话入口尚未开放' : 'Conversation entry is closed';
  if (!status.value.plannerReady) return zh.value ? '规划器暂不可用' : 'Planner unavailable';
  const active = status.value.running + status.value.queued;
  return active
    ? (zh.value ? `${active} 个请求处理中` : `${active} requests in progress`)
    : (zh.value ? '设计 Agent 就绪' : 'Design agent ready');
});
const executorSummary = computed(() => {
  const latest = latestExecution.value;
  if (!latest) return 'ARTIGEN DESIGN AGENT';
  const labels: Record<string, string> = {
    reply: zh.value ? '设计对话' : 'Design conversation',
    local_tool: zh.value ? '本地工具 · 不上传' : 'Local tool · no upload',
    tool_task: zh.value ? '专项工作流' : 'Specialist workflow',
    agent_run: 'Computer Agent'
  };
  return labels[latest.routeKind] || 'ARTIGEN DESIGN AGENT';
});
const activeAuthorizations = computed(() => authorizations.value.filter((item) => item.status === 'active'));

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const formatRelative = (value: string) => {
  const timestamp = new Date(value).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return zh.value ? '刚刚' : 'now';
  if (minutes < 60) return zh.value ? `${minutes} 分钟前` : `${minutes}m ago`;
  const days = Math.floor(minutes / 1440);
  if (days > 0) return zh.value ? `${days} 天前` : `${days}d ago`;
  const hours = Math.floor(minutes / 60);
  return zh.value ? `${hours} 小时前` : `${hours}h ago`;
};
const conversationIsRunning = (conversationId: string) => (
  conversation.value?.conversationId === conversationId &&
  Boolean(latestExecution.value && !['succeeded', 'failed', 'cancelled'].includes(latestExecution.value.status))
);
const runStatusLabel = (value: AgentRunStatus) => ({
  draft: zh.value ? '草稿' : 'Draft',
  queued: zh.value ? '排队' : 'Queued',
  provisioning: zh.value ? '准备环境' : 'Provisioning',
  running: zh.value ? '运行中' : 'Running',
  waiting_user: zh.value ? '等待你' : 'Needs you',
  paused: zh.value ? '已暂停' : 'Paused',
  verifying: zh.value ? '验证中' : 'Verifying',
  succeeded: zh.value ? '已完成' : 'Done',
  failed: zh.value ? '失败' : 'Failed',
  cancelled: zh.value ? '已取消' : 'Cancelled'
}[value]);
const subagentStatusLabel = (value: AgentSubagentStatus) => ({
  queued: zh.value ? '排队' : 'Queued',
  running: zh.value ? '运行中' : 'Running',
  succeeded: zh.value ? '已完成' : 'Done',
  failed: zh.value ? '失败' : 'Failed',
  cancelled: zh.value ? '已取消' : 'Cancelled'
}[value]);
const planStatusLabel = (value: 'pending' | 'in_progress' | 'completed') => ({
  pending: zh.value ? '待执行' : 'Pending',
  in_progress: zh.value ? '当前' : 'Current',
  completed: zh.value ? '完成' : 'Done'
}[value]);
const authorizationActionLabel = (action: string) => {
  const labels: Record<string, [string, string]> = {
    send: ['发送', 'Send'], publish: ['发布', 'Publish'], submit: ['提交', 'Submit'], delete: ['删除', 'Delete'],
    change_permissions: ['权限变更', 'Permission changes'], browser_fill: ['填写页面', 'Page filling'], browser_interaction: ['页面操作', 'Page interactions']
  };
  return labels[action]?.[zh.value ? 0 : 1] || action.replace(/_/g, ' ');
};
const formatAuthorizationExpiry = (value: string) => {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return zh.value ? '即将失效' : 'expiring soon';
  return zh.value
    ? `${time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 前有效`
    : `until ${time.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`;
};
const errorText = (error: unknown) => {
  const code = String((error as { code?: string })?.code || error || 'UNKNOWN_ERROR');
  const labels: Record<string, [string, string]> = {
    LOGIN_REQUIRED: ['请先登录，登录后会自动发送当前草稿。', 'Sign in first; your draft will send automatically.'],
    DESIGN_CONVERSATION_DISABLED: ['对话入口尚未开放，现有 AI 与 Agent 工作台仍可使用。', 'The conversation entry is not open yet; the existing workbenches remain available.'],
    INSUFFICIENT_CREDITS: ['点数不足，任务没有创建，也没有冻结点数。', 'Not enough credits. No task was created or held.'],
    DESIGN_EXECUTION_BUDGET_EXCEEDED: ['真实报价超过当前上限，任务尚未创建。', 'The verified quote exceeds this limit. No task was created.'],
    DESIGN_ATTACHMENTS_REQUIRED: ['这个任务需要附件，请选择文件后继续。', 'This task needs an attachment. Choose a file to continue.']
  };
  return labels[code]?.[zh.value ? 0 : 1] || (zh.value ? `暂时无法继续：${code}` : `Unable to continue: ${code}`);
};

const scrollToBottom = async () => {
  await nextTick();
  scrollArea.value?.scrollTo({ top: scrollArea.value.scrollHeight, behavior: 'auto' });
};

const scheduleRefresh = (autoStartExecutionId?: string) => {
  if (autoStartExecutionId) scheduledAutoStarts.add(autoStartExecutionId);
  if (refreshTimer !== null) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    const executionIds = [...scheduledAutoStarts];
    scheduledAutoStarts.clear();
    void refreshConversation(executionIds);
  }, 180);
};

const connectConversationStream = (conversationId: string) => {
  closeConversationStream?.();
  closeConversationStream = openDesignEventStream(conversationId, {
    onEvent: (event) => {
      if (['execution.ready', 'clarification.required', 'planning.failed'].includes(event.type)) {
        planning.value = false;
      }
      const autoStartExecutionId = event.type === 'execution.ready' && typeof event.data.executionId === 'string'
        ? event.data.executionId
        : undefined;
      scheduleRefresh(autoStartExecutionId);
    }
  });
};

const loadRun = async (runId: string) => {
  const previous = agentRuns[runId];
  const run = await getAgentRun(runId);
  agentRuns[runId] = run;
  const previousPending = previous?.approvals?.filter((item) => item.status === 'pending').length || 0;
  const nextPending = run.approvals?.filter((item) => item.status === 'pending').length || 0;
  const becameTerminal = previous && previous.status !== run.status && ['succeeded', 'failed', 'cancelled'].includes(run.status);
  if (!previous || nextPending > previousPending || becameTerminal) await scrollToBottom();
  if (!['succeeded', 'failed', 'cancelled'].includes(run.status)) return;
  executionStreams.get(runId)?.();
  executionStreams.delete(runId);
};

const monitorRun = (runId: string) => {
  if (executionStreams.has(runId)) return;
  const close = openAgentEventStream(runId, {
    onEvent: () => {
      void loadRun(runId).then(() => scheduleRefresh()).catch(() => {});
    }
  });
  executionStreams.set(runId, close);
  void loadRun(runId).catch(() => {});
};

const hydrateExecutionTargets = async (executions: DesignExecution[]) => {
  for (const execution of executions) {
    if (execution.toolTaskId && !toolTasks[execution.toolTaskId]) {
      void getToolTask(execution.toolTaskId)
        .then((task) => { toolTasks[task.taskId] = task; })
        .catch(() => {});
    }
    if (execution.agentRunId) monitorRun(execution.agentRunId);
  }
};

const refreshConversation = async (autoStartExecutionIds: string[] = []) => {
  const id = conversation.value?.conversationId;
  if (!id) return;
  const fresh = await getDesignConversation(id);
  conversation.value = fresh;
  await hydrateExecutionTargets(fresh.executions || []);
  if (autoStartExecutionIds.length) {
    const allowed = new Set(autoStartExecutionIds);
    for (const execution of fresh.executions || []) {
      if (
        allowed.has(execution.executionId) &&
        !execution.toolTaskId &&
        !execution.agentRunId &&
        ['queued', 'waiting_upload'].includes(execution.status)
      ) {
        void startExecution(execution);
      }
    }
  }
  await scrollToBottom();
};

const refreshConversationList = async () => {
  if (!isAuthed.value) return;
  conversations.value = await listDesignConversations();
};

const openConversation = async (conversationId: string) => {
  conversation.value = await getDesignConversation(conversationId);
  authorizations.value = await listDesignSessionAuthorizations(conversationId).catch(() => []);
  connectConversationStream(conversationId);
  await router.replace({ path: '/artigen/create', query: { c: conversationId } });
  await hydrateExecutionTargets(conversation.value.executions || []);
  await scrollToBottom();
};

const newConversation = async () => {
  closeConversationStream?.();
  closeConversationStream = null;
  conversation.value = null;
  authorizations.value = [];
  draft.value = '';
  selectedAttachments.value = [];
  await router.replace('/artigen/create');
};

const removeCurrentConversation = async () => {
  const id = conversation.value?.conversationId;
  if (!id) return;
  const confirmed = window.confirm(zh.value
    ? '删除这个设计会话？消息、执行记录和短期附件关联将一起删除。'
    : 'Delete this design session? Messages, executions, and temporary attachment links will be removed.');
  if (!confirmed) return;
  try {
    await deleteDesignConversation(id);
    await refreshConversationList();
    await newConversation();
  } catch (error) {
    notice.value = errorText(error);
  }
};

const useSuggestion = (suggestion: string) => {
  draft.value = suggestion;
};
const rotateSuggestions = () => {
  suggestionOffset.value = (suggestionOffset.value + 3) % suggestionsZh.length;
};
const removeAttachment = (clientId: string) => {
  selectedAttachments.value = selectedAttachments.value.filter((item) => item.clientId !== clientId);
};
const openFilePicker = (executionId = '') => {
  attachmentTarget.value = executionId;
  fileInput.value?.click();
};
const onFilesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []).slice(0, 10);
  input.value = '';
  const added = files.map((file) => ({
    clientId: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    file
  }));
  for (const item of added) localFiles.set(item.clientId, item.file);
  if (attachmentTarget.value) {
    const executionId = attachmentTarget.value;
    executionFileIds[executionId] = added.map((item) => item.clientId);
    attachmentTarget.value = '';
    const execution = conversation.value?.executions.find((item) => item.executionId === executionId);
    if (execution) void startExecution(execution);
    return;
  }
  selectedAttachments.value = [...selectedAttachments.value, ...added].slice(0, 10);
};

const submitAuthenticated = async () => {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  notice.value = '';
  try {
    let active = conversation.value;
    if (!active) {
      active = await createDesignConversation();
      conversation.value = { ...active, messages: [], executions: [] };
      connectConversationStream(active.conversationId);
      await router.replace({ path: '/artigen/create', query: { c: active.conversationId } });
    }
    const manifest = selectedAttachments.value.map(({ file: _file, ...item }) => item);
    for (const item of selectedAttachments.value) localFiles.set(item.clientId, item.file);
    const message = await sendDesignMessage(active.conversationId, text, manifest);
    if (conversation.value) {
      conversation.value.messages = [...(conversation.value.messages || []), message];
    }
    draft.value = '';
    selectedAttachments.value = [];
    planning.value = true;
    await refreshConversationList();
    await scrollToBottom();
  } catch (error) {
    notice.value = errorText(error);
  } finally {
    sending.value = false;
  }
};

const submitMessage = () => {
  if (!draft.value.trim()) return;
  if (!ensureAuthed(submitAuthenticated)) return;
  void submitAuthenticated();
};

const sendRecommended = () => {
  draft.value = zh.value
    ? '按你的推荐直接做；请自行作出合理假设，不再追问。'
    : 'Use your recommended assumptions and proceed without further questions.';
  submitMessage();
};

const executionInputFiles = (execution: DesignExecution) => {
  const ids = executionFileIds[execution.executionId] || execution.plan.attachmentClientIds || [];
  return ids
    .map((clientId) => ({ clientId, file: localFiles.get(clientId) }))
    .filter((item): item is { clientId: string; file: File } => item.file instanceof File);
};

const ensureUploadedAssets = async (execution: DesignExecution) => {
  const expected = executionInputFiles(execution);
  if (execution.plan.uploadRequired && !expected.length) {
    throw Object.assign(new Error('DESIGN_ATTACHMENTS_REQUIRED'), { code: 'DESIGN_ATTACHMENTS_REQUIRED' });
  }
  const existing = new Map((conversation.value?.uploads || []).map((item) => [item.clientId, item.assetId]));
  const missing = expected.filter((item) => !existing.has(item.clientId));
  if (missing.length && conversation.value) {
    const uploaded = await uploadDesignAttachments(conversation.value.conversationId, missing);
    uploaded.forEach((item) => existing.set(item.clientId, item.assetId));
  }
  return expected.map((item) => existing.get(item.clientId)).filter((value): value is string => Boolean(value));
};

const runToolExecution = async (execution: DesignExecution, assetIds: string[]) => {
  if (!execution.toolId || !execution.operation || !conversation.value) return;
  const quote = await quoteToolTask({
    toolId: execution.toolId,
    operation: execution.operation,
    options: execution.plan.options || {}
  });
  const checked = await recordDesignToolQuote(
    conversation.value.conversationId,
    execution.executionId,
    quote.quoteId
  );
  if (checked.status === 'waiting_budget') {
    await refreshConversation();
    return;
  }
  const task = await createToolTask({
    toolId: execution.toolId,
    operation: execution.operation,
    options: execution.plan.options || {},
    quoteId: quote.quoteId,
    inputAssets: assetIds,
    idempotencyKey: `design:${execution.executionId}`
  });
  toolTasks[task.taskId] = task;
  await attachDesignExecutionTarget(
    conversation.value.conversationId,
    execution.executionId,
    { toolTaskId: task.taskId }
  );
  void waitForToolTask(task, { timeoutMs: 5 * 60_000 })
    .then((finalTask) => {
      toolTasks[finalTask.taskId] = finalTask;
      return refreshConversation();
    })
    .catch((error) => { notice.value = errorText(error); });
};

const runAgentExecution = async (execution: DesignExecution, assetIds: string[]) => {
  if (!conversation.value) return;
  const quoted = await quoteDesignAgentExecution(
    conversation.value.conversationId,
    execution.executionId
  );
  if (!quoted.quote.canStart || quoted.execution.status === 'waiting_budget') {
    await refreshConversation();
    return;
  }
  const plan = execution.plan;
  const run = await createAgentRun({
    objective: String(plan.objective || ''),
    assetIds,
    maxCredits: execution.maxCredits,
    capabilities: plan.capabilities || { files: true, shell: true },
    deliverables: plan.deliverables || [],
    browserConfig: plan.browserConfig || { allowedOrigins: [], persistSession: false },
    idempotencyKey: `design:${execution.executionId}`
  });
  agentRuns[run.runId] = run;
  await attachDesignExecutionTarget(
    conversation.value.conversationId,
    execution.executionId,
    { agentRunId: run.runId }
  );
  monitorRun(run.runId);
};

const startExecution = async (execution: DesignExecution) => {
  if (startingExecutions.has(execution.executionId)) return;
  if (execution.routeKind === 'reply' || execution.routeKind === 'local_tool') return;
  if (execution.toolTaskId || execution.agentRunId || execution.status === 'waiting_budget') return;
  startingExecutions.add(execution.executionId);
  try {
    const assetIds = await ensureUploadedAssets(execution);
    if (execution.routeKind === 'tool_task') await runToolExecution(execution, assetIds);
    if (execution.routeKind === 'agent_run') await runAgentExecution(execution, assetIds);
    await refreshConversation();
  } catch (error) {
    if (String((error as { code?: string })?.code || '') !== 'DESIGN_ATTACHMENTS_REQUIRED') {
      notice.value = errorText(error);
    }
  } finally {
    startingExecutions.delete(execution.executionId);
  }
};

const openLocalTool = async (execution: DesignExecution) => {
  if (!execution.localRoute) return;
  const files = executionInputFiles(execution).map((item) => item.file);
  const handoff = files.length ? createLocalToolHandoff(files) : '';
  await router.push({
    path: execution.localRoute,
    query: {
      ...(execution.operation ? { operation: execution.operation } : {}),
      ...(handoff ? { handoff } : {})
    }
  });
};

const increaseBudget = async (execution: DesignExecution) => {
  if (!conversation.value) return;
  const minimum = Math.max(execution.quotedCredits || 0, execution.maxCredits + 10);
  try {
    await increaseDesignExecutionBudget(
      conversation.value.conversationId,
      execution.executionId,
      Math.min(500, minimum)
    );
    await refreshConversation();
    notice.value = zh.value
      ? `本次上限已提高到 ${Math.min(500, minimum)} 点；请确认新上限后再启动。`
      : `This execution cap is now ${Math.min(500, minimum)} credits. Review it before starting.`;
  } catch (error) {
    notice.value = errorText(error);
  }
};

const cancelExecution = async (execution: DesignExecution) => {
  if (!conversation.value) return;
  try {
    await cancelDesignExecution(conversation.value.conversationId, execution.executionId);
    await refreshConversation();
  } catch (error) {
    notice.value = errorText(error);
  }
};

const prepareRetry = (execution: DesignExecution) => {
  const original = String(
    execution.plan.objective ||
    execution.plan.options?.prompt ||
    conversation.value?.title ||
    ''
  ).trim();
  draft.value = original;
  notice.value = zh.value
    ? '原要求已放回输入框；检查失败原因并修改后重新发送。'
    : 'The original request is back in the composer. Adjust it using the failure reason, then send again.';
  void scrollToBottom();
};

const approveAgentAction = async (
  execution: DesignExecution,
  approval: AgentApproval,
  authorizeSession: boolean
) => {
  if (!conversation.value || !execution.agentRunId) return;
  try {
    await submitAgentInput(execution.agentRunId, {
      approvalId: approval.approvalId,
      decision: 'approved'
    });
    if (authorizeSession) {
      const origin = new URL(approval.recipient).origin;
      await grantDesignSessionAuthorization(
        conversation.value.conversationId,
        origin,
        approval.actionType
      );
      authorizations.value = await listDesignSessionAuthorizations(conversation.value.conversationId);
    }
    await loadRun(execution.agentRunId);
    await refreshConversation();
  } catch (error) {
    notice.value = errorText(error);
  }
};

const revokeAuthorization = async (authorizationId: string) => {
  if (!conversation.value) return;
  try {
    await revokeDesignSessionAuthorization(conversation.value.conversationId, authorizationId);
    authorizations.value = await listDesignSessionAuthorizations(conversation.value.conversationId);
  } catch (error) {
    notice.value = errorText(error);
  }
};

const denyAgentAction = async (execution: DesignExecution, approval: AgentApproval) => {
  if (!conversation.value || !execution.agentRunId) return;
  try {
    await submitAgentInput(execution.agentRunId, {
      approvalId: approval.approvalId,
      decision: 'denied',
      decisionReason: zh.value
        ? '用户在设计会话中拒绝了此操作。'
        : 'Denied from the design conversation.'
    });
    await loadRun(execution.agentRunId);
    await refreshConversation();
  } catch (error) {
    notice.value = errorText(error);
  }
};

const cancelSubagentRun = async (subagentId: string) => {
  const run = activeRun.value;
  if (!run) return;
  try {
    await cancelAgentSubagent(run.runId, subagentId);
    await loadRun(run.runId);
    notice.value = zh.value ? '子 Agent 已取消，父任务会继续。' : 'Subagent cancelled; the parent run will continue.';
  } catch (error) {
    notice.value = errorText(error);
  }
};

const executionsForMessage = (messageId: string) => (
  conversation.value?.executions?.filter((item) => item.sourceMessageId === messageId) || []
);

const handleAuthChanged = () => {
  syncAuth();
  if (isAuthed.value) void refreshConversationList();
};

onMounted(async () => {
  window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
  status.value = await getDesignAssistantStatus().catch(() => null);
  syncAuth();
  if (!isAuthed.value) return;
  await refreshConversationList().catch(() => {});
  const requested = String(route.query.c || '').trim();
  if (requested) await openConversation(requested).catch(() => router.replace('/artigen/create'));
});

watch(() => conversation.value?.messages?.length, () => void scrollToBottom());

onBeforeUnmount(() => {
  window.removeEventListener('app-auth-changed', handleAuthChanged as EventListener);
  closeConversationStream?.();
  executionStreams.forEach((close) => close());
  executionStreams.clear();
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
});
</script>

<style scoped>
:deep(.agent-workspace-shell) {
  --conversation-max: 840px;
}
.history-group { display: grid; gap: 4px; }
.history-group > p { margin: 8px 8px 5px; color: var(--muted-2); font-size: 11px; font-weight: 680; letter-spacing: .05em; text-transform: uppercase; }
.history-item { display: grid; grid-template-columns: 8px minmax(0,1fr); width: 100%; align-items: start; gap: 8px; min-height: 42px; padding: 7px 8px; border: 1px solid transparent; border-radius: 8px; color: var(--muted); text-align: left; background: transparent; cursor: pointer; }
.history-item:hover { color: var(--text); background: var(--surface-raised); }
.history-item.active { border-color: var(--border); color: var(--text); background: var(--surface); }
.history-state { width: 6px; height: 6px; margin-top: 5px; border-radius: 50%; background: var(--muted-2); }
.history-state.running { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb,var(--acid) 13%,transparent); }
.history-item > span:last-child { display: grid; min-width: 0; gap: 2px; }
.history-item b { overflow: hidden; font-size: 11px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
.history-item small { color: var(--muted-2); font-size: 11px; }
.history-empty { display: grid; min-height: 120px; place-content: center; place-items: center; gap: 8px; color: var(--muted-2); font-size: 11px; }
.history-empty svg { width: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; }

.conversation-heading { display: flex; width: 100%; min-width: 0; align-items: center; gap: 9px; }
.conversation-heading > div { display: grid; min-width: 0; gap: 2px; }
.conversation-heading strong { overflow: hidden; font-size: 11px; font-weight: 660; text-overflow: ellipsis; white-space: nowrap; }
.conversation-heading small { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.executor-mark { width: 3px; height: 24px; border-radius: 3px; background: var(--muted-2); }
.executor-mark.agent_run,.executor-mark.tool_task { background: var(--acid); box-shadow: 0 0 12px color-mix(in srgb,var(--acid) 22%,transparent); }
.quiet-action { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 8px; border: 1px solid transparent; border-radius: 8px; color: var(--muted); font-size: 11px; background: transparent; cursor: pointer; }
.quiet-action:hover { border-color: var(--border); color: var(--danger); background: var(--surface); }
.quiet-action svg { width: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; }

.workspace-zero { display: grid; width: min(var(--conversation-max),calc(100% - 40px)); height: 100%; min-height: 0; margin: 0 auto; padding: clamp(54px,9vh,104px) 0 38px; overflow-y: auto; overscroll-behavior: contain; align-content: center; scrollbar-color: var(--border) transparent; }
.zero-copy { display: flex; align-items: center; gap: 16px; margin: 0 0 22px; }
.zero-copy > div { display: grid; gap: 4px; }
.zero-copy p { margin: 0; color: var(--acid-text); font-size: 11px; font-weight: 760; letter-spacing: .14em; }
.zero-copy h1 { margin: 0; font-size: clamp(23px,3vw,34px); font-weight: 680; letter-spacing: -.035em; line-height: 1.1; }
.zero-copy > div > span { color: var(--muted); font-size: 11px; line-height: 1.5; }
.zero-signal { position: relative; display: grid; flex: 0 0 auto; width: 38px; height: 38px; place-content: center; gap: 3px; border: 1px solid color-mix(in srgb,var(--acid) 50%,var(--border)); border-radius: 9px; color: var(--acid-text); background: color-mix(in srgb,var(--acid) 7%,var(--surface)); }
.zero-signal i { display: block; width: 17px; height: 1px; background: currentColor; }.zero-signal i:nth-child(2) { width: 11px; }
.workspace-zero :deep(.composer-box),.docked-composer :deep(.composer-box) { border: 1px solid var(--border); border-radius: 11px; color: var(--text); background: var(--surface); box-shadow: 0 18px 44px rgb(0 0 0 / 18%); }
.workspace-zero :deep(.composer-box:focus-within),.docked-composer :deep(.composer-box:focus-within) { border-color: color-mix(in srgb,var(--acid) 60%,var(--border)); box-shadow: 0 18px 44px rgb(0 0 0 / 22%),0 0 0 2px color-mix(in srgb,var(--acid) 18%,transparent); }
:deep(.composer-box textarea) { color: var(--text); font-size: 13px; line-height: 1.55; }
:deep(.composer-box textarea::placeholder) { color: var(--muted-2); }
:deep(.composer-box .attach) { border-color: var(--border); border-radius: 8px; color: var(--muted); font-size: 11px; background: var(--surface-raised); }
:deep(.composer-box .privacy) { color: var(--muted-2); }
:deep(.composer-box .send) { width: 36px; height: 36px; border-color: var(--acid); border-radius: 9px; color: var(--acid-ink); background: var(--acid); }
:deep(.composer-box .send:hover:not(:disabled)) { box-shadow: none; transform: translateY(-1px); }
:deep(.composer-box .send:disabled) { border-color: var(--border); color: var(--muted-2); background: var(--surface-raised); }
:deep(.composer-box .attachment-list > span) { border-color: var(--border); color: var(--text); background: var(--surface-raised); }
:deep(.composer-box .attachment-list small),:deep(.composer-box .attachment-list button) { color: var(--muted); }
.zero-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 9px 2px 0; color: var(--muted-2); font-size: 11px; }
.zero-meta span:first-child { margin-right: auto; }.zero-meta i { display: inline-block; width: 5px; height: 5px; margin-right: 5px; border-radius: 50%; background: var(--success); }
.suggestion-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; margin-top: 24px; }
.suggestion-grid header { grid-column: 1/-1; display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 11px; font-weight: 620; }
.suggestion-grid header button { display: grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 7px; color: var(--muted); background: transparent; cursor: pointer; }
.suggestion-grid header button:hover { color: var(--text); background: var(--surface); }.suggestion-grid header svg { width: 14px; }
.suggestion-grid > button { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: start; gap: 8px; min-height: 72px; padding: 11px; border: 1px solid var(--border); border-radius: 9px; color: var(--muted); text-align: left; background: color-mix(in srgb,var(--surface) 64%,transparent); cursor: pointer; transition: transform 170ms ease,border-color 170ms ease,background 170ms ease; }
.suggestion-grid > button:hover { border-color: color-mix(in srgb,var(--acid) 38%,var(--border)); color: var(--text); background: var(--surface); transform: translateY(-2px); }
.suggestion-grid > button span { color: var(--acid-text); font-family: ui-monospace,SFMono-Regular,monospace; font-size: 11px; }.suggestion-grid > button b { font-size: 11px; font-weight: 560; line-height: 1.5; }.suggestion-grid > button svg { width: 13px; }

.workspace-chat { position: relative; display: grid; grid-template-rows: minmax(0,1fr) auto; height: 100%; min-height: 0; }
.message-scroll { min-height: 0; overflow-y: auto; padding: 38px clamp(20px,5vw,64px) 32px; scrollbar-color: var(--border) transparent; scroll-padding-bottom: 32px; }
.authorization-strip { display: grid; width: min(var(--conversation-max),100%); gap: 8px; margin: 0 auto 24px; padding: 11px; border: 1px solid color-mix(in srgb,var(--warning) 46%,var(--border)); border-radius: 9px; background: color-mix(in srgb,var(--warning) 6%,var(--surface)); }
.authorization-strip header,.authorization-strip article { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; }.authorization-strip header span { font-size: 11px; font-weight: 680; }.authorization-strip small { color: var(--muted); font-size: 11px; }.authorization-strip article { padding-top: 8px; border-top: 1px solid var(--border); }.authorization-strip article > span { display: grid; min-width: 0; gap: 2px; overflow-wrap: anywhere; }.authorization-strip article b { font-size: 11px; }.authorization-strip button { flex: 0 0 auto; min-height: 30px; padding: 0 8px; border: 1px solid var(--border); border-radius: 7px; color: var(--danger); font-size: 11px; background: var(--surface); cursor: pointer; }
.message { display: flex; width: min(var(--conversation-max),100%); gap: 10px; margin: 0 auto 18px; }
.message.user { justify-content: flex-end; }
.assistant-mark { display: grid; flex: 0 0 auto; width: 26px; height: 26px; place-items: center; border: 1px solid color-mix(in srgb,var(--acid) 48%,var(--border)); border-radius: 7px; color: var(--acid-text); font-size: 11px; font-weight: 780; background: color-mix(in srgb,var(--acid) 6%,var(--surface)); }
.message-body { min-width: 0; max-width: 78%; padding: 2px 0; overflow-wrap: anywhere; color: var(--text); font-size: 13px; line-height: 1.65; }
.message.user .message-body { max-width: 72%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px 10px 3px 10px; background: var(--surface-raised); }
.message-body p { margin: 0; white-space: pre-wrap; }
.message-files { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }.message-files span { display: inline-flex; max-width: 100%; min-width: 0; align-items: center; gap: 5px; padding: 5px 7px; overflow-wrap: anywhere; border: 1px solid var(--border); border-radius: 7px; color: var(--muted); font-size: 11px; background: var(--surface); }.message-files svg { flex: 0 0 auto; width: 12px; }
.clarification { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }.clarification button { min-height: 32px; padding: 0 9px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 11px; background: var(--surface); cursor: pointer; }.clarification button:hover { border-color: var(--acid); }.clarification .recommended { border-color: var(--acid); color: var(--acid-ink); background: var(--acid); }
.planning-message { color: var(--muted); }.planning-line { display: flex; gap: 3px; margin-bottom: 6px; }.planning-line span { width: 5px; height: 5px; border-radius: 50%; background: var(--acid); animation: thinking 800ms ease-in-out infinite alternate; }.planning-line span:nth-child(2) { animation-delay: 120ms; }.planning-line span:nth-child(3) { animation-delay: 240ms; }
@keyframes thinking { to { opacity: .25; transform: translateY(-2px); } }
.docked-composer { position: relative; z-index: 12; padding: 16px clamp(20px,5vw,64px) 12px; border-top: 1px solid color-mix(in srgb,var(--border) 82%,transparent); background: color-mix(in srgb,var(--bg) 93%,transparent); backdrop-filter: blur(14px); }
.docked-composer :deep(.composer-box) { max-width: var(--conversation-max); margin: 0 auto; box-shadow: 0 14px 36px rgb(0 0 0 / 24%); }
.docked-composer > p { max-width: var(--conversation-max); margin: 6px auto 0; color: var(--muted-2); font-size: 11px; text-align: center; }

:deep(.execution-card) { max-width: var(--conversation-max); margin: 4px auto 22px; border-color: var(--border); border-radius: 10px; color: var(--text); background: var(--surface); box-shadow: none; }
:deep(.execution-card > header) { padding: 11px 13px; border-bottom-color: var(--border); background: var(--surface-raised); }
:deep(.execution-card .executor-icon) { width: 30px; height: 30px; border-color: color-mix(in srgb,var(--acid) 50%,var(--border)); border-radius: 7px; color: var(--acid-text); background: color-mix(in srgb,var(--acid) 7%,var(--surface)); }
:deep(.execution-card header p),:deep(.execution-card .status-chip),:deep(.execution-card .execution-meta span),:deep(.execution-card .footer-actions > span) { color: var(--muted); }
:deep(.execution-card header h3) { font-size: 13px; }:deep(.execution-card .status-chip) { border-color: var(--border); border-radius: 7px; background: var(--surface); }
:deep(.execution-card .execution-body) { padding: 13px; }:deep(.execution-card .plan-step:not(:last-child)::after) { background: var(--border); }:deep(.execution-card .plan-step > span) { border-color: var(--border); color: var(--muted); background: var(--surface-raised); }:deep(.execution-card .plan-step.completed > span) { border-color: var(--acid); color: var(--acid-ink); background: var(--acid); }:deep(.execution-card .plan-step p) { color: var(--muted); font-size: 11px; }
:deep(.execution-card .execution-meta) { border-top-color: var(--border); }:deep(.execution-card .execution-meta span),:deep(.execution-card .deliverables > a),:deep(.execution-card .footer-actions button),:deep(.execution-card .footer-actions a) { border-color: var(--border); color: var(--text); background: var(--surface-raised); }
:deep(.execution-card .local-note),:deep(.execution-card .upload-note),:deep(.execution-card .budget-block),:deep(.execution-card .failure-block),:deep(.execution-card .approval-card) { border-color: var(--border); color: var(--text); background: var(--surface-raised); }
:deep(.execution-card .local-note span),:deep(.execution-card .upload-note span),:deep(.execution-card .budget-block span),:deep(.execution-card .failure-block span),:deep(.execution-card .approval-card p),:deep(.execution-card .approval-card small) { color: var(--muted); }
:deep(.execution-card .approval-actions button) { border-color: var(--border); color: var(--text); background: var(--surface); }
:deep(.execution-card .approval-actions button:first-child),:deep(.execution-card .approval-card a),:deep(.execution-card .footer-actions .primary) { border-color: var(--acid); color: var(--acid-ink); background: var(--acid); }
:deep(.execution-card .approval-actions .session) { border-color: color-mix(in srgb,var(--warning) 55%,var(--border)); color: var(--text); background: transparent; }
:deep(.execution-card .approval-actions .deny),:deep(.execution-card .footer-actions .cancel) { border-color: color-mix(in srgb,var(--danger) 50%,var(--border)); color: var(--danger); background: transparent; }
:deep(.execution-card > footer) { padding-inline: 13px; }:deep(.execution-card .progress-track) { background: var(--border); }:deep(.execution-card .progress-track span) { background: var(--acid); }

.inspector-stack,.computer-panel { display: grid; gap: 10px; }
.inspector-section { overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
.inspector-section > header,.execution-spine > header,.subagent-panel > header,.file-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 9px; min-height: 34px; padding: 0 10px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 11px; }
.inspector-section > header b,.execution-spine > header b,.subagent-panel > header b,.file-panel > header b { font-size: 11px; font-weight: 620; }.inspector-section > header .verified { color: var(--success); }
.inspector-section dl { display: grid; margin: 0; }.inspector-section dl > div { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,auto); gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border); }.inspector-section dl > div:last-child { border-bottom: 0; }.inspector-section dt { color: var(--muted); font-size: 11px; }.inspector-section dd { max-width: 190px; overflow: hidden; margin: 0; font-size: 11px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }.inspector-section ul { display: grid; gap: 5px; margin: 0; padding: 9px 10px 9px 23px; overflow-wrap: anywhere; color: var(--muted); font-size: 11px; }

.execution-spine { overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
.execution-spine ol { margin: 0; padding: 0; list-style: none; }
.execution-spine li { position: relative; display: grid; grid-template-columns: 24px minmax(0,1fr); gap: 8px; min-height: 58px; padding: 9px 9px 7px; }
.execution-spine li:not(:last-child)::after { position: absolute; top: 31px; bottom: -3px; left: 20px; width: 1px; background: var(--border); content: ""; }
.execution-spine li > span { position: relative; z-index: 1; display: grid; width: 24px; height: 24px; place-items: center; }
.execution-spine li > span i { width: 7px; height: 7px; border: 1px solid var(--muted-2); border-radius: 50%; background: var(--surface); }
.execution-spine li.completed > span i { border-color: var(--success); background: var(--success); }.execution-spine li.in_progress > span i { border-color: var(--acid); background: var(--acid); box-shadow: 0 0 0 4px color-mix(in srgb,var(--acid) 13%,transparent); }
.execution-spine li > div { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 6px; }.execution-spine li small { color: var(--muted-2); font-family: ui-monospace,SFMono-Regular,monospace; font-size: 11px; }.execution-spine li b { font-size: 11px; font-weight: 580; line-height: 1.45; }.execution-spine li em { color: var(--muted); font-size: 11px; font-style: normal; }

.subagent-panel,.file-panel { overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
.subagent-card { position: relative; display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: start; gap: 8px; padding: 10px; border-bottom: 1px solid var(--border); }
.subagent-card.parent { background: color-mix(in srgb,var(--acid) 4%,var(--surface)); }.subagent-card > div { display: grid; min-width: 0; gap: 3px; }.subagent-card b { overflow-wrap: anywhere; font-size: 11px; }.subagent-card small { overflow-wrap: anywhere; color: var(--muted); font-size: 11px; line-height: 1.45; }.subagent-card p { display: -webkit-box; overflow: hidden; margin: 3px 0 0; color: var(--muted); font-size: 11px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.agent-node { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid var(--border); border-radius: 7px; background: var(--surface-raised); }.agent-node i { width: 6px; height: 6px; border-radius: 50%; background: var(--acid); }
.subagent-card em { padding: 3px 5px; border: 1px solid var(--border); border-radius: 5px; color: var(--muted); font-size: 11px; font-style: normal; white-space: nowrap; }.subagent-card em.running,.subagent-card em.queued { border-color: color-mix(in srgb,var(--acid) 40%,var(--border)); color: var(--acid-text); }.subagent-card em.succeeded { color: var(--success); }.subagent-card em.failed { color: var(--danger); }
.subagent-card button { grid-column: 2/-1; justify-self: start; min-height: 28px; padding: 0 8px; border: 1px solid color-mix(in srgb,var(--danger) 38%,var(--border)); border-radius: 7px; color: var(--danger); font-size: 11px; background: transparent; cursor: pointer; }

.computer-screen { overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); aspect-ratio: 16/10; }.computer-screen.active { border-color: color-mix(in srgb,var(--acid) 34%,var(--border)); }.screen-bar { display: flex; align-items: center; gap: 4px; height: 22px; padding: 0 7px; border-bottom: 1px solid var(--border); background: var(--surface-raised); }.screen-bar i { width: 5px; height: 5px; border-radius: 50%; background: var(--muted-2); }.computer-screen > div { display: grid; height: calc(100% - 22px); place-content: center; place-items: center; gap: 5px; color: var(--muted); text-align: center; }.computer-screen > div svg { width: 26px; }.computer-screen > div b { font-size: 11px; }.computer-screen > div small { color: var(--muted-2); font-size: 11px; }

.file-panel > a { display: grid; grid-template-columns: 28px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 9px 10px; border-bottom: 1px solid var(--border); color: var(--text); text-decoration: none; }.file-panel > a:hover { background: var(--surface-raised); }.file-icon { display: grid; width: 26px; height: 26px; place-items: center; border: 1px solid var(--border); border-radius: 7px; color: var(--muted); background: var(--surface-raised); }.file-icon svg { width: 13px; }.file-panel > a > span:nth-child(2) { display: grid; min-width: 0; gap: 2px; }.file-panel > a b { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.file-panel > a small { color: var(--muted); font-size: 11px; }.file-panel em { font-size: 11px; font-style: normal; }.file-panel em.passed { color: var(--success); }.file-panel em.failed { color: var(--danger); }
.inspector-inline-empty { padding: 18px 12px; color: var(--muted); font-size: 11px; line-height: 1.55; text-align: center; }

.workspace-notice { position: fixed; top: 68px; right: 20px; z-index: 300; display: flex; align-items: center; gap: 12px; max-width: 420px; padding: 10px 11px; border: 1px solid color-mix(in srgb,var(--acid) 26%,var(--border)); border-radius: 9px; color: var(--text); font-size: 11px; background: var(--surface); box-shadow: 0 18px 50px rgb(0 0 0 / 30%); }.workspace-notice span { flex: 1; min-width: 0; overflow-wrap: anywhere; }.workspace-notice button { display: grid; flex: 0 0 auto; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 7px; color: var(--muted); background: transparent; cursor: pointer; }.workspace-notice svg { width: 13px; }
.visually-hidden { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

@media (max-width: 799px) {
  .quiet-action { min-width: 44px; min-height: 44px; justify-content: center; }
  .quiet-action span { display: none; }
  .workspace-zero { width: min(100% - 24px,680px); padding: 32px 0 24px; align-content: start; }
  .zero-copy { margin-top: 10px; }.zero-copy h1 { font-size: 23px; }
  .suggestion-grid { grid-template-columns: 1fr; margin-top: 18px; }.suggestion-grid > button { min-height: 52px; }
  .suggestion-grid header button,.authorization-strip button,.clarification button,.subagent-card button,.workspace-notice button { min-width: 44px; min-height: 44px; }
  .zero-meta span:nth-child(n+2) { display: none; }
  .authorization-strip header,.authorization-strip article { align-items: flex-start; flex-wrap: wrap; }.authorization-strip button { margin-left: auto; }
  .message-scroll { padding: 24px 12px; }.message-body,.message.user .message-body { max-width: 88%; font-size: 14px; }
  .docked-composer { padding: 10px 8px 8px; }.docked-composer > p { display: none; }
  :deep(.composer-box textarea) { font-size: 16px; }
  :deep(.composer-box .attach),:deep(.composer-box .send) { min-width: 44px; min-height: 44px; }
  .workspace-notice { top: 62px; right: 10px; left: 10px; max-width: none; }
}
@media (max-height: 620px) {
  .workspace-zero { padding-block: 24px; align-content: start; }
  .zero-copy { margin-bottom: 14px; }
  .suggestion-grid { margin-top: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition-duration: 0s !important; animation-duration: 0s !important; animation-iteration-count: 1 !important; }
}
</style>
