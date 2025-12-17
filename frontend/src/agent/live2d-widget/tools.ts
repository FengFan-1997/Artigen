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
  fa_cube
} from './icons';
import { showMessage, i18n } from '../services/message';
import type { ModelManager } from '../services/Live2DModelManager';
import type { Config, Tips } from '../types/live2d';

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
    callback: (message: any) => void;
  };
}

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
            console.warn('toggleChat function not found.');
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
            console.error('Failed to fetch hitokoto:', error);
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
      'switch-ziyuxin': {
        icon: fa_cube,
        callback: () => {
          showMessage('切换到紫雨心模型（Cubism3/4 引擎开发中）', 4000, 9);
          if ((model as any).loadSpecificModel) {
            (model as any).loadSpecificModel('ZiYuXin/ots14_4501/normal/normal.model3.json', {
              message: '紫雨心模型加载中（实验功能）...'
            });
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

  registerTools() {
    if (!Array.isArray(this.config.tools)) {
      this.config.tools = Object.keys(this.tools);
    }
    for (const toolName of this.config.tools) {
      if (this.tools[toolName]) {
        const { icon, callback } = this.tools[toolName];
        const element = document.createElement('span');
        element.id = `waifu-tool-${toolName}`;
        element.innerHTML = icon;
        document.getElementById('waifu-tool')?.insertAdjacentElement('beforeend', element);
        element.addEventListener('click', (e) => {
          e.stopPropagation();
          callback(e);
        });
      }
    }
  }
}

export { ToolsManager, type Tools };
