<template>
  <AgentWorkspaceShell
    :zh="zh"
    :title="zh ? '电脑 Agent' : 'Computer Agent'"
    subtitle=""
    :status-label="workspaceStatus.label"
    :status-tone="workspaceStatus.tone"
    :credit-label="quoteIsCurrent && quote ? `${quote.freeCreditsRemaining} ${zh ? '点可用' : 'available'}` : '—'"
    :credit-caption="zh ? '可用点数' : 'Available credits'"
    :task-cost-label="quoteIsCurrent && quote ? `${zh ? '预算上限' : 'Budget limit'} ${form.maxCredits} ${zh ? '点' : 'credits'}` : ''"
    :default-inspector-collapsed="!hasConversation"
    default-inspector-tab="environment"
    :live-announcement="notice"
    @new-task="resetRunDraft"
  >
    <template #history="{ search }">
      <div class="history-group">
        <div class="history-label">
          <span>{{ zh ? '最近运行' : 'Recent runs' }}</span>
          <button type="button" :aria-label="zh ? '刷新任务' : 'Refresh runs'" :disabled="loadingRuns" @click="loadRuns">
            <WorkspaceIcon name="refresh" />
          </button>
        </div>
        <div v-if="loadingRuns" class="history-empty">{{ zh ? '正在同步…' : 'Syncing…' }}</div>
        <div v-else-if="!filteredRuns(search).length" class="history-empty">{{ zh ? '没有匹配任务' : 'No matching runs' }}</div>
        <router-link
          v-for="run in filteredRuns(search)"
          v-else
          :key="run.runId"
          class="history-run"
          :to="`/artigen/agent/runs/${run.runId}`"
        >
          <i :class="run.status"></i>
          <span><b>{{ run.objectivePreview || (zh ? '未命名任务' : 'Untitled task') }}</b><small>{{ statusLabel(run.status) }} · {{ formatDate(run.updatedAt) }}</small></span>
        </router-link>
      </div>
    </template>

    <section class="agent-conversation" :class="{ active: hasConversation }">
      <div class="conversation-scroll" aria-live="polite">
        <div v-if="!hasConversation" class="conversation-empty">
          <h1>{{ zh ? '今天要一起完成什么？' : 'What should we finish together?' }}</h1>
        </div>

        <div v-else class="conversation-thread">
          <article v-if="submittedObjective" class="conversation-message user-message">
            <div class="message-avatar">{{ zh ? '你' : 'You' }}</div>
            <div>
              <p>{{ submittedObjective }}</p>
              <span v-if="selectedFiles.length">{{ selectedFiles.length }} {{ zh ? '个参考文件将在启动后上传' : 'reference files upload after launch' }}</span>
            </div>
          </article>

          <article class="conversation-message assistant-message">
            <div class="message-avatar agent-avatar" aria-hidden="true">A</div>
            <div class="assistant-content">
              <template v-if="quoting">
                <strong>{{ zh ? '正在核验执行范围与真实费用…' : 'Checking scope and live cost…' }}</strong>
                <p>{{ zh ? '确认后才会创建任务。' : 'Nothing is created until you confirm.' }}</p>
              </template>
              <template v-else-if="quoteIsCurrent && quote">
                <strong>{{ quoteCanStart ? (zh ? '真实报价已准备好' : 'Live quote is ready') : (zh ? '当前无法启动' : 'Cannot start yet') }}</strong>
                <p>{{ quoteCanStart ? (zh ? '确认后开始执行。' : 'Confirm to start.') : quoteBlockerText }}</p>
                <section class="quote-scope" :aria-label="zh ? '本次执行范围' : 'Scope of this run'">
                  <b>{{ zh ? '本次执行范围' : 'Scope of this run' }}</b>
                  <p>{{ scopeReceipt }}</p>
                  <p v-if="form.capabilities.browser">{{ zh ? '允许访问：' : 'Allowed sites: ' }}{{ browserConfig().allowedOrigins?.join(' · ') || '—' }}</p>
                  <p v-if="selectedFiles.length">{{ zh ? '参考文件：' : 'References: ' }}{{ selectedFiles.map(file => file.name).join(' · ') }}</p>
                  <button type="button" :disabled="busy" @click="editQuotedRequest">{{ zh ? '修改要求与附件' : 'Edit request and references' }}</button>
                </section>
                <dl class="quote-summary">
                  <div><dt>{{ zh ? '预计' : 'Estimate' }}</dt><dd>{{ quote.estimatedCredits.minimum }}–{{ quote.estimatedCredits.maximum }} {{ zh ? '点' : 'cr' }}</dd></div>
                  <div><dt>{{ zh ? '冻结' : 'Hold' }}</dt><dd>{{ quote.requiredPaidHold }} {{ zh ? '点' : 'cr' }}</dd></div>
                  <div><dt>{{ zh ? '上限' : 'Limit' }}</dt><dd>{{ form.maxCredits }} {{ zh ? '点' : 'cr' }}</dd></div>
                  <div><dt>{{ zh ? '结算' : 'Billing' }}</dt><dd>{{ zh ? '仅一次' : 'Once' }}</dd></div>
                </dl>
                <button class="run-action" type="button" :disabled="busy || !quoteCanStart" @click="startRun">
                  <WorkspaceIcon name="play" />
                  {{ creating ? (zh ? '正在启动…' : 'Starting…') : (zh ? '确认并运行' : 'Confirm and run') }}
                </button>
              </template>
              <template v-else>
                <strong>{{ noticeIsError ? (zh ? '需要你处理一项问题' : 'One issue needs your attention') : (zh ? '任务内容已更新' : 'The task changed') }}</strong>
                <p>{{ notice || (zh ? '重新发送后，我会更新报价。' : 'Send again to refresh the quote.') }}</p>
              </template>
              <p v-if="notice && quoteIsCurrent" class="workspace-notice" :class="{ error: noticeIsError }">{{ notice }}</p>
            </div>
          </article>
        </div>
      </div>

      <div class="conversation-dock">
        <div class="objective-composer">
          <ComposerBox
            ref="objectiveComposer"
            :draft="form.objective"
            :attachments="composerAttachments"
            :busy="busy"
            :busy-label="uploadingAssets ? (zh ? `正在上传 ${selectedFiles.length} 个参考文件…` : `Uploading ${selectedFiles.length} references…`) : creating ? (zh ? '正在启动任务…' : 'Starting task…') : (zh ? '正在获取报价…' : 'Getting quote…')"
            :keyboard-hint="zh ? 'Enter 发送 · Shift+Enter 换行' : 'Enter to send · Shift+Enter for a new line'"
            :placeholder="zh ? '描述目标、受众、交付物或参考方向…' : 'Describe the goal, audience, deliverables, or references…'"
            :attach-label="zh ? '添加参考' : 'Add reference'"
            :attachment-count-label="zh ? '个文件' : 'files'"
            :attachment-hint="zh ? '文件会留在当前设备，启动任务后才上传' : 'Files stay on this device until the run starts'"
            :request-label="zh ? '任务目标' : 'Task objective'"
            :send-label="zh ? '发送任务目标' : 'Send task objective'"
            :remove-attachment-label="zh ? '移除' : 'Remove'"
            input-name="agent-objective"
            compact
            @update:draft="form.objective = $event"
            @submit="sendObjective"
            @attach="openFilePicker"
            @remove-attachment="removeSelectedFile"
          />
        </div>
        <p v-if="draftRestored" class="draft-restored" role="status">{{ zh ? '已恢复本机草稿；如需参考文件，请重新选择。' : 'Your local draft was restored. Choose any reference files again.' }}</p>
        <div v-if="!hasConversation" class="prompt-suggestions" :aria-label="zh ? '任务建议' : 'Task suggestions'">
          <button v-for="(preset, index) in presets" :key="preset" type="button" @click="applyPreset(index)">
            <span>{{ suggestionLabels[index] }}</span>
            <WorkspaceIcon class="prompt-suggestion-arrow" name="arrow-right" />
          </button>
        </div>
      </div>
    </section>

    <input
      ref="fileInput"
      class="visually-hidden"
      name="agent-reference-files"
      type="file"
      tabindex="-1"
      multiple
      accept=".pdf,.docx,.xlsx,.pptx,.zip,.txt,.md,.csv,image/png,image/jpeg,image/webp"
      :aria-label="zh ? '添加参考文件' : 'Add reference files'"
      @change="selectFiles"
    />

    <template #environment>
      <div class="inspector-stack">
        <section class="inspector-card">
          <header><span>{{ zh ? '执行环境' : 'Environment' }}</span><i :class="{ healthy: workerReady }"></i></header>
          <dl>
            <div><dt>{{ zh ? '状态' : 'Status' }}</dt><dd>{{ workerStatusLabel }}</dd></div>
          </dl>
        </section>
        <section class="inspector-card">
          <header><span>{{ zh ? '交付物' : 'Deliverables' }}</span></header>
          <div class="option-grid" role="group" :aria-label="zh ? '交付物' : 'Deliverables'">
            <label v-for="item in deliverableOptions" :key="item.id" :class="{ disabled: item.disabled, selected: form.deliverables[item.id] }">
              <b class="deliverable-format">{{ item.code }}</b>
              <span class="deliverable-label">{{ item.label }}<small v-if="item.disabled">{{ zh ? '暂不可用' : 'Unavailable' }}</small></span>
              <input v-model="form.deliverables[item.id]" :name="`deliverable-${item.id}`" type="checkbox" :disabled="item.disabled" />
            </label>
          </div>
        </section>
        <TechnicalDetails :label="zh ? '运行设置' : 'Run settings'">
          <section class="inspector-card runtime-settings">
            <header><span>{{ zh ? '能力' : 'Capabilities' }}</span></header>
            <div class="capability-list">
              <label v-for="capability in capabilityOptions" :key="capability.id" :class="{ disabled: capability.disabled }">
                <input v-model="form.capabilities[capability.id]" :name="`capability-${capability.id}`" type="checkbox" :disabled="capability.disabled" />
                <span><b>{{ capability.label }}</b></span>
              </label>
            </div>
          </section>
          <section v-if="form.capabilities.browser" class="inspector-card browser-scope runtime-settings">
            <label for="agent-allowed-origins">{{ zh ? '允许访问的站点' : 'Allowed sites' }}</label>
            <input id="agent-allowed-origins" v-model.trim="form.browserOrigins" name="allowed-origins" type="text" autocomplete="off" spellcheck="false" aria-describedby="agent-origin-help" :placeholder="zh ? '例如 https://example.com' : 'For example, https://example.com'" />
            <small id="agent-origin-help">{{ zh ? '填写完整 HTTPS 站点，不含路径；多个站点用逗号分隔。' : 'Use HTTPS origins without paths. Separate sites with commas.' }}</small>
            <label><input v-model="form.persistSession" name="persist-browser-session" type="checkbox" />{{ zh ? '加密保存会话 30 天' : 'Encrypt session for 30 days' }}</label>
            <label v-if="browserProfiles.length" for="agent-browser-profile">{{ zh ? '恢复已保存的会话' : 'Restore saved session' }}</label>
            <select v-if="browserProfiles.length" id="agent-browser-profile" v-model="form.profileId" name="browser-profile" @change="selectBrowserProfile">
              <option value="">{{ zh ? '不恢复已保存会话' : 'No saved session' }}</option>
              <option v-for="profile in browserProfiles" :key="profile.profileId" :value="profile.profileId">{{ profile.label }} · {{ profile.siteOrigin }}</option>
            </select>
            <button v-if="form.profileId" type="button" class="text-danger" @click="revokeSelectedProfile">{{ zh ? '撤销会话' : 'Revoke session' }}</button>
          </section>
        </TechnicalDetails>
        <section class="inspector-card">
          <header><span>{{ zh ? '最高预算' : 'Maximum budget' }}</span><b>{{ form.maxCredits }} {{ zh ? '点' : 'cr' }}</b></header>
          <input v-model.number="form.maxCredits" name="max-credits" class="budget-range" type="range" min="10" max="500" step="10" :aria-label="zh ? '最高预算点数' : 'Maximum credit budget'" />
          <small>{{ zh ? '按实际使用结算，未使用部分自动释放。' : 'Actual usage only; unused hold is released.' }}</small>
        </section>
        <TechnicalDetails :label="zh ? '技术详情' : 'Technical details'">
          <dl class="technical-list">
            <div><dt>{{ zh ? '文本与规划' : 'Text & planning' }}</dt><dd>{{ activeTextModel }}</dd></div>
            <div><dt>{{ zh ? '全部图片' : 'All images' }}</dt><dd>Kwai-Kolors/Kolors</dd></div>
            <div><dt>Worker</dt><dd>{{ workerReady ? (zh ? '在线' : 'Online') : (serviceStatus?.workerOnline ? (zh ? '配置不匹配' : 'Model mismatch') : (zh ? '离线' : 'Offline')) }}</dd></div>
            <div><dt>{{ zh ? '受限出口' : 'Restricted egress' }}</dt><dd>{{ serviceStatus?.egressVerified ? (zh ? '已验证' : 'Verified') : (zh ? '未就绪' : 'Not ready') }}</dd></div>
            <div><dt>{{ zh ? '队列' : 'Queue' }}</dt><dd>{{ serviceStatus?.queueDepth ?? '—' }}</dd></div>
            <div><dt>{{ zh ? '子 Agent' : 'Subagents' }}</dt><dd>{{ serviceStatus?.subagentsEnabled ? (zh ? '最多 3 个' : 'Up to 3') : (zh ? '已关闭' : 'Off') }}</dd></div>
          </dl>
        </TechnicalDetails>
      </div>
    </template>

    <template #plan>
      <div class="execution-spine">
        <article class="complete"><i></i><div><b>{{ zh ? '理解目标' : 'Understand objective' }}</b><span>{{ form.objective.length >= 3 ? (zh ? '目标已就绪' : 'Objective ready') : (zh ? '等待输入' : 'Waiting for input') }}</span></div></article>
        <article :class="{ complete: quoteIsCurrent }"><i></i><div><b>{{ zh ? '核验预算与权限' : 'Verify budget & grants' }}</b><span>{{ quoteIsCurrent ? (zh ? '报价已锁定' : 'Quote locked') : (zh ? '尚未报价' : 'Not quoted') }}</span></div></article>
        <article><i></i><div><b>{{ zh ? '规划与委派' : 'Plan & delegate' }}</b><span>{{ zh ? '运行后由父 Agent 决定是否拆出子任务' : 'The parent decides whether to delegate after launch' }}</span></div></article>
        <article><i></i><div><b>{{ zh ? '验证并交付' : 'Verify & deliver' }}</b><span>{{ zh ? '父 Agent 独占最终声明' : 'Final declarations stay with the parent' }}</span></div></article>
      </div>
    </template>

    <template #subagents>
      <div class="inspector-stack">
        <section class="inspector-card subagent-overview">
          <header><span>{{ zh ? '真实子 Agent' : 'Real subagents' }}</span><i :class="{ healthy: serviceStatus?.subagentsEnabled }"></i></header>
          <strong>{{ serviceStatus?.subagentsEnabled ? (zh ? '可并行 3 个独立上下文' : '3 isolated contexts available') : (zh ? '当前环境未开启' : 'Disabled in this environment') }}</strong>
          <p>{{ zh ? '需要并行处理时自动出现。' : 'They appear automatically when parallel work helps.' }}</p>
        </section>
        <TechnicalDetails :label="zh ? '能力边界' : 'Capability limits'">
          <section class="boundary-list">
            <b>{{ zh ? '子 Agent 可以' : 'Children can' }}</b>
            <span>{{ zh ? '读取授权输入、维护计划、运行离线 Shell' : 'Read granted inputs, update plans, run offline shell' }}</span>
            <b>{{ zh ? '子 Agent 不可以' : 'Children cannot' }}</b>
            <span>{{ zh ? '浏览器、电脑、连接器、Kolors、审批、最终交付' : 'Browser, computer, connectors, Kolors, approvals, final delivery' }}</span>
          </section>
        </TechnicalDetails>
      </div>
    </template>

    <template #computer>
      <div class="inspector-stack">
        <section class="inspector-card">
          <header><span>{{ zh ? '安全桌面' : 'Secure desktop' }}</span><i :class="{ healthy: serviceStatus?.desktopRelayReady }"></i></header>
          <strong>{{ serviceStatus?.desktopRelayReady ? (zh ? '接管中继已就绪' : 'Takeover relay ready') : (zh ? '等待 Worker' : 'Waiting for worker') }}</strong>
          <dl>
            <div><dt>Worker</dt><dd>{{ workerReady ? (zh ? '在线' : 'Online') : (serviceStatus?.workerOnline ? (zh ? '配置不匹配' : 'Model mismatch') : (zh ? '离线' : 'Offline')) }}</dd></div>
            <div><dt>{{ zh ? '受限出口' : 'Restricted egress' }}</dt><dd>{{ serviceStatus?.egressVerified ? (zh ? '已验证' : 'Verified') : (zh ? '未就绪' : 'Not ready') }}</dd></div>
            <div><dt>{{ zh ? '队列' : 'Queue' }}</dt><dd>{{ serviceStatus?.queueDepth ?? '—' }}</dd></div>
          </dl>
        </section>
      </div>
    </template>

    <template #files>
      <div class="inspector-stack">
        <section class="inspector-card">
          <header><span>{{ zh ? '任务输入' : 'Task inputs' }}</span><b>{{ selectedFiles.length }}</b></header>
          <div v-if="selectedFiles.length" class="file-list">
            <span v-for="file in selectedFiles" :key="`inspector-${file.name}:${file.size}`"><b>{{ file.name }}</b><small>{{ (file.size / 1024 / 1024).toFixed(1) }} MiB</small></span>
          </div>
          <p v-else>{{ zh ? '参考文件仅在启动云端任务时上传。' : 'Reference files upload only when a cloud run starts.' }}</p>
        </section>
        <section class="inspector-card">
          <header><span>{{ zh ? '验证边界' : 'Verification boundary' }}</span></header>
          <p>{{ zh ? '所有最终文件由父 Agent 声明，通过病毒扫描、格式解析、大小限制与 SHA-256 后才可下载。' : 'Only parent-declared files become deliverables after malware, format, size, and SHA-256 verification.' }}</p>
        </section>
      </div>
    </template>
  </AgentWorkspaceShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { getCurrentUserId } from '@/login/session';
import { useWorkspaceDraft } from '../composables/useWorkspaceDraft';
import ComposerBox from '../components/designConversation/ComposerBox.vue';
import AgentWorkspaceShell from '../components/workspace/AgentWorkspaceShell.vue';
import TechnicalDetails from '../components/workspace/TechnicalDetails.vue';
import WorkspaceIcon from '../components/workspace/WorkspaceIcon.vue';
import { mergeReferenceFiles, referenceFileKey } from '../utils/referenceFiles';
import {
  createAgentRun,
  getAgentServiceStatus,
  listAgentBrowserProfiles,
  listAgentRuns,
  quoteAgentRun,
  revokeAgentBrowserProfile,
  uploadAgentAssets,
  type AgentBrowserProfile,
  type AgentQuote,
  type AgentRun,
  type AgentServiceStatus,
  type AgentRunStatus
} from '../services/agentRuns';

const router = useRouter();
const route = useRoute();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const zh = computed(() => currentLang.value === 'zh');
const runs = ref<AgentRun[]>([]);
const serviceStatus = ref<AgentServiceStatus | null>(null);
const quote = ref<AgentQuote | null>(null);
const quotedRequestKey = ref('');
const loadingRuns = ref(false);
const quoting = ref(false);
const creating = ref(false);
const selectedFiles = ref<File[]>([]);
const objectiveComposer = ref<InstanceType<typeof ComposerBox> | null>(null);
const uploadingAssets = ref(false);
let uploadedReferences: { owner: string; files: File[]; assetIds: string[] } | null = null;
let pendingCreation: { owner: string; key: string; idempotencyKey: string } | null = null;
const fileInput = ref<HTMLInputElement | null>(null);
const browserProfiles = ref<AgentBrowserProfile[]>([]);
const submittedObjective = ref('');
const notice = ref('');
const noticeIsError = ref(false);
let statusTimer: ReturnType<typeof setInterval> | null = null;
let disposed = false;
let workspaceOwner = getCurrentUserId();
let workspaceRevision = 0;
const isCurrentWorkspace = (owner: string, revision: number) => (
  !disposed && owner === getCurrentUserId() && revision === workspaceRevision
);
const busy = computed(() => quoting.value || creating.value);
const hasConversation = computed(() => Boolean(
  submittedObjective.value || quoting.value || quote.value || notice.value
));
const form = reactive({
  objective: '',
  maxCredits: 50,
  capabilities: {
    research: false,
    browser: false,
    files: true,
    shell: true,
    generate_images: false,
    google_drive: false,
    github: false,
    upload: false,
    move_files: false,
    subagents: false
  } as Record<string, boolean>,
  browserOrigins: '',
  persistSession: false,
  profileId: '',
  deliverables: {
    report: false,
    spreadsheet: false,
    presentation: false,
    website: false,
    image: false
  } as Record<string, boolean>
});
const { restored: draftRestored, discardSaved } = useWorkspaceDraft({ owner: getCurrentUserId, task: () => 'agent:new', draft: toRef(form, 'objective') });

const composerAttachments = computed(() => selectedFiles.value.map((file) => ({
  clientId: referenceFileKey(file),
  name: file.name,
  mimeType: file.type || 'application/octet-stream',
  byteSize: file.size
})));

const capabilityOptions = computed(() => [
  { id: 'files', label: zh.value ? '文档与文件' : 'Documents & files', disabled: false },
  { id: 'shell', label: zh.value ? '离线处理' : 'Offline processing', disabled: false },
  {
    id: 'subagents',
    label: zh.value ? '并行处理' : 'Parallel work',
    disabled: !serviceStatus.value?.subagentsEnabled
  },
  {
    id: 'browser',
    label: zh.value ? '网页操作 Beta' : 'Web actions Beta',
    disabled: !serviceStatus.value?.browserPublicEnabled
  },
  {
    id: 'generate_images',
    label: zh.value ? '生成图片' : 'Generate images',
    disabled: !serviceStatus.value?.imageGenerationPublicEnabled
  }
]);

watch(() => form.deliverables.image, (selected) => {
  if (!selected) return;
  if (serviceStatus.value?.imageGenerationPublicEnabled !== true) {
    form.deliverables.image = false;
    return;
  }
  form.capabilities.generate_images = true;
});

watch(() => serviceStatus.value?.subagentsEnabled, (enabled) => {
  if (enabled === true) form.capabilities.subagents = true;
  else form.capabilities.subagents = false;
}, { immediate: true });

watch(() => form.capabilities.generate_images, (enabled) => {
  if (!enabled && form.deliverables.image) form.deliverables.image = false;
});

watch(() => serviceStatus.value?.imageGenerationPublicEnabled, (enabled) => {
  if (enabled === true) return;
  form.deliverables.image = false;
  form.capabilities.generate_images = false;
});

const allowedOrigins = () => [...new Set(form.browserOrigins
  .split(/[\n,]/)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    try {
      const url = new URL(entry);
      if (
        url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash
      ) return '';
      return url.origin;
    } catch {
      return '';
    }
  }))].filter(Boolean);

const browserConfig = () => ({
  allowedOrigins: form.capabilities.browser ? allowedOrigins() : [],
  persistSession: form.capabilities.browser && form.persistSession,
  profileId: form.capabilities.browser && form.profileId ? form.profileId : null
});

const validateBrowserForm = () => {
  if (!form.capabilities.browser) return;
  const rawEntries = form.browserOrigins.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
  if (!rawEntries.length || allowedOrigins().length !== rawEntries.length) {
    throw new Error('AGENT_BROWSER_ORIGIN_REQUIRED');
  }
  if (form.persistSession && allowedOrigins().length !== 1) {
    throw new Error('AGENT_BROWSER_SINGLE_ORIGIN_REQUIRED');
  }
};

const deliverableOptions = computed(() => [
  { id: 'report', code: 'PDF', label: zh.value ? '带引用的报告' : 'Cited report', disabled: false },
  { id: 'spreadsheet', code: 'XLSX', label: zh.value ? '数据与图表' : 'Data and charts', disabled: false },
  { id: 'presentation', code: 'PPTX', label: zh.value ? '可编辑演示' : 'Editable deck', disabled: false },
  { id: 'website', code: 'WEB', label: zh.value ? '静态网站' : 'Static website', disabled: false },
  {
    id: 'image',
    code: 'IMAGE',
    label: zh.value ? '图片设计稿' : 'Image design',
    disabled: !serviceStatus.value?.imageGenerationPublicEnabled
  }
]);
const selectedDeliverables = () => Object.entries(form.deliverables)
  .filter(([, selected]) => selected)
  .map(([id]) => id);
const quoteRequest = () => ({
  objective: form.objective,
  maxCredits: form.maxCredits,
  capabilities: { ...form.capabilities },
  deliverables: selectedDeliverables(),
  browserConfig: browserConfig()
});
const currentQuoteKey = computed(() => JSON.stringify({ request: quoteRequest(), references: selectedFiles.value.map(referenceFileKey) }));
const scopeReceipt = computed(() => [
  ...deliverableOptions.value.filter(item => form.deliverables[item.id]).map(item => item.code),
  ...capabilityOptions.value.filter(item => form.capabilities[item.id]).map(item => item.label)
].join(' · '));
const editQuotedRequest = () => {
  if (busy.value) return;
  quote.value = null;
  quotedRequestKey.value = '';
  noticeIsError.value = false;
  notice.value = zh.value ? '正在修改要求。修改后重新发送以核对范围和报价。' : 'Edit the request, then send again to review its scope and quote.';
  objectiveComposer.value?.focus();
};
const quoteIsCurrent = computed(() => (
  Boolean(quote.value) && quotedRequestKey.value === currentQuoteKey.value
));
const requiredQuoteRequirements = ['database', 'payloadEncryption', 'modelProvider', 'sandboxProvider'] as const;
const missingQuoteRequirements = computed(() => {
  const requirements = quote.value?.requirements || {};
  const knownMissing = requiredQuoteRequirements.filter((requirement) => requirements[requirement] !== true);
  const reportedMissing = Object.entries(requirements)
    .filter(([, ready]) => ready !== true)
    .map(([requirement]) => requirement);
  return Array.from(new Set([...knownMissing, ...reportedMissing]));
});
const quoteCanStart = computed(() => (
  quote.value?.canStart === true && missingQuoteRequirements.value.length === 0
));
const quoteBlockerText = computed(() => {
  if (quote.value?.canStart === false) {
    return zh.value ? '点数不足，请降低上限或充值后再试。' : 'Not enough credits. Lower the cap or top up first.';
  }
  const labels: Record<string, [string, string]> = {
    database: ['数据库尚未就绪，请稍后重试。', 'The database is not ready. Try again shortly.'],
    payloadEncryption: ['安全载荷服务尚未就绪，请稍后重试。', 'Secure payload storage is not ready. Try again shortly.'],
    modelProvider: ['模型服务尚未就绪，请稍后重试。', 'The model service is not ready. Try again shortly.'],
    sandboxProvider: ['运行环境尚未就绪，请稍后重试。', 'The execution environment is not ready. Try again shortly.']
  };
  const first = missingQuoteRequirements.value[0];
  return labels[first]?.[zh.value ? 0 : 1] || (zh.value ? '运行环境尚未就绪，请稍后重试。' : 'The runtime is not ready. Try again shortly.');
});
let quoteLocked = false;
let createLocked = false;
const workspaceStatus = computed<{ label: string; tone: 'ready' | 'busy' | 'warning' | 'offline' }>(() => {
  if (!workerReady.value) {
    if (serviceStatus.value?.workerOnline) {
      return { label: zh.value ? 'Worker 模型不匹配' : 'Worker model mismatch', tone: 'offline' };
    }
    return { label: zh.value ? 'Worker 离线' : 'Worker offline', tone: 'offline' };
  }
  if (creating.value || quoting.value) {
    return { label: creating.value ? (zh.value ? '正在启动' : 'Starting') : (zh.value ? '正在报价' : 'Quoting'), tone: 'busy' };
  }
  if (!serviceStatus.value?.subagentsEnabled) {
    return { label: zh.value ? '单 Agent 就绪' : 'Single Agent ready', tone: 'warning' };
  }
  return { label: zh.value ? 'Agent 就绪' : 'Agent ready', tone: 'ready' };
});
const workerReady = computed(() => Boolean(
  serviceStatus.value?.workerOnline && serviceStatus.value?.workerModelReady !== false
));
const activeTextModel = computed(() => (
  serviceStatus.value?.workerModel?.model ||
  serviceStatus.value?.runtimeProfile?.model ||
  serviceStatus.value?.modelFamily ||
  '—'
));
const workerStatusLabel = computed(() => {
  if (!serviceStatus.value?.workerOnline) return zh.value ? '等待 Worker' : 'Waiting for worker';
  if (!workerReady.value) return zh.value ? '模型配置不匹配' : 'Model configuration mismatch';
  return zh.value ? '已就绪' : 'Ready';
});
const filteredRuns = (search: string) => {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return runs.value;
  return runs.value.filter((run) => `${run.objectivePreview || ''} ${run.status}`.toLocaleLowerCase().includes(query));
};
const presets = computed(() => zh.value
  ? [
      '研究三个直接竞品。把品牌定位、视觉系统和产品体验分别委派给三个子 Agent，最后交付带来源的 Markdown 与 PDF 提案。',
      '整理我提供的资料，制定一套完整设计方案，并交付可编辑报告、数据表和演示文稿。',
      '根据目标受众与品牌气质生成一张可直接评审的主视觉图片设计稿，并说明设计决策。'
    ]
  : [
      'Research three direct competitors. Delegate brand positioning, visual system, and product experience to three subagents, then deliver a cited Markdown and PDF proposal.',
      'Synthesize my references into a complete design proposal with an editable report, workbook, and presentation.',
      'Create a review-ready hero visual for the target audience and brand character, then explain the design decisions.'
    ]);
const suggestionLabels = computed(() => zh.value
  ? ['研究竞品并交付提案', '整理资料并生成多格式文件', '生成可评审的图片设计稿']
  : ['Research competitors and deliver a proposal', 'Turn references into editable files', 'Create a review-ready image design']);
const applyPreset = async (index: number) => {
  form.objective = presets.value[index] || '';
  await nextTick();
  objectiveComposer.value?.focusAtEnd();
};
const resetRunDraft = () => {
  form.objective = '';
  submittedObjective.value = '';
  selectedFiles.value = [];
  quote.value = null;
  quotedRequestKey.value = '';
  notice.value = '';
  noticeIsError.value = false;
};
const errorText = (error: unknown) => {
  const code = String((error as any)?.code || (error as Error)?.message || 'AGENT_REQUEST_FAILED');
  const labels: Record<string, string> = {
    LOGIN_REQUIRED: zh.value ? '请先登录后启动 Agent。' : 'Sign in before starting an agent.',
    AGENT_FEATURE_DISABLED: zh.value ? 'Agent Beta 尚未在当前环境开放。' : 'Agent Beta is not enabled here.',
    AGENT_BETA_ACCESS_DENIED: zh.value ? 'Agent 目前仅对 Beta 所有者账号开放。' : 'Agent is currently limited to the Beta owner account.',
    AGENT_MODEL_NOT_CONFIGURED: zh.value ? '模型供应商尚未配置。' : 'The model provider is not configured.',
    AGENT_SANDBOX_NOT_CONFIGURED: zh.value ? '云电脑供应商尚未配置。' : 'The cloud sandbox is not configured.',
    AGENT_PAYLOAD_KEY_MISSING: zh.value ? '敏感载荷加密密钥尚未配置。' : 'The encrypted payload key is missing.',
    API_ERROR_500: zh.value ? 'Agent 服务暂时不可用，请稍后重试。' : 'The Agent service is temporarily unavailable.',
    INSUFFICIENT_CREDITS: zh.value ? '点数不足，请降低预算或充值。' : 'Not enough credits. Lower the budget or top up.',
    AGENT_CONCURRENT_RUN_LIMIT: zh.value ? '你已有一个运行中的任务。' : 'You already have an active run.',
    AGENT_QUEUE_FULL: zh.value ? '当前排队任务已满，请稍后再试。' : 'The Agent queue is full. Try again later.',
    AGENT_TEXT_ONLY_USE_DESIGN_CHAT: zh.value
      ? '纯文字咨询请在创作对话中完成，不会创建付费任务。需要文件时再启动 Agent。'
      : 'Text-only questions stay in Design Chat and do not create a paid run. Start Agent when you need files.',
    AGENT_BROWSER_ORIGIN_REQUIRED: zh.value ? '开启浏览器后，请填写完整的 HTTPS Origin，例如 https://example.com，不能带路径。' : 'Add a complete HTTPS origin such as https://example.com, without a path.',
    AGENT_BROWSER_SINGLE_ORIGIN_REQUIRED: zh.value ? '保存登录会话时只能填写一个 HTTPS Origin。' : 'A saved browser session can use exactly one HTTPS origin.',
    AGENT_BROWSER_NOT_PUBLIC: zh.value ? '当前环境尚未开放浏览器能力。' : 'Browser capability is not enabled in this environment.',
    AGENT_IMAGE_GENERATION_NOT_PUBLIC: zh.value ? '当前环境尚未开放 Agent 图片生成。' : 'Agent image generation is not enabled in this environment.'
  };
  return labels[code] || code;
};

const getQuote = async () => {
  if (quoteLocked) return null;
  const owner = getCurrentUserId();
  const revision = workspaceRevision;
  quoteLocked = true;
  quoting.value = true;
  notice.value = '';
  // A quote is a point-in-time authorization and price decision. Invalidate it
  // before any refresh so a failed request can never leave an older quote runnable.
  quote.value = null;
  quotedRequestKey.value = '';
  try {
    validateBrowserForm();
    const request = quoteRequest();
    const requestKey = currentQuoteKey.value;
    const result = await quoteAgentRun(request);
    if (!isCurrentWorkspace(owner, revision)) return null;
    quote.value = result;
    quotedRequestKey.value = requestKey;
    noticeIsError.value = false;
    return quote.value;
  } catch (error) {
    if (isCurrentWorkspace(owner, revision)) {
      notice.value = errorText(error);
      noticeIsError.value = true;
    }
    return null;
  } finally {
    if (isCurrentWorkspace(owner, revision)) {
      quoting.value = false;
      quoteLocked = false;
    }
  }
};

const sendObjective = async () => {
  const objective = form.objective.trim();
  if (objective.length < 3 || busy.value || quoteLocked || createLocked) return;
  form.objective = objective;
  submittedObjective.value = objective;
  await getQuote();
};

const startRun = async () => {
  if (createLocked || quoteLocked) return;
  const owner = getCurrentUserId();
  const revision = workspaceRevision;
  const submittedDraft = form.objective;
  createLocked = true;
  try {
    if (!quoteIsCurrent.value) {
      const latestQuote = await getQuote();
      if (latestQuote) {
        notice.value = zh.value
          ? '费用已更新。请确认交付物、预计点数和冻结金额后，再点击“确认并启动”。'
          : 'Cost updated. Review the deliverables, estimate, and hold, then choose “Confirm and start”.';
        noticeIsError.value = false;
      }
      return;
    }
    creating.value = true;
    notice.value = '';
    if (!quoteCanStart.value) {
      if (quote.value?.canStart === false) throw new Error('INSUFFICIENT_CREDITS');
      if (missingQuoteRequirements.value.includes('payloadEncryption')) throw new Error('AGENT_PAYLOAD_KEY_MISSING');
      if (missingQuoteRequirements.value.includes('modelProvider')) throw new Error('AGENT_MODEL_NOT_CONFIGURED');
      if (missingQuoteRequirements.value.includes('sandboxProvider')) throw new Error('AGENT_SANDBOX_NOT_CONFIGURED');
      throw new Error('API_ERROR_500');
    }
    const confirmed = quoteRequest();
    const references = [...selectedFiles.value];
    const cached = uploadedReferences?.owner === owner && uploadedReferences.files.length === references.length && uploadedReferences.files.every((file, index) => file === references[index]);
    uploadingAssets.value = !cached && references.length > 0;
    const assetIds = cached ? uploadedReferences!.assetIds : await uploadAgentAssets(references);
    if (!isCurrentWorkspace(owner, revision)) return;
    uploadedReferences = { owner, files: references, assetIds };
    uploadingAssets.value = false;
    const creationKey = JSON.stringify({ confirmed, assetIds });
    if (pendingCreation?.owner !== owner || pendingCreation.key !== creationKey) {
      pendingCreation = { owner, key: creationKey, idempotencyKey: crypto.randomUUID() };
    }
    const run = await createAgentRun({
      objective: confirmed.objective,
      projectId: String(route.query.projectId || '') || null,
      assetIds,
      maxCredits: confirmed.maxCredits,
      capabilities: confirmed.capabilities,
      deliverables: confirmed.deliverables,
      browserConfig: confirmed.browserConfig,
      idempotencyKey: pendingCreation.idempotencyKey
    });
    discardSaved(owner, 'agent:new', submittedDraft);
    if (!isCurrentWorkspace(owner, revision)) return;
    if (form.objective === submittedDraft) form.objective = '';
    await router.push(`/artigen/agent/runs/${run.runId}`);
  } catch (error) {
    if (isCurrentWorkspace(owner, revision)) {
      notice.value = uploadingAssets.value
        ? (zh.value ? '参考文件上传失败，已保留你的选择，任务尚未创建。请重试。' : 'Reference upload failed. Your selection is kept and no run was created. Try again.')
        : errorText(error);
      noticeIsError.value = true;
    }
  } finally {
    if (isCurrentWorkspace(owner, revision)) {
      creating.value = false;
      uploadingAssets.value = false;
      createLocked = false;
    }
  }
};

const selectFiles = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (busy.value) return;
  const selection = mergeReferenceFiles(selectedFiles.value, files, { maxFileBytes: 40 * 1024 * 1024 });
  if (selection.error) {
    notice.value = selection.error === 'too-large'
      ? (zh.value ? '单个文件不能超过 40 MiB。原有选择已保留。' : 'Each file must be 40 MiB or smaller. Your existing selection is kept.')
      : (zh.value ? '最多添加 10 个参考文件。请先移除部分文件再添加。' : 'Add up to 10 reference files. Remove a file before adding more.');
    noticeIsError.value = true;
    return;
  }
  selectedFiles.value = selection.files;
};
const openFilePicker = () => fileInput.value?.click();
const removeSelectedFile = (clientId: string) => {
  if (busy.value) return;
  selectedFiles.value = selectedFiles.value.filter((file) => referenceFileKey(file) !== clientId);
};

const loadRuns = async () => {
  const owner = getCurrentUserId();
  const revision = workspaceRevision;
  loadingRuns.value = true;
  try {
    const result = await listAgentRuns();
    if (isCurrentWorkspace(owner, revision)) runs.value = result;
  } catch (error) {
    if (isCurrentWorkspace(owner, revision)) {
      notice.value = errorText(error);
      noticeIsError.value = true;
    }
  } finally {
    if (isCurrentWorkspace(owner, revision)) loadingRuns.value = false;
  }
};

const loadServiceStatus = async () => {
  const owner = getCurrentUserId();
  const revision = workspaceRevision;
  try {
    const result = await getAgentServiceStatus();
    if (isCurrentWorkspace(owner, revision)) serviceStatus.value = result;
  } catch {
    if (isCurrentWorkspace(owner, revision)) serviceStatus.value = null;
  }
};

const loadBrowserProfiles = async () => {
  const owner = getCurrentUserId();
  const revision = workspaceRevision;
  try {
    const result = await listAgentBrowserProfiles();
    if (isCurrentWorkspace(owner, revision)) browserProfiles.value = result;
  } catch {
    if (isCurrentWorkspace(owner, revision)) browserProfiles.value = [];
  }
};

const selectBrowserProfile = () => {
  const profile = browserProfiles.value.find((item) => item.profileId === form.profileId);
  if (!profile) return;
  form.browserOrigins = profile.siteOrigin;
};

const revokeSelectedProfile = async () => {
  if (!form.profileId) return;
  const owner = getCurrentUserId();
  const revision = workspaceRevision;
  try {
    await revokeAgentBrowserProfile(form.profileId);
    if (!isCurrentWorkspace(owner, revision)) return;
    form.profileId = '';
    await loadBrowserProfiles();
  } catch (error) {
    if (isCurrentWorkspace(owner, revision)) {
      notice.value = errorText(error);
      noticeIsError.value = true;
    }
  }
};

const statusLabel = (status: AgentRunStatus) => {
  const labels: Record<AgentRunStatus, [string, string]> = {
    draft: ['草稿', 'Draft'],
    queued: ['排队中', 'Queued'],
    provisioning: ['创建云电脑', 'Provisioning'],
    running: ['执行中', 'Running'],
    waiting_user: ['等待确认', 'Needs input'],
    paused: ['已暂停', 'Paused'],
    verifying: ['验证中', 'Verifying'],
    succeeded: ['已完成', 'Completed'],
    failed: ['失败', 'Failed'],
    cancelled: ['已取消', 'Cancelled']
  };
  return labels[status]?.[zh.value ? 0 : 1] || status;
};
const formatDate = (value: string) => new Intl.DateTimeFormat(
  zh.value ? 'zh-CN' : 'en-US',
  { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
).format(new Date(value));

const handleAuthChanged = () => {
  const owner = getCurrentUserId();
  if (owner === workspaceOwner) return;
  workspaceOwner = owner;
  workspaceRevision += 1;
  runs.value = [];
  browserProfiles.value = [];
  selectedFiles.value = [];
  uploadingAssets.value = false;
  uploadedReferences = null;
  pendingCreation = null;
  submittedObjective.value = '';
  quote.value = null;
  quotedRequestKey.value = '';
  notice.value = '';
  noticeIsError.value = false;
  quoting.value = creating.value = quoteLocked = createLocked = false;
  form.profileId = '';
  form.browserOrigins = '';
  form.persistSession = false;
  void loadRuns();
  void loadBrowserProfiles();
  void loadServiceStatus();
};

onMounted(() => {
  window.addEventListener('app-auth-changed', handleAuthChanged);
  void loadRuns();
  void loadServiceStatus();
  void loadBrowserProfiles();
  statusTimer = setInterval(() => void loadServiceStatus(), 15_000);
});
onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener('app-auth-changed', handleAuthChanged);
  if (statusTimer) clearInterval(statusTimer);
});
</script>

<style scoped>
.agent-conversation { display: grid; grid-template-rows: minmax(0, 1fr) auto; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
.agent-conversation:not(.active) { grid-template-columns:minmax(0,1fr); grid-template-rows: auto auto; align-content: safe center; padding-block: 48px; overflow-y: auto; }
.agent-conversation:not(.active) .conversation-scroll { overflow: visible; }
.conversation-scroll { min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-color: var(--border) transparent; }
.conversation-empty { display: grid; width: min(var(--conversation-max), calc(100% - var(--conversation-gutter) - var(--conversation-gutter))); margin: 0 auto; padding: 0 0 10px; justify-items: start; }
.conversation-empty h1 { margin: 0; color: var(--text); font-size: clamp(28px, 3vw, 36px); font-weight: 680; line-height: 1.18; letter-spacing: -.035em; text-wrap: balance; }
.prompt-suggestions { display: grid; width: min(var(--conversation-max), 100%); gap: 4px; margin: 20px auto 0; }
.prompt-suggestions button { display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 12px; align-items: center; width: 100%; min-height: 42px; padding: 9px 10px; color: var(--muted); border: 0; border-radius: 8px; text-align: left; background: transparent; cursor: pointer; transition: background-color 160ms ease, color 160ms ease, transform 120ms cubic-bezier(.23,1,.32,1); }
.prompt-suggestions button:hover { color: var(--text); background: var(--surface-hover); }
.prompt-suggestions button:active { transform: scale(.995); }
.prompt-suggestions button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.prompt-suggestions span { font-size: 14px; }
.prompt-suggestion-arrow { justify-self: end; color: var(--acid-text); opacity: 0; transform: translateX(-3px); transition: opacity 140ms ease, transform 180ms cubic-bezier(.23,1,.32,1); }
.prompt-suggestions button:hover .prompt-suggestion-arrow, .prompt-suggestions button:focus .prompt-suggestion-arrow { opacity: 1; transform: translateX(0); }
.conversation-thread { display: grid; width: min(var(--conversation-max), calc(100% - var(--conversation-gutter) - var(--conversation-gutter))); margin: 0 auto; padding: 36px 0 64px; gap: 28px; }
.conversation-message { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 12px; align-items: start; }
.message-avatar { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 8px; color: var(--muted); font-size: 12px; font-weight: 700; background: var(--surface); }
.agent-avatar { color: var(--acid-ink); background: var(--acid); }
.conversation-message p { margin: 0; color: var(--text); font-size: 15px; line-height: 1.72; overflow-wrap: anywhere; }
.user-message > div:last-child { padding-top: 3px; }
.user-message span { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; }
.assistant-content { display: grid; justify-items: start; gap: 10px; padding-top: 3px; }
.assistant-content > strong { color: var(--text); font-size: 15px; font-weight: 680; }
.assistant-content > p { color: var(--muted); }
.quote-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); width: 100%; margin: 2px 0 0; overflow: hidden; border: 0; border-radius: 10px; background: var(--surface); }
.quote-summary div { display: grid; gap: 4px; padding: 10px 11px; background: transparent; }
.quote-summary dt { color: var(--muted); font-size: 12px; }
.quote-summary dd { margin: 0; color: var(--text); font: 680 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.conversation-dock { position: relative; z-index: 2; width: 100%; padding: 16px var(--conversation-gutter) max(16px, env(safe-area-inset-bottom)); background: var(--bg); }
.objective-composer { min-width:0; width: min(var(--conversation-max), 100%); margin: 0 auto; }
.draft-restored { width: min(var(--conversation-max),100%); margin: 8px auto 0; color: var(--muted); font-size: var(--font-meta); line-height: 1.5; }
.objective-composer :deep(.composer-box) { color: var(--text); background: var(--surface); }
.run-action { min-height: 38px; padding: 0 13px; border-radius: 8px; font-size: 12px; font-weight: 700; }
.run-action { display: inline-flex; align-items: center; gap: 7px; color: #0e100f; border: 0; background: var(--acid); }
.run-action:disabled { opacity: .45; cursor: not-allowed; }
.run-action:active { transform: scale(.98); }
.run-action:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.workspace-notice { width: 100%; margin: 2px 0 0; padding: 9px 10px; color: var(--acid-text); border: 0; border-radius: 8px; background: color-mix(in srgb, var(--acid) 7%, transparent); font-size: 12px; }
.workspace-notice.error { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.sr-only { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.history-group { padding: 4px 8px 16px; }
.history-label { display: flex; align-items: center; justify-content: space-between; padding: 6px 9px 9px; color: var(--muted); font-size: 12px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.history-label button { display: grid; width: 28px; height: 28px; place-items: center; color: var(--muted); border: 0; border-radius: 7px; background: transparent; cursor: pointer; }
.history-label button:hover { color: var(--text); background: var(--surface-raised); }
.history-label button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.history-run { display: grid; grid-template-columns: 8px 1fr; gap: 8px; align-items: start; padding: 9px 8px; color: inherit; border-radius: 8px; text-decoration: none; }
.history-run:hover, .history-run.router-link-active { background: var(--surface-raised); }
.history-run i { width: 6px; height: 6px; margin-top: 5px; border-radius: 999px; background: var(--muted); }
.history-run i.running, .history-run i.provisioning, .history-run i.verifying { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acid) 14%, transparent); }
.history-run i.succeeded { background: var(--success); }
.history-run i.failed, .history-run i.cancelled { background: var(--danger); }
.history-run span { display: grid; min-width: 0; gap: 3px; }
.history-run b { overflow: hidden; color: var(--text); font-size: 13px; font-weight: 560; text-overflow: ellipsis; white-space: nowrap; }
.history-run small, .history-empty { color: var(--muted); font-size: 12px; }
.history-empty { padding: 16px 8px; text-align: center; }
.inspector-stack { display: grid; gap: 10px; }
.inspector-card { padding: 9px 4px; border: 0; border-radius: 10px; background: transparent; }
.inspector-card header { display: flex; min-height: 22px; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.inspector-card header > span { color: var(--text); font-size: 13px; font-weight: 680; }
.inspector-card header > b { color: var(--text); font: 680 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.inspector-card header > i { width: 7px; height: 7px; border-radius: 999px; background: var(--muted); }
.inspector-card header > i.healthy, .inspector-card header > i[class*="healthy"] { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acid) 12%, transparent); }
.inspector-card dl { display: grid; gap: 7px; margin: 0; }
.inspector-card dl div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.inspector-card dt, .inspector-card p, .inspector-card small { color: var(--muted); font-size: 12px; line-height: 1.55; }
.inspector-card dd { min-width: 0; max-width: 66%; margin: 0; overflow-wrap: anywhere; color: var(--text); font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.inspector-card > strong { color: var(--text); font-size: 13px; }
.option-grid { display: grid; gap: 2px; }
.option-grid label { display: grid; grid-template-columns: 48px minmax(0, 1fr) 18px; gap: 10px; align-items: center; min-height: 44px; padding: 8px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
.option-grid label.selected { background: var(--surface-raised); }
.option-grid label:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
.option-grid label.disabled { cursor: not-allowed; }
.deliverable-format { display: grid; place-items: center; height: 28px; border-radius: 5px; background: var(--surface-raised); color: var(--muted); font: 500 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.deliverable-label { min-width: 0; color: var(--text); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.deliverable-label small { display: block; }
.option-grid input { width: 16px; height: 16px; margin: 0; accent-color: var(--text); cursor: inherit; }
.option-grid input:focus-visible { outline: none; }
@media (hover: hover) { .option-grid label:not(.disabled):hover { background: var(--surface-hover); } }
.capability-list label { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 0; border-radius: 8px; background: var(--surface-raised); }
.capability-list label.disabled { opacity: .45; }
.capability-list input, .browser-scope input, .budget-range { accent-color: var(--acid); }
.capability-list span { display: grid; gap: 2px; }
.capability-list b { color: var(--text); font-size: 12px; }
.capability-list small { font-size: 12px; }
.capability-list { display: grid; gap: 6px; }
.runtime-settings { padding-inline: 0; }
.browser-scope { display: grid; gap: 8px; }
.browser-scope header { margin-bottom: 2px; }
.browser-scope > input, .browser-scope select { min-height: 38px; padding: 0 9px; color: var(--text); border: 1px solid var(--border); border-radius: 7px; background: var(--surface-raised); font-size: 12px; }
.browser-scope > input:focus-visible, .browser-scope select:focus-visible, .budget-range:focus-visible, .capability-list input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.browser-scope > label { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 12px; }
.text-danger { justify-self: start; min-height: 36px; color: var(--danger); border: 0; background: transparent; font-size: 12px; }
.budget-range { width: 100%; }
.execution-spine { position: relative; display: grid; gap: 0; }
.execution-spine::before { position: absolute; top: 16px; bottom: 16px; left: 8px; width: 1px; content: ''; background: var(--border); }
.execution-spine article { position: relative; display: grid; grid-template-columns: 17px 1fr; gap: 10px; min-height: 62px; }
.execution-spine i { z-index: 1; width: 9px; height: 9px; margin: 5px 0 0 4px; border: 2px solid var(--border); border-radius: 999px; background: var(--sidebar); }
.execution-spine article.complete i { border-color: var(--acid); background: var(--acid); box-shadow: 0 0 0 4px color-mix(in srgb, var(--acid) 10%, transparent); }
.execution-spine div { display: grid; align-content: start; gap: 4px; }
.execution-spine b { color: var(--text); font-size: 12px; }
.execution-spine span { color: var(--muted); font-size: 12px; line-height: 1.5; }
.subagent-overview p { margin-bottom: 0; }
.boundary-list { display: grid; gap: 4px; padding: 4px; }
.boundary-list b { margin-top: 6px; color: var(--text); font-size: 12px; }
.boundary-list span { color: var(--muted); font-size: 12px; line-height: 1.5; }
.technical-list { display: grid; gap: 7px; margin: 0; }
.technical-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.technical-list dt { color: var(--muted); font-size: 12px; }
.technical-list dd { min-width: 0; max-width: 66%; margin: 0; overflow-wrap: anywhere; color: var(--text); font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.file-list { display: grid; gap: 6px; }
.file-list span { display: grid; gap: 2px; padding: 8px; border-radius: 7px; background: var(--surface-raised); }
.file-list b { overflow: hidden; color: var(--text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.visually-hidden { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

.browser-scope > label { color: var(--text); font-size: 13px; line-height: 1.5; }
.capability-list label { align-items: center; min-height: 44px; }
.budget-range { height: 44px; margin: 0; }
@media (max-width: 800px) {
  .agent-conversation:not(.active) { align-content: start; padding-block: 32px 24px; }
  .browser-scope > input,.browser-scope select { min-height: 44px; font-size: 16px; }
  .conversation-empty { padding-bottom: 8px; }
  .conversation-empty h1 { font-size: 26px; }
  .conversation-empty > p, .conversation-message p { font-size: 14px; }
  .prompt-suggestions button { min-height: 44px; }
  .conversation-thread { padding: 24px 0 40px; gap: 24px; }
  .conversation-message { grid-template-columns: 28px minmax(0, 1fr); gap: 10px; }
  .quote-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .conversation-dock { padding-block: 8px max(12px, env(safe-area-inset-bottom)); }
  .run-action { min-height: 44px; }
  .history-label button { width: 44px; height: 44px; }
}
@media (pointer: coarse) {
  .prompt-suggestions button { min-height: 44px; }
  .prompt-suggestion-arrow { opacity: 1; transform: none; }
}
@media (max-height: 620px) {
  .conversation-empty { align-content: start; padding-block: 24px; }
  .prompt-suggestions { gap: 5px; }
  .prompt-suggestions button { min-height: 44px; }
  .conversation-dock { padding-block: 4px max(8px, env(safe-area-inset-bottom)); }
  .objective-composer :deep(textarea) { min-height: 54px; max-height: 92px; }
}
@media (max-width: 900px) and (max-height: 620px) {
  .conversation-empty { padding-block: 12px 20px; }
  .prompt-suggestions { margin-top: 10px; }
  .prompt-suggestions button:nth-child(n + 3) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .prompt-suggestions button, .objective-composer { transition: none; }
  .prompt-suggestion-arrow { transition: none; transform: none; }
}

.quote-scope { display: grid; gap: 7px; margin: 3px 0 9px; }
.quote-scope > b { color: var(--text); font-size: 13px; font-weight: 600; }
.quote-scope p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.quote-scope button { justify-self: start; min-height: 36px; padding: 7px 10px; color: var(--text); border: 0; border-radius: 8px; background: var(--surface-raised); font-size: 13px; cursor: pointer; }
.quote-scope button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
@media (max-width: 799px) { .quote-scope button { min-height: 44px; } }
</style>
