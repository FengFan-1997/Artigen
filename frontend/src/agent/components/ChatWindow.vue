<template>
  <div
    class="chat-window"
    :class="placement"
    :style="windowStyle"
    ref="chatWindowRef"
    @mousemove="refreshActivity"
    @click="refreshActivity"
    @keydown="refreshActivity"
  >
    <div class="chat-header">
      <div class="header-left">
        <span class="title">{{ t.title }}</span>
      </div>
      <div class="header-right">
        <button
          class="icon-btn mute-btn"
          @click="$emit('toggle-mute')"
          :title="isMuted ? t.unmute : t.mute"
        >
          {{ isMuted ? '🔇' : '🔊' }}
        </button>
        <button
          class="icon-btn user-btn"
          @click="toggleView"
          :title="isAuthenticated ? t.profile : t.login"
        >
          {{ isAuthenticated ? '👤' : '🔑' }}
        </button>
        <button class="icon-btn close-btn" @click="$emit('close')">×</button>
      </div>
    </div>

    <!-- Chat View -->
    <transition name="fade" mode="out-in">
      <div v-if="currentView === 'chat'" class="view-content chat-view">
        <div class="chat-messages" ref="messagesContainer">
          <transition-group name="message">
            <div
              v-for="(msg, index) in visibleMessages"
              :key="index"
              class="chat-message"
              :class="msg.role"
            >
              <div class="message-content" v-html="renderMessage(msg.text)"></div>
            </div>
          </transition-group>

          <div v-if="isLoading" class="chat-message agent loading">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
            <div class="loading-text">{{ t.loadingText }}</div>
          </div>
        </div>

        <div class="chat-input-area">
          <input
            v-model="inputMessage"
            @keyup.enter="handleSend"
            :placeholder="t.typeMessage"
            :disabled="isLoading"
          />
          <button
            class="voice-btn"
            :class="{ listening: isListening }"
            @click="toggleVoice"
            :title="isListening ? t.stopListening : t.speak"
          >
            🎤
          </button>
          <button
            class="send-btn"
            @click="handleSend"
            :disabled="!inputMessage.trim() || isLoading"
          >
            <span v-if="isLoading">...</span>
            <span v-else>➤</span>
          </button>
        </div>
      </div>

      <!-- Auth/Profile View -->
      <div v-else class="view-content auth-view">
        <div class="auth-container">
          <div v-if="isAuthenticated" class="profile-view">
            <div class="avatar-large">
              <span>👤</span>
            </div>
            <h3>{{ sessionEmail || '-' }}</h3>
            <p class="user-id">ID: {{ sessionUserId || '-' }}</p>

            <div class="stats">
              <div class="stat-item">
                <span class="stat-val">1</span>
                <span class="stat-label">{{ t.visits }}</span>
              </div>
            </div>

            <button class="logout-btn" @click="handleLogout">{{ t.logout }}</button>
            <button class="back-btn" @click="currentView = 'chat'">{{ t.backToChat }}</button>
          </div>

          <div v-else class="login-cta">
            <button class="nth-login-btn" type="button" @click="goLogin">{{ t.login }}</button>
            <button class="back-btn" type="button" @click="currentView = 'chat'">
              {{ t.backToChat }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script lang="ts">
export default {};
</script>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed } from 'vue';
import { marked } from 'marked';
import { message } from 'ant-design-vue';
import type { ChatMessage } from '../types';
import logger from '../utils/logger';
import { useRoute } from 'vue-router';
import { getCurrentUserId, isLocalLoggedIn, logoutLocal } from '@/login/session';
import { getLastEmail, loadUsers } from '@/login/storage';
import { useLoginModel } from '@/stores';

const props = defineProps<{
  messages: ChatMessage[];
  isLoading: boolean;
  placement?: 'top' | 'bottom';
  isMuted: boolean;
  agentRect?: Partial<DOMRect>; // Changed to Partial to avoid strict type issues
  currentLang?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'send', text: string): void;
  (e: 'toggle-mute'): void;
  (e: 'activity'): void;
}>();

const route = useRoute();
const loginStore = useLoginModel();

const chatWindowRef = ref<HTMLElement | null>(null);

const translations = {
  en: {
    title: '✨ AI Assistant',
    mute: 'Mute',
    unmute: 'Unmute',
    profile: 'Profile',
    login: 'Login',
    typeMessage: 'Type a message...',
    loadingText: 'Processing, please wait…',
    speak: 'Speak',
    stopListening: 'Stop Listening',
    visits: 'Visits',
    logout: 'Logout',
    backToChat: 'Back to Chat'
  },
  zh: {
    title: '✨ AI 助手',
    mute: '静音',
    unmute: '取消静音',
    profile: '个人资料',
    login: '登录',
    typeMessage: '输入消息...',
    loadingText: '正在处理，请耐心等待…',
    speak: '语音输入',
    stopListening: '停止语音',
    visits: '访问次数',
    logout: '登出',
    backToChat: '返回聊天'
  }
};

const t = computed(() => {
  return translations[props.currentLang === 'zh' ? 'zh' : 'en'];
});

const inputMessage = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

// Voice Input State
const isListening = ref(false);
let recognition: any = null;

const isAuthenticated = ref(false);
const sessionUserId = ref('');
const sessionEmail = ref('');

const refreshSession = () => {
  const authed = isLocalLoggedIn();
  const uid = getCurrentUserId();
  const users = loadUsers();
  const found = users.find((u) => u.userId === uid);
  isAuthenticated.value = authed;
  sessionUserId.value = uid;
  sessionEmail.value = (found?.email || getLastEmail() || '').trim();
};

const toggleVoice = () => {
  if (isListening.value) {
    recognition?.stop();
    isListening.value = false;
    return;
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    message.warning(
      props.currentLang === 'zh'
        ? '当前浏览器不支持语音输入。'
        : 'Voice input is not supported in this browser.'
    );
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isListening.value = true;
  };

  recognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((result: any) => result[0])
      .map((result: any) => result.transcript)
      .join('');

    inputMessage.value = transcript;
  };

  recognition.onerror = (event: any) => {
    logger.warn('Speech recognition error', event?.error);
    isListening.value = false;
  };

  recognition.onend = () => {
    isListening.value = false;
  };

  recognition.start();
};

const windowStyle = computed(() => {
  if (window.innerWidth <= 768) {
    return {};
  }

  const style: any = {};

  if (props.agentRect) {
    const ax = props.agentRect.x ?? 0;
    const ay = props.agentRect.y ?? 0;
    const aw = props.agentRect.width ?? 0;
    const ah = props.agentRect.height ?? 0;

    const centerX = ax + aw / 2;
    const centerY = ay + ah / 2;

    const isLeft = centerX < window.innerWidth / 2;
    const isTop = centerY < window.innerHeight / 2;

    style.transform = 'none';

    if (isLeft && isTop) {
      style.right = '24px';
      style.bottom = '24px';
      style.left = 'auto';
      style.top = 'auto';
    } else if (!isLeft && isTop) {
      style.left = '24px';
      style.bottom = '24px';
      style.right = 'auto';
      style.top = 'auto';
    } else if (isLeft && !isTop) {
      style.right = '24px';
      style.top = '24px';
      style.left = 'auto';
      style.bottom = 'auto';
    } else {
      style.left = '24px';
      style.top = '24px';
      style.right = 'auto';
      style.bottom = 'auto';
    }
  }

  return style;
});

// View State
const currentView = ref<'chat' | 'auth'>('chat');

const visibleMessages = computed(() => {
  return props.messages.filter((msg) => !msg.text.startsWith('[System Event]:'));
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

const sanitizeImgSrc = (src: string) => {
  const raw = String(src ?? '').trim();
  if (!raw) return null;
  if (/[\u0000-\u001F\u007F\s]/.test(raw)) return null;
  if (raw.startsWith('/')) return { src: raw, external: false };
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(raw)) return { src: raw, external: false };
  if (raw.startsWith('blob:')) return { src: raw, external: false };
  try {
    const url = new URL(raw, window.location.href);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    return { src: url.href, external: url.origin !== window.location.origin };
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
    'TD',
    'IMG'
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
      } else if (tag === 'IMG' && (name === 'src' || name === 'alt' || name === 'title')) {
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
    if (tag === 'IMG') {
      const safe = sanitizeImgSrc(el.getAttribute('src') || '');
      if (!safe) {
        el.remove();
      } else {
        el.setAttribute('src', safe.src);
        el.setAttribute('loading', 'lazy');
        el.setAttribute('decoding', 'async');
        if (safe.external) {
          el.setAttribute('referrerpolicy', 'no-referrer');
        } else {
          el.removeAttribute('referrerpolicy');
        }
      }
    }
  }

  return container.innerHTML;
};

const renderMessage = (text: string) => {
  try {
    const md = String(text ?? '').replace(/^Thought:\s*(.*)$/gm, '> 🤔 $1');
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

const handleSend = () => {
  if (!inputMessage.value.trim() || props.isLoading) return;
  emit('send', inputMessage.value);
  inputMessage.value = '';
  refreshActivity();
};

const refreshActivity = () => {
  emit('activity');
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

watch(() => props.messages.length, scrollToBottom);
watch(() => props.isLoading, scrollToBottom);
watch(currentView, scrollToBottom);

onMounted(() => {
  refreshSession();
  scrollToBottom();
});

const handleLogout = async () => {
  logoutLocal();
};

const toggleView = () => {
  refreshSession();
  if (currentView.value === 'chat') {
    currentView.value = 'auth';
  } else {
    currentView.value = 'chat';
  }
  refreshActivity();
};

const goLogin = () => {
  loginStore.open({ mode: 'login', returnTo: String(route.fullPath || '').trim() });
};

// Auto-scroll to bottom when messages change
watch(
  () => props.messages.length,
  () => {
    if (currentView.value === 'chat') {
      refreshActivity();
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
      });
    }
  }
);
</script>

<style scoped>
/* Modern Glassmorphism & Animations */
.chat-window {
  position: absolute;
  right: 0;
  width: 360px;
  height: 550px;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 24px;
  box-shadow:
    0 26px 80px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.12) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10000;
  transform: translateX(-50%);
  left: 50%;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.chat-window.top {
  bottom: 120px;
  top: auto;
  transform-origin: bottom center;
}

.chat-window.bottom {
  top: 120px;
  bottom: auto;
  transform-origin: top center;
}

.chat-header {
  background: rgba(15, 23, 42, 0.65);
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.title {
  font-weight: 700;
  font-size: 16px;
  color: #333;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.icon-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  transition: background 0.2s;
  color: rgba(226, 232, 240, 0.75);
  margin-left: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(226, 232, 240, 0.95);
}

.view-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(2, 6, 23, 0.25);
}

/* Chat Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.chat-message {
  display: flex;
  flex-direction: column;
  max-width: 85%;
  animation: slideUp 0.3s ease-out;
}

.chat-message.agent {
  align-self: flex-start;
}

.chat-message.user {
  align-self: flex-end;
}

.message-content {
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  word-wrap: break-word;
  text-align: left;
}

.chat-message.loading {
  gap: 10px;
}

.chat-message.loading .loading-text {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.65);
}

.chat-message.agent .message-content {
  background: rgba(2, 6, 23, 0.55);
  color: rgba(226, 232, 240, 0.95);
  border-bottom-left-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.chat-message.user .message-content {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.95), rgba(139, 92, 246, 0.95));
  color: rgba(2, 6, 23, 0.95);
  border-bottom-right-radius: 4px;
}

.message-content img {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  display: block;
}

.message-content blockquote {
  background: rgba(255, 255, 255, 0.06);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: rgba(226, 232, 240, 0.85);
  margin-bottom: 8px;
  font-style: italic;
  border-left: 3px solid rgba(56, 189, 248, 0.85);
}

.message-content blockquote p {
  margin: 0;
}

/* Input Area */
.chat-input-area {
  padding: 16px;
  background: rgba(2, 6, 23, 0.35);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 10px;
  align-items: center;
}

.chat-input-area input {
  flex: 1;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 24px;
  padding: 12px 16px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  background: rgba(2, 6, 23, 0.25);
  color: rgba(226, 232, 240, 0.95);
  caret-color: rgba(226, 232, 240, 0.95);
}

.chat-input-area input::placeholder {
  color: rgba(226, 232, 240, 0.55);
}

.chat-input-area input:focus {
  border-color: rgba(56, 189, 248, 0.65);
  background: rgba(2, 6, 23, 0.3);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.send-btn,
.voice-btn {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: rgba(226, 232, 240, 0.75);
  font-size: 16px;
}

.send-btn:hover:not(:disabled),
.voice-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(226, 232, 240, 0.95);
  transform: scale(1.05);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-btn.listening {
  background: #ef4444;
  color: white;
  animation: pulse 1.5s infinite;
}

/* Animations */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 2px;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
  background: rgba(226, 232, 240, 0.55);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}
.typing-indicator span:nth-child(1) {
  animation-delay: -0.32s;
}
.typing-indicator span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

/* Auth View Styles */
.auth-view {
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.auth-container {
  width: 100%;
}

.profile-view {
  text-align: center;
}

.profile-view h3 {
  margin: 10px 0 6px;
  font-size: 18px;
  color: rgba(226, 232, 240, 0.95);
}

.user-id {
  margin: 0;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.65);
  word-break: break-all;
}

.avatar-large {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(139, 92, 246, 0.35));
  border-radius: 50%;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

.stats {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 24px 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-val {
  font-weight: 700;
  font-size: 20px;
  color: rgba(226, 232, 240, 0.95);
}

.stat-label {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.65);
}

.logout-btn,
.back-btn {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  margin-top: 12px;
  transition: all 0.2s;
}

.logout-btn {
  background: rgba(239, 68, 68, 0.16);
  color: rgba(254, 202, 202, 0.95);
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.22);
}

.back-btn {
  background: transparent;
  color: rgba(226, 232, 240, 0.75);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  text-decoration: none;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.22);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.message-enter-active,
.message-leave-active {
  transition: all 0.3s ease;
}
.message-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.message-leave-to {
  opacity: 0;
}
@media (max-width: 768px) {
  .chat-window {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    transform: none !important;
    width: 100vw !important;
    height: 52vh !important;
    max-height: none !important;
    margin: 0 !important;
    border-radius: 24px 24px 0 0 !important;
    z-index: 100000 !important;
  }
  .chat-window.top,
  .chat-window.bottom {
    bottom: 0 !important;
    top: auto !important;
    transform: none !important;
  }
}
</style>
