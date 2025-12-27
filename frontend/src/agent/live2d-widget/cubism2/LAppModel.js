/* global UtSystem, document */
import { L2DBaseModel, Live2DFramework, L2DEyeBlink } from './Live2DFramework';
import ModelSettingJson from './utils/ModelSettingJson';
import LAppDefine from './LAppDefine';
import MatrixStack from './utils/MatrixStack';
import logger from '../../utils/logger';

const UNIFORM_MODEL_HEIGHT = 1.6;
const UNIFORM_MODEL_BOTTOM = -0.9;

const soundCheckCache = new Map();

const checkSoundAvailable = async (url) => {
  if (!url) return false;
  const cached = soundCheckCache.get(url);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (
    cached &&
    typeof cached.ok === 'boolean' &&
    now - (cached.checkedAt || 0) < 6 * 60 * 60 * 1000
  ) {
    return cached.ok;
  }

  if (cached?.checking) return cached.checking;

  const checking = (async () => {
    let ok = false;
    try {
      const head = await fetch(url, { method: 'HEAD' });
      ok = head.ok;
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const range = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
        ok = range.ok;
      } catch {
        ok = false;
      }
    }

    soundCheckCache.set(url, { ok, checkedAt: now });
    return ok;
  })();

  soundCheckCache.set(url, { ...cached, checking, checkedAt: now });
  return checking.finally(() => {
    const after = soundCheckCache.get(url);
    if (after?.checking) {
      soundCheckCache.set(url, { ok: !!after.ok, checkedAt: after.checkedAt || now });
    }
  });
};

//============================================================
//============================================================
//  class LAppModel     extends L2DBaseModel
//============================================================
//============================================================
class LAppModel extends L2DBaseModel {
  constructor() {
    //L2DBaseModel.apply(this, arguments);
    super();

    this.modelHomeDir = '';
    this.modelSetting = null;
    this.tmpMatrix = [];
    this.emotionFlags = {
      isCrying: false,
      isShy: false,
      isHappy: false,
      isAngry: false
    };
  }

  loadJSON(callback) {
    logger.info(
      `[Live2D Widget] LAppModel.loadJSON starting for ${this.modelSetting.getModelFile()}`
    );
    const path = this.modelHomeDir + this.modelSetting.getModelFile();

    this.loadModelData(path, (model) => {
      if (!model) {
        this.setUpdating(false);
        this.setInitialized(false);
        logger.error(`[Live2D Widget] LAppModel.loadJSON failed to load model: ${path}`);
        if (typeof callback == 'function') callback();
        return;
      }
      const textureNum = this.modelSetting.getTextureNum();
      if (!textureNum || textureNum <= 0) {
        this.preloadMotionGroup(LAppDefine.MOTION_GROUP_IDLE);
        this.mainMotionManager.stopAllMotions();
        this.setUpdating(false);
        this.setInitialized(true);
        if (typeof callback == 'function') callback();
        return;
      }

      for (let i = 0; i < textureNum; i++) {
        const texPaths = this.modelHomeDir + this.modelSetting.getTextureFile(i);

        this.loadTexture(i, texPaths, () => {
          if (this.isTexLoaded) {
            if (this.modelSetting.getExpressionNum() > 0) {
              this.expressions = {};

              for (let j = 0; j < this.modelSetting.getExpressionNum(); j++) {
                const expName = this.modelSetting.getExpressionName(j);
                const expFilePath = this.modelHomeDir + this.modelSetting.getExpressionFile(j);

                this.loadExpression(expName, expFilePath);
              }
            } else {
              this.expressionManager = null;
              this.expressions = {};
            }

            if (this.eyeBlink == null) {
              this.eyeBlink = new L2DEyeBlink();
            }

            if (this.modelSetting.getPhysicsFile() != null) {
              this.loadPhysics(this.modelHomeDir + this.modelSetting.getPhysicsFile());
            } else {
              this.physics = null;
            }

            if (this.modelSetting.getPoseFile() != null) {
              this.loadPose(this.modelHomeDir + this.modelSetting.getPoseFile(), () => {
                this.pose.updateParam(this.live2DModel);
              });
            } else {
              this.pose = null;
            }

            this.modelMatrix.setHeight(UNIFORM_MODEL_HEIGHT);
            this.modelMatrix.centerX(0);
            this.modelMatrix.bottom(UNIFORM_MODEL_BOTTOM);

            for (let j = 0; j < this.modelSetting.getInitParamNum(); j++) {
              this.live2DModel.setParamFloat(
                this.modelSetting.getInitParamID(j),
                this.modelSetting.getInitParamValue(j)
              );
            }

            for (let j = 0; j < this.modelSetting.getInitPartsVisibleNum(); j++) {
              this.live2DModel.setPartsOpacity(
                this.modelSetting.getInitPartsVisibleID(j),
                this.modelSetting.getInitPartsVisibleValue(j)
              );
            }

            this.live2DModel.saveParam();
            // this.live2DModel.setGL(gl);

            this.preloadMotionGroup(LAppDefine.MOTION_GROUP_IDLE);
            this.mainMotionManager.stopAllMotions();

            this.setUpdating(false);
            this.setInitialized(true);
            logger.info('LAppModel.loadJSON finished successfully');

            if (typeof callback == 'function') callback();
          }
        });
      }
    });
  }

  async loadModelSetting(modelSettingPath, modelSetting) {
    this.setUpdating(true);
    this.setInitialized(false);

    this.modelHomeDir = modelSettingPath.substring(0, modelSettingPath.lastIndexOf('/') + 1);

    this.modelSetting = new ModelSettingJson();
    this.modelSetting.json = modelSetting;
    await new Promise((resolve) => this.loadJSON(resolve));
  }

  load(gl, modelSettingPath, callback) {
    logger.info('LAppModel.load start: ' + modelSettingPath);
    this.setUpdating(true);
    this.setInitialized(false);

    this.modelHomeDir = modelSettingPath.substring(0, modelSettingPath.lastIndexOf('/') + 1);

    this.modelSetting = new ModelSettingJson();

    this.modelSetting.loadModelSetting(modelSettingPath, () => {
      this.loadJSON(callback);
    });
  }

  release(gl) {
    // this.live2DModel.deleteTextures();
    const pm = Live2DFramework.getPlatformManager();

    gl.deleteTexture(pm.texture);
  }

  preloadMotionGroup(name) {
    for (let i = 0; i < this.modelSetting.getMotionNum(name); i++) {
      const file = this.modelSetting.getMotionFile(name, i);
      this.loadMotion(file, this.modelHomeDir + file, (motion) => {
        motion.setFadeIn(this.modelSetting.getMotionFadeIn(name, i));
        motion.setFadeOut(this.modelSetting.getMotionFadeOut(name, i));
      });
    }
  }

  update() {
    // logger.trace("--> LAppModel.update()");

    if (this.live2DModel == null) {
      logger.error('Failed to update.');

      return;
    }

    const timeMSec = UtSystem.getUserTimeMSec() - this.startTimeMSec;
    const timeSec = timeMSec / 1000.0;
    const t = timeSec * 2 * Math.PI;

    if (this.mainMotionManager.isFinished()) {
      this.startRandomMotion(LAppDefine.MOTION_GROUP_IDLE, LAppDefine.PRIORITY_IDLE);
    }

    //-----------------------------------------------------------------

    this.live2DModel.loadParam();

    const update = this.mainMotionManager.updateParam(this.live2DModel);
    if (!update) {
      if (this.eyeBlink != null) {
        this.eyeBlink.updateParam(this.live2DModel);
      }
    }

    this.live2DModel.saveParam();

    //-----------------------------------------------------------------

    if (
      this.expressionManager != null &&
      this.expressions != null &&
      !this.expressionManager.isFinished()
    ) {
      this.expressionManager.updateParam(this.live2DModel);
    }

    const flags = this.emotionFlags || {};

    let bodyAngleFactor = 10;
    let angleXDelta = 0;
    let angleYDelta = 0;
    let angleZDelta = 0;
    let eyeBallX = this.dragX;
    let eyeBallY = this.dragY;

    if (flags.isCrying) {
      bodyAngleFactor = 15;
      eyeBallY -= 2;
      angleXDelta -= 5;
    }

    if (flags.isShy) {
      angleYDelta += 5;
      eyeBallX -= 1;
    }

    if (flags.isHappy) {
      bodyAngleFactor = Math.max(bodyAngleFactor, 12);
      angleZDelta += 3;
    }

    if (flags.isAngry) {
      angleZDelta -= 5;
    }

    this.live2DModel.addToParamFloat('PARAM_ANGLE_X', this.dragX * 30 + angleXDelta, 1);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Y', this.dragY * 30 + angleYDelta, 1);
    this.live2DModel.addToParamFloat(
      'PARAM_ANGLE_Z',
      this.dragX * this.dragY * -30 + angleZDelta,
      1
    );

    this.live2DModel.addToParamFloat('PARAM_BODY_ANGLE_X', this.dragX * bodyAngleFactor, 1);

    this.live2DModel.addToParamFloat('PARAM_EYE_BALL_X', eyeBallX, 1);
    this.live2DModel.addToParamFloat('PARAM_EYE_BALL_Y', eyeBallY, 1);

    this.live2DModel.addToParamFloat('PARAM_ANGLE_X', Number(15 * Math.sin(t / 6.5345)), 0.5);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Y', Number(8 * Math.sin(t / 3.5345)), 0.5);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Z', Number(10 * Math.sin(t / 5.5345)), 0.5);
    this.live2DModel.addToParamFloat('PARAM_BODY_ANGLE_X', Number(4 * Math.sin(t / 15.5345)), 0.5);
    this.live2DModel.setParamFloat('PARAM_BREATH', Number(0.5 + 0.5 * Math.sin(t / 3.2345)), 1);

    if (this.physics != null) {
      this.physics.updateParam(this.live2DModel);
    }

    if (this.lipSync == null) {
      this.live2DModel.setParamFloat('PARAM_MOUTH_OPEN_Y', this.lipSyncValue);
    }

    if (this.pose != null) {
      this.pose.updateParam(this.live2DModel);
    }

    this.live2DModel.update();
  }

  setRandomExpression() {
    const tmp = [];
    for (const name in this.expressions) {
      tmp.push(name);
    }

    const no = parseInt(Math.random() * tmp.length);

    this.setExpression(tmp[no]);
  }

  startRandomMotion(name, priority) {
    const max = this.modelSetting.getMotionNum(name);
    const no = parseInt(Math.random() * max);
    this.startMotion(name, no, priority);
  }

  startMotion(name, no, priority) {
    // logger.trace("startMotion : " + name + " " + no + " " + priority);

    const motionName = this.modelSetting.getMotionFile(name, no);

    if (motionName == null || motionName == '') {
      return;
    }

    if (priority == LAppDefine.PRIORITY_FORCE) {
      this.mainMotionManager.setReservePriority(priority);
    } else if (!this.mainMotionManager.reserveMotion(priority)) {
      logger.trace('Motion is running.');
      return;
    }

    let motion;

    if (this.motions[name] == null) {
      this.loadMotion(null, this.modelHomeDir + motionName, (mtn) => {
        motion = mtn;

        this.setFadeInFadeOut(name, no, priority, motion);
      });
    } else {
      motion = this.motions[name];

      this.setFadeInFadeOut(name, no, priority, motion);
    }
  }

  setFadeInFadeOut(name, no, priority, motion) {
    const motionName = this.modelSetting.getMotionFile(name, no);

    motion.setFadeIn(this.modelSetting.getMotionFadeIn(name, no));
    motion.setFadeOut(this.modelSetting.getMotionFadeOut(name, no));

    logger.trace('Start motion : ' + motionName);

    if (this.modelSetting.getMotionSound(name, no) == null) {
      this.mainMotionManager.startMotionPrio(motion, priority);
    } else {
      const soundName = this.modelSetting.getMotionSound(name, no);
      const soundUrl = this.modelHomeDir + soundName;
      const cached = soundCheckCache.get(soundUrl);

      if (!cached || cached.ok !== false) {
        void checkSoundAvailable(soundUrl).then((ok) => {
          if (!ok) return;
          const snd = document.createElement('audio');
          snd.preload = 'none';
          snd.src = soundUrl;
          const playPromise = snd.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => undefined);
          }
        });
      }
      this.mainMotionManager.startMotionPrio(motion, priority);
    }
  }

  setExpression(name) {
    const motion = this.expressions[name];

    logger.trace('Expression : ' + name);

    this.expressionManager?.startMotion(motion, false);
  }

  setEmotionFlags(flags) {
    this.emotionFlags = {
      ...this.emotionFlags,
      ...flags
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(gl) {
    //logger.trace("--> LAppModel.draw()");

    // if(this.live2DModel == null) return;

    MatrixStack.push();

    MatrixStack.multMatrix(this.modelMatrix.getArray());

    this.tmpMatrix = MatrixStack.getMatrix();
    this.live2DModel.setMatrix(this.tmpMatrix);
    this.live2DModel.draw();

    MatrixStack.pop();
  }

  hitTest(id, testX, testY) {
    const len = this.modelSetting.getHitAreaNum();
    if (len == 0) {
      const hitAreasCustom = this.modelSetting.getHitAreaCustom();
      if (hitAreasCustom) {
        const x = hitAreasCustom[id + '_x'];
        const y = hitAreasCustom[id + '_y'];

        if (
          testX > Math.min(...x) &&
          testX < Math.max(...x) &&
          testY > Math.min(...y) &&
          testY < Math.max(...y)
        ) {
          return true;
        }
      }
    }
    for (let i = 0; i < len; i++) {
      if (id == this.modelSetting.getHitAreaName(i)) {
        const drawID = this.modelSetting.getHitAreaID(i);

        return this.hitTestSimple(drawID, testX, testY);
      }
    }

    return false;
  }
}

export default LAppModel;
