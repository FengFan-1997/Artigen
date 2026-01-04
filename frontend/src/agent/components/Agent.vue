<template>
  <div
    class="agent-container"
    :style="containerStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @mousedown="startDrag"
    @touchstart="startDrag"
    @click="handleClick($event)"
  >
    <Live2DWidget
      ref="live2dWidgetRef"
      v-show="agentType !== 'vrm' || !hasVrmSupport"
      :is-talking="isTalking"
      :is-moving="isMoving"
      :is-hovered="isHovered"
      :is-dizzy="isDizzy"
      :is-happy="isHappy"
      :is-confused="isConfused"
      :is-angry="isAngry"
      :is-fainted="isFainted"
      :is-pouting="isPouting"
      :is-head-hit="isHeadHit"
      :is-crying="isCrying"
      :is-tired="isTired"
      :expression-override="expressionOverride"
      :motion-command="effectiveMotionCommand"
      :message="message"
      :current-lang="currentLang"
      :init-enabled="live2dInitEnabled"
      @toggle-chat="toggleChat"
    />
    <VrmWidget
      v-if="hasVrmSupport"
      v-show="agentType === 'vrm'"
      :src="currentVrmSrc"
      :current-lang="currentLang"
      :is-talking="isTalking"
      :is-moving="isMoving"
      :is-hovered="isHovered"
      :is-dizzy="isDizzy"
      :is-happy="isHappy"
      :is-confused="isConfused"
      :is-angry="isAngry"
      :is-fainted="isFainted"
      :is-pouting="isPouting"
      :is-head-hit="isHeadHit"
      :is-crying="isCrying"
      :is-tired="isTired"
      :expression-override="expressionOverride"
      :motion-command="effectiveMotionCommand"
      :facing-lock="!isExecuting"
      :mouse-control-enabled="vrmMouseControlEnabled"
      :persona-text="getPersonaText()"
      @loading-change="vrmLoading = $event"
    />

    <div class="agent-controls">
      <button class="agent-pill" type="button" @click.stop="cycleAgentType">
        {{ agentTypeLabel }}
      </button>
      <template v-if="agentType === 'vrm' && hasVrmSupport && !isExecuting">
        <button
          class="agent-pill agent-pill-model"
          type="button"
          :disabled="!canCycleVrmModel"
          :class="{ open: vrmPickerOpen }"
          ref="vrmPickerButtonEl"
          @click.stop="vrmPickerOpen = !vrmPickerOpen"
          :title="currentVrmName"
        >
          <span v-if="vrmLoading || vrmListLoading" class="agent-pill-spinner"></span>
          <span class="agent-pill-badge" :style="currentVrmBadgeStyle">{{
            currentVrmBadgeText
          }}</span>
          <span class="agent-pill-model-name">{{ currentVrmName }}</span>
          <span v-if="vrmModelCounter" class="agent-pill-count">{{ vrmModelCounter }}</span>
          <span class="agent-pill-caret">▾</span>
        </button>
      </template>
      <transition name="agent-menu">
        <div
          v-if="vrmPickerOpen && agentType === 'vrm' && hasVrmSupport && !isExecuting"
          class="agent-menu"
          ref="vrmPickerEl"
          @mousedown.stop
          @click.stop
        >
          <div class="agent-menu-head">
            <button
              class="agent-menu-nav"
              type="button"
              :disabled="!canCycleVrmModel"
              @click.stop="prevVrmModel(false)"
            >
              ‹
            </button>
            <input
              v-model="vrmPickerQuery"
              class="agent-menu-search"
              type="text"
              :placeholder="currentLang === 'zh' ? '搜索模型…' : 'Search models…'"
              ref="vrmPickerSearchEl"
            />
            <button
              class="agent-menu-nav"
              type="button"
              :disabled="!canCycleVrmModel"
              @click.stop="nextVrmModel(false)"
            >
              ›
            </button>
            <button class="agent-menu-close" type="button" @click.stop="vrmPickerOpen = false">
              ×
            </button>
          </div>
          <div class="agent-menu-list">
            <div v-if="vrmListLoading" class="agent-menu-status">
              {{ currentLang === 'zh' ? '正在加载模型列表…' : 'Loading models…' }}
            </div>
            <div v-else-if="vrmListError" class="agent-menu-status agent-menu-status-error">
              <div class="agent-menu-status-title">
                {{ currentLang === 'zh' ? '模型列表加载失败' : 'Failed to load models' }}
              </div>
              <div class="agent-menu-status-msg">{{ vrmListError }}</div>
              <button
                class="agent-menu-status-action"
                type="button"
                :disabled="vrmListLoading"
                @click.stop="loadRemoteVrmModels()"
              >
                {{ currentLang === 'zh' ? '重试' : 'Retry' }}
              </button>
            </div>
            <button
              v-for="m in filteredVrmModels"
              :key="`${m.path}-${m.index}`"
              class="agent-menu-item"
              type="button"
              :class="{ active: m.index === vrmModelIndex }"
              @click.stop="selectVrmModel(m.index)"
              :title="m.name"
            >
              <span class="agent-menu-badge" :style="m.badgeStyle">{{ m.badgeText }}</span>
              <span class="agent-menu-name">{{ m.name }}</span>
              <span v-if="m.index === vrmModelIndex" class="agent-menu-check">✓</span>
            </button>
          </div>
        </div>
      </transition>
    </div>

    <div v-if="agentType === 'vrm' && hasVrmSupport" class="agent-side-tools">
      <button class="agent-side-btn" type="button" @click.stop="toggleChat" :title="chatTitle">
        💬
      </button>
      <button
        class="agent-side-btn"
        :class="{ active: vrmMouseControlEnabled }"
        type="button"
        @click.stop="vrmMouseControlEnabled = !vrmMouseControlEnabled"
        :title="vrmMouseControlTitle"
      >
        🖱️
      </button>
      <template v-if="!isExecuting">
        <button
          class="agent-side-btn"
          type="button"
          :disabled="vrmLoading || vrmListLoading"
          @click.stop="triggerSideMotion('wave')"
          :title="sideTitles.wave"
        >
          👋
        </button>
        <button
          class="agent-side-btn"
          type="button"
          :disabled="vrmLoading || vrmListLoading"
          @click.stop="triggerSideMotion('nod')"
          :title="sideTitles.nod"
        >
          ⤵︎
        </button>
        <button
          class="agent-side-btn"
          type="button"
          :disabled="vrmLoading || vrmListLoading"
          @click.stop="triggerSideMotion('shake_head')"
          :title="sideTitles.shakeHead"
        >
          ⇄
        </button>
        <button
          class="agent-side-btn"
          type="button"
          :disabled="vrmLoading || vrmListLoading"
          @click.stop="triggerSideMotion('stretch')"
          :title="sideTitles.stretch"
        >
          ⤢
        </button>
        <button
          class="agent-side-btn"
          type="button"
          :disabled="vrmLoading || vrmListLoading"
          @click.stop="triggerSideMotion('idle')"
          :title="sideTitles.reset"
        >
          ⟲
        </button>
      </template>
    </div>

    <Teleport to="body">
      <transition name="pop">
        <ChatWindow
          v-if="chatOpen"
          :messages="messages"
          :is-loading="isLoading"
          :placement="chatPlacement"
          :is-muted="isMuted"
          :agent-rect="{ x, y, width: AGENT_SIZE, height: AGENT_SIZE }"
          :current-lang="currentLang"
          @close="toggleChat"
          @send="handleSendMessage"
          @toggle-mute="isMuted = !isMuted"
          @activity="handleChatActivity"
          @mousedown.stop
          @touchstart.stop
          @click.stop
        />
      </transition>
    </Teleport>

    <TaskDisplay :plan="plan" :placement="taskPlacement" />

    <ConnectionLine v-if="guideTargetRect" :start="lineStart" :end="lineEnd" />

    <GuideOverlay
      :visible="!!guideTarget"
      :target-rect="guideTargetRect"
      :label="guideLabel"
      :agent-position="{ x: x, y: y }"
    />
  </div>
</template>

<script setup lang="ts">
// Agent Component
import {
  ref,
  computed,
  defineAsyncComponent,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick
} from 'vue';
import { useRouter } from 'vue-router';
import { useLanguageStore } from '../../stores/language';
import { storeToRefs } from 'pinia';
import ChatWindow from './ChatWindow.vue';
import { vrmRelativePaths, vrmPersonaTextByModelName } from 'virtual:vrm-models';
import GuideOverlay from './GuideOverlay.vue';
import TaskDisplay from './TaskDisplay.vue';
import ConnectionLine from './ConnectionLine.vue';
import { useTaskExecutor } from '../composables/useTaskExecutor';
import { useAuth } from '../composables/useAuth';
import { useLocalMemory } from '../composables/useLocalMemory';
import { useAgentContextBuilder } from '../composables/useAgentContextBuilder';
import { lerp, getRandomPosition } from '../utils/math';
import { resolveTarget } from '../utils/dom';
import { buildApiUrl, getUserId } from '../utils/user';
import {
  sendMessageToAI,
  getChatHistory,
  requestAgentReaction,
  cancelAiRequests
} from '../services/aiService';
import {
  buildInteractionMetrics,
  buildSemanticInteractionContext,
  buildInteractionSummary,
  computeRelativePoint,
  shouldAskAiForInteraction,
  type InteractionSample
} from '../utils/semanticEvents';
import { hitTestByRect } from '../utils/agentHitTest';
import {
  clearDiagnostics,
  getConsoleCaptureInfoEnabled,
  getDiagnosticsSnapshot,
  installConsoleDiagnostics,
  installGlobalDiagnostics,
  recordDiagnostic,
  setConsoleCaptureInfoEnabled,
  setDiagnosticsEnabled,
  setDiagnosticsMaxItems
} from '../utils/diagnostics';
import type { Position, ChatMessage } from '../types';
import type { AvatarPlanStep } from '../types/avatarPlan';

const Live2DWidget = defineAsyncComponent(() => import('./Live2DWidget.vue'));
const VrmWidget = defineAsyncComponent(() => import('./VrmWidget.vue'));

const router = useRouter();
const { initAuth, currentUser } = useAuth();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const props = defineProps<{
  isPinned?: boolean;
}>();

const isMobile = ref(window.innerWidth <= 768);
const BASE_AGENT_SIZE_MOBILE = 1000;
const BASE_AGENT_SIZE_DESKTOP = 1200;
const LIVE2D_AGENT_SCALE = 0.125;
const VRM_AGENT_SCALE = 0.34;
const dynamicScale = ref(1.0);
const moveTransitionMs = ref(3000);

const getDefaultAgentType = (): 'cubism3' | 'cubism2' | 'vrm' => 'vrm';

const agentType = ref<'cubism3' | 'cubism2' | 'vrm'>(getDefaultAgentType());

const agentBaseSize = computed(() => {
  if (!isMobile.value) return BASE_AGENT_SIZE_DESKTOP;
  return agentType.value === 'vrm' ? BASE_AGENT_SIZE_MOBILE * 0.9 : BASE_AGENT_SIZE_MOBILE * 0.6;
});
const agentScale = computed(() =>
  agentType.value === 'vrm' ? VRM_AGENT_SCALE : LIVE2D_AGENT_SCALE
);
const AGENT_SIZE = computed(() => agentBaseSize.value * agentScale.value * dynamicScale.value);

// --- State ---
const x = ref(20);
const y = ref(window.innerHeight - AGENT_SIZE.value - 20);
const targetX = ref(x.value);
const targetY = ref(y.value);

const clampAgentPosition = () => {
  const size = AGENT_SIZE.value;
  const maxX = Math.max(0, window.innerWidth - size);
  const maxY = Math.max(0, window.innerHeight - size);
  x.value = Math.min(maxX, Math.max(0, x.value));
  y.value = Math.min(maxY, Math.max(0, y.value));
};

watch(
  () => AGENT_SIZE.value,
  () => {
    if (props.isPinned) return;
    clampAgentPosition();
  },
  { flush: 'post' }
);

const isMoving = ref(false);
const isHovered = ref(false);
const isDizzy = ref(false);
const isHappy = ref(false);
const isConfused = ref(false);
const isTalking = ref(false);
const isAngry = ref(false);
const isFainted = ref(false);
const isPouting = ref(false);
const isHeadHit = ref(false);
const isCrying = ref(false);
const isTired = ref(false);
const isTeleporting = ref(false); // For immediate moves
const energy = ref(100);
const isMuted = ref(false);
const message = ref('Hello! I am Lumina!');
const motionCommand = ref(''); // New: Motion command from AI
const expressionOverride = ref('');
const vrmMouseControlEnabled = ref(false);
const live2dWidgetRef = ref<any>(null);
const vrmModelIndex = ref(0);
const vrmLoading = ref(false);
const vrmListLoading = ref(false);
const vrmListError = ref('');
const VRM_HF_OWNER = 'Feng1997';
const VRM_HF_REPO = 'ModelDoc';
const VRM_HF_REF = 'main';
const VRM_HF_PREFIX = 'model/Genshin/all';
const VRM_MODEL_PATH_KEY = 'agent_vrm_model_path_v1';
const DEFAULT_REMOTE_VRM_PATH = `${VRM_HF_PREFIX}/YaeMiko.vrm`;

const guessVrmNameFromPath = (p: string) => {
  const base = (p.split('/').pop() || p).replace(/\.vrm$/i, '');
  return base || 'Yae Miko';
};

const hashString = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const makeModelBadge = (rawName: string) => {
  const name = String(rawName || '').trim() || 'VRM';
  const hasCjk = /[\u4e00-\u9fff]/.test(name);
  const text = hasCjk
    ? name.replace(/\s+/g, '').slice(0, 2)
    : name
        .split(/[\s_-]+/g)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p.slice(0, 1).toUpperCase())
        .join('')
        .slice(0, 2) || name.slice(0, 2).toUpperCase();

  const hue = hashString(name) % 360;
  const bg = `hsl(${hue} 72% 42% / 0.95)`;
  const border = `hsl(${hue} 72% 58% / 0.55)`;
  return {
    badgeText: text,
    badgeStyle: {
      background: bg,
      borderColor: border
    } as Record<string, string>
  };
};

const getInitialRemoteVrmItems = () => {
  if (import.meta.env.DEV) return [];
  try {
    const storedPathRaw = localStorage.getItem(VRM_MODEL_PATH_KEY);
    const storedPath =
      typeof storedPathRaw === 'string' && storedPathRaw.trim() ? storedPathRaw : '';
    const path = storedPath || DEFAULT_REMOTE_VRM_PATH;
    return [{ name: guessVrmNameFromPath(path), path }];
  } catch {
    return [{ name: guessVrmNameFromPath(DEFAULT_REMOTE_VRM_PATH), path: DEFAULT_REMOTE_VRM_PATH }];
  }
};

const remoteVrmItems = ref<Array<{ name: string; path: string }>>(getInitialRemoteVrmItems());
const remoteVrmListLoaded = ref(false);
const live2dInitEnabled = ref(agentType.value !== 'vrm');
const vrmHasStartedLoading = ref(false);
const live2dDefaultsPreloaded = ref(false);
const vrmPickerOpen = ref(false);
const vrmPickerQuery = ref('');
const vrmPickerEl = ref<HTMLElement | null>(null);
const vrmPickerButtonEl = ref<HTMLElement | null>(null);
const vrmPickerSearchEl = ref<HTMLInputElement | null>(null);

watch(
  () => agentType.value,
  (next) => {
    if (next !== 'vrm') live2dInitEnabled.value = true;
  },
  { immediate: true }
);

const devVrmItems = computed(() => {
  const list = Array.isArray(vrmRelativePaths) ? vrmRelativePaths : [];
  return list.map((relative) => {
    const base = (relative.split('/').pop() || relative).replace(/\.vrm$/i, '');
    return { name: base, path: relative };
  });
});

const vrmModels = computed<Array<{ name: string; path: string }>>(() => {
  if (import.meta.env.DEV) return devVrmItems.value;
  return remoteVrmItems.value;
});

const hasVrmSupport = computed(() => vrmModels.value.length > 0);
const canCycleVrmModel = computed(() => {
  if (vrmLoading.value || vrmListLoading.value) return false;
  if (import.meta.env.DEV) return vrmModels.value.length > 1;
  if (!remoteVrmListLoaded.value) return true;
  return vrmModels.value.length > 1;
});

watch(
  () => hasVrmSupport.value,
  (next) => {
    if (!next && agentType.value === 'vrm') agentType.value = 'cubism3';
  },
  { immediate: true }
);

const currentVrmSrc = computed(() => {
  const item = vrmModels.value[vrmModelIndex.value];
  if (!item) return '';
  if (import.meta.env.DEV) {
    const abs = `${__DEV_VRM_BASE__}/${item.path}`;
    return encodeURI(`/@fs${abs}`);
  }
  const url = buildApiUrl(
    `/api/hf/${VRM_HF_OWNER}/${VRM_HF_REPO}/resolve/${VRM_HF_REF}/${item.path}`
  );
  return encodeURI(url);
});

const agentTypeLabel = computed(() => {
  if (agentType.value === 'vrm') return '3D';
  if (agentType.value === 'cubism3') return '2D C3';
  return '2D C2';
});

const chatTitle = computed(() => {
  const zh = currentLang.value === 'zh';
  if (chatOpen.value) return zh ? '关闭聊天' : 'Close chat';
  return zh ? '打开聊天' : 'Open chat';
});

const vrmMouseControlTitle = computed(() => {
  const zh = currentLang.value === 'zh';
  if (vrmMouseControlEnabled.value) return zh ? '关闭鼠标控制' : 'Disable mouse control';
  return zh ? '开启鼠标控制' : 'Enable mouse control';
});

const sideTitles = computed(() => {
  const zh = currentLang.value === 'zh';
  return {
    wave: zh ? '挥手' : 'Wave',
    nod: zh ? '点头' : 'Nod',
    shakeHead: zh ? '摇头' : 'Shake head',
    stretch: zh ? '伸懒腰' : 'Stretch',
    reset: zh ? '重置' : 'Reset'
  };
});

const currentVrmName = computed(() => {
  const item = vrmModels.value[vrmModelIndex.value];
  return item?.name || 'Yae Miko';
});

const currentVrmBadgeText = computed(() => makeModelBadge(currentVrmName.value).badgeText);
const currentVrmBadgeStyle = computed(() => makeModelBadge(currentVrmName.value).badgeStyle);

const filteredVrmModels = computed(() => {
  const q = vrmPickerQuery.value.trim().toLowerCase();
  const items = vrmModels.value.map((m, index) => {
    const badge = makeModelBadge(m?.name || '');
    return { ...m, index, ...badge };
  });
  if (!q) return items;
  return items.filter((m) =>
    String(m?.name || '')
      .toLowerCase()
      .includes(q)
  );
});

const vrmModelCounter = computed(() => {
  if (!import.meta.env.DEV && !remoteVrmListLoaded.value) return '1/…';
  const total = vrmModels.value.length;
  if (total <= 0) return '';
  const idx = Math.min(total, Math.max(1, vrmModelIndex.value + 1));
  return `${idx}/${total}`;
});

const effectiveMotionCommand = computed(() => motionCommand.value);

const VRM_MODEL_INDEX_KEY = 'agent_vrm_model_index_v1';
const loadVrmModelPath = () => {
  try {
    const raw = localStorage.getItem(VRM_MODEL_PATH_KEY);
    const v = typeof raw === 'string' ? raw.trim() : '';
    return v || null;
  } catch {
    return null;
  }
};

const loadVrmModelIndex = () => {
  const raw = localStorage.getItem(VRM_MODEL_INDEX_KEY);
  const v = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(v)) return null;
  if (v < 0 || v >= vrmModels.value.length) return null;
  return v;
};

const persistVrmSelection = () => {
  try {
    localStorage.setItem(VRM_MODEL_INDEX_KEY, String(vrmModelIndex.value));
    const item = vrmModels.value[vrmModelIndex.value];
    if (item?.path) localStorage.setItem(VRM_MODEL_PATH_KEY, item.path);
  } catch {}
};

const pickDefaultVrmModelIndex = () => {
  const list = vrmModels.value;
  if (list.length === 0) return 0;
  const preferred = list.findIndex((m) => /yae|miko|八重|神子/i.test(m.name));
  if (preferred >= 0) return preferred;
  const fallback = list.findIndex((m) => /keqing|刻晴/i.test(m.name));
  return fallback >= 0 ? fallback : 0;
};

const loadRemoteVrmModels = async () => {
  if (import.meta.env.DEV) return;
  if (vrmListLoading.value) return;
  vrmListLoading.value = true;
  vrmListError.value = '';
  try {
    const currentPath = vrmModels.value[vrmModelIndex.value]?.path || loadVrmModelPath() || '';
    const params = new URLSearchParams({
      ref: VRM_HF_REF,
      prefix: VRM_HF_PREFIX,
      ext: 'vrm'
    });
    const listUrl = buildApiUrl(`/api/hf-list/${VRM_HF_OWNER}/${VRM_HF_REPO}?${params.toString()}`);
    const res = await fetch(listUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    remoteVrmItems.value = items
      .filter((p: any) => typeof p === 'string' && p.toLowerCase().endsWith('.vrm'))
      .map((p: string) => {
        const base = (p.split('/').pop() || p).replace(/\.vrm$/i, '');
        return { name: base, path: p };
      });
    remoteVrmListLoaded.value = true;
    if (currentPath) {
      const idx = remoteVrmItems.value.findIndex((m) => m.path === currentPath);
      if (idx >= 0) vrmModelIndex.value = idx;
    }
  } catch (e: any) {
    vrmListError.value = typeof e?.message === 'string' ? e.message : String(e);
    remoteVrmListLoaded.value = false;
  } finally {
    vrmListLoading.value = false;
  }
};

watch(
  () => vrmModels.value.length,
  () => {
    if (vrmModels.value.length === 0) return;
    const storedPath = loadVrmModelPath();
    if (storedPath) {
      const idx = vrmModels.value.findIndex((m) => m.path === storedPath);
      if (idx >= 0) {
        vrmModelIndex.value = idx;
        return;
      }
    }
    const stored = loadVrmModelIndex();
    vrmModelIndex.value = stored ?? pickDefaultVrmModelIndex();
  },
  { immediate: true }
);

const ensureLive2dVersion = async (target: 2 | 3) => {
  const widget = live2dWidgetRef.value;
  if (!widget) return;
  const getVer = widget.getCurrentModelVersion as undefined | (() => 2 | 3 | null);
  const toggle = widget.toggleModelVersion as undefined | (() => Promise<void> | void);
  if (!getVer || !toggle) return;

  let cur = getVer();
  if (cur === target) return;

  for (let i = 0; i < 2; i++) {
    await toggle();
    await new Promise((r) => setTimeout(r, 80));
    cur = getVer();
    if (cur === target) return;
  }
};

const waitForLive2dLoaded = async (timeoutMs = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const widget = live2dWidgetRef.value;
    const getVer = widget?.getCurrentModelVersion as undefined | (() => 2 | 3 | null);
    const v = typeof getVer === 'function' ? getVer() : null;
    if (v === 2 || v === 3) return v;
    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
};

const preloadLive2dDefaultsOnce = async () => {
  if (import.meta.env.DEV) return;
  if (live2dDefaultsPreloaded.value) return;
  live2dInitEnabled.value = true;
  await nextTick();
  const loadedVer = await waitForLive2dLoaded(12000);
  if (!loadedVer) return;
  await ensureLive2dVersion(3);
  await waitForLive2dLoaded(8000);
  await ensureLive2dVersion(2);
  await waitForLive2dLoaded(8000);
  live2dDefaultsPreloaded.value = true;
};

watch(
  () => vrmLoading.value,
  (loading) => {
    if (import.meta.env.DEV) return;
    if (!hasVrmSupport.value) return;
    if (loading) {
      vrmHasStartedLoading.value = true;
      return;
    }
    if (!vrmHasStartedLoading.value) return;
    if (live2dDefaultsPreloaded.value) return;
    void preloadLive2dDefaultsOnce();
  },
  { immediate: true }
);

const cycleAgentType = async () => {
  const candidates: Array<'cubism3' | 'cubism2' | 'vrm'> = ['cubism3', 'cubism2'];
  if (hasVrmSupport.value) candidates.push('vrm');

  const idx = candidates.indexOf(agentType.value);
  const next = candidates[(idx + 1) % candidates.length] || candidates[0];
  agentType.value = next;
  await nextTick();

  if (agentType.value === 'cubism3') await ensureLive2dVersion(3);
  else if (agentType.value === 'cubism2') await ensureLive2dVersion(2);
};

const ensureRemoteVrmListLoaded = async () => {
  if (import.meta.env.DEV) return;
  if (remoteVrmListLoaded.value) return;
  await loadRemoteVrmModels();
};

const selectVrmModel = async (idx: number) => {
  await ensureRemoteVrmListLoaded();
  const list = vrmModels.value;
  if (list.length === 0) return;
  const next = Math.max(0, Math.min(idx, list.length - 1));
  if (next !== vrmModelIndex.value) {
    vrmModelIndex.value = next;
    persistVrmSelection();
  }
  vrmPickerOpen.value = false;
};

const prevVrmModel = async (closePicker = true) => {
  await ensureRemoteVrmListLoaded();
  const list = vrmModels.value;
  if (list.length <= 1) return;
  vrmModelIndex.value = (vrmModelIndex.value - 1 + list.length) % list.length;
  persistVrmSelection();
  if (closePicker) vrmPickerOpen.value = false;
};

const nextVrmModel = async (closePicker = true) => {
  await ensureRemoteVrmListLoaded();
  const list = vrmModels.value;
  if (list.length <= 1) return;
  vrmModelIndex.value = (vrmModelIndex.value + 1) % list.length;
  persistVrmSelection();
  if (closePicker) vrmPickerOpen.value = false;
};

watch(
  () => vrmPickerOpen.value,
  async (open) => {
    if (!open) return;
    await ensureRemoteVrmListLoaded();
    await nextTick();
    try {
      vrmPickerSearchEl.value?.focus();
      const active = vrmPickerEl.value?.querySelector(
        '.agent-menu-item.active'
      ) as HTMLElement | null;
      active?.scrollIntoView({ block: 'nearest' });
    } catch {}
  }
);

watch(
  () => live2dWidgetRef.value,
  (v) => {
    if (!v) return;
    if (agentType.value === 'cubism3') void ensureLive2dVersion(3);
    else if (agentType.value === 'cubism2') void ensureLive2dVersion(2);
  }
);

let expressionOverrideTimeout: number | null = null;
const setExpressionOverride = (exp: string, durationMs = 1800) => {
  const normalized = (exp || '').toLowerCase().trim();
  if (!normalized) return;
  expressionOverride.value = normalized;
  if (expressionOverrideTimeout) window.clearTimeout(expressionOverrideTimeout);
  expressionOverrideTimeout = window.setTimeout(
    () => {
      expressionOverride.value = '';
      expressionOverrideTimeout = null;
    },
    Math.max(200, durationMs)
  );
};

const interactionLockedUntil = ref(0);
const lockInteraction = (ms: number) => {
  const until = Date.now() + Math.max(0, ms);
  if (until > interactionLockedUntil.value) interactionLockedUntil.value = until;
};
const isInteractionLocked = () => Date.now() < interactionLockedUntil.value;

// Guide State
const guideTarget = ref<HTMLElement | null>(null);
const guideTargetRect = ref<DOMRect | null>(null);
const guideLabel = ref('');

// Computed for Connection Line
const lineStart = computed(() => ({
  x: x.value + AGENT_SIZE.value / 2,
  y: y.value + AGENT_SIZE.value / 2
}));

const lineEnd = computed(() => {
  if (!guideTargetRect.value) return { x: 0, y: 0 };
  return {
    x: guideTargetRect.value.left + guideTargetRect.value.width / 2,
    y: guideTargetRect.value.top + guideTargetRect.value.height / 2
  };
});

const taskPlacement = computed(() => (isMobile.value ? 'bottom' : 'left'));

// Drag State
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const dragStartPos = ref({ x: 0, y: 0 });
const hasDraggedSinceMouseDown = ref(false);

// Interaction State
const clickCount = ref(0);
const lastClickTime = ref(0);
const accumulatedAngle = ref(0);
const lastMouseAngle = ref(0);
const lastVelocity = ref({ x: 0, y: 0 });
const hasMouseMoved = ref(false);

// Chat State
const chatOpen = ref(false);
const messages = ref<ChatMessage[]>([{ role: 'agent', text: 'Hello! How can I help you today?' }]);
const isLoading = ref(false);
let chatAbortController: AbortController | null = null;
let chatRequestSeq = 0;
const MAX_UI_MESSAGES_KEY = 'agent_ui_max_messages';
const CHAT_AUTO_CLOSE_MS_KEY = 'agent_chat_auto_close_ms';
const CONSOLE_CAPTURE_INFO_KEY = 'agent_console_capture_info';
const readIntSetting = (key: string, fallback: number, min: number, max: number) => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  } catch {
    return fallback;
  }
};
const readFloatSetting = (key: string, fallback: number, min: number, max: number) => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? Number.parseFloat(raw) : Number.NaN;
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  } catch {
    return fallback;
  }
};
const readBoolSetting = (key: string, fallback: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
  } catch {
    return fallback;
  }
};
const maxUiMessages = ref(readIntSetting(MAX_UI_MESSAGES_KEY, 120, 20, 800));
const chatAutoCloseMs = ref(readIntSetting(CHAT_AUTO_CLOSE_MS_KEY, 5000, 0, 600000));
const lastChatActivityAt = ref(Date.now());
let chatAutoCloseTimer: number | null = null;

const pushUiMessage = (msg: ChatMessage) => {
  messages.value.push(msg);
  const maxKeep = Math.max(20, Number(maxUiMessages.value) || 120);
  if (messages.value.length > maxKeep) {
    messages.value = messages.value.slice(-maxKeep);
  }
};

const scheduleChatAutoClose = (delayMs = chatAutoCloseMs.value) => {
  if (chatAutoCloseTimer) window.clearTimeout(chatAutoCloseTimer);
  chatAutoCloseTimer = window.setTimeout(
    () => {
      chatAutoCloseTimer = null;
      if (!chatOpen.value) return;
      const idleForMs = Date.now() - lastChatActivityAt.value;
      const closeMs = Math.max(0, Number(chatAutoCloseMs.value) || 5000);
      if (idleForMs < closeMs) {
        scheduleChatAutoClose(closeMs - idleForMs);
        return;
      }
      if (isLoading.value) {
        scheduleChatAutoClose(1200);
        return;
      }
      closeChat();
    },
    Math.max(200, delayMs)
  );
};

const handleChatActivity = () => {
  lastChatActivityAt.value = Date.now();
  markUserActivity();
  if (chatOpen.value) scheduleChatAutoClose();
};

const extractFactsFromUserText = (raw: string) => {
  const text = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];
  const facts: string[] = [];

  const rememberMatch = text.match(
    /(?:^|[，。,.!！\n\r])(?:记住|记下|别忘了|不要忘)(?:我|我们)?(?:：|:)?\s*(.+)$/i
  );
  if (rememberMatch?.[1]) {
    const v = rememberMatch[1].trim().slice(0, 180);
    if (v) facts.push(v);
  }

  const nameZh = text.match(/(?:^|[，。,.!！\s])我叫\s*([^\s，。,.!！]{1,24})/);
  if (nameZh?.[1]) facts.push(`User name: ${nameZh[1].trim()}`);

  const nameEn = text.match(/\bmy name is\s+([a-z0-9 _'\-]{1,32})/i);
  if (nameEn?.[1]) facts.push(`User name: ${nameEn[1].trim()}`);

  const likeZh = text.match(/(?:^|[，。,.!！\s])我(喜欢|爱|讨厌|不喜欢)\s*([^，。,.!！]{1,40})/);
  if (likeZh?.[1] && likeZh?.[2]) {
    const verb = likeZh[1].trim();
    const obj = likeZh[2].trim();
    facts.push(`Preference: ${verb} ${obj}`);
  }

  const contactZh = text.match(
    /我的(邮箱|电话|手机号|微信|地址|生日|公司|学校|城市|住址|住在)(?:是|为|：|:)?\s*([^，。,.!！]{1,60})/i
  );
  if (contactZh?.[1] && contactZh?.[2]) {
    facts.push(`${contactZh[1].trim()}: ${contactZh[2].trim()}`);
  }

  return Array.from(new Set(facts.map((x) => x.replace(/\s+/g, ' ').trim()))).filter(Boolean);
};

const ALLOWED_MOTIONS = [
  'idle',
  'idle_look_around',
  'idle_think',
  'idle_adjust_clothes',
  'idle_arms_cross',
  'idle_hands_on_hips',
  'idle_stretch_neck',
  'idle_head_tilt',
  'idle_shrug',
  'idle_sigh',
  'idle_squat_think',
  'idle_fidget_hands',
  'idle_check_nails',
  'idle_tap_foot',
  'idle_rub_neck',
  'idle_breathe_deep',
  'idle_lean',
  'idle_touch_face',
  'idle_adjust_hair',
  'idle_hand_on_chin',
  'idle_rub_eyes',
  'idle_sway_body',
  'idle_stretch_arms_up',
  'idle_rotate_shoulders',
  'idle_wrist_roll',
  'idle_check_hand',
  'idle_bounce_knee',
  'tap_body',
  'flick_head',
  'head_hit',
  'crouch',
  'shake',
  'nod',
  'talking',
  'happy',
  'sad',
  'surprised',
  'activity',
  'friend',
  'mail',
  'morning',
  'afternoon',
  'evening',
  'point_left',
  'point_right',
  'wave',
  'tilt_left',
  'tilt_right',
  'step_forward',
  'step_back',
  'shake_head',
  'yawn',
  'play_hair',
  'stretch',
  'clap',
  'mood_happy',
  'mood_angry',
  'mood_tired',
  'mood_sleepy',
  'mood_confused'
] as const;

const normalizeMotionName = (raw: string | undefined): (typeof ALLOWED_MOTIONS)[number] | null => {
  const n = String(raw || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  if (!n) return null;
  let m = n;
  if (m === 'forward') m = 'step_forward';
  else if (m === 'backward') m = 'step_back';
  if ((ALLOWED_MOTIONS as readonly string[]).includes(m))
    return m as (typeof ALLOWED_MOTIONS)[number];

  if (/^(wave|hello|hi)\b/i.test(m) || m.includes('greet')) return 'wave';
  if (m.includes('head_hit') || m.includes('headhit') || (m.includes('hit') && m.includes('head')))
    return 'flick_head';
  if (m.includes('nod') || m.includes('agree') || m.includes('yes')) return 'nod';
  if (m.includes('shake_head') || (m.includes('shake') && m.includes('head')) || m.includes('no'))
    return 'shake_head';
  if (m.includes('shake') || m.includes('tremble')) return 'shake';
  if (m.includes('yawn') || m.includes('sleep')) return 'mood_sleepy';
  if (m.includes('crouch') || m.includes('squat')) return 'crouch';
  if (m.includes('tired') || m.includes('exhaust')) return 'mood_tired';
  if (m.includes('angry') || m.includes('mad')) return 'mood_angry';
  if (m.includes('happy') || m.includes('smile') || m.includes('joy')) return 'mood_happy';
  if (m.includes('confus') || m.includes('think') || m.includes('hmm')) return 'mood_confused';
  if (m.includes('point') && m.includes('left')) return 'point_left';
  if (m.includes('point') && m.includes('right')) return 'point_right';
  if (m.includes('point')) return Math.random() < 0.5 ? 'point_left' : 'point_right';
  if (m.includes('stretch')) return 'stretch';
  if (m.includes('clap')) return 'clap';
  if (m.includes('tap') || m.includes('poke')) return 'tap_body';

  return 'tap_body';
};

const ALLOWED_EXPRESSIONS = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'shy',
  'surprised',
  'dizzy',
  'confused'
] as const;

const { localMemory, memorySummary, memoryFacts, loadLocalMemory, pushMemoryItem, addMemoryFact } =
  useLocalMemory();

const getCharacterName = () => {
  const modelId = Number.parseInt(localStorage.getItem('modelId') || '0', 10) || 0;
  const perModel = localStorage.getItem(`agent_character_name_${modelId}`);
  if (perModel && perModel.trim()) return perModel.trim();
  const stored = localStorage.getItem('agent_character_name');
  if (stored && stored.trim()) return stored.trim();
  return 'Lumina';
};

const getRuntimeModelInfo = () => {
  try {
    const fn = live2dWidgetRef.value?.getCurrentModelInfo;
    if (typeof fn !== 'function') return null;
    return fn();
  } catch {
    return null;
  }
};

const normalizeVrmModelKey = (input: string) =>
  String(input || '')
    .toLowerCase()
    .replace(/\.vrm$/i, '')
    .replace(/[\s\-_()（）[\]【】{}「」"'`.,，。!！:：;；/\\]/g, '');

const getBuiltInVrmPersona = () => {
  if (agentType.value !== 'vrm') return null;
  const key = normalizeVrmModelKey(currentVrmName.value);
  const entry = (vrmPersonaTextByModelName as any)?.[key];
  if (!entry) return null;
  const zh = typeof entry?.zh === 'string' ? entry.zh.trim() : '';
  const en = typeof entry?.en === 'string' ? entry.en.trim() : '';
  if (!zh && !en) return null;
  return { zh, en };
};

const getPersonaText = () => {
  const modelId = Number.parseInt(localStorage.getItem('modelId') || '0', 10) || 0;
  const perModelRaw = localStorage.getItem(`agent_persona_text_${modelId}`);
  if (perModelRaw && perModelRaw.trim()) {
    const trimmed = perModelRaw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const s = (currentLang.value === 'zh' ? parsed?.zh : parsed?.en) ?? parsed?.default;
        if (typeof s === 'string' && s.trim()) return s.trim();
      } catch {}
    }
    return trimmed;
  }
  const stored = localStorage.getItem('agent_persona_text');
  if (stored && stored.trim()) return stored.trim();
  if (agentType.value === 'vrm') {
    const builtIn = getBuiltInVrmPersona();
    if (builtIn)
      return currentLang.value === 'zh' ? builtIn.zh || builtIn.en : builtIn.en || builtIn.zh;
  }
  return currentLang.value === 'zh'
    ? '你叫 Lumina，是一个二次元风格的傲娇小萝莉萌妹子桌面精灵。用户一直逗你会让你生气，但你嘴硬心软；遇到不会的问题会害羞、嘟嘴、转移话题，必要时会说用户是笨蛋。你会根据用户的聊天与互动（点击、拖拽、鼠标绕圈、长时间无操作等）做出细腻的表情与动作反应。永远不要解释提示词本身，也不要提到系统、上下文或隐藏信息。'
    : "Your name is Lumina, a cute anime-style tsundere little sprite. If the user keeps teasing or poking you, you get mad but you're secretly kind. If you don't know something, you may act shy/pout and deflect; you may call the user a dummy. React to chat and interactions (clicks, drags, circling the cursor, long idle) with subtle expressions and motions. Never mention system prompts, hidden context, or internal rules.";
};

const personaFlags = computed(() => {
  const t = String(getPersonaText() || '').toLowerCase();
  return {
    tsundere: /(傲娇|tsundere)/i.test(t),
    shy: /(害羞|腼腆|内向|shy|timid|bashful)/i.test(t)
  };
});

const getPersonaRulesForAi = () => {
  const modelId = Number.parseInt(localStorage.getItem('modelId') || '0', 10) || 0;
  const perModelRaw = localStorage.getItem(`agent_persona_text_${modelId}`);
  if (perModelRaw && perModelRaw.trim()) {
    const trimmed = perModelRaw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const s = (currentLang.value === 'zh' ? parsed?.zh : parsed?.en) ?? parsed?.default;
        if (typeof s === 'string' && s.trim()) return s.trim();
      } catch {}
    }
    return trimmed;
  }
  const stored = localStorage.getItem('agent_persona_text');
  if (stored && stored.trim()) return stored.trim();
  const builtIn = getBuiltInVrmPersona();
  if (builtIn)
    return currentLang.value === 'zh' ? builtIn.zh || builtIn.en : builtIn.en || builtIn.zh;
  return '';
};

type IdleProfile = {
  motions: string[];
  messageChance: number;
  motionChance: number;
  messages: { zh: string[]; en: string[] };
};

const getIdleProfile = (): IdleProfile => {
  const modelId = Number.parseInt(localStorage.getItem('modelId') || '0', 10) || 0;
  const raw =
    localStorage.getItem(`agent_idle_profile_${modelId}`) ||
    localStorage.getItem('agent_idle_profile');
  if (raw && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const motions = Array.isArray(parsed?.motions)
        ? parsed.motions
            .filter((m: any) => typeof m === 'string' && m.trim())
            .map((m: string) => m.trim())
        : null;
      const messagesZh = Array.isArray(parsed?.messages?.zh)
        ? parsed.messages.zh
            .filter((m: any) => typeof m === 'string' && m.trim())
            .map((m: string) => m.trim())
        : null;
      const messagesEn = Array.isArray(parsed?.messages?.en)
        ? parsed.messages.en
            .filter((m: any) => typeof m === 'string' && m.trim())
            .map((m: string) => m.trim())
        : null;
      if (motions && motions.length > 0 && messagesZh && messagesEn) {
        return {
          motions,
          messageChance:
            typeof parsed?.messageChance === 'number'
              ? Math.max(0, Math.min(1, parsed.messageChance))
              : 0.7,
          motionChance:
            typeof parsed?.motionChance === 'number'
              ? Math.max(0, Math.min(1, parsed.motionChance))
              : 0.7,
          messages: { zh: messagesZh, en: messagesEn }
        };
      }
    } catch {}
  }

  const persona = getPersonaText();
  const personaKey = persona.toLowerCase();
  const motions = ['idle', 'mail', 'morning', 'afternoon', 'evening'];

  if (/(困|疲|累|慵懒|嗜睡|sleepy|tired|lazy)/i.test(persona)) motions.push('yawn');
  if (/(辫子|头发|发丝|整理|hair|braid)/i.test(persona)) motions.push('play_hair');
  if (/(元气|活泼|开朗|energetic|cheerful|lively)/i.test(persona)) motions.push('wave', 'stretch');
  if (/(高冷|冷淡|沉默|quiet|cold)/i.test(persona)) motions.push('tilt_left', 'tilt_right');

  const extraMsgsZh: string[] = [];
  const extraMsgsEn: string[] = [];

  if (/(傲娇|tsundere)/i.test(personaKey)) {
    extraMsgsZh.push('才、才不是在等你！', '你终于想起我了？哼。');
    extraMsgsEn.push("I-I'm not waiting for you!", 'Finally noticed me? Hmph.');
  }
  if (/(温柔|治愈|gentle|soft)/i.test(personaKey)) {
    extraMsgsZh.push('要不要喝点水？', '累了就休息一下吧。');
    extraMsgsEn.push('Want some water?', 'Take a little break if you’re tired.');
  }
  if (/(高冷|冷淡|quiet|cold)/i.test(personaKey)) {
    extraMsgsZh.push('……', '别吵。');
    extraMsgsEn.push('…', 'Quiet.');
  }
  if (/(元气|活泼|energetic|cheerful|lively)/i.test(personaKey)) {
    extraMsgsZh.push('嘿！我在呢！', '要不要一起做点什么？');
    extraMsgsEn.push('Hey! I’m here!', 'Wanna do something together?');
  }
  if (/(困|疲|累|sleepy|tired|lazy)/i.test(personaKey)) {
    extraMsgsZh.push('哈——欠……', '我先眯一会儿…');
    extraMsgsEn.push('Yaaawn…', 'Let me rest a bit…');
  }
  if (/(辫子|头发|hair|braid)/i.test(personaKey)) {
    extraMsgsZh.push('我整理一下头发…', '别看啦，很奇怪吗？');
    extraMsgsEn.push('Let me fix my hair…', 'Don’t stare, is it weird?');
  }

  const messages = {
    zh: [...extraMsgsZh, ...idleMessages.zh],
    en: [...extraMsgsEn, ...idleMessages.en]
  };

  const isQuiet = /(高冷|冷淡|quiet|cold)/i.test(personaKey);
  return {
    motions,
    motionChance: isQuiet ? 0.55 : 0.75,
    messageChance: isQuiet ? 0.35 : 0.7,
    messages
  };
};

const { buildAgentContext } = useAgentContextBuilder({
  agentType,
  currentVrmName,
  currentLang,
  currentUser,
  localMemory,
  memorySummary,
  memoryFacts,
  energy,
  isMoving,
  isHovered,
  isDragging,
  isTalking,
  isAngry,
  isHappy,
  isPouting,
  isDizzy,
  isConfused,
  isTired,
  isFainted,
  isCrying,
  allowedMotions: ALLOWED_MOTIONS,
  allowedExpressions: ALLOWED_EXPRESSIONS,
  getRuntimeModelInfo,
  getCharacterName,
  getPersonaRulesForAi,
  normalizeVrmModelKey
});

const interactionState = ref({
  clicks: 0,
  accumulatedAngle: 0,
  startTime: Date.now()
});

const recordSystemEvent = (text: string, type = 'event') => {
  pushMemoryItem({ role: 'system', text, type });
  recordDiagnostic({
    kind: 'agent_system_event',
    level: type === 'error' ? 'error' : 'info',
    message: String(text || '').slice(0, 900),
    data: { type }
  });
};

// Task Executor
const { plan, isExecuting, setPlan, stopTask } = useTaskExecutor();

const TASK_SESSION_STORAGE_KEY = 'agent_task_session';
const taskSession = ref<{
  active: boolean;
  goal: string;
  autoContinueCount: number;
  lastContinueAt: number;
} | null>(null);
let lastChatUserText = '';
let taskContinueAbortController: AbortController | null = null;
const isTaskContinuing = ref(false);

const saveTaskSession = () => {
  try {
    if (taskSession.value)
      localStorage.setItem(TASK_SESSION_STORAGE_KEY, JSON.stringify(taskSession.value));
    else localStorage.removeItem(TASK_SESSION_STORAGE_KEY);
  } catch {}
};

const loadTaskSession = () => {
  try {
    const raw = localStorage.getItem(TASK_SESSION_STORAGE_KEY);
    if (!raw || !raw.trim()) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const goal = typeof parsed.goal === 'string' ? parsed.goal : '';
      taskSession.value = {
        active: !!parsed.active,
        goal,
        autoContinueCount:
          typeof parsed.autoContinueCount === 'number' ? parsed.autoContinueCount : 0,
        lastContinueAt: typeof parsed.lastContinueAt === 'number' ? parsed.lastContinueAt : 0
      };
    }
  } catch {}
};

// Eye Tracking State
const mouseX = ref(0);
const mouseY = ref(0);
const eyeOffset = ref<Position>({ x: 0, y: 0 });
const isFollowingMouse = ref(false);
const isLookAtOverride = ref(false);
const nowMs = ref(Date.now());
const lastUserActivityAt = ref(Date.now());
const markUserActivity = () => {
  lastUserActivityAt.value = Date.now();
};

const perfFrameMs = ref(0);
const perfAvgFrameMs = ref(0);
const perfFps = ref(0);
const perfLongFramesInWindow = ref(0);
const perfHeapUsedBytes = ref<number | null>(null);

// Dizziness Logic State
let dizzyTimeout: number | null = null;

const transientTimeouts: Record<string, number | null> = {};
const setTransient = (key: string, setter: (v: boolean) => void, activeMs: number) => {
  setter(true);
  const ms = Math.max(200, activeMs);
  if (transientTimeouts[key]) window.clearTimeout(transientTimeouts[key]!);
  transientTimeouts[key] = window.setTimeout(() => {
    setter(false);
    transientTimeouts[key] = null;
  }, ms);
};

const clearTransient = (key: string, setter: (v: boolean) => void) => {
  setter(false);
  if (transientTimeouts[key]) {
    window.clearTimeout(transientTimeouts[key]!);
    transientTimeouts[key] = null;
  }
};

const clearAiEmotions = () => {
  clearTransient('angry', (v) => (isAngry.value = v));
  clearTransient('happy', (v) => (isHappy.value = v));
  clearTransient('pouting', (v) => (isPouting.value = v));
  clearTransient('confused', (v) => (isConfused.value = v));
  clearTransient('crying', (v) => (isCrying.value = v));
  clearTransient('dizzy', (v) => (isDizzy.value = v));
  clearTransient('tired', (v) => (isTired.value = v));
  clearTransient('fainted', (v) => (isFainted.value = v));
};

// --- Config ---
const MOVE_INTERVAL_MS_KEY = 'agent_roam_interval_ms';
const IDLE_TALK_INTERVAL_MS_KEY = 'agent_idle_talk_interval_ms';
const LERP_FACTOR_KEY = 'agent_lerp_factor';
const MOUSE_FOLLOW_OFFSET_X_KEY = 'agent_mouse_follow_offset_x';
const MOUSE_FOLLOW_OFFSET_Y_KEY = 'agent_mouse_follow_offset_y';
const MAX_ENERGY_KEY = 'agent_max_energy';
const ENERGY_DECAY_RATE_KEY = 'agent_energy_decay_rate';
const ENERGY_RECOVER_RATE_KEY = 'agent_energy_recover_rate';
const TIRED_THRESHOLD_KEY = 'agent_tired_threshold';
const ROAM_ENABLED_KEY = 'agent_roam_enabled';
const IDLE_TALK_ENABLED_KEY = 'agent_idle_talk_enabled';
const IDLE_AI_ENABLED_KEY = 'agent_idle_ai_enabled';
const IDLE_AI_MIN_IDLE_MS_KEY = 'agent_idle_ai_min_idle_ms';
const IDLE_AI_COOLDOWN_MS_KEY = 'agent_idle_ai_cooldown_ms';
const IDLE_AI_CHANCE_KEY = 'agent_idle_ai_chance';

const roamEnabled = ref(readBoolSetting(ROAM_ENABLED_KEY, true));
const idleTalkEnabled = ref(readBoolSetting(IDLE_TALK_ENABLED_KEY, true));
const idleAiEnabled = ref(readBoolSetting(IDLE_AI_ENABLED_KEY, true));
const moveIntervalMs = ref(readIntSetting(MOVE_INTERVAL_MS_KEY, 60000, 5000, 600000));
const idleTalkIntervalMs = ref(readIntSetting(IDLE_TALK_INTERVAL_MS_KEY, 30000, 3000, 600000));
const lerpFactor = ref(readFloatSetting(LERP_FACTOR_KEY, 0.06, 0.01, 0.35));
const mouseFollowOffset = ref({
  x: readIntSetting(MOUSE_FOLLOW_OFFSET_X_KEY, 20, -300, 300),
  y: readIntSetting(MOUSE_FOLLOW_OFFSET_Y_KEY, 20, -300, 300)
});
const maxEnergy = ref(readIntSetting(MAX_ENERGY_KEY, 100, 10, 2000));
const energyDecayRate = ref(readFloatSetting(ENERGY_DECAY_RATE_KEY, 0.03, 0, 5));
const energyRecoverRate = ref(readFloatSetting(ENERGY_RECOVER_RATE_KEY, 0.02, 0, 5));
const tiredThreshold = ref(readIntSetting(TIRED_THRESHOLD_KEY, 20, 0, 2000));
const idleAiMinIdleMs = ref(readIntSetting(IDLE_AI_MIN_IDLE_MS_KEY, 65000, 3000, 600000));
const idleAiCooldownMs = ref(readIntSetting(IDLE_AI_COOLDOWN_MS_KEY, 120000, 0, 900000));
const idleAiChance = ref(readFloatSetting(IDLE_AI_CHANCE_KEY, 0.22, 0, 1));
const DRAG_MOVE_THRESHOLD = 5;

let lastTiredReactAt = 0;
watch(
  () => isTired.value,
  (v, prev) => {
    if (!v || prev) return;
    const now = Date.now();
    if (now - lastTiredReactAt < 8000) return;
    lastTiredReactAt = now;
    if (agentType.value !== 'vrm') return;
    const msg =
      currentLang.value === 'zh' ? '哈…好累…让我歇会儿…' : "Ugh... I'm tired... let me rest...";
    if (!message.value) message.value = msg;
    playMotionInternal('mood_tired', 2200);
    setTimeout(() => {
      if (message.value === msg) message.value = '';
    }, 3600);
  }
);

const idleMessages = {
  en: [
    'Hmph... you still there?',
    'I-I can help you, you know!',
    "Don't stare at me like that...",
    "Ask if you don't understand, dummy.",
    'I’m not bored, just... waiting for you.',
    'If you keep ignoring me, I’ll sulk!'
  ],
  zh: [
    '哼，你还在吗？',
    '有问题就问啊，笨蛋！',
    '别一直盯着我看啦...',
    '我才不是在等你说话呢！',
    '再不理我我就生气了！',
    '教不会你才不是因为我笨，是你！'
  ]
};

const containerStyle = computed(() => {
  if (props.isPinned) {
    return {
      transform: 'none',
      width: `${AGENT_SIZE.value}px`,
      height: `${AGENT_SIZE.value}px`,
      position: 'fixed' as const,
      bottom: '0',
      left: '0',
      zIndex: 9999,
      pointerEvents: 'auto' as const,
      overflow: 'visible'
    };
  }
  return {
    transform: `translate(${x.value}px, ${y.value}px)`,
    width: `${AGENT_SIZE.value}px`,
    height: `${AGENT_SIZE.value}px`,
    transition:
      isDragging.value || isTeleporting.value
        ? 'none'
        : isMoving.value
          ? `transform ${Math.max(120, Math.round(moveTransitionMs.value))}ms cubic-bezier(0.4, 0.0, 0.2, 1)`
          : 'transform 0.25s ease-out',
    zIndex: 9999,
    position: 'fixed' as const,
    top: 0,
    left: 0,
    pointerEvents: 'auto' as const,
    overflow: 'visible'
  };
});

// --- Helpers ---
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ExtractedJsonBlock = { raw: string; jsonText: string };

const extractJsonAfterLabel = (text: string, label: string): ExtractedJsonBlock | null => {
  const re = new RegExp(`${label}\\s*:\\s*`, 'i');
  const match = re.exec(text);
  if (!match || typeof match.index !== 'number') return null;

  let i = match.index + match[0].length;
  while (i < text.length && /\s/.test(text[i] || '')) i++;

  const first = text[i];
  if (first !== '{' && first !== '[') return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      const ok = (last === '{' && ch === '}') || (last === '[' && ch === ']');
      if (!ok) return null;
      stack.pop();
      if (stack.length === 0) {
        const jsonText = text.slice(i, j + 1);
        const raw = text.slice(match.index, j + 1);
        return { raw, jsonText };
      }
    }
  }

  return null;
};

const speak = (text: string) => {
  if (isMuted.value || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = currentLang.value === 'zh' ? 'zh-CN' : 'en-US';
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(
    (v) =>
      (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Huihui')) &&
      v.lang.startsWith(utterance.lang)
  );
  if (voice) utterance.voice = voice;
  utterance.pitch = 1.2;
  utterance.rate = 1.1;
  utterance.onstart = () => {
    isTalking.value = true;
  };
  utterance.onend = () => {
    isTalking.value = false;
  };
  utterance.onerror = () => {
    isTalking.value = false;
  };
  window.speechSynthesis.speak(utterance);
};

const playMotionInternal = (name: string, duration?: number) => {
  if (!name) return;
  const d = typeof duration === 'number' ? duration : 2000;
  motionCommand.value = name;
  setTimeout(() => {
    if (motionCommand.value === name) {
      motionCommand.value = '';
    }
  }, d);
};

const triggerSideMotion = (motion: (typeof ALLOWED_MOTIONS)[number]) => {
  const d = motion === 'idle' ? 900 : 1400;
  playMotionInternal(motion, d);
};

const applyExpression = (expression: string | undefined, duration: number) => {
  if (!expression) return;
  const exp = expression.toLowerCase();
  if (exp === 'angry') {
    setTransient('angry', (v) => (isAngry.value = v), duration);
  } else if (exp === 'happy') {
    setTransient('happy', (v) => (isHappy.value = v), duration);
  } else if (exp === 'shy' || exp === 'pout') {
    setTransient('pouting', (v) => (isPouting.value = v), duration);
  } else if (exp === 'confused' || exp === 'thinking') {
    setTransient('confused', (v) => (isConfused.value = v), duration);
  } else if (exp === 'sad' || exp === 'cry' || exp === 'crying') {
    setTransient('crying', (v) => (isCrying.value = v), duration);
  } else if (exp === 'dizzy') {
    setTransient('dizzy', (v) => (isDizzy.value = v), duration);
  } else if (exp === 'tired' || exp === 'sleepy') {
    setTransient('tired', (v) => (isTired.value = v), duration);
  } else if (exp === 'surprised' || exp === 'surprise') {
    setExpressionOverride('surprised', duration);
  }
};

const parsePosition = (val: number | string | undefined, current: number, max: number): number => {
  if (val === undefined) return current;
  if (typeof val === 'number') return val;
  if (val.endsWith('%')) {
    const p = parseFloat(val);
    return (p / 100) * max;
  }
  return parseFloat(val) || current;
};

const emit = defineEmits<{
  (e: 'toggle-chat'): void;
  (e: 'agent-event', payload: { name: string; payload?: any }): void;
}>();

// --- Avatar Plan Logic ---
type QueuedAvatarPlan = { steps: any[]; resolve: () => void };

const avatarPlanQueue: QueuedAvatarPlan[] = [];
let avatarPlanRunnerActive = false;

const clampNumber = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const safeJsonStringify = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
};

const normalizeExpressionName = (
  raw: unknown
): (typeof ALLOWED_EXPRESSIONS)[number] | undefined => {
  if (typeof raw !== 'string') return undefined;
  const n = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  if (!n) return undefined;
  const mapped = n === 'pout' || n === 'pouting' ? 'shy' : n;
  if ((ALLOWED_EXPRESSIONS as readonly string[]).includes(mapped))
    return mapped as (typeof ALLOWED_EXPRESSIONS)[number];
  return undefined;
};

const sanitizeAvatarPlanSteps = (rawSteps: any[]): AvatarPlanStep[] => {
  if (!Array.isArray(rawSteps)) return [];
  const result: AvatarPlanStep[] = [];
  const maxSteps = 12;

  for (const raw of rawSteps) {
    if (result.length >= maxSteps) break;
    if (!raw || typeof raw !== 'object') continue;
    const t = String((raw as any).type || '')
      .trim()
      .toLowerCase();
    const parallel = !!(raw as any).parallel;
    const rawDuration = (raw as any).duration;
    const duration = clampNumber(
      typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? rawDuration : 1200,
      120,
      12000
    );

    if (t === 'pose') {
      const motion = normalizeMotionName((raw as any).motion);
      const expression = normalizeExpressionName((raw as any).expression);
      if (motion) {
        result.push({
          type: 'pose',
          motion,
          expression,
          duration,
          parallel
        });
      } else if (expression) {
        result.push({
          type: 'expression',
          expression,
          duration,
          parallel
        });
      }
      continue;
    }

    if (t === 'motion') {
      const motion = normalizeMotionName((raw as any).motion);
      if (!motion) continue;
      result.push({
        type: 'motion',
        motion,
        duration,
        parallel
      });
      continue;
    }

    if (t === 'expression' || t === 'emotion') {
      const expression = normalizeExpressionName((raw as any).expression);
      if (!expression) continue;
      result.push({
        type: 'expression',
        expression,
        duration,
        parallel
      });
      continue;
    }

    if (t === 'speak') {
      const text = typeof (raw as any).text === 'string' ? (raw as any).text.trim() : '';
      if (!text) continue;
      const motion = normalizeMotionName((raw as any).motion) || undefined;
      const expression = normalizeExpressionName((raw as any).expression);
      const bubble = (raw as any).bubble !== false;
      result.push({
        type: 'speak',
        text: text.slice(0, 160),
        motion,
        expression,
        bubble,
        duration,
        parallel
      });
      continue;
    }

    if (t === 'bubble') {
      const text = typeof (raw as any).text === 'string' ? (raw as any).text.trim() : '';
      if (!text) continue;
      result.push({
        type: 'bubble',
        text: text.slice(0, 120),
        duration,
        parallel
      });
      continue;
    }

    if (t === 'look_at') {
      const x = clampNumber(
        typeof (raw as any).x === 'number' && Number.isFinite((raw as any).x) ? (raw as any).x : 0,
        -1,
        1
      );
      const y = clampNumber(
        typeof (raw as any).y === 'number' && Number.isFinite((raw as any).y) ? (raw as any).y : 0,
        -1,
        1
      );
      result.push({
        type: 'look_at',
        x,
        y,
        duration,
        parallel
      });
      continue;
    }

    if (t === 'wait') {
      result.push({ type: 'wait', duration, parallel });
      continue;
    }

    if (t === 'move') {
      const scaleRaw = (raw as any).scale;
      const scale =
        typeof scaleRaw === 'number' && Number.isFinite(scaleRaw)
          ? clampNumber(scaleRaw, 0.5, 2)
          : undefined;
      result.push({
        type: 'move',
        x: (raw as any).x,
        y: (raw as any).y,
        scale,
        immediate: !!(raw as any).immediate,
        duration,
        parallel
      });
      continue;
    }

    if (t === 'event') {
      const name =
        typeof (raw as any).name === 'string' ? (raw as any).name.trim().slice(0, 80) : '';
      if (!name) continue;
      result.push({
        type: 'event',
        name,
        payload: (raw as any).payload,
        duration: clampNumber(duration, 80, 1200),
        parallel
      });
      continue;
    }

    if (t === 'console') {
      const message =
        typeof (raw as any).message === 'string'
          ? (raw as any).message.trim().slice(0, 240)
          : safeJsonStringify((raw as any).message).slice(0, 240);
      result.push({
        type: 'console',
        message,
        duration: 0,
        parallel
      });
      continue;
    }
  }

  return result;
};

async function runAvatarPlanSteps(steps: any[]) {
  const safeSteps = sanitizeAvatarPlanSteps(steps);
  if (safeSteps.length === 0) return;

  const parallelPromises: Promise<unknown>[] = [];

  for (const step of safeSteps) {
    const executeStep = async () => {
      try {
        const t = step?.type;
        const duration = typeof step?.duration === 'number' ? step.duration : 1200;

        if (t === 'pose') {
          playMotionInternal(step.motion, duration);
          applyExpression(step.expression, duration);
          await delay(duration);
        } else if (t === 'motion') {
          playMotionInternal(step.motion, duration);
          await delay(duration);
        } else if (t === 'expression') {
          applyExpression(step.expression, duration);
          await delay(duration);
        } else if (t === 'speak') {
          if (step.bubble !== false) message.value = step.text;
          speak(step.text);
          if (typeof step.motion === 'string') playMotionInternal(step.motion, duration);
          applyExpression(step.expression, duration);
          await delay(duration);
        } else if (t === 'bubble') {
          message.value = step.text;
          await delay(duration);
        } else if (t === 'look_at') {
          isLookAtOverride.value = true;
          eyeOffset.value = { x: step.x, y: step.y };
          setTimeout(() => {
            isLookAtOverride.value = false;
          }, duration);
          await delay(duration);
        } else if (t === 'wait') {
          await delay(duration);
        } else if (t === 'move') {
          const maxX = window.innerWidth - AGENT_SIZE.value;
          const maxY = window.innerHeight - AGENT_SIZE.value;
          const rawX = parsePosition(step.x, x.value, maxX);
          const rawY = parsePosition(step.y, y.value, maxY);
          const targetXPos = clampNumber(rawX, -100, maxX + 100);
          const targetYPos = clampNumber(rawY, -50, maxY + 50);
          const targetScale =
            typeof step.scale === 'number' ? clampNumber(step.scale, 0.5, 2) : dynamicScale.value;
          const persona = getPersonaText();
          const isLazy = /(懒散|慵懒|懒|lazy|sleepy|tired)/i.test(persona);
          const moveFactor = isLazy ? 1.6 : 1;
          const tiredFactor = isTired.value ? 2.2 : 1;
          const actualDuration = Math.max(200, Math.round(duration * moveFactor * tiredFactor));
          moveTransitionMs.value = actualDuration;

          if (step.immediate) {
            isTeleporting.value = true;
            x.value = targetXPos;
            y.value = targetYPos;
            dynamicScale.value = targetScale;
            await nextTick();
            setTimeout(() => {
              isTeleporting.value = false;
            }, 50);
          } else {
            isMoving.value = true;
            x.value = targetXPos;
            y.value = targetYPos;
            dynamicScale.value = targetScale;
            if (agentType.value === 'vrm')
              playMotionInternal('activity', Math.min(2600, actualDuration));
            await delay(actualDuration);
            isMoving.value = false;
          }
        } else if (t === 'event') {
          emit('agent-event', { name: step.name, payload: step.payload });
          await delay(100);
        } else if (t === 'console') {
          console.log('[AvatarPlan]', step.message);
        } else {
          await delay(duration);
        }
      } catch (err) {
        console.error('Error executing step:', step, err);
      }
    };

    if (step?.parallel) {
      parallelPromises.push(executeStep());
    } else {
      await executeStep();
    }
  }

  if (parallelPromises.length > 0) {
    await Promise.all(parallelPromises.map((p) => p.catch(() => undefined)));
  }
}

const enqueueAvatarPlan = (steps: any[]): Promise<void> => {
  if (!steps || !Array.isArray(steps) || steps.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    avatarPlanQueue.push({ steps, resolve });
    void startAvatarPlanRunner();
  });
};

async function startAvatarPlanRunner() {
  if (avatarPlanRunnerActive) return;
  avatarPlanRunnerActive = true;
  try {
    while (avatarPlanQueue.length > 0) {
      const item = avatarPlanQueue.shift();
      if (!item) continue;
      await runAvatarPlanSteps(item.steps);
      item.resolve();
    }
  } finally {
    avatarPlanRunnerActive = false;
  }
}

const avatarAdapter = {
  playMotion: (name: string, duration?: number) => {
    playMotionInternal(name, duration);
  },
  setEmotion: (expression: string | undefined, duration?: number) => {
    const d = typeof duration === 'number' ? duration : 1200;
    applyExpression(expression, d);
  },
  runPlan: async (steps: any[]) => {
    await enqueueAvatarPlan(steps);
  }
};

// --- Event Handlers & Core Logic ---

const applyAiReply = async (
  rawResponse: string,
  options: {
    displayInChat: boolean;
    speakText?: boolean;
    defaultMessageFallback?: string;
    suppressMemorySave?: boolean;
  }
) => {
  let cleanResponse = rawResponse;

  motionCommand.value = '';
  clearAiEmotions();

  let parsedPlan: any[] | null = null;
  let parsedAvatarPlan: AvatarPlanStep[] | null = null;
  const queuedAvatarSteps: AvatarPlanStep[] = [];
  let hasExplicitMotion = false;
  let primaryEmotion: string | null = null;

  const lockMatch = rawResponse.match(/\[LOCK:\s*(\d+)\]/i);
  if (lockMatch) {
    const ms = Number.parseInt(lockMatch[1], 10);
    if (Number.isFinite(ms) && ms > 0) {
      lockInteraction(ms);
    }
    cleanResponse = cleanResponse.replace(lockMatch[0], '');
  }

  const exprInlineMatch = rawResponse.match(/\[EXPR:\s*([a-zA-Z0-9_\-]+)\]/);
  if (exprInlineMatch) {
    setExpressionOverride(exprInlineMatch[1], 1800);
    cleanResponse = cleanResponse.replace(exprInlineMatch[0], '');
  }

  const expressionTagMatch = rawResponse.match(/expressionTag:\s*("[^"]+"|\w+)/i);
  if (expressionTagMatch) {
    const rawVal = expressionTagMatch[1];
    const value = rawVal.startsWith('"')
      ? (() => {
          try {
            return JSON.parse(rawVal);
          } catch {
            return rawVal.replace(/"/g, '');
          }
        })()
      : rawVal;
    if (typeof value === 'string') setExpressionOverride(value, 1800);
    cleanResponse = cleanResponse.replace(expressionTagMatch[0], '');
  }

  const planExtract = extractJsonAfterLabel(cleanResponse, 'plan');
  if (planExtract) {
    try {
      const planJson = JSON.parse(planExtract.jsonText);
      if (Array.isArray(planJson)) parsedPlan = planJson;
    } catch (e) {
      console.error('Failed to parse task plan:', e);
    }
    cleanResponse = cleanResponse.replace(planExtract.raw, '');
  }

  const avatarPlanExtract = extractJsonAfterLabel(cleanResponse, 'avatarPlan');
  if (avatarPlanExtract) {
    try {
      const avatarPlanJson = JSON.parse(avatarPlanExtract.jsonText);
      if (Array.isArray(avatarPlanJson)) {
        parsedAvatarPlan = avatarPlanJson as AvatarPlanStep[];
        hasExplicitMotion =
          hasExplicitMotion ||
          parsedAvatarPlan.some(
            (s) => s?.type === 'motion' || s?.type === 'pose' || !!(s as any)?.motion
          );
      }
    } catch (e) {
      console.error('Failed to parse avatar plan:', e);
    }
    cleanResponse = cleanResponse.replace(avatarPlanExtract.raw, '');
  }

  const motionJsonExtract = extractJsonAfterLabel(cleanResponse, 'motionTag');
  if (motionJsonExtract) {
    try {
      const motions = JSON.parse(motionJsonExtract.jsonText);
      if (Array.isArray(motions) && motions.length > 0) {
        for (const m of motions) {
          if (!m || typeof m.name !== 'string') continue;
          const logicName = normalizeMotionName(m.name);
          if (!logicName) continue;
          const duration = typeof m.duration === 'number' ? m.duration : 900;
          const step: AvatarPlanStep = { type: 'motion', motion: logicName, duration };
          queuedAvatarSteps.push(step);
        }
        if (queuedAvatarSteps.length > 0) hasExplicitMotion = true;
      }
    } catch (e) {
      console.error('Failed to parse motionTag JSON:', e);
    }
    cleanResponse = cleanResponse.replace(motionJsonExtract.raw, '');
  }

  const motionCommandMatch = cleanResponse.match(/motionCommand\s*:\s*([^\n]+)/i);
  if (motionCommandMatch) {
    const motion = normalizeMotionName(motionCommandMatch[1]);
    if (motion) {
      const step: AvatarPlanStep = { type: 'motion', motion, duration: 1400 };
      queuedAvatarSteps.push(step);
      hasExplicitMotion = true;
    }
    cleanResponse = cleanResponse.replace(motionCommandMatch[0], '');
  }

  const emotionJsonExtract = extractJsonAfterLabel(cleanResponse, 'emotionTag');
  if (emotionJsonExtract) {
    try {
      const emotionJson = JSON.parse(emotionJsonExtract.jsonText);
      const primary = (emotionJson?.primary || '').toLowerCase().trim();
      const intensity = typeof emotionJson?.intensity === 'number' ? emotionJson.intensity : 0.6;
      const decay = Math.max(2000, Math.min(6000, 2000 + intensity * 4000));
      if (primary) {
        primaryEmotion = primary;
        applyExpression(primary, decay);
      }
    } catch (e) {
      console.error('Failed to parse emotionTag JSON:', e);
    }
    cleanResponse = cleanResponse.replace(emotionJsonExtract.raw, '');
  }

  if (
    rawResponse.includes('[ANGRY]') ||
    rawResponse.includes('Baka') ||
    rawResponse.includes('Hmph') ||
    rawResponse.includes('💢')
  ) {
    primaryEmotion = primaryEmotion || 'angry';
    applyExpression('angry', 4000);
    cleanResponse = cleanResponse.replace('[ANGRY]', '');
  }
  if (rawResponse.includes('[POUT]') || rawResponse.includes('[SHY]')) {
    primaryEmotion = primaryEmotion || 'shy';
    applyExpression('shy', 4000);
    cleanResponse = cleanResponse.replace('[POUT]', '').replace('[SHY]', '');
  }
  if (rawResponse.includes('[HAPPY]')) {
    primaryEmotion = primaryEmotion || 'happy';
    applyExpression('happy', 4000);
    cleanResponse = cleanResponse.replace('[HAPPY]', '');
  }
  if (rawResponse.includes('[DIZZY]')) {
    primaryEmotion = primaryEmotion || 'dizzy';
    applyExpression('dizzy', 4500);
    cleanResponse = cleanResponse.replace('[DIZZY]', '');
  }
  if (rawResponse.includes('[CRY]')) {
    primaryEmotion = primaryEmotion || 'sad';
    applyExpression('sad', 5000);
    cleanResponse = cleanResponse.replace('[CRY]', '');
  }
  if (rawResponse.includes('[CONFUSED]')) {
    primaryEmotion = primaryEmotion || 'confused';
    applyExpression('confused', 4000);
    cleanResponse = cleanResponse.replace('[CONFUSED]', '');
  }
  if (
    rawResponse.includes('[FAINT]') ||
    rawResponse.includes('[TIRED]') ||
    rawResponse.includes('[SLEEPY]')
  ) {
    setTransient('fainted', (v) => (isFainted.value = v), 5000);
    applyExpression('tired', 5000);
    primaryEmotion = primaryEmotion || 'tired';
    cleanResponse = cleanResponse
      .replace('[FAINT]', '')
      .replace('[TIRED]', '')
      .replace('[SLEEPY]', '');
  }

  const legacyMotionMatch = rawResponse.match(/\[MOTION:\s*([^\]]+?)\s*\]/);
  if (legacyMotionMatch) {
    const motion = normalizeMotionName(legacyMotionMatch[1]);
    if (motion) {
      const step: AvatarPlanStep = { type: 'motion', motion, duration: 2000 };
      queuedAvatarSteps.push(step);
      hasExplicitMotion = true;
    }
  }
  cleanResponse = cleanResponse.replace(/\[MOTION:\s*[^\]]+?\]/g, '');

  if (!hasExplicitMotion && primaryEmotion) {
    const isVrm = agentType.value === 'vrm';
    const m = (() => {
      if (isVrm) {
        if (primaryEmotion === 'angry') return 'mood_angry';
        if (primaryEmotion === 'happy') return 'mood_happy';
        if (primaryEmotion === 'shy') return 'friend';
        if (primaryEmotion === 'dizzy') return 'shake';
        if (primaryEmotion === 'tired') return 'mood_tired';
        if (primaryEmotion === 'sleepy') return 'mood_sleepy';
        if (primaryEmotion === 'confused' || primaryEmotion === 'thinking') return 'mood_confused';
        return null;
      }
      if (primaryEmotion === 'angry') return 'shake';
      if (primaryEmotion === 'happy') return 'happy';
      if (primaryEmotion === 'shy') return 'friend';
      if (primaryEmotion === 'dizzy') return 'shake';
      if (primaryEmotion === 'tired') return 'mood_tired';
      if (primaryEmotion === 'sleepy') return 'mood_sleepy';
      if (primaryEmotion === 'confused' || primaryEmotion === 'thinking') return 'tap_body';
      return null;
    })();
    if (m) {
      const step: AvatarPlanStep = { type: 'motion', motion: m, duration: 1200 };
      queuedAvatarSteps.push(step);
      hasExplicitMotion = true;
    }
  }

  const displayResponse = cleanResponse
    .replace(/highlight:\s*[^\n]+/g, '')
    .replace(/navigate:\s*[^\n]+/g, '')
    .replace(/click:\s*[^\n]+/g, '')
    .replace(/hover:\s*[^\n]+/g, '')
    .replace(/scroll:\s*[^\n]+/g, '')
    .replace(/input:\s*[^\n]+/g, '')
    .replace(/press:\s*[^\n]+/g, '')
    .replace(/emotionTag:\s*[^\n]+/gi, '')
    .replace(/expressionTag:\s*[^\n]+/gi, '')
    .replace(/motionTag:\s*[^\n]+/gi, '')
    .replace(/avatarPlan:\s*[^\n]+/gi, '')
    .replace(/plan:\s*\[[\s\S]*?\]/g, '')
    .trim();

  if (displayResponse) {
    if (options.displayInChat) {
      pushUiMessage({ role: 'agent', text: displayResponse });
    }
    if (!options.suppressMemorySave) pushMemoryItem({ role: 'agent', text: displayResponse });
    message.value = displayResponse;
    if (options.speakText !== false) speak(displayResponse);
  } else if (options.defaultMessageFallback) {
    if (options.displayInChat) {
      pushUiMessage({ role: 'agent', text: options.defaultMessageFallback });
    }
    if (!options.suppressMemorySave)
      pushMemoryItem({ role: 'agent', text: options.defaultMessageFallback });
    message.value = options.defaultMessageFallback;
    if (options.speakText !== false) speak(options.defaultMessageFallback);
  }

  if (parsedPlan) {
    try {
      const candidateGoal = (lastChatUserText || '').trim();
      const existingGoal = (taskSession.value?.goal || '').trim();
      const nextGoal = candidateGoal || existingGoal;
      taskSession.value = {
        active: true,
        goal: nextGoal,
        autoContinueCount:
          taskSession.value && existingGoal === nextGoal ? taskSession.value.autoContinueCount : 0,
        lastContinueAt: taskSession.value?.lastContinueAt || 0
      };
      saveTaskSession();

      console.log('Executing Plan:', parsedPlan);
      const result = await setPlan(parsedPlan);
      if (!result.success && taskSession.value) {
        taskSession.value.active = false;
        saveTaskSession();
      }
    } catch (e) {
      console.error('Failed to parse task plan:', e);
    }
  }

  if (parsedAvatarPlan && parsedAvatarPlan.length > 0) {
    void avatarAdapter.runPlan(parsedAvatarPlan);
  }
  if (queuedAvatarSteps.length > 0) {
    void avatarAdapter.runPlan(queuedAvatarSteps);
  }

  const response = rawResponse;

  // Guide Commands
  const guideMatch = response.match(/highlight:\s*([^\n]+)/);
  if (guideMatch) {
    const el = resolveTarget(guideMatch[1].trim());
    if (el) {
      guideTarget.value = el;
      guideTargetRect.value = el.getBoundingClientRect();
      guideLabel.value = 'Click here!';
      setTimeout(() => {
        guideTarget.value = null;
        guideTargetRect.value = null;
      }, 5000);
    }
  }

  const navMatch = response.match(/navigate:\s*([^\s\n]+)/);
  if (navMatch) router.push(navMatch[1].trim());

  const clickMatch = response.match(/click:\s*([^\n]+)/);
  if (clickMatch) {
    const el = resolveTarget(clickMatch[1].trim());
    if (el) {
      guideTarget.value = el;
      guideTargetRect.value = el.getBoundingClientRect();
      guideLabel.value = 'Clicking this!';
      setTimeout(() => {
        el.click();
        el.focus();
        setTimeout(() => {
          guideTarget.value = null;
          guideTargetRect.value = null;
        }, 1000);
      }, 500);
    }
  }

  const hoverMatch = response.match(/hover:\s*([^\n]+)/);
  if (hoverMatch) {
    const el = resolveTarget(hoverMatch[1].trim());
    if (el) {
      guideTarget.value = el;
      guideTargetRect.value = el.getBoundingClientRect();
      guideLabel.value = 'Hovering...';
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        setTimeout(() => {
          guideTarget.value = null;
          guideTargetRect.value = null;
        }, 1500);
      }, 500);
    }
  }

  const scrollMatch = response.match(/scroll:\s*([^\n]+)/);
  if (scrollMatch) {
    const target = scrollMatch[1].trim();
    if (target === 'down') window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
    else if (target === 'up') window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
    else if (target === 'bottom')
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    else if (target === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else {
      const el = resolveTarget(target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const inputMatch = response.match(/input:\s*([^|]+)\|\s*(.+)/);
  if (inputMatch) {
    const el = resolveTarget(inputMatch[1].trim()) as HTMLInputElement;
    if (el) {
      guideTarget.value = el;
      guideTargetRect.value = el.getBoundingClientRect();
      guideLabel.value = `Typing "${inputMatch[2].trim()}"...`;
      setTimeout(() => {
        el.value = inputMatch[2].trim();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        guideTarget.value = null;
      }, 1000);
    }
  }

  const pressMatch = response.match(/press:\s*([^\s]+)(?:\s+on\s+(.+))?/);
  if (pressMatch) {
    const key = pressMatch[1].trim();
    const selector = pressMatch[2]?.trim();
    let el = document.activeElement as HTMLElement;
    if (selector) {
      const found = resolveTarget(selector);
      if (found) el = found;
    }
    if (el) {
      guideTarget.value = el;
      guideTargetRect.value = el.getBoundingClientRect();
      guideLabel.value = `Pressing ${key}...`;
      el.focus();
      setTimeout(() => {
        const options = { key, code: key, bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new KeyboardEvent('keydown', options));
        el.dispatchEvent(new KeyboardEvent('keypress', options));
        el.dispatchEvent(new KeyboardEvent('keyup', options));
        setTimeout(() => {
          guideTarget.value = null;
          guideTargetRect.value = null;
        }, 1000);
      }, 500);
    }
  }
};

const isBackgroundReacting = ref(false);
let lastReactionAt = 0;
const backgroundReactCooldownMs = 4000;
type PendingReactionEvent = {
  text: string;
  type: string;
  trigger: string;
  ts: number;
  payload?: any;
};
let pendingBackgroundReactions: PendingReactionEvent[] = [];
let backgroundReactTimer: number | null = null;
let lastSystemRecordAt = 0;
let lastSystemRecordText = '';
let backgroundAbortController: AbortController | null = null;

const flushBackgroundReaction = async () => {
  if (pendingBackgroundReactions.length === 0) return;
  if (isBackgroundReacting.value) return;

  const now = Date.now();
  const waitMs = backgroundReactCooldownMs - (now - lastReactionAt);
  if (waitMs > 0) {
    if (backgroundReactTimer) window.clearTimeout(backgroundReactTimer);
    backgroundReactTimer = window.setTimeout(() => {
      backgroundReactTimer = null;
      void flushBackgroundReaction();
    }, waitMs);
    return;
  }

  const batch = pendingBackgroundReactions.slice(0, 6);
  pendingBackgroundReactions = pendingBackgroundReactions.slice(batch.length);
  const last = batch[batch.length - 1];
  const summaryLines = batch.map((e) => `- (${e.type}) ${e.text}`);
  const summary = `[System Event Batch]\n${summaryLines.join('\n')}\n\nRespond naturally as the character.`;
  lastReactionAt = Date.now();
  isBackgroundReacting.value = true;

  if (backgroundAbortController) {
    backgroundAbortController.abort();
  }
  backgroundAbortController = new AbortController();

  try {
    const agentContext: any = buildAgentContext({
      trigger: last?.trigger || 'system',
      systemEvent: summary,
      interactionEvents: batch
    });
    agentContext.mode = 'react';
    agentContext.suppressMemorySave = true;
    let rawResponse = '';
    try {
      rawResponse = await requestAgentReaction({
        message: summary,
        agentContext,
        signal: backgroundAbortController.signal,
        group: 'background'
      });
    } catch {
      return;
    }
    if (!rawResponse) return;
    const shouldSpeak = (() => {
      const t = String(last?.trigger || '')
        .trim()
        .toLowerCase();
      return t === 'task' || t === 'dom' || t === 'nav' || t === 'error';
    })();
    await applyAiReply(rawResponse, {
      displayInChat: false,
      speakText: shouldSpeak,
      suppressMemorySave: true
    });
  } finally {
    isBackgroundReacting.value = false;
    backgroundAbortController = null;
    if (pendingBackgroundReactions.length > 0) void flushBackgroundReaction();
  }
};

const reactToSystemEvent = (input: {
  text: string;
  type?: string;
  trigger?: string;
  payload?: any;
}) => {
  const text = (input.text || '').trim();
  if (!text) return;
  const type = (input.type || 'event').trim() || 'event';
  const trigger = (input.trigger || 'system').trim() || 'system';
  const payload = input.payload;

  const now = Date.now();
  const shouldRecord = text !== lastSystemRecordText || now - lastSystemRecordAt > 1500;
  if (shouldRecord) {
    recordSystemEvent(text, type);
    lastSystemRecordAt = now;
    lastSystemRecordText = text;
  }

  const lastQueued = pendingBackgroundReactions[pendingBackgroundReactions.length - 1];
  if (!lastQueued || lastQueued.text !== text || now - lastQueued.ts > 600) {
    pendingBackgroundReactions.push({ text, type, trigger, ts: now, payload });
  }
  if (pendingBackgroundReactions.length > 10) {
    pendingBackgroundReactions = pendingBackgroundReactions.slice(-10);
  }
  if (backgroundReactTimer) window.clearTimeout(backgroundReactTimer);
  backgroundReactTimer = window.setTimeout(() => {
    backgroundReactTimer = null;
    void flushBackgroundReaction();
  }, 250);
};

let domObserver: MutationObserver | null = null;
let domFlushTimer: number | null = null;
let lastDomSignalAt = 0;
let lastDomSignalText = '';
let pendingDomSignals: Array<{ text: string; type: 'dom' | 'error' }> = [];

const classifyDomSignal = (text: string): 'error' | 'success' | null => {
  const t = text.toLowerCase();
  if (/(错误|失败|异常|报错|无法|error|failed|exception|traceback|stack|500|404|403)/i.test(t))
    return 'error';
  if (/(成功|完成|已生成|生成成功|done|success|completed|saved)/i.test(t)) return 'success';
  return null;
};

const pushDomSignal = (text: string, type: 'dom' | 'error') => {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const now = Date.now();
  if (trimmed === lastDomSignalText && now - lastDomSignalAt < 1200) return;
  lastDomSignalAt = now;
  lastDomSignalText = trimmed;
  pendingDomSignals.push({ text: trimmed, type });
  if (pendingDomSignals.length > 8) pendingDomSignals = pendingDomSignals.slice(-8);
  if (domFlushTimer) window.clearTimeout(domFlushTimer);
  domFlushTimer = window.setTimeout(() => {
    domFlushTimer = null;
    const batch = pendingDomSignals;
    pendingDomSignals = [];
    const summary = batch
      .map((x) => x.text)
      .filter(Boolean)
      .slice(-4)
      .join('\n');
    if (!summary.trim()) return;
    const trigger = batch.some((x) => x.type === 'error') ? 'error' : 'dom';
    reactToSystemEvent({
      text: summary,
      type: trigger === 'error' ? 'dom_error' : 'dom_signal',
      trigger
    });
    if (taskSession.value?.active) {
      const reason = trigger === 'error' ? 'failed' : 'completed';
      window.setTimeout(
        () => {
          void requestNextTaskChunk(reason);
        },
        trigger === 'error' ? 900 : 1200
      );
    }
  }, 350);
};

const startDomObserver = () => {
  if (typeof MutationObserver === 'undefined') return;
  if (domObserver) return;

  const scanNode = (node: Node): string[] => {
    const results: string[] = [];
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').trim();
      if (t) results.push(t);
      return results;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return results;
    const el = node as HTMLElement;

    const role = (el.getAttribute('role') || '').toLowerCase();
    const ariaLive = (el.getAttribute('aria-live') || '').toLowerCase();
    const className = typeof el.className === 'string' ? el.className : '';
    const isSignalContainer =
      role === 'alert' ||
      ariaLive === 'polite' ||
      ariaLive === 'assertive' ||
      /(toast|notification|notify|alert|error|success|snackbar|message)/i.test(className);

    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text && text.length <= 240) {
      const kind = classifyDomSignal(text);
      if (kind === 'error')
        results.push(
          currentLang.value === 'zh' ? `页面提示错误：${text}` : `Page shows an error: ${text}`
        );
      else if (kind === 'success')
        results.push(
          currentLang.value === 'zh' ? `页面提示成功：${text}` : `Page shows success: ${text}`
        );
      else if (isSignalContainer && text.length <= 120)
        results.push(currentLang.value === 'zh' ? `页面提示：${text}` : `Page message: ${text}`);
    }

    if (el.children && el.children.length > 0 && el.children.length <= 12) {
      for (const child of Array.from(el.children)) results.push(...scanNode(child));
    }
    return results;
  };

  domObserver = new MutationObserver((mutations) => {
    const collected: string[] = [];
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const n of Array.from(m.addedNodes)) collected.push(...scanNode(n));
      } else if (m.type === 'characterData') {
        if (m.target) collected.push(...scanNode(m.target));
      } else if (m.type === 'attributes') {
        if (m.target) collected.push(...scanNode(m.target));
      }
    }

    const uniq = Array.from(new Set(collected.map((t) => t.trim()).filter(Boolean))).slice(0, 6);
    if (uniq.length === 0) return;
    const summary = uniq.join('\n');
    const kind = classifyDomSignal(summary);
    if (kind === 'error') pushDomSignal(summary, 'error');
    else if (kind === 'success') pushDomSignal(summary, 'dom');
    else pushDomSignal(summary, 'dom');
  });

  domObserver.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-live', 'role']
  });
};

const stopDomObserver = () => {
  if (domObserver) {
    try {
      domObserver.disconnect();
    } catch {}
    domObserver = null;
  }
  if (domFlushTimer) window.clearTimeout(domFlushTimer);
  domFlushTimer = null;
  pendingDomSignals = [];
};

const requestNextTaskChunk = async (reason: 'completed' | 'failed' | 'manual') => {
  if (isTaskContinuing.value) return;
  if (isLoading.value || isBackgroundReacting.value) return;
  if (isExecuting.value) return;
  const session = taskSession.value;
  if (!session?.active) return;

  const now = Date.now();
  if (now - (session.lastContinueAt || 0) < 2500) return;
  if (session.autoContinueCount >= 6 && reason !== 'manual') return;

  session.lastContinueAt = now;
  session.autoContinueCount = Math.max(0, session.autoContinueCount) + 1;
  saveTaskSession();

  if (taskContinueAbortController) {
    try {
      taskContinueAbortController.abort();
    } catch {}
  }
  taskContinueAbortController = new AbortController();
  isTaskContinuing.value = true;

  try {
    const goal = (session.goal || '').trim();
    const routePath = router.currentRoute.value?.fullPath || window.location.pathname;
    const prompt =
      currentLang.value === 'zh'
        ? `[TaskContinue]: 继续任务。\n原因: ${reason}\n目标: ${goal || '（未提供）'}\n当前路由: ${routePath}\n\n要求：\n1) 如果需要继续操作页面：输出 plan: 后面跟严格 JSON 数组（1–8 步），每步包含 {\"type\":\"click|input|hover|scroll|press|wait|navigate\",\"target\":string,\"value\"?:string|number}。\n2) 不管是否继续操作，都必须输出 avatarPlan: 后面跟严格 JSON 数组（1–4 步），用于你的旁白/动作/表情。\n3) 如果任务已完成：不要输出 plan，只输出一句很短的完成确认 + avatarPlan。`
        : `[TaskContinue]: Continue the task.\nReason: ${reason}\nGoal: ${goal || '(not provided)'}\nRoute: ${routePath}\n\nRules:\n1) If you need to keep operating the page: output \"plan:\" followed by a strict JSON array (1–8 steps), each step has {\"type\":\"click|input|hover|scroll|press|wait|navigate\",\"target\":string,\"value\"?:string|number}.\n2) Always output \"avatarPlan:\" followed by a strict JSON array (1–4 steps) for narration/motion/expression.\n3) If the task is done: do NOT output plan; just a very short done confirmation + avatarPlan.`;
    const agentContext: any = buildAgentContext({
      trigger: 'task',
      systemEvent: prompt,
      userText: goal
    });
    agentContext.suppressMemorySave = true;
    let rawResponse = '';
    try {
      rawResponse = await sendMessageToAI(prompt, messages.value, agentContext, {
        signal: taskContinueAbortController.signal,
        group: 'task'
      });
    } catch {
      return;
    }
    if (!rawResponse) {
      session.active = false;
      saveTaskSession();
      return;
    }
    await applyAiReply(rawResponse, {
      displayInChat: false,
      speakText: true,
      suppressMemorySave: true
    });

    const hasPlan = /\bplan\s*:\s*\[/i.test(rawResponse);
    if (!hasPlan && reason !== 'manual') {
      session.active = false;
      saveTaskSession();
    }
  } finally {
    isTaskContinuing.value = false;
  }
};

async function handleSendMessage(text: string) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  lastChatUserText = trimmed;
  handleChatActivity();
  for (const fact of extractFactsFromUserText(trimmed)) addMemoryFact(fact);
  pushUiMessage({ role: 'user', text: trimmed });
  pushMemoryItem({ role: 'user', text: trimmed });
  isLoading.value = true;
  message.value = 'Hmm...';

  const isCancelTask = (() => {
    const zh = currentLang.value === 'zh';
    const re = zh ? /(取消|停止|结束任务|别做了|停下)/i : /(cancel|stop task|stop doing|abort)/i;
    return re.test(trimmed);
  })();
  if (isCancelTask) {
    if (plan.value?.status === 'running') stopTask();
    if (taskSession.value) taskSession.value.active = false;
    saveTaskSession();
    isLoading.value = false;
    const msg = currentLang.value === 'zh' ? '好，我先停下。' : "Okay, I'll stop.";
    message.value = msg;
    pushUiMessage({ role: 'agent', text: msg });
    speak(msg);
    return;
  }

  const isHurryRequest = (() => {
    const zh = currentLang.value === 'zh';
    const re = zh
      ? /(快点|快一点|快些|赶快|加快|速度|快啊)/i
      : /(hurry|faster|speed up|quick|go faster)/i;
    return re.test(trimmed);
  })();
  if (isHurryRequest && agentType.value === 'vrm' && !isExecuting.value) {
    const persona = getPersonaText();
    const isLazyOrTsundere = /(懒散|慵懒|lazy|sleepy|tired|傲娇|tsundere)/i.test(persona);
    if (isLazyOrTsundere) {
      const msg =
        currentLang.value === 'zh' ? 'baka！这已经很快啦！' : "Baka! I'm already going fast!";
      setTransient('pouting', (v) => (isPouting.value = v), 1800);
      playMotionInternal('shake_head', 1200);
      if (!message.value || message.value === 'Hmm...') message.value = msg;
      recordSystemEvent('[System Event: User asked you to hurry.]', 'hurry');
      setTimeout(() => {
        if (!isTalking.value && message.value === msg) message.value = '';
      }, 1600);
    }
  }

  chatAbortController?.abort();
  chatAbortController = new AbortController();

  if (backgroundAbortController) {
    backgroundAbortController.abort();
    backgroundAbortController = null;
  }

  const requestSeq = (chatRequestSeq += 1);

  try {
    const agentContext = buildAgentContext({ trigger: 'chat', userText: trimmed });
    const rawResponse = await sendMessageToAI(trimmed, messages.value, agentContext, {
      signal: chatAbortController.signal,
      group: 'chat'
    });
    if (requestSeq !== chatRequestSeq) return;
    isLoading.value = false;

    await applyAiReply(rawResponse, {
      displayInChat: true,
      speakText: true,
      defaultMessageFallback: "I'm on it!"
    });
  } finally {
    if (requestSeq === chatRequestSeq) {
      isLoading.value = false;
    }
  }
}

const triggerDizzy = () => {
  if (isDizzy.value || isFainted.value) return;
  isDizzy.value = true;
  message.value = "Whoa! I'm dizzy... @.@";
  playMotionInternal('shake', 3000);
  recordSystemEvent(
    '[System Event: User made you dizzy by circling the mouse around you.]',
    'dizzy'
  );
  if (dizzyTimeout) clearTimeout(dizzyTimeout);
  dizzyTimeout = window.setTimeout(() => {
    isDizzy.value = false;
    isConfused.value = true;
    message.value = 'Ugh... where am I?';
    setTimeout(() => {
      isConfused.value = false;
      message.value = "Don't spin me like that! >_<";
      setTimeout(() => (message.value = ''), 2000);
    }, 2000);
  }, 3000);
};

const triggerHeadHit = () => {
  if (isHeadHit.value || isFainted.value) return;
  isHeadHit.value = true;
  message.value = 'Ouch! My head! >_<';
  playMotionInternal('flick_head', 1100);
  isMoving.value = false;
  setTimeout(() => {
    isHeadHit.value = false;
    if (message.value === 'Ouch! My head! >_<') message.value = '';
  }, 2000);
};

let interactionHasPending = false;
let interactionLastEventAt = 0;
const markInteractionActivity = () => {
  interactionHasPending = true;
  interactionLastEventAt = Date.now();
  markUserActivity();
};

const interactionSamples = ref<InteractionSample[]>([]);
let lastInteractionSample: { ts: number; x: number; y: number } | null = null;
let lastInteractionSampleAt = 0;
let lastHitTestAt = 0;

const pushInteractionSample = (input: {
  ts: number;
  x: number;
  y: number;
  hitAreas?: string[];
}) => {
  const ts = input.ts;
  const dx = lastInteractionSample ? input.x - lastInteractionSample.x : 0;
  const dy = lastInteractionSample ? input.y - lastInteractionSample.y : 0;
  const dt = lastInteractionSample ? Math.max(1, ts - lastInteractionSample.ts) : 1;
  const speed = Math.sqrt(dx * dx + dy * dy) / dt;
  const { relX, relY } = computeRelativePoint(x.value, y.value, AGENT_SIZE.value, input.x, input.y);
  interactionSamples.value.push({
    ts,
    x: input.x,
    y: input.y,
    speed,
    relX,
    relY,
    hitAreas: input.hitAreas
  });
  if (interactionSamples.value.length > 180) {
    interactionSamples.value = interactionSamples.value.slice(-180);
  }
  lastInteractionSample = { ts, x: input.x, y: input.y };
};

function processInteraction() {
  if (isFainted.value || isAngry.value || isDizzy.value) {
    resetInteractionState();
    return;
  }
  const { clicks, accumulatedAngle } = interactionState.value;
  if (clicks === 1 && Math.abs(accumulatedAngle) < 360) {
    resetInteractionState();
    return;
  }
  if (clicks === 0 && Math.abs(accumulatedAngle) < 360) return;

  const absAngle = Math.abs(accumulatedAngle);
  if (clicks > 0 || absAngle > 0) {
    if (absAngle >= 220) {
      setTransient('confused', (v) => (isConfused.value = v), 2600);
      playMotionInternal(accumulatedAngle >= 0 ? 'tilt_right' : 'tilt_left', 1400);
      message.value =
        currentLang.value === 'zh'
          ? personaFlags.value.tsundere
            ? '喂！别转了啦……我、我才没晕呢！'
            : '你在转圈圈吗……我有点晕。'
          : personaFlags.value.tsundere
            ? "Hey! Stop spinning... I-I'm not dizzy!"
            : 'Are you spinning around me…? I feel a bit dizzy.';
    } else if (clicks >= 3) {
      setTransient('pouting', (v) => (isPouting.value = v), 2200);
      playMotionInternal('shake', 1400);
      message.value =
        currentLang.value === 'zh'
          ? personaFlags.value.tsundere
            ? '哼！别戳啦！有事就说！'
            : '别闹啦……有话好好说！'
          : personaFlags.value.tsundere
            ? 'Hmph! Stop poking me. Just say it!'
            : 'Hey, stop poking… just talk to me!';
    } else if (clicks === 2) {
      playMotionInternal('tap_body', 1000);
      message.value =
        currentLang.value === 'zh'
          ? personaFlags.value.tsundere
            ? '哼…干嘛。'
            : '嗯？怎么啦？'
          : personaFlags.value.tsundere
            ? 'Hmph... what?'
            : 'Hm? What is it?';
    }
  }

  const metrics = buildInteractionMetrics({
    samples: interactionSamples.value,
    clickCount: clicks,
    spinDegrees: accumulatedAngle
  });
  const lang = currentLang.value === 'zh' ? 'zh' : 'en';
  const desc = buildInteractionSummary(metrics, lang);
  const shouldAskAi = shouldAskAiForInteraction(metrics);
  if (shouldAskAi)
    void reactToSystemEvent({
      text: desc,
      type: 'interaction_session',
      trigger: 'interaction',
      payload: { metrics, semantic: buildSemanticInteractionContext(metrics) }
    });
  resetInteractionState();
}

function resetInteractionState() {
  interactionState.value = { clicks: 0, accumulatedAngle: 0, startTime: Date.now() };
  accumulatedAngle.value = 0;
  interactionSamples.value = [];
  lastInteractionSample = null;
  lastInteractionSampleAt = 0;
}

function openChat() {
  if (chatOpen.value) return;
  chatOpen.value = true;
  lastChatActivityAt.value = Date.now();
  markUserActivity();
  scheduleChatAutoClose();
  if (isMobile.value) {
    const size = AGENT_SIZE.value;
    x.value = (window.innerWidth - size) / 2;
    y.value = 40;
  }
  message.value = '';
}

function closeChat() {
  if (!chatOpen.value) return;
  chatOpen.value = false;
  if (chatAutoCloseTimer) {
    window.clearTimeout(chatAutoCloseTimer);
    chatAutoCloseTimer = null;
  }
  if (isLoading.value) {
    try {
      chatAbortController?.abort();
    } catch {}
    chatAbortController = null;
    cancelAiRequests('chat');
    isLoading.value = false;
  }
}

const toggleChat = () => {
  if (chatOpen.value) closeChat();
  else openChat();
};

watch(
  () => chatOpen.value,
  (open) => {
    if (open) isFollowingMouse.value = false;
    else if (isHovered.value && !props.isPinned) isFollowingMouse.value = true;
  }
);

const handleClick = (event: MouseEvent) => {
  if (isInteractionLocked()) return;
  if (hasDraggedSinceMouseDown.value) {
    hasDraggedSinceMouseDown.value = false;
    return;
  }

  const hitAreas =
    agentType.value === 'vrm'
      ? hitTestByRect(
          { left: x.value, top: y.value, width: AGENT_SIZE.value, height: AGENT_SIZE.value },
          event.clientX,
          event.clientY
        )
      : live2dWidgetRef.value?.hitTest(event.clientX, event.clientY) || [];
  const normalizedHitAreas = hitAreas.map((h: string) => h.toLowerCase());
  const nowTs = Date.now();
  lastHitTestAt = nowTs;
  pushInteractionSample({ ts: nowTs, x: event.clientX, y: event.clientY, hitAreas });

  let isHead =
    normalizedHitAreas.includes('head') ||
    normalizedHitAreas.includes('face') ||
    normalizedHitAreas.includes('hair');
  const isBody =
    normalizedHitAreas.includes('body') ||
    normalizedHitAreas.includes('chest') ||
    normalizedHitAreas.includes('breast') ||
    normalizedHitAreas.includes('bust') ||
    normalizedHitAreas.includes('torso');

  if (!isHead && hitAreas.length === 0) {
    const relativeY = event.clientY - y.value;
    isHead = relativeY >= 0 && relativeY <= AGENT_SIZE.value * 0.3;
  }

  if (isHead) {
    isHappy.value = true;
    isFainted.value = false;
    isAngry.value = false;
    isTired.value = false;
    energy.value = Math.min(Math.max(1, Number(maxEnergy.value) || 100), energy.value + 20);
    if (personaFlags.value.tsundere) message.value = '别、别摸啦……我又不是小孩子！';
    else if (personaFlags.value.shy) message.value = '呜…别突然摸头啦…我会害羞的…';
    else message.value = '摸摸头就有精神了~';
    playMotionInternal('flick_head', 3000);
    setTimeout(() => {
      isHappy.value = false;
      if (
        message.value === '摸摸头就有精神了~' ||
        message.value === '别、别摸啦……我又不是小孩子！' ||
        message.value === '呜…别突然摸头啦…我会害羞的…'
      )
        message.value = '';
    }, 3000);
    return;
  }

  if (isBody && hitAreas.length > 0) {
    isPouting.value = true;
    isHappy.value = false;
    isAngry.value = false;
    const shyMessages =
      currentLang.value === 'zh'
        ? [
            personaFlags.value.tsundere ? '喂喂，你手往哪儿放呢！' : '不要乱戳啦，很痒的……',
            personaFlags.value.tsundere ? '哼！离、离我远点啦！' : '再乱来我要生气了哦！',
            personaFlags.value.shy ? '呜……别这样啦…我会脸红的…' : '明明可以好好说话的嘛！'
          ]
        : [
            personaFlags.value.tsundere ? 'Hey, where are you touching!' : 'Don’t poke there...',
            personaFlags.value.tsundere
              ? 'Hmph! Get away from me!'
              : 'I will get mad if you keep this!',
            personaFlags.value.shy
              ? 'W-Wait… that’s embarrassing…'
              : 'You can just talk to me nicely!'
          ];
    message.value = shyMessages[Math.floor(Math.random() * shyMessages.length)];
    playMotionInternal('mood_angry', 3000);
    recordSystemEvent(
      '[System Event: User poked your body area. You feel shy/tsundere.]',
      'body_poke'
    );
    setTimeout(() => {
      isPouting.value = false;
    }, 3000);
    return;
  }

  if (isDizzy.value || isFainted.value) return;

  const now = Date.now();
  if (now - lastClickTime.value < 500) clickCount.value++;
  else clickCount.value = 1;
  lastClickTime.value = now;

  if (clickCount.value >= 5) {
    isPouting.value = true;
    const shyMessages =
      currentLang.value === 'zh'
        ? [
            personaFlags.value.tsundere ? '哼！别戳啦！烦死了…' : '哎呀，别戳啦，有点痒…… 😳',
            personaFlags.value.shy ? '再戳我就要脸红了……' : '别、别一直戳我啦……',
            '是有什么急事吗？可以直接说哦~',
            '呜……头都要晕了…… 💫'
          ]
        : [
            personaFlags.value.tsundere ? 'Hmph! Stop poking me!' : 'Ah... that tickles... 😳',
            personaFlags.value.shy
              ? "P-Please don't poke so fast..."
              : "Please don't poke so fast...",
            'Do you need something? Just ask~',
            "Waaah... I'm getting dizzy... 💫"
          ];
    message.value = shyMessages[Math.floor(Math.random() * shyMessages.length)];
    playMotionInternal('shake', 3000);
    clickCount.value = 0;
    recordSystemEvent(
      '[System Event: User poked you rapidly. You feel ticklish and shy.]',
      'rapid_poke'
    );
    return;
  }

  interactionState.value.clicks += 1;
  markInteractionActivity();
  playMotionInternal('tap_body');
};

const handleMouseMove = (event: MouseEvent) => {
  if (isInteractionLocked()) return;
  if (isDizzy.value || isFainted.value || isAngry.value || isTired.value) return;

  hasMouseMoved.value = true;
  mouseX.value = event.clientX;
  mouseY.value = event.clientY;

  markInteractionActivity();
  const now = Date.now();
  if (now - lastInteractionSampleAt >= 80) {
    lastInteractionSampleAt = now;
    const includeHit = now - lastHitTestAt >= 150;
    const hitAreas = includeHit
      ? agentType.value === 'vrm'
        ? hitTestByRect(
            { left: x.value, top: y.value, width: AGENT_SIZE.value, height: AGENT_SIZE.value },
            event.clientX,
            event.clientY
          )
        : live2dWidgetRef.value?.hitTest(event.clientX, event.clientY) || []
      : undefined;
    if (includeHit) lastHitTestAt = now;
    pushInteractionSample({ ts: now, x: event.clientX, y: event.clientY, hitAreas });
  }

  const centerX = x.value + AGENT_SIZE.value / 2;
  const centerY = y.value + AGENT_SIZE.value / 2;

  if (!isLookAtOverride.value) {
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const sensitivity = 500;
    eyeOffset.value = {
      x: Math.max(-1, Math.min(1, dx / sensitivity)),
      y: Math.max(-1, Math.min(1, dy / sensitivity))
    };
  }

  if (live2dWidgetRef.value?.setPointOfInterest) {
    live2dWidgetRef.value.setPointOfInterest(eyeOffset.value.x, eyeOffset.value.y);
  }

  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);

  if (!lastInteractionSample) {
    lastMouseAngle.value = currentAngle;
    return;
  }

  let delta = currentAngle - lastMouseAngle.value;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  if (Math.abs(delta) < 100) {
    accumulatedAngle.value += delta;
    interactionState.value.accumulatedAngle += delta;
  }

  lastMouseAngle.value = currentAngle;

  if (Math.abs(accumulatedAngle.value) > 360) {
    triggerDizzy();
    resetInteractionState();
    accumulatedAngle.value = 0;
  }
};

const startDrag = (event: MouseEvent | TouchEvent) => {
  if (isInteractionLocked()) return;
  if (isFainted.value || isDizzy.value) return;
  if (
    agentType.value === 'vrm' &&
    vrmMouseControlEnabled.value &&
    event.target instanceof Element &&
    event.target.closest('.vrm-widget')
  )
    return;
  markUserActivity();

  hasDraggedSinceMouseDown.value = false;
  isDragging.value = false;
  isMoving.value = false;
  const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
  const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
  dragStartPos.value = { x: clientX, y: clientY };
  dragOffset.value = { x: clientX - x.value, y: clientY - y.value };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('touchmove', onDrag, { passive: false });
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);
};

const onDrag = (event: MouseEvent | TouchEvent) => {
  const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
  const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

  if (!isDragging.value) {
    const dx0 = clientX - dragStartPos.value.x;
    const dy0 = clientY - dragStartPos.value.y;
    if (Math.sqrt(dx0 * dx0 + dy0 * dy0) < DRAG_MOVE_THRESHOLD) return;
    isDragging.value = true;
    isMoving.value = false;
    hasDraggedSinceMouseDown.value = true;
  }

  event.preventDefault();
  let newX = clientX - dragOffset.value.x;
  let newY = clientY - dragOffset.value.y;

  lastVelocity.value = { x: newX - x.value, y: newY - y.value };

  const maxX = window.innerWidth - AGENT_SIZE.value;
  const maxY = window.innerHeight - AGENT_SIZE.value;
  newX = Math.max(-100, Math.min(newX, maxX + 100));
  newY = Math.max(-50, Math.min(newY, maxY + 50));

  x.value = newX;
  y.value = newY;
};

const endDrag = () => {
  isDragging.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('touchmove', onDrag);
  window.removeEventListener('mouseup', endDrag);
  window.removeEventListener('touchend', endDrag);
  checkBoundaries();
};

const checkBoundaries = () => {
  const maxX = window.innerWidth - AGENT_SIZE.value;
  const maxY = window.innerHeight - AGENT_SIZE.value;
  let clampedX = x.value;
  let clampedY = y.value;
  if (clampedX < 0) clampedX = 0;
  if (clampedX > maxX) clampedX = maxX;
  if (clampedY < 0) clampedY = 0;
  if (clampedY > maxY) clampedY = maxY;
  if (clampedX !== x.value || clampedY !== y.value) {
    x.value = clampedX;
    y.value = clampedY;
  }
};

const handleThrowCollisions = () => {
  const maxX = window.innerWidth - AGENT_SIZE.value;
  const speed = Math.sqrt(
    lastVelocity.value.x * lastVelocity.value.x + lastVelocity.value.y * lastVelocity.value.y
  );

  if (y.value <= 10) {
    if (speed > 5) {
      isCrying.value = true;
      isHeadHit.value = true;
      message.value = '疼死了啦... 呜呜...';
      setTimeout(() => {
        isHeadHit.value = false;
        if (message.value === '疼死了啦... 呜呜...') message.value = '';
      }, 2500);
    } else {
      triggerHeadHit();
    }
    y.value = 60;
  }

  if (x.value <= 0 || x.value >= maxX) {
    if (speed > 7) {
      isCrying.value = true;
      isHeadHit.value = true;
      message.value = '不要乱丢我啦！';
      if (agentType.value === 'vrm') playMotionInternal('crouch', 2600);
      setTimeout(() => {
        isHeadHit.value = false;
        if (message.value === '不要乱丢我啦！') message.value = '';
      }, 2500);
    } else if (Math.abs(lastVelocity.value.x) > 1.5) {
      triggerHeadHit();
    }
  }
};

let animationFrameId: number;
let taskMoveTimeout: number | null = null;
let lastTaskMoveUpdateAt = 0;
let taskMovePauseUntil = 0;
let lastTaskMoveReactAt = 0;

const getIsLazyPersona = () => /(懒散|慵懒|懒|lazy|sleepy|tired)/i.test(getPersonaText());

const pickTaskMoveTarget = (rect: DOMRect) => {
  const size = AGENT_SIZE.value;
  const gap = 16;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  const preferRight = rect.right + gap + size <= viewW;
  const preferLeft = rect.left - gap - size >= 0;
  let targetXPos = preferRight ? rect.right + gap : preferLeft ? rect.left - gap - size : x.value;

  let targetYPos = rect.top + rect.height / 2 - size / 2;
  targetXPos = Math.max(0, Math.min(targetXPos, viewW - size));
  targetYPos = Math.max(0, Math.min(targetYPos, viewH - size));

  return { x: targetXPos, y: targetYPos };
};

const maybeMoveForTask = () => {
  if (props.isPinned) return;
  if (plan.value?.status !== 'running') return;
  if (!guideTargetRect.value) return;
  if (isDragging.value || isDizzy.value || isFainted.value || isHeadHit.value) return;

  const now = nowMs.value;
  const isLazy = getIsLazyPersona();
  if (isLazy && now < taskMovePauseUntil) return;

  const idleForMs = now - lastUserActivityAt.value;
  const updateEvery = isLazy ? 1200 : 700;
  if (now - lastTaskMoveUpdateAt < updateEvery) return;
  lastTaskMoveUpdateAt = now;

  if (isLazy && idleForMs > 2500 && now - lastTaskMoveReactAt > 9000 && Math.random() < 0.25) {
    lastTaskMoveReactAt = now;
    taskMovePauseUntil = now + 700 + Math.floor(Math.random() * 800);
    playMotionInternal('yawn', 1600);
    if (!message.value && Math.random() < 0.35) {
      message.value = currentLang.value === 'zh' ? '嗯…我动一下…' : 'Mm… moving…';
      setTimeout(() => {
        if (
          !isTalking.value &&
          message.value === (currentLang.value === 'zh' ? '嗯…我动一下…' : 'Mm… moving…')
        )
          message.value = '';
      }, 2200);
    }
    return;
  }

  const target = pickTaskMoveTarget(guideTargetRect.value);
  const dx = target.x - x.value;
  const dy = target.y - y.value;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 8) return;

  isMoving.value = true;
  x.value = target.x;
  y.value = target.y;

  if (taskMoveTimeout) window.clearTimeout(taskMoveTimeout);
  const base = isLazy ? 3200 : 2000;
  const tiredFactor = isTired.value ? 1.6 : 1;
  moveTransitionMs.value = Math.round(base * tiredFactor);
  taskMoveTimeout = window.setTimeout(
    () => {
      taskMoveTimeout = null;
      if (!isDragging.value) isMoving.value = false;
    },
    Math.round(base * tiredFactor)
  );
};

const updateEyeTracking = () => {
  if (isDizzy.value || isFainted.value || isHeadHit.value) return;
  if (guideTargetRect.value) {
    const agentCenterX = x.value + AGENT_SIZE.value / 2;
    const agentCenterY = y.value + AGENT_SIZE.value / 2;
    const targetCenterX = guideTargetRect.value.left + guideTargetRect.value.width / 2;
    const targetCenterY = guideTargetRect.value.top + guideTargetRect.value.height / 2;
    const dx = targetCenterX - agentCenterX;
    const dy = targetCenterY - agentCenterY;
    const sensitivity = 500;
    eyeOffset.value = {
      x: Math.max(-1, Math.min(1, dx / sensitivity)),
      y: Math.max(-1, Math.min(1, dy / sensitivity))
    };
  }
  if (live2dWidgetRef.value?.setPointOfInterest) {
    live2dWidgetRef.value.setPointOfInterest(eyeOffset.value.x, eyeOffset.value.y);
  }
};

const startLoop = () => {
  let lastPerfTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const frameWindow: number[] = [];
  let frameSum = 0;
  let longCount = 0;
  let heapTick = 0;

  const loop = () => {
    const perfTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const frameMs = perfTs - lastPerfTs;
    lastPerfTs = perfTs;
    if (Number.isFinite(frameMs) && frameMs > 0 && frameMs < 1000) {
      if (frameWindow.length >= 60) {
        const removed = frameWindow.shift()!;
        frameSum -= removed;
        if (removed > 50) longCount -= 1;
      }
      frameWindow.push(frameMs);
      frameSum += frameMs;
      if (frameMs > 50) longCount += 1;
      const avg = frameSum / Math.max(1, frameWindow.length);
      perfFrameMs.value = frameMs;
      perfAvgFrameMs.value = avg;
      perfFps.value = avg > 0 ? Math.max(0, Math.min(240, 1000 / avg)) : 0;
      perfLongFramesInWindow.value = Math.max(0, longCount);
    }
    heapTick += 1;
    if (heapTick % 30 === 0) {
      try {
        const mem = (performance as any)?.memory;
        perfHeapUsedBytes.value =
          typeof mem?.usedJSHeapSize === 'number' ? mem.usedJSHeapSize : null;
      } catch {
        perfHeapUsedBytes.value = null;
      }
    }
    nowMs.value = Date.now();
    if (!isDragging.value) {
      checkBoundaries();
      handleThrowCollisions();
    }
    updateEyeTracking();
    maybeMoveForTask();

    if (interactionHasPending && Date.now() - interactionLastEventAt > 350) {
      interactionHasPending = false;
      processInteraction();
    }

    if (isDizzy.value || isFainted.value || isHeadHit.value) {
    } else if (isFollowingMouse.value) {
      const targetXPos = mouseX.value + (mouseFollowOffset.value?.x || 0);
      const targetYPos = mouseY.value + (mouseFollowOffset.value?.y || 0);
      const dx = targetXPos - x.value;
      const dy = targetYPos - y.value;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1) {
        x.value = lerp(x.value, targetXPos, Math.max(0.001, Number(lerpFactor.value) || 0.06));
        y.value = lerp(y.value, targetYPos, Math.max(0.001, Number(lerpFactor.value) || 0.06));
        if (energy.value > 0) {
          const newEnergy = Math.max(
            0,
            energy.value - Math.max(0, Number(energyDecayRate.value) || 0.03)
          );
          if (newEnergy !== energy.value) {
            energy.value = newEnergy;
            if (
              !isTired.value &&
              energy.value <= Math.max(0, Number(tiredThreshold.value) || 20) &&
              energy.value > 0
            ) {
              isTired.value = true;
              message.value = '有点累了...';
            }
            if (energy.value === 0 && !isFainted.value) {
              isFainted.value = true;
              message.value = '好累... 不想动了';
            }
          }
        }
      } else if (
        !isDragging.value &&
        !isMoving.value &&
        energy.value < Math.max(1, Number(maxEnergy.value) || 100)
      ) {
        energy.value = Math.min(
          Math.max(1, Number(maxEnergy.value) || 100),
          energy.value + Math.max(0, Number(energyRecoverRate.value) || 0.02)
        );
        if (
          energy.value > Math.max(0, Number(tiredThreshold.value) || 20) &&
          isTired.value &&
          !isFainted.value
        )
          isTired.value = false;
      }
    } else if (
      !isDragging.value &&
      !isMoving.value &&
      energy.value < Math.max(1, Number(maxEnergy.value) || 100)
    ) {
      energy.value = Math.min(
        Math.max(1, Number(maxEnergy.value) || 100),
        energy.value + Math.max(0, Number(energyRecoverRate.value) || 0.02)
      );
      if (
        energy.value > Math.max(0, Number(tiredThreshold.value) || 20) &&
        isTired.value &&
        !isFainted.value
      )
        isTired.value = false;
    }

    if (accumulatedAngle.value > 0)
      accumulatedAngle.value = Math.max(0, accumulatedAngle.value - 5);
    else if (accumulatedAngle.value < 0)
      accumulatedAngle.value = Math.min(0, accumulatedAngle.value + 5);

    animationFrameId = requestAnimationFrame(loop);
  };
  animationFrameId = requestAnimationFrame(loop);
};

// Roaming & Idle
let idleTimer: number | null = null;
let lastIdleAiAt = 0;
let idleAiAbortController: AbortController | null = null;
const maybeTriggerIdleAi = async (idleForMs: number) => {
  if (!idleAiEnabled.value) return;
  if (chatOpen.value || isMoving.value || message.value || isDragging.value || isFainted.value)
    return;
  if (isLoading.value || isExecuting.value || isBackgroundReacting.value) return;
  if (idleForMs < Math.max(0, Number(idleAiMinIdleMs.value) || 65000)) return;
  const now = Date.now();
  if (now - lastIdleAiAt < Math.max(0, Number(idleAiCooldownMs.value) || 120000)) return;
  if (Math.random() > Math.max(0, Math.min(1, Number(idleAiChance.value) || 0.22))) return;

  lastIdleAiAt = now;
  if (idleAiAbortController) {
    try {
      idleAiAbortController.abort();
    } catch {}
  }
  idleAiAbortController = new AbortController();

  try {
    const seconds = Math.max(0, Math.round(idleForMs / 1000));
    const idlePrompt =
      currentLang.value === 'zh'
        ? `[Idle]: 用户已经 ${seconds} 秒没有操作。请用人设口吻进行一次「闲置行为」：必须输出 avatarPlan（严格 JSON 数组，1–4 步），动作以 idle / mood / 轻微表情为主，可选 bubble 或 speak 一句很短的话。保持自然、简短。`
        : `[Idle]: The user has been inactive for ${seconds} seconds. Do one in-character idle beat: you MUST output an avatarPlan (strict JSON array, 1–4 steps). Prefer idle/mood motions + subtle expression. Optionally include one very short bubble or speak line. Keep it short.`;
    const agentContext: any = buildAgentContext({ trigger: 'idle', systemEvent: idlePrompt });
    agentContext.suppressMemorySave = true;
    const rawResponse = await sendMessageToAI(idlePrompt, [], agentContext, {
      signal: idleAiAbortController.signal,
      group: 'idle'
    });
    if (!rawResponse) return;
    await applyAiReply(rawResponse, {
      displayInChat: false,
      speakText: false,
      suppressMemorySave: true
    });
  } finally {
    idleAiAbortController = null;
  }
};

const startIdleTalk = () => {
  if (idleTimer) clearInterval(idleTimer);
  if (!idleTalkEnabled.value) return;
  idleTimer = window.setInterval(
    () => {
      if (chatOpen.value || isMoving.value || message.value || isDragging.value || isFainted.value)
        return;
      const now = Date.now();
      const idleForMs = now - lastUserActivityAt.value;
      void maybeTriggerIdleAi(idleForMs);
      const isLazy = getIsLazyPersona();
      if (
        isLazy &&
        idleForMs > 45000 &&
        !isTired.value &&
        !isAngry.value &&
        !isHappy.value &&
        !isConfused.value
      ) {
        setTransient('tired', (v) => (isTired.value = v), 12000);
        playMotionInternal('mood_tired', 2600);
        if (!message.value && Math.random() < 0.8) {
          message.value =
            currentLang.value === 'zh'
              ? '哈…好累…我先蹲一会儿…'
              : "Ugh... I'm tired... let me rest…";
        }
        return;
      }
      if (isTired.value) {
        playMotionInternal('mood_tired');
        if (Math.random() > 0.5) {
          const tiredMsgs =
            currentLang.value === 'zh'
              ? ['好累...', '休息一下...', 'Zzz...']
              : ['So tired...', 'Need rest...', 'Zzz...'];
          message.value = tiredMsgs[Math.floor(Math.random() * tiredMsgs.length)];
        }
      } else if (isHappy.value) playMotionInternal('mood_happy');
      else if (isAngry.value) playMotionInternal('mood_angry');
      else {
        const idleProfile = getIdleProfile();
        if (Math.random() < idleProfile.motionChance) {
          const randomIdles = idleProfile.motions;
          const chosen = randomIdles[Math.floor(Math.random() * randomIdles.length)];
          playMotionInternal(chosen);
          if (!message.value && Math.random() < 0.55) {
            if (chosen === 'yawn') {
              const yawnMsgs =
                currentLang.value === 'zh'
                  ? ['哈——欠……', '有点困了…', '我先眯一下…']
                  : ['Yaaawn…', 'A bit sleepy…', 'Let me nap…'];
              message.value = yawnMsgs[Math.floor(Math.random() * yawnMsgs.length)];
            } else if (chosen === 'play_hair') {
              const hairMsgs =
                currentLang.value === 'zh'
                  ? ['我整理一下头发…', '别盯着我看啦…', '辫子有点乱…']
                  : ['Fixing my hair...', "Don't stare...", 'My braid is messy...'];
              message.value = hairMsgs[Math.floor(Math.random() * hairMsgs.length)];
            }
          } else if (!message.value && Math.random() < idleProfile.messageChance) {
            const msgs =
              currentLang.value === 'zh' ? idleProfile.messages.zh : idleProfile.messages.en;
            message.value = msgs[Math.floor(Math.random() * msgs.length)];
          }
        }
      }

      if (message.value) {
        setTimeout(() => {
          if (!isTalking.value) message.value = '';
        }, 5000);
      }
    },
    Math.max(1000, Number(idleTalkIntervalMs.value) || 30000)
  );
};

const chatPlacement = computed<'top' | 'bottom'>(() => {
  if (isMobile.value) return 'top';
  const centerY = y.value + AGENT_SIZE.value / 2;
  return centerY < window.innerHeight / 2 ? 'top' : 'bottom';
});

let roamTimer: number | null = null;
const startRoaming = () => {
  if (roamTimer) clearInterval(roamTimer);
  roamTimer = null;
  if (props.isPinned) return;
  if (!roamEnabled.value) return;
  moveRandomly();
  roamTimer = window.setInterval(
    () => {
      const now = Date.now();
      const idleForMs = now - lastUserActivityAt.value;
      const isLazy = getIsLazyPersona();
      if (
        plan.value?.status !== 'running' &&
        !isDragging.value &&
        !isHovered.value &&
        !isDizzy.value &&
        !isFainted.value &&
        !isHeadHit.value &&
        !chatOpen.value
      ) {
        if (!props.isPinned && idleForMs > (isLazy ? 25000 : 9000)) {
          if (!isLazy || Math.random() < 0.55) moveRandomly();
        }
      }
    },
    Math.max(2000, Number(moveIntervalMs.value) || 60000)
  );
};

watch(
  [roamEnabled, moveIntervalMs],
  () => {
    startRoaming();
  },
  { deep: false }
);

watch(
  [idleTalkEnabled, idleTalkIntervalMs],
  () => {
    startIdleTalk();
  },
  { deep: false }
);

const moveRandomly = () => {
  if (props.isPinned) return;
  const size = AGENT_SIZE.value;
  const isLazy = getIsLazyPersona();
  const newPos = isLazy
    ? (() => {
        const radius = 220;
        const nx = x.value + (Math.random() * 2 - 1) * radius;
        const ny = y.value + (Math.random() * 2 - 1) * radius;
        const maxX = window.innerWidth - size;
        const maxY = window.innerHeight - size;
        return { x: Math.max(0, Math.min(nx, maxX)), y: Math.max(0, Math.min(ny, maxY)) };
      })()
    : getRandomPosition(window.innerWidth, window.innerHeight, size);
  isMoving.value = true;
  x.value = newPos.x;
  y.value = newPos.y;
  moveTransitionMs.value = Math.round((isLazy ? 2600 : 2000) * (isTired.value ? 1.4 : 1));
  if (energy.value > 0) {
    const newEnergy = Math.max(0, energy.value - 5);
    energy.value = newEnergy;
    if (!isTired.value && newEnergy <= tiredThreshold.value && newEnergy > 0) {
      isTired.value = true;
      message.value = '有点累了...';
    }
    if (newEnergy === 0 && !isFainted.value) {
      isFainted.value = true;
      message.value = '好累... 不想动了';
    }
  }
  setTimeout(() => {
    isMoving.value = false;
  }, moveTransitionMs.value);
};

const handleMouseEnter = () => {
  if (isMoving.value) {
    const el = document.querySelector('.agent-container') as HTMLElement;
    if (el) {
      const style = window.getComputedStyle(el);
      const matrix = new DOMMatrix(style.transform);
      x.value = matrix.m41;
      y.value = matrix.m42;
      targetX.value = x.value;
      targetY.value = y.value;
    }
  }
  isHovered.value = true;
  if (!props.isPinned && !chatOpen.value) isFollowingMouse.value = true;
  isMoving.value = false;
  if (!chatOpen.value) message.value = personaFlags.value.tsundere ? '哼…来干嘛。' : 'Hello!';
};

const handleMouseLeave = () => {
  isHovered.value = false;
  isFollowingMouse.value = false;
  if (!chatOpen.value) message.value = '';
};

const handleFocusIn = (e: FocusEvent) => {
  const target = e.target as HTMLElement;
  if (!target || target.closest('.agent-container') || target.closest('.chat-window')) return;
  const rect = target.getBoundingClientRect();
  avoidObstacle(rect);
};

const avoidObstacle = (obstacleRect: DOMRect) => {
  const agentSize = AGENT_SIZE.value;
  const agentRect = {
    left: x.value,
    top: y.value,
    right: x.value + agentSize,
    bottom: y.value + agentSize
  };
  const isOverlapping =
    agentRect.left < obstacleRect.right &&
    agentRect.right > obstacleRect.left &&
    agentRect.top < obstacleRect.bottom &&
    agentRect.bottom > obstacleRect.top;

  if (isOverlapping) {
    const moveLeft = x.value > window.innerWidth / 2;
    const newX = moveLeft ? 50 : window.innerWidth - agentSize - 50;
    const moveDown = obstacleRect.top < window.innerHeight / 2;
    const newY = moveDown ? window.innerHeight - agentSize - 50 : 50;
    targetX.value = newX;
    targetY.value = newY;
    isMoving.value = true;
    moveTransitionMs.value = 650;
    x.value = newX;
    y.value = newY;
    message.value = currentLang.value === 'zh' ? '哎呀，借过一下！' : 'Oops, excuse me!';
    setTimeout(() => {
      isMoving.value = false;
      if (!chatOpen.value) message.value = '';
    }, 1500);
  }
};

const handleGlobalPointerDown = (event: Event) => {
  if (!vrmPickerOpen.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (vrmPickerEl.value?.contains(target)) return;
  if (vrmPickerButtonEl.value?.contains(target)) return;
  vrmPickerOpen.value = false;
};

const handleGlobalKeyDown = (event: KeyboardEvent) => {
  if (!vrmPickerOpen.value) return;
  if (event.key === 'Escape') vrmPickerOpen.value = false;
};

// --- Lifecycle ---
onMounted(async () => {
  installGlobalDiagnostics();
  installConsoleDiagnostics({ captureInfo: readBoolSetting(CONSOLE_CAPTURE_INFO_KEY, false) });
  recordDiagnostic({ kind: 'agent_mounted', level: 'info' });
  loadLocalMemory();
  loadTaskSession();
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth <= 768;
  });
  window.addEventListener('focusin', handleFocusIn);
  window.addEventListener('mousedown', handleGlobalPointerDown, true);
  window.addEventListener('touchstart', handleGlobalPointerDown, true);
  window.addEventListener('keydown', handleGlobalKeyDown, true);

  // Mobile initial position
  if (isMobile.value) {
    x.value = (window.innerWidth - AGENT_SIZE.value) / 2;
    y.value = window.innerHeight - AGENT_SIZE.value - 20;
  }

  startLoop();
  if (!props.isPinned) startRoaming();
  startIdleTalk();
  await initAuth();
  startDomObserver();
  if (taskSession.value?.active && !plan.value?.status) {
    window.setTimeout(() => {
      void requestNextTaskChunk('manual');
    }, 900);
  }

  // Expose for debugging/external control
  (window as any).runAgentPlan = (plan: any[]) => avatarAdapter.runPlan(plan);
  const w = window as any;
  w.__agentDebug = {
    getSnapshot: () => {
      const p = plan.value as any;
      const status = typeof p?.status === 'string' ? p.status : '';
      const steps = Array.isArray(p?.steps) ? p.steps : [];
      const runningIdx = steps.findIndex((s: any) => s?.status === 'running');
      const runningStep = runningIdx >= 0 ? steps[runningIdx] : null;
      return {
        ts: Date.now(),
        route: router.currentRoute.value?.fullPath || window.location.pathname,
        perf: {
          frameMs: perfFrameMs.value,
          avgFrameMs: perfAvgFrameMs.value,
          fps: perfFps.value,
          longFrames60: perfLongFramesInWindow.value,
          heapUsedBytes: perfHeapUsedBytes.value
        },
        agent: {
          type: agentType.value,
          position: { x: x.value, y: y.value, size: AGENT_SIZE.value },
          flags: {
            isMoving: isMoving.value,
            isHovered: isHovered.value,
            isDragging: isDragging.value,
            isTalking: isTalking.value
          },
          emotions: {
            isAngry: isAngry.value,
            isHappy: isHappy.value,
            isPouting: isPouting.value,
            isDizzy: isDizzy.value,
            isConfused: isConfused.value,
            isTired: isTired.value,
            isFainted: isFainted.value,
            isCrying: isCrying.value
          },
          energy: energy.value,
          message: message.value || ''
        },
        chat: {
          open: chatOpen.value,
          isLoading: isLoading.value,
          isMuted: isMuted.value,
          lastActivityAt: lastChatActivityAt.value,
          messages: messages.value.slice(-Math.max(20, Number(maxUiMessages.value) || 120))
        },
        memory: {
          summary: memorySummary.value,
          facts: memoryFacts.value,
          itemCount: localMemory.value.items.length,
          recentItems: localMemory.value.items.slice(-40)
        },
        task: {
          active: !!taskSession.value?.active,
          goal: taskSession.value?.goal || '',
          isExecuting: isExecuting.value,
          planStatus: status,
          runningStepIndex: runningIdx,
          runningStep: runningStep
            ? {
                type: runningStep.type,
                target: runningStep.target,
                value: runningStep.value,
                status: runningStep.status,
                description: runningStep.description
              }
            : null
        },
        params: {
          maxUiMessages: maxUiMessages.value,
          chatAutoCloseMs: chatAutoCloseMs.value,
          dynamicScale: dynamicScale.value,
          moveTransitionMs: moveTransitionMs.value,
          roamEnabled: roamEnabled.value,
          idleTalkEnabled: idleTalkEnabled.value,
          idleAiEnabled: idleAiEnabled.value,
          moveIntervalMs: moveIntervalMs.value,
          idleTalkIntervalMs: idleTalkIntervalMs.value,
          lerpFactor: lerpFactor.value,
          mouseFollowOffset: mouseFollowOffset.value,
          maxEnergy: maxEnergy.value,
          energyDecayRate: energyDecayRate.value,
          energyRecoverRate: energyRecoverRate.value,
          tiredThreshold: tiredThreshold.value,
          idleAiMinIdleMs: idleAiMinIdleMs.value,
          idleAiCooldownMs: idleAiCooldownMs.value,
          idleAiChance: idleAiChance.value
        }
      };
    },
    setParam: (key: string, value: any) => {
      const k = String(key || '').trim();
      const rawNum = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10);
      const rawFloat =
        typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
      const num = Number.isFinite(rawNum) ? rawNum : Number.NaN;
      const floatNum = Number.isFinite(rawFloat) ? rawFloat : Number.NaN;
      const parseBool = (v: any) => {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        const s = String(v ?? '')
          .trim()
          .toLowerCase();
        if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
        if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
        return false;
      };
      if (k === 'maxUiMessages') {
        const v = Math.max(20, Math.min(800, Number.isFinite(num) ? Math.round(num) : 120));
        maxUiMessages.value = v;
        try {
          localStorage.setItem(MAX_UI_MESSAGES_KEY, String(v));
        } catch {}
        if (messages.value.length > v) messages.value = messages.value.slice(-v);
      } else if (k === 'chatAutoCloseMs') {
        const v = Math.max(0, Math.min(600000, Number.isFinite(num) ? Math.round(num) : 5000));
        chatAutoCloseMs.value = v;
        try {
          localStorage.setItem(CHAT_AUTO_CLOSE_MS_KEY, String(v));
        } catch {}
        if (chatOpen.value) scheduleChatAutoClose();
      } else if (k === 'dynamicScale') {
        const v = Math.max(0.06, Math.min(1.6, Number.isFinite(rawNum) ? rawNum : 1.0));
        dynamicScale.value = v;
      } else if (k === 'moveTransitionMs') {
        const v = Math.max(80, Math.min(20000, Number.isFinite(num) ? Math.round(num) : 3000));
        moveTransitionMs.value = v;
      } else if (k === 'roamEnabled') {
        const v = parseBool(value);
        roamEnabled.value = v;
        try {
          localStorage.setItem(ROAM_ENABLED_KEY, v ? '1' : '0');
        } catch {}
        startRoaming();
      } else if (k === 'idleTalkEnabled') {
        const v = parseBool(value);
        idleTalkEnabled.value = v;
        try {
          localStorage.setItem(IDLE_TALK_ENABLED_KEY, v ? '1' : '0');
        } catch {}
        startIdleTalk();
      } else if (k === 'idleAiEnabled') {
        const v = parseBool(value);
        idleAiEnabled.value = v;
        try {
          localStorage.setItem(IDLE_AI_ENABLED_KEY, v ? '1' : '0');
        } catch {}
      } else if (k === 'moveIntervalMs') {
        const v = Math.max(5000, Math.min(600000, Number.isFinite(num) ? Math.round(num) : 60000));
        moveIntervalMs.value = v;
        try {
          localStorage.setItem(MOVE_INTERVAL_MS_KEY, String(v));
        } catch {}
        startRoaming();
      } else if (k === 'idleTalkIntervalMs') {
        const v = Math.max(3000, Math.min(600000, Number.isFinite(num) ? Math.round(num) : 30000));
        idleTalkIntervalMs.value = v;
        try {
          localStorage.setItem(IDLE_TALK_INTERVAL_MS_KEY, String(v));
        } catch {}
        startIdleTalk();
      } else if (k === 'lerpFactor') {
        const v = Math.max(0.01, Math.min(0.35, Number.isFinite(floatNum) ? floatNum : 0.06));
        lerpFactor.value = v;
        try {
          localStorage.setItem(LERP_FACTOR_KEY, String(v));
        } catch {}
      } else if (k === 'mouseFollowOffsetX') {
        const v = Math.max(-300, Math.min(300, Number.isFinite(num) ? Math.round(num) : 20));
        mouseFollowOffset.value = { ...mouseFollowOffset.value, x: v };
        try {
          localStorage.setItem(MOUSE_FOLLOW_OFFSET_X_KEY, String(v));
        } catch {}
      } else if (k === 'mouseFollowOffsetY') {
        const v = Math.max(-300, Math.min(300, Number.isFinite(num) ? Math.round(num) : 20));
        mouseFollowOffset.value = { ...mouseFollowOffset.value, y: v };
        try {
          localStorage.setItem(MOUSE_FOLLOW_OFFSET_Y_KEY, String(v));
        } catch {}
      } else if (k === 'maxEnergy') {
        const v = Math.max(10, Math.min(2000, Number.isFinite(num) ? Math.round(num) : 100));
        maxEnergy.value = v;
        try {
          localStorage.setItem(MAX_ENERGY_KEY, String(v));
        } catch {}
        if (energy.value > v) energy.value = v;
      } else if (k === 'energyDecayRate') {
        const v = Math.max(0, Math.min(5, Number.isFinite(floatNum) ? floatNum : 0.03));
        energyDecayRate.value = v;
        try {
          localStorage.setItem(ENERGY_DECAY_RATE_KEY, String(v));
        } catch {}
      } else if (k === 'energyRecoverRate') {
        const v = Math.max(0, Math.min(5, Number.isFinite(floatNum) ? floatNum : 0.02));
        energyRecoverRate.value = v;
        try {
          localStorage.setItem(ENERGY_RECOVER_RATE_KEY, String(v));
        } catch {}
      } else if (k === 'tiredThreshold') {
        const v = Math.max(0, Math.min(2000, Number.isFinite(num) ? Math.round(num) : 20));
        tiredThreshold.value = v;
        try {
          localStorage.setItem(TIRED_THRESHOLD_KEY, String(v));
        } catch {}
      } else if (k === 'idleAiMinIdleMs') {
        const v = Math.max(3000, Math.min(600000, Number.isFinite(num) ? Math.round(num) : 65000));
        idleAiMinIdleMs.value = v;
        try {
          localStorage.setItem(IDLE_AI_MIN_IDLE_MS_KEY, String(v));
        } catch {}
      } else if (k === 'idleAiCooldownMs') {
        const v = Math.max(0, Math.min(900000, Number.isFinite(num) ? Math.round(num) : 120000));
        idleAiCooldownMs.value = v;
        try {
          localStorage.setItem(IDLE_AI_COOLDOWN_MS_KEY, String(v));
        } catch {}
      } else if (k === 'idleAiChance') {
        const v = Math.max(0, Math.min(1, Number.isFinite(floatNum) ? floatNum : 0.22));
        idleAiChance.value = v;
        try {
          localStorage.setItem(IDLE_AI_CHANCE_KEY, String(v));
        } catch {}
      }
    },
    action: (name: string) => {
      const n = String(name || '').trim();
      if (n === 'openChat') openChat();
      else if (n === 'closeChat') closeChat();
      else if (n === 'toggleChat') toggleChat();
      else if (n === 'cancelAi') cancelAiRequests();
      else if (n === 'reloadMemory') loadLocalMemory();
      else if (n === 'taskNext') void requestNextTaskChunk('manual');
      else if (n === 'taskStop') stopTask();
      else if (n === 'clearLocalMemory') {
        const uid = getUserId();
        try {
          localStorage.removeItem(`agent_memory_v1_${uid}`);
          localStorage.removeItem(`agent_memory_summary_v1_${uid}`);
          localStorage.removeItem(`agent_memory_facts_v1_${uid}`);
        } catch {}
        loadLocalMemory();
      }
    },
    getDiagnosticsSnapshot: () => getDiagnosticsSnapshot(),
    clearDiagnostics: () => clearDiagnostics(),
    setDiagnosticsEnabled: (v: boolean) => setDiagnosticsEnabled(v),
    setDiagnosticsMaxItems: (n: number) => setDiagnosticsMaxItems(n),
    getConsoleCaptureInfoEnabled: () => getConsoleCaptureInfoEnabled(),
    setConsoleCaptureInfoEnabled: (v: boolean) => {
      setConsoleCaptureInfoEnabled(v);
      try {
        localStorage.setItem(CONSOLE_CAPTURE_INFO_KEY, v ? '1' : '0');
      } catch {}
    }
  };
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('focusin', handleFocusIn);
  window.removeEventListener('mousedown', handleGlobalPointerDown, true);
  window.removeEventListener('touchstart', handleGlobalPointerDown, true);
  window.removeEventListener('keydown', handleGlobalKeyDown, true);
  try {
    const w = window as any;
    if (w.__agentDebug) delete w.__agentDebug;
  } catch {}
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (idleTimer) clearInterval(idleTimer);
  if (roamTimer) clearInterval(roamTimer);
  if (dizzyTimeout) clearTimeout(dizzyTimeout);
  if (expressionOverrideTimeout) clearTimeout(expressionOverrideTimeout);
  if (backgroundReactTimer) clearTimeout(backgroundReactTimer);
  if (chatAutoCloseTimer) clearTimeout(chatAutoCloseTimer);
  if (taskMoveTimeout) clearTimeout(taskMoveTimeout);
  stopDomObserver();
  try {
    chatAbortController?.abort();
  } catch {}
  cancelAiRequests();
});

watch(
  () => router.currentRoute.value?.fullPath,
  (path, prev) => {
    if (!path || path === prev) return;
    if (taskSession.value?.active) {
      reactToSystemEvent({
        text: currentLang.value === 'zh' ? `页面已跳转：${path}` : `Navigation happened: ${path}`,
        type: 'navigation',
        trigger: 'nav'
      });
      window.setTimeout(() => {
        void requestNextTaskChunk('manual');
      }, 1200);
    }
  }
);

watch(currentUser, async (user) => {
  if (user) {
    const name = user.name || user.username || 'Friend';
    const visits = user.visits || 0;
    if (visits > 1) {
      message.value = currentLang.value === 'zh' ? `欢迎回来, ${name}!` : `Welcome back, ${name}!`;
      isHappy.value = true;
      setTimeout(() => (isHappy.value = false), 2000);
    } else {
      message.value =
        currentLang.value === 'zh' ? `很高兴见到你, ${name}!` : `Nice to meet you, ${name}!`;
    }
    try {
      const history = await getChatHistory(user.userId || user.id);
      if (history && history.length > 0) {
        messages.value = history
          .map((msg: any) => ({
            role: msg.role === 'model' ? 'agent' : 'user',
            text: msg.parts?.[0]?.text || msg.text || ''
          }))
          .filter((m: any) => typeof m?.text === 'string' && m.text.trim())
          .slice(-Math.max(20, Number(maxUiMessages.value) || 120));
        pushUiMessage({
          role: 'agent',
          text:
            currentLang.value === 'zh'
              ? `我已经恢复了我们之前的聊天记录。你在想什么呢？`
              : `I've restored our previous chat history. What's on your mind?`
        });
      } else {
        messages.value = [
          {
            role: 'agent',
            text:
              currentLang.value === 'zh'
                ? `你好 ${name}! 今天有什么我可以帮你的吗？`
                : `Hello ${name}! How can I help you today?`
          }
        ];
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  } else {
    message.value = currentLang.value === 'zh' ? '再见！' : 'See you later!';
    messages.value = [
      {
        role: 'agent',
        text:
          currentLang.value === 'zh'
            ? '你好！请登录以保存我们的聊天记录。'
            : 'Hello! Please login to save our chats.'
      }
    ];
  }
});

// Update guideTargetRect loop
const updateGuideRect = () => {
  if (!guideTarget.value && plan.value?.status === 'running') {
    const activeStep = plan.value.steps.find((s) => s.status === 'running');
    if (activeStep?.target) {
      const el = resolveTarget(activeStep.target);
      if (el) {
        guideTarget.value = el;
        guideLabel.value = activeStep.description || 'Working...';
      }
    }
  }
  if (guideTarget.value) {
    if (!document.body.contains(guideTarget.value)) {
      guideTarget.value = null;
      guideTargetRect.value = null;
    } else {
      guideTargetRect.value = guideTarget.value.getBoundingClientRect();
    }
  }
  requestAnimationFrame(updateGuideRect);
};
requestAnimationFrame(updateGuideRect);

watch(
  () => plan.value?.steps,
  async (steps) => {
    if (!steps) return;
    const activeStep = steps.find((s) => s.status === 'running');
    if (activeStep && activeStep.target) {
      const el = resolveTarget(activeStep.target);
      if (el) {
        guideTarget.value = el;
        guideTargetRect.value = el.getBoundingClientRect();
        guideLabel.value = activeStep.description || 'Working...';
      }
    }
  },
  { deep: true }
);

watch(isExecuting, (newVal) => {
  if (!newVal) {
    guideTarget.value = null;
    guideTargetRect.value = null;
    guideLabel.value = '';
  }
});

watch(
  () => plan.value?.status,
  (newStatus) => {
    if (newStatus === 'running') motionCommand.value = 'activity';
    else if (newStatus === 'completed') {
      isHappy.value = true;
      message.value = 'Mission Accomplished!';
      guideLabel.value = 'Done!';
      window.setTimeout(() => {
        void requestNextTaskChunk('completed');
      }, 450);
      setTimeout(() => {
        isHappy.value = false;
        if (message.value === 'Mission Accomplished!') message.value = '';
        if (guideLabel.value === 'Done!') guideLabel.value = '';
      }, 3000);
      motionCommand.value = 'happy';
    } else if (newStatus === 'failed') {
      isConfused.value = true;
      message.value = 'Oops, something went wrong.';
      window.setTimeout(() => {
        void requestNextTaskChunk('failed');
      }, 650);
      setTimeout(() => {
        isConfused.value = false;
        message.value = '';
      }, 3000);
    }
  }
);
</script>

<style scoped>
.agent-container {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  z-index: 9999;
}

.agent-controls {
  position: absolute;
  left: 8px;
  top: 8px;
  display: flex;
  gap: 6px;
  z-index: 10001;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.agent-container:hover .agent-controls {
  opacity: 1;
  pointer-events: auto;
}

.agent-side-tools {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10001;
}

.agent-side-btn {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(0, 0, 0, 0.35);
  color: #e2e8f0;
  cursor: pointer;
  backdrop-filter: blur(10px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.agent-side-btn:hover {
  background: rgba(0, 0, 0, 0.5);
}

.agent-side-btn.active {
  border-color: rgba(56, 189, 248, 0.7);
  background: rgba(56, 189, 248, 0.18);
}

.agent-pill {
  height: 30px;
  padding: 0 10px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.35);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(10px);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-pill:hover {
  background: rgba(0, 0, 0, 0.5);
}

.agent-pill-model {
  max-width: 220px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
}

.agent-pill-badge {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  flex: 0 0 auto;
}

.agent-pill-model.open {
  border-color: rgba(56, 189, 248, 0.6);
  background: rgba(56, 189, 248, 0.12);
}

.agent-pill-model-label {
  font-weight: 600;
  letter-spacing: 0.2px;
  opacity: 0.95;
}

.agent-pill-model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

.agent-pill-caret {
  opacity: 0.9;
  transform: translateY(-1px);
}

.agent-pill-model.open .agent-pill-caret {
  transform: rotate(180deg) translateY(1px);
}

.agent-menu {
  position: absolute;
  left: 0;
  top: 42px;
  width: 284px;
  max-width: min(284px, calc(100vw - 24px));
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(10, 10, 12, 0.72);
  box-shadow:
    0 14px 38px rgba(0, 0, 0, 0.45),
    0 2px 10px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
  overflow: hidden;
}

.agent-menu-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
}

.agent-menu-nav,
.agent-menu-close {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.agent-menu-nav:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.agent-menu-nav:hover:not(:disabled),
.agent-menu-close:hover {
  background: rgba(255, 255, 255, 0.12);
}

.agent-menu-search {
  flex: 1 1 auto;
  height: 30px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.22);
  color: #e2e8f0;
  padding: 0 10px;
  outline: none;
  font-size: 12px;
}

.agent-menu-search::placeholder {
  color: rgba(226, 232, 240, 0.55);
}

.agent-menu-list {
  max-height: 260px;
  overflow: auto;
  padding: 8px;
}

.agent-menu-status {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  padding: 10px 12px;
  margin-bottom: 8px;
  color: rgba(226, 232, 240, 0.9);
  font-size: 12px;
  line-height: 1.35;
}

.agent-menu-status-error {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
}

.agent-menu-status-title {
  font-weight: 700;
  margin-bottom: 6px;
}

.agent-menu-status-msg {
  opacity: 0.9;
  word-break: break-word;
}

.agent-menu-status-action {
  margin-top: 8px;
  height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  cursor: pointer;
  font-size: 12px;
}

.agent-menu-status-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.agent-menu-status-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.agent-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: #e2e8f0;
  text-align: left;
  cursor: pointer;
  line-height: 1.1;
}

.agent-menu-badge {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  flex: 0 0 auto;
}

.agent-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.agent-menu-item.active {
  border-color: rgba(56, 189, 248, 0.55);
  background: rgba(56, 189, 248, 0.14);
}

.agent-menu-check {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(56, 189, 248, 0.55);
  color: rgba(56, 189, 248, 0.95);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: 12px;
}

.agent-menu-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-menu-enter-active,
.agent-menu-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.agent-menu-enter-from,
.agent-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.agent-pill-count {
  font-size: 11px;
  opacity: 0.9;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.12);
  line-height: 1;
}

.agent-pill-icon {
  width: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.agent-pill-spinner {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: rgba(255, 255, 255, 0.95);
  animation: agent-spin 0.8s linear infinite;
  flex: 0 0 auto;
}

@keyframes agent-spin {
  to {
    transform: rotate(360deg);
  }
}

.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(10px);
}
</style>
