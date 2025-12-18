import * as PIXI from 'pixi.js';
import { Application } from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';

// Expose PIXI globally for pixi-live2d-display if needed
if (typeof window !== 'undefined' && !(window as any).PIXI) {
  (window as any).PIXI = PIXI;
}

let app: any | null = null;
let model: any = null;
let tickerAdded = false;

let poiTarget = { x: 0, y: 0 };
let poiCurrent = { x: 0, y: 0 };
let poiLastUpdateAt = 0;

let talkingActive = false;
let talkingPhase = 0;

let lastRendererWidth = 0;
let lastRendererHeight = 0;
let currentModelPath = '';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const safeSetParam = (id: string, value: number) => {
  if (!model) return;
  const m = model as any;
  const coreModel = m.internalModel?.coreModel;
  if (!coreModel || typeof coreModel.setParameterValueById !== 'function') return;
  try {
    coreModel.setParameterValueById(id, value);
  } catch {}
};

const getMotionDefinitions = (): Record<string, any[]> => {
  if (!model) return {};
  const m = model as any;
  const defs = m.internalModel?.motionManager?.definitions;
  if (defs && typeof defs === 'object') return defs;
  return {};
};

const resolveMotionGroupName = (requestedGroup: string): string | undefined => {
  const defs = getMotionDefinitions();
  const keys = Object.keys(defs);
  if (keys.length === 0) return undefined;

  if (requestedGroup in defs) return requestedGroup;

  const requestedNorm = normalizeKey(requestedGroup);
  const exact = keys.find((k) => normalizeKey(k) === requestedNorm);
  if (exact) return exact;

  const contains = keys.find(
    (k) => normalizeKey(k).includes(requestedNorm) || requestedNorm.includes(normalizeKey(k))
  );
  if (contains) return contains;

  return keys[0];
};

const getExpressionNames = (): string[] => {
  if (!model) return [];
  const m = model as any;
  const maybeDefs =
    m.internalModel?.expressionManager?.definitions ||
    m.internalModel?.expressionManager?.expressions ||
    m.internalModel?.expressions;

  if (Array.isArray(maybeDefs)) {
    return maybeDefs
      .map((x: any) => {
        if (typeof x === 'string') return x;
        return x?.Name || x?.name || x?.Id || x?.id;
      })
      .filter((x: any) => typeof x === 'string');
  }

  if (maybeDefs && typeof maybeDefs === 'object') {
    return Object.keys(maybeDefs);
  }

  return [];
};

const resolveExpressionId = (requested: string): string | undefined => {
  const names = getExpressionNames();
  if (names.length === 0) return requested || undefined;

  if (names.includes(requested)) return requested;

  const base = requested.replace(/\.exp3\.json$/i, '').replace(/\.json$/i, '');
  if (names.includes(base)) return base;

  const reqNorm = normalizeKey(base);
  const exact = names.find((n) => normalizeKey(n) === reqNorm);
  if (exact) return exact;

  const contains = names.find(
    (n) => normalizeKey(n).includes(reqNorm) || reqNorm.includes(normalizeKey(n))
  );
  if (contains) return contains;

  return undefined;
};

const applyAgentDrivenParams = (delta: number) => {
  if (!model) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const idleTimeoutMs = 1800;
  if (poiLastUpdateAt > 0 && now - poiLastUpdateAt > idleTimeoutMs) {
    poiTarget = { x: 0, y: 0 };
  }

  const t = clamp(0.12 * (delta || 1), 0.05, 0.28);
  poiCurrent = {
    x: lerp(poiCurrent.x, poiTarget.x, t),
    y: lerp(poiCurrent.y, poiTarget.y, t)
  };

  const x = clamp(poiCurrent.x, -1, 1);
  const y = clamp(poiCurrent.y, -1, 1);

  safeSetParam('ParamEyeBallX', x);
  safeSetParam('ParamEyeBallY', y);
  safeSetParam('ParamAngleX', x * 30);
  safeSetParam('ParamAngleY', y * 30);
  safeSetParam('ParamAngleZ', x * y * -10);
  safeSetParam('ParamBodyAngleX', x * 10);

  const mouthSmooth = clamp(0.18 * (delta || 1), 0.08, 0.35);
  if (talkingActive) {
    talkingPhase += 0.22 * (delta || 1);
    const open = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(talkingPhase));
    safeSetParam('ParamMouthOpenY', open);
    safeSetParam('ParamMouthForm', 0.2 * Math.sin(talkingPhase * 0.7));
  } else {
    talkingPhase = lerp(talkingPhase, 0, mouthSmooth);
    safeSetParam('ParamMouthOpenY', 0);
    safeSetParam('ParamMouthForm', 0);
  }
};

const getContainer = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  return document.getElementById('live2d-cubism3') as HTMLElement | null;
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

  // Patch autoUpdate to prevent internal ticker errors
  try {
    const Live2D = Live2DModel as any;
    if (Live2D && Live2D.prototype) {
      // Check if already patched
      const desc = Object.getOwnPropertyDescriptor(Live2D.prototype, 'autoUpdate');
      // If it's not our patch (we can't easily tell, but we can just overwrite)
      // We only overwrite if it's configurable or missing
      if (!desc || desc.configurable) {
        Object.defineProperty(Live2D.prototype, 'autoUpdate', {
          get() {
            return (this as any)._autoUpdateEnabled || false;
          },
          set(value: boolean) {
            (this as any)._autoUpdateEnabled = !!value;
            // Do NOT call internal ticker logic here
          },
          configurable: true
        });
        console.log('[Live2D] Successfully patched autoUpdate');
      } else {
        console.warn('[Live2D] autoUpdate is not configurable');
      }
    }
  } catch (e) {
    console.warn('[Live2D] Error patching autoUpdate:', e);
  }

  app = new Application({ resizeTo: container as any, backgroundAlpha: 0 });

  container.innerHTML = '';
  container.appendChild(app.view as HTMLCanvasElement);

  try {
    const Live2D = Live2DModel as any;
    if (Live2D && typeof Live2D.registerTicker === 'function') {
      if (app.ticker) {
        Live2D.registerTicker(app.ticker);
        console.log('[Live2D] Registered ticker');
      } else {
        console.warn('[Live2D] app.ticker is missing. AutoUpdate may fail.');
      }
    }
  } catch (e) {
    console.warn('[Live2D] Error registering ticker:', e);
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

  console.log('[Live2D] Cubism3 Layout Applied:', {
    modelJsonPath,
    rendererWidth,
    rendererHeight,
    bucket: layout.bucket,
    specialScale: layout.specialScale,
    finalScale: layout.scale,
    boundsW: layout.boundsW,
    boundsH: layout.boundsH
  });
};

export const loadCubism3Model = async (modelJsonPath: string) => {
  const appInstance = await ensureApp();
  if (!appInstance) return;

  if (model) {
    appInstance.stage.removeChild(model);
    model.destroy();
    model = null;
  }

  const Live2D = Live2DModel as any;
  try {
    model = await Live2D.from(modelJsonPath, { autoUpdate: false });
  } catch (err) {
    console.error('[Live2D] Failed to load Cubism3 model:', err);
    return;
  }

  currentModelPath = modelJsonPath;

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
        applyAgentDrivenParams(delta);
        model.update(delta);
      }
    });
  }
};

export const playCubism3Motion = (group: string, index?: number) => {
  if (!model) return;

  const m = model as any;

  const resolvedGroup = resolveMotionGroupName(group);
  if (!resolvedGroup) return;

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
      } catch {}
    }
  }
};

export const setCubism3Expression = (expressionId: string) => {
  if (!model) return;
  const m = model as any;
  if (typeof m.expression === 'function') {
    const resolved = resolveExpressionId(expressionId);
    if (!resolved) return;
    try {
      m.expression(resolved);
    } catch {}
  }
};

export const setCubism3Talking = (active: boolean) => {
  talkingActive = !!active;
};

export const setCubism3PointOfInterest = (x: number, y: number) => {
  poiTarget = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
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
    const container = getContainer();
    if (!container) return [];
    const rect = container.getBoundingClientRect();
    const localX = x - rect.left;
    const localY = y - rect.top;
    return m.hitTest(localX, localY);
  }
  return [];
};

export const disposeCubism3 = () => {
  if (app) {
    if (model) {
      app.stage.removeChild(model);
      if (typeof model.destroy === 'function') {
        model.destroy();
      }
      model = null;
    }
    app.destroy(true, { children: true, texture: true, baseTexture: true });
    app = null;
    tickerAdded = false;
  }

  const container = getContainer();
  if (container) {
    container.innerHTML = '';
  }
};
