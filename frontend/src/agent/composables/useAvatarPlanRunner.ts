import { nextTick, type ComputedRef, type Ref } from 'vue';
import type { Position } from '../types';
import type { AvatarPlanStep } from '../types/avatarPlan';
import { MOTION_PRIORITY } from './useMotionArbitration';
import logger from '../utils/logger';

type AgentType = 'cubism3' | 'cubism2' | 'vrm';

const clampNumber = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const normalizeTempo = (raw: unknown): 'slow' | 'normal' | 'fast' | number | undefined => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return clampNumber(raw, 0.5, 2);
  if (typeof raw !== 'string') return undefined;
  const n = raw.trim().toLowerCase();
  if (!n) return undefined;
  if (n === 'slow' || n === 'slower') return 'slow';
  if (n === 'fast' || n === 'faster') return 'fast';
  if (n === 'normal' || n === 'default' || n === 'mid') return 'normal';
  const asNumber = Number(n);
  if (Number.isFinite(asNumber)) return clampNumber(asNumber, 0.5, 2);
  return undefined;
};

const tempoToMultiplier = (tempo: unknown) => {
  if (typeof tempo === 'number' && Number.isFinite(tempo)) return clampNumber(tempo, 0.5, 2);
  if (tempo === 'slow') return 1.25;
  if (tempo === 'fast') return 0.82;
  return 1;
};

const estimateSpeakDurationMs = (text: string) => {
  const s = (text || '').trim();
  if (!s) return 1200;
  const cjk = s.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g)?.length || 0;
  const punct = s.match(/[,.!?;:，。！？；：]/g)?.length || 0;
  if (cjk > 0) {
    const ms = 520 + cjk * 170 + punct * 140;
    return clampNumber(ms, 900, 12000);
  }
  const words = s.split(/\s+/).filter(Boolean).length || 1;
  const ms = 520 + words * 340 + punct * 160;
  return clampNumber(ms, 900, 12000);
};

const estimateBubbleDurationMs = (text: string) => {
  const s = (text || '').trim();
  if (!s) return 1200;
  const len = s.replace(/\s+/g, '').length;
  const punct = s.match(/[,.!?;:，。！？；：]/g)?.length || 0;
  const ms = 780 + len * 62 + punct * 120;
  return clampNumber(ms, 900, 12000);
};

const safeJsonStringify = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, Math.round(ms))));

const parsePosition = (val: number | string | undefined, current: number, max: number): number => {
  if (val === undefined) return current;
  if (typeof val === 'number') return val;
  if (val.endsWith('%')) {
    const p = parseFloat(val);
    return (p / 100) * max;
  }
  return parseFloat(val) || current;
};

const normalizeExpressionName = (
  raw: unknown,
  allowedExpressions: readonly string[]
): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const n = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  if (!n) return undefined;
  const mapped = n === 'pout' || n === 'pouting' ? 'shy' : n;
  if (allowedExpressions.includes(mapped)) return mapped;
  return undefined;
};

export function useAvatarPlanRunner(input: {
  agentType: Ref<AgentType>;
  uiMode?: 'default' | 'room';
  agentSize: ComputedRef<number>;
  x: Ref<number>;
  y: Ref<number>;
  dynamicScale: Ref<number>;
  moveTransitionMs: Ref<number>;
  isMoving: Ref<boolean>;
  isTeleporting: Ref<boolean>;
  isLookAtOverride: Ref<boolean>;
  eyeOffset: Ref<Position>;
  isTired: Ref<boolean>;
  message: Ref<string>;
  allowedExpressions: readonly string[];
  normalizeMotionName: (raw: unknown) => string | null;
  getPersonaText: () => string;
  playMotion: (name: string, duration?: number) => void;
  applyExpression: (expression: string | undefined, duration: number) => void;
  requestExpression?: (
    expression: string | undefined,
    duration: number,
    options?: { priority?: number; source?: string; force?: boolean }
  ) => boolean;
  speak: (text: string) => void;
  emitAgentEvent: (payload: { name: string; payload?: any }) => void;
  clearMotionChannel?: () => void;
  clearExpressionChannel?: () => void;
}) {
  type QueuedAvatarPlan = { steps: any[]; resolve: () => void };
  type AvatarPlanCancelState = { hard: number; soft: number };

  const avatarPlanQueue: QueuedAvatarPlan[] = [];
  let avatarPlanRunnerActive = false;
  let avatarPlanCancelToken = 0;
  let avatarPlanSoftCancelToken = 0;

  const cancelAvatarPlan = (options?: { mode?: 'hard' | 'soft' }) => {
    const mode = options?.mode === 'soft' ? 'soft' : 'hard';
    if (mode === 'hard') {
      avatarPlanCancelToken += 1;
      avatarPlanSoftCancelToken += 1;
    } else {
      avatarPlanSoftCancelToken += 1;
    }
    avatarPlanQueue.length = 0;
    if (typeof input.clearMotionChannel === 'function') input.clearMotionChannel();
    if (typeof input.clearExpressionChannel === 'function') input.clearExpressionChannel();
    input.isLookAtOverride.value = false;
  };

  const sanitizeAvatarPlanSteps = (rawSteps: any[]): AvatarPlanStep[] => {
    if (!Array.isArray(rawSteps)) return [];
    const result: AvatarPlanStep[] = [];
    const maxSteps = 12;
    const maxPlanScale = input.uiMode === 'room' ? 2.8 : 2;

    for (const raw of rawSteps) {
      if (result.length >= maxSteps) break;
      if (!raw || typeof raw !== 'object') continue;
      const t = String((raw as any).type || '')
        .trim()
        .toLowerCase();
      const parallel = !!(raw as any).parallel;
      const rawDuration = (raw as any).duration;
      const durationFromRaw =
        typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? rawDuration : undefined;
      const tempo = normalizeTempo((raw as any).tempo);
      const rawGap = (raw as any).gap ?? (raw as any).after;
      const gap =
        typeof rawGap === 'number' && Number.isFinite(rawGap)
          ? clampNumber(rawGap, 0, 5000)
          : undefined;
      const rawInterrupt = (raw as any).interrupt;
      const interrupt =
        typeof rawInterrupt === 'string'
          ? rawInterrupt.trim().toLowerCase() === 'soft'
            ? 'soft'
            : rawInterrupt.trim().toLowerCase() === 'hard'
              ? 'hard'
              : undefined
          : undefined;

      if (t === 'pose') {
        const motion = input.normalizeMotionName((raw as any).motion);
        const expression = normalizeExpressionName(
          (raw as any).expression,
          input.allowedExpressions
        );
        const duration = clampNumber(durationFromRaw ?? 1200, 120, 12000);
        if (motion) {
          result.push({
            type: 'pose',
            motion,
            expression,
            duration,
            parallel,
            tempo,
            gap,
            interrupt
          });
        } else if (expression) {
          result.push({
            type: 'expression',
            expression,
            duration,
            parallel,
            tempo,
            gap,
            interrupt
          });
        }
        continue;
      }

      if (t === 'motion') {
        const motion = input.normalizeMotionName((raw as any).motion);
        if (!motion) continue;
        const duration = clampNumber(durationFromRaw ?? 1200, 120, 12000);
        result.push({
          type: 'motion',
          motion,
          duration,
          parallel,
          tempo,
          gap,
          interrupt
        });
        continue;
      }

      if (t === 'expression' || t === 'emotion') {
        const expression = normalizeExpressionName(
          (raw as any).expression,
          input.allowedExpressions
        );
        if (!expression) continue;
        const duration = clampNumber(durationFromRaw ?? 1200, 120, 12000);
        result.push({
          type: 'expression',
          expression,
          duration,
          parallel,
          tempo,
          gap,
          interrupt
        });
        continue;
      }

      if (t === 'speak') {
        const text = typeof (raw as any).text === 'string' ? (raw as any).text.trim() : '';
        if (!text) continue;
        const motion = input.normalizeMotionName((raw as any).motion) || undefined;
        const expression = normalizeExpressionName(
          (raw as any).expression,
          input.allowedExpressions
        );
        const bubble = (raw as any).bubble !== false;
        const duration = clampNumber(durationFromRaw ?? estimateSpeakDurationMs(text), 240, 12000);
        result.push({
          type: 'speak',
          text: text.slice(0, 160),
          motion,
          expression,
          bubble,
          duration,
          parallel,
          tempo,
          gap,
          interrupt
        });
        continue;
      }

      if (t === 'bubble') {
        const text = typeof (raw as any).text === 'string' ? (raw as any).text.trim() : '';
        if (!text) continue;
        const duration = clampNumber(durationFromRaw ?? estimateBubbleDurationMs(text), 240, 12000);
        result.push({
          type: 'bubble',
          text: text.slice(0, 120),
          duration,
          parallel,
          tempo,
          gap,
          interrupt
        });
        continue;
      }

      if (t === 'look_at') {
        const x = clampNumber(
          typeof (raw as any).x === 'number' && Number.isFinite((raw as any).x)
            ? (raw as any).x
            : 0,
          -1,
          1
        );
        const y = clampNumber(
          typeof (raw as any).y === 'number' && Number.isFinite((raw as any).y)
            ? (raw as any).y
            : 0,
          -1,
          1
        );
        const duration = clampNumber(durationFromRaw ?? 1200, 120, 12000);
        result.push({
          type: 'look_at',
          x,
          y,
          duration,
          parallel,
          tempo,
          gap,
          interrupt
        });
        continue;
      }

      if (t === 'wait') {
        const duration = clampNumber(durationFromRaw ?? 1200, 120, 12000);
        result.push({ type: 'wait', duration, parallel, tempo, gap, interrupt });
        continue;
      }

      if (t === 'move') {
        const scaleRaw = (raw as any).scale;
        const scale =
          typeof scaleRaw === 'number' && Number.isFinite(scaleRaw)
            ? clampNumber(scaleRaw, 0.5, maxPlanScale)
            : undefined;
        const duration = clampNumber(durationFromRaw ?? 1200, 120, 12000);
        result.push({
          type: 'move',
          x: (raw as any).x,
          y: (raw as any).y,
          scale,
          immediate: !!(raw as any).immediate,
          duration,
          parallel,
          tempo,
          gap,
          interrupt
        });
        continue;
      }

      if (t === 'event') {
        const name =
          typeof (raw as any).name === 'string' ? (raw as any).name.trim().slice(0, 80) : '';
        if (!name) continue;
        const duration = clampNumber(durationFromRaw ?? 1200, 80, 1200);
        result.push({
          type: 'event',
          name,
          payload: (raw as any).payload,
          duration,
          parallel,
          tempo,
          gap,
          interrupt
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
          parallel,
          tempo,
          gap,
          interrupt
        });
        continue;
      }
    }

    return result;
  };

  const applyPlanExpression = (expression: string | undefined, duration: number) => {
    const exp = String(expression || '').trim();
    if (!exp) return false;
    if (typeof input.requestExpression === 'function') {
      return input.requestExpression(exp, duration, {
        priority: MOTION_PRIORITY.avatarPlan,
        source: 'avatarPlan',
        force: true
      });
    }
    input.applyExpression(exp, duration);
    return true;
  };

  const getStepDurationMs = (step: any) => {
    const base =
      typeof step?.duration === 'number' && Number.isFinite(step.duration) ? step.duration : 1200;
    const tempo = tempoToMultiplier(step?.tempo);
    return clampNumber(Math.round(base * tempo), 0, 12000);
  };

  const getStepGapMs = (step: any) => {
    const raw = step?.gap;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
    const tempo = tempoToMultiplier(step?.tempo);
    return clampNumber(Math.round(raw * tempo), 0, 5000);
  };

  const pickOne = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const splitWeights = (total: number, weights: number[]) => {
    const t = Math.max(120, Math.round(total));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map((w) => Math.max(0, w) / sum);
    const parts = raw.map((r) => Math.max(120, Math.round(t * r)));
    const overshoot = parts.reduce((a, b) => a + b, 0) - t;
    if (overshoot > 0) parts[parts.length - 1] = Math.max(120, parts[parts.length - 1] - overshoot);
    return parts;
  };

  const isPlanHardCancelled = (cancel: AvatarPlanCancelState) =>
    cancel.hard !== avatarPlanCancelToken;
  const isPlanSoftCancelled = (cancel: AvatarPlanCancelState) =>
    cancel.soft !== avatarPlanSoftCancelToken;

  const shouldPlanAbortNow = (cancel: AvatarPlanCancelState, interrupt: 'soft' | 'hard') => {
    if (isPlanHardCancelled(cancel)) return true;
    if (interrupt === 'hard' && isPlanSoftCancelled(cancel)) return true;
    return false;
  };

  const delayPlan = async (
    ms: number,
    cancel: AvatarPlanCancelState,
    interrupt: 'soft' | 'hard'
  ): Promise<boolean> => {
    const total = Math.max(0, Math.round(ms));
    if (total <= 0) return !shouldPlanAbortNow(cancel, interrupt);
    const start = Date.now();
    while (Date.now() - start < total) {
      if (shouldPlanAbortNow(cancel, interrupt)) return false;
      const elapsed = Date.now() - start;
      const left = total - elapsed;
      await delay(left <= 180 ? left : 120);
    }
    return !shouldPlanAbortNow(cancel, interrupt);
  };

  const requestPlanMotion = async (
    raw: string | undefined,
    duration: number,
    cancel: AvatarPlanCancelState,
    interrupt: 'soft' | 'hard'
  ) => {
    if (shouldPlanAbortNow(cancel, interrupt)) return false;
    const m = raw ? input.normalizeMotionName(raw) : null;
    if (m) input.playMotion(m, duration);
    return delayPlan(duration, cancel, interrupt);
  };

  const buildMotionSequence = (base: string) => {
    const m = input.normalizeMotionName(base) || base;
    const isVrm = input.agentType.value === 'vrm';

    const idleVariants = [
      'idle',
      'idle_look_around',
      'idle_think',
      'idle_sway_body',
      'tilt_left',
      'tilt_right'
    ];
    const settleVariants = ['idle', 'idle_sway_body', 'idle_look_around'];

    const safePick = (candidates: string[]) => {
      const ok = candidates.map((x) => input.normalizeMotionName(x)).filter(Boolean) as string[];
      return ok.length ? pickOne(ok) : null;
    };

    if (/^idle\b/i.test(m)) {
      if (m !== 'idle' && /^idle_/i.test(m)) return [m];
      const a = safePick(isVrm ? idleVariants : ['idle', 'tilt_left', 'tilt_right']) || m;
      const b = safePick(isVrm ? settleVariants : ['idle']) || 'idle';
      if (a === b) return [a];
      return [a, b];
    }

    if (m === 'point_left' || m === 'point_right') {
      const pre = safePick(['tilt_left', 'tilt_right', 'idle_look_around']);
      const post = safePick(['nod', 'idle_sway_body', 'idle']);
      return [pre, m, post].filter(Boolean) as string[];
    }

    if (m === 'wave') {
      const pre = safePick(['tilt_left', 'tilt_right']);
      const post = safePick(['idle_look_around', 'idle']);
      return [pre, m, post].filter(Boolean) as string[];
    }

    if (m === 'tap_body') {
      const pre = safePick(['idle_think', 'mood_confused', 'idle_look_around']);
      const post = safePick(['nod', 'idle']);
      return [pre, m, post].filter(Boolean) as string[];
    }

    if (m === 'mood_confused') {
      const pre = safePick(['tilt_left', 'tilt_right', 'idle_think']);
      const post = safePick(['tap_body', 'idle']);
      return [pre, m, post].filter(Boolean) as string[];
    }

    if (m === 'mood_tired' || m === 'mood_sleepy' || m === 'yawn') {
      const post = safePick(['crouch', 'idle', 'idle_sway_body']);
      return [m, post].filter(Boolean) as string[];
    }

    if (m === 'shake_head') {
      const post = safePick(['idle_think', 'idle']);
      return [m, post].filter(Boolean) as string[];
    }

    if (m === 'clap') {
      const post = safePick(['mood_happy', 'idle']);
      return [m, post].filter(Boolean) as string[];
    }

    return [m];
  };

  const runStyledPlanMotion = async (
    motion: string,
    duration: number,
    cancel: AvatarPlanCancelState,
    interrupt: 'soft' | 'hard'
  ) => {
    const total = clampNumber(duration, 120, 12000);
    const seq = buildMotionSequence(motion);
    if (seq.length <= 1 || total < 520) {
      return await requestPlanMotion(seq[0], total, cancel, interrupt);
    }
    const weights = seq.length === 2 ? [0.58, 0.42] : [0.22, 0.58, 0.2];
    const parts = splitWeights(total, weights.slice(0, seq.length));
    for (let i = 0; i < seq.length; i++) {
      const ok = await requestPlanMotion(seq[i], parts[i] || 300, cancel, interrupt);
      if (!ok) return false;
    }
    return true;
  };

  const runStyledPlanPose = async (
    motion: string,
    expression: string | undefined,
    duration: number,
    cancel: AvatarPlanCancelState,
    interrupt: 'soft' | 'hard'
  ) => {
    const total = clampNumber(duration, 120, 12000);
    if (expression) applyPlanExpression(expression, total);
    return await runStyledPlanMotion(motion, total, cancel, interrupt);
  };

  const runStyledPlanSpeak = async (
    step: {
      text: string;
      motion?: string;
      expression?: string;
      bubble?: boolean;
      duration: number;
      interrupt?: 'soft' | 'hard';
    },
    cancel: AvatarPlanCancelState
  ) => {
    const total = clampNumber(step.duration, 240, 12000);
    if (step.bubble !== false) input.message.value = step.text;
    input.speak(step.text);

    const baseMotion = step.motion || 'talking';
    const seq = buildMotionSequence(baseMotion);
    const extra =
      total >= 1600 && Math.random() < 0.6
        ? input.normalizeMotionName(pickOne(['nod', 'tilt_left', 'tilt_right', 'tap_body']))
        : null;
    const finalSeq = extra && seq.length === 1 ? [seq[0], extra] : seq;

    if (step.expression) applyPlanExpression(step.expression, total);

    const interrupt: 'soft' | 'hard' = step.interrupt === 'hard' ? 'hard' : 'soft';
    if (finalSeq.length <= 1) {
      return await requestPlanMotion(finalSeq[0], total, cancel, interrupt);
    }
    const weights =
      finalSeq.length === 2
        ? [0.65, 0.35]
        : finalSeq.length === 3
          ? [0.18, 0.64, 0.18]
          : Array.from({ length: finalSeq.length }, () => 1);
    const parts = splitWeights(total, weights.slice(0, finalSeq.length));
    for (let i = 0; i < finalSeq.length; i++) {
      const ok = await requestPlanMotion(finalSeq[i], parts[i] || 400, cancel, interrupt);
      if (!ok) return false;
    }
    return true;
  };

  const runAvatarPlanSteps = async (steps: any[], cancel: AvatarPlanCancelState) => {
    const safeSteps = sanitizeAvatarPlanSteps(steps);
    if (safeSteps.length === 0) return;

    const parallelPromises: Promise<unknown>[] = [];

    for (const step of safeSteps) {
      const executeStep = async () => {
        try {
          const t = step?.type;
          const duration = getStepDurationMs(step);
          const interrupt: 'soft' | 'hard' = step?.interrupt === 'hard' ? 'hard' : 'soft';

          if (shouldPlanAbortNow(cancel, interrupt)) return false;

          if (t === 'pose') {
            await runStyledPlanPose(step.motion, step.expression, duration, cancel, interrupt);
          } else if (t === 'motion') {
            await runStyledPlanMotion(step.motion, duration, cancel, interrupt);
          } else if (t === 'expression') {
            applyPlanExpression(step.expression, duration);
            await delayPlan(duration, cancel, interrupt);
          } else if (t === 'speak') {
            await runStyledPlanSpeak(
              {
                text: step.text,
                motion: step.motion,
                expression: step.expression,
                bubble: step.bubble,
                duration,
                interrupt
              },
              cancel
            );
          } else if (t === 'bubble') {
            input.message.value = step.text;
            await delayPlan(duration, cancel, interrupt);
          } else if (t === 'look_at') {
            input.isLookAtOverride.value = true;
            input.eyeOffset.value = { x: step.x, y: step.y };
            window.setTimeout(() => {
              input.isLookAtOverride.value = false;
            }, duration);
            await delayPlan(duration, cancel, interrupt);
          } else if (t === 'wait') {
            await delayPlan(duration, cancel, interrupt);
          } else if (t === 'move') {
            if (input.uiMode === 'room') {
              if (typeof step.scale === 'number') {
                input.dynamicScale.value = clampNumber(step.scale, 0.5, 2.8);
              }
              await delayPlan(duration, cancel, interrupt);
              return true;
            }

            const maxX = window.innerWidth - input.agentSize.value;
            const maxY = window.innerHeight - input.agentSize.value;
            const rawX = parsePosition(step.x, input.x.value, maxX);
            const rawY = parsePosition(step.y, input.y.value, maxY);
            const targetXPos = clampNumber(rawX, -100, maxX + 100);
            const targetYPos = clampNumber(rawY, -50, maxY + 50);
            const targetScale =
              typeof step.scale === 'number'
                ? clampNumber(step.scale, 0.5, 2)
                : input.dynamicScale.value;
            const persona = input.getPersonaText();
            const isLazy = /(懒散|慵懒|懒|lazy|sleepy|tired)/i.test(persona);
            const moveFactor = isLazy ? 1.6 : 1;
            const tiredFactor = input.isTired.value ? 2.2 : 1;
            const actualDuration = Math.max(200, Math.round(duration * moveFactor * tiredFactor));
            input.moveTransitionMs.value = actualDuration;

            if (step.immediate) {
              input.isTeleporting.value = true;
              input.x.value = targetXPos;
              input.y.value = targetYPos;
              input.dynamicScale.value = targetScale;
              await nextTick();
              window.setTimeout(() => {
                input.isTeleporting.value = false;
              }, 50);
            } else {
              input.isMoving.value = true;
              input.x.value = targetXPos;
              input.y.value = targetYPos;
              input.dynamicScale.value = targetScale;
              if (input.agentType.value === 'vrm')
                input.playMotion('activity', Math.min(2600, actualDuration));
              await delayPlan(actualDuration, cancel, interrupt);
              input.isMoving.value = false;
            }
          } else if (t === 'event') {
            input.emitAgentEvent({ name: step.name, payload: step.payload });
            await delayPlan(100, cancel, interrupt);
          } else if (t === 'console') {
            logger.info('[AvatarPlan]', step.message);
          } else {
            await delayPlan(duration, cancel, interrupt);
          }
        } catch (err) {
          logger.error('Error executing step', { step }, err);
        }
        if (isPlanHardCancelled(cancel)) return false;
        return true;
      };

      if (step?.parallel) {
        if (!isPlanSoftCancelled(cancel)) parallelPromises.push(executeStep());
      } else {
        const ok = await executeStep();
        if (!ok) return;
        if (isPlanSoftCancelled(cancel)) return;
        const gapMs = getStepGapMs(step);
        if (gapMs > 0) {
          const gapOk = await delayPlan(gapMs, cancel, 'soft');
          if (!gapOk) return;
        }
      }
    }

    if (parallelPromises.length > 0) {
      await Promise.all(parallelPromises.map((p) => p.catch(() => undefined)));
    }
  };

  const enqueueAvatarPlan = (steps: any[]): Promise<void> => {
    if (!steps || !Array.isArray(steps) || steps.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      avatarPlanQueue.push({ steps, resolve });
      void startAvatarPlanRunner();
    });
  };

  const startAvatarPlanRunner = async () => {
    if (avatarPlanRunnerActive) return;
    avatarPlanRunnerActive = true;
    try {
      while (avatarPlanQueue.length > 0) {
        const item = avatarPlanQueue.shift();
        if (!item) continue;
        const cancel: AvatarPlanCancelState = {
          hard: avatarPlanCancelToken,
          soft: avatarPlanSoftCancelToken
        };
        await runAvatarPlanSteps(item.steps, cancel);
        item.resolve();
      }
    } finally {
      avatarPlanRunnerActive = false;
    }
  };

  const avatarAdapter = {
    playMotion: (name: string, duration?: number) => {
      const normalized = input.normalizeMotionName(name);
      if (!normalized) return;
      input.playMotion(normalized, duration);
    },
    setEmotion: (expression: string | undefined, duration?: number) => {
      const d = typeof duration === 'number' ? duration : 1200;
      const exp = normalizeExpressionName(expression, input.allowedExpressions);
      if (!exp) return;
      applyPlanExpression(exp, d);
    },
    runPlan: async (steps: any[]) => {
      await enqueueAvatarPlan(steps);
    }
  };

  return {
    enqueueAvatarPlan,
    cancelAvatarPlan,
    avatarAdapter
  };
}
