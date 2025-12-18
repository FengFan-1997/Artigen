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
      :scale="AGENT_SCALE"
      :motion-command="motionCommand"
      :message="message"
      :current-lang="currentLang"
      @toggle-chat="toggleChat"
    />

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
      :agent-position="{ x, y }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useLanguageStore } from '../../stores/language';
import { storeToRefs } from 'pinia';
import Live2DWidget from './Live2DWidget.vue';
import ChatWindow from './ChatWindow.vue';
import GuideOverlay from './GuideOverlay.vue';
import TaskDisplay from './TaskDisplay.vue';
import ConnectionLine from './ConnectionLine.vue';
import { useTaskExecutor } from '../composables/useTaskExecutor';
import { useAuth } from '../composables/useAuth';
import { lerp, getRandomPosition } from '../utils/math';
import { resolveTarget } from '../utils/dom';
import { sendMessageToAI, getChatHistory } from '../services/aiService';
import type { Position, ChatMessage } from '../types';
import type { AvatarPlanStep } from '../types/avatarPlan';

const router = useRouter();
const { initAuth, currentUser } = useAuth();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const isMobile = ref(window.innerWidth <= 768);
const BASE_AGENT_SIZE_MOBILE = 250;
const BASE_AGENT_SIZE_DESKTOP = 400;
const AGENT_SCALE = 0.7;
const dynamicScale = ref(1.0);
const AGENT_SIZE = computed(
  () =>
    (isMobile.value ? BASE_AGENT_SIZE_MOBILE : BASE_AGENT_SIZE_DESKTOP) *
    AGENT_SCALE *
    dynamicScale.value
);

// --- State ---
const initialSize =
  (window.innerWidth <= 768 ? BASE_AGENT_SIZE_MOBILE : BASE_AGENT_SIZE_DESKTOP) * AGENT_SCALE;
const x = ref(window.innerWidth - initialSize);
const y = ref(window.innerHeight - initialSize);
const targetX = ref(x.value);
const targetY = ref(y.value);

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
const live2dWidgetRef = ref<any>(null);

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

const interactionState = ref({
  clicks: 0,
  accumulatedAngle: 0,
  startTime: Date.now()
});

// Task Executor
const { plan, isExecuting, setPlan } = useTaskExecutor();

// Eye Tracking State
const mouseX = ref(0);
const mouseY = ref(0);
const eyeOffset = ref<Position>({ x: 0, y: 0 });
const isFollowingMouse = ref(false);
const isLookAtOverride = ref(false);

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
const MOVE_INTERVAL = 60000;
const IDLE_TALK_INTERVAL = 30000;
const LERP_FACTOR = 0.02;
const MOUSE_FOLLOW_OFFSET = { x: 20, y: 20 };
const MAX_ENERGY = 100;
const ENERGY_DECAY_RATE = 0.03;
const ENERGY_RECOVER_RATE = 0.02;
const TIRED_THRESHOLD = 20;
const DRAG_MOVE_THRESHOLD = 5;

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

const containerStyle = computed(() => ({
  transform: `translate(${x.value}px, ${y.value}px)`,
  width: `${AGENT_SIZE.value}px`,
  height: `${AGENT_SIZE.value}px`,
  transition:
    isDragging.value || isTeleporting.value
      ? 'none'
      : isMoving.value
        ? 'transform 3s cubic-bezier(0.4, 0.0, 0.2, 1)'
        : 'transform 0.25s ease-out',
  zIndex: 9999,
  position: 'fixed' as const,
  top: 0,
  left: 0,
  pointerEvents: 'auto' as const,
  overflow: 'visible'
}));

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

async function runAvatarPlanSteps(steps: any[]) {
  if (!steps || !Array.isArray(steps) || steps.length === 0) return;

  const parallelPromises: Promise<unknown>[] = [];

  for (const step of steps) {
    const executeStep = async () => {
      try {
        const t = step?.type;
        const duration = typeof step?.duration === 'number' ? step.duration : 1200;

        if (t === 'pose') {
          if (typeof step.motion === 'string') {
            playMotionInternal(step.motion, duration);
          }
          applyExpression(step.expression, duration);
          await delay(duration);
        } else if (t === 'motion') {
          if (typeof step.motion === 'string') {
            playMotionInternal(step.motion, duration);
          }
          await delay(duration);
        } else if (t === 'expression' || t === 'emotion') {
          applyExpression(step.expression, duration);
          await delay(duration);
        } else if (t === 'speak') {
          if (typeof step.text === 'string') {
            if (step.bubble !== false) {
              message.value = step.text;
            }
            speak(step.text);
          }
          if (typeof step.motion === 'string') {
            playMotionInternal(step.motion, duration);
          }
          applyExpression(step.expression, duration);
          await delay(duration);
        } else if (t === 'bubble') {
          if (typeof step.text === 'string') {
            message.value = step.text;
          }
          await delay(duration);
        } else if (t === 'look_at') {
          isLookAtOverride.value = true;
          eyeOffset.value = { x: step.x || 0, y: step.y || 0 };
          setTimeout(() => {
            isLookAtOverride.value = false;
          }, duration);
          await delay(duration);
        } else if (t === 'wait') {
          await delay(duration);
        } else if (t === 'move') {
          const targetXPos = parsePosition(step.x, x.value, window.innerWidth - AGENT_SIZE.value);
          const targetYPos = parsePosition(step.y, y.value, window.innerHeight - AGENT_SIZE.value);
          const targetScale = typeof step.scale === 'number' ? step.scale : dynamicScale.value;

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
            x.value = targetXPos;
            y.value = targetYPos;
            dynamicScale.value = targetScale;
            await delay(duration);
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

async function handleSendMessage(text: string) {
  messages.value.push({ role: 'user', text });
  isLoading.value = true;
  message.value = 'Hmm...';

  const rawResponse = await sendMessageToAI(text, messages.value);

  isLoading.value = false;
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
          let logicName = String(m.name).toLowerCase().trim();
          if (logicName === 'forward') logicName = 'step_forward';
          else if (logicName === 'backward') logicName = 'step_back';
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
    const motion = legacyMotionMatch[1].trim().toLowerCase();
    const step: AvatarPlanStep = { type: 'motion', motion, duration: 2000 };
    queuedAvatarSteps.push(step);
    hasExplicitMotion = true;
  }
  cleanResponse = cleanResponse.replace(/\[MOTION:\s*[^\]]+?\]/g, '');

  if (!hasExplicitMotion && primaryEmotion) {
    const m =
      primaryEmotion === 'angry'
        ? 'shake'
        : primaryEmotion === 'happy'
          ? 'happy'
          : primaryEmotion === 'shy'
            ? 'friend'
            : primaryEmotion === 'dizzy'
              ? 'shake'
              : primaryEmotion === 'confused' || primaryEmotion === 'thinking'
                ? 'tap_body'
                : null;
    if (m) {
      const step: AvatarPlanStep = { type: 'motion', motion: m, duration: 1200 };
      queuedAvatarSteps.push(step);
      hasExplicitMotion = true;
    }
  }

  // Clean hidden commands
  const displayResponse = cleanResponse
    .replace(/highlight:\s*[^\n]+/g, '')
    .replace(/navigate:\s*[^\n]+/g, '')
    .replace(/click:\s*[^\n]+/g, '')
    .replace(/hover:\s*[^\n]+/g, '')
    .replace(/scroll:\s*[^\n]+/g, '')
    .replace(/input:\s*[^\n]+/g, '')
    .replace(/press:\s*[^\n]+/g, '')
    .replace(/plan:\s*\[[\s\S]*?\]/g, '')
    .trim();

  if (displayResponse) {
    messages.value.push({ role: 'agent', text: displayResponse });
    message.value = displayResponse;
    speak(displayResponse);
  } else {
    const fallback = "I'm on it!";
    messages.value.push({ role: 'agent', text: fallback });
    message.value = fallback;
    speak(fallback);
  }

  // Parse Commands
  if (parsedPlan) {
    try {
      console.log('Executing Plan:', parsedPlan);
      const result = await setPlan(parsedPlan);
      if (result.success) {
        applyExpression('happy', 4000);
        playMotionInternal('tap_body', 4000);
        messages.value.push({ role: 'agent', text: 'Mission Complete! Praise me! [HAPPY]' });
        message.value = 'Mission Complete! ✨';
        speak('Mission Complete! Praise me!');
      } else {
        applyExpression('shy', 4000);
        messages.value.push({
          role: 'agent',
          text: `Oops... I failed: ${result.message || 'Unknown error'}. [SHY]`
        });
        message.value = 'Oops... failed... 😖';
        speak("Oops... I failed... don't look at me!");
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
}

const triggerDizzy = () => {
  if (isDizzy.value || isFainted.value) return;
  isDizzy.value = true;
  message.value = "Whoa! I'm dizzy... @.@";
  playMotionInternal('shake', 3000);
  messages.value.push({
    role: 'user',
    text: '[System Event: User made you dizzy by circling the mouse around you.]'
  });
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
  isMoving.value = false;
  setTimeout(() => {
    isHeadHit.value = false;
    if (message.value === 'Ouch! My head! >_<') message.value = '';
  }, 2000);
};

// Interaction Processing
let interactionTimer: ReturnType<typeof setTimeout> | null = null;
function resetInteractionTimer() {
  if (interactionTimer) clearTimeout(interactionTimer);
  interactionTimer = setTimeout(processInteraction, 1500);
}

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

  let desc = '[System Event]: User interaction session ended. ';
  if (clicks > 0) desc += `User clicked you ${clicks} times. `;
  if (Math.abs(accumulatedAngle) > 360)
    desc += `User circled the mouse ${Math.round(accumulatedAngle)} degrees around you. `;
  desc += 'Decide how to react based on this combination.';

  console.log('Processing Interaction:', desc);
  handleSendMessage(desc);
  resetInteractionState();
}

function resetInteractionState() {
  interactionState.value = { clicks: 0, accumulatedAngle: 0, startTime: Date.now() };
}

const toggleChat = () => {
  const next = !chatOpen.value;
  chatOpen.value = next;
  if (chatOpen.value) {
    if (isMobile.value) {
      const size = AGENT_SIZE.value;
      x.value = (window.innerWidth - size) / 2;
      y.value = 40;
    }
    message.value = '';
  }
};

const handleClick = (event: MouseEvent) => {
  if (isInteractionLocked()) return;
  if (hasDraggedSinceMouseDown.value) {
    hasDraggedSinceMouseDown.value = false;
    return;
  }

  const hitAreas = live2dWidgetRef.value?.hitTest(event.clientX, event.clientY) || [];
  const normalizedHitAreas = hitAreas.map((h: string) => h.toLowerCase());

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
    const target = event.currentTarget as HTMLElement | null;
    if (target) {
      const rect = target.getBoundingClientRect();
      const relativeY = event.clientY - rect.top;
      isHead = relativeY >= 0 && relativeY <= rect.height * 0.3;
    }
  }

  if (isHead) {
    isHappy.value = true;
    isFainted.value = false;
    isAngry.value = false;
    isTired.value = false;
    energy.value = Math.min(MAX_ENERGY, energy.value + 20);
    message.value = '摸摸头就有精神了~';
    playMotionInternal('flick_head', 3000);
    setTimeout(() => {
      isHappy.value = false;
      if (message.value === '摸摸头就有精神了~') message.value = '';
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
            '喂喂，你手往哪儿放呢！',
            '不要乱戳啦，很痒的……',
            '再乱来我要生气了哦！',
            '明明可以好好说话的嘛！'
          ]
        : [
            'Hey, where are you touching!',
            'Don’t poke there...',
            'I will get mad if you keep this!',
            'You can just talk to me nicely!'
          ];
    message.value = shyMessages[Math.floor(Math.random() * shyMessages.length)];
    playMotionInternal('mood_angry', 3000);
    messages.value.push({
      role: 'user',
      text: '[System Event: User poked your body area. You feel shy/tsundere.]'
    });
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
            '哎呀，别戳啦，有点痒…… 😳',
            '再戳我就要脸红了……',
            '是有什么急事吗？可以直接说哦~',
            '呜……头都要晕了…… 💫'
          ]
        : [
            'Ah... that tickles... 😳',
            "Please don't poke so fast...",
            'Do you need something? Just ask~',
            "Waaah... I'm getting dizzy... 💫"
          ];
    message.value = shyMessages[Math.floor(Math.random() * shyMessages.length)];
    playMotionInternal('shake', 3000);
    clickCount.value = 0;
    messages.value.push({
      role: 'user',
      text: '[System Event: User poked you rapidly. You feel ticklish and shy.]'
    });
    return;
  }

  playMotionInternal('tap_body');
};

const handleMouseMove = (event: MouseEvent) => {
  if (isInteractionLocked()) return;
  if (isFainted.value || isAngry.value || isTired.value) return;

  hasMouseMoved.value = true;
  mouseX.value = event.clientX;
  mouseY.value = event.clientY;

  resetInteractionTimer();

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
  const loop = () => {
    if (!isDragging.value) {
      checkBoundaries();
      handleThrowCollisions();
    }
    updateEyeTracking();

    if (isDizzy.value || isFainted.value || isHeadHit.value) {
    } else if (isFollowingMouse.value) {
      const targetXPos = mouseX.value + MOUSE_FOLLOW_OFFSET.x;
      const targetYPos = mouseY.value + MOUSE_FOLLOW_OFFSET.y;
      const dx = targetXPos - x.value;
      const dy = targetYPos - y.value;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1) {
        x.value = lerp(x.value, targetXPos, LERP_FACTOR);
        y.value = lerp(y.value, targetYPos, LERP_FACTOR);
        if (energy.value > 0) {
          const newEnergy = Math.max(0, energy.value - ENERGY_DECAY_RATE);
          if (newEnergy !== energy.value) {
            energy.value = newEnergy;
            if (!isTired.value && energy.value <= TIRED_THRESHOLD && energy.value > 0) {
              isTired.value = true;
              message.value = '有点累了...';
            }
            if (energy.value === 0 && !isFainted.value) {
              isFainted.value = true;
              message.value = '好累... 不想动了';
            }
          }
        }
      } else if (!isDragging.value && !isMoving.value && energy.value < MAX_ENERGY) {
        energy.value = Math.min(MAX_ENERGY, energy.value + ENERGY_RECOVER_RATE);
        if (energy.value > TIRED_THRESHOLD && isTired.value && !isFainted.value)
          isTired.value = false;
      }
    } else if (!isDragging.value && !isMoving.value && energy.value < MAX_ENERGY) {
      energy.value = Math.min(MAX_ENERGY, energy.value + ENERGY_RECOVER_RATE);
      if (energy.value > TIRED_THRESHOLD && isTired.value && !isFainted.value)
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
const startIdleTalk = () => {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = window.setInterval(() => {
    if (chatOpen.value || isMoving.value || message.value || isDragging.value || isFainted.value)
      return;
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
      if (Math.random() > 0.7) {
        const randomIdles = ['idle', 'mail', 'morning', 'afternoon'];
        playMotionInternal(randomIdles[Math.floor(Math.random() * randomIdles.length)]);
      }
      if (Math.random() > 0.7) {
        const msgs = currentLang.value === 'zh' ? idleMessages.zh : idleMessages.en;
        message.value = msgs[Math.floor(Math.random() * msgs.length)];
      }
    }
    if (message.value)
      setTimeout(() => {
        if (!isTalking.value && !avatarPlanRunnerActive && avatarPlanQueue.length === 0)
          message.value = '';
      }, 3000);
  }, IDLE_TALK_INTERVAL);
};

let roamTimer: number | null = null;
const startRoaming = () => {
  moveRandomly();
  roamTimer = window.setInterval(() => {
    if (
      !isDragging.value &&
      !isHovered.value &&
      !isDizzy.value &&
      !isFainted.value &&
      !isHeadHit.value &&
      !chatOpen.value
    ) {
      moveRandomly();
    }
  }, MOVE_INTERVAL);
};

const moveRandomly = () => {
  const newPos = getRandomPosition(window.innerWidth, window.innerHeight, AGENT_SIZE.value);
  isMoving.value = true;
  x.value = newPos.x;
  y.value = newPos.y;
  if (energy.value > 0) {
    const newEnergy = Math.max(0, energy.value - 5);
    energy.value = newEnergy;
    if (!isTired.value && newEnergy <= TIRED_THRESHOLD && newEnergy > 0) {
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
  }, 2000);
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
  isMoving.value = false;
  if (!chatOpen.value) message.value = 'Hello!';
};

const handleMouseLeave = () => {
  isHovered.value = false;
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
    x.value = newX;
    y.value = newY;
    message.value = currentLang.value === 'zh' ? '哎呀，借过一下！' : 'Oops, excuse me!';
    setTimeout(() => {
      isMoving.value = false;
      if (!chatOpen.value) message.value = '';
    }, 1500);
  }
};

// --- Lifecycle ---
onMounted(async () => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth <= 768;
  });
  window.addEventListener('focusin', handleFocusIn);
  startLoop();
  startRoaming();
  startIdleTalk();
  await initAuth();

  // Expose for debugging/external control
  (window as any).runAgentPlan = (plan: any[]) => avatarAdapter.runPlan(plan);
});

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
        messages.value = history.map((msg: any) => ({
          role: msg.role === 'model' ? 'agent' : 'user',
          text: msg.parts?.[0]?.text || msg.text || ''
        }));
        messages.value.push({
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
      setTimeout(() => {
        isHappy.value = false;
        if (message.value === 'Mission Accomplished!') message.value = '';
        if (guideLabel.value === 'Done!') guideLabel.value = '';
      }, 3000);
      motionCommand.value = 'happy';
    } else if (newStatus === 'failed') {
      isConfused.value = true;
      message.value = 'Oops, something went wrong.';
      setTimeout(() => {
        isConfused.value = false;
        message.value = '';
      }, 3000);
    }
  }
);

const chatPlacement = computed(() => (y.value < 400 ? 'bottom' : 'top'));

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('focusin', handleFocusIn);
  cancelAnimationFrame(animationFrameId);
  if (roamTimer) clearInterval(roamTimer);
  if (idleTimer) clearInterval(idleTimer);
  if (dizzyTimeout) clearTimeout(dizzyTimeout);
});
</script>

<style scoped>
.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(20px);
}
</style>
