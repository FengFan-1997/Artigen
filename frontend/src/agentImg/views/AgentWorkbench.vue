<template>
  <AgentWorkspaceShell
    :zh="zh"
    :title="zh ? '电脑 Agent' : 'Computer Agent'"
    :subtitle="zh ? '目标优先 · 高级执行模式' : 'Outcome first · advanced execution'"
    :status-label="workspaceStatus.label"
    :status-tone="workspaceStatus.tone"
    :credit-label="quoteIsCurrent && quote ? `${quote.freeCreditsRemaining} ${zh ? '点可用' : 'available'}` : '—'"
    :account-label="serviceStatus?.accessMode || ''"
    :inspector-subtitle="`${serviceStatus?.modelFamily || 'Qwen/Qwen3-8B'} · Kolors`"
    default-inspector-tab="environment"
    :badges="{ subagents: serviceStatus?.subagentsEnabled ? 1 : 0 }"
    :live-announcement="notice"
    @new-task="resetRunDraft"
  >
    <template #history="{ search }">
      <div class="history-group">
        <div class="history-label">
          <span>{{ zh ? '最近运行' : 'Recent runs' }}</span>
          <button type="button" :aria-label="zh ? '刷新任务' : 'Refresh runs'" :disabled="loadingRuns" @click="loadRuns">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.2 12A6.5 6.5 0 0 0 7 7.5L4 12M5.8 12A6.5 6.5 0 0 0 17 16.5l3-4.5"/></svg>
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

    <section class="agent-compose">
      <header class="compose-intro">
        <span class="compose-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="7"/></svg>
        </span>
        <div>
          <p>{{ zh ? 'COMPUTER AGENT' : 'COMPUTER AGENT' }}</p>
          <h1>{{ zh ? '告诉我最终要交付什么。' : 'Tell me what must be delivered.' }}</h1>
          <span>{{ zh ? 'Qwen3 会拆解任务，必要时委派最多 3 个独立子 Agent；浏览器、电脑、Kolors 与最终交付始终由父 Agent 掌控。' : 'Qwen3 plans the work and may delegate up to three isolated subagents. Browser, computer, Kolors, and final delivery stay with the parent Agent.' }}</span>
        </div>
      </header>

      <div class="objective-composer">
        <label>
          <span class="sr-only">{{ zh ? '任务目标' : 'Task objective' }}</span>
          <textarea
            v-model.trim="form.objective"
            rows="5"
            maxlength="20000"
            :placeholder="zh ? '例如：研究三个竞品，委派子 Agent 分析定位、视觉与信息架构，最后交付带引用的 Markdown 和 PDF。' : 'Example: Research three competitors, delegate positioning, visual, and IA analysis, then deliver a cited Markdown and PDF.'"
          />
        </label>
        <div v-if="selectedFiles.length" class="input-files">
          <span v-for="file in selectedFiles" :key="`${file.name}:${file.size}`">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5"/></svg>
            {{ file.name }}
          </span>
          <button type="button" @click="selectedFiles = []">{{ zh ? '清空' : 'Clear' }}</button>
        </div>
        <footer>
          <label class="attach-control">
            <input type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,.zip,.txt,.md,.csv,image/png,image/jpeg,image/webp" @change="selectFiles" />
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 12 5.5-5.5a3 3 0 0 1 4.2 4.2l-7.5 7.5a5 5 0 0 1-7.1-7.1l7-7"/></svg>
            <span>{{ zh ? '添加参考' : 'Add reference' }}</span>
          </label>
          <span class="objective-count">{{ form.objective.length.toLocaleString() }} / 20,000</span>
          <button class="estimate-action" type="button" :disabled="busy || form.objective.length < 3" @click="getQuote">
            {{ quoting ? (zh ? '估算中…' : 'Estimating…') : (zh ? '获取报价' : 'Get quote') }}
          </button>
          <button class="run-action" type="button" :disabled="busy || form.objective.length < 3 || (quoteIsCurrent && quote?.canStart === false)" @click="startRun">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>
            {{ creating ? (zh ? '正在启动…' : 'Starting…') : quoteIsCurrent ? (zh ? '确认并运行' : 'Confirm & run') : (zh ? '检查费用' : 'Review cost') }}
          </button>
        </footer>
      </div>

      <div v-if="quoteIsCurrent && quote" class="quote-bar">
        <div><span>{{ zh ? '预计' : 'Estimate' }}</span><b>{{ quote.estimatedCredits.minimum }}–{{ quote.estimatedCredits.maximum }} {{ zh ? '点' : 'cr' }}</b></div>
        <div><span>{{ zh ? '冻结' : 'Hold' }}</span><b>{{ quote.requiredPaidHold }} {{ zh ? '点' : 'cr' }}</b></div>
        <div><span>{{ zh ? '上限' : 'Limit' }}</span><b>{{ form.maxCredits }} {{ zh ? '点' : 'cr' }}</b></div>
        <div><span>{{ zh ? '结算' : 'Billing' }}</span><b>{{ zh ? '仅一次' : 'Once per run' }}</b></div>
      </div>
      <p v-if="notice" class="workspace-notice" :class="{ error: noticeIsError }">{{ notice }}</p>
      <p class="safety-note">
        {{ zh ? '密码、OTP、验证码与安全警告只由你在接管桌面时处理。购买、绕过安全限制和未授权外部写操作始终禁止。' : 'Passwords, OTPs, CAPTCHAs, and security warnings stay in user takeover. Purchases, security bypasses, and unauthorized external writes remain prohibited.' }}
      </p>

      <div class="task-presets">
        <button type="button" @click="applyPreset(0)"><b>{{ zh ? '研究与提案' : 'Research & proposal' }}</b><span>{{ zh ? '三路分析后合并为报告' : 'Three analyses merged into a report' }}</span></button>
        <button type="button" @click="applyPreset(1)"><b>{{ zh ? '多格式交付' : 'Multi-format delivery' }}</b><span>{{ zh ? '报告、表格、演示或网站' : 'Report, sheet, deck, or site' }}</span></button>
        <button type="button" @click="applyPreset(2)"><b>{{ zh ? '图片设计稿' : 'Image design' }}</b><span>{{ zh ? '由父 Agent 使用 Kolors 生成' : 'Generated by the parent with Kolors' }}</span></button>
      </div>
    </section>

    <template #environment>
      <div class="inspector-stack">
        <section class="inspector-card">
          <header><span>{{ zh ? '模型锁定' : 'Model lock' }}</span><i class="healthy"></i></header>
          <dl>
            <div><dt>{{ zh ? '文本与规划' : 'Text & planning' }}</dt><dd>Qwen/Qwen3-8B</dd></div>
            <div><dt>{{ zh ? '全部图片' : 'All images' }}</dt><dd>Kwai-Kolors/Kolors</dd></div>
            <div><dt>{{ zh ? '子 Agent' : 'Subagents' }}</dt><dd>{{ serviceStatus?.subagentsEnabled ? (zh ? '最多 3 个' : 'Up to 3') : (zh ? '已关闭' : 'Off') }}</dd></div>
          </dl>
        </section>
        <section class="inspector-card">
          <header><span>{{ zh ? '交付物' : 'Deliverables' }}</span></header>
          <div class="option-grid">
            <label v-for="item in deliverableOptions" :key="item.id" :class="{ disabled: item.disabled }">
              <input v-model="form.deliverables[item.id]" type="checkbox" :disabled="item.disabled" />
              <span><b>{{ item.code }}</b><small>{{ item.label }}</small></span>
            </label>
          </div>
        </section>
        <section class="inspector-card">
          <header><span>{{ zh ? '能力' : 'Capabilities' }}</span></header>
          <div class="capability-list">
            <label v-for="capability in capabilityOptions" :key="capability.id" :class="{ disabled: capability.disabled }">
              <input v-model="form.capabilities[capability.id]" type="checkbox" :disabled="capability.disabled" />
              <span><b>{{ capability.label }}</b><small>{{ capability.description }}</small></span>
            </label>
          </div>
        </section>
        <section v-if="form.capabilities.browser" class="inspector-card browser-scope">
          <header><span>{{ zh ? '浏览器范围' : 'Browser scope' }}</span></header>
          <input v-model.trim="form.browserOrigins" type="text" :placeholder="zh ? 'https://example.com' : 'https://example.com'" />
          <label><input v-model="form.persistSession" type="checkbox" />{{ zh ? '加密保存会话 30 天' : 'Encrypt session for 30 days' }}</label>
          <select v-if="browserProfiles.length" v-model="form.profileId" @change="selectBrowserProfile">
            <option value="">{{ zh ? '不恢复已保存会话' : 'No saved session' }}</option>
            <option v-for="profile in browserProfiles" :key="profile.profileId" :value="profile.profileId">{{ profile.label }} · {{ profile.siteOrigin }}</option>
          </select>
          <button v-if="form.profileId" type="button" class="text-danger" @click="revokeSelectedProfile">{{ zh ? '撤销会话' : 'Revoke session' }}</button>
        </section>
        <section class="inspector-card">
          <header><span>{{ zh ? '最高预算' : 'Maximum budget' }}</span><b>{{ form.maxCredits }} {{ zh ? '点' : 'cr' }}</b></header>
          <input v-model.number="form.maxCredits" class="budget-range" type="range" min="10" max="500" step="10" />
          <small>{{ zh ? '按实际使用结算，未使用部分自动释放。' : 'Actual usage only; unused hold is released.' }}</small>
        </section>
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
          <p>{{ zh ? '每个子 Agent 最多 20 步、10 分钟，共享同一隔离环境但目录互不可写。' : 'Each child gets 20 steps and 10 minutes in a shared isolated environment with write-isolated directories.' }}</p>
        </section>
        <section class="boundary-list">
          <b>{{ zh ? '子 Agent 可以' : 'Children can' }}</b>
          <span>{{ zh ? '读取授权输入、维护计划、运行离线 Shell' : 'Read granted inputs, update plans, run offline shell' }}</span>
          <b>{{ zh ? '子 Agent 不可以' : 'Children cannot' }}</b>
          <span>{{ zh ? '浏览器、电脑、连接器、Kolors、审批、最终交付' : 'Browser, computer, connectors, Kolors, approvals, final delivery' }}</span>
        </section>
      </div>
    </template>

    <template #computer>
      <div class="inspector-stack">
        <section class="inspector-card">
          <header><span>{{ zh ? '安全桌面' : 'Secure desktop' }}</span><i :class="{ healthy: serviceStatus?.desktopRelayReady }"></i></header>
          <strong>{{ serviceStatus?.desktopRelayReady ? (zh ? '接管中继已就绪' : 'Takeover relay ready') : (zh ? '等待 Worker' : 'Waiting for worker') }}</strong>
          <dl>
            <div><dt>Worker</dt><dd>{{ serviceStatus?.workerOnline ? (zh ? '在线' : 'Online') : (zh ? '离线' : 'Offline') }}</dd></div>
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import AgentWorkspaceShell from '../components/workspace/AgentWorkspaceShell.vue';
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
const browserProfiles = ref<AgentBrowserProfile[]>([]);
const notice = ref('');
const noticeIsError = ref(false);
let statusTimer: ReturnType<typeof setInterval> | null = null;
const busy = computed(() => quoting.value || creating.value);
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

const capabilityOptions = computed(() => [
  { id: 'files', label: zh.value ? '文件处理' : 'File work', description: zh.value ? '报告、表格、PPT、网站' : 'Reports, sheets, slides, sites', disabled: false },
  { id: 'shell', label: zh.value ? '隔离沙箱命令' : 'Isolated sandbox shell', description: zh.value ? '仅在隔离 Linux 工作区执行' : 'Runs only in the isolated Linux workspace', disabled: false },
  {
    id: 'subagents',
    label: zh.value ? '真实子 Agent' : 'Real subagents',
    description: serviceStatus.value?.subagentsEnabled
      ? (zh.value ? '父 Agent 可委派最多 3 个独立 Qwen3 上下文' : 'The parent may delegate up to three isolated Qwen3 contexts')
      : (zh.value ? '当前环境尚未开放' : 'Not enabled in this environment'),
    disabled: !serviceStatus.value?.subagentsEnabled
  },
  {
    id: 'browser',
    label: zh.value ? '安全浏览器 Beta' : 'Secure browser Beta',
    description: serviceStatus.value?.browserPublicEnabled
      ? (zh.value ? '浏览、点击、表单审批和登录接管' : 'Browse, click, approve forms, and take over sign-in')
      : (zh.value ? '当前环境尚未开放' : 'Not enabled in this environment'),
    disabled: !serviceStatus.value?.browserPublicEnabled
  },
  {
    id: 'generate_images',
    label: zh.value ? 'AI 图片生成' : 'AI image generation',
    description: serviceStatus.value?.imageGenerationPublicEnabled
      ? (zh.value ? '生成 PNG、JPEG 或 WebP；可使用 1 张任务参考图' : 'Create PNG, JPEG, or WebP with one run reference')
      : (zh.value ? '当前环境尚未开放' : 'Not enabled in this environment'),
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
  { id: 'report', code: 'PDF', label: zh.value ? '带引用的报告' : 'Cited report', description: zh.value ? '可编辑源文件 + PDF' : 'Editable source + PDF', disabled: false },
  { id: 'spreadsheet', code: 'XLSX', label: zh.value ? '数据与图表' : 'Data and charts', description: zh.value ? '公式、数据和可编辑图表' : 'Formulas, data and editable charts', disabled: false },
  { id: 'presentation', code: 'PPTX', label: zh.value ? '可编辑演示' : 'Editable deck', description: zh.value ? 'PPTX + 渲染预览' : 'PPTX + rendered preview', disabled: false },
  { id: 'website', code: 'WEB', label: zh.value ? '静态网站' : 'Static website', description: zh.value ? '在线预览 + 源码 ZIP' : 'Preview + source ZIP', disabled: false },
  {
    id: 'image',
    code: 'IMAGE',
    label: zh.value ? '图片设计稿' : 'Image design',
    description: serviceStatus.value?.imageGenerationPublicEnabled
      ? (zh.value ? '选择后自动启用 AI 图片生成' : 'Automatically grants AI image generation')
      : (zh.value ? '生产生图尚未开放' : 'Production image generation is unavailable'),
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
const currentQuoteKey = computed(() => JSON.stringify(quoteRequest()));
const quoteIsCurrent = computed(() => (
  Boolean(quote.value) && quotedRequestKey.value === currentQuoteKey.value
));
const workspaceStatus = computed<{ label: string; tone: 'ready' | 'busy' | 'warning' | 'offline' }>(() => {
  if (!serviceStatus.value?.workerOnline) {
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
const applyPreset = (index: number) => {
  form.objective = presets.value[index] || '';
};
const resetRunDraft = () => {
  form.objective = '';
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
    AGENT_BROWSER_ORIGIN_REQUIRED: zh.value ? '开启浏览器后，请填写完整的 HTTPS Origin，例如 https://example.com，不能带路径。' : 'Add a complete HTTPS origin such as https://example.com, without a path.',
    AGENT_BROWSER_SINGLE_ORIGIN_REQUIRED: zh.value ? '保存登录会话时只能填写一个 HTTPS Origin。' : 'A saved browser session can use exactly one HTTPS origin.',
    AGENT_BROWSER_NOT_PUBLIC: zh.value ? '当前环境尚未开放浏览器能力。' : 'Browser capability is not enabled in this environment.',
    AGENT_IMAGE_GENERATION_NOT_PUBLIC: zh.value ? '当前环境尚未开放 Agent 图片生成。' : 'Agent image generation is not enabled in this environment.'
  };
  return labels[code] || code;
};

const getQuote = async () => {
  quoting.value = true;
  notice.value = '';
  try {
    validateBrowserForm();
    const request = quoteRequest();
    const requestKey = JSON.stringify(request);
    quote.value = await quoteAgentRun(request);
    quotedRequestKey.value = requestKey;
    noticeIsError.value = false;
    return quote.value;
  } catch (error) {
    notice.value = errorText(error);
    noticeIsError.value = true;
    return null;
  } finally {
    quoting.value = false;
  }
};

const startRun = async () => {
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
  try {
    if (quote.value?.canStart === false) throw new Error('INSUFFICIENT_CREDITS');
    const confirmed = quoteRequest();
    const assetIds = await uploadAgentAssets(selectedFiles.value);
    const run = await createAgentRun({
      objective: confirmed.objective,
      assetIds,
      maxCredits: confirmed.maxCredits,
      capabilities: confirmed.capabilities,
      deliverables: confirmed.deliverables,
      browserConfig: confirmed.browserConfig
    });
    await router.push(`/artigen/agent/runs/${run.runId}`);
  } catch (error) {
    notice.value = errorText(error);
    noticeIsError.value = true;
  } finally {
    creating.value = false;
  }
};

const selectFiles = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []).slice(0, 10);
  if (files.some((file) => file.size > 40 * 1024 * 1024)) {
    notice.value = zh.value ? '单个文件不能超过 40 MiB。' : 'Each file must be 40 MiB or smaller.';
    noticeIsError.value = true;
    input.value = '';
    return;
  }
  selectedFiles.value = files;
  input.value = '';
};

const loadRuns = async () => {
  loadingRuns.value = true;
  try {
    runs.value = await listAgentRuns();
  } catch (error) {
    notice.value = errorText(error);
    noticeIsError.value = true;
  } finally {
    loadingRuns.value = false;
  }
};

const loadServiceStatus = async () => {
  try {
    serviceStatus.value = await getAgentServiceStatus();
  } catch {
    serviceStatus.value = null;
  }
};

const loadBrowserProfiles = async () => {
  try {
    browserProfiles.value = await listAgentBrowserProfiles();
  } catch {
    browserProfiles.value = [];
  }
};

const selectBrowserProfile = () => {
  const profile = browserProfiles.value.find((item) => item.profileId === form.profileId);
  if (!profile) return;
  form.browserOrigins = profile.siteOrigin;
};

const revokeSelectedProfile = async () => {
  if (!form.profileId) return;
  try {
    await revokeAgentBrowserProfile(form.profileId);
    form.profileId = '';
    await loadBrowserProfiles();
  } catch (error) {
    notice.value = errorText(error);
    noticeIsError.value = true;
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

onMounted(() => {
  void loadRuns();
  void loadServiceStatus();
  void loadBrowserProfiles();
  statusTimer = setInterval(() => void loadServiceStatus(), 15_000);
});
onBeforeUnmount(() => {
  if (statusTimer) clearInterval(statusTimer);
});
</script>

<style scoped>
.agent-compose {
  width: min(840px, calc(100% - 48px));
  margin: 0 auto;
  padding: clamp(48px, 9vh, 112px) 0 80px;
}
.compose-intro { display: flex; gap: 16px; align-items: flex-start; max-width: 720px; margin-bottom: 24px; }
.compose-mark { display: grid; flex: 0 0 40px; width: 40px; height: 40px; place-items: center; color: var(--acid-text); border: 1px solid color-mix(in srgb, var(--acid) 36%, var(--border)); border-radius: 10px; background: color-mix(in srgb, var(--acid) 8%, transparent); }
.compose-mark svg { width: 21px; fill: none; stroke: currentColor; stroke-width: 1.7; }
.compose-intro p { margin: 2px 0 8px; color: var(--acid-text); font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; }
.compose-intro h1 { margin: 0; color: var(--text); font-size: clamp(22px, 3vw, 30px); line-height: 1.18; letter-spacing: -.025em; }
.compose-intro div > span { display: block; max-width: 680px; margin-top: 10px; color: var(--muted); font-size: 13px; line-height: 1.65; }
.objective-composer { overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: 0 18px 50px color-mix(in srgb, var(--bg) 42%, transparent); transition: border-color 180ms ease, box-shadow 180ms ease; }
.objective-composer:focus-within { border-color: var(--acid); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acid) 18%, transparent), 0 18px 50px color-mix(in srgb, var(--bg) 42%, transparent); }
.objective-composer textarea { display: block; width: 100%; min-height: 142px; resize: vertical; box-sizing: border-box; padding: 18px 18px 8px; color: var(--text); border: 0; outline: 0; background: transparent; font: 400 15px/1.65 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif; }
.objective-composer textarea::placeholder { color: var(--muted); }
.objective-composer footer { display: flex; align-items: center; gap: 9px; padding: 10px; border-top: 1px solid var(--border); }
.attach-control { position: relative; display: inline-flex; min-height: 36px; align-items: center; gap: 7px; padding: 0 10px; color: var(--text); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 12px; }
.attach-control input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.attach-control svg, .run-action svg, .input-files svg, .history-label svg { width: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; }
.objective-count { margin-left: auto; color: var(--muted); font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.estimate-action, .run-action { min-height: 36px; padding: 0 12px; border-radius: 8px; font-size: 12px; font-weight: 700; }
.estimate-action { color: var(--text); border: 1px solid var(--border); background: transparent; }
.run-action { display: inline-flex; align-items: center; gap: 7px; color: #0e100f; border: 1px solid var(--acid); background: var(--acid); }
.estimate-action:disabled, .run-action:disabled { opacity: .45; cursor: not-allowed; }
.input-files { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 10px; }
.input-files span { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; padding: 6px 8px; overflow: hidden; color: var(--text); border-radius: 7px; background: var(--surface-raised); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.input-files button { color: var(--danger); border: 0; background: transparent; font-size: 11px; }
.quote-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin-top: 12px; overflow: hidden; border: 1px solid var(--border); border-radius: 10px; background: var(--border); }
.quote-bar div { display: grid; gap: 4px; padding: 10px 12px; background: var(--surface); }
.quote-bar span { color: var(--muted); font-size: 10px; }
.quote-bar b { color: var(--text); font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.workspace-notice { margin: 12px 0 0; padding: 10px 12px; color: var(--acid-text); border: 1px solid color-mix(in srgb, var(--acid) 34%, var(--border)); border-radius: 8px; background: color-mix(in srgb, var(--acid) 7%, transparent); font-size: 12px; }
.workspace-notice.error { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.safety-note { margin: 12px 2px 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
.task-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 24px; }
.task-presets button { display: grid; min-height: 82px; gap: 5px; padding: 13px; text-align: left; color: var(--text); border: 1px solid var(--border); border-radius: 10px; background: var(--surface); transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease; }
.task-presets button:hover { transform: translateY(-2px); border-color: var(--border); background: var(--surface-raised); }
.task-presets b { align-self: end; font-size: 12px; }
.task-presets span { color: var(--muted); font-size: 10px; line-height: 1.4; }
.history-group { padding: 4px 8px 16px; }
.history-label { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px 8px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.history-label button { display: grid; width: 28px; height: 28px; place-items: center; color: var(--muted); border: 0; border-radius: 7px; background: transparent; }
.history-label button:hover { color: var(--text); background: var(--surface-raised); }
.history-run { display: grid; grid-template-columns: 8px 1fr; gap: 8px; align-items: start; padding: 9px 8px; color: inherit; border-radius: 8px; text-decoration: none; }
.history-run:hover, .history-run.router-link-active { background: var(--surface-raised); }
.history-run i { width: 6px; height: 6px; margin-top: 5px; border-radius: 999px; background: var(--muted); }
.history-run i.running, .history-run i.provisioning, .history-run i.verifying { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acid) 14%, transparent); }
.history-run i.succeeded { background: var(--success); }
.history-run i.failed, .history-run i.cancelled { background: var(--danger); }
.history-run span { display: grid; min-width: 0; gap: 3px; }
.history-run b { overflow: hidden; color: var(--text); font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.history-run small, .history-empty { color: var(--muted); font-size: 10px; }
.history-empty { padding: 16px 8px; text-align: center; }
.inspector-stack { display: grid; gap: 10px; }
.inspector-card { padding: 13px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
.inspector-card header { display: flex; min-height: 22px; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.inspector-card header > span { color: var(--text); font-size: 11px; font-weight: 700; }
.inspector-card header > b { color: var(--text); font: 700 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.inspector-card header > i { width: 7px; height: 7px; border-radius: 999px; background: var(--muted); }
.inspector-card header > i.healthy, .inspector-card header > i[class*="healthy"] { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acid) 12%, transparent); }
.inspector-card dl { display: grid; gap: 7px; margin: 0; }
.inspector-card dl div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.inspector-card dt, .inspector-card p, .inspector-card small { color: var(--muted); font-size: 10px; line-height: 1.5; }
.inspector-card dd { margin: 0; color: var(--text); font: 600 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.inspector-card > strong { color: var(--text); font-size: 13px; }
.option-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.option-grid label, .capability-list label { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); }
.option-grid label.disabled, .capability-list label.disabled { opacity: .45; }
.option-grid input, .capability-list input, .browser-scope input, .budget-range { accent-color: var(--acid); }
.option-grid span, .capability-list span { display: grid; gap: 2px; }
.option-grid b, .capability-list b { color: var(--text); font-size: 10px; }
.option-grid small, .capability-list small { font-size: 9px; }
.capability-list { display: grid; gap: 6px; }
.browser-scope { display: grid; gap: 8px; }
.browser-scope header { margin-bottom: 2px; }
.browser-scope > input, .browser-scope select { min-height: 36px; padding: 0 9px; color: var(--text); border: 1px solid var(--border); border-radius: 7px; background: var(--surface-raised); font-size: 11px; }
.browser-scope > label { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 10px; }
.text-danger { justify-self: start; color: var(--danger); border: 0; background: transparent; font-size: 10px; }
.budget-range { width: 100%; }
.execution-spine { position: relative; display: grid; gap: 0; }
.execution-spine::before { position: absolute; top: 16px; bottom: 16px; left: 8px; width: 1px; content: ''; background: var(--border); }
.execution-spine article { position: relative; display: grid; grid-template-columns: 17px 1fr; gap: 10px; min-height: 62px; }
.execution-spine i { z-index: 1; width: 9px; height: 9px; margin: 5px 0 0 4px; border: 2px solid var(--border); border-radius: 999px; background: var(--sidebar); }
.execution-spine article.complete i { border-color: var(--acid); background: var(--acid); box-shadow: 0 0 0 4px color-mix(in srgb, var(--acid) 10%, transparent); }
.execution-spine div { display: grid; align-content: start; gap: 4px; }
.execution-spine b { color: var(--text); font-size: 11px; }
.execution-spine span { color: var(--muted); font-size: 10px; line-height: 1.45; }
.subagent-overview p { margin-bottom: 0; }
.boundary-list { display: grid; gap: 4px; padding: 4px; }
.boundary-list b { margin-top: 6px; color: var(--text); font-size: 10px; }
.boundary-list span { color: var(--muted); font-size: 10px; line-height: 1.5; }
.file-list { display: grid; gap: 6px; }
.file-list span { display: grid; gap: 2px; padding: 8px; border-radius: 7px; background: var(--surface-raised); }
.file-list b { overflow: hidden; color: var(--text); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 800px) {
  .agent-compose { width: min(100% - 28px, 840px); padding: 32px 0 64px; }
  .compose-intro { gap: 12px; }
  .compose-mark { flex-basis: 36px; width: 36px; height: 36px; }
  .objective-composer textarea { min-height: 160px; font-size: 16px; }
  .objective-composer footer { flex-wrap: wrap; }
  .objective-count { order: 3; width: 100%; margin: 0; }
  .estimate-action, .run-action, .attach-control { min-height: 44px; }
  .estimate-action { margin-left: auto; }
  .quote-bar { grid-template-columns: repeat(2, 1fr); }
  .task-presets { grid-template-columns: 1fr; }
  .task-presets button { min-height: 64px; }
}
@media (prefers-reduced-motion: reduce) {
  .task-presets button { transition: none; }
  .task-presets button:hover { transform: none; }
}
</style>
