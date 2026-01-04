<template>
  <div class="agent-debug-page">
    <header class="header">
      <div class="title">
        <h1>Agent Debug</h1>
        <div class="sub">用于调试 Agent 参数与状态（实时快照）</div>
      </div>
      <div class="header-actions">
        <router-link class="btn" to="/">返回首页</router-link>
        <button class="btn" :disabled="!hasDebug" @click="exportFeedback">导出反馈包</button>
        <button class="btn" @click="refresh">手动刷新</button>
      </div>
    </header>

    <div class="grid">
      <section class="panel">
        <div class="panel-title">连接状态</div>
        <div class="kv">
          <div class="k">window.__agentDebug</div>
          <div class="v" :class="{ bad: !hasDebug, ok: hasDebug }">
            {{ hasDebug ? '已连接' : '未连接（请确保页面上已渲染 Agent）' }}
          </div>
        </div>
        <div class="kv">
          <div class="k">采集状态</div>
          <div class="v" :class="{ ok: captureEnabled, bad: !captureEnabled }">
            {{ captureEnabled ? '开启（会记录事件与日志）' : '关闭（不记录）' }}
          </div>
        </div>
        <div class="kv">
          <div class="k">info 日志</div>
          <div
            class="v"
            :class="{ ok: consoleCaptureInfoEnabled, bad: !consoleCaptureInfoEnabled }"
          >
            {{
              consoleCaptureInfoEnabled ? '开启（log/info 会记录）' : '关闭（只记录 warn/error）'
            }}
          </div>
        </div>
        <div class="btn-row" style="margin-top: 8px">
          <button class="btn" :disabled="!hasDebug" @click="toggleCapture">
            {{ captureEnabled ? '关闭采集' : '开启采集' }}
          </button>
          <button class="btn" :disabled="!hasDebug" @click="toggleConsoleInfoCapture">
            {{ consoleCaptureInfoEnabled ? '关闭 info 日志' : '开启 info 日志' }}
          </button>
          <button class="btn" :disabled="!hasDebug" @click="clearCapture">清空采集</button>
        </div>
        <div class="kv" v-if="hasDebug">
          <div class="k">路由</div>
          <div class="v">{{ snapshot?.route || '' }}</div>
        </div>
        <div class="kv" v-if="hasDebug">
          <div class="k">时间</div>
          <div class="v">{{ snapshot?.ts ? new Date(snapshot.ts).toLocaleString() : '' }}</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">反馈包预览</div>
        <div class="kv">
          <div class="k">事件数</div>
          <div class="v">{{ feedbackPreview?.counts?.events ?? 0 }}</div>
        </div>
        <div class="kv">
          <div class="k">日志数</div>
          <div class="v">{{ feedbackPreview?.counts?.logs ?? 0 }}</div>
        </div>
        <div class="kv">
          <div class="k">导出大小</div>
          <div class="v">{{ feedbackPreview?.approxBytes ?? 0 }} bytes</div>
        </div>
        <div class="form-row" style="grid-template-columns: 140px 1fr 72px">
          <label class="label">原因/场景</label>
          <input
            v-model="feedbackReason"
            class="input"
            type="text"
            placeholder="例如：VRM 抽动/卡顿/接口报错"
          />
          <button class="btn" :disabled="!hasDebug" @click="exportFeedback">导出</button>
        </div>
        <pre class="pre">{{ pretty(feedbackPreview) }}</pre>
      </section>

      <section class="panel">
        <div class="panel-title">参数</div>

        <div class="form-row">
          <label class="label">漫游开关</label>
          <input v-model="roamEnabled" class="input" type="checkbox" />
          <button class="btn" :disabled="!hasDebug" @click="applyParam('roamEnabled', roamEnabled)">
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">闲置动作开关</label>
          <input v-model="idleTalkEnabled" class="input" type="checkbox" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleTalkEnabled', idleTalkEnabled)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 开关</label>
          <input v-model="idleAiEnabled" class="input" type="checkbox" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiEnabled', idleAiEnabled)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">漫游间隔 (ms)</label>
          <input
            v-model.number="moveIntervalMs"
            class="input"
            type="number"
            min="5000"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('moveIntervalMs', moveIntervalMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">闲置动作间隔 (ms)</label>
          <input
            v-model.number="idleTalkIntervalMs"
            class="input"
            type="number"
            min="3000"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleTalkIntervalMs', idleTalkIntervalMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">跟随平滑 (lerp)</label>
          <input
            v-model.number="lerpFactor"
            class="input"
            type="number"
            min="0.01"
            max="0.35"
            step="0.01"
          />
          <button class="btn" :disabled="!hasDebug" @click="applyParam('lerpFactor', lerpFactor)">
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">鼠标偏移 X</label>
          <input
            v-model.number="mouseFollowOffsetX"
            class="input"
            type="number"
            min="-300"
            max="300"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('mouseFollowOffsetX', mouseFollowOffsetX)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">鼠标偏移 Y</label>
          <input
            v-model.number="mouseFollowOffsetY"
            class="input"
            type="number"
            min="-300"
            max="300"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('mouseFollowOffsetY', mouseFollowOffsetY)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Chat 自动关闭 (ms)</label>
          <input
            v-model.number="chatAutoCloseMs"
            class="input"
            type="number"
            min="0"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('chatAutoCloseMs', chatAutoCloseMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">UI 最大消息数</label>
          <input v-model.number="maxUiMessages" class="input" type="number" min="20" max="800" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('maxUiMessages', maxUiMessages)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">动态缩放</label>
          <input
            v-model.number="dynamicScale"
            class="input"
            type="number"
            min="0.06"
            max="1.6"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('dynamicScale', dynamicScale)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">移动过渡 (ms)</label>
          <input
            v-model.number="moveTransitionMs"
            class="input"
            type="number"
            min="80"
            max="20000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('moveTransitionMs', moveTransitionMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Max Energy</label>
          <input v-model.number="maxEnergy" class="input" type="number" min="10" max="2000" />
          <button class="btn" :disabled="!hasDebug" @click="applyParam('maxEnergy', maxEnergy)">
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Energy Decay</label>
          <input
            v-model.number="energyDecayRate"
            class="input"
            type="number"
            min="0"
            max="5"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('energyDecayRate', energyDecayRate)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Energy Recover</label>
          <input
            v-model.number="energyRecoverRate"
            class="input"
            type="number"
            min="0"
            max="5"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('energyRecoverRate', energyRecoverRate)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">疲劳阈值</label>
          <input v-model.number="tiredThreshold" class="input" type="number" min="0" max="2000" />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('tiredThreshold', tiredThreshold)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 最小闲置 (ms)</label>
          <input
            v-model.number="idleAiMinIdleMs"
            class="input"
            type="number"
            min="3000"
            max="600000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiMinIdleMs', idleAiMinIdleMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 冷却 (ms)</label>
          <input
            v-model.number="idleAiCooldownMs"
            class="input"
            type="number"
            min="0"
            max="900000"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiCooldownMs', idleAiCooldownMs)"
          >
            应用
          </button>
        </div>

        <div class="form-row">
          <label class="label">Idle AI 概率</label>
          <input
            v-model.number="idleAiChance"
            class="input"
            type="number"
            min="0"
            max="1"
            step="0.01"
          />
          <button
            class="btn"
            :disabled="!hasDebug"
            @click="applyParam('idleAiChance', idleAiChance)"
          >
            应用
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">AI 调用</div>
        <div class="form-row">
          <label class="label">Transport 覆盖</label>
          <select v-model="transportOverride" class="input">
            <option value="">（不覆盖）</option>
            <option value="proxy">proxy</option>
            <option value="direct">direct</option>
          </select>
          <button class="btn" @click="applyTransport">应用</button>
        </div>
        <pre class="pre">{{ pretty(aiState) }}</pre>
      </section>

      <section class="panel">
        <div class="panel-title">操作</div>
        <div class="btn-row">
          <button class="btn" :disabled="!hasDebug" @click="act('toggleChat')">切换聊天</button>
          <button class="btn" :disabled="!hasDebug" @click="act('openChat')">打开聊天</button>
          <button class="btn" :disabled="!hasDebug" @click="act('closeChat')">关闭聊天</button>
          <button class="btn" :disabled="!hasDebug" @click="act('cancelAi')">取消所有 AI</button>
          <button class="btn" :disabled="!hasDebug" @click="act('taskNext')">任务继续</button>
          <button class="btn" :disabled="!hasDebug" @click="act('taskStop')">任务停止</button>
          <button class="btn" :disabled="!hasDebug" @click="act('reloadMemory')">重载记忆</button>
          <button class="btn danger" :disabled="!hasDebug" @click="act('clearLocalMemory')">
            清空本地记忆
          </button>
        </div>
      </section>

      <section class="panel wide">
        <div class="panel-title">数据视图</div>
        <div class="split">
          <div class="col">
            <div class="panel-sub">性能</div>
            <pre class="pre">{{ pretty(perfView) }}</pre>

            <div class="panel-sub">聊天（最近）</div>
            <div class="form-row">
              <label class="label">过滤</label>
              <input v-model="chatFilter" class="input" type="text" placeholder="role/text 包含" />
              <button class="btn" @click="chatFilter = ''">清空</button>
            </div>
            <div class="form-row">
              <label class="label">条数</label>
              <input v-model.number="chatLimit" class="input" type="number" min="5" max="200" />
              <button class="btn" :disabled="!hasDebug" @click="refresh">刷新</button>
            </div>
            <pre class="pre">{{ pretty(chatView) }}</pre>

            <div class="panel-sub" style="margin-top: 10px">任务</div>
            <pre class="pre">{{ pretty(taskView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">记忆 Facts</div>
            <pre class="pre">{{ pretty(factsView) }}</pre>
            <div class="panel-sub" style="margin-top: 10px">本地记忆（最近）</div>
            <pre class="pre">{{ pretty(memoryItemsView) }}</pre>
          </div>
        </div>
      </section>

      <section class="panel wide">
        <div class="panel-title">诊断与反馈</div>
        <div class="toolbar">
          <label class="toolbar-item">
            <input v-model="autoRefreshEnabled" type="checkbox" />
            自动刷新
          </label>
          <label class="toolbar-item">
            间隔(ms)
            <input
              v-model.number="refreshIntervalMs"
              class="input input-sm"
              type="number"
              min="120"
              max="60000"
            />
          </label>
          <button class="btn" @click="refresh">立即刷新</button>
          <button class="btn" :disabled="!hasDebug" @click="clearDiag">清空诊断</button>
          <button class="btn" :disabled="!hasDebug" @click="downloadFeedbackPack">
            导出反馈包
          </button>
          <button class="btn" :disabled="!hasDebug" @click="copyFeedbackSummary">复制摘要</button>
          <button class="btn" :disabled="!hasDebug" @click="copyFeedbackPackJson">
            复制反馈 JSON
          </button>
        </div>

        <div class="split">
          <div class="col">
            <div class="panel-sub">错误/警告（最近）</div>
            <div class="form-row">
              <label class="label">条数</label>
              <input v-model.number="diagLimit" class="input" type="number" min="10" max="400" />
              <button class="btn" :disabled="!hasDebug" @click="applyDiagMax">应用</button>
            </div>
            <pre class="pre">{{ pretty(diagErrorsView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">AI 请求追踪（最近）</div>
            <pre class="pre">{{ pretty(diagAiRequestsView) }}</pre>
          </div>
        </div>

        <div class="panel-sub" style="margin-top: 10px">事件流（最近）</div>
        <div class="form-row">
          <label class="label">过滤</label>
          <input v-model="diagQuery" class="input" type="text" placeholder="kind/message 包含" />
          <button class="btn" @click="diagQuery = ''">清空</button>
        </div>
        <div class="form-row">
          <label class="label">Level</label>
          <select v-model="diagLevel" class="input">
            <option value="">（全部）</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
          </select>
          <button class="btn" @click="diagLevel = ''">重置</button>
        </div>
        <pre class="pre">{{ pretty(diagItemsView) }}</pre>
      </section>

      <section class="panel wide">
        <div class="panel-title">快照</div>
        <div class="split">
          <div class="col">
            <div class="panel-sub">概览</div>
            <pre class="pre">{{ pretty(summaryView) }}</pre>
          </div>
          <div class="col">
            <div class="panel-sub">完整 JSON</div>
            <pre class="pre">{{ pretty(snapshot) }}</pre>
          </div>
        </div>
      </section>
    </div>

    <Agent class="pinned-agent" :is-pinned="true" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Agent from '../agent/components/Agent.vue';
import {
  getAiRuntimeState,
  getAiTransportOverride,
  setAiTransportOverride
} from '../agent/services/aiService';

const snapshot = ref<any>(null);
const aiState = ref<any>(null);
const diagState = ref<any>(null);
const transportOverride = ref<string>(getAiTransportOverride() || '');
const feedbackReason = ref<string>('');
const diagQuery = ref<string>('');
const diagLevel = ref<string>('');

const hasDebug = computed(() => {
  const w = window as any;
  return !!w.__agentDebug && typeof w.__agentDebug.getSnapshot === 'function';
});

const captureEnabled = computed(() => {
  const s = diagState.value;
  return typeof s?.enabled === 'boolean' ? s.enabled : true;
});

const consoleCaptureInfoEnabled = computed(() => {
  const s = diagState.value;
  return typeof s?.consoleCaptureInfo === 'boolean' ? s.consoleCaptureInfo : false;
});

const refresh = () => {
  const w = window as any;
  if (w.__agentDebug?.getSnapshot) snapshot.value = w.__agentDebug.getSnapshot();
  if (w.__agentDebug?.getDiagnosticsSnapshot)
    diagState.value = w.__agentDebug.getDiagnosticsSnapshot();
  aiState.value = getAiRuntimeState();
};

const applyParam = (key: string, value: any) => {
  const w = window as any;
  if (w.__agentDebug?.setParam) w.__agentDebug.setParam(key, value);
  refresh();
};

const act = (name: string) => {
  const w = window as any;
  if (w.__agentDebug?.action) w.__agentDebug.action(name);
  refresh();
};

const applyTransport = () => {
  const v =
    transportOverride.value === 'proxy' || transportOverride.value === 'direct'
      ? transportOverride.value
      : '';
  setAiTransportOverride(v as any);
  refresh();
};

const clearDiag = () => {
  const w = window as any;
  if (w.__agentDebug?.clearDiagnostics) w.__agentDebug.clearDiagnostics();
  refresh();
};

const toggleCapture = () => {
  const w = window as any;
  const next = !captureEnabled.value;
  if (w.__agentDebug?.setDiagnosticsEnabled) w.__agentDebug.setDiagnosticsEnabled(next);
  refresh();
};

const toggleConsoleInfoCapture = () => {
  const w = window as any;
  const next = !consoleCaptureInfoEnabled.value;
  if (w.__agentDebug?.setConsoleCaptureInfoEnabled)
    w.__agentDebug.setConsoleCaptureInfoEnabled(next);
  refresh();
};

const clearCapture = () => {
  clearDiag();
};

const diagLimit = ref<number>(200);
const applyDiagMax = () => {
  const w = window as any;
  const n = Math.max(20, Math.min(2000, Number(diagLimit.value) || 200));
  if (w.__agentDebug?.setDiagnosticsMaxItems) w.__agentDebug.setDiagnosticsMaxItems(n);
  refresh();
};

const pretty = (v: any) => {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
};

const autoRefreshEnabled = ref<boolean>(true);
const refreshIntervalMs = ref<number>(800);

const maxUiMessages = ref<number>(120);
const chatAutoCloseMs = ref<number>(5000);
const dynamicScale = ref<number>(1.0);
const moveTransitionMs = ref<number>(3000);
const roamEnabled = ref<boolean>(true);
const idleTalkEnabled = ref<boolean>(true);
const idleAiEnabled = ref<boolean>(true);
const moveIntervalMs = ref<number>(60000);
const idleTalkIntervalMs = ref<number>(30000);
const lerpFactor = ref<number>(0.06);
const mouseFollowOffsetX = ref<number>(20);
const mouseFollowOffsetY = ref<number>(20);
const maxEnergy = ref<number>(100);
const energyDecayRate = ref<number>(0.03);
const energyRecoverRate = ref<number>(0.02);
const tiredThreshold = ref<number>(20);
const idleAiMinIdleMs = ref<number>(65000);
const idleAiCooldownMs = ref<number>(120000);
const idleAiChance = ref<number>(0.22);

const chatFilter = ref<string>('');
const chatLimit = ref<number>(40);

watch(
  snapshot,
  (s) => {
    const p = s?.params;
    if (!p) return;
    if (typeof p.maxUiMessages === 'number') maxUiMessages.value = p.maxUiMessages;
    if (typeof p.chatAutoCloseMs === 'number') chatAutoCloseMs.value = p.chatAutoCloseMs;
    if (typeof p.dynamicScale === 'number') dynamicScale.value = p.dynamicScale;
    if (typeof p.moveTransitionMs === 'number') moveTransitionMs.value = p.moveTransitionMs;
    if (typeof p.roamEnabled === 'boolean') roamEnabled.value = p.roamEnabled;
    if (typeof p.idleTalkEnabled === 'boolean') idleTalkEnabled.value = p.idleTalkEnabled;
    if (typeof p.idleAiEnabled === 'boolean') idleAiEnabled.value = p.idleAiEnabled;
    if (typeof p.moveIntervalMs === 'number') moveIntervalMs.value = p.moveIntervalMs;
    if (typeof p.idleTalkIntervalMs === 'number') idleTalkIntervalMs.value = p.idleTalkIntervalMs;
    if (typeof p.lerpFactor === 'number') lerpFactor.value = p.lerpFactor;
    if (typeof p.mouseFollowOffset?.x === 'number')
      mouseFollowOffsetX.value = p.mouseFollowOffset.x;
    if (typeof p.mouseFollowOffset?.y === 'number')
      mouseFollowOffsetY.value = p.mouseFollowOffset.y;
    if (typeof p.maxEnergy === 'number') maxEnergy.value = p.maxEnergy;
    if (typeof p.energyDecayRate === 'number') energyDecayRate.value = p.energyDecayRate;
    if (typeof p.energyRecoverRate === 'number') energyRecoverRate.value = p.energyRecoverRate;
    if (typeof p.tiredThreshold === 'number') tiredThreshold.value = p.tiredThreshold;
    if (typeof p.idleAiMinIdleMs === 'number') idleAiMinIdleMs.value = p.idleAiMinIdleMs;
    if (typeof p.idleAiCooldownMs === 'number') idleAiCooldownMs.value = p.idleAiCooldownMs;
    if (typeof p.idleAiChance === 'number') idleAiChance.value = p.idleAiChance;
  },
  { deep: false }
);

const chatView = computed(() => {
  const s = snapshot.value;
  const raw = Array.isArray(s?.chat?.messages) ? s.chat.messages : [];
  const take = Math.max(5, Math.min(200, Number(chatLimit.value) || 40));
  const q = String(chatFilter.value || '')
    .trim()
    .toLowerCase();
  const normalized = raw
    .slice(-take)
    .map((m: any) => ({ role: m?.role || '', text: m?.text || '' }))
    .filter((m: any) => (m.text || '').trim());
  if (!q) return normalized;
  return normalized.filter((m: any) => `${m.role} ${m.text}`.toLowerCase().includes(q));
});

const factsView = computed(() => {
  const s = snapshot.value;
  const facts = Array.isArray(s?.memory?.facts) ? s.memory.facts : [];
  return facts.slice(-60);
});

const memoryItemsView = computed(() => {
  const s = snapshot.value;
  const items = Array.isArray(s?.memory?.recentItems) ? s.memory.recentItems : [];
  return items.slice(-60);
});

const taskView = computed(() => {
  const s = snapshot.value;
  const task = s?.task || null;
  return task;
});

const perfView = computed(() => {
  const s = snapshot.value;
  const p = s?.perf || null;
  return p;
});

const summaryView = computed(() => {
  const s = snapshot.value;
  if (!s) return null;
  return {
    route: s.route,
    perf: s.perf,
    agent: s.agent,
    chat: {
      open: s.chat?.open,
      isLoading: s.chat?.isLoading,
      isMuted: s.chat?.isMuted,
      messagesCount: Array.isArray(s.chat?.messages) ? s.chat.messages.length : 0
    },
    memory: {
      itemCount: s.memory?.itemCount,
      summaryChars: typeof s.memory?.summary === 'string' ? s.memory.summary.length : 0,
      factsCount: Array.isArray(s.memory?.facts) ? s.memory.facts.length : 0
    },
    task: s.task,
    params: s.params
  };
});

const diagErrorsView = computed(() => {
  const s = diagState.value;
  const items = Array.isArray(s?.items) ? s.items : [];
  const filtered = items.filter((x: any) => x?.level === 'error' || x?.level === 'warn');
  return filtered.slice(-60);
});

const diagAiRequestsView = computed(() => {
  const s = diagState.value;
  const items = Array.isArray(s?.aiRequests) ? s.aiRequests : [];
  return items.slice(-80);
});

const diagItemsView = computed(() => {
  const s = diagState.value;
  const items = Array.isArray(s?.items) ? s.items : [];
  const q = String(diagQuery.value || '')
    .trim()
    .toLowerCase();
  const level = String(diagLevel.value || '')
    .trim()
    .toLowerCase();
  const filtered = items.filter((x: any) => {
    if (level && String(x?.level || '').toLowerCase() !== level) return false;
    if (!q) return true;
    const kind = String(x?.kind || '');
    const msg = String(x?.message || '');
    return `${kind} ${msg}`.toLowerCase().includes(q);
  });
  return filtered.slice(-120);
});

const downloadJson = (filename: string, data: any) => {
  const text = pretty(data);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const buildFeedbackPack = () => {
  return {
    exportedAt: new Date().toISOString(),
    location: window.location.href,
    reason: String(feedbackReason.value || '').slice(0, 600),
    agentSnapshot: snapshot.value,
    aiService: aiState.value,
    diagnostics: diagState.value
  };
};

const downloadFeedbackPack = () => {
  refresh();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadJson(`agent_feedback_${stamp}.json`, buildFeedbackPack());
};

const feedbackPreview = computed(() => {
  const diag = diagState.value;
  const items = Array.isArray(diag?.items) ? diag.items : [];
  const reqs = Array.isArray(diag?.aiRequests) ? diag.aiRequests : [];
  const approxBytes = (() => {
    try {
      return JSON.stringify(buildFeedbackPack()).length;
    } catch {
      return 0;
    }
  })();
  return {
    approxBytes,
    counts: {
      events: items.length,
      logs: items.filter((x: any) => String(x?.kind || '').startsWith('console_')).length,
      aiRequests: reqs.length
    },
    lastError: items.filter((x: any) => x?.level === 'error').slice(-1)[0] || null,
    lastAiError: reqs.filter((x: any) => x?.ok === false).slice(-1)[0] || null
  };
});

const exportFeedback = () => {
  downloadFeedbackPack();
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

const copyFeedbackSummary = async () => {
  const s = snapshot.value;
  const perf = s?.perf || {};
  const diag = diagState.value;
  const lastErr = (() => {
    const items = Array.isArray(diag?.items) ? diag.items : [];
    const e = items.filter((x: any) => x?.level === 'error').slice(-1)[0];
    if (!e) return '';
    const ts = typeof e.ts === 'number' ? new Date(e.ts).toISOString() : '';
    return `${ts} ${e.kind || 'error'} ${e.message || ''}`.trim();
  })();
  const summary = [
    `route=${s?.route || ''}`,
    `agentType=${s?.agent?.type || ''}`,
    `fps=${typeof perf?.fps === 'number' ? perf.fps.toFixed(1) : ''}`,
    `avgFrameMs=${typeof perf?.avgFrameMs === 'number' ? perf.avgFrameMs.toFixed(2) : ''}`,
    `aiTransport=${aiState.value?.transport || ''}`,
    lastErr ? `lastError=${lastErr}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  await copyText(summary);
};

const copyFeedbackPackJson = async () => {
  refresh();
  const payload = buildFeedbackPack();
  await copyText(pretty(payload));
};

let timer: number | null = null;
const restartTimer = () => {
  if (timer) window.clearInterval(timer);
  timer = null;
  if (!autoRefreshEnabled.value) return;
  const ms = Math.max(120, Math.min(60000, Number(refreshIntervalMs.value) || 800));
  timer = window.setInterval(() => {
    refresh();
  }, ms);
};
onMounted(() => {
  refresh();
  restartTimer();
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
  timer = null;
});

watch([autoRefreshEnabled, refreshIntervalMs], () => {
  restartTimer();
});
</script>

<style scoped>
.agent-debug-page {
  min-height: 100vh;
  background: #0b1220;
  color: #e2e8f0;
  padding: 18px;
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.title h1 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0.3px;
}

.sub {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.7);
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.panel {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  padding: 12px;
}

.wide {
  grid-column: 1 / -1;
}

.panel-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 10px;
  color: rgba(226, 232, 240, 0.95);
}

.panel-sub {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 8px;
  color: rgba(226, 232, 240, 0.85);
}

.kv {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.15);
}

.kv:last-child {
  border-bottom: none;
}

.k {
  color: rgba(226, 232, 240, 0.68);
  font-size: 12px;
}

.v {
  font-size: 12px;
  word-break: break-all;
}

.v.ok {
  color: rgba(34, 197, 94, 0.9);
}

.v.bad {
  color: rgba(248, 113, 113, 0.9);
}

.form-row {
  display: grid;
  grid-template-columns: 140px 1fr 72px;
  gap: 8px;
  align-items: center;
  margin: 8px 0;
}

.label {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.75);
}

.input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(2, 6, 23, 0.55);
  color: #e2e8f0;
  padding: 8px 10px;
  outline: none;
}

.input-sm {
  padding: 6px 8px;
  font-size: 11px;
}

.btn {
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.85);
  color: #e2e8f0;
  padding: 8px 10px;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.danger {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.12);
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.col {
  min-width: 0;
}

.pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(2, 6, 23, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  padding: 10px;
  font-size: 11px;
  line-height: 1.35;
  max-height: 420px;
  overflow: auto;
}

.pinned-agent {
  position: fixed;
  right: 10px;
  bottom: 10px;
  z-index: 9999;
}

@media (max-width: 920px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
