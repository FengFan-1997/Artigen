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
            <h3>{{ currentUser?.name || currentUser?.username }}</h3>
            <p class="user-id">ID: {{ currentUser?.userId || currentUser?.id }}</p>

            <div class="stats">
              <div class="stat-item">
                <span class="stat-val">{{ currentUser?.visits || 1 }}</span>
                <span class="stat-label">{{ t.visits }}</span>
              </div>
            </div>

            <button class="logout-btn" @click="handleLogout">{{ t.logout }}</button>
            <button class="back-btn" @click="currentView = 'chat'">{{ t.backToChat }}</button>
          </div>

          <AuthForm
            v-else
            :mode="authMode"
            @switch-mode="(m) => (authMode = m)"
            @success="handleAuthSuccess"
          />
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
import type { ChatMessage } from '../types';
import { useAuth } from '../composables/useAuth';
import AuthForm from './AuthForm.vue';

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

const { isAuthenticated, currentUser, logout } = useAuth();
const chatWindowRef = ref<HTMLElement | null>(null);

const translations = {
  en: {
    title: '✨ AI Assistant',
    mute: 'Mute',
    unmute: 'Unmute',
    profile: 'Profile',
    login: 'Login',
    typeMessage: 'Type a message...',
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

const toggleVoice = () => {
  if (isListening.value) {
    recognition?.stop();
    isListening.value = false;
    return;
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Voice input is not supported in this browser.');
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
    console.error('Speech recognition error', event.error);
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
const authMode = ref<'login' | 'register'>('login');

const visibleMessages = computed(() => {
  return props.messages.filter((msg) => !msg.text.startsWith('[System Event]:'));
});

const renderMessage = (text: string) => {
  try {
    // Format "Thought:" sections
    const formattedText = text.replace(
      /Thought:\s*(.*?)(?=\n|$)/g,
      '<div class="thought-bubble">🤔 $1</div>'
    );
    return marked.parse(formattedText);
  } catch {
    return text;
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
  scrollToBottom();
});

const handleLogout = async () => {
  await logout();
  currentView.value = 'auth';
  authMode.value = 'login';
};

const handleAuthSuccess = () => {
  currentView.value = 'chat';
};

const toggleView = () => {
  if (currentView.value === 'chat') {
    currentView.value = 'auth';
  } else {
    currentView.value = 'chat';
  }
  refreshActivity();
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
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 24px;
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.8) inset;
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
  border: 1px solid rgba(255, 255, 255, 0.2);
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
  background: rgba(255, 255, 255, 0.8);
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
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
  padding: 8px;
  border-radius: 50%;
  transition: background 0.2s;
  color: #666;
  margin-left: 4px;
}

.icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #333;
}

.view-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(249, 250, 251, 0.5);
}

/* Chat Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  word-wrap: break-word;
}

.chat-message.agent .message-content {
  background: white;
  color: #1f2937;
  border-bottom-left-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

.chat-message.user .message-content {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border-bottom-right-radius: 4px;
}

.thought-bubble {
  background: rgba(99, 102, 241, 0.05);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: #4b5563;
  margin-bottom: 8px;
  font-style: italic;
  border-left: 3px solid #8b5cf6;
}

/* Input Area */
.chat-input-area {
  padding: 16px;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  gap: 10px;
  align-items: center;
}

.chat-input-area input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  padding: 12px 16px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  background: #f9fafb;
  color: #111827;
  caret-color: #111827;
}

.chat-input-area input::placeholder {
  color: rgba(17, 24, 39, 0.55);
}

.chat-input-area input:focus {
  border-color: #8b5cf6;
  background: white;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}

.send-btn,
.voice-btn {
  background: #f3f4f6;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: #6b7280;
  font-size: 16px;
}

.send-btn:hover:not(:disabled),
.voice-btn:hover {
  background: #e5e7eb;
  color: #4b5563;
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
  background: #9ca3af;
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

.avatar-large {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  border-radius: 50%;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
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
  color: #1f2937;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
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
  background: #fee2e2;
  color: #ef4444;
}

.logout-btn:hover {
  background: #fecaca;
}

.back-btn {
  background: transparent;
  color: #6b7280;
}

.back-btn:hover {
  background: #f3f4f6;
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
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
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
</style>

@media (max-width: 768px) { .chat-window { position: fixed !important; bottom: 0 !important; left: 0
!important; right: 0 !important; top: auto !important; transform: none !important; width: 100vw
!important; height: 50vh !important; max-height: none !important; margin: 0 !important;
border-radius: 24px 24px 0 0 !important; z-index: 100000 !important; } .chat-window.top,
.chat-window.bottom { bottom: 0 !important; top: auto !important; transform: none !important; } }
