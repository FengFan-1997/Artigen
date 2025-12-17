<template>
  <div
    class="live2d-widget-container"
    ref="container"
    :class="{ 'is-angry': angry, 'is-dizzy': dizzy, 'is-head-hit': headHit }"
    :style="{
      transform: `scale(${scaleValue})`,
      transformOrigin: 'bottom left',
      width: '100%',
      height: '100%'
    }"
  >
    <!-- Widget will be injected here -->
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted, ref, watch, computed } from 'vue';
import { initWidget, showMessage } from '../live2d-widget/widget';
import type { ModelManager } from '../services/Live2DModelManager';
import { disposeCubism3 } from '../live2d-widget/cubism3';

export default defineComponent({
  name: 'Live2DWidget',
  props: {
    message: { type: String, required: false },
    isTalking: { type: Boolean, required: false },
    isMoving: { type: Boolean, required: false },
    isHovered: { type: Boolean, required: false },
    isDizzy: { type: Boolean, required: false },
    isHappy: { type: Boolean, required: false },
    isConfused: { type: Boolean, required: false },
    isAngry: { type: Boolean, required: false },
    isFainted: { type: Boolean, required: false },
    isPouting: { type: Boolean, required: false },
    isHeadHit: { type: Boolean, required: false },
    isCrying: { type: Boolean, required: false },
    isTired: { type: Boolean, required: false },
    expressionOverride: { type: String, required: false },
    currentLang: { type: String, required: false },
    motionCommand: { type: String, required: false },
    scale: { type: Number, required: false }
  },
  emits: ['toggle-chat'],
  setup(props, { emit, expose }) {
    const container = ref<HTMLElement | null>(null);
    const modelMgr = ref<ModelManager | null>(null);

    let messageTalkTimeout: number | null = null;

    const angry = computed(() => !!props.isAngry);
    const dizzy = computed(() => !!props.isDizzy);
    const headHit = computed(() => !!props.isHeadHit);
    const scaleValue = computed(() => props.scale ?? 1);

    const toggleChat = () => {
      console.log('Live2DWidget: toggleChat called');
      emit('toggle-chat');
    };

    const hitTest = (x: number, y: number) => {
      if (modelMgr.value) {
        return modelMgr.value.hitTest(x, y);
      }
      return [];
    };

    const setPointOfInterest = (x: number, y: number) => {
      if (modelMgr.value) {
        modelMgr.value.setPointOfInterest(x, y);
      }
    };

    expose({ hitTest, setPointOfInterest });

    watch(
      () => props.motionCommand,
      (newCmd) => {
        if (newCmd && modelMgr.value) {
          modelMgr.value.startMotion(newCmd);
        }
      }
    );

    watch(
      () => props.isMoving,
      (val) => {
        if (val && modelMgr.value) {
          modelMgr.value.startMotion('activity');
        }
      }
    );

    watch(
      () => props.message,
      (newMsg) => {
        if (newMsg) {
          showMessage(newMsg, 4000, 10);
          if (modelMgr.value) {
            modelMgr.value.startMotion('talking');
            if (!props.isTalking) {
              modelMgr.value.setTalking(true);
              if (messageTalkTimeout) window.clearTimeout(messageTalkTimeout);
              const duration = Math.min(3200, Math.max(900, newMsg.length * 70));
              messageTalkTimeout = window.setTimeout(() => {
                modelMgr.value?.setTalking(false);
                messageTalkTimeout = null;
              }, duration);
            }
          }
        }
      }
    );

    watch(
      () => props.isAngry,
      (val) => {
        if (!modelMgr.value) return;
        modelMgr.value.setEmotionFlags({ isAngry: !!val });
        if (val) {
          modelMgr.value.startMotion('shake');
        }
      }
    );

    watch(
      () => props.isHappy,
      (val) => {
        if (!modelMgr.value) return;
        modelMgr.value.setEmotionFlags({ isHappy: !!val });
        if (val) {
          modelMgr.value.startMotion('happy');
        }
      }
    );

    watch(
      () => props.isPouting,
      (val) => {
        if (!modelMgr.value) return;
        modelMgr.value.setEmotionFlags({ isShy: !!val });
        if (val) {
          modelMgr.value.startMotion('friend');
        }
      }
    );

    watch(
      () => props.isDizzy,
      (val) => {
        if (!modelMgr.value) return;
        if (val) {
          modelMgr.value.startMotion('shake');
        }
      }
    );

    watch(
      () => props.isTalking,
      (val) => {
        if (!modelMgr.value) return;
        modelMgr.value.setTalking(!!val);
        if (val) modelMgr.value.startMotion('talking');
      }
    );

    watch(
      () => props.isCrying,
      (val) => {
        if (!modelMgr.value) return;
        modelMgr.value.setEmotionFlags({ isCrying: !!val });
      }
    );

    watch(
      () => props.isHeadHit,
      (val) => {
        if (!modelMgr.value) return;
        if (val) {
          modelMgr.value.startMotion('shake');
        }
      }
    );

    const currentExpression = computed(() => {
      if (props.expressionOverride) return props.expressionOverride;
      if (props.isFainted) return 'sad';
      if (props.isCrying) return 'sad';
      if (props.isDizzy) return 'dizzy';
      if (props.isAngry) return 'angry';
      if (props.isPouting) return 'shy';
      if (props.isConfused) return 'confused';
      if (props.isHappy) return 'happy';
      if (props.isTired) return 'sad';
      return 'neutral';
    });

    watch(
      currentExpression,
      (exp) => {
        if (!modelMgr.value || !exp) return;
        modelMgr.value.setExpression(exp);
      },
      { immediate: true }
    );

    const loadScript = (src: string) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve(true);
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };

    const cleanup = () => {
      try {
        disposeCubism3();
        const live2dGlobal = (window as any).Live2D;
        if (live2dGlobal && typeof live2dGlobal.dispose === 'function') {
          try {
            live2dGlobal.dispose();
            console.log('Live2D global disposed');
          } catch (e) {
            console.error('Error disposing Live2D', e);
          }
        }

        const canvas = document.getElementById('live2d') as HTMLCanvasElement;
        if (canvas) {
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          const isWebGL = (ctx: any): ctx is WebGLRenderingContext => {
            return ctx && typeof ctx.getParameter === 'function';
          };

          if (isWebGL(gl)) {
            const numTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
            for (let unit = 0; unit < numTextureUnits; ++unit) {
              gl.activeTexture(gl.TEXTURE0 + unit);
              gl.bindTexture(gl.TEXTURE_2D, null);
              gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            gl.bindRenderbuffer(gl.RENDERBUFFER, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
          }
          canvas.remove();
        }

        const waifu = document.getElementById('waifu');
        if (waifu) waifu.remove();

        const waifuTips = document.getElementById('waifu-tips');
        if (waifuTips) waifuTips.remove();

        const waifuTool = document.getElementById('waifu-tool');
        if (waifuTool) waifuTool.remove();

        modelMgr.value = null;

        if (messageTalkTimeout) {
          window.clearTimeout(messageTalkTimeout);
          messageTalkTimeout = null;
        }

        console.log('Live2DWidget cleanup complete');
      } catch (e) {
        console.error('Error during Live2D cleanup:', e);
      }
    };

    const initLive2D = async () => {
      try {
        cleanup();
        await loadScript('/live2d/core/live2d.min.js');

        const normalizeHfBase = (raw: string) => {
          const trimmed = (raw || '').trim();
          if (!trimmed) return '';
          const hasProtocol = /^https?:\/\//i.test(trimmed);
          if (!hasProtocol) return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;

          const normalized = trimmed.replace(/\/+$/, '');
          const isHf = /(^https?:\/\/(www\.)?huggingface\.co\/)|(^https?:\/\/hf\.co\/)/i.test(
            normalized
          );
          if (!isHf) return `${normalized}/`;

          const withResolve = normalized
            .replace(/\/blob\//i, '/resolve/')
            .replace(/\/raw\//i, '/resolve/');

          if (/\/resolve\/[^/]+\//i.test(withResolve)) {
            return withResolve.endsWith('/') ? withResolve : `${withResolve}/`;
          }
          return `${withResolve}/resolve/main/`;
        };

        const configBaseRaw = import.meta.env.VITE_LIVE2D_CONFIG_BASE || '/live2d/';
        const configBase = configBaseRaw.endsWith('/') ? configBaseRaw : `${configBaseRaw}/`;
        const assetsBaseRaw = import.meta.env.VITE_LIVE2D_ASSETS_BASE || configBase;
        const hfNormalized = normalizeHfBase(assetsBaseRaw);
        const assetsBase = hfNormalized.endsWith('/') ? hfNormalized : `${hfNormalized}/`;

        if (container.value) {
          modelMgr.value = await initWidget(
            {
              waifuPath: `${configBase}waifu-tips.json`,
              cdnPath: configBase,
              assetsPath: assetsBase,
              cubism2Path: '/live2d/core/live2d.min.js',
              tools: [
                'chat',
                'hitokoto',
                'switch-model',
                'switch-ziyuxin',
                'switch-texture',
                'photo'
              ],
              modelId: 3,
              drag: false,
              disableIdle: true,
              logLevel: 'info',
              onChat: toggleChat
            },
            container.value
          );

          if (modelMgr.value) {
            console.group('[Live2DWidget] Loaded Model Debug Info');
            console.log('Available Hit Areas:', modelMgr.value.getHitAreas());
            console.log('Available Motion Groups:', modelMgr.value.getMotionGroups());
            console.groupEnd();
          }
        }
      } catch (error) {
        console.error('Error loading Live2D widget:', error);
      }
    };

    onMounted(() => {
      setTimeout(() => {
        initLive2D();
      }, 100);
    });

    onUnmounted(() => {
      cleanup();
    });

    return {
      container,
      angry,
      dizzy,
      headHit,
      scaleValue
    };
  }
});
</script>

<style scoped>
.live2d-widget-container {
  position: relative;
  width: 100%;
  height: 100%;
}

/* Deep styles for the widget elements */
/* //模型 */
:deep(#waifu) {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 1;
  transform: translateY(0);
  transition:
    transform 0.3s ease-in-out,
    bottom 3s ease-in-out;
}
/* //气泡 */
:deep(#waifu-tips) {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  animation: none;
  background-color: rgba(236, 217, 188, 0.5);
  border: 1px solid rgba(224, 186, 140, 0.62);
  border-radius: 12px;
  box-shadow: 0 3px 15px 2px rgba(191, 158, 118, 0.2);
  font-size: 14px;
  line-height: 24px;
  margin: -20px 0 0 0;
  min-height: 70px;
  opacity: 0;
  overflow: hidden;
  padding: 5px 10px;
  position: absolute;
  left: 60px;
  bottom: 100%;
  text-overflow: ellipsis;
  transition: opacity 1s;
  width: 250px;
  word-break: break-all;
  pointer-events: none; /* Let clicks pass through */
}

:deep(#waifu-tips.waifu-tips-active) {
  opacity: 1;
  transition: opacity 0.2s;
}
/* //右侧icon */
:deep(#waifu-tool) {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 5px;
  opacity: 0;
  position: absolute;
  right: 60px;
  bottom: 20px;
  transition: opacity 1s;
}

:deep(#waifu:hover #waifu-tool) {
  opacity: 1;
}

:deep(#waifu-tool svg) {
  cursor: pointer;
  display: block;
  fill: #7b8c9d;
  height: 25px;
  width: 25px;
  transition: fill 0.3s;
}

:deep(#waifu-tool svg:hover) {
  fill: #0684bd;
}

:deep(#live2d) {
  cursor: grab;
  /* width and height are set by canvas attributes but CSS can override */
  width: 100%;
  height: 100%;
  object-fit: contain;
}

:deep(#live2d-cubism3) {
  width: 100%;
  height: 100%;
}

:deep(#live2d:active) {
  cursor: grabbing;
}

@keyframes waifu-shake {
  2% {
    transform: translate(0.5px, -1.5px) rotate(-0.5deg);
  }
  4% {
    transform: translate(0.5px, 1.5px) rotate(1.5deg);
  }
  6% {
    transform: translate(1.5px, 1.5px) rotate(1.5deg);
  }
  8% {
    transform: translate(2.5px, 1.5px) rotate(0.5deg);
  }
  10% {
    transform: translate(0.5px, 2.5px) rotate(0.5deg);
  }
  /* ... simplified shake ... */
  50% {
    transform: translate(-1.5px, 1.5px) rotate(0.5deg);
  }
  100% {
    transform: translate(0, 0) rotate(0);
  }
}

/* Angry shake override */
.is-angry :deep(#waifu) {
  animation: shake 0.5s infinite;
}

/* Dizzy spin override */
.is-dizzy :deep(#waifu) {
  animation: dizzy-sway 2s ease-in-out infinite;
  filter: blur(0.5px);
}

@keyframes dizzy-sway {
  0% {
    transform: rotate(0deg) translateX(0);
  }
  25% {
    transform: rotate(-5deg) translateX(-5px);
  }
  50% {
    transform: rotate(0deg) translateX(0);
  }
  75% {
    transform: rotate(5deg) translateX(5px);
  }
  100% {
    transform: rotate(0deg) translateX(0);
  }
}

@keyframes shake {
  0% {
    transform: translate(1px, 1px) rotate(0deg);
  }
  10% {
    transform: translate(-1px, -2px) rotate(-1deg);
  }
  20% {
    transform: translate(-3px, 0px) rotate(1deg);
  }
  30% {
    transform: translate(3px, 2px) rotate(0deg);
  }
  40% {
    transform: translate(1px, -1px) rotate(1deg);
  }
  50% {
    transform: translate(-1px, 2px) rotate(-1deg);
  }
  60% {
    transform: translate(-3px, 1px) rotate(0deg);
  }
  70% {
    transform: translate(3px, 1px) rotate(-1deg);
  }
  80% {
    transform: translate(-1px, -1px) rotate(1deg);
  }
  90% {
    transform: translate(1px, 2px) rotate(0deg);
  }
  100% {
    transform: translate(1px, -2px) rotate(-1deg);
  }
}

/* Head hit squash */
.is-head-hit :deep(#waifu) {
  animation: squash 0.5s ease-out;
}

@keyframes squash {
  0% {
    transform: scale(1, 1) translateY(0);
  }
  50% {
    transform: scale(1.1, 0.9) translateY(5px);
  }
  100% {
    transform: scale(1, 1) translateY(0);
  }
}
</style>
