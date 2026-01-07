import * as PIXI from 'pixi.js';
import { Application } from 'pixi.js';
import { loadExternalResource } from '../../utils';
import logger from '../../utils/logger';

// Expose PIXI globally for pixi-live2d-display if needed
if (typeof window !== 'undefined' && !(window as any).PIXI) {
  (window as any).PIXI = PIXI;
}

let Live2DModelCtor: any | null = null;
let cubismCorePromise: Promise<boolean> | null = null;

let app: any | null = null;
let model: any = null;
let tickerAdded = false;
let lastLayoutLogKey = '';
let layoutSettleSeq = 0;

const poiTarget = { x: 0, y: 0 };
const poiCurrent = { x: 0, y: 0 };
let poiLastUpdateAt = 0;

let talkingActive = false;
let talkingPhase = 0;

let syntheticExpressionTargets: Record<string, number> | null = null;
const syntheticExpressionCurrent: Record<string, number> = {};
let syntheticExpressionEntries: Array<[string, number]> | null = null;
const syntheticExpressionActiveIds = new Set<string>();

type SyntheticMotionType =
  | 'shake'
  | 'shake_head'
  | 'nod'
  | 'tilt_left'
  | 'tilt_right'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'activity'
  | 'talking'
  | 'yawn'
  | 'play_hair'
  | 'stretch'
  | 'idle';

let syntheticMotionType: SyntheticMotionType | null = null;
let syntheticMotionStartedAt = 0;
let syntheticMotionUntil = 0;
let syntheticMotionIntensity = 0.7;

let lastRendererWidth = 0;
let lastRendererHeight = 0;
let currentModelPath = '';
let coreSetParam: ((id: string, value: number) => void) | null = null;
let lastParamValues: Record<string, number> = {};
let motionGroupKeysCache: string[] | null = null;
let expressionNamesCache: string[] | null = null;
const resolvedMotionGroupCache = new Map<string, string | undefined>();
const resolvedExpressionCache = new Map<string, string | undefined>();

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const expApproach = (current: number, target: number, halfLifeSec: number, dtSec: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target;
  if (!Number.isFinite(halfLifeSec) || halfLifeSec <= 0) return target;
  if (!Number.isFinite(dtSec) || dtSec <= 0) return current;
  const dt = clamp(dtSec, 0, 0.1);
  const alpha = 1 - Math.pow(0.5, dt / halfLifeSec);
  return current + (target - current) * alpha;
};

const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const ensureCubismCore = async (): Promise<boolean> => {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  if (w?.Live2DCubismCore) return true;
  if (!w) return false;

  if (!cubismCorePromise) {
    const urls = ['/api/live2d-core/live2dcubismcore.min.js'];

    cubismCorePromise = (async () => {
      for (const url of urls) {
        try {
          await loadExternalResource(url, 'js');
          if ((window as any).Live2DCubismCore) return true;
        } catch {}
      }
      return false;
    })();
  }

  return cubismCorePromise;
};

const ensureLive2DModelCtor = async () => {
  if (Live2DModelCtor) return Live2DModelCtor;
  const w = typeof window !== 'undefined' ? (window as any) : null;
  if (!w?.Live2DCubismCore) {
    const ok = await ensureCubismCore();
    if (!ok) {
      throw new Error('MISSING_LIVE2D_CUBISM_CORE');
    }
  }
  if (!w?.Live2DCubismCore) {
    throw new Error('MISSING_LIVE2D_CUBISM_CORE');
  }
  const mod = await import('pixi-live2d-display/cubism4');
  Live2DModelCtor = (mod as any)?.Live2DModel || null;
  if (!Live2DModelCtor) {
    throw new Error('MISSING_LIVE2D_MODEL_CTOR');
  }
  return Live2DModelCtor;
};

const SYNTHETIC_MOTION_MAP: Record<string, SyntheticMotionType> = {
  shake: 'shake',
  moodangry: 'shake',
  moodconfused: 'shake',
  shakehead: 'shake_head',
  nod: 'nod',
  tiltleft: 'tilt_left',
  tiltright: 'tilt_right',
  happy: 'happy',
  moodhappy: 'happy',
  sad: 'sad',
  moodtired: 'sad',
  moodsleepy: 'sad',
  surprised: 'surprised',
  activity: 'activity',
  wave: 'activity',
  friend: 'activity',
  talking: 'talking',
  idle: 'idle',
  yawn: 'yawn',
  playhair: 'play_hair',
  stretch: 'stretch'
};

const safeSetParam = (id: string, value: number) => {
  if (!coreSetParam) return;
  const prev = lastParamValues[id];
  if (typeof prev === 'number' && Math.abs(prev - value) < 0.0008) return;
  try {
    coreSetParam(id, value);
    lastParamValues[id] = value;
  } catch {}
};

const getMotionDefinitions = (): Record<string, any[]> => {
  if (!model) return {};
  const m = model as any;
  const defs = m.internalModel?.motionManager?.definitions;
  if (defs && typeof defs === 'object') return defs;
  return {};
};

const getMotionGroupKeys = (): string[] => {
  if (motionGroupKeysCache) return motionGroupKeysCache;
  const keys = Object.keys(getMotionDefinitions());
  motionGroupKeysCache = keys;
  return keys;
};

const resolveMotionGroupName = (requestedGroup: string): string | undefined => {
  const requestedNorm = normalizeKey(requestedGroup);
  if (resolvedMotionGroupCache.has(requestedNorm)) {
    return resolvedMotionGroupCache.get(requestedNorm);
  }

  const defs = getMotionDefinitions();
  const keys = getMotionGroupKeys();
  if (keys.length === 0) return undefined;

  if (requestedGroup in defs) return requestedGroup;

  const exact = keys.find((k) => normalizeKey(k) === requestedNorm);
  if (exact) {
    resolvedMotionGroupCache.set(requestedNorm, exact);
    return exact;
  }

  const contains = keys.find(
    (k) => normalizeKey(k).includes(requestedNorm) || requestedNorm.includes(normalizeKey(k))
  );
  resolvedMotionGroupCache.set(requestedNorm, contains);
  return contains;
};

const getExpressionNames = (): string[] => {
  if (expressionNamesCache) return expressionNamesCache;
  if (!model) return [];
  const m = model as any;
  const maybeDefs =
    m.internalModel?.expressionManager?.definitions ||
    m.internalModel?.expressionManager?.expressions ||
    m.internalModel?.expressions;

  if (Array.isArray(maybeDefs)) {
    const names = maybeDefs
      .map((x: any) => {
        if (typeof x === 'string') return x;
        return x?.Name || x?.name || x?.Id || x?.id;
      })
      .filter((x: any) => typeof x === 'string');
    expressionNamesCache = names;
    return names;
  }

  if (maybeDefs && typeof maybeDefs === 'object') {
    const names = Object.keys(maybeDefs);
    expressionNamesCache = names;
    return names;
  }

  return [];
};

const resolveExpressionId = (requested: string): string | undefined => {
  const base = requested.replace(/\.exp3\.json$/i, '').replace(/\.json$/i, '');
  const reqNorm = normalizeKey(base);
  if (resolvedExpressionCache.has(reqNorm)) {
    return resolvedExpressionCache.get(reqNorm);
  }

  const names = getExpressionNames();
  if (names.length === 0) return requested || undefined;

  if (names.includes(requested)) return requested;

  if (names.includes(base)) return base;

  const exact = names.find((n) => normalizeKey(n) === reqNorm);
  if (exact) {
    resolvedExpressionCache.set(reqNorm, exact);
    return exact;
  }

  const contains = names.find(
    (n) => normalizeKey(n).includes(reqNorm) || reqNorm.includes(normalizeKey(n))
  );
  resolvedExpressionCache.set(reqNorm, contains);
  return contains;
};

const getSyntheticExpressionTargets = (requested: string): Record<string, number> | null => {
  const key = normalizeKey(requested || '');
  if (!key) return null;

  const set = (pairs: Array<[string, number]>) =>
    pairs.reduce<Record<string, number>>((acc, [id, value]) => {
      acc[id] = value;
      return acc;
    }, {});

  if (key === 'neutral' || key === 'default') {
    return set([
      ['ParamEyeLSmile', 0],
      ['ParamEyeRSmile', 0],
      ['ParamEyeSmile', 0],
      ['ParamMouthForm', 0],
      ['ParamEyeLOpen', 1],
      ['ParamEyeROpen', 1],
      ['ParamEyeOpen', 1],
      ['ParamBrowLY', 0],
      ['ParamBrowRY', 0],
      ['ParamBrowY', 0],
      ['ParamBrowLAngle', 0],
      ['ParamBrowRAngle', 0],
      ['ParamBrowAngle', 0]
    ]);
  }

  if (key === 'happy') {
    return set([
      ['ParamEyeLSmile', 1],
      ['ParamEyeRSmile', 1],
      ['ParamEyeSmile', 1],
      ['ParamMouthForm', 0.6],
      ['ParamEyeLOpen', 1],
      ['ParamEyeROpen', 1],
      ['ParamEyeOpen', 1],
      ['ParamBrowLY', 0.3],
      ['ParamBrowRY', 0.3],
      ['ParamBrowY', 0.3],
      ['ParamBrowLAngle', 0.2],
      ['ParamBrowRAngle', 0.2],
      ['ParamBrowAngle', 0.2]
    ]);
  }

  if (key === 'angry') {
    return set([
      ['ParamEyeLOpen', 0.75],
      ['ParamEyeROpen', 0.75],
      ['ParamEyeOpen', 0.75],
      ['ParamMouthForm', -0.5],
      ['ParamBrowLY', -0.5],
      ['ParamBrowRY', -0.5],
      ['ParamBrowY', -0.5],
      ['ParamBrowLAngle', -0.35],
      ['ParamBrowRAngle', -0.35],
      ['ParamBrowAngle', -0.35]
    ]);
  }

  if (key === 'sad' || key === 'cry' || key === 'crying') {
    return set([
      ['ParamEyeLOpen', 0.6],
      ['ParamEyeROpen', 0.6],
      ['ParamEyeOpen', 0.6],
      ['ParamMouthForm', -0.25],
      ['ParamBrowLY', -0.25],
      ['ParamBrowRY', -0.25],
      ['ParamBrowY', -0.25],
      ['ParamBrowLAngle', 0.15],
      ['ParamBrowRAngle', 0.15],
      ['ParamBrowAngle', 0.15]
    ]);
  }

  if (key === 'shy' || key === 'pout' || key === 'pouting') {
    return set([
      ['ParamEyeLOpen', 0.7],
      ['ParamEyeROpen', 0.7],
      ['ParamEyeOpen', 0.7],
      ['ParamMouthForm', 0.25],
      ['ParamBrowLY', 0.1],
      ['ParamBrowRY', 0.1],
      ['ParamBrowY', 0.1]
    ]);
  }

  if (key === 'surprised' || key === 'surprise') {
    return set([
      ['ParamEyeLOpen', 1],
      ['ParamEyeROpen', 1],
      ['ParamEyeOpen', 1],
      ['ParamMouthForm', 0],
      ['ParamBrowLY', 0.55],
      ['ParamBrowRY', 0.55],
      ['ParamBrowY', 0.55],
      ['ParamBrowLAngle', 0],
      ['ParamBrowRAngle', 0],
      ['ParamBrowAngle', 0]
    ]);
  }

  if (key === 'dizzy' || key === 'tired' || key === 'sleepy') {
    return set([
      ['ParamEyeLOpen', 0.25],
      ['ParamEyeROpen', 0.25],
      ['ParamEyeOpen', 0.25],
      ['ParamMouthForm', -0.05],
      ['ParamBrowLY', -0.1],
      ['ParamBrowRY', -0.1],
      ['ParamBrowY', -0.1]
    ]);
  }

  if (key === 'confused' || key === 'thinking') {
    return set([
      ['ParamEyeLOpen', 0.75],
      ['ParamEyeROpen', 0.75],
      ['ParamEyeOpen', 0.75],
      ['ParamMouthForm', 0.1],
      ['ParamBrowLY', 0.2],
      ['ParamBrowRY', -0.2],
      ['ParamBrowLAngle', 0.25],
      ['ParamBrowRAngle', -0.25]
    ]);
  }

  return null;
};

const applyAgentDrivenParams = (delta: number) => {
  if (!model) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const idleTimeoutMs = 1800;
  if (poiLastUpdateAt > 0 && now - poiLastUpdateAt > idleTimeoutMs) {
    poiTarget.x = 0;
    poiTarget.y = 0;
  }

  const dtSec = clamp((delta || 1) / 60, 0, 0.1);
  const idle = poiLastUpdateAt > 0 && now - poiLastUpdateAt > idleTimeoutMs;
  const poiHalfLifeSec = idle ? 0.14 : 0.09;
  poiCurrent.x = expApproach(poiCurrent.x, poiTarget.x, poiHalfLifeSec, dtSec);
  poiCurrent.y = expApproach(poiCurrent.y, poiTarget.y, poiHalfLifeSec, dtSec);

  const x = clamp(poiCurrent.x, -1, 1);
  const y = clamp(poiCurrent.y, -1, 1);

  const baseEyeX = x;
  const baseEyeY = y;

  let baseAngleX = x * 30;
  let baseAngleY = y * 30;
  let baseAngleZ = x * y * -10;
  let baseBodyAngleX = x * 10;

  let motionAngleX = 0;
  let motionAngleY = 0;
  let motionAngleZ = 0;
  let motionBodyAngleX = 0;

  if (syntheticMotionUntil > 0 && now < syntheticMotionUntil && syntheticMotionType) {
    const elapsed = Math.max(0, now - syntheticMotionStartedAt);
    const progress = clamp(
      elapsed / Math.max(1, syntheticMotionUntil - syntheticMotionStartedAt),
      0,
      1
    );
    const ease = 1 - Math.pow(1 - progress, 2);
    const amp = clamp(syntheticMotionIntensity, 0.1, 1.2);

    const fast = 10 + 6 * amp;
    const mid = 5 + 3 * amp;
    const slow = 2.5 + 1.8 * amp;

    const sFast = Math.sin((elapsed / 1000) * Math.PI * fast);
    const sMid = Math.sin((elapsed / 1000) * Math.PI * mid);
    const sSlow = Math.sin((elapsed / 1000) * Math.PI * slow);

    const fadeIn = clamp(ease * 1.2, 0, 1);
    const fadeOut = clamp((1 - progress) * 1.2, 0, 1);
    const w = fadeIn * fadeOut;

    if (syntheticMotionType === 'shake' || syntheticMotionType === 'shake_head') {
      motionAngleX = sFast * 18 * amp * w;
      motionAngleZ = sFast * -12 * amp * w;
      motionBodyAngleX = sMid * 6 * amp * w;
    } else if (syntheticMotionType === 'nod') {
      motionAngleY = Math.abs(sFast) * 18 * amp * w - 8 * amp * w;
      motionBodyAngleX = sMid * 4 * amp * w;
    } else if (syntheticMotionType === 'tilt_left') {
      motionAngleZ = -18 * amp * w;
      motionAngleX = sSlow * 6 * amp * w;
    } else if (syntheticMotionType === 'tilt_right') {
      motionAngleZ = 18 * amp * w;
      motionAngleX = sSlow * 6 * amp * w;
    } else if (syntheticMotionType === 'happy') {
      motionAngleY = -Math.abs(sFast) * 10 * amp * w;
      motionAngleZ = sMid * 10 * amp * w;
      motionBodyAngleX = sMid * 8 * amp * w;
    } else if (syntheticMotionType === 'sad') {
      motionAngleY = 10 * amp * w;
      motionAngleZ = sSlow * 6 * amp * w;
      motionBodyAngleX = -6 * amp * w;
    } else if (syntheticMotionType === 'surprised') {
      motionAngleY = -12 * amp * w;
      motionAngleX = sFast * 6 * amp * w;
      motionBodyAngleX = -12 * amp * w;
    } else if (syntheticMotionType === 'activity') {
      motionAngleX = sMid * 14 * amp * w;
      motionAngleY = sMid * -10 * amp * w;
      motionAngleZ = sMid * 8 * amp * w;
      motionBodyAngleX = sSlow * 10 * amp * w;
    } else if (syntheticMotionType === 'yawn') {
      // Yawn: Head tilts back (AngleY up), eyes close slightly, mouth opens
      // AngleY is typically up for positive values? Or down?
      // Standard Live2D: AngleY +30 is Up.
      const durationMs = Math.max(1, syntheticMotionUntil - syntheticMotionStartedAt);
      const yawnPhase = Math.sin((elapsed / durationMs) * Math.PI); // 0 -> 1 -> 0
      motionAngleY = 20 * amp * yawnPhase * w;
      motionAngleZ = 5 * amp * Math.sin(elapsed / 200) * w;
      // We can also influence mouth/eyes if we want, but applyAgentDrivenParams focuses on angles.
      // We'll leave expressions to the expression system or manual params if needed.
    } else if (syntheticMotionType === 'play_hair') {
      // Play Hair: Head tilt to side, slight looking down
      motionAngleZ = 15 * amp * w; // Tilt
      motionAngleY = -10 * amp * w; // Look down
      motionBodyAngleX = 5 * amp * Math.sin(elapsed / 300) * w;
    } else if (syntheticMotionType === 'stretch') {
      // Stretch: Head back, body up?
      motionAngleY = 25 * amp * w;
      motionBodyAngleX = -10 * amp * w;
    } else if (syntheticMotionType === 'idle') {
      motionAngleX = sSlow * 5 * amp * w;
      motionAngleY = sSlow * 3 * amp * w;
      motionAngleZ = sSlow * 2 * amp * w;
    }
  } else if (syntheticMotionUntil > 0 && now >= syntheticMotionUntil) {
    syntheticMotionType = null;
    syntheticMotionUntil = 0;
    syntheticMotionStartedAt = 0;
  }

  baseAngleX += motionAngleX;
  baseAngleY += motionAngleY;
  baseAngleZ += motionAngleZ;
  baseBodyAngleX += motionBodyAngleX;

  safeSetParam('ParamEyeBallX', baseEyeX);
  safeSetParam('ParamEyeBallY', baseEyeY);
  safeSetParam('ParamAngleX', baseAngleX);
  safeSetParam('ParamAngleY', baseAngleY);
  safeSetParam('ParamAngleZ', baseAngleZ);
  safeSetParam('ParamBodyAngleX', baseBodyAngleX);

  const mouthSmooth = clamp(0.18 * (delta || 1), 0.08, 0.35);
  if (talkingActive) {
    talkingPhase += 0.22 * (delta || 1);
    const open = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(talkingPhase));
    safeSetParam('ParamMouthOpenY', open);
    safeSetParam('ParamMouthForm', 0.2 * Math.sin(talkingPhase * 0.7));
  } else {
    talkingPhase = lerp(talkingPhase, 0, mouthSmooth);
    const yawnActive =
      syntheticMotionUntil > 0 && now < syntheticMotionUntil && syntheticMotionType === 'yawn';
    if (yawnActive) {
      const progress = clamp(
        (now - syntheticMotionStartedAt) /
          Math.max(1, syntheticMotionUntil - syntheticMotionStartedAt),
        0,
        1
      );
      const open = clamp(Math.sin(Math.PI * progress) * 0.95, 0, 1);
      safeSetParam('ParamMouthOpenY', open);
      safeSetParam('ParamMouthForm', 0.08);
    } else {
      safeSetParam('ParamMouthOpenY', 0);
      safeSetParam('ParamMouthForm', 0);
    }
  }

  const synthSmooth = clamp(0.16 * (delta || 1), 0.06, 0.3);
  if (syntheticExpressionTargets) {
    const entries = syntheticExpressionEntries || Object.entries(syntheticExpressionTargets);
    for (const [id, target] of entries) {
      const cur =
        typeof syntheticExpressionCurrent[id] === 'number' ? syntheticExpressionCurrent[id] : 0;
      const next = lerp(cur, target, synthSmooth);
      syntheticExpressionCurrent[id] = next;
      syntheticExpressionActiveIds.add(id);
      safeSetParam(id, next);
    }
  } else if (syntheticExpressionActiveIds.size > 0) {
    for (const id of Array.from(syntheticExpressionActiveIds)) {
      const cur = syntheticExpressionCurrent[id] || 0;
      const next = lerp(cur, 0, synthSmooth);
      syntheticExpressionCurrent[id] = next;
      safeSetParam(id, next);
      if (Math.abs(next) < 0.01) {
        delete syntheticExpressionCurrent[id];
        syntheticExpressionActiveIds.delete(id);
      }
    }
  }
};

const getContainer = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  return document.getElementById('live2d-cubism3') as HTMLElement | null;
};

const isDebugEnabled = () => {
  try {
    return typeof window !== 'undefined' && Boolean((window as any).__LIVE2D_DEBUG__);
  } catch {
    return false;
  }
};

const ensureApp = async (): Promise<any | null> => {
  if (typeof window === 'undefined') return null;
  if (app) return app;

  const container = getContainer();
  if (!container) return null;

  try {
    const v2Canvas = document.getElementById('live2d') as HTMLCanvasElement | null;
    if (v2Canvas) {
      if (!container.style.width) {
        container.style.width = `${v2Canvas.width || 800}px`;
      }
      if (!container.style.height) {
        container.style.height = `${v2Canvas.height || 800}px`;
      }
    } else {
      if (!container.style.width) {
        container.style.width = '800px';
      }
      if (!container.style.height) {
        container.style.height = '800px';
      }
    }
  } catch {}

  const debug = isDebugEnabled();
  try {
    const Live2D = (await ensureLive2DModelCtor()) as any;
    if (Live2D && Live2D.prototype) {
      const desc = Object.getOwnPropertyDescriptor(Live2D.prototype, 'autoUpdate');
      if (!desc || desc.configurable) {
        Object.defineProperty(Live2D.prototype, 'autoUpdate', {
          get() {
            return (this as any)._autoUpdateEnabled || false;
          },
          set(value: boolean) {
            (this as any)._autoUpdateEnabled = !!value;
          },
          configurable: true
        });
      } else {
        if (debug) logger.warn('[Live2D] autoUpdate is not configurable');
      }
    }
  } catch (e) {
    if (debug) logger.warn('[Live2D] Error patching autoUpdate', e);
  }

  const resolution = clamp((window.devicePixelRatio || 1) as number, 1, 2);
  app = new Application({
    resizeTo: container as any,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution
  });

  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(app.view as HTMLCanvasElement);

  try {
    const Live2D = (await ensureLive2DModelCtor()) as any;
    if (Live2D && typeof Live2D.registerTicker === 'function') {
      if (app.ticker) {
        Live2D.registerTicker(app.ticker);
      } else {
        if (debug) logger.warn('[Live2D] app.ticker is missing. AutoUpdate may fail.');
      }
    }
  } catch (e) {
    if (debug) logger.warn('[Live2D] Error registering ticker', e);
  }

  return app;
};

const SPECIAL_MODEL_SCALE: Record<string, number> = {
  'ZiYuXin/ots14_4501/normal/normal.model3.json': 1.0
};

const getSpecialScale = (modelJsonPath: string): number | undefined => {
  const relativePath = modelJsonPath.replace(/^.*model_backup\//, '').replace(/^.*model\//, '');
  let specialScale = SPECIAL_MODEL_SCALE[relativePath];
  if (!specialScale && modelJsonPath.includes('ZiYuXin')) {
    specialScale = 1.0;
  }
  return specialScale;
};

type SizeBucket = 'large' | 'medium' | 'small';

const computeCubism3Layout = (
  measuredW: number,
  measuredH: number,
  rendererWidth: number,
  rendererHeight: number,
  modelJsonPath: string
) => {
  const marginLeft = Math.max(16, Math.round(rendererWidth * 0.04));
  const marginRight = Math.max(16, Math.round(rendererWidth * 0.04));
  const marginTop = Math.max(16, Math.round(rendererHeight * 0.04));
  const marginBottom = Math.max(10, Math.round(rendererHeight * 0.02));

  const fitWidth = Math.max(1, rendererWidth - marginLeft - marginRight);
  const fitHeight = Math.max(1, rendererHeight - marginTop - marginBottom);

  const boundsW = Number(measuredW) || 0;
  const boundsH = Number(measuredH) || 0;

  let fitScale = 0.25;
  if (boundsW > 0 && boundsH > 0) {
    fitScale = Math.min(fitWidth / boundsW, fitHeight / boundsH);
  }

  if (!Number.isFinite(fitScale) || fitScale <= 0) {
    fitScale = 0.25;
  }

  const bucket: SizeBucket = fitScale < 0.2 ? 'large' : fitScale < 0.3 ? 'medium' : 'small';
  const bucketCoverage: Record<SizeBucket, number> = {
    large: 0.76,
    medium: 0.84,
    small: 0.9
  };

  const specialScale = getSpecialScale(modelJsonPath);
  const scale = clamp(fitScale * bucketCoverage[bucket] * (specialScale || 1), 0.08, 3);

  const targetX = Math.round(rendererWidth * 0.32);
  const targetY = rendererHeight - marginBottom;

  return {
    scale,
    bucket,
    specialScale,
    targetX,
    targetY,
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
    fitWidth,
    fitHeight,
    boundsW,
    boundsH
  };
};

const applyCubism3Layout = (appInstance: any, modelJsonPath: string) => {
  if (!appInstance || !model) return;

  const rendererWidth = appInstance.renderer.width || 800;
  const rendererHeight = appInstance.renderer.height || 800;

  const marginBottom = Math.max(10, Math.round(rendererHeight * 0.02));

  const probeX = Math.round(rendererWidth * 0.32);
  const probeY = rendererHeight - marginBottom;

  const previousScaleX = Number(model.scale?.x) || 1;
  const previousScaleY = Number(model.scale?.y) || 1;
  const previousX = Number(model.x) || 0;
  const previousY = Number(model.y) || 0;

  model.scale.set(1, 1);
  model.position.set(probeX, probeY);

  try {
    if (typeof model.update === 'function') {
      model.update(0);
    }
  } catch {}

  try {
    if (typeof appInstance.renderer?.render === 'function') {
      appInstance.renderer.render(appInstance.stage);
    }
  } catch {}

  let measuredW = 0;
  let measuredH = 0;
  try {
    const b = model.getBounds?.();
    measuredW = Number(b?.width) || 0;
    measuredH = Number(b?.height) || 0;
  } catch {}

  if (!(measuredW > 0 && measuredH > 0)) {
    try {
      const lb = model.getLocalBounds?.();
      measuredW = Number(lb?.width) || 0;
      measuredH = Number(lb?.height) || 0;
    } catch {}
  }

  model.scale.set(previousScaleX, previousScaleY);
  model.position.set(previousX, previousY);

  const layout = computeCubism3Layout(
    measuredW,
    measuredH,
    rendererWidth,
    rendererHeight,
    modelJsonPath
  );
  model.scale.set(layout.scale, layout.scale);
  model.position.set(layout.targetX, layout.targetY);

  let bounds: any | null = null;
  try {
    bounds = model.getBounds?.();
  } catch {}

  if (bounds) {
    const targetBottom = rendererHeight - layout.marginBottom;
    const dyBottom = targetBottom - bounds.bottom;
    if (Number.isFinite(dyBottom) && Math.abs(dyBottom) > 0.5) {
      model.y += dyBottom;
    }

    const leftLimit = layout.marginLeft;
    const rightLimit = rendererWidth - layout.marginRight;
    const topLimit = layout.marginTop;
    const bottomLimit = rendererHeight - layout.marginBottom;

    try {
      bounds = model.getBounds?.();
    } catch {}

    if (bounds) {
      if (bounds.left < leftLimit) {
        model.x += leftLimit - bounds.left;
      } else if (bounds.right > rightLimit) {
        model.x -= bounds.right - rightLimit;
      }

      if (bounds.top < topLimit) {
        model.y += topLimit - bounds.top;
      } else if (bounds.bottom > bottomLimit) {
        model.y -= bounds.bottom - bottomLimit;
      }
    }
  }

  try {
    bounds = model.getBounds?.();
  } catch {}

  if (bounds) {
    const fitWidth = Math.max(1, rendererWidth - layout.marginLeft - layout.marginRight);
    const fitHeight = Math.max(1, rendererHeight - layout.marginTop - layout.marginBottom);
    const bw = Number(bounds.width) || 0;
    const bh = Number(bounds.height) || 0;

    if (bw > 0 && bh > 0 && (bw > fitWidth || bh > fitHeight)) {
      const shrink = clamp(Math.min(fitWidth / bw, fitHeight / bh) * 0.98, 0.05, 1);
      if (shrink < 0.999) {
        const nextScale = (Number(model.scale?.x) || 1) * shrink;
        model.scale.set(nextScale, nextScale);

        try {
          bounds = model.getBounds?.();
        } catch {}

        if (bounds) {
          const targetBottom = rendererHeight - layout.marginBottom;
          const dyBottom = targetBottom - bounds.bottom;
          if (Number.isFinite(dyBottom) && Math.abs(dyBottom) > 0.5) {
            model.y += dyBottom;
          }

          const leftLimit = layout.marginLeft;
          const rightLimit = rendererWidth - layout.marginRight;
          const topLimit = layout.marginTop;
          const bottomLimit = rendererHeight - layout.marginBottom;

          try {
            bounds = model.getBounds?.();
          } catch {}

          if (bounds) {
            if (bounds.left < leftLimit) {
              model.x += leftLimit - bounds.left;
            } else if (bounds.right > rightLimit) {
              model.x -= bounds.right - rightLimit;
            }

            if (bounds.top < topLimit) {
              model.y += topLimit - bounds.top;
            } else if (bounds.bottom > bottomLimit) {
              model.y -= bounds.bottom - bottomLimit;
            }
          }
        }
      }
    }
  }

  if (isDebugEnabled()) {
    const key = `${modelJsonPath}|${rendererWidth}x${rendererHeight}|${layout.scale}`;
    if (key !== lastLayoutLogKey) {
      lastLayoutLogKey = key;
      logger.info('[Live2D] Cubism3 Layout Applied', {
        modelJsonPath,
        rendererWidth,
        rendererHeight,
        bucket: layout.bucket,
        specialScale: layout.specialScale,
        finalScale: layout.scale,
        boundsW: layout.boundsW,
        boundsH: layout.boundsH
      });
    }
  }
};

export const loadCubism3Model = async (modelJsonPath: string): Promise<boolean> => {
  const appInstance = await ensureApp();
  if (!appInstance) return false;

  let Live2D: any;
  try {
    Live2D = await ensureLive2DModelCtor();
  } catch (err) {
    logger.warn('[Live2D] Cubism core is not available. Skip Cubism3/4 loading.', err);
    return false;
  }
  let nextModel: any = null;
  try {
    nextModel = await Live2D.from(modelJsonPath, { autoUpdate: false });
  } catch (err) {
    logger.error('[Live2D] Failed to load Cubism3 model', err);
    currentModelPath = '';
    return false;
  }

  if (model) {
    try {
      appInstance.stage.removeChild(model);
    } catch {}
    try {
      if (typeof model.destroy === 'function') {
        model.destroy({ children: true, texture: true, baseTexture: true });
      }
    } catch {}
    model = null;
  }

  model = nextModel;
  currentModelPath = modelJsonPath;
  motionGroupKeysCache = null;
  expressionNamesCache = null;
  resolvedMotionGroupCache.clear();
  resolvedExpressionCache.clear();
  try {
    const m = model as any;
    const coreModel = m?.internalModel?.coreModel;
    const setter = coreModel?.setParameterValueById;
    coreSetParam = typeof setter === 'function' ? setter.bind(coreModel) : null;
  } catch {
    coreSetParam = null;
  }
  lastParamValues = {};
  syntheticExpressionTargets = null;
  syntheticExpressionEntries = null;
  syntheticExpressionActiveIds.clear();
  for (const k of Object.keys(syntheticExpressionCurrent)) delete syntheticExpressionCurrent[k];

  if (model.anchor && typeof model.anchor.set === 'function') {
    model.anchor.set(0.5, 1.0);
  }
  const container = getContainer();
  if (container) {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 800;
    appInstance.renderer.resize(w, h);
  }

  appInstance.stage.addChild(model);
  applyCubism3Layout(appInstance, modelJsonPath);
  try {
    requestAnimationFrame(() => {
      if (model && currentModelPath === modelJsonPath) {
        applyCubism3Layout(appInstance, modelJsonPath);
      }
    });
  } catch {}
  const settleSeq = (layoutSettleSeq += 1);
  const settleDelaysMs = [200, 600, 1400, 2600];
  for (const delayMs of settleDelaysMs) {
    window.setTimeout(() => {
      if (settleSeq !== layoutSettleSeq) return;
      if (!model) return;
      if (currentModelPath !== modelJsonPath) return;
      applyCubism3Layout(appInstance, modelJsonPath);
    }, delayMs);
  }

  lastRendererWidth = appInstance.renderer.width || 0;
  lastRendererHeight = appInstance.renderer.height || 0;

  // model.autoUpdate = true causes crash if Ticker is not registered correctly with the class.
  // We use manual update in the app ticker below, so we don't need autoUpdate.
  /*
  try {
    const anyModel = model as any;
    if (anyModel && 'autoUpdate' in anyModel) {
      anyModel.autoUpdate = true;
    }
  } catch {
  }
  */

  if (!tickerAdded) {
    tickerAdded = true;
    appInstance.ticker.add((delta: number) => {
      if (model && typeof model.update === 'function') {
        const w = appInstance.renderer.width || 0;
        const h = appInstance.renderer.height || 0;
        if (
          currentModelPath &&
          w > 0 &&
          h > 0 &&
          (w !== lastRendererWidth || h !== lastRendererHeight)
        ) {
          lastRendererWidth = w;
          lastRendererHeight = h;
          applyCubism3Layout(appInstance, currentModelPath);
        }
        model.update(delta);
        applyAgentDrivenParams(delta);
      }
    });
  }

  return true;
};

export const playCubism3Motion = (group: string, index?: number): boolean => {
  if (!model) return false;

  const m = model as any;

  const resolvedGroup = resolveMotionGroupName(group);
  if (!resolvedGroup) return false;

  let targetIndex = index;
  try {
    const definitions = m.internalModel?.motionManager?.definitions?.[resolvedGroup];
    if (Array.isArray(definitions) && definitions.length > 0) {
      if (targetIndex === undefined || targetIndex < 0 || targetIndex >= definitions.length) {
        targetIndex = Math.floor(Math.random() * definitions.length);
      }
    }
  } catch {}

  if (typeof m.motion === 'function') {
    const controller = m.motion(resolvedGroup);
    if (controller && typeof controller.play === 'function') {
      try {
        controller.play(targetIndex);
        return true;
      } catch {}
    }
  }
  return false;
};

export const setCubism3Expression = (expressionId: string) => {
  if (!model) return;
  const m = model as any;
  if (typeof m.expression === 'function') {
    const resolved = resolveExpressionId(expressionId);
    if (resolved) {
      syntheticExpressionTargets = null;
      syntheticExpressionEntries = null;
      try {
        m.expression(resolved);
      } catch {}
      return;
    }
  }

  const synth = getSyntheticExpressionTargets(expressionId);
  syntheticExpressionTargets = synth;
  syntheticExpressionEntries = synth ? Object.entries(synth) : null;
};

export const setCubism3Talking = (active: boolean) => {
  talkingActive = !!active;
};

export const triggerCubism3SyntheticMotion = (
  motion: string,
  options?: { durationMs?: number; intensity?: number }
) => {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const normalized = normalizeKey(motion || '');
  if (!normalized) return;

  const durationMs = Math.max(350, Math.min(3600, options?.durationMs ?? 1200));
  const intensity = clamp(options?.intensity ?? 0.7, 0.1, 1.2);

  const type: SyntheticMotionType | null = SYNTHETIC_MOTION_MAP[normalized] || null;

  if (!type) return;

  syntheticMotionType = type;
  syntheticMotionStartedAt = now;
  syntheticMotionUntil = now + durationMs;
  syntheticMotionIntensity = intensity;
};

export const setCubism3PointOfInterest = (x: number, y: number) => {
  poiTarget.x = clamp(x, -1, 1);
  poiTarget.y = clamp(y, -1, 1);
  poiLastUpdateAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
};

export const getCubism3HitAreas = (): string[] => {
  if (!model) return [];
  const m = model as any;
  try {
    return Object.keys(m.internalModel?.hitAreas || {});
  } catch {
    return [];
  }
};

export const getCubism3MotionGroups = (): string[] => {
  if (!model) return [];
  const m = model as any;
  try {
    return Object.keys(m.internalModel?.motionManager?.definitions || {});
  } catch {
    return [];
  }
};

export const hitTestCubism3 = (x: number, y: number): string[] => {
  if (!model) return [];
  const m = model as any;
  if (typeof m.hitTest === 'function') {
    const view = (app?.view as HTMLCanvasElement | undefined) || undefined;
    const rect = view?.getBoundingClientRect() || getContainer()?.getBoundingClientRect();
    if (!rect) return [];

    const screenW = Number(app?.renderer?.screen?.width) || rect.width || 1;
    const screenH = Number(app?.renderer?.screen?.height) || rect.height || 1;
    const scaleX = screenW / Math.max(1, rect.width);
    const scaleY = screenH / Math.max(1, rect.height);

    const localX = (x - rect.left) * scaleX;
    const localY = (y - rect.top) * scaleY;
    return m.hitTest(localX, localY);
  }
  return [];
};

export const disposeCubism3 = () => {
  if (app) {
    if (model) {
      try {
        app.stage.removeChild(model);
      } catch {}
      if (typeof model.destroy === 'function') {
        try {
          model.destroy({ children: true, texture: true, baseTexture: true });
        } catch {}
      }
      model = null;
    }
    app.destroy(true, { children: true, texture: true, baseTexture: true });
    app = null;
    tickerAdded = false;
  }

  const container = getContainer();
  if (container) {
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  currentModelPath = '';
  lastRendererWidth = 0;
  lastRendererHeight = 0;
  poiTarget.x = 0;
  poiTarget.y = 0;
  poiCurrent.x = 0;
  poiCurrent.y = 0;
  poiLastUpdateAt = 0;
  talkingActive = false;
  talkingPhase = 0;
  syntheticExpressionTargets = null;
  syntheticExpressionEntries = null;
  syntheticExpressionActiveIds.clear();
  syntheticMotionType = null;
  syntheticMotionUntil = 0;
  syntheticMotionStartedAt = 0;
  lastLayoutLogKey = '';
  coreSetParam = null;
  lastParamValues = {};
  motionGroupKeysCache = null;
  expressionNamesCache = null;
  resolvedMotionGroupCache.clear();
  resolvedExpressionCache.clear();
};
