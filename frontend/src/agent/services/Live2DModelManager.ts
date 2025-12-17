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
  getCubism3MotionGroups
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
  private _modelId: number;
  private _modelTexturesId: number;
  private modelList: ModelListCDN | null = null;
  private modelIndex: ModelIndexItem[] = []; // New index support
  private cubism2model: Cubism2Model | undefined;
  private currentModelVersion: number;
  private loading: boolean;
  private modelJSONCache: Record<string, any>;
  private models: ModelList[];

  private lastMotionAt: Record<string, number>;

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
    let modelId: number = parseInt(localStorage.getItem('modelId') as string, 10);
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
    this._modelId = modelId;
    this._modelTexturesId = modelTexturesId;
    this.currentModelVersion = 0;
    this.loading = false;
    this.modelJSONCache = {};
    this.models = models;
    this.lastMotionAt = {};
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

  public static async initCheck(config: Config, models: ModelList[] = []) {
    const model = new ModelManager(config, models);
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
        const response = await fetch(`${model.cdnPath}model_list.json`);
        model.modelList = await response.json();
      }

      if (model.modelIndex.length > 0) {
        if (model.modelId >= model.modelIndex.length) {
          model.modelId = 0;
        }
        // Load using Index
        const item = model.modelIndex[model.modelId];
        const modelSettingPath = `${model.assetsPath}model/${item.path}/${item.configFile}`;
        const modelSetting = await model.fetchWithCache(modelSettingPath);
        if (modelSetting) {
          model.currentModelVersion = model.checkModelVersion(modelSetting);
          if (model.currentModelVersion === 2) {
            // For V2, we might check textures if needed, but simplified for now
            model.modelTexturesId = 0;
          }
        }
      } else if (model.modelList) {
        if (model.modelId >= model.modelList.models.length) {
          model.modelId = 0;
        }
        const modelName = model.modelList?.models[model.modelId];
        if (Array.isArray(modelName)) {
          if (model.modelTexturesId >= modelName.length) {
            model.modelTexturesId = 0;
          }
        } else {
          const modelSettingPath = `${model.assetsPath}model/${modelName}/model.json`;
          const modelSetting = await model.fetchWithCache(modelSettingPath);
          const version = model.checkModelVersion(modelSetting);
          if (version === 2) {
            const textureCache = await model.loadTextureCache(modelName as string);
            if (model.modelTexturesId >= textureCache.length) {
              model.modelTexturesId = 0;
            }
          } else if (model.modelList) {
            model.modelId = (config.modelId ?? 0) % model.modelList.models.length;
            model.modelTexturesId = 0;
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

  resetCanvas() {
    const canvas = document.getElementById('waifu-canvas');
    if (canvas) {
      canvas.innerHTML = '<canvas id="live2d" width="800" height="800"></canvas>';
    }
  }

  async fetchWithCache(url: string) {
    let result;
    if (url in this.modelJSONCache) {
      result = this.modelJSONCache[url];
    } else {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          logger.error(`Failed to fetch model json: ${url}, status ${response.status}`);
          result = null;
        } else {
          result = await response.json();
        }
      } catch (e) {
        logger.error('Failed to fetch model json: ' + url, e);
        result = null;
      }
      this.modelJSONCache[url] = result;
    }
    return result;
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
    this.loading = true;
    try {
      const version = this.checkModelVersion(modelSetting);
      if (version === 2) {
        this.setRendererVersion(2);
        if (!this.cubism2model) {
          // Check if Live2D global is already available
          if (!(window as any).Live2D) {
            if (!this.cubism2Path) {
              logger.error('No cubism2Path set, cannot load Cubism 2 Core.');
              return;
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
      } else {
        this.setRendererVersion(3);
        try {
          await loadCubism3Model(modelSettingPath);
        } catch (e) {
          logger.error('Failed to load Cubism3 model via Pixi renderer', e);
          showMessage('加载 Cubism3/4 模型时出错，请稍后重试', 5000, 9);
        }
      }
      logger.info(`Model ${modelSettingPath} (Cubism version ${version}) loaded`);
      this.currentModelVersion = version;
    } catch (err) {
      console.error('loadLive2D failed', err);
    }
    this.loading = false;
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
      }
    } catch (e) {
      logger.error('Failed to toggle renderer version', e);
    }
  }

  async loadTextureCache(modelName: string): Promise<any[]> {
    const textureCache = await this.fetchWithCache(
      `${this.assetsPath}model/${modelName}/textures.cache`
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
      if (mapping && mapping.v3 && mapping.v3.group) {
        playCubism3Motion(mapping.v3.group, mapping.v3.index);
      } else if (v3Direct) {
        playCubism3Motion(v3Direct.group, v3Direct.index);
      } else {
        playCubism3Motion(name);
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
      if (mapping && mapping.v3) {
        setCubism3Expression(mapping.v3.name);
      } else {
        setCubism3Expression(name);
      }
      return;
    }

    if (this.cubism2model) {
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
    let modelSettingPath, modelSetting;
    if (this.useCDN && this.modelIndex.length > 0) {
      const item = this.modelIndex[this.modelId];
      // Construct path from index
      modelSettingPath = `${this.assetsPath}model/${item.path}/${item.configFile}`;
      modelSetting = await this.fetchWithCache(modelSettingPath);

      const version = this.checkModelVersion(modelSetting);
      if (version === 0) {
        logger.error(`Model setting is invalid for path ${modelSettingPath}`);
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
      modelSettingPath = `${this.assetsPath}model/${modelName}/model.json`;
      modelSetting = await this.fetchWithCache(modelSettingPath);
      const version = this.checkModelVersion(modelSetting);
      if (version === 0) {
        logger.error(`Model setting is invalid for path ${modelSettingPath}`);
        showMessage('Failed to load model configuration.', 4000, 10);
        return;
      }
      if (version === 2) {
        const textureCache = await this.loadTextureCache(modelName as string);
        if (textureCache.length > 0) {
          let textures = textureCache[this.modelTexturesId];
          if (typeof textures === 'string') textures = [textures];
          (modelSetting as any).textures = textures;
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
    await this.loadLive2D(modelSettingPath, modelSetting);
    showMessage(message, 4000, 10);
  }

  async loadSpecificModel(modelRelativePath: string, options?: { message?: string }) {
    const modelSettingPath = `${this.assetsPath}model/${modelRelativePath}`;
    const modelSetting = await this.fetchWithCache(modelSettingPath);
    if (!modelSetting) {
      logger.error(`Model setting is invalid for specific path ${modelSettingPath}`);
      showMessage('Failed to load specified model configuration.', 4000, 10);
      return;
    }
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
        const modelSettingPath = `${this.assetsPath}model/${modelName}/model.json`;
        const modelSetting = await this.fetchWithCache(modelSettingPath);
        const version = this.checkModelVersion(modelSetting);
        if (version === 0) {
          logger.error(`Model setting is invalid for path ${modelSettingPath}`);
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
      // Implement version locking
      const currentVersion = this.currentModelVersion;
      let foundIndex = -1;

      // Search for next model with same version
      for (let i = 1; i < this.modelIndex.length; i++) {
        const nextIndex = (this.modelId + i) % this.modelIndex.length;
        if (this.modelIndex[nextIndex].version === currentVersion) {
          foundIndex = nextIndex;
          break;
        }
      }

      if (foundIndex !== -1) {
        this.modelId = foundIndex;
        await this.loadModel(`Switched to ${this.modelIndex[this.modelId].name}`);
      } else {
        showMessage(`No other V${currentVersion} models found.`, 3000, 10);
      }
    } else if (this.useCDN && this.modelList) {
      this.modelId = (this.modelId + 1) % this.modelList.models.length;
      await this.loadModel(this.modelList.messages[this.modelId]);
    } else {
      this.modelId = (this.modelId + 1) % this.models.length;
      await this.loadModel(this.models[this.modelId].message);
    }
  }
}
