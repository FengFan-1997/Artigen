<template>
  <div class="agent-page">
    <TitleBar />
    <main class="agent-shell">
      <section class="mode-switch" aria-label="Artigen mode">
        <router-link to="/artigen/ai">
          <span>01</span>
          <strong>{{ zh ? '快速生图' : 'Quick image' }}</strong>
          <small>{{ zh ? '少输入，直接出图' : 'Prompt in, image out' }}</small>
        </router-link>
        <router-link class="active" to="/artigen/agent">
          <span>02</span>
          <strong>{{ zh ? '电脑 Agent' : 'Computer Agent' }}</strong>
          <small>{{ zh ? '研究、操作、验证、交付' : 'Research, operate, verify, deliver' }}</small>
        </router-link>
      </section>

      <section class="hero">
        <div>
          <p class="eyebrow">ARTIGEN LOCAL AGENT / BETA</p>
          <h1>{{ zh ? '说出你想完成的事，本地 Agent 为你制作文件' : 'Describe the outcome. A local agent builds the files.' }}</h1>
          <p class="lead">
            {{
              zh
                ? '任务由云端 Qwen 模型和你 Mac 上的隔离 Linux 沙箱执行。浏览器 Beta 支持受限网页访问、逐次审批和由你亲自完成登录。'
                : 'Cloud Qwen reasoning drives an isolated Linux sandbox on your Mac. Browser Beta supports restricted browsing, one-time approvals, and user-controlled sign-in.'
            }}
          </p>
        </div>
        <div class="trust-strip">
          <span>{{ zh ? '本机隔离 Linux' : 'Local isolated Linux' }}</span>
          <span>45 min</span>
          <span>120 steps</span>
          <span>{{ zh ? '失败自动释放' : 'Failure release' }}</span>
        </div>
      </section>

      <section v-if="serviceStatus" class="worker-status" :class="{ offline: !serviceStatus.workerOnline }">
        <span class="status-dot" :class="serviceStatus.workerOnline ? 'running' : 'failed'"></span>
        <strong>
          {{
            serviceStatus.workerOnline
              ? (zh ? '本地 Worker 在线' : 'Local worker online')
              : (zh ? '本地 Worker 离线，任务将排队' : 'Local worker offline; runs will queue')
          }}
        </strong>
        <small>
          {{ serviceStatus.modelFamily }} ·
          {{ zh ? `${serviceStatus.queueDepth} 个任务排队 · 单任务串行执行` : `${serviceStatus.queueDepth} queued · one run at a time` }}
        </small>
        <small v-if="serviceStatus.browserPublicEnabled" class="browser-health">
          {{ serviceStatus.browserReady && serviceStatus.egressVerified && serviceStatus.desktopRelayReady
            ? (zh ? '浏览器、受限出口和桌面接管均已就绪' : 'Browser, restricted egress, and desktop takeover ready')
            : (zh ? '浏览器链路尚未全部就绪' : 'Browser path is not fully ready') }}
        </small>
      </section>

      <div class="workspace-grid">
        <section class="composer panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">{{ zh ? '新任务' : 'New run' }}</p>
              <h2>{{ zh ? '你最终想拿到什么？' : 'What do you want delivered?' }}</h2>
            </div>
            <span class="beta">BETA</span>
          </div>

          <label class="objective">
            <span>{{ zh ? '目标' : 'Objective' }}</span>
            <textarea
              v-model.trim="form.objective"
              rows="9"
              maxlength="20000"
              :placeholder="
                zh
                  ? '例如：调研 2026 年独立香氛品牌趋势，做一份有引用的 PDF 报告、一份带图表的 Excel 和一套可编辑路演 PPT。'
                  : 'Example: Research 2026 indie fragrance trends and deliver a cited PDF report, a charted Excel workbook, and an editable pitch deck.'
              "
            />
            <small>{{ form.objective.length.toLocaleString() }} / 20,000</small>
          </label>

          <label class="file-picker">
            <span>
              <strong>{{ zh ? '参考文件' : 'Reference files' }}</strong>
              <small>{{ zh ? '最多 10 个，每个 40 MiB；进入云电脑前会再次杀毒。' : 'Up to 10 files, 40 MiB each; scanned again before sandbox use.' }}</small>
            </span>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.pptx,.zip,.txt,.md,.csv,image/png,image/jpeg,image/webp"
              @change="selectFiles"
            />
            <b>{{ zh ? '选择文件' : 'Choose files' }}</b>
          </label>
          <div v-if="selectedFiles.length" class="selected-files">
            <span v-for="file in selectedFiles" :key="`${file.name}:${file.size}`">
              {{ file.name }} · {{ (file.size / 1024 / 1024).toFixed(1) }} MiB
            </span>
            <button type="button" @click="selectedFiles = []">{{ zh ? '清空' : 'Clear' }}</button>
          </div>

          <div class="deliverables">
            <span class="field-label">
              {{ zh ? '明确交付物（不选则由 Agent 判断）' : 'Required deliverables (leave blank for Agent choice)' }}
            </span>
            <div class="deliverable-options">
              <label v-for="item in deliverableOptions" :key="item.id">
                <input v-model="form.deliverables[item.id]" type="checkbox" />
                <span>
                  <strong>{{ item.code }} · {{ item.label }}</strong>
                  <small>{{ item.description }}</small>
                </span>
              </label>
            </div>
          </div>

          <details class="advanced-settings">
            <summary>
              <span>
                <strong>{{ zh ? '高级设置（可选）' : 'Advanced settings (optional)' }}</strong>
                <small>{{ zh ? '浏览器需要 HTTPS 白名单；填写、提交和外部变更会逐次确认。' : 'Browser access requires HTTPS origins; forms and external changes require approval.' }}</small>
              </span>
              <b>{{ zh ? '展开' : 'Expand' }}</b>
            </summary>

            <div class="deliverables">
              <span class="field-label">{{ zh ? '允许使用的能力' : 'Granted capabilities' }}</span>
              <div class="capability-grid">
                <label v-for="capability in capabilityOptions" :key="capability.id">
                  <input
                    v-model="form.capabilities[capability.id]"
                    type="checkbox"
                    :disabled="capability.disabled"
                  />
                  <span>
                    <strong>{{ capability.label }}</strong>
                    <small>{{ capability.description }}</small>
                  </span>
                </label>
              </div>
            </div>

            <div v-if="form.capabilities.browser" class="browser-session">
              <span class="field-label">{{ zh ? '浏览器安全范围' : 'Browser security scope' }}</span>
              <input
                v-model.trim="form.browserOrigins"
                type="text"
                :placeholder="zh ? 'https://example.com（多个域名用逗号分隔）' : 'https://example.com (comma-separate multiple origins)'"
              />
              <small>
                {{ zh
                  ? '只允许 HTTPS Origin，不要填写路径。普通同站链接可自动打开；表单和会改变外部状态的操作需要你确认。'
                  : 'HTTPS origins only, without paths. Same-site links may open automatically; forms and state-changing actions require your approval.' }}
              </small>
              <label>
                <input v-model="form.persistSession" type="checkbox" />
                <span>{{ zh ? '加密保存这个站点的登录会话 30 天' : 'Encrypt and save this site session for 30 days' }}</span>
              </label>
              <small v-if="form.persistSession">
                {{ zh ? '保存会话时只能填写一个 Origin。密码、OTP 和验证码仍必须由你接管输入。' : 'Saved sessions allow exactly one origin. Passwords, OTPs, and CAPTCHAs always require takeover.' }}
              </small>
              <select v-if="browserProfiles.length" v-model="form.profileId" @change="selectBrowserProfile">
                <option value="">{{ zh ? '不恢复已保存会话' : 'Do not restore a saved session' }}</option>
                <option v-for="profile in browserProfiles" :key="profile.profileId" :value="profile.profileId">
                  {{ profile.label }} · {{ profile.siteOrigin }}
                </option>
              </select>
              <button
                v-if="form.profileId"
                class="revoke-session"
                type="button"
                @click="revokeSelectedProfile"
              >
                {{ zh ? '撤销并删除这个会话' : 'Revoke and delete this session' }}
              </button>
            </div>

          </details>

          <label class="budget">
            <span>
              <strong>{{ zh ? '最高预算' : 'Maximum budget' }}</strong>
              <small>{{ zh ? '只按实际使用结算，未使用部分自动释放' : 'Only actual usage is settled; the rest is released' }}</small>
            </span>
            <span class="budget-value">{{ form.maxCredits }} {{ zh ? '点' : 'credits' }}</span>
            <input v-model.number="form.maxCredits" type="range" min="10" max="500" step="10" />
          </label>

          <div v-if="quoteIsCurrent && quote" class="quote">
            <span>
              {{ zh ? '预计' : 'Estimate' }}
              <strong>{{ quote.estimatedCredits.minimum }}–{{ quote.estimatedCredits.maximum }}</strong>
              {{ zh ? '点' : 'credits' }}
            </span>
            <span>
              {{ zh ? '体验余额' : 'Trial balance' }}
              <strong>{{ quote.freeCreditsRemaining }}</strong>
            </span>
            <span>
              {{ zh ? '需冻结' : 'Hold' }}
              <strong>{{ quote.requiredPaidHold }}</strong>
            </span>
          </div>

          <div v-if="notice" class="notice" :class="{ error: noticeIsError }">{{ notice }}</div>
          <div class="composer-actions">
            <button
              class="secondary"
              type="button"
              :disabled="busy || form.objective.length < 3"
              @click="getQuote"
            >
              {{ quoting ? (zh ? '估算中…' : 'Estimating…') : (zh ? '估算费用' : 'Estimate') }}
            </button>
            <button
              class="primary"
              type="button"
              :disabled="busy || form.objective.length < 3 || (quoteIsCurrent && quote?.canStart === false)"
              @click="startRun"
            >
              {{
                creating
                  ? (zh ? '正在创建…' : 'Starting…')
                  : quoteIsCurrent
                    ? (zh ? '确认并启动' : 'Confirm and start')
                    : (zh ? '先查看费用' : 'Review cost first')
              }}
            </button>
          </div>
          <p class="consent">
            {{
              zh
                ? '购买和绕过安全限制始终禁止。密码、OTP、验证码和安全警告只在你接管桌面时处理，不会交给模型。'
                : 'Purchases and security bypasses remain forbidden. Passwords, OTPs, CAPTCHAs, and security warnings are handled only during your takeover and are never sent to the model.'
            }}
          </p>
        </section>

        <aside class="runs panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">{{ zh ? '历史运行' : 'Run history' }}</p>
              <h2>{{ zh ? '最近任务' : 'Recent runs' }}</h2>
            </div>
            <button class="icon-button" type="button" :disabled="loadingRuns" @click="loadRuns">↻</button>
          </div>
          <div v-if="loadingRuns" class="empty">{{ zh ? '正在读取…' : 'Loading…' }}</div>
          <div v-else-if="!runs.length" class="empty">
            <span class="empty-mark">⌁</span>
            <strong>{{ zh ? '还没有 Agent 任务' : 'No agent runs yet' }}</strong>
            <small>{{ zh ? '左侧写下目标，第一次运行会出现在这里。' : 'Write an objective to start your first run.' }}</small>
          </div>
          <router-link
            v-for="run in runs"
            v-else
            :key="run.runId"
            class="run-card"
            :to="`/artigen/agent/runs/${run.runId}`"
          >
            <div>
              <span class="status-dot" :class="run.status"></span>
              <strong>{{ statusLabel(run.status) }}</strong>
              <time>{{ formatDate(run.updatedAt) }}</time>
            </div>
            <p>{{ run.objectivePreview || run.error?.code || run.progress.checklist?.summary || (zh ? '查看计划、云电脑和交付物' : 'Open plan, desktop, and artifacts') }}</p>
            <footer>
              <span>{{ run.progress.stepCount }}/{{ run.progress.maxSteps }} steps</span>
              <span>{{ run.budget.used.toFixed(1) }}/{{ run.budget.maximum }} {{ zh ? '点' : 'cr' }}</span>
              <b>→</b>
            </footer>
          </router-link>
        </aside>
      </div>

      <section class="deliverable-strip">
        <article v-for="item in deliverableCards" :key="item.code">
          <span>{{ item.code }}</span>
          <div>
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import TitleBar from '../components/TitleBar.vue';
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
  maxCredits: 100,
  capabilities: {
    research: false,
    browser: false,
    files: true,
    shell: true,
    generate_images: false,
    google_drive: false,
    github: false,
    upload: false,
    move_files: false
  } as Record<string, boolean>,
  browserOrigins: '',
  persistSession: false,
  profileId: '',
  deliverables: {
    report: false,
    spreadsheet: false,
    presentation: false,
    website: false
  } as Record<string, boolean>
});

const capabilityOptions = computed(() => [
  { id: 'files', label: zh.value ? '文件处理' : 'File work', description: zh.value ? '报告、表格、PPT、网站' : 'Reports, sheets, slides, sites', disabled: false },
  { id: 'shell', label: zh.value ? '隔离沙箱命令' : 'Isolated sandbox shell', description: zh.value ? '仅在隔离 Linux 工作区执行' : 'Runs only in the isolated Linux workspace', disabled: false },
  {
    id: 'browser',
    label: zh.value ? '安全浏览器 Beta' : 'Secure browser Beta',
    description: serviceStatus.value?.browserPublicEnabled
      ? (zh.value ? '浏览、点击、表单审批和登录接管' : 'Browse, click, approve forms, and take over sign-in')
      : (zh.value ? '当前环境尚未开放' : 'Not enabled in this environment'),
    disabled: !serviceStatus.value?.browserPublicEnabled
  }
]);

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

const deliverableCards = computed(() => [
  { code: 'PDF', title: zh.value ? '带引用的报告' : 'Cited report', description: zh.value ? '可编辑源文件 + PDF' : 'Editable source + PDF' },
  { code: 'XLSX', title: zh.value ? '数据与图表' : 'Data and charts', description: zh.value ? '公式可计算、图表可编辑' : 'Working formulas and editable charts' },
  { code: 'PPTX', title: zh.value ? '可编辑演示' : 'Editable deck', description: zh.value ? 'PPTX + 渲染预览' : 'PPTX + rendered preview' },
  { code: 'WEB', title: zh.value ? '静态网站' : 'Static website', description: zh.value ? '在线预览 + 源码 ZIP' : 'Live preview + source ZIP' }
]);
const deliverableOptions = computed(() => [
  { id: 'report', code: 'PDF', label: zh.value ? '带引用的报告' : 'Cited report', description: zh.value ? '可编辑源文件 + PDF' : 'Editable source + PDF' },
  { id: 'spreadsheet', code: 'XLSX', label: zh.value ? '数据与图表' : 'Data and charts', description: zh.value ? '公式、数据和可编辑图表' : 'Formulas, data and editable charts' },
  { id: 'presentation', code: 'PPTX', label: zh.value ? '可编辑演示' : 'Editable deck', description: zh.value ? 'PPTX + 渲染预览' : 'PPTX + rendered preview' },
  { id: 'website', code: 'WEB', label: zh.value ? '静态网站' : 'Static website', description: zh.value ? '在线预览 + 源码 ZIP' : 'Preview + source ZIP' }
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
    AGENT_BROWSER_NOT_PUBLIC: zh.value ? '当前环境尚未开放浏览器能力。' : 'Browser capability is not enabled in this environment.'
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
.agent-page { min-height: 100vh; color: #f6f7f2; background: #0a0b0d; }
.agent-shell { width: min(1440px, calc(100% - 40px)); margin: 0 auto; padding: 28px 0 80px; }
.mode-switch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 620px; border: 1px solid #2b2e32; background: #111316; }
.mode-switch a { display: grid; grid-template-columns: 40px 1fr; gap: 2px 12px; padding: 15px 18px; color: #93999f; text-decoration: none; }
.mode-switch a + a { border-left: 1px solid #2b2e32; }
.mode-switch a.active { color: #fff; background: #1a1d20; box-shadow: inset 0 -2px #ccff00; }
.mode-switch span { grid-row: 1 / 3; align-self: center; color: #ccff00; font: 700 12px/1 monospace; }
.mode-switch strong { font-size: 14px; }.mode-switch small { font-size: 11px; color: #777e85; }
.hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 34px; align-items: end; padding: 28px 0 24px; border-bottom: 1px solid #222529; }
.eyebrow { margin: 0 0 12px; color: #ccff00; font: 700 11px/1.2 monospace; letter-spacing: .12em; text-transform: uppercase; }
.hero h1 { max-width: 980px; margin: 0; font-size: clamp(34px, 3.9vw, 54px); line-height: 1.02; letter-spacing: -.05em; }
.lead { max-width: 820px; margin: 14px 0 0; color: #a4a9af; font-size: 14px; line-height: 1.58; }
.trust-strip { display: grid; gap: 8px; min-width: 150px; }.trust-strip span { border-left: 2px solid #ccff00; padding: 3px 0 3px 12px; color: #8c9298; font: 600 11px monospace; }
.worker-status { display: flex; align-items: center; gap: 9px; margin-top: 14px; padding: 12px 14px; color: #dce8b8; border: 1px solid #465517; background: #131a08; }.worker-status.offline { color: #f0b9b3; border-color: #653831; background: #211210; }.worker-status small { margin-left: auto; color: #858c92; font: 10px/1.4 monospace; }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(340px, .7fr); gap: 18px; margin-top: 18px; }
.panel { border: 1px solid #292c30; background: #111316; }
.composer, .runs { padding: 26px; }.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 24px; }.panel-head h2 { margin: 0; font-size: 24px; }
.beta { padding: 6px 9px; color: #0a0b0d; background: #ccff00; font: 900 10px monospace; }
.objective { position: relative; display: grid; gap: 9px; }.objective > span,.field-label { color: #c9cdd0; font-size: 13px; font-weight: 700; }
textarea { width: 100%; resize: vertical; box-sizing: border-box; border: 1px solid #363b40; border-radius: 0; padding: 16px; color: #f8fafc; background: #0b0d0f; font: inherit; line-height: 1.6; outline: none; }
textarea:focus { border-color: #ccff00; box-shadow: 0 0 0 1px #ccff00; }.objective > small { position: absolute; right: 10px; bottom: 9px; color: #646a70; font: 10px monospace; }
.file-picker { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 14px 16px; border: 1px dashed #3a4046; background: #0d0f11; cursor: pointer; }.file-picker > span { display: grid; gap: 4px; }.file-picker small { color: #7f858b; font-size: 11px; }.file-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; }.file-picker b { padding: 8px 11px; color: #0a0b0d; background: #ccff00; font-size: 11px; }.selected-files { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }.selected-files span { padding: 6px 8px; color: #b8bec4; background: #181b1e; font: 10px monospace; }.selected-files button { color: #ff897d; border: 0; background: transparent; cursor: pointer; }
.deliverables { display: grid; gap: 12px; margin-top: 22px; }.capability-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
.advanced-settings { margin-top: 18px; border: 1px solid #2b3035; background: #0d0f11; }.advanced-settings > summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; list-style: none; cursor: pointer; }.advanced-settings > summary::-webkit-details-marker { display: none; }.advanced-settings > summary span { display: grid; gap: 4px; }.advanced-settings > summary strong { font-size: 12px; }.advanced-settings > summary small { color: #747b82; font-size: 10px; }.advanced-settings > summary b { color: #ccff00; font: 10px monospace; }.advanced-settings[open] > summary { border-bottom: 1px solid #2b3035; }.advanced-settings[open] > summary b { font-size: 0; }.advanced-settings[open] > summary b::after { content: '−'; font-size: 16px; }.advanced-settings > .deliverables,.advanced-settings > .connections,.advanced-settings > .browser-session { margin-right: 14px; margin-left: 14px; }.advanced-settings > .browser-session { margin-bottom: 14px; }
.deliverable-options { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; }.deliverable-options label { display: flex; gap: 8px; min-height: 58px; padding: 10px; border: 1px solid #2b3035; background: #0d0f11; cursor: pointer; }.deliverable-options input { accent-color: #ccff00; }.deliverable-options span { display: grid; gap: 4px; }.deliverable-options strong { font-size: 11px; }.deliverable-options small { color: #747b82; font-size: 9px; line-height: 1.35; }
.browser-session { display: grid; gap: 9px; margin-top: 18px; padding: 14px; border: 1px solid #2b3035; background: #0d0f11; }.browser-session > input,.browser-session select { min-height: 38px; padding: 0 10px; border: 1px solid #353b40; color: #e9ece7; background: #141719; }.browser-session label { display: flex; gap: 8px; align-items: center; color: #b5bbc0; font-size: 11px; }.browser-session small { color: #737a80; font-size: 10px; line-height: 1.5; }.revoke-session { justify-self: start; border: 0; color: #ff8a7f; background: transparent; font-size: 10px; cursor: pointer; }
.capability-grid label { display: flex; gap: 10px; min-height: 54px; padding: 11px; border: 1px solid #2b3035; background: #15181b; cursor: pointer; }.capability-grid input { accent-color: #ccff00; }
.capability-grid span { display: grid; gap: 4px; }.capability-grid strong { font-size: 12px; }.capability-grid small { color: #747b82; font-size: 10px; }
.connections { display: grid; gap: 11px; margin-top: 20px; }.connections > div { display: flex; gap: 8px; }.connections button { display: grid; grid-template-columns: 34px 1fr; gap: 2px 9px; flex: 1; padding: 10px; text-align: left; color: #b9bec2; border: 1px solid #30353a; background: #0d0f11; }.connections button > span { grid-row: 1 / 3; display: grid; place-items: center; color: #ccff00; font: 800 10px monospace; }.connections button small { color: #6d747a; font-size: 9px; }.connections button.connected { border-color: #5d7312; background: #151b09; }
.budget { display: grid; grid-template-columns: 1fr auto; gap: 12px; margin-top: 22px; padding: 16px; border: 1px solid #2b3035; }.budget > span:first-child { display: grid; gap: 4px; }.budget small { color: #7f858b; font-size: 11px; }.budget-value { color: #ccff00; font: 800 14px monospace; }.budget input { grid-column: 1 / -1; width: 100%; accent-color: #ccff00; }
.quote { display: flex; gap: 8px; margin-top: 10px; }.quote span { flex: 1; padding: 10px; color: #81878d; background: #0b0d0f; font-size: 10px; }.quote strong { display: block; margin-top: 4px; color: #f6f7f2; font: 700 15px monospace; }
.composer-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }button { font: inherit; cursor: pointer; }.primary,.secondary { min-height: 44px; padding: 0 18px; border: 1px solid #ccff00; font-weight: 800; }.primary { color: #090a0b; background: #ccff00; }.secondary { color: #ccff00; background: transparent; }.primary:disabled,.secondary:disabled { opacity: .45; cursor: not-allowed; }
.consent { margin: 14px 0 0; color: #6f767d; font-size: 11px; line-height: 1.6; }.notice { margin-top: 14px; padding: 11px; color: #ccff00; border: 1px solid #596e12; background: #182005; font-size: 12px; }.notice.error { color: #ffaaa2; border-color: #64332e; background: #211210; }
.icon-button { width: 34px; height: 34px; border: 1px solid #34383c; color: #ccff00; background: transparent; }.empty { display: grid; place-items: center; gap: 8px; min-height: 280px; text-align: center; color: #8c9399; }.empty-mark { color: #ccff00; font-size: 42px; }.empty small { max-width: 240px; color: #62696f; }
.run-card { display: block; padding: 15px 0; color: inherit; text-decoration: none; border-top: 1px solid #282c30; }.run-card > div,.run-card footer { display: flex; align-items: center; gap: 8px; }.run-card time { margin-left: auto; color: #666c72; font-size: 10px; }.run-card p { margin: 10px 0; color: #858c92; font-size: 12px; }.run-card footer { color: #666d73; font: 10px monospace; }.run-card footer b { margin-left: auto; color: #ccff00; font-size: 16px; }.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #737980; }.status-dot.running,.status-dot.provisioning,.status-dot.verifying { background: #ccff00; box-shadow: 0 0 10px #ccff00; }.status-dot.succeeded { background: #54e391; }.status-dot.failed,.status-dot.cancelled { background: #ff6b61; }.status-dot.waiting_user { background: #ffb84d; }
.deliverable-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #292c30; border-top: 0; }.deliverable-strip article { display: flex; gap: 13px; padding: 20px; }.deliverable-strip article + article { border-left: 1px solid #292c30; }.deliverable-strip article > span { color: #ccff00; font: 800 11px monospace; }.deliverable-strip div { display: grid; gap: 5px; }.deliverable-strip strong { font-size: 12px; }.deliverable-strip small { color: #6f767c; font-size: 10px; }
@media (max-width: 960px) { .hero,.workspace-grid { grid-template-columns: 1fr; }.trust-strip { grid-template-columns: repeat(4,1fr); }.deliverable-options { grid-template-columns: repeat(2,minmax(0,1fr)); }.deliverable-strip { grid-template-columns: repeat(2,1fr); }.deliverable-strip article:nth-child(3) { border-top: 1px solid #292c30; border-left: 0; }.deliverable-strip article:nth-child(4) { border-top: 1px solid #292c30; } }
@media (max-width: 620px) { .agent-shell { width: min(100% - 24px, 1440px); padding-top: 20px; }.mode-switch a { padding: 13px 12px; }.mode-switch small { display: none; }.hero { gap: 20px; padding: 28px 0 22px; }.hero h1 { font-size: 32px; line-height: 1.05; }.lead { font-size: 13px; line-height: 1.55; }.trust-strip { grid-template-columns: repeat(2,1fr); }.composer,.runs { padding: 18px; }.capability-grid,.deliverable-options,.deliverable-strip { grid-template-columns: 1fr; }.deliverable-strip article + article { border-left: 0; border-top: 1px solid #292c30; }.quote { flex-direction: column; }.composer-actions { flex-direction: column; }.primary,.secondary { width: 100%; } }
</style>
