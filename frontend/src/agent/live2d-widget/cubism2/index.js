/* global document, window, Event, Live2D */
import { L2DMatrix44, L2DTargetPoint, L2DViewMatrix } from './Live2DFramework';
import LAppDefine from './LAppDefine';
import MatrixStack from './utils/MatrixStack';
import LAppLive2DManager from './LAppLive2DManager';
import logger from '../../utils/logger';

function normalizePoint(x, y, x0, y0, w, h) {
  const dx = x - x0;
  const dy = y - y0;

  let targetX = 0,
    targetY = 0;

  if (dx >= 0) {
    targetX = dx / (w - x0);
  } else {
    targetX = dx / x0;
  }
  if (dy >= 0) {
    targetY = dy / (h - y0);
  } else {
    targetY = dy / y0;
  }
  return {
    vx: targetX,
    vy: -targetY
  };
}

class Cubism2Model {
  constructor() {
    this.live2DMgr = new LAppLive2DManager();

    this.isDrawStart = false;
    this._lastModelPresent = false;
    this._loggedUpdateBlocked = false;

    this.gl = null;
    this.canvas = null;

    this.dragMgr = null; /*new L2DTargetPoint();*/
    this.viewMatrix = null; /*new L2DViewMatrix();*/
    this.projMatrix = null; /*new L2DMatrix44()*/
    this.deviceToScreen = null; /*new L2DMatrix44();*/

    this.oldLen = 0;

    this._boundMouseEvent = this.mouseEvent.bind(this);
    this._boundTouchEvent = this.touchEvent.bind(this);
  }

  initL2dCanvas(canvasId) {
    this.canvas = document.getElementById(canvasId);

    if (this.canvas.addEventListener) {
      this.canvas.addEventListener('mousewheel', this._boundMouseEvent, false);
      this.canvas.addEventListener('click', this._boundMouseEvent, false);

      document.addEventListener('mousemove', this._boundMouseEvent, false);

      document.addEventListener('mouseout', this._boundMouseEvent, false);
      this.canvas.addEventListener('contextmenu', this._boundMouseEvent, false);

      this.canvas.addEventListener('touchstart', this._boundTouchEvent, false);
      this.canvas.addEventListener('touchend', this._boundTouchEvent, false);
      this.canvas.addEventListener('touchmove', this._boundTouchEvent, false);
    }
  }

  async init(canvasId, modelSettingPath, modelSetting) {
    this.initL2dCanvas(canvasId);
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.dragMgr = new L2DTargetPoint();

    const ratio = height / width;
    const left = LAppDefine.VIEW_LOGICAL_LEFT;
    const right = LAppDefine.VIEW_LOGICAL_RIGHT;
    const bottom = -ratio;
    const top = ratio;

    this.viewMatrix = new L2DViewMatrix();

    this.viewMatrix.setScreenRect(left, right, bottom, top);

    this.viewMatrix.setMaxScreenRect(
      LAppDefine.VIEW_LOGICAL_MAX_LEFT,
      LAppDefine.VIEW_LOGICAL_MAX_RIGHT,
      LAppDefine.VIEW_LOGICAL_MAX_BOTTOM,
      LAppDefine.VIEW_LOGICAL_MAX_TOP
    );

    this.viewMatrix.setMaxScale(LAppDefine.VIEW_MAX_SCALE);
    this.viewMatrix.setMinScale(LAppDefine.VIEW_MIN_SCALE);

    this.projMatrix = new L2DMatrix44();
    this.projMatrix.multScale(1, width / height);

    this.deviceToScreen = new L2DMatrix44();
    this.deviceToScreen.multTranslate(-width / 2.0, -height / 2.0);
    this.deviceToScreen.multScale(2 / width, -2 / width);

    this.gl =
      this.canvas.getContext('webgl2', {
        premultipliedAlpha: true,
        preserveDrawingBuffer: true
      }) ||
      this.canvas.getContext('webgl', {
        premultipliedAlpha: true,
        preserveDrawingBuffer: true
      }) ||
      this.canvas.getContext('experimental-webgl', {
        premultipliedAlpha: true,
        preserveDrawingBuffer: true
      });

    if (!this.gl) {
      logger.error('Failed to create WebGL context.');
      return;
    }

    this.canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        logger.error('[Live2D Widget] WebGL context lost');
        this.isDrawStart = false;
        if (this._drawFrameId) {
          window.cancelAnimationFrame(this._drawFrameId);
          this._drawFrameId = null;
        }
      },
      false
    );

    this.canvas.addEventListener(
      'webglcontextrestored',
      async () => {
        logger.info('[Live2D Widget] WebGL context restored');
        this.initL2dCanvas(canvasId);

        // Re-acquire context
        this.gl =
          this.canvas.getContext('webgl2', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
          }) ||
          this.canvas.getContext('webgl', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
          }) ||
          this.canvas.getContext('experimental-webgl', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
          });

        if (!this.gl) {
          logger.error('[Live2D Widget] Failed to recreate WebGL context');
          return;
        }

        Live2D.setGL(this.gl);
        Live2D.setClippingMaskBufferSize(1024);

        // Clear invalid model state immediately
        if (this.live2DMgr) {
          this.live2DMgr.releaseModel(this.gl);
          this.live2DMgr.model = null; // Prevent drawing invalid model
          this.live2DMgr.reloading = false;

          if (this._currentModelSettingPath && this._currentModelSetting) {
            logger.info('[Live2D Widget] Reloading model after context restore...');
            try {
              await this.changeModelWithJSON(
                this._currentModelSettingPath,
                this._currentModelSetting
              );
              logger.info('[Live2D Widget] Model reloaded successfully');
            } catch (err) {
              logger.error('[Live2D Widget] Failed to reload model:', err);
            }
          }
        }
        this.startDraw();
      },
      false
    );

    Live2D.setGL(this.gl);
    Live2D.setClippingMaskBufferSize(1024);

    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);

    // Fix: Handle visibility change to prevent rendering artifacts
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;

      logger.info('[Live2D Widget] document visibilitychange: visible');

      if (!this.canvas || !this.gl) {
        logger.warn('[Live2D Widget] visibilitychange: canvas or gl missing, skip refresh');
        return;
      }

      if (this.gl.isContextLost && this.gl.isContextLost()) {
        logger.warn(
          '[Live2D Widget] visibilitychange: context is lost, waiting for webglcontextrestored'
        );
        return;
      }

      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

      Live2D.setGL(this.gl);
      Live2D.setClippingMaskBufferSize(1024, 1024);

      if (!this.isDrawStart) {
        logger.info('[Live2D Widget] visibilitychange: restarting draw loop');
        this.startDraw();
      }
    });

    await this.changeModelWithJSON(modelSettingPath, modelSetting);

    this.startDraw();
  }

  startMotion(group) {
    if (this.live2DMgr && this.live2DMgr.model) {
      this.live2DMgr.model.startRandomMotion(group, LAppDefine.PRIORITY_FORCE);
    }
  }

  setExpression(name) {
    if (this.live2DMgr && this.live2DMgr.model) {
      this.live2DMgr.model.setExpression(name);
    }
  }

  setEmotionFlags(flags) {
    if (this.live2DMgr && this.live2DMgr.model && this.live2DMgr.model.setEmotionFlags) {
      this.live2DMgr.model.setEmotionFlags(flags);
    }
  }

  destroy() {
    // 1. Unbind canvas events
    if (this.canvas) {
      if (this.canvas.removeEventListener) {
        this.canvas.removeEventListener('mousewheel', this._boundMouseEvent, false);
        this.canvas.removeEventListener('click', this._boundMouseEvent, false);
        this.canvas.removeEventListener('contextmenu', this._boundMouseEvent, false);
        this.canvas.removeEventListener('touchstart', this._boundTouchEvent, false);
        this.canvas.removeEventListener('touchend', this._boundTouchEvent, false);
        this.canvas.removeEventListener('touchmove', this._boundTouchEvent, false);
      }

      // Document listeners must be removed carefully
      document.removeEventListener('mousemove', this._boundMouseEvent, false);
      document.removeEventListener('mouseout', this._boundMouseEvent, false);
    }

    // 2. Stop animation
    if (this._drawFrameId) {
      window.cancelAnimationFrame(this._drawFrameId);
      this._drawFrameId = null;
    }
    this.isDrawStart = false;

    // 3. Release Live2D related resources
    if (this.live2DMgr && typeof this.live2DMgr.releaseModel === 'function' && this.gl) {
      this.live2DMgr.releaseModel(this.gl);
    }

    // 4. Force context loss is handled in widget.ts/Live2DWidget.vue cleanup logic
    // But we should nullify references here.

    this.canvas = null;
    this.gl = null;
    // Do NOT destroy live2DMgr entirely if it's reused, but here we construct new one every time?
    // In current implementation, Cubism2Model is created new each time.
    this.live2DMgr = null;

    this.dragMgr = null;
    this.viewMatrix = null;
    this.projMatrix = null;
    this.deviceToScreen = null;
  }

  startDraw() {
    if (!this.isDrawStart) {
      this.isDrawStart = true;
      const tick = () => {
        this.draw();
        this._drawFrameId = window.requestAnimationFrame(tick, this.canvas);
      };
      tick();
    }
  }

  draw() {
    MatrixStack.reset();
    MatrixStack.loadIdentity();

    this.dragMgr.update();
    this.live2DMgr.setDrag(this.dragMgr.getX(), this.dragMgr.getY());

    // Fix: Ensure blending and clear depth for masking
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    MatrixStack.multMatrix(this.projMatrix.getArray());
    MatrixStack.multMatrix(this.viewMatrix.getArray());
    MatrixStack.push();

    const model = this.live2DMgr.getModel();

    if (model == null) {
      if (this._lastModelPresent) {
        logger.warn('[Live2D Widget] draw: model is null, nothing will be rendered');
      }
      this._lastModelPresent = false;
      this._loggedUpdateBlocked = false;
      return;
    }

    this._lastModelPresent = true;

    if (!model.initialized || model.updating) {
      if (!this._loggedUpdateBlocked) {
        logger.warn(
          `[Live2D Widget] draw: model not drawable (initialized=${model.initialized}, updating=${model.updating})`
        );
        this._loggedUpdateBlocked = true;
      }
      MatrixStack.pop();
      return;
    }

    this._loggedUpdateBlocked = false;

    model.update();
    model.draw(this.gl);

    MatrixStack.pop();
  }

  async changeModel(modelSettingPath) {
    await this.live2DMgr.changeModel(this.gl, modelSettingPath);
  }

  async changeModelWithJSON(modelSettingPath, modelSetting) {
    this._currentModelSettingPath = modelSettingPath;
    this._currentModelSetting = modelSetting;
    await this.live2DMgr.changeModelWithJSON(this.gl, modelSettingPath, modelSetting);
  }

  modelScaling(scale) {
    const isMaxScale = this.viewMatrix.isMaxScale();
    const isMinScale = this.viewMatrix.isMinScale();

    this.viewMatrix.adjustScale(0, 0, scale);

    if (!isMaxScale) {
      if (this.viewMatrix.isMaxScale()) {
        this.live2DMgr.maxScaleEvent();
      }
    }

    if (!isMinScale) {
      if (this.viewMatrix.isMinScale()) {
        this.live2DMgr.minScaleEvent();
      }
    }
  }

  modelTurnHead(event) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();

    const { vx, vy } = normalizePoint(
      event.clientX,
      event.clientY,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      window.innerWidth,
      window.innerHeight
    );

    logger.trace(
      'onMouseDown device( x:' +
        event.clientX +
        ' y:' +
        event.clientY +
        ' ) view( x:' +
        vx +
        ' y:' +
        vy +
        ')'
    );

    this.dragMgr.setPoint(vx, vy);
    this.live2DMgr.tapEvent(vx, vy);

    if (
      this.live2DMgr?.model?.hitTest &&
      this.live2DMgr.model.hitTest(LAppDefine.HIT_AREA_BODY, vx, vy)
    ) {
      window.dispatchEvent(new Event('live2d:tapbody'));
    }
  }

  followPointer(event) {
    // Safety check for destroyed or uninitialized canvas/dragMgr
    if (!this.canvas || !this.dragMgr) return;

    const rect = this.canvas.getBoundingClientRect();

    const { vx, vy } = normalizePoint(
      event.clientX,
      event.clientY,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      window.innerWidth,
      window.innerHeight
    );

    logger.trace(
      'onMouseMove device( x:' +
        event.clientX +
        ' y:' +
        event.clientY +
        ' ) view( x:' +
        vx +
        ' y:' +
        vy +
        ')'
    );

    this.dragMgr.setPoint(vx, vy);

    if (
      this.live2DMgr?.model?.hitTest &&
      this.live2DMgr.model.hitTest(LAppDefine.HIT_AREA_BODY, vx, vy)
    ) {
      window.dispatchEvent(new Event('live2d:hoverbody'));
    }
  }

  lookFront() {
    this.dragMgr.setPoint(0, 0);
  }

  mouseEvent(e) {
    // Only prevent default for non-click events to allow bubbling/default actions for clicks
    if (e.type !== 'click') {
      e.preventDefault();
    }

    if (e.type == 'mousewheel') {
      if (e.wheelDelta > 0) this.modelScaling(1.1);
      else this.modelScaling(0.9);
    } else if (e.type == 'click' || e.type == 'contextmenu') {
      this.modelTurnHead(e);
    } else if (e.type == 'mousemove') {
      this.followPointer(e);
    }
  }

  touchEvent(e) {
    // Only prevent default for touchmove to prevent scrolling, allow click generation for touchstart/end
    if (e.type === 'touchmove') {
      e.preventDefault();
    }

    const touch = e.touches[0];

    if (e.type == 'touchstart') {
      if (e.touches.length == 1) this.modelTurnHead(touch);
      // onClick(touch);
    } else if (e.type == 'touchmove') {
      this.followPointer(touch);

      if (e.touches.length == 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const len =
          Math.pow(touch1.pageX - touch2.pageX, 2) + Math.pow(touch1.pageY - touch2.pageY, 2);
        if (this.oldLen - len < 0) this.modelScaling(1.025);
        else this.modelScaling(0.975);

        this.oldLen = len;
      }
    } else if (e.type == 'touchend') {
      this.lookFront();
    }
  }

  transformViewX(deviceX) {
    const screenX = this.deviceToScreen.transformX(deviceX);
    return this.viewMatrix.invertTransformX(screenX);
  }

  transformViewY(deviceY) {
    const screenY = this.deviceToScreen.transformY(deviceY);
    return this.viewMatrix.invertTransformY(screenY);
  }

  transformScreenX(deviceX) {
    return this.deviceToScreen.transformX(deviceX);
  }

  transformScreenY(deviceY) {
    return this.deviceToScreen.transformY(deviceY);
  }
}

export default Cubism2Model;
