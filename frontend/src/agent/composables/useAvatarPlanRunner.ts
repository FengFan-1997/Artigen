import { nextTick, type ComputedRef, type Ref } from 'vue';
import type { Position } from '../types';
import type { AvatarPlanStep } from '../types/avatarPlan';

type AgentType = 'cubism3' | 'cubism2' | 'vrm';

const clampNumber = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

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
  speak: (text: string) => void;
  emitAgentEvent: (payload: { name: string; payload?: any }) => void;
}) {
  type QueuedAvatarPlan = { steps: any[]; resolve: () => void };

  const avatarPlanQueue: QueuedAvatarPlan[] = [];
  let avatarPlanRunnerActive = false;

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
        const motion = input.normalizeMotionName((raw as any).motion);
        const expression = normalizeExpressionName(
          (raw as any).expression,
          input.allowedExpressions
        );
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
        const motion = input.normalizeMotionName((raw as any).motion);
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
        const expression = normalizeExpressionName(
          (raw as any).expression,
          input.allowedExpressions
        );
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
        const motion = input.normalizeMotionName((raw as any).motion) || undefined;
        const expression = normalizeExpressionName(
          (raw as any).expression,
          input.allowedExpressions
        );
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

  const runAvatarPlanSteps = async (steps: any[]) => {
    const safeSteps = sanitizeAvatarPlanSteps(steps);
    if (safeSteps.length === 0) return;

    const parallelPromises: Promise<unknown>[] = [];

    for (const step of safeSteps) {
      const executeStep = async () => {
        try {
          const t = step?.type;
          const duration = typeof step?.duration === 'number' ? step.duration : 1200;

          if (t === 'pose') {
            input.playMotion(step.motion, duration);
            input.applyExpression(step.expression, duration);
            await delay(duration);
          } else if (t === 'motion') {
            input.playMotion(step.motion, duration);
            await delay(duration);
          } else if (t === 'expression') {
            input.applyExpression(step.expression, duration);
            await delay(duration);
          } else if (t === 'speak') {
            if (step.bubble !== false) input.message.value = step.text;
            input.speak(step.text);
            if (typeof step.motion === 'string') input.playMotion(step.motion, duration);
            input.applyExpression(step.expression, duration);
            await delay(duration);
          } else if (t === 'bubble') {
            input.message.value = step.text;
            await delay(duration);
          } else if (t === 'look_at') {
            input.isLookAtOverride.value = true;
            input.eyeOffset.value = { x: step.x, y: step.y };
            window.setTimeout(() => {
              input.isLookAtOverride.value = false;
            }, duration);
            await delay(duration);
          } else if (t === 'wait') {
            await delay(duration);
          } else if (t === 'move') {
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
              await delay(actualDuration);
              input.isMoving.value = false;
            }
          } else if (t === 'event') {
            input.emitAgentEvent({ name: step.name, payload: step.payload });
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

      if (step?.parallel) parallelPromises.push(executeStep());
      else await executeStep();
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
        await runAvatarPlanSteps(item.steps);
        item.resolve();
      }
    } finally {
      avatarPlanRunnerActive = false;
    }
  };

  const avatarAdapter = {
    playMotion: (name: string, duration?: number) => input.playMotion(name, duration),
    setEmotion: (expression: string | undefined, duration?: number) => {
      const d = typeof duration === 'number' ? duration : 1200;
      input.applyExpression(expression, d);
    },
    runPlan: async (steps: any[]) => {
      await enqueueAvatarPlan(steps);
    }
  };

  return {
    enqueueAvatarPlan,
    avatarAdapter
  };
}
