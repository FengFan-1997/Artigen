import type { Ref } from 'vue';
import type { PersonaTraits } from './persona';
import type { InteractionMetrics, SemanticInteractionContext } from '../utils/semanticEvents';

export type EmotionVector = {
  valence: number;
  arousal: number;
  trust: number;
  shyness: number;
  annoyance: number;
  fatigue: number;
  dizziness: number;
  curiosity: number;
};

export type EmotionDerived = {
  happy: number;
  angry: number;
  pouting: number;
  confused: number;
  tired: number;
  dizzy: number;
};

export type EmotionSnapshot = {
  v: EmotionVector;
  d: EmotionDerived;
  updatedAt: number;
};

export type EmotionMicroReaction = {
  motion?: string;
  expression?: string;
  lockMs?: number;
  message?: { zh: string; en: string };
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const expApproach = (cur: number, target: number, dtMs: number, halfLifeMs: number) => {
  const hl = Math.max(1, halfLifeMs);
  const t = Math.max(0, dtMs);
  const k = Math.pow(0.5, t / hl);
  return target + (cur - target) * k;
};

const satExp = (x: number, k: number) => {
  const kk = Math.max(0.0001, k);
  const xx = Math.max(0, Number.isFinite(x) ? x : 0);
  return 1 - Math.exp(-xx / kk);
};

const makeDrive = (): EmotionVector => ({
  valence: 0,
  arousal: 0,
  trust: 0,
  shyness: 0,
  annoyance: 0,
  fatigue: 0,
  dizziness: 0,
  curiosity: 0
});

const pickWeighted = <T>(items: Array<{ item: T; w: number }>): T | null => {
  const filtered = items.filter((x) => Number.isFinite(x.w) && x.w > 0);
  let sum = 0;
  for (const x of filtered) sum += x.w;
  if (sum <= 0) return null;
  let r = Math.random() * sum;
  for (const x of filtered) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return filtered[filtered.length - 1]?.item ?? null;
};

const computeBaseline = (t: PersonaTraits): EmotionVector => {
  const valence =
    (t.cheerful ? 0.18 : 0) +
    (t.gentle ? 0.12 : 0) +
    (t.elegant ? 0.05 : 0) +
    (t.cold ? -0.12 : 0) +
    (t.strict ? -0.05 : 0);
  const arousal =
    0.44 +
    (t.warrior || t.teasing ? 0.08 : 0) +
    (t.teasing ? 0.06 : 0) +
    (t.shy ? -0.07 : 0) +
    (t.lazy ? -0.06 : 0);
  const trust = 0.52 + (t.gentle ? 0.1 : 0) + (t.strict ? -0.06 : 0) + (t.cold ? -0.04 : 0);
  const shyness = 0.28 + (t.shy ? 0.32 : 0) + (t.warrior || t.teasing ? -0.12 : 0);
  const annoyance = 0.16 + (t.strict ? 0.06 : 0) + (t.teasing ? 0.04 : 0);
  const fatigue = 0.14 + (t.lazy ? 0.1 : 0) + (t.strict ? -0.05 : 0);
  const dizziness = 0;
  const curiosity = 0.32 + (t.mystic ? 0.08 : 0) + (t.cold ? -0.04 : 0);
  return {
    valence: clamp(valence, -1, 1),
    arousal: clamp01(arousal),
    trust: clamp01(trust),
    shyness: clamp01(shyness),
    annoyance: clamp01(annoyance),
    fatigue: clamp01(fatigue),
    dizziness: clamp01(dizziness),
    curiosity: clamp01(curiosity)
  };
};

const derive = (v: EmotionVector): EmotionDerived => {
  const happy = clamp01(v.valence * 0.75 + (v.trust - 0.45) * 0.55 + 0.12 - v.annoyance * 0.85);
  const angry = clamp01(v.annoyance * 0.9 + -v.valence * 0.45 + (v.arousal - 0.45) * 0.25);
  const pouting = clamp01(v.shyness * 0.55 + v.annoyance * 0.35 + (0.42 - v.trust) * 0.35);
  const confused = clamp01(v.curiosity * 0.35 + v.dizziness * 0.65 + (0.58 - v.trust) * 0.18);
  const tired = clamp01(v.fatigue * 0.9 + (0.48 - v.arousal) * 0.12);
  const dizzy = clamp01(v.dizziness);
  return { happy, angry, pouting, confused, tired, dizzy };
};

export const createEmotionEngine = (input: { personaTraits: Ref<PersonaTraits> }) => {
  const baseline = computeBaseline(input.personaTraits.value);
  const snapshot: EmotionSnapshot = {
    v: { ...baseline },
    d: derive(baseline),
    updatedAt: Date.now()
  };
  const drive = makeDrive();
  const mood = makeDrive();

  const decayDrive = (dtMs: number) => {
    const dt = Math.max(0, Math.min(200, Number.isFinite(dtMs) ? dtMs : 0));
    if (dt <= 0) return;
    drive.valence = expApproach(drive.valence, 0, dt, 6500);
    drive.arousal = expApproach(drive.arousal, 0, dt, 5200);
    drive.trust = expApproach(drive.trust, 0, dt, 12000);
    drive.shyness = expApproach(drive.shyness, 0, dt, 8800);
    drive.annoyance = expApproach(drive.annoyance, 0, dt, 7200);
    drive.curiosity = expApproach(drive.curiosity, 0, dt, 7800);
    drive.dizziness = expApproach(drive.dizziness, 0, dt, 5200);
    drive.fatigue = expApproach(drive.fatigue, 0, dt, 16000);
  };

  const decayMood = (dtMs: number) => {
    const dt = Math.max(0, Math.min(200, Number.isFinite(dtMs) ? dtMs : 0));
    if (dt <= 0) return;
    mood.valence = expApproach(mood.valence, 0, dt, 160000);
    mood.arousal = expApproach(mood.arousal, 0, dt, 130000);
    mood.trust = expApproach(mood.trust, 0, dt, 420000);
    mood.shyness = expApproach(mood.shyness, 0, dt, 240000);
    mood.annoyance = expApproach(mood.annoyance, 0, dt, 210000);
    mood.curiosity = expApproach(mood.curiosity, 0, dt, 210000);
    mood.dizziness = expApproach(mood.dizziness, 0, dt, 120000);
    mood.fatigue = expApproach(mood.fatigue, 0, dt, 320000);
  };

  const clampMood = () => {
    mood.valence = clamp(mood.valence, -0.35, 0.35);
    mood.arousal = clamp(mood.arousal, -0.25, 0.25);
    mood.trust = clamp(mood.trust, -0.25, 0.25);
    mood.shyness = clamp(mood.shyness, -0.25, 0.25);
    mood.annoyance = clamp(mood.annoyance, -0.3, 0.3);
    mood.curiosity = clamp(mood.curiosity, -0.25, 0.25);
    mood.dizziness = clamp(mood.dizziness, -0.2, 0.2);
    mood.fatigue = clamp(mood.fatigue, -0.25, 0.25);
  };

  const computeTarget = (t: PersonaTraits): EmotionVector => {
    const base = computeBaseline(t);
    const valence = base.valence + mood.valence + drive.valence;
    const fatigue = base.fatigue + mood.fatigue + drive.fatigue;
    const arousalBias = -clamp01(fatigue) * 0.1;
    return {
      valence: clamp(valence, -1, 1),
      arousal: clamp01(base.arousal + arousalBias + mood.arousal + drive.arousal),
      trust: clamp01(base.trust + mood.trust + drive.trust),
      shyness: clamp01(base.shyness + mood.shyness + drive.shyness),
      annoyance: clamp01(base.annoyance + mood.annoyance + drive.annoyance),
      fatigue: clamp01(fatigue),
      dizziness: clamp01(base.dizziness + mood.dizziness + drive.dizziness),
      curiosity: clamp01(base.curiosity + mood.curiosity + drive.curiosity)
    };
  };

  const approachSnapshotToTarget = (target: EmotionVector, dtMs: number) => {
    const dt = Math.max(0, Math.min(200, Number.isFinite(dtMs) ? dtMs : 0));
    if (dt <= 0) return;
    snapshot.v.valence = expApproach(snapshot.v.valence, target.valence, dt, 2200);
    snapshot.v.arousal = expApproach(snapshot.v.arousal, target.arousal, dt, 1600);
    snapshot.v.trust = expApproach(snapshot.v.trust, target.trust, dt, 3600);
    snapshot.v.shyness = expApproach(snapshot.v.shyness, target.shyness, dt, 2400);
    snapshot.v.annoyance = expApproach(snapshot.v.annoyance, target.annoyance, dt, 2000);
    snapshot.v.curiosity = expApproach(snapshot.v.curiosity, target.curiosity, dt, 2000);
    snapshot.v.dizziness = expApproach(snapshot.v.dizziness, target.dizziness, dt, 1500);
    snapshot.v.fatigue = expApproach(snapshot.v.fatigue, target.fatigue, dt, 5200);
  };

  const applyRealtimeState = (state: {
    dtMs: number;
    isTalking?: boolean;
    isHovered?: boolean;
    isMoving?: boolean;
    isExecuting?: boolean;
    isFainted?: boolean;
    isDizzy?: boolean;
  }) => {
    const dt = Math.max(0, Math.min(200, Number.isFinite(state.dtMs) ? state.dtMs : 0));
    const scale = dt / 1000;
    if (scale <= 0) return;

    if (state.isFainted) {
      decayDrive(dt);
      decayMood(dt);
      snapshot.v.arousal = expApproach(snapshot.v.arousal, 0.08, dt, 2200);
      snapshot.v.curiosity = expApproach(snapshot.v.curiosity, 0.1, dt, 4200);
      snapshot.v.annoyance = expApproach(snapshot.v.annoyance, 0.05, dt, 5200);
      snapshot.v.shyness = expApproach(snapshot.v.shyness, 0.2, dt, 5200);
      snapshot.v.valence = expApproach(snapshot.v.valence, -0.05, dt, 5200);
      snapshot.v.trust = expApproach(snapshot.v.trust, 0.25, dt, 5200);
      snapshot.v.fatigue = expApproach(snapshot.v.fatigue, 0.55, dt, 5200);
      snapshot.v.dizziness = expApproach(snapshot.v.dizziness, 0.2, dt, 5200);
      snapshot.d = derive(snapshot.v);
      snapshot.updatedAt = Date.now();
      return;
    }

    const t = input.personaTraits.value;

    if (state.isTalking) {
      drive.arousal = clamp(drive.arousal + 0.04 * scale, -0.5, 0.5);
      drive.valence = clamp(drive.valence + 0.055 * scale, -0.5, 0.5);
      drive.trust = clamp(drive.trust + 0.02 * scale, -0.4, 0.4);
      drive.annoyance = clamp(drive.annoyance + (t.tsundere ? -0.01 : -0.016) * scale, -0.5, 0.7);
      drive.curiosity = clamp(drive.curiosity + 0.014 * scale, -0.5, 0.6);
      mood.valence = clamp(mood.valence + 0.006 * scale, -0.35, 0.35);
      mood.trust = clamp(mood.trust + 0.003 * scale, -0.25, 0.25);
    }

    if (state.isHovered) {
      drive.arousal = clamp(drive.arousal + 0.02 * scale, -0.5, 0.5);
      drive.shyness = clamp(drive.shyness + (t.shy ? 0.05 : 0.02) * scale, -0.4, 0.7);
      drive.curiosity = clamp(drive.curiosity + 0.03 * scale, -0.5, 0.7);
      if (t.cold) drive.annoyance = clamp(drive.annoyance + 0.012 * scale, -0.5, 0.7);
      mood.curiosity = clamp(mood.curiosity + 0.004 * scale, -0.25, 0.25);
    }

    if (state.isMoving || state.isExecuting) {
      drive.arousal = clamp(drive.arousal + 0.03 * scale, -0.5, 0.6);
      drive.fatigue = clamp(drive.fatigue + 0.02 * scale, -0.3, 0.8);
      mood.fatigue = clamp(mood.fatigue + 0.004 * scale, -0.25, 0.25);
    }

    if (state.isDizzy) {
      drive.dizziness = clamp(drive.dizziness + 0.04 * scale, -0.2, 0.9);
      drive.arousal = clamp(drive.arousal + 0.02 * scale, -0.5, 0.6);
      drive.valence = clamp(drive.valence - 0.012 * scale, -0.6, 0.5);
      mood.dizziness = clamp(mood.dizziness + 0.006 * scale, -0.2, 0.2);
    }

    decayDrive(dt);
    decayMood(dt);
    clampMood();
    const target = computeTarget(t);
    approachSnapshotToTarget(target, dt);
    snapshot.d = derive(snapshot.v);
    snapshot.updatedAt = Date.now();
  };

  const tick = (dtMs: number) => {
    const t = input.personaTraits.value;
    const dt = Math.max(0, Math.min(200, Number.isFinite(dtMs) ? dtMs : 0));
    decayDrive(dt);
    decayMood(dt);
    clampMood();
    const target = computeTarget(t);
    approachSnapshotToTarget(target, dt);
    snapshot.d = derive(snapshot.v);
    snapshot.updatedAt = Date.now();
  };

  const applyHitAreas = (areas: string[]) => {
    const s = areas.map((x) => String(x || '').toLowerCase());
    const t = input.personaTraits.value;

    if (s.includes('head') || s.includes('hair') || s.includes('accessory')) {
      drive.valence = clamp(drive.valence + (t.tsundere ? 0.06 : 0.1), -0.6, 0.6);
      drive.trust = clamp(drive.trust + 0.04, -0.4, 0.6);
      drive.arousal = clamp(drive.arousal + 0.05, -0.5, 0.6);
      drive.shyness = clamp(drive.shyness + (t.shy ? 0.05 : 0.02), -0.4, 0.7);
      drive.annoyance = clamp(drive.annoyance + (t.strict ? 0.02 : -0.02), -0.5, 0.7);
      mood.valence = clamp(mood.valence + 0.02, -0.35, 0.35);
      mood.trust = clamp(mood.trust + 0.012, -0.25, 0.25);
    } else if (s.includes('face')) {
      drive.arousal = clamp(drive.arousal + 0.06, -0.5, 0.7);
      drive.shyness = clamp(drive.shyness + 0.06, -0.4, 0.8);
      drive.curiosity = clamp(drive.curiosity + 0.04, -0.5, 0.7);
      if (t.cold) drive.annoyance = clamp(drive.annoyance + 0.02, -0.5, 0.7);
      mood.shyness = clamp(mood.shyness + 0.012, -0.25, 0.25);
    } else if (s.includes('body')) {
      drive.arousal = clamp(drive.arousal + 0.08, -0.5, 0.8);
      drive.shyness = clamp(drive.shyness + 0.08, -0.4, 0.85);
      drive.trust = clamp(drive.trust - 0.08, -0.6, 0.6);
      drive.valence = clamp(drive.valence - 0.06, -0.7, 0.6);
      drive.annoyance = clamp(drive.annoyance + (t.gentle ? 0.08 : 0.14), -0.5, 0.85);
      mood.annoyance = clamp(mood.annoyance + 0.02, -0.3, 0.3);
    } else if (s.includes('legs')) {
      drive.arousal = clamp(drive.arousal + 0.06, -0.5, 0.75);
      drive.shyness = clamp(drive.shyness + 0.06, -0.4, 0.85);
      drive.trust = clamp(drive.trust - 0.05, -0.6, 0.6);
      drive.annoyance = clamp(drive.annoyance + 0.08, -0.5, 0.9);
      mood.annoyance = clamp(mood.annoyance + 0.016, -0.3, 0.3);
    }

    drive.fatigue = clamp(drive.fatigue + 0.008, -0.4, 0.9);
    mood.fatigue = clamp(mood.fatigue + 0.003, -0.25, 0.25);
    clampMood();
    approachSnapshotToTarget(computeTarget(t), 80);
    snapshot.d = derive(snapshot.v);
    snapshot.updatedAt = Date.now();
  };

  const applyInteractionSession = (
    metrics: InteractionMetrics,
    semantic: SemanticInteractionContext
  ) => {
    const t = input.personaTraits.value;
    const tags = Array.isArray(semantic?.tags) ? semantic.tags : [];
    const clicks = Math.max(0, metrics?.clickCount || 0);
    const spin = Math.abs(metrics?.spinDegrees || 0);
    const maxSpeed = Math.max(0, metrics?.maxSpeed || 0);
    const durationMs = Math.max(0, metrics?.durationMs || 0);
    const clickF = satExp(clicks, 3);
    const spinF = satExp(spin / 180, 1);
    const speedF = satExp(maxSpeed, 1.1);
    const durF = satExp(durationMs / 1400, 1);

    if (spin >= 360) {
      drive.dizziness = clamp(drive.dizziness + 0.65 * spinF, -0.2, 0.95);
      drive.arousal = clamp(drive.arousal + 0.16 * spinF, -0.5, 0.8);
      drive.valence = clamp(drive.valence - 0.08 * spinF, -0.8, 0.6);
      mood.dizziness = clamp(mood.dizziness + 0.06 * spinF, -0.2, 0.2);
    } else if (spin >= 180) {
      drive.dizziness = clamp(drive.dizziness + 0.28 * spinF, -0.2, 0.9);
      drive.arousal = clamp(drive.arousal + 0.08 * spinF, -0.5, 0.75);
      mood.dizziness = clamp(mood.dizziness + 0.04 * spinF, -0.2, 0.2);
    }

    if (clicks >= 6) {
      drive.arousal = clamp(drive.arousal + 0.2 * clickF, -0.5, 0.85);
      drive.annoyance = clamp(drive.annoyance + (t.gentle ? 0.14 : 0.22) * clickF, -0.5, 0.95);
      drive.valence = clamp(drive.valence - 0.08 * clickF, -0.9, 0.6);
      mood.annoyance = clamp(mood.annoyance + 0.035 * clickF, -0.3, 0.3);
    } else if (clicks >= 3) {
      drive.arousal = clamp(drive.arousal + 0.12 * clickF, -0.5, 0.8);
      drive.annoyance = clamp(drive.annoyance + (t.gentle ? 0.06 : 0.12) * clickF, -0.5, 0.85);
      mood.annoyance = clamp(mood.annoyance + 0.02 * clickF, -0.3, 0.3);
    }

    if (maxSpeed >= 1.4) {
      drive.arousal = clamp(drive.arousal + 0.1 * speedF, -0.5, 0.85);
      drive.annoyance = clamp(drive.annoyance + (t.cold ? 0.06 : 0.03) * speedF, -0.5, 0.9);
    }

    if (durationMs >= 1200 && metrics?.avgSpeed <= 0.25) {
      drive.shyness = clamp(drive.shyness + 0.05 * durF, -0.4, 0.85);
      drive.curiosity = clamp(drive.curiosity + 0.05 * durF, -0.5, 0.85);
      mood.curiosity = clamp(mood.curiosity + 0.012 * durF, -0.25, 0.25);
    }

    if (tags.includes('USER_PATS_HEAD')) {
      drive.valence = clamp(drive.valence + 0.12, -0.7, 0.7);
      drive.trust = clamp(drive.trust + 0.08, -0.4, 0.8);
      mood.valence = clamp(mood.valence + 0.03, -0.35, 0.35);
      mood.trust = clamp(mood.trust + 0.02, -0.25, 0.25);
    }
    if (tags.includes('USER_TOUCHES_HAIR')) {
      drive.valence = clamp(drive.valence + 0.08, -0.7, 0.7);
      drive.trust = clamp(drive.trust + 0.04, -0.4, 0.75);
      drive.curiosity = clamp(drive.curiosity + 0.04, -0.5, 0.85);
      drive.shyness = clamp(drive.shyness + (t.shy ? 0.04 : 0.02), -0.4, 0.85);
      mood.valence = clamp(mood.valence + 0.016, -0.35, 0.35);
      mood.trust = clamp(mood.trust + 0.01, -0.25, 0.25);
    }
    if (tags.includes('USER_TOUCHES_ACCESSORY')) {
      drive.curiosity = clamp(drive.curiosity + 0.12, -0.5, 0.9);
      drive.arousal = clamp(drive.arousal + 0.06, -0.5, 0.8);
      mood.curiosity = clamp(mood.curiosity + 0.018, -0.25, 0.25);
    }
    if (tags.includes('USER_TOUCHES_HAND')) {
      drive.valence = clamp(drive.valence + 0.06, -0.75, 0.75);
      drive.trust = clamp(drive.trust + 0.03, -0.4, 0.75);
      drive.shyness = clamp(drive.shyness + (t.tsundere ? 0.05 : 0.02), -0.4, 0.9);
      mood.trust = clamp(mood.trust + 0.012, -0.25, 0.25);
    }
    if (tags.includes('USER_TOUCHES_BODY')) {
      drive.trust = clamp(drive.trust - 0.08, -0.7, 0.7);
      drive.annoyance = clamp(drive.annoyance + (t.gentle ? 0.08 : 0.16), -0.5, 0.95);
      drive.shyness = clamp(drive.shyness + 0.07, -0.4, 0.9);
      drive.valence = clamp(drive.valence - 0.06, -0.9, 0.7);
      mood.annoyance = clamp(mood.annoyance + 0.028, -0.3, 0.3);
    }
    if (tags.includes('USER_TOUCHES_MOUTH')) {
      drive.trust = clamp(drive.trust - 0.06, -0.7, 0.7);
      drive.annoyance = clamp(drive.annoyance + (t.gentle ? 0.1 : 0.18), -0.5, 0.98);
      drive.shyness = clamp(drive.shyness + 0.1, -0.4, 0.98);
      drive.arousal = clamp(drive.arousal + 0.06, -0.5, 0.9);
      drive.valence = clamp(drive.valence - 0.08, -0.95, 0.7);
      mood.annoyance = clamp(mood.annoyance + 0.035, -0.3, 0.3);
    }
    if (tags.includes('USER_STARING_EYES')) {
      drive.shyness = clamp(drive.shyness + 0.08, -0.4, 0.95);
      drive.arousal = clamp(drive.arousal + 0.05, -0.5, 0.9);
      mood.shyness = clamp(mood.shyness + 0.02, -0.25, 0.25);
    }
    if (tags.includes('USER_STROKES_CHEEK')) {
      drive.shyness = clamp(drive.shyness + 0.1, -0.4, 0.95);
      drive.trust = clamp(drive.trust + 0.03, -0.4, 0.8);
      drive.valence = clamp(drive.valence + (t.tsundere ? 0.04 : 0.08), -0.7, 0.8);
      drive.arousal = clamp(drive.arousal + 0.05, -0.5, 0.9);
      if (t.tsundere) drive.annoyance = clamp(drive.annoyance + 0.03, -0.5, 0.95);
      mood.valence = clamp(mood.valence + 0.018, -0.35, 0.35);
    }
    if (tags.includes('USER_GENTLE_PETTING')) {
      drive.trust = clamp(drive.trust + 0.04, -0.4, 0.8);
      drive.valence = clamp(drive.valence + 0.06, -0.75, 0.85);
      drive.arousal = clamp(drive.arousal + 0.02, -0.5, 0.85);
      mood.valence = clamp(mood.valence + 0.02, -0.35, 0.35);
      mood.trust = clamp(mood.trust + 0.012, -0.25, 0.25);
    }
    if (tags.includes('USER_TEASING')) {
      drive.annoyance = clamp(drive.annoyance + (t.gentle ? 0.08 : 0.14), -0.5, 0.95);
      drive.arousal = clamp(drive.arousal + 0.05, -0.5, 0.9);
      drive.trust = clamp(drive.trust - 0.03, -0.7, 0.7);
      drive.valence = clamp(drive.valence - 0.05, -0.95, 0.8);
      mood.annoyance = clamp(mood.annoyance + 0.018, -0.3, 0.3);
    }
    if (tags.includes('USER_SLOW_HOVER') && durationMs >= 1200 && clicks <= 1) {
      drive.curiosity = clamp(drive.curiosity + 0.05, -0.5, 0.9);
      drive.shyness = clamp(drive.shyness + 0.04, -0.4, 0.9);
      if (!tags.includes('USER_TOUCHES_BODY') && !tags.includes('USER_TOUCHES_MOUTH')) {
        drive.trust = clamp(drive.trust + 0.02, -0.4, 0.8);
      }
      mood.curiosity = clamp(mood.curiosity + 0.01, -0.25, 0.25);
    }

    drive.fatigue = clamp(drive.fatigue + clamp01(0.006 + 0.014 * snapshot.v.arousal), -0.4, 0.95);
    mood.fatigue = clamp(mood.fatigue + 0.004 * clamp01(snapshot.v.arousal), -0.25, 0.25);
    clampMood();
    approachSnapshotToTarget(computeTarget(t), 80);
    snapshot.d = derive(snapshot.v);
    snapshot.updatedAt = Date.now();
  };

  const applyChatText = (text: string, role: 'user' | 'agent') => {
    const s = String(text || '').trim();
    if (!s) return;
    const tl = s.toLowerCase();
    const t = input.personaTraits.value;

    const compliment = /(可爱|好看|漂亮|喜欢你|爱你|love you|cute|pretty|adorable)/i.test(tl);
    const tease =
      /(笨蛋|baka|傻|蠢|stupid|idiot|逗你|调戏|欠揍|坏蛋|变态)/i.test(tl) ||
      (/(摸|戳|点|拍)/i.test(tl) && /(你|头|脸|胸|身|腿)/i.test(tl));
    const thanks = /(谢谢|谢啦|thanks|thank you|thx)/i.test(tl);
    const sorry = /(对不起|抱歉|sorry|apolog)/i.test(tl);
    const question = /[?？]/.test(s);
    const angryWords = /(滚|烦|讨厌|恶心|闭嘴|shut up|f\\*\\*k|fuck|hate you)/i.test(tl);
    const warmWords = /(抱抱|亲亲|贴贴|rua|摸摸|么么|kiss|hug|love u|luv u)/i.test(tl);
    const excite = clamp01(
      satExp((s.match(/[!！]/g)?.length || 0) + (s.match(/~+/g)?.length || 0), 3)
    );
    const emoPos = satExp(s.match(/[❤️♥😊😂🥰😍😘]/g)?.length || 0, 2);
    const emoNeg = satExp(s.match(/[😡🤬😭💢]/g)?.length || 0, 2);

    if (compliment) {
      drive.valence = clamp(drive.valence + 0.15, -0.8, 0.9);
      drive.trust = clamp(drive.trust + 0.08, -0.4, 0.9);
      drive.shyness = clamp(drive.shyness + (t.shy ? 0.08 : 0.04), -0.4, 0.9);
      drive.arousal = clamp(drive.arousal + 0.06, -0.5, 0.9);
      drive.annoyance = clamp(drive.annoyance + (t.tsundere ? 0.02 : -0.05), -0.6, 0.95);
      mood.valence = clamp(mood.valence + 0.05, -0.35, 0.35);
      mood.trust = clamp(mood.trust + 0.03, -0.25, 0.25);
    } else if (tease) {
      drive.valence = clamp(drive.valence - 0.12, -0.95, 0.8);
      drive.annoyance = clamp(drive.annoyance + (t.gentle ? 0.12 : 0.2), -0.6, 0.98);
      drive.arousal = clamp(drive.arousal + 0.1, -0.5, 0.95);
      drive.trust = clamp(drive.trust - 0.03, -0.8, 0.8);
      mood.annoyance = clamp(mood.annoyance + 0.04, -0.3, 0.3);
    } else if (thanks) {
      drive.valence = clamp(drive.valence + 0.08, -0.8, 0.9);
      drive.trust = clamp(drive.trust + 0.05, -0.4, 0.9);
      drive.annoyance = clamp(drive.annoyance - 0.06, -0.8, 0.95);
      mood.valence = clamp(mood.valence + 0.02, -0.35, 0.35);
    } else if (sorry) {
      drive.valence = clamp(drive.valence + 0.04, -0.8, 0.9);
      drive.trust = clamp(drive.trust + 0.06, -0.4, 0.9);
      drive.annoyance = clamp(drive.annoyance - 0.14, -0.9, 0.9);
      drive.shyness = clamp(drive.shyness + (t.gentle ? -0.04 : 0.01), -0.7, 0.95);
      mood.trust = clamp(mood.trust + 0.015, -0.25, 0.25);
    } else if (question) {
      drive.curiosity = clamp(drive.curiosity + (role === 'user' ? 0.08 : 0.02), -0.5, 0.95);
      drive.arousal = clamp(drive.arousal + (role === 'user' ? 0.03 : 0.01), -0.5, 0.95);
      mood.curiosity = clamp(mood.curiosity + (role === 'user' ? 0.012 : 0.004), -0.25, 0.25);
    }
    if (warmWords) {
      drive.valence = clamp(drive.valence + 0.08, -0.95, 0.95);
      drive.trust = clamp(drive.trust + 0.05, -0.6, 0.95);
      drive.shyness = clamp(drive.shyness + (t.shy ? 0.05 : 0.02), -0.6, 0.98);
      mood.valence = clamp(mood.valence + 0.03, -0.35, 0.35);
      mood.trust = clamp(mood.trust + 0.02, -0.25, 0.25);
    }
    if (angryWords) {
      drive.annoyance = clamp(drive.annoyance + (t.strict ? 0.22 : 0.18), -0.6, 0.98);
      drive.valence = clamp(drive.valence - 0.12, -0.98, 0.9);
      drive.trust = clamp(drive.trust - 0.08, -0.9, 0.8);
      mood.annoyance = clamp(mood.annoyance + 0.06, -0.3, 0.3);
    }
    if (excite > 0) {
      drive.arousal = clamp(drive.arousal + 0.06 * excite, -0.6, 0.98);
      drive.curiosity = clamp(drive.curiosity + 0.02 * excite, -0.6, 0.98);
    }
    if (emoPos > 0) {
      drive.valence = clamp(drive.valence + 0.09 * emoPos, -0.98, 0.98);
      drive.trust = clamp(drive.trust + 0.05 * emoPos, -0.9, 0.95);
      mood.valence = clamp(mood.valence + 0.02 * emoPos, -0.35, 0.35);
    }
    if (emoNeg > 0) {
      drive.valence = clamp(drive.valence - 0.1 * emoNeg, -0.98, 0.98);
      drive.annoyance = clamp(drive.annoyance + 0.12 * emoNeg, -0.9, 0.98);
      mood.annoyance = clamp(mood.annoyance + 0.02 * emoNeg, -0.3, 0.3);
    }

    clampMood();
    approachSnapshotToTarget(computeTarget(t), 80);
    snapshot.d = derive(snapshot.v);
    snapshot.updatedAt = Date.now();
  };

  const applyEmotionTag = (tag: string | null | undefined, intensity = 0.6) => {
    const e = String(tag || '')
      .toLowerCase()
      .trim();
    if (!e) return;
    const x = clamp01(intensity);
    if (e === 'happy') {
      drive.valence = clamp(drive.valence + 0.22 * x, -0.85, 0.95);
      drive.annoyance = clamp(drive.annoyance - 0.12 * x, -0.9, 0.95);
      drive.arousal = clamp(drive.arousal + 0.06 * x, -0.5, 0.95);
      mood.valence = clamp(mood.valence + 0.04 * x, -0.35, 0.35);
    } else if (e === 'angry') {
      drive.annoyance = clamp(drive.annoyance + 0.25 * x, -0.6, 0.98);
      drive.valence = clamp(drive.valence - 0.18 * x, -0.98, 0.9);
      drive.arousal = clamp(drive.arousal + 0.08 * x, -0.5, 0.98);
      mood.annoyance = clamp(mood.annoyance + 0.05 * x, -0.3, 0.3);
    } else if (e === 'shy' || e === 'pout') {
      drive.shyness = clamp(drive.shyness + 0.22 * x, -0.6, 0.98);
      drive.arousal = clamp(drive.arousal + 0.05 * x, -0.5, 0.98);
      drive.valence = clamp(drive.valence + 0.06 * x, -0.9, 0.95);
      mood.shyness = clamp(mood.shyness + 0.04 * x, -0.25, 0.25);
    } else if (e === 'confused' || e === 'thinking') {
      drive.curiosity = clamp(drive.curiosity + 0.2 * x, -0.5, 0.98);
      drive.arousal = clamp(drive.arousal + 0.04 * x, -0.5, 0.98);
      mood.curiosity = clamp(mood.curiosity + 0.03 * x, -0.25, 0.25);
    } else if (e === 'dizzy') {
      drive.dizziness = clamp(drive.dizziness + 0.28 * x, -0.2, 0.98);
      drive.arousal = clamp(drive.arousal + 0.04 * x, -0.5, 0.98);
      mood.dizziness = clamp(mood.dizziness + 0.04 * x, -0.2, 0.2);
    } else if (e === 'tired' || e === 'sleepy') {
      drive.fatigue = clamp(drive.fatigue + 0.22 * x, -0.6, 0.98);
      drive.arousal = clamp(drive.arousal - 0.06 * x, -0.8, 0.9);
      mood.fatigue = clamp(mood.fatigue + 0.05 * x, -0.25, 0.25);
    } else if (e === 'sad' || e === 'cry') {
      drive.valence = clamp(drive.valence - 0.16 * x, -0.98, 0.85);
      drive.arousal = clamp(drive.arousal - 0.03 * x, -0.85, 0.9);
      mood.valence = clamp(mood.valence - 0.04 * x, -0.35, 0.35);
    }
    clampMood();
    approachSnapshotToTarget(computeTarget(input.personaTraits.value), 80);
    snapshot.d = derive(snapshot.v);
    snapshot.updatedAt = Date.now();
  };

  const recommendMicroReaction = (input2: {
    idleForMs: number;
    lang: 'zh' | 'en';
    isBusy: boolean;
    hasMessage: boolean;
    nowMs?: number;
    lastMicroMotion?: string;
    microMotionCooldownUntil?: Record<string, number>;
  }): EmotionMicroReaction | null => {
    if (input2.isBusy) return null;
    if (input2.idleForMs < 2600) return null;
    if (input2.hasMessage) return null;

    const t = input.personaTraits.value;
    const v = snapshot.v;
    const now =
      typeof input2.nowMs === 'number' && Number.isFinite(input2.nowMs) ? input2.nowMs : Date.now();
    const lastMicroMotion = String(input2.lastMicroMotion || '').trim();
    const cooldown = input2.microMotionCooldownUntil || null;

    const calm = clamp01(1 - v.arousal * 0.9 - v.dizziness * 0.9);
    const bored = clamp01((input2.idleForMs - 5000) / 60000) * clamp01(1 - v.arousal);
    const pokeIrritated = clamp01(v.annoyance * 0.7 + v.arousal * 0.25);
    const shyHeat = clamp01(v.shyness * 0.75 + v.arousal * 0.2);
    const softHappy = clamp01(v.valence * 0.55 + v.trust * 0.25 + 0.1 - v.annoyance * 0.35);
    const curious = clamp01(v.curiosity * 0.75 + bored * 0.25);
    const sleepy = clamp01(v.fatigue * 0.8 + bored * 0.2);

    const choice = pickWeighted([
      { item: 'fidget', w: 0.6 * pokeIrritated + 0.25 * (1 - calm) },
      { item: 'shy', w: 0.7 * shyHeat },
      { item: 'curious', w: 0.55 * curious },
      { item: 'happy', w: 0.45 * softHappy * calm },
      { item: 'sleepy', w: 0.65 * sleepy }
    ]);

    if (!choice) return null;

    const canUseMotion = (motion: string) => {
      const m = String(motion || '').trim();
      if (!m) return false;
      if (lastMicroMotion && m === lastMicroMotion) return false;
      if (cooldown) {
        const until = cooldown[m] ?? 0;
        if (now < until) return false;
      }
      return true;
    };

    const pickMotion = (items: Array<{ item: string; w: number }>, fallback: string) => {
      const filtered = items
        .map((x) => ({ ...x, item: String(x.item || '').trim() }))
        .filter((x) => x.item && canUseMotion(x.item));
      return (pickWeighted(filtered) || pickWeighted(items) || fallback).trim();
    };

    if (choice === 'sleepy') {
      const motion = t.lazy ? 'idle_yawn' : 'idle_breathe_deep';
      return {
        motion: canUseMotion(motion) ? motion : undefined,
        expression: 'tired',
        lockMs: 1100,
        message:
          input2.lang === 'zh'
            ? { zh: '嗯…有点困…', en: 'Mm… kinda sleepy…' }
            : { zh: '嗯…有点困…', en: 'Mm… kinda sleepy…' }
      };
    }

    if (choice === 'fidget') {
      const motion = pickMotion(
        [
          { item: 'idle_tap_foot', w: 0.9 + v.annoyance * 0.8 },
          { item: 'idle_fidget_hands', w: 0.8 + v.arousal * 0.6 },
          { item: 'idle_sigh', w: 0.6 + (1 - v.valence) * 0.6 },
          { item: 'idle_arms_cross', w: t.tsundere ? 0.9 : 0.4 }
        ],
        'idle_fidget_hands'
      );
      return {
        motion,
        expression: v.annoyance > 0.55 ? 'angry' : v.shyness > 0.55 ? 'shy' : undefined,
        lockMs: 900
      };
    }

    if (choice === 'shy') {
      return {
        motion: pickMotion(
          [
            { item: 'idle_touch_face', w: 0.9 },
            { item: 'idle_head_tilt', w: 0.6 },
            { item: 'play_hair', w: 0.6 + (t.elegant ? 0.2 : 0) }
          ],
          'idle_touch_face'
        ),
        expression: 'shy',
        lockMs: 900,
        message:
          input2.lang === 'zh'
            ? { zh: t.tsundere ? '别、别盯着看啦…' : '呜…别靠太近…', en: "D-don't stare..." }
            : { zh: '呜…别靠太近…', en: t.tsundere ? "D-don't stare..." : 'Eek… too close…' }
      };
    }

    if (choice === 'curious') {
      return {
        motion: pickMotion(
          [
            { item: 'idle_look_around', w: 0.9 },
            { item: 'idle_hand_on_chin', w: 0.7 + (t.mystic ? 0.2 : 0) },
            { item: 'idle_think', w: 0.8 + (t.strict ? 0.1 : 0) }
          ],
          'idle_look_around'
        ),
        expression: 'confused',
        lockMs: 900
      };
    }

    if (choice === 'happy') {
      return {
        motion: pickMotion(
          [
            { item: 'idle_head_tilt', w: 0.6 },
            { item: 'idle_shift_weight', w: 0.7 },
            { item: 'play_hair', w: 0.6 },
            { item: 'stretch', w: 0.35 }
          ],
          'idle_shift_weight'
        ),
        expression: 'happy',
        lockMs: 800
      };
    }

    return null;
  };

  return {
    snapshot,
    tick,
    applyRealtimeState,
    applyHitAreas,
    applyInteractionSession,
    applyChatText,
    applyEmotionTag,
    recommendMicroReaction
  };
};
