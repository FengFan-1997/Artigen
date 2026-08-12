<template>
  <!--
  INTENT: Turn one plain-language design request into a visible, controlled execution without asking users to choose a tool first.
  HIERARCHY: The request and conversation dominate; execution state is second; history, credits, and advanced workbenches stay peripheral.
  CONSTRAINTS: Bright Artigen canvas, ink-black structure, acid-green execution signals, one Qwen3 text model, one Kolors image model, 50-credit automatic cap.
  SIGNATURE: The centered opening prompt docks to the bottom after send while the selected executor unfolds inline as a live plan.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
  -->
  <div class="design-agent" :class="{ 'has-conversation': hasConversation }">
    <TitleBar />

    <div class="workspace" :class="{ 'history-collapsed': historyCollapsed }">
      <aside
        ref="historyPanel"
        class="history"
        :class="{ collapsed: historyCollapsed, open: mobileHistoryOpen }"
        :aria-hidden="isMobileLayout && !mobileHistoryOpen"
        :inert="isMobileLayout && !mobileHistoryOpen"
      >
        <div class="history-head">
          <button
            class="icon-button"
            type="button"
            :aria-label="historyToggleLabel"
            @click="toggleHistory"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h10M4 19h16" /></svg>
          </button>
          <span>{{ zh ? '设计会话' : 'Design sessions' }}</span>
          <button class="new-button" type="button" :aria-label="zh ? '新建设计会话' : 'New design session'" @click="newConversation">＋</button>
        </div>
        <div class="history-list">
          <button
            v-for="item in conversations"
            :key="item.conversationId"
            class="history-item"
            :class="{ active: item.conversationId === conversation?.conversationId }"
            type="button"
            @click="openConversation(item.conversationId)"
          >
            <span>{{ item.title }}</span>
            <small>{{ formatRelative(item.updatedAt) }}</small>
          </button>
          <p v-if="!conversations.length" class="history-empty">
            {{ zh ? '你的设计任务会出现在这里' : 'Your design work will appear here' }}
          </p>
        </div>
        <div class="history-foot">
          <router-link to="/artigen/ai">{{ zh ? '高级生图工作台' : 'Advanced image studio' }}</router-link>
          <router-link to="/artigen/agent">{{ zh ? '电脑 Agent' : 'Computer Agent' }}</router-link>
        </div>
      </aside>

      <button
        v-if="mobileHistoryOpen"
        class="drawer-backdrop"
        type="button"
        aria-label="Close history"
        @click="closeMobileHistory()"
      ></button>

      <main class="conversation-canvas">
        <header class="conversation-topbar">
          <button ref="mobileHistoryButton" class="mobile-history-button" type="button" @click="openMobileHistory">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h10M4 19h16" /></svg>
            <span>{{ zh ? '历史' : 'History' }}</span>
          </button>
          <div class="runtime-status" :class="{ unavailable: status && !status.plannerReady }" role="status" aria-live="polite">
            <span></span>
            <b>{{ runtimeLabel }}</b>
          </div>
          <div class="model-lock">
            <span>Qwen3</span>
            <span>Kolors</span>
            <span>{{ zh ? `默认自动上限 ${status?.autoCreditCap ?? 50} 点` : `Default auto cap ${status?.autoCreditCap ?? 50}` }}</span>
          </div>
        </header>

        <section v-if="!hasConversation" class="zero-state">
          <div class="brand-signal" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="eyebrow">ARTIGEN DESIGN AGENT</p>
          <h1>{{ zh ? '你今天想设计什么？' : 'What do you want to design today?' }}</h1>
          <p class="zero-lead">
            {{
              zh
                ? '直接说结果。简单生图会快速完成，专项处理会进入对应工作流，复杂项目才会启用电脑 Agent。'
                : 'Describe the outcome. Quick images stay fast, specialist work uses focused workflows, and complex projects use the computer agent.'
            }}
          </p>
          <ComposerBox
            :draft="draft"
            :attachments="selectedAttachments"
            :busy="sending"
            :placeholder="zh ? '例如：为新款柚子气泡水设计一张夏日主视觉…' : 'Example: Design a summer key visual for a yuzu soda…'"
            @update:draft="draft = $event"
            @submit="submitMessage"
            @attach="openFilePicker()"
            @remove-attachment="removeAttachment"
          />
          <p class="zero-privacy">
            {{ zh ? '附件先留在你的浏览器；只有确定需要云端执行时才会上传。' : 'Attachments stay in your browser and upload only after a cloud execution is selected.' }}
          </p>
          <div class="suggestions">
            <div class="suggestion-label">
              <span>{{ zh ? '试试这些任务' : 'Try a task' }}</span>
              <button type="button" :aria-label="zh ? '换一组建议' : 'Show different suggestions'" @click="rotateSuggestions">↻</button>
            </div>
            <button
              v-for="suggestion in visibleSuggestions"
              :key="suggestion"
              type="button"
              @click="useSuggestion(suggestion)"
            >
              <span>↗</span>{{ suggestion }}
            </button>
          </div>
        </section>

        <section v-else class="chat-state">
          <div ref="scrollArea" class="message-scroll">
            <div class="conversation-title-row">
              <div>
                <p class="eyebrow">{{ executorSummary }}</p>
                <h1>{{ conversation?.title }}</h1>
              </div>
              <button type="button" class="delete-session" @click="removeCurrentConversation">
                {{ zh ? '删除会话' : 'Delete' }}
              </button>
            </div>

            <section v-if="activeAuthorizations.length" class="active-authorizations" aria-live="polite">
              <div>
                <p>{{ zh ? '本会话活动授权' : 'Active session authorization' }}</p>
                <span>{{ zh ? '严格按站点与动作类型生效；连续 30 分钟未使用后失效。' : 'Bound to one site and action type; expires after 30 idle minutes.' }}</span>
              </div>
              <article v-for="authorization in activeAuthorizations" :key="authorization.authorizationId">
                <b>{{ authorization.siteOrigin }}</b>
                <span>{{ authorizationActionLabel(authorization.actionType) }} · {{ formatAuthorizationExpiry(authorization.expiresAt) }}</span>
                <button type="button" @click="revokeAuthorization(authorization.authorizationId)">{{ zh ? '撤销' : 'Revoke' }}</button>
              </article>
            </section>

            <template v-for="message in conversation?.messages || []" :key="message.messageId">
              <article class="message" :class="message.role">
                <div v-if="message.role === 'assistant'" class="assistant-mark">A</div>
                <div class="message-body">
                  <p>{{ message.text }}</p>
                  <div v-if="message.attachments.length" class="message-files">
                    <span v-for="file in message.attachments" :key="file.clientId">
                      {{ file.name }} · {{ formatBytes(file.byteSize) }}
                    </span>
                  </div>
                  <div v-if="message.questions.length" class="clarification">
                    <button
                      v-for="question in message.questions"
                      :key="question"
                      type="button"
                      @click="draft = question"
                    >
                      {{ question }}
                    </button>
                    <button class="recommended" type="button" @click="sendRecommended">
                      {{ zh ? '按推荐直接做' : 'Use recommended assumptions' }}
                    </button>
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
              <div class="assistant-mark">A</div>
              <div class="message-body">
                <div class="planning-line"><span></span><span></span><span></span></div>
                <p>{{ zh ? '正在理解需求并选择最合适的执行器…' : 'Understanding the request and choosing the right executor…' }}</p>
              </div>
            </article>
          </div>

          <div class="docked-composer">
            <ComposerBox
              :draft="draft"
              :attachments="selectedAttachments"
              :busy="sending"
              :placeholder="zh ? '继续描述，或提出一个新的设计任务…' : 'Continue, or describe a new design task…'"
              compact
              @update:draft="draft = $event"
              @submit="submitMessage"
              @attach="openFilePicker()"
              @remove-attachment="removeAttachment"
            />
            <p>{{ zh ? '附件会先留在浏览器；确定需要云端执行后才上传。' : 'Attachments stay in your browser until a cloud execution is selected.' }}</p>
          </div>
        </section>

        <div v-if="notice" class="notice" role="status">
          <span>{{ notice }}</span>
          <button type="button" @click="notice = ''">×</button>
        </div>
      </main>
    </div>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      multiple
      accept=".pdf,.zip,.docx,.xlsx,.pptx,.txt,.md,.csv,image/png,image/jpeg,image/webp"
      @change="onFilesSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import TitleBar from '../components/TitleBar.vue';
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
  getAgentRun,
  openAgentEventStream,
  submitAgentInput,
  type AgentApproval,
  type AgentRun
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
const historyCollapsed = ref(false);
const mobileHistoryOpen = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const scrollArea = ref<HTMLElement | null>(null);
const historyPanel = ref<HTMLElement | null>(null);
const mobileHistoryButton = ref<HTMLButtonElement | null>(null);
const attachmentTarget = ref('');
const suggestionOffset = ref(0);
const isMobileLayout = ref(false);
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
  const latest = conversation.value?.executions?.at(-1);
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
const historyToggleLabel = computed(() => {
  if (isMobileLayout.value) return zh.value ? '关闭历史' : 'Close history';
  if (historyCollapsed.value) return zh.value ? '展开历史' : 'Expand history';
  return zh.value ? '收起历史' : 'Collapse history';
});

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
  closeMobileHistory(false);
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
  closeMobileHistory(false);
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

const executionsForMessage = (messageId: string) => (
  conversation.value?.executions?.filter((item) => item.sourceMessageId === messageId) || []
);

const handleAuthChanged = () => {
  syncAuth();
  if (isAuthed.value) void refreshConversationList();
};

const syncLayout = () => {
  isMobileLayout.value = window.matchMedia('(max-width: 900px)').matches;
  if (!isMobileLayout.value) mobileHistoryOpen.value = false;
};
const openMobileHistory = async () => {
  mobileHistoryOpen.value = true;
  await nextTick();
  historyPanel.value?.querySelector<HTMLButtonElement>('button')?.focus();
};
const closeMobileHistory = (restoreFocus = true) => {
  mobileHistoryOpen.value = false;
  if (restoreFocus) void nextTick(() => mobileHistoryButton.value?.focus());
};
const toggleHistory = () => {
  if (isMobileLayout.value) closeMobileHistory();
  else historyCollapsed.value = !historyCollapsed.value;
};
const handleWorkspaceKeydown = (event: KeyboardEvent) => {
  if (!mobileHistoryOpen.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMobileHistory();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(historyPanel.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'
  ) || []).filter((item) => item.offsetParent !== null);
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

onMounted(async () => {
  window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
  window.addEventListener('resize', syncLayout);
  window.addEventListener('keydown', handleWorkspaceKeydown);
  syncLayout();
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
  window.removeEventListener('resize', syncLayout);
  window.removeEventListener('keydown', handleWorkspaceKeydown);
  closeConversationStream?.();
  executionStreams.forEach((close) => close());
  executionStreams.clear();
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
});
</script>

<style scoped>
.design-agent {
  --paper: #f6f7f0;
  --surface: #ffffff;
  --ink: #10110f;
  --muted: #686b63;
  --line: #dfe1d8;
  --acid: #c7ff19;
  --acid-dark: #82a900;
  --blue: #2878ff;
  min-height: 100vh;
  color: var(--ink);
  background: var(--paper);
}
.workspace { display: grid; grid-template-columns: 252px minmax(0, 1fr); min-height: calc(100vh - 80px); }
.workspace.history-collapsed { grid-template-columns: 64px minmax(0, 1fr); }
.history { position: relative; z-index: 30; display: flex; flex-direction: column; box-sizing: border-box; min-width: 0; border-right: 1px solid var(--line); background: #f0f1e9; transition: transform 180ms ease; }
.history.collapsed { width: 64px; }
.history.collapsed .history-head > span,.history.collapsed .history-list,.history.collapsed .history-foot,.history.collapsed .new-button { display: none; }
.history-head { display: flex; align-items: center; gap: 10px; height: 64px; padding: 0 14px; border-bottom: 1px solid var(--line); font-weight: 760; }
.icon-button,.new-button,.mobile-history-button { display: inline-flex; align-items: center; justify-content: center; border: 0; color: inherit; background: transparent; cursor: pointer; }
.icon-button { width: 36px; height: 36px; border-radius: 10px; }
.icon-button:hover { background: #e3e5db; }
.icon-button svg,.mobile-history-button svg { width: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.new-button { width: 32px; height: 32px; margin-left: auto; border: 1px solid #c8cbc0; border-radius: 50%; font-size: 20px; }
.history-list { flex: 1; overflow: auto; padding: 10px; }
.history-item { display: grid; width: 100%; gap: 4px; margin-bottom: 4px; padding: 12px; border: 1px solid transparent; border-radius: 12px; color: inherit; text-align: left; background: transparent; cursor: pointer; }
.history-item:hover { background: #e8e9e1; }
.history-item.active { border-color: #c9ccbf; background: var(--surface); }
.history-item span { overflow: hidden; font-size: 14px; font-weight: 690; text-overflow: ellipsis; white-space: nowrap; }
.history-item small,.history-empty { color: var(--muted); font-size: 12px; }
.history-empty { padding: 18px 12px; line-height: 1.6; }
.history-foot { display: grid; gap: 7px; padding: 14px; border-top: 1px solid var(--line); }
.history-foot a { color: #4d5049; font-size: 12px; text-decoration: none; }
.history-foot a:hover { color: var(--ink); }
.conversation-canvas { position: relative; min-width: 0; min-height: calc(100vh - 80px); background: var(--surface); }
.conversation-topbar { position: absolute; top: 0; right: 0; left: 0; z-index: 12; display: flex; align-items: center; justify-content: space-between; min-height: 64px; padding: 0 30px; border-bottom: 1px solid transparent; background: rgba(255,255,255,.92); }
.has-conversation .conversation-topbar { border-bottom-color: var(--line); }
.runtime-status,.model-lock { display: flex; align-items: center; gap: 8px; }
.runtime-status > span { width: 8px; height: 8px; border-radius: 50%; background: var(--acid-dark); box-shadow: 0 0 0 4px rgba(199,255,25,.28); }
.runtime-status.unavailable > span { background: #d99500; box-shadow: 0 0 0 4px rgba(217,149,0,.14); }
.runtime-status b { font-size: 12px; letter-spacing: .02em; }
.model-lock span { padding: 5px 9px; border: 1px solid var(--line); border-radius: 999px; color: #585b54; font-size: 10px; font-weight: 760; letter-spacing: .04em; }
.mobile-history-button { display: none; gap: 7px; font-weight: 700; }
.zero-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: calc(100vh - 80px); padding: 110px 30px 60px; }
.brand-signal { position: relative; width: 62px; height: 62px; margin-bottom: 20px; border: 1px solid #b9bdaf; border-radius: 18px; background: var(--acid); box-shadow: 8px 8px 0 var(--ink); transform: rotate(-2deg); }
.brand-signal span { position: absolute; display: block; background: var(--ink); }
.brand-signal span:nth-child(1) { top: 16px; left: 15px; width: 30px; height: 2px; }
.brand-signal span:nth-child(2) { top: 29px; left: 15px; width: 21px; height: 2px; }
.brand-signal span:nth-child(3) { top: 42px; left: 15px; width: 30px; height: 2px; }
.eyebrow { margin: 0 0 9px; color: #72766d; font-size: 11px; font-weight: 820; letter-spacing: .16em; }
.zero-state h1 { margin: 0; font-size: clamp(38px, 5vw, 72px); font-weight: 780; letter-spacing: -.055em; line-height: .98; text-align: center; }
.zero-lead { max-width: 690px; margin: 22px auto 30px; color: var(--muted); font-size: 16px; line-height: 1.7; text-align: center; }
.zero-state :deep(.composer-box) { width: min(820px, 100%); }
.zero-privacy { width: min(820px, 100%); margin: 10px 0 0; color: var(--muted); font-size: 11px; text-align: center; }
.suggestions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; width: min(820px, 100%); margin-top: 20px; }
.suggestion-label { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; font-weight: 700; }
.suggestion-label button { border: 0; background: transparent; cursor: pointer; }
.suggestions > button { display: flex; align-items: flex-start; gap: 8px; min-height: 70px; padding: 13px; border: 1px solid var(--line); border-radius: 14px; color: #32342f; font: inherit; font-size: 13px; line-height: 1.45; text-align: left; background: #fafbf6; cursor: pointer; }
.suggestions > button:hover { border-color: #9ca08f; background: var(--surface); transform: translateY(-1px); }
.suggestions > button span { color: var(--acid-dark); font-weight: 900; }
.chat-state { min-height: calc(100vh - 80px); }
.message-scroll { height: calc(100vh - 80px); overflow-y: auto; padding: 104px clamp(22px, 7vw, 110px) 220px; scroll-padding-bottom: 210px; }
.conversation-title-row { display: flex; align-items: end; justify-content: space-between; max-width: 980px; margin: 0 auto 46px; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
.conversation-title-row h1 { max-width: 760px; margin: 0; font-size: clamp(28px, 4vw, 48px); line-height: 1.05; letter-spacing: -.045em; }
.delete-session { padding: 8px 0; border: 0; color: #8a3931; font-size: 12px; background: transparent; cursor: pointer; }
.active-authorizations { display: grid; gap: 8px; max-width: 920px; margin: -26px auto 28px; padding: 12px; border: 1px solid #e3c46f; border-radius: 12px; background: #fffae9; }.active-authorizations > div { display: grid; gap: 2px; }.active-authorizations p { margin: 0; font-size: 11px; font-weight: 820; }.active-authorizations span { color: #69614c; font-size: 10px; }.active-authorizations article { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 10px; align-items: center; padding-top: 8px; border-top: 1px solid #ead9a9; }.active-authorizations b { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.active-authorizations button { min-height: 36px; padding: 0 10px; border: 1px solid #9d4a42; border-radius: 8px; color: #8c322b; background: #fff; cursor: pointer; }
.message { display: flex; gap: 14px; max-width: 920px; margin: 0 auto 24px; }
.message.user { justify-content: flex-end; }
.message.user .message-body { max-width: 72%; border-radius: 22px 22px 4px 22px; background: #edf0e7; }
.message.assistant .message-body { max-width: 78%; padding-left: 0; }
.assistant-mark { flex: 0 0 auto; display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid var(--ink); border-radius: 8px; font-size: 12px; font-weight: 900; background: var(--acid); }
.message-body { padding: 13px 16px; border-radius: 16px; line-height: 1.65; }
.message-body p { margin: 0; white-space: pre-wrap; }
.message-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.message-files span { padding: 5px 8px; border: 1px solid #d2d5ca; border-radius: 8px; font-size: 11px; background: #fff; }
.clarification { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
.clarification button { padding: 8px 11px; border: 1px solid #c8cbc0; border-radius: 999px; color: inherit; background: #fff; cursor: pointer; }
.clarification .recommended { border-color: var(--ink); color: #fff; background: var(--ink); }
.planning-message { opacity: .8; }
.planning-line { display: flex; gap: 4px; margin-bottom: 8px; }
.planning-line span { width: 7px; height: 7px; border-radius: 50%; background: var(--acid-dark); animation: thinking 900ms infinite ease-in-out alternate; }
.planning-line span:nth-child(2) { animation-delay: 160ms; }.planning-line span:nth-child(3) { animation-delay: 320ms; }
@keyframes thinking { to { opacity: .25; transform: translateY(-3px); } }
.docked-composer { position: absolute; right: 0; bottom: 0; left: 0; z-index: 10; padding: 28px clamp(22px, 7vw, 110px) 24px; border-top: 1px solid rgba(223,225,216,.72); background: #fff; box-shadow: 0 -18px 40px rgba(255,255,255,.95); }
.docked-composer :deep(.composer-box) { max-width: 920px; margin: 0 auto; }
.docked-composer > p { max-width: 920px; margin: 8px auto 0; color: var(--muted); font-size: 10px; text-align: center; }
.notice { position: fixed; right: 24px; bottom: 24px; z-index: 100; display: flex; align-items: center; gap: 16px; max-width: 460px; padding: 12px 14px; border: 1px solid #2c2d29; border-radius: 12px; color: #fff; font-size: 13px; background: #181915; box-shadow: 0 14px 40px rgba(0,0,0,.2); }
.notice button { border: 0; color: #fff; background: transparent; cursor: pointer; }
.drawer-backdrop { display: none; }.visually-hidden { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
@media (max-width: 900px) {
  .workspace,.workspace.history-collapsed { display: block; }
  .history { position: fixed; top: 0; bottom: 0; left: 0; width: min(84vw, 320px); transform: translateX(-105%); box-shadow: 20px 0 60px rgba(0,0,0,.16); }
  .history.open { transform: translateX(0); }
  .history.collapsed { width: min(84vw, 320px); }
  .history.collapsed .history-head > span,.history.collapsed .history-list,.history.collapsed .history-foot,.history.collapsed .new-button { display: flex; }
  .drawer-backdrop { position: fixed; inset: 0; z-index: 25; display: block; border: 0; background: rgba(12,13,11,.26); }
  .mobile-history-button { display: inline-flex; }
  .conversation-topbar { padding: 0 18px; }
  .runtime-status:not(.unavailable) { display: none; }
  .runtime-status.unavailable { display: flex; max-width: 150px; }
  .runtime-status.unavailable b { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .model-lock span:nth-child(-n+2) { display: none; }
  .zero-state { padding: 100px 18px 40px; }
  .suggestions { grid-template-columns: 1fr; }
  .message-scroll { padding: 92px 16px 260px; }
  .conversation-title-row { align-items: flex-start; gap: 18px; margin-bottom: 30px; }
  .active-authorizations { margin-top: -14px; }.active-authorizations article { grid-template-columns: minmax(0,1fr) auto; }.active-authorizations article span { grid-column: 1 / -1; grid-row: 2; }
  .message.user .message-body,.message.assistant .message-body { max-width: 88%; }
  .docked-composer { padding: 25px 12px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
</style>
