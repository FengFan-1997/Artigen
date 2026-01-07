<template>
  <div class="room-page">
    <div class="room-shell room-main">
      <button class="settings-toggle" type="button" @click="openSettings">设置</button>
      <div v-if="isSettingsOpen" class="settings-overlay" @click="closeSettings"></div>
      <section class="room-chat">
        <div class="room-messages" ref="messagesEl">
          <div v-for="(msg, idx) in chatMessages" :key="idx" class="room-message" :class="msg.role">
            <div class="room-bubble" v-html="renderMessage(msg.text)"></div>
          </div>
          <div v-if="isChatLoading" class="room-message agent">
            <div class="room-bubble room-loading">...</div>
          </div>
        </div>

        <div class="room-input">
          <input
            v-model="draft"
            class="room-text"
            type="text"
            placeholder="和她说点什么…"
            :disabled="!agentApi || isChatLoading"
            @keyup.enter="send"
          />
          <button
            class="room-send"
            type="button"
            :disabled="!agentApi || isChatLoading || !draft.trim()"
            @click="send"
          >
            发送
          </button>
        </div>
      </section>

      <section class="room-stage">
        <Agent ref="agentRef" :is-pinned="true" layout-mode="relative" ui-mode="room" />
      </section>

      <aside class="room-settings" :class="{ open: isSettingsOpen }">
        <div class="settings-top">
          <router-link class="settings-back" to="/">返回</router-link>
          <div class="settings-title">设置</div>
          <button class="settings-btn" type="button" :disabled="!agentApi" @click="clearChat">
            清空
          </button>
          <button class="settings-btn settings-close" type="button" @click="closeSettings">
            关闭
          </button>
        </div>

        <div class="settings-body">
          <div class="settings-section">
            <div class="settings-section-title">AI</div>
            <div class="settings-row">
              <div class="settings-label">通道</div>
              <select v-model="transport" class="settings-input" @change="applyTransport">
                <option value="direct">Gemini（直连）</option>
                <option value="proxy">SiliconFlow（后端）</option>
              </select>
            </div>
            <div class="settings-hint">直连失败会自动切换到后端通道</div>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">模型</div>
            <div class="settings-row">
              <div class="settings-label">类型</div>
              <select
                v-model="selectedAgentType"
                class="settings-input"
                :disabled="!agentSettings"
                @change="applyAgentType"
              >
                <option value="vrm">VRM</option>
                <option value="cubism3">Live2D（Cubism3）</option>
              </select>
            </div>
            <div
              class="settings-row"
              v-if="agentSettings?.hasVrmSupport && selectedAgentType === 'vrm'"
            >
              <div class="settings-label">VRM</div>
              <select
                v-model.number="selectedVrmIndex"
                class="settings-input"
                :disabled="!agentSettings || !agentSettings?.vrmModels?.length"
                @change="applyVrmModel"
              >
                <option v-for="m in agentSettings?.vrmModels || []" :key="m.path" :value="m.index">
                  {{ m.name }}
                </option>
              </select>
            </div>
            <div class="settings-row">
              <label class="settings-check">
                <input
                  v-model="mouseFollowEnabled"
                  type="checkbox"
                  :disabled="!agentSettings"
                  @change="applyMouseFollow"
                />
                <span>鼠标跟随</span>
              </label>
            </div>
            <div class="settings-row">
              <div class="settings-label">大小</div>
              <input
                v-model.number="dynamicScale"
                class="settings-range"
                type="range"
                min="0.8"
                max="2.8"
                step="0.01"
                :disabled="!hasAgentControl"
              />
              <div class="settings-value">{{ dynamicScale.toFixed(2) }}</div>
            </div>
            <div class="settings-actions">
              <button
                class="settings-btn"
                type="button"
                :disabled="!agentSettings"
                @click="refreshAgentSettings"
              >
                刷新
              </button>
              <button
                class="settings-btn"
                type="button"
                :disabled="!hasAgentControl"
                @click="resetScale"
              >
                重置大小
              </button>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">操作</div>
            <div class="settings-actions">
              <button
                class="settings-btn"
                type="button"
                :disabled="!hasAgentControl"
                @click="cancelAi"
              >
                取消 AI
              </button>
              <button
                class="settings-btn"
                type="button"
                :disabled="!hasAgentControl"
                @click="reloadMemory"
              >
                重载记忆
              </button>
              <button
                class="settings-btn"
                type="button"
                :disabled="!hasAgentControl"
                @click="clearLocalMemory"
              >
                清空记忆
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { marked } from 'marked';
import Agent from '../agent/components/Agent.vue';
import { getAiTransportOverride, setAiTransportOverride } from '../agent/services/aiService';

type ChatMessage = { role: 'user' | 'agent' | 'system'; text: string };

type AgentExpose = {
  sendChat: (text: string) => Promise<void>;
  getChatMessages: () => ChatMessage[];
  isChatLoading: () => boolean;
  clearChatMessages: () => void;
};

const agentRef = ref<any>(null);
const messagesEl = ref<HTMLElement | null>(null);
const draft = ref('');
const isSettingsOpen = ref(false);

const AGENT_SETTINGS_REQUEST_EVENT = 'agent_settings_request';
const AGENT_SETTINGS_UPDATE_EVENT = 'agent_settings_update';
const AGENT_SETTINGS_STATE_EVENT = 'agent_settings_state';

const agentSettings = ref<any>(null);
const selectedAgentType = ref<'vrm' | 'cubism3'>('vrm');
const selectedVrmIndex = ref<number>(0);
const mouseFollowEnabled = ref<boolean>(false);
const dynamicScale = ref<number>(2.2);

const transport = ref<string>(getAiTransportOverride() || 'direct');
const prevTransport = ref<string>('');

const agentApi = computed<AgentExpose | null>(() => {
  const api = agentRef.value as AgentExpose | null;
  if (!api || typeof api.sendChat !== 'function') return null;
  return api;
});

const hasAgentControl = computed(() => !!agentApi.value);

const chatMessages = computed<ChatMessage[]>(() => {
  try {
    return agentApi.value?.getChatMessages?.() || [];
  } catch {
    return [];
  }
});

const isChatLoading = computed(() => {
  try {
    return !!agentApi.value?.isChatLoading?.();
  } catch {
    return false;
  }
});

const escapeHtml = (input: string) => {
  const s = String(input ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const sanitizeHref = (href: string) => {
  const raw = String(href ?? '').trim();
  if (!raw) return null;
  if (/[\u0000-\u001F\u007F\s]/.test(raw)) return null;
  if (/^(javascript|data|vbscript):/i.test(raw)) return null;
  if (raw.startsWith('#')) return { href: raw, external: false };
  if (raw.startsWith('/')) return { href: raw, external: false };

  try {
    const url = new URL(raw, window.location.href);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'mailto:') return null;
    const external =
      protocol === 'http:' || protocol === 'https:' ? url.origin !== window.location.origin : true;
    return { href: url.href, external };
  } catch {
    return null;
  }
};

const sanitizeRenderedHtml = (html: string) => {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return escapeHtml(html).replace(/\n/g, '<br>');
  }

  const allowedTags = new Set([
    'P',
    'BR',
    'EM',
    'STRONG',
    'DEL',
    'CODE',
    'PRE',
    'BLOCKQUOTE',
    'UL',
    'OL',
    'LI',
    'A',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HR',
    'TABLE',
    'THEAD',
    'TBODY',
    'TR',
    'TH',
    'TD'
  ]);

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild as HTMLElement | null;
  if (!container) return '';

  const elements = Array.from(container.querySelectorAll('*')).reverse();
  for (const el of elements) {
    const tag = el.tagName.toUpperCase();
    if (!allowedTags.has(tag)) {
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      continue;
    }

    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      el.removeAttribute(attr.name);
      if (tag === 'A' && (name === 'href' || name === 'title')) {
        el.setAttribute(attr.name, attr.value);
      } else if ((tag === 'CODE' || tag === 'PRE') && name === 'class') {
        const v = String(attr.value || '').trim();
        if (/^(language|lang)-[a-z0-9_-]{1,24}$/i.test(v)) el.setAttribute('class', v);
      }
    }

    if (tag === 'A') {
      const safe = sanitizeHref(el.getAttribute('href') || '');
      if (!safe) {
        el.removeAttribute('href');
        el.removeAttribute('title');
      } else {
        el.setAttribute('href', safe.href);
        if (safe.external) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer nofollow');
        } else {
          el.removeAttribute('target');
          el.removeAttribute('rel');
        }
      }
    }
  }

  return container.innerHTML;
};

const renderMessage = (text: string) => {
  try {
    const md = String(text ?? '');
    const rendered = marked.parse(md, {
      gfm: true,
      breaks: true,
      mangle: false,
      headerIds: false
    } as any);
    return sanitizeRenderedHtml(String(rendered ?? ''));
  } catch {
    return escapeHtml(String(text ?? '')).replace(/\n/g, '<br>');
  }
};

const scrollToBottom = async () => {
  await nextTick();
  const el = messagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

const send = async () => {
  const text = draft.value.trim();
  if (!text) return;
  const api = agentApi.value;
  if (!api) return;
  draft.value = '';
  await api.sendChat(text);
  const latest = getAiTransportOverride();
  if (latest === 'direct' || latest === 'proxy') transport.value = latest;
  await scrollToBottom();
};

const clearChat = () => {
  agentApi.value?.clearChatMessages?.();
  void scrollToBottom();
};

const requestAgentSettings = () => {
  window.dispatchEvent(new CustomEvent(AGENT_SETTINGS_REQUEST_EVENT));
};

const refreshAgentSettings = () => {
  requestAgentSettings();
};

const applyAgentSettingsUpdate = (detail: any) => {
  window.dispatchEvent(new CustomEvent(AGENT_SETTINGS_UPDATE_EVENT, { detail }));
};

const applyAgentType = () => {
  applyAgentSettingsUpdate({ agentType: selectedAgentType.value });
};

const applyVrmModel = () => {
  applyAgentSettingsUpdate({ vrmModelIndex: selectedVrmIndex.value });
};

const applyMouseFollow = () => {
  applyAgentSettingsUpdate({ mouseFollowEnabled: mouseFollowEnabled.value });
};

const applyTransport = () => {
  const v = String(transport.value || '')
    .trim()
    .toLowerCase();
  if (v === 'direct' || v === 'proxy') setAiTransportOverride(v as any);
  else setAiTransportOverride('');
};

const applyScale = (v: number) => {
  if (!Number.isFinite(v)) return;
  applyAgentSettingsUpdate({ dynamicScale: v });
};

const resetScale = () => {
  dynamicScale.value = 2.2;
  applyScale(dynamicScale.value);
};

const openSettings = () => {
  isSettingsOpen.value = true;
};

const closeSettings = () => {
  isSettingsOpen.value = false;
};

const cancelAi = () => {
  applyAgentSettingsUpdate({ action: 'cancelAi' });
};

const reloadMemory = () => {
  applyAgentSettingsUpdate({ action: 'reloadMemory' });
};

const clearLocalMemory = () => {
  applyAgentSettingsUpdate({ action: 'clearLocalMemory' });
};

watch(
  () => chatMessages.value.length,
  () => {
    void scrollToBottom();
  }
);

watch(
  () => dynamicScale.value,
  (v) => {
    const s = agentSettings.value;
    if (s && typeof s.dynamicScale === 'number' && s.dynamicScale === v) return;
    if (!agentApi.value) return;
    applyScale(v);
  }
);

const handleAgentSettingsState = (event: Event) => {
  const detail = (event as CustomEvent).detail;
  agentSettings.value = detail || null;
};

onMounted(async () => {
  prevTransport.value = getAiTransportOverride() || '';
  setAiTransportOverride('direct');
  transport.value = 'direct';

  window.addEventListener(AGENT_SETTINGS_STATE_EVENT, handleAgentSettingsState as any);

  await nextTick();
  requestAgentSettings();
  void scrollToBottom();
});

onBeforeUnmount(() => {
  window.removeEventListener(AGENT_SETTINGS_STATE_EVENT, handleAgentSettingsState as any);
  setAiTransportOverride(prevTransport.value as any);
});

watch(
  () => agentSettings.value,
  (s) => {
    if (!s) return;
    if (s.agentType === 'vrm' || s.agentType === 'cubism3') selectedAgentType.value = s.agentType;
    if (typeof s.vrmModelIndex === 'number') selectedVrmIndex.value = s.vrmModelIndex;
    if (typeof s.mouseFollowEnabled === 'boolean') mouseFollowEnabled.value = s.mouseFollowEnabled;
    if (typeof s.dynamicScale === 'number') dynamicScale.value = s.dynamicScale;
  },
  { immediate: true }
);

watch(
  () => agentApi.value,
  (api) => {
    if (!api) return;
    applyScale(dynamicScale.value);
  },
  { immediate: true }
);
</script>

<style scoped>
.room-page {
  min-height: 100vh;
  background:
    radial-gradient(1200px 800px at 20% 10%, rgba(255, 170, 210, 0.18), transparent),
    radial-gradient(900px 700px at 80% 20%, rgba(160, 220, 255, 0.18), transparent),
    radial-gradient(800px 600px at 50% 90%, rgba(255, 240, 180, 0.12), transparent), #0f1220;
  color: #e9ecff;
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.room-header {
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 18, 32, 0.6);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 100;
}

.room-back {
  color: #cfe3ff;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}

.room-back:hover {
  color: #fff;
}

.room-title {
  text-align: center;
  font-weight: 700;
  letter-spacing: 0.8px;
  font-size: 18px;
  background: linear-gradient(90deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.room-actions {
  display: flex;
  justify-content: flex-end;
}

.room-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #e9ecff;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.room-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
}

.room-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.room-main {
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr) 320px;
  gap: 24px;
  padding: 24px;
  padding-left: 12px;
  height: 100vh;
  margin: 0;
}

.room-chat {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background: rgba(20, 24, 40, 0.6);
  backdrop-filter: blur(20px);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.room-messages {
  padding: 20px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.room-messages::-webkit-scrollbar {
  width: 6px;
}
.room-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.room-message {
  display: flex;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.room-message.user {
  justify-content: flex-end;
}

.room-message.agent,
.room-message.system {
  justify-content: flex-start;
}

.room-bubble {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 18px;
  line-height: 1.6;
  font-size: 15px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.05);
  word-break: break-word;
  color: #f0f0f0;
}

.room-message.agent .room-bubble {
  border-bottom-left-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
}

.room-message.user .room-bubble {
  border-bottom-right-radius: 4px;
  background: linear-gradient(135deg, rgba(100, 160, 255, 0.2), rgba(80, 140, 255, 0.3));
  border: 1px solid rgba(120, 170, 255, 0.3);
  text-align: right;
}

.room-loading {
  opacity: 0.7;
  font-style: italic;
}

.room-input {
  display: grid;
  grid-template-columns: 1fr 80px;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
}

.room-text {
  height: 46px;
  border-radius: 23px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  padding: 0 20px;
  outline: none;
  font-size: 15px;
  transition: all 0.2s;
}

.room-text:focus {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

.room-send {
  height: 46px;
  border-radius: 23px;
  border: none;
  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
  color: #5a2a2a;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.1s,
    opacity 0.2s;
}

.room-send:active {
  transform: scale(0.96);
}

.room-send:disabled,
.room-text:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

.room-stage {
  position: relative;
  height: 100%;
  border-radius: 24px;
  /* background: url('@/assets/room-bg.jpg') center/cover no-repeat; */
  /* Fallback or specific styling for the stage */
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.room-stage :deep(.agent-container) {
  width: 100% !important;
  height: 100% !important;
  max-width: 100%;
  max-height: 100%;
}

.room-stage :deep(.vrm-widget) {
  width: 100%;
  height: 100%;
}

.room-settings {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background: rgba(20, 24, 40, 0.6);
  backdrop-filter: blur(20px);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.settings-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
}

.settings-back {
  color: #cfe3ff;
  text-decoration: none;
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}

.settings-title {
  flex: 1;
  text-align: center;
  font-weight: 700;
  letter-spacing: 0.6px;
}

.settings-body {
  overflow: auto;
  padding: 16px;
}

.settings-section {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 14px 14px 12px;
  background: rgba(0, 0, 0, 0.12);
  margin-bottom: 12px;
}

.settings-section-title {
  font-weight: 700;
  margin-bottom: 10px;
  color: rgba(233, 236, 255, 0.9);
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.settings-row:last-child {
  margin-bottom: 0;
}

.settings-label {
  width: 54px;
  flex: 0 0 auto;
  color: rgba(233, 236, 255, 0.8);
  font-size: 13px;
}

.settings-input {
  flex: 1;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e9ecff;
  padding: 0 12px;
  outline: none;
}

.settings-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.settings-hint {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.75;
}

.settings-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.settings-range {
  flex: 1;
}

.settings-value {
  width: 48px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

.settings-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.settings-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #e9ecff;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.settings-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
}

.settings-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-close,
.settings-toggle,
.settings-overlay {
  display: none;
}

/* Enhancements for smaller screens */
@media (max-width: 980px) {
  .room-main {
    grid-template-columns: 1fr;
    grid-template-rows: 400px 1fr;
    height: auto;
    padding: 16px;
    padding-left: 16px;
  }
  .room-chat {
    order: 2;
    min-height: 400px;
  }
  .room-stage {
    order: 1;
    min-height: 400px;
    background: rgba(0, 0, 0, 0.1); /* Slight darken for mobile contrast */
  }
  .settings-toggle {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 210;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(15, 18, 32, 0.7);
    backdrop-filter: blur(12px);
    color: #e9ecff;
    cursor: pointer;
  }
  .settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: block;
    background: rgba(0, 0, 0, 0.55);
  }
  .room-settings {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: min(360px, 92vw);
    z-index: 220;
    transform: translateX(110%);
    transition: transform 0.22s ease;
    border-radius: 18px 0 0 18px;
  }
  .room-settings.open {
    transform: translateX(0);
  }
  .settings-close {
    display: inline-flex;
  }
}
</style>
