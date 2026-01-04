import { ref, type Ref } from 'vue';
import type { PersonaTraits } from './persona';

export type VrmIdlePhase = 'stand' | 'tired' | 'rest' | 'recover';

export const createVrmIdleStateMachine = <T extends string>(input: {
  agentType: Ref<T>;
  chatOpen: Ref<boolean>;
  energy: Ref<number>;
  lastUserActivityAt: Ref<number>;
  personaTraits: Ref<PersonaTraits>;
  isExecuting: Ref<boolean>;
  isLoading: Ref<boolean>;
  isBackgroundReacting: Ref<boolean>;
  isFainted: Ref<boolean>;
  isDizzy: Ref<boolean>;
  isDragging: Ref<boolean>;
  isMoving: Ref<boolean>;
  isTalking: Ref<boolean>;
  isHovered: Ref<boolean>;
  isHeadHit: Ref<boolean>;
  isTired: Ref<boolean>;
  tiredThreshold: number;
  playMotion: (name: string, duration?: number) => void;
  recordSystemEvent: (text: string, type?: string) => void;
}) => {
  const phase = ref<VrmIdlePhase>('stand');
  let phaseSince = Date.now();
  let lastTickAt = 0;
  let lastPhaseMotionAt = 0;

  const setPhase = (next: VrmIdlePhase, reason?: string) => {
    if (String(input.agentType.value) !== 'vrm') return;
    if (phase.value === next) return;
    phase.value = next;
    phaseSince = Date.now();

    if (next === 'stand') {
      if (!input.isFainted.value) input.isTired.value = false;
    } else if (next === 'tired') {
      if (!input.isFainted.value) input.isTired.value = true;
    } else if (next === 'rest') {
      if (!input.isFainted.value) input.isTired.value = true;
    } else if (next === 'recover') {
      if (!input.isFainted.value) input.isTired.value = false;
    }

    const now = Date.now();
    if (now - lastPhaseMotionAt > 1200 && !input.isExecuting.value) {
      lastPhaseMotionAt = now;
      if (next === 'stand') input.playMotion('idle', 900);
      else if (next === 'tired') input.playMotion('mood_tired', 2200);
      else if (next === 'rest') input.playMotion('idle_breathe_deep', 3200);
      else if (next === 'recover') input.playMotion('stretch', 2600);
    }

    const r = String(reason || '').trim();
    if (r)
      input.recordSystemEvent(`[System Event: VRM idle phase -> ${next} (${r})]`, 'idle_phase');
  };

  const tick = () => {
    if (String(input.agentType.value) !== 'vrm') return;
    if (input.isExecuting.value || input.isLoading.value || input.isBackgroundReacting.value)
      return;
    if (input.isFainted.value) return;

    const now = Date.now();
    if (now - lastTickAt < 700) return;
    lastTickAt = now;

    const idleForMs = now - input.lastUserActivityAt.value;
    const hasRecentUserAction = idleForMs < 3500;
    const busy =
      input.chatOpen.value ||
      input.isDragging.value ||
      input.isMoving.value ||
      input.isTalking.value ||
      input.isHovered.value ||
      input.isHeadHit.value ||
      input.isDizzy.value;

    const restEnergy = 6;
    const recoverEnergy = 28;
    const standEnergy = input.tiredThreshold + 8;
    const wantsLazyRest = input.personaTraits.value.lazy && idleForMs > 65000;

    if (busy || hasRecentUserAction) {
      if (phase.value === 'rest') setPhase('recover', 'user_activity');
      else if (phase.value === 'tired' && input.energy.value > standEnergy)
        setPhase('stand', 'user_activity');
      else if (phase.value === 'recover' && input.energy.value > standEnergy)
        setPhase('stand', 'user_activity');
      return;
    }

    if (phase.value === 'stand') {
      if (input.energy.value > 0 && input.energy.value <= input.tiredThreshold)
        setPhase('tired', 'low_energy');
      else if (wantsLazyRest) setPhase('tired', 'long_idle');
      return;
    }

    if (phase.value === 'tired') {
      if (input.energy.value <= restEnergy || wantsLazyRest) setPhase('rest', 'need_rest');
      else if (input.energy.value > standEnergy) setPhase('stand', 'recovered');
      return;
    }

    if (phase.value === 'rest') {
      if (input.energy.value >= recoverEnergy) setPhase('recover', 'recharge');
      return;
    }

    if (phase.value === 'recover') {
      if (input.energy.value > standEnergy && now - phaseSince > 3500) setPhase('stand', 'done');
      else if (input.energy.value > 0 && input.energy.value <= input.tiredThreshold)
        setPhase('tired', 'still_tired');
    }
  };

  return { phase, setPhase, tick };
};
