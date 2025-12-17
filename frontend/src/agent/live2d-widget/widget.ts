/**
 * @file Contains functions for initializing the waifu widget.
 * @module widget
 */

import { ModelManager } from '../services/Live2DModelManager';
import type { Config, ModelList, Tips } from '../types/live2d';
import { showMessage, welcomeMessage } from '../services/message';
import { randomSelection } from '../utils';
import { ToolsManager } from './tools';
import logger from '../utils/logger';
import registerDrag from './drag';

function registerEventListener(tips: Tips, config?: Config) {
  // If disableIdle is true, we skip the built-in message loop and event listeners
  // This allows the Agent.vue to handle interactions more intelligently.
  if (config?.disableIdle) return;

  let userAction = false;
  let userActionTimer: any;
  const messageArray = tips.message.default;
  tips.seasons.forEach(({ date, text }) => {
    const now = new Date(),
      after = date.split('-')[0],
      before = date.split('-')[1] || after;
    if (
      Number(after.split('/')[0]) <= now.getMonth() + 1 &&
      now.getMonth() + 1 <= Number(before.split('/')[0]) &&
      Number(after.split('/')[1]) <= now.getDate() &&
      now.getDate() <= Number(before.split('/')[1])
    ) {
      text = randomSelection(text);
      text = (text as string).replace('{year}', String(now.getFullYear()));
      messageArray.push(text);
    }
  });
  let lastHoverElement: any;
  window.addEventListener('mousemove', () => (userAction = true));
  window.addEventListener('keydown', () => (userAction = true));
  setInterval(() => {
    if (userAction) {
      userAction = false;
      clearInterval(userActionTimer);
      userActionTimer = null;
    } else if (!userActionTimer) {
      userActionTimer = setInterval(() => {
        showMessage(messageArray, 6000, 9);
      }, 20000);
    }
  }, 1000);

  window.addEventListener('mouseover', (event) => {
    for (const { selector, text } of tips.mouseover) {
      if (!(event.target as HTMLElement)?.closest(selector)) continue;
      if (lastHoverElement === selector) return;
      lastHoverElement = selector;
      let selectedText = randomSelection(text);
      selectedText = (selectedText as string).replace(
        '{text}',
        (event.target as HTMLElement).innerText
      );
      showMessage(selectedText, 4000, 8);
      return;
    }
  });
  window.addEventListener('click', (event) => {
    for (const { selector, text } of tips.click) {
      if (!(event.target as HTMLElement)?.closest(selector)) continue;
      let selectedText = randomSelection(text);
      selectedText = (selectedText as string).replace(
        '{text}',
        (event.target as HTMLElement).innerText
      );
      showMessage(selectedText, 4000, 8);
      return;
    }
  });
  window.addEventListener('live2d:hoverbody', () => {
    const text = randomSelection(tips.message.hoverBody);
    showMessage(text, 4000, 8, false);
  });
  window.addEventListener('live2d:tapbody', () => {
    const text = randomSelection(tips.message.tapBody);
    showMessage(text, 4000, 9);
  });

  const devtools = () => {};
  console.log('%c', devtools);
  devtools.toString = () => {
    showMessage(tips.message.console, 6000, 9);
  };
  window.addEventListener('copy', () => {
    showMessage(tips.message.copy, 6000, 9);
  });
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) showMessage(tips.message.visibilitychange, 6000, 9);
  });
}

async function initWidget(config: Config, container?: HTMLElement) {
  if (config.logLevel) {
    logger.setLevel(config.logLevel);
  }

  localStorage.removeItem('waifu-display');
  sessionStorage.removeItem('waifu-message-priority');

  const html = `
    <div id="waifu">
       <div id="waifu-tips"></div>
       <div id="waifu-canvas">
         <canvas id="live2d" width="800" height="800"></canvas>
         <div id="live2d-cubism3"></div>
       </div>
       <div id="waifu-tool"></div>
    </div>`;

  if (container) {
    container.innerHTML = html;
  } else {
    document.body.insertAdjacentHTML('beforeend', html);
  }

  let models: ModelList[] = [];
  let tips: Tips | null = null;
  if (config.waifuPath) {
    try {
      const response = await fetch(config.waifuPath);
      tips = await response.json();
      if (tips) {
        models = tips.models;
        registerEventListener(tips, config);
        // showMessage(
        //   welcomeMessage(tips.time, tips.message.welcome, tips.message.referrer),
        //   7000,
        //   11
        // );
      }
    } catch (e) {
      logger.error('Failed to load waifu-tips', e);
    }
  }

  const model = await ModelManager.initCheck(config, models);
  await model.loadModel('');

  if (tips) {
    new ToolsManager(model, config, tips).registerTools();
  }

  if (config.drag) registerDrag();

  const waifu = document.getElementById('waifu');
  if (waifu) waifu.classList.add('waifu-active');

  return model;
}

export { initWidget, showMessage };
