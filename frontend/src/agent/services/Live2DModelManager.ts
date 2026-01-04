/**
 * @file Contains classes related to waifu model loading and management.
 * @module model
 */

import { showMessage } from './message';
import { loadExternalResource, randomOtherOption } from '../utils';
import logger from '../utils/logger';
import type { ModelList, ModelListCDN, Config, ModelIndexItem } from '../types/live2d';
import {
  loadCubism3Model,
  playCubism3Motion,
  disposeCubism3,
  setCubism3Expression,
  setCubism3Talking,
  hitTestCubism3,
  setCubism3PointOfInterest,
  getCubism3HitAreas,
  getCubism3MotionGroups,
  triggerCubism3SyntheticMotion
} from '../live2d-widget/cubism3';

// We import Cubism2Model type for type checking, but we load it dynamically or via index
// Since the original code imported it via dynamic import in loadLive2D, we keep that pattern or import it directly if possible.
// However, the original code had:
// // @ts-ignore
// import type Cubism2Model from './cubism2/index';
// And then dynamic import.

// Let's import the type only
// @ts-ignore
import type Cubism2Model from '../live2d-widget/cubism2/index';

import {
  MOTION_MAPPING,
  EXPRESSION_MAPPING,
  type LogicMotion,
  type LogicExpression
} from '../data/motionMapping';

export class ModelManager {
  public readonly useCDN: boolean;
  private readonly cdnPath: string;
  private readonly assetsPath: string;
  private readonly cubism2Path: string;
  private modelDirectory: 'model' | 'model_backup';
  private readonly hasStoredModelId: boolean;
  private _modelId: number;
  private _modelTexturesId: number;
  private modelList: ModelListCDN | null = null;
  private modelIndex: ModelIndexItem[] = []; // New index support
  private cubism2model: Cubism2Model | undefined;
  private currentModelVersion: number;
  private loading: boolean;
  private loadingListeners: Set<
    (loading: boolean, info?: { modelSettingPath?: string; version?: number }) => void
  >;
  private modelJSONCache: Record<string, any>;
  private modelJSONNegativeCache: Set<string>;
  private models: ModelList[];

  private lastMotionAt: Record<string, number>;
  private lastExpressionKey: string;
  private lastExpressionAt: number;
  private lastPoiX: number;
  private lastPoiY: number;
  private lastPoiAt: number;

  constructor(config: Config, models: ModelList[] = []) {
    let { apiPath, cdnPath } = config;
    let { assetsPath } = config;
    const { cubism2Path } = config;
    let useCDN = false;
    if (typeof cdnPath === 'string') {
      if (!cdnPath.endsWith('/')) cdnPath += '/';
      useCDN = true;
    } else if (typeof apiPath === 'string') {
      if (!apiPath.endsWith('/')) apiPath += '/';
      cdnPath = apiPath;
      useCDN = true;
      logger.warn('apiPath option is deprecated. Please use cdnPath instead.');
    } else if (!models.length) {
      throw 'Invalid initWidget argument!';
    }

    if (typeof assetsPath === 'string') {
      if (!assetsPath.endsWith('/')) assetsPath += '/';
    } else {
      assetsPath = cdnPath;
    }
    const modelIdRaw = localStorage.getItem('modelId') as string | null;
    const storedModelId = parseInt(modelIdRaw ?? '', 10);
    const hasStoredModelId = !isNaN(storedModelId);

    let modelId: number = storedModelId;
    let modelTexturesId: number = parseInt(localStorage.getItem('modelTexturesId') as string, 10);
    if (isNaN(modelId) || isNaN(modelTexturesId)) {
      modelTexturesId = 0;
    }
    if (isNaN(modelId)) {
      modelId = config.modelId ?? 0;
    }
    this.useCDN = useCDN;
    this.cdnPath = cdnPath || '';
    this.assetsPath = assetsPath || this.cdnPath;
    this.cubism2Path = cubism2Path || '';

    // In development (local), we use 'model' directory (symlinked to doc/model) to access all models
    // In production, we use 'model_backup' or whatever is configured.
    const assetsBase = this.assetsPath || '';
    const isHfAssetsBase =
      /^\/api\/hf\//i.test(assetsBase) || /huggingface\.co|hf-mirror\.com|hf\.co/i.test(assetsBase);
    const isRemoteAssetsBase = /^https?:\/\//i.test(assetsBase) || isHfAssetsBase;
    if (import.meta.env.DEV && !isRemoteAssetsBase) this.modelDirectory = 'model';
    else if (isHfAssetsBase) this.modelDirectory = 'model';
    else this.modelDirectory = 'model_backup';

    this.hasStoredModelId = hasStoredModelId;
    this._modelId = modelId;
    this._modelTexturesId = modelTexturesId;
    this.currentModelVersion = 0;
    this.loading = false;
    this.loadingListeners = new Set();
    this.modelJSONCache = {};
    this.modelJSONNegativeCache = new Set();
    this.models = models;
    this.lastMotionAt = {};
    this.lastExpressionKey = '';
    this.lastExpressionAt = 0;
    this.lastPoiX = 0;
    this.lastPoiY = 0;
    this.lastPoiAt = 0;
  }

  public onLoadingChange(
    listener: (loading: boolean, info?: { modelSettingPath?: string; version?: number }) => void
  ) {
    this.loadingListeners.add(listener);
    try {
      listener(this.loading);
    } catch {}
    return () => {
      this.loadingListeners.delete(listener);
    };
  }

  public get isLoading() {
    return this.loading;
  }

  private emitLoading(loading: boolean, info?: { modelSettingPath?: string; version?: number }) {
    for (const l of this.loadingListeners) {
      try {
        l(loading, info);
      } catch {}
    }
  }

  private getModelAssetUrlCandidates(
    modelRelativePath: string,
    overrideDir?: 'model' | 'model_backup'
  ): string[] {
    const dir = overrideDir ?? this.modelDirectory;
    const raw = (modelRelativePath || '').replace(/^\/+/, '');
    const assetsBase = this.assetsPath || '';
    const base = assetsBase.endsWith('/') ? assetsBase : `${assetsBase}/`;

    const candidates: string[] = [];
    const includesDirPrefix = /^model_backup\/|^model\//i.test(raw);
    const pathWithDir = includesDirPrefix ? raw : `${dir}/${raw}`;

    const isHttp = /^https?:\/\//i.test(base);
    const hasLive2dSegment = /\/live2d\/$/i.test(base) || /\/live2d\//i.test(base);
    const addCandidate = (path: string) => {
      if (!path) return;
      candidates.push(`${base}${path}`);
      if (isHttp && !hasLive2dSegment) {
        candidates.push(`${base}live2d/${path}`);
      }
    };

    addCandidate(pathWithDir);

    const strippedShaoqian = raw.replace(/^shaoqian\//i, '');
    if (strippedShaoqian && strippedShaoqian !== raw) {
      const altIncludesDirPrefix = /^model_backup\/|^model\//i.test(strippedShaoqian);
      const altPathWithDir = altIncludesDirPrefix ? strippedShaoqian : `${dir}/${strippedShaoqian}`;
      addCandidate(altPathWithDir);
    }

    return Array.from(new Set(candidates));
  }

  private getModelAssetUrl(modelRelativePath: string, overrideDir?: 'model' | 'model_backup') {
    const candidates = this.getModelAssetUrlCandidates(modelRelativePath, overrideDir);
    return candidates[0] || '';
  }

  private async fetchJson(url: string, silent = false) {
    if (url in this.modelJSONCache) return this.modelJSONCache[url];
    if (this.modelJSONNegativeCache.has(url)) return null;
    const timeoutMs = 15000;
    const maxAttempts = 3;
    const backoffMs = (attempt: number) => 250 * attempt;

    let lastError: unknown = null;
    const debug =
      import.meta.env.DEV &&
      /(^\/api\/hf\/)|huggingface\.co|hf-mirror\.com|hf\.co/i.test(String(url || ''));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response: Response | null = null;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = debug ? performance.now() : 0;

      try {
        response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          if (debug) {
            console.warn('[Live2D] fetchJson non-OK', {
              url,
              attempt,
              status: response.status,
              statusText: response.statusText,
              elapsedMs: Math.round(performance.now() - startedAt)
            });
          }
          const retryable =
            response.status === 408 ||
            response.status === 429 ||
            (response.status >= 500 && response.status <= 599);

          if (!retryable || attempt === maxAttempts) {
            if (
              response.status >= 400 &&
              response.status <= 499 &&
              response.status !== 408 &&
              response.status !== 429
            ) {
              this.modelJSONNegativeCache.add(url);
            }
            if (!silent) {
              logger.error(`Failed to fetch model json: ${url}, status ${response.status}`);
            }
            return null;
          }

          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json') || contentType.includes('+json');
        const urlLooksJson = url.toLowerCase().includes('.json');
        if (!isJson && !urlLooksJson) {
          if (debug) {
            console.warn('[Live2D] fetchJson unexpected content-type', { url, contentType });
          }
          if (!silent) {
            logger.error(
              `Failed to fetch model json: ${url}, content-type ${contentType || 'unknown'}`
            );
          }
          return null;
        }

        try {
          const result = isJson ? await response.json() : JSON.parse(await response.text());
          if (debug) {
            console.log('[Live2D] fetchJson OK', {
              url,
              attempt,
              elapsedMs: Math.round(performance.now() - startedAt)
            });
          }
          this.modelJSONCache[url] = result;
          return result;
        } catch (e) {
          lastError = e;
          if (attempt === maxAttempts) {
            if (!silent) {
              logger.error(`Failed to parse model json: ${url}`, e);
            }
            return null;
          }
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          continue;
        }
      } catch (e) {
        lastError = e;
        if (debug) {
          console.warn('[Live2D] fetchJson error', {
            url,
            attempt,
            elapsedMs: Math.round(performance.now() - startedAt),
            error: String((e as any)?.message || e)
          });
        }
        const isAbort = e instanceof DOMException && e.name === 'AbortError';
        if (attempt === maxAttempts) {
          if (!silent) {
            logger.error('Failed to fetch model json: ' + url, e);
          }
          return null;
        }
        if (!isAbort && !silent && attempt === 1) {
          logger.warn(`Fetch model json failed, retrying: ${url}`);
        }
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    if (!silent && lastError) {
      logger.error('Failed to fetch model json: ' + url, lastError);
    }
    return null;
  }

  private async fetchModelJsonWithFallback(
    modelRelativePath: string,
    options?: {
      silent?: boolean;
    }
  ) {
    const silent = Boolean(options?.silent);
    const primaryCandidates = this.getModelAssetUrlCandidates(
      modelRelativePath,
      this.modelDirectory
    );
    for (const url of primaryCandidates) {
      const json = await this.fetchJson(url, true);
      if (json) return { url, json };
    }

    const alternateDir: 'model' | 'model_backup' =
      this.modelDirectory === 'model' ? 'model_backup' : 'model';
    const alternateCandidates = this.getModelAssetUrlCandidates(modelRelativePath, alternateDir);
    for (const url of alternateCandidates) {
      const json = await this.fetchJson(url, true);
      if (json) {
        this.modelDirectory = alternateDir;
        return { url, json };
      }
    }

    const lastErrorUrl =
      alternateCandidates[alternateCandidates.length - 1] ||
      primaryCandidates[primaryCandidates.length - 1] ||
      modelRelativePath;
    if (import.meta.env.DEV) {
      console.groupCollapsed('[Live2D] Failed to load model json');
      console.log({
        modelRelativePath,
        assetsPath: this.assetsPath,
        modelDirectory: this.modelDirectory,
        primaryCandidates,
        alternateDir,
        alternateCandidates
      });
      console.groupEnd();
    }
    if (!silent) {
      logger.error(`Model setting is invalid for path ${lastErrorUrl}`);
    }
    return null;
  }

  private nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private shouldThrottleMotion(motionName: string) {
    const name = motionName.toLowerCase();
    const now = this.nowMs();

    const cooldownMs =
      name === 'talking'
        ? 700
        : name === 'tap_body'
          ? 250
          : name === 'flick_head'
            ? 500
            : name === 'activity'
              ? 1200
              : name === 'shake'
                ? 1200
                : 900;

    const last = this.lastMotionAt[name] ?? 0;
    if (now - last < cooldownMs) return true;
    this.lastMotionAt[name] = now;
    return false;
  }

  private parseV3MotionCommand(command: string): { group: string; index?: number } | null {
    const trimmed = command.trim();
    if (!trimmed) return null;

    const match = trimmed.match(/^(.+?)\s*[:#/()]\s*(\d+|random)\s*\)?$/i);
    if (!match) {
      return { group: trimmed };
    }

    const group = (match[1] || '').trim();
    const idxRaw = (match[2] || '').trim().toLowerCase();
    if (!group) return null;

    if (idxRaw === 'random') return { group };
    const index = Number.parseInt(idxRaw, 10);
    if (!Number.isFinite(index)) return { group };
    return { group, index };
  }

  private shouldThrottleMotionKey(motionKey: string) {
    const key = motionKey.toLowerCase();
    const now = this.nowMs();

    const cooldownMs = key.startsWith('talking')
      ? 700
      : key.startsWith('tap_body')
        ? 250
        : key.startsWith('flick_head')
          ? 500
          : key.startsWith('activity')
            ? 1200
            : key.startsWith('shake')
              ? 1200
              : 900;

    const last = this.lastMotionAt[key] ?? 0;
    if (now - last < cooldownMs) return true;
    this.lastMotionAt[key] = now;
    return false;
  }

  public async loadAdjacentModels() {
    if (this.modelIndex.length === 0) return;

    const count = this.modelIndex.length;
    const current = this.modelId;

    const loadAt = async (id: number) => {
      if (id < 0 || id >= count) return;
      const item = this.modelIndex[id];
      if (!item) return;
      // Just fetch json to cache it
      await this.fetchModelJsonWithFallback(`${item.path}/${item.configFile}`, { silent: true });
    };

    // Load 3 left and 3 right
    const targets = new Set<number>();
    for (let i = 1; i <= 3; i++) {
      targets.add((current - i + count) % count);
      targets.add((current + i) % count);
    }

    for (const id of targets) {
      if (id === current) continue;
      await loadAt(id);
    }
  }

  public static async initCheck(config: Config, models: ModelList[] = []) {
    const model = new ModelManager(config, models);

    // In development mode, we prioritize local Ziyuxin models but also try to load model_index.json
    // to allow seeing other models if available locally.
    if (import.meta.env.DEV) {
      // First, try to load model_index.json or model_list.json from the configured path
      let loadedIndex = false;

      try {
        const indexResponse = await fetch(`${model.cdnPath}model_index.json`);
        if (indexResponse.ok) {
          model.modelIndex = await indexResponse.json();
          if (model.modelIndex.length > 0) {
            loadedIndex = true;
            logger.info(
              `[DEV] Loaded ${model.modelIndex.length} models from local model_index.json`
            );
          }
        }
      } catch (e) {
        logger.warn('[DEV] Failed to load local model_index.json', e);
      }

      if (!loadedIndex) {
        try {
          const listResponse = await fetch(`${model.cdnPath}model_list.json`);
          if (listResponse.ok) {
            model.modelList = await listResponse.json();
            if (
              model.modelList &&
              Array.isArray(model.modelList.models) &&
              model.modelList.models.length > 0
            ) {
              loadedIndex = true;
              logger.info(`[DEV] Loaded models from local model_list.json`);
            }
          }
        } catch (e) {
          logger.warn('[DEV] Failed to load local model_list.json', e);
        }
      }

      // If we couldn't load any index/list, OR if we want to ensure Ziyuxin is available as a fallback/default
      // We merge or set the Ziyuxin models.
      // However, the user requirement says: "local only use ziyuxin... connect local model so I can see others".
      // And "online... logic do not change".
      // So if we found an index, we use it. If not, we fall back to the hardcoded list.

      if (!loadedIndex) {
        model.modelIndex = [];
        model.modelList = {
          models: [
            'shaoqian/ZiYuXin/ots14_1203/normal/normal.model3.json',
            'shaoqian/ZiYuXin/ots14_3001/normal/normal.model3.json',
            'shaoqian/ZiYuXin/ots14_4501/normal/normal.model3.json',
            'shaoqian/ZiYuXin/ots14_5602/normal/normal.model3.json'
          ],
          messages: ['Ziyuxin (Local)', 'Ziyuxin (Skin 2)', 'Ziyuxin (Skin 3)', 'Ziyuxin (Skin 4)']
        };
        logger.info('[DEV] Using hardcoded Ziyuxin models as fallback');
      }

      // Initialize with the first model or stored ID
      if (
        model.modelId >=
        (model.modelIndex.length > 0
          ? model.modelIndex.length
          : model.modelList?.models.length || 0)
      ) {
        model.modelId = 0;
      }

      // If we loaded from index, we need to use primeIndexAt logic, otherwise primeListAt logic.
      // Since the original code for DEV block only had primeListAt, we need to adapt.

      if (loadedIndex && model.modelIndex.length > 0) {
        // Use Index Logic for DEV if index loaded
        const primeIndexAt = async (id: number) => {
          if (id < 0 || id >= model.modelIndex.length) return false;
          const item = model.modelIndex[id];
          const loaded = await model.fetchModelJsonWithFallback(`${item.path}/${item.configFile}`, {
            silent: true
          });
          if (!loaded?.json) return false;

          if (id === model.modelId) {
            model.currentModelVersion = model.checkModelVersion(loaded.json);
            model.modelTexturesId = 0;
          }
          return true;
        };

        let primed = await primeIndexAt(model.modelId);

        const dafengIndex = model.modelIndex.findIndex((m) => m.name === 'dafeng_6');

        if (!primed) {
          // If primary failed, try dafeng_6
          if (dafengIndex >= 0) {
            primed = await primeIndexAt(dafengIndex);
            if (primed) model.modelId = dafengIndex;
          }
          // If still failed, try index 0
          if (!primed && model.modelIndex.length > 0) {
            primed = await primeIndexAt(0);
            if (primed) model.modelId = 0;
          }
        }

        return model;
      } else {
        // Use List Logic (Hardcoded or loaded from model_list.json)
        const primeListAt = async (id: number) => {
          const entry = model.modelList?.models[id];
          let modelName = entry;

          if (Array.isArray(modelName)) {
            modelName = modelName[0];
          }
          if (typeof modelName !== 'string') return false;

          const configPath = modelName.trim().toLowerCase().endsWith('.json')
            ? modelName
            : `${modelName}/model.json`;
          const loaded = await model.fetchModelJsonWithFallback(configPath, { silent: true });
          if (!loaded?.json) return false;

          model.modelId = id;
          model.modelTexturesId = 0;

          const version = model.checkModelVersion(loaded.json);
          if (version === 2) {
            model.currentModelVersion = 2;
            if (!modelName.trim().toLowerCase().endsWith('.json')) {
              const textureCache = await model.loadTextureCache(modelName as string);
              if (model.modelTexturesId >= textureCache.length) {
                model.modelTexturesId = 0;
              }
            }
          } else if (version === 3) {
            model.currentModelVersion = 3;
          }
          return true;
        };

        let primed = await primeListAt(model.modelId);
        if (!primed) {
          for (let i = 0; i < (model.modelList?.models.length || 0); i++) {
            if (i === model.modelId) continue;
            primed = await primeListAt(i);
            if (primed) break;
          }
        }
        return model;
      }
    }

    if (model.useCDN) {
      // Try loading new model_index.json first
      try {
        const indexResponse = await fetch(`${model.cdnPath}model_index.json`);
        if (indexResponse.ok) {
          model.modelIndex = await indexResponse.json();
          logger.info(`Loaded ${model.modelIndex.length} models from model_index.json`);
        }
      } catch (e) {
        logger.warn('Failed to load model_index.json', e);
      }

      // Fallback or legacy loading if index not found or empty
      if (model.modelIndex.length === 0) {
        try {
          const response = await fetch(`${model.cdnPath}model_list.json`);
          if (response.ok) {
            model.modelList = await response.json();
          }
        } catch (e) {
          logger.warn('Failed to load model_list.json', e);
        }
      }

      if (model.modelIndex.length > 0) {
        try {
          if (
            model.hasStoredModelId &&
            typeof config.modelId === 'number' &&
            model.modelIndex[model.modelId]?.version === 2 &&
            model.modelIndex[config.modelId]?.version === 3
          ) {
            model.modelId = config.modelId;
          }
        } catch {}

        if (model.modelId >= model.modelIndex.length) {
          model.modelId = 0;
        }
        // Load using Index
        const primeIndexAt = async (id: number) => {
          if (id < 0 || id >= model.modelIndex.length) return false;
          const item = model.modelIndex[id];
          const loaded = await model.fetchModelJsonWithFallback(`${item.path}/${item.configFile}`, {
            silent: true
          });
          if (!loaded?.json) return false;

          if (id === model.modelId) {
            model.currentModelVersion = model.checkModelVersion(loaded.json);
            model.modelTexturesId = 0;
          }
          return true;
        };

        let primed = await primeIndexAt(model.modelId);

        const dafengIndex = model.modelIndex.findIndex((m) => m.name === 'dafeng_6');

        if (!primed) {
          if (dafengIndex >= 0) {
            primed = await primeIndexAt(dafengIndex);
            if (primed) model.modelId = dafengIndex;
          }
          if (!primed && model.modelIndex.length > 0) {
            primed = await primeIndexAt(0);
            if (primed) model.modelId = 0;
          }
        }

        if (!primed) {
          try {
            const response = await fetch(`${model.cdnPath}model_list.json`);
            if (response.ok) {
              model.modelList = await response.json();
              model.modelIndex = [];
            }
          } catch (e) {
            logger.warn('Failed to recover via model_list.json', e);
          }
        }
      } else if (model.modelList) {
        if (model.modelId >= model.modelList.models.length) {
          model.modelId = 0;
        }
        const primeListAt = async (id: number) => {
          const entry = model.modelList?.models[id];
          let modelName = entry;

          if (Array.isArray(modelName)) {
            modelName = modelName[0];
          }
          if (typeof modelName !== 'string') return false;

          const configPath = modelName.trim().toLowerCase().endsWith('.json')
            ? modelName
            : `${modelName}/model.json`;
          const loaded = await model.fetchModelJsonWithFallback(configPath, { silent: true });
          if (!loaded?.json) return false;

          model.modelId = id;
          model.modelTexturesId = 0;

          const version = model.checkModelVersion(loaded.json);
          if (version === 2) {
            model.currentModelVersion = 2;
            if (!modelName.trim().toLowerCase().endsWith('.json')) {
              const textureCache = await model.loadTextureCache(modelName as string);
              if (model.modelTexturesId >= textureCache.length) {
                model.modelTexturesId = 0;
              }
            }
          } else if (version === 3) {
            model.currentModelVersion = 3;
          }
          return true;
        };

        let primed = await primeListAt(model.modelId);
        if (!primed) {
          for (let i = 0; i < model.modelList.models.length; i++) {
            if (i === model.modelId) continue;
            primed = await primeListAt(i);
            if (primed) break;
          }
        }
      }
    } else {
      if (model.modelId >= model.models.length) {
        model.modelId = 0;
      }
      if (model.modelTexturesId >= model.models[model.modelId].paths.length) {
        model.modelTexturesId = 0;
      }
    }
    return model;
  }

  public set modelId(modelId: number) {
    this._modelId = modelId;
    localStorage.setItem('modelId', modelId.toString());
  }

  public get modelId() {
    return this._modelId;
  }

  public set modelTexturesId(modelTexturesId: number) {
    this._modelTexturesId = modelTexturesId;
    localStorage.setItem('modelTexturesId', modelTexturesId.toString());
  }

  public get modelTexturesId() {
    return this._modelTexturesId;
  }

  public getCurrentModelInfo(): {
    modelId: number;
    modelTexturesId: number;
    modelName?: string;
    modelPath?: string;
    configFile?: string;
    version?: number;
    source: 'index' | 'cdn_list' | 'local_list' | 'unknown';
  } {
    const modelId = this.modelId;
    const modelTexturesId = this.modelTexturesId;
    const version = this.currentModelVersion || undefined;

    if (this.modelIndex.length > 0) {
      const item = this.modelIndex[modelId];
      if (item) {
        return {
          modelId,
          modelTexturesId,
          modelName: item.name,
          modelPath: item.path,
          configFile: item.configFile,
          version: item.version || version,
          source: 'index'
        };
      }
    }

    if (this.useCDN && this.modelList && Array.isArray(this.modelList.models)) {
      const raw: any = (this.modelList.models as any)[modelId];
      const name = Array.isArray(raw) ? (raw[modelTexturesId] ?? raw[0]) : raw;
      if (typeof name === 'string' && name.trim()) {
        return {
          modelId,
          modelTexturesId,
          modelName: name.trim(),
          modelPath: name.trim(),
          version,
          source: 'cdn_list'
        };
      }
    }

    if (this.models.length > 0) {
      const m = this.models[modelId];
      if (m) {
        return {
          modelId,
          modelTexturesId,
          modelName: m.name,
          modelPath: m.paths?.[modelTexturesId] ?? m.paths?.[0],
          version,
          source: 'local_list'
        };
      }
    }

    return { modelId, modelTexturesId, version, source: 'unknown' };
  }

  resetCanvas() {
    const canvas = document.getElementById('waifu-canvas');
    if (canvas) {
      canvas.innerHTML = '<canvas id="live2d" width="800" height="800"></canvas>';
    }
  }

  async fetchWithCache(url: string) {
    return this.fetchJson(url, false);
  }

  checkModelVersion(modelSetting: any) {
    if (!modelSetting) {
      return 0;
    }
    if (modelSetting.Version === 3 || modelSetting.FileReferences) {
      return 3;
    }
    return 2;
  }

  async loadLive2D(modelSettingPath: string, modelSetting: object) {
    if (this.loading) {
      logger.warn('Still loading. Abort.');
      return;
    }
    if (!modelSetting) {
      logger.error(`loadLive2D called with empty modelSetting for ${modelSettingPath}`);
      return;
    }
    const version = this.checkModelVersion(modelSetting);
    const prevVersion = this.currentModelVersion;
    this.loading = true;
    this.emitLoading(true, { modelSettingPath, version });
    try {
      if (version === 2) {
        if (!this.cubism2model) {
          // Check if Live2D global is already available
          if (!(window as any).Live2D) {
            if (!this.cubism2Path) {
              throw new Error('No cubism2Path set, cannot load Cubism 2 Core.');
            }
            await loadExternalResource(this.cubism2Path, 'js');
          }

          // @ts-ignore
          const { default: Cubism2Model } = await import('../live2d-widget/cubism2/index');
          this.cubism2model = new Cubism2Model();
        }
        // Always reset canvas for now since we only support v2
        if (this.currentModelVersion !== 2 || !this.cubism2model!.gl) {
          await this.cubism2model!.init('live2d', modelSettingPath, modelSetting);
        } else {
          await this.cubism2model!.changeModelWithJSON(modelSettingPath, modelSetting);
        }
        this.setRendererVersion(2);
        this.currentModelVersion = 2;
      } else {
        try {
          try {
            const cubism3Container = document.getElementById(
              'live2d-cubism3'
            ) as HTMLElement | null;
            if (cubism3Container) cubism3Container.style.display = '';
          } catch {}

          const ok = await loadCubism3Model(modelSettingPath);
          if (ok) {
            this.setRendererVersion(3);
            this.currentModelVersion = 3;
          } else {
            try {
              if (prevVersion === 2) {
                const cubism3Container = document.getElementById(
                  'live2d-cubism3'
                ) as HTMLElement | null;
                if (cubism3Container) cubism3Container.style.display = 'none';
              }
            } catch {}
            throw new Error('loadCubism3Model returned false');
          }
        } catch (e) {
          logger.error('Failed to load Cubism3 model via Pixi renderer', e);
          showMessage('加载 Cubism3/4 模型时出错，请稍后重试', 5000, 9);
        }
      }
      logger.info(`Model ${modelSettingPath} (Cubism version ${version}) loaded`);
    } catch (err) {
      console.error('loadLive2D failed', err);
      showMessage('模型加载失败，请稍后重试', 5000, 9);
    } finally {
      this.loading = false;
      this.emitLoading(false, { modelSettingPath, version });
    }
  }

  private setRendererVersion(version: number) {
    try {
      const canvas = document.getElementById('live2d') as HTMLCanvasElement | null;
      const cubism3Container = document.getElementById('live2d-cubism3') as HTMLElement | null;
      if (version === 2) {
        if (canvas) {
          canvas.style.visibility = '';
          canvas.style.opacity = '';
          canvas.style.pointerEvents = '';
        }
        if (cubism3Container) cubism3Container.style.display = 'none';
        disposeCubism3();
      } else if (version === 3) {
        if (canvas) {
          canvas.style.visibility = 'hidden';
          canvas.style.opacity = '0';
          canvas.style.pointerEvents = 'none';
        }
        if (cubism3Container) cubism3Container.style.display = '';
        if (this.cubism2model && typeof (this.cubism2model as any).destroy === 'function') {
          try {
            (this.cubism2model as any).destroy();
          } catch {}
          this.cubism2model = undefined;
        }
      }
    } catch (e) {
      logger.error('Failed to toggle renderer version', e);
    }
  }

  private getExpectedSwitchVersion(): 2 | 3 {
    if (this.currentModelVersion === 3) return 3;
    return 2;
  }

  public getCurrentModelVersion(): 2 | 3 | null {
    if (this.currentModelVersion === 2 || this.currentModelVersion === 3)
      return this.currentModelVersion;
    return null;
  }

  private async loadIndexModelAt(id: number, expectedVersion?: 2 | 3) {
    const item = this.modelIndex[id];
    if (!item) return null;
    if (expectedVersion && item.version && item.version !== expectedVersion) return null;
    const loaded = await this.fetchModelJsonWithFallback(`${item.path}/${item.configFile}`, {
      silent: true
    });
    if (!loaded?.json) return null;
    const version = this.checkModelVersion(loaded.json);
    if (expectedVersion && version !== expectedVersion) return null;
    return { ...loaded, name: item.name, version };
  }

  private async loadListModelAt(id: number, expectedVersion?: 2 | 3) {
    if (!this.modelList) return null;
    let name: any = this.modelList.models[id];
    if (Array.isArray(name)) name = name[0];
    if (typeof name !== 'string') return null;

    const configPath = name.trim().toLowerCase().endsWith('.json') ? name : `${name}/model.json`;
    const loaded = await this.fetchModelJsonWithFallback(configPath, { silent: true });
    if (!loaded?.json) return null;
    const version = this.checkModelVersion(loaded.json);
    if (expectedVersion && version !== expectedVersion) return null;
    return { ...loaded, name, version };
  }

  async loadTextureCache(modelName: string): Promise<any[]> {
    const textureCache = await this.fetchJson(
      this.getModelAssetUrl(`${modelName}/textures.cache`),
      true
    );
    return textureCache || [];
  }

  public startMotion(name: string) {
    if (!name) return;
    if (this.loading) return;

    const lowerName = name.toLowerCase().trim();
    const mapping = MOTION_MAPPING[lowerName as LogicMotion];

    const v3Direct = this.parseV3MotionCommand(name);
    const throttleKey =
      this.currentModelVersion === 3 && v3Direct
        ? `${v3Direct.group}${typeof v3Direct.index === 'number' ? `:${v3Direct.index}` : ''}`
        : lowerName;

    const force =
      lowerName === 'tap_body' ||
      lowerName === 'flick_head' ||
      lowerName === 'shake' ||
      lowerName === 'happy' ||
      lowerName === 'sad' ||
      lowerName === 'surprised' ||
      lowerName === 'friend';

    if (!force && this.shouldThrottleMotionKey(throttleKey)) return;

    if (this.currentModelVersion === 3) {
      let played = false;
      if (mapping && mapping.v3 && mapping.v3.group) {
        played = playCubism3Motion(mapping.v3.group, mapping.v3.index);
      } else if (v3Direct) {
        played = playCubism3Motion(v3Direct.group, v3Direct.index);
      } else {
        played = playCubism3Motion(name);
      }
      if (!played) {
        triggerCubism3SyntheticMotion(lowerName, { durationMs: force ? 1400 : 1100 });
      }
      return;
    }

    if (this.cubism2model) {
      if (mapping && mapping.v2) {
        (this.cubism2model as any).startMotion(mapping.v2.group);
      } else {
        (this.cubism2model as any).startMotion(name);
      }
    }
  }

  public setExpression(name: string) {
    const lowerName = name.toLowerCase();
    const mapping = EXPRESSION_MAPPING[lowerName as LogicExpression];

    if (this.currentModelVersion === 3) {
      const resolvedKey = (mapping?.v3?.name || name || '').toLowerCase().trim();
      const now = this.nowMs();
      if (
        resolvedKey &&
        resolvedKey === this.lastExpressionKey &&
        now - this.lastExpressionAt < 2000
      ) {
        return;
      }
      this.lastExpressionKey = resolvedKey;
      this.lastExpressionAt = now;
      if (mapping && mapping.v3) {
        setCubism3Expression(mapping.v3.name);
      } else {
        setCubism3Expression(name);
      }
      return;
    }

    if (this.cubism2model) {
      const resolvedKey = (mapping?.v2?.name || name || '').toLowerCase().trim();
      const now = this.nowMs();
      if (
        resolvedKey &&
        resolvedKey === this.lastExpressionKey &&
        now - this.lastExpressionAt < 2000
      ) {
        return;
      }
      this.lastExpressionKey = resolvedKey;
      this.lastExpressionAt = now;
      if (mapping && mapping.v2) {
        (this.cubism2model as any).setExpression(mapping.v2.name);
      } else {
        (this.cubism2model as any).setExpression(name);
      }
    }
  }

  public setTalking(active: boolean) {
    if (this.currentModelVersion === 3) {
      setCubism3Talking(active);
    }
  }

  public hitTest(x: number, y: number): string[] {
    if (this.currentModelVersion === 3) {
      return hitTestCubism3(x, y);
    }
    // Cubism 2 hit test not implemented here yet (relies on internal events usually)
    return [];
  }

  public setPointOfInterest(x: number, y: number) {
    if (this.currentModelVersion === 3) {
      const now = this.nowMs();
      if (
        now - this.lastPoiAt < 34 &&
        Math.abs(x - this.lastPoiX) < 0.004 &&
        Math.abs(y - this.lastPoiY) < 0.004
      ) {
        return;
      }
      this.lastPoiAt = now;
      this.lastPoiX = x;
      this.lastPoiY = y;
      setCubism3PointOfInterest(x, y);
    }
    // Cubism 2 logic can be added here
  }

  public getHitAreas(): string[] {
    if (this.currentModelVersion === 3) {
      return getCubism3HitAreas();
    }
    return [];
  }

  public getMotionGroups(): string[] {
    if (this.currentModelVersion === 3) {
      return getCubism3MotionGroups();
    }
    return [];
  }

  public setEmotionFlags(flags: {
    isCrying?: boolean;
    isShy?: boolean;
    isHappy?: boolean;
    isAngry?: boolean;
  }) {
    if (this.cubism2model) {
      (this.cubism2model as any).setEmotionFlags(flags);
    }
  }

  async loadModel(message: string | string[]) {
    let modelSettingPath: string | undefined;
    let modelSetting: any;
    if (this.useCDN && this.modelIndex.length > 0) {
      const tryLoadIndexAt = async (id: number) => {
        const item = this.modelIndex[id];
        const loaded = await this.fetchModelJsonWithFallback(`${item.path}/${item.configFile}`, {
          silent: true
        });
        if (!loaded?.json) return null;
        this.modelId = id;
        this.modelTexturesId = 0;
        this.currentModelVersion = this.checkModelVersion(loaded.json);
        return loaded;
      };

      const count = this.modelIndex.length;
      const dafengIndex = this.modelIndex.findIndex((m) => m.name === 'dafeng_6');
      const probeIds: number[] = [];
      probeIds.push(this.modelId);
      if (dafengIndex >= 0) probeIds.push(dafengIndex);
      probeIds.push(0);
      const maxProbe = Math.min(count, 10);
      for (let i = 0; i < maxProbe; i++) probeIds.push(i);

      let loaded: { url: string; json: any } | null = null;
      const seen = new Set<number>();
      for (const id of probeIds) {
        if (id < 0 || id >= count) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        loaded = await tryLoadIndexAt(id);
        if (loaded) break;
      }

      if (!loaded) {
        showMessage('Failed to load model configuration.', 4000, 10);
        return;
      }

      modelSettingPath = loaded.url;
      modelSetting = loaded.json;

      const version = this.checkModelVersion(modelSetting);
      if (version === 0) {
        showMessage('Failed to load model configuration.', 4000, 10);
        return;
      }

      if (version === 2) {
        // V2 texture handling (simplified for now, assumes default or first texture)
        // If we want full texture support, we need to scan textures too or rely on model.json
        // The original code used textures.cache for random textures.
        // For now, we trust model.json
      }
    } else if (this.useCDN && this.modelList) {
      let modelName = this.modelList.models[this.modelId];
      if (Array.isArray(modelName)) {
        modelName = modelName[this.modelTexturesId];
      }

      const tryLoadListAt = async (id: number) => {
        let name: any = this.modelList?.models[id];
        if (Array.isArray(name)) name = name[this.modelTexturesId] ?? name[0];
        const candidate =
          typeof name === 'string' && name.trim().toLowerCase().endsWith('.json')
            ? name
            : `${name}/model.json`;
        const loaded = await this.fetchModelJsonWithFallback(candidate, { silent: true });
        if (!loaded?.json) return null;
        this.modelId = id;
        this.modelTexturesId = 0;
        this.currentModelVersion = this.checkModelVersion(loaded.json);
        return { loaded, name };
      };

      const count = this.modelList.models.length;
      const probeIds: number[] = [];
      probeIds.push(this.modelId);
      probeIds.push(0);
      const maxProbe = Math.min(count, 10);
      for (let i = 0; i < maxProbe; i++) probeIds.push(i);

      let tried: { loaded: { url: string; json: any }; name: any } | null = null;
      const seen = new Set<number>();
      for (const id of probeIds) {
        if (id < 0 || id >= count) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        tried = await tryLoadListAt(id);
        if (tried) break;
      }

      if (!tried) {
        showMessage('Failed to load model configuration.', 4000, 10);
        return;
      }

      const { loaded } = tried;
      modelName = tried.name;
      modelSettingPath = loaded.url;
      modelSetting = loaded.json;
      const version = this.checkModelVersion(modelSetting);
      if (version === 0) {
        showMessage('Failed to load model configuration.', 4000, 10);
        return;
      }
      if (version === 2) {
        if (typeof modelName === 'string' && !modelName.trim().toLowerCase().endsWith('.json')) {
          const textureCache = await this.loadTextureCache(modelName as string);
          if (textureCache.length > 0) {
            let textures = textureCache[this.modelTexturesId];
            if (typeof textures === 'string') textures = [textures];
            (modelSetting as any).textures = textures;
          }
        }
      }
    } else {
      modelSettingPath = this.models[this.modelId].paths[this.modelTexturesId];
      modelSetting = await this.fetchWithCache(modelSettingPath);
      if (!modelSetting) {
        logger.error(`Model setting is invalid for local path ${modelSettingPath}`);
        showMessage('Failed to load model configuration.', 4000, 10);
        return;
      }
    }
    if (!modelSettingPath) {
      showMessage('Failed to load model configuration.', 4000, 10);
      return;
    }
    await this.loadLive2D(modelSettingPath, modelSetting);
    showMessage(message, 4000, 10);
  }

  async loadSpecificModel(modelRelativePath: string, options?: { message?: string }) {
    const loaded = await this.fetchModelJsonWithFallback(modelRelativePath, { silent: true });
    if (!loaded) {
      showMessage('Failed to load specified model configuration.', 4000, 10);
      return;
    }
    const modelSettingPath = loaded.url;
    const modelSetting = loaded.json;
    await this.loadLive2D(modelSettingPath, modelSetting);
    if (options?.message) {
      showMessage(options.message, 4000, 10);
    }
  }

  async loadRandTexture(
    successMessage: string | string[] = '',
    failMessage: string | string[] = ''
  ) {
    // Texture switching logic might need adaptation for new index if we want to support it.
    // For now, keep legacy logic active if modelList is present, or disable for new index.
    if (this.modelIndex.length > 0) {
      // Not implemented for new index yet
      return;
    }

    const { modelId } = this;
    let noTextureAvailable = false;
    if (this.useCDN && this.modelList) {
      const modelName = this.modelList.models[modelId];
      if (Array.isArray(modelName)) {
        this.modelTexturesId = randomOtherOption(modelName.length, this.modelTexturesId);
      } else {
        const loaded = await this.fetchModelJsonWithFallback(`${modelName}/model.json`, {
          silent: true
        });
        const modelSetting = loaded?.json;
        const version = this.checkModelVersion(modelSetting);
        if (version === 0) {
          noTextureAvailable = true;
        } else if (version === 2) {
          const textureCache = await this.loadTextureCache(modelName as string);
          if (textureCache.length <= 1) {
            noTextureAvailable = true;
          } else {
            this.modelTexturesId = randomOtherOption(textureCache.length, this.modelTexturesId);
          }
        } else {
          noTextureAvailable = true;
        }
      }
    } else {
      if (this.models[modelId].paths.length === 1) {
        noTextureAvailable = true;
      } else {
        this.modelTexturesId = randomOtherOption(
          this.models[modelId].paths.length,
          this.modelTexturesId
        );
      }
    }
    if (noTextureAvailable) {
      showMessage(failMessage, 4000, 10);
    } else {
      await this.loadModel(successMessage);
    }
  }

  async loadNextModel() {
    this.modelTexturesId = 0;
    if (this.useCDN && this.modelIndex.length > 0) {
      const expectedVersion = this.getExpectedSwitchVersion();
      for (let i = 1; i < this.modelIndex.length; i++) {
        const nextIndex = (this.modelId + i) % this.modelIndex.length;
        const loaded = await this.loadIndexModelAt(nextIndex, expectedVersion);
        if (!loaded) continue;
        this.modelId = nextIndex;
        await this.loadLive2D(loaded.url, loaded.json);
        showMessage(`Switched to ${loaded.name}`, 4000, 10);
        return;
      }

      showMessage('No loadable models found.', 3000, 10);
    } else if (this.useCDN && this.modelList) {
      const expectedVersion = this.getExpectedSwitchVersion();
      for (let i = 1; i < this.modelList.models.length; i++) {
        const nextIndex = (this.modelId + i) % this.modelList.models.length;
        const loaded = await this.loadListModelAt(nextIndex, expectedVersion);
        if (!loaded) continue;
        this.modelId = nextIndex;
        await this.loadLive2D(loaded.url, loaded.json);
        showMessage(`Switched to ${loaded.name}`, 4000, 10);
        return;
      }

      showMessage('No loadable models found.', 3000, 10);
    } else {
      this.modelId = (this.modelId + 1) % this.models.length;
      await this.loadModel(this.models[this.modelId].message);
    }
  }

  async loadPrevModel() {
    this.modelTexturesId = 0;
    if (this.useCDN && this.modelIndex.length > 0) {
      const expectedVersion = this.getExpectedSwitchVersion();
      for (let i = 1; i < this.modelIndex.length; i++) {
        const prevIndex = (this.modelId - i + this.modelIndex.length) % this.modelIndex.length;
        const loaded = await this.loadIndexModelAt(prevIndex, expectedVersion);
        if (!loaded) continue;
        this.modelId = prevIndex;
        await this.loadLive2D(loaded.url, loaded.json);
        showMessage(`Switched to ${loaded.name}`, 4000, 10);
        return;
      }
      showMessage('No loadable models found.', 3000, 10);
    } else if (this.useCDN && this.modelList) {
      const expectedVersion = this.getExpectedSwitchVersion();
      for (let i = 1; i < this.modelList.models.length; i++) {
        const prevIndex =
          (this.modelId - i + this.modelList.models.length) % this.modelList.models.length;
        const loaded = await this.loadListModelAt(prevIndex, expectedVersion);
        if (!loaded) continue;
        this.modelId = prevIndex;
        await this.loadLive2D(loaded.url, loaded.json);
        showMessage(`Switched to ${loaded.name}`, 4000, 10);
        return;
      }
      showMessage('No loadable models found.', 3000, 10);
    } else {
      this.modelId = (this.modelId - 1 + this.models.length) % this.models.length;
      await this.loadModel(this.models[this.modelId].message);
    }
  }

  async toggleModelVersion() {
    const targetVersion: 2 | 3 = this.currentModelVersion === 3 ? 2 : 3;
    this.modelTexturesId = 0;

    if (this.useCDN && this.modelIndex.length > 0) {
      for (let i = 1; i <= this.modelIndex.length; i++) {
        const nextIndex = (this.modelId + i) % this.modelIndex.length;
        const loaded = await this.loadIndexModelAt(nextIndex, targetVersion);
        if (!loaded) continue;
        this.modelId = nextIndex;
        await this.loadLive2D(loaded.url, loaded.json);
        showMessage(`Switched to Cubism${targetVersion}: ${loaded.name}`, 4000, 10);
        return;
      }
      showMessage(`No Cubism${targetVersion} models found.`, 3000, 10);
      return;
    }

    if (this.useCDN && this.modelList) {
      for (let i = 1; i <= this.modelList.models.length; i++) {
        const nextIndex = (this.modelId + i) % this.modelList.models.length;
        const loaded = await this.loadListModelAt(nextIndex, targetVersion);
        if (!loaded) continue;
        this.modelId = nextIndex;
        await this.loadLive2D(loaded.url, loaded.json);
        showMessage(`Switched to Cubism${targetVersion}: ${loaded.name}`, 4000, 10);
        return;
      }
      showMessage(`No Cubism${targetVersion} models found.`, 3000, 10);
    }
  }

  public destroy() {
    try {
      if (this.cubism2model && typeof (this.cubism2model as any).destroy === 'function') {
        (this.cubism2model as any).destroy();
      }
    } catch {}
    this.cubism2model = undefined;

    try {
      disposeCubism3();
    } catch {}

    this.loading = false;
    this.emitLoading(false);
    this.loadingListeners.clear();
  }
}
