/**
 * @file Contains the configuration and functions for waifu tools.
 * @module tools
 */

import {
  fa_comment,
  fa_street_view,
  fa_shirt,
  fa_camera_retro,
  fa_quote_left,
  fa_cube,
  fa_arrow_up,
  fa_arrow_down
} from './icons';
import { showMessage, i18n } from '../services/message';
import type { ModelManager } from '../services/Live2DModelManager';
import type { Config, Tips } from '../types/live2d';
import logger from '../utils/logger';

interface Tools {
  /**
   * Key-value pairs of tools, where the key is the tool name.
   * @type {string}
   */
  [key: string]: {
    /**
     * Icon of the tool, usually an SVG string.
     * @type {string}
     */
    icon: string;
    /**
     * Callback function for the tool.
     * @type {() => void}
     */
    callback: (message: any) => void | Promise<void>;
  };
}

type Live2DToolEventPhase = 'start' | 'done' | 'error';

type Live2DToolEventDetail = {
  tool: string;
  phase: Live2DToolEventPhase;
  ts: number;
  modelId?: number;
  ok?: boolean;
  error?: string;
};

/**
 * Waifu tools manager.
 */
class ToolsManager {
  tools: Tools;
  config: Config;

  constructor(model: ModelManager, config: Config, tips: Tips) {
    this.config = config;
    this.tools = {
      chat: {
        icon: fa_comment,
        callback: () => {
          if (this.config.onChat) {
            this.config.onChat();
          } else if ((window as any).toggleChat) {
            (window as any).toggleChat();
          } else {
            logger.warn('toggleChat function not found.');
          }
        }
      },
      hitokoto: {
        icon: fa_quote_left,
        callback: async () => {
          try {
            const response = await fetch('https://v1.hitokoto.cn');
            if (!response.ok) throw new Error('Network response was not ok');
            const result = await response.json();
            const template = tips.message.hitokoto;
            const text = i18n(template, result.from, result.creator);
            showMessage(result.hitokoto, 6000, 9);
            setTimeout(() => {
              showMessage(text, 4000, 9);
            }, 6000);
          } catch (error) {
            logger.error('Failed to fetch hitokoto', error);
            showMessage('Every day is a new beginning.', 4000, 9);
          }
        }
      },
      'switch-model': {
        icon: fa_street_view,
        callback: () => {
          showMessage('切换模型中...', 2000, 9);
          model.loadNextModel();
        }
      },
      'switch-model-prev': {
        icon: fa_arrow_up,
        callback: () => {
          showMessage('切换上一个模型中...', 2000, 9);
          if ((model as any).loadPrevModel) {
            (model as any).loadPrevModel();
          }
        }
      },
      'switch-model-next': {
        icon: fa_arrow_down,
        callback: () => {
          showMessage('切换下一个模型中...', 2000, 9);
          model.loadNextModel();
        }
      },
      'switch-ziyuxin': {
        icon: fa_cube,
        callback: () => {
          showMessage('切换模型类型中...', 2000, 9);
          if ((model as any).toggleModelVersion) {
            (model as any).toggleModelVersion();
          }
        }
      },
      'switch-texture': {
        icon: fa_shirt,
        callback: () => {
          let successMessage = '',
            failMessage = '';
          if (tips) {
            successMessage = tips.message.changeSuccess;
            failMessage = tips.message.changeFail;
          }
          model.loadRandTexture(successMessage, failMessage);
        }
      },
      photo: {
        icon: fa_camera_retro,
        callback: () => {
          const message = tips.message.photo;
          showMessage(message, 6000, 9);
          const canvas = document.getElementById('live2d') as HTMLCanvasElement;
          if (!canvas) return;
          const imageUrl = canvas.toDataURL();

          const link = document.createElement('a');
          link.style.display = 'none';
          link.href = imageUrl;
          link.download = 'live2d-photo.png';

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    };
  }

  private dispatchToolEvent(detail: Live2DToolEventDetail) {
    try {
      window.dispatchEvent(new CustomEvent('live2d:tool', { detail }));
    } catch {
      try {
        window.dispatchEvent(new Event('live2d:tool'));
      } catch {}
    }
  }

  registerTools() {
    const toolBar = document.getElementById('waifu-tool');
    if (!toolBar) return;
    if (!Array.isArray(this.config.tools)) {
      this.config.tools = Object.keys(this.tools);
    }
    for (const toolName of this.config.tools) {
      if (this.tools[toolName]) {
        const { icon, callback } = this.tools[toolName];
        const elementId = `waifu-tool-${toolName}`;
        try {
          document.getElementById(elementId)?.remove();
        } catch {}
        const element = document.createElement('span');
        element.id = elementId;
        try {
          const doc = new DOMParser().parseFromString(String(icon || ''), 'image/svg+xml');
          const root = doc.documentElement as any;
          if (root && String(root.tagName || '').toLowerCase() === 'svg') {
            const svg = document.importNode(root, true) as SVGElement;
            const nodes = Array.from(svg.querySelectorAll('*'));
            for (const n of nodes) {
              const attrs = Array.from((n as Element).attributes);
              for (const a of attrs) {
                const name = a.name.toLowerCase();
                const value = String(a.value || '');
                if (name.startsWith('on')) (n as Element).removeAttribute(a.name);
                if (name === 'href' || name === 'xlink:href') {
                  if (/^(javascript|data|vbscript):/i.test(value.trim()))
                    (n as Element).removeAttribute(a.name);
                }
              }
            }
            element.appendChild(svg);
          }
        } catch {}
        toolBar.insertAdjacentElement('beforeend', element);
        element.addEventListener('click', (e) => {
          e.stopPropagation();
          const base: Omit<Live2DToolEventDetail, 'phase'> = {
            tool: toolName,
            ts: Date.now(),
            modelId: typeof this.config.modelId === 'number' ? this.config.modelId : undefined
          };
          this.dispatchToolEvent({ ...base, phase: 'start' });

          try {
            const result = callback(e);
            const isPromise =
              !!result &&
              (typeof (result as any).then === 'function' ||
                typeof (result as any).catch === 'function');

            if (!isPromise) {
              this.dispatchToolEvent({ ...base, phase: 'done', ok: true });
              return;
            }

            void (result as Promise<void>)
              .then(() => {
                this.dispatchToolEvent({ ...base, phase: 'done', ok: true });
              })
              .catch((err) => {
                const msg = String(err?.message || err || '').slice(0, 240);
                this.dispatchToolEvent({ ...base, phase: 'error', ok: false, error: msg });
                logger.error('[Live2DWidget] Tool callback failed', { tool: toolName, error: msg });
              });
          } catch (err: any) {
            const msg = String(err?.message || err || '').slice(0, 240);
            this.dispatchToolEvent({ ...base, phase: 'error', ok: false, error: msg });
            logger.error('[Live2DWidget] Tool callback failed', { tool: toolName, error: msg });
          }
        });
      }
    }
  }
}

export { ToolsManager, type Tools };
