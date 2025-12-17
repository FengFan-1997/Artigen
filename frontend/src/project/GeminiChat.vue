<template>
  <div class="page-container">
    <div class="chat-container">
      <header class="header">
        <h1 class="title">Gemini Chat</h1>
        <router-link to="/portfolio-home" class="back-link">
          <i class="fas fa-arrow-left"></i> Back
        </router-link>
      </header>

      <div class="messages" ref="messagesContainer">
        <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
          <div class="message-content">
            <div class="avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
            <div class="text" v-html="formatMessage(msg.text)"></div>
          </div>
        </div>
        <div v-if="isLoading" class="message ai">
          <div class="message-content">
            <div class="avatar">🤖</div>
            <div class="text loading">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="input-area">
        <textarea
          v-model="userInput"
          @keydown.enter.prevent="sendMessage"
          placeholder="Ask me anything..."
          rows="1"
          ref="textarea"
        ></textarea>
        <button @click="sendMessage" :disabled="isLoading || !userInput.trim()">Send</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { generateContent } from '../services/aiService';

const userInput = ref('');
const messages = ref<{ role: 'user' | 'ai'; text: string }[]>([
  { role: 'ai', text: 'Hello! I am Gemini. How can I help you today?' }
]);
const isLoading = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);

const formatMessage = (text: string) => {
  // Simple line break handling
  return text.replace(/\n/g, '<br>');
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

const sendMessage = async () => {
  if (!userInput.value.trim() || isLoading.value) return;

  const text = userInput.value;
  messages.value.push({ role: 'user', text });
  userInput.value = '';
  isLoading.value = true;
  scrollToBottom();

  const response = await generateContent(text);

  if (response.error) {
    messages.value.push({ role: 'ai', text: `Error: ${response.error}` });
  } else {
    messages.value.push({ role: 'ai', text: response.text });
  }

  isLoading.value = false;
  scrollToBottom();
};
</script>

<style scoped>
.page-container {
  min-height: 100vh;
  background-color: #050505;
  color: #f1f5f9;
  display: flex;
  justify-content: center;
  padding: 40px 20px;
  padding-left: 100px; /* Avoid sidebar overlap */
  font-family: 'Helvetica Neue', 'Inter', sans-serif;
  box-sizing: border-box;
}

.chat-container {
  width: 100%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  height: 85vh;
  position: relative;
}

.header {
  padding: 24px 32px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0a0a0a;
  z-index: 10;
}

.title {
  margin: 0;
  font-family: 'Times New Roman', serif;
  font-style: italic;
  font-size: 2rem;
  font-weight: 400;
  color: #fff;
  letter-spacing: 0.02em;
}

.back-link {
  color: #666;
  text-decoration: none;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.back-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  background: #0a0a0a;
}

.message {
  display: flex;
  max-width: 80%;
  opacity: 0;
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.user {
  align-self: flex-end;
}

.message.ai {
  align-self: flex-start;
}

.message-content {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.message.user .message-content {
  flex-direction: row-reverse;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.text {
  line-height: 1.6;
  font-size: 1.05rem;
  font-weight: 300;
  color: #d4d4d4;
  padding-top: 6px;
}

.message.user .text {
  color: #fff;
  background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
  padding: 16px 24px;
  border-radius: 12px;
  border-top-right-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.message.ai .text {
  color: #e0e0e0;
  background: rgba(255, 255, 255, 0.03);
  padding: 16px 24px;
  border-radius: 12px;
  border-top-left-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.input-area {
  padding: 24px 32px;
  background: #0a0a0a;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 16px;
  align-items: flex-end;
  position: relative;
  z-index: 10;
}

textarea {
  flex: 1;
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  padding: 16px;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 300;
  resize: none;
  min-height: 24px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

textarea:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.3);
  background: #161616;
  box-shadow:
    inset 0 2px 4px rgba(0, 0, 0, 0.3),
    0 0 0 2px rgba(255, 255, 255, 0.05);
}

button {
  background: #fff;
  color: #000;
  border: none;
  padding: 0 28px;
  height: 56px; /* Match textarea visual height approx */
  border-radius: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
}

button:hover:not(:disabled) {
  background: #e5e5e5;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 255, 255, 0.2);
}

button:disabled {
  background: #222;
  color: #555;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.loading {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
}

.dot {
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
  animation: pulse-dot 1.4s infinite ease-in-out both;
}

.dot:nth-child(1) {
  animation-delay: -0.32s;
}
.dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes pulse-dot {
  0%,
  80%,
  100% {
    transform: scale(0);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (max-width: 979px) {
  .page-container {
    padding: 0;
    padding-left: 0;
    height: 100dvh;
    min-height: 100dvh;
    align-items: stretch;
  }

  .chat-container {
    height: 100%;
    border-radius: 0;
    border: none;
    max-width: none;
  }

  .header {
    padding: 16px 20px;
    background: rgba(10, 10, 10, 0.95);
    backdrop-filter: blur(10px);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  .title {
    font-size: 1.5rem;
  }

  .messages {
    padding: 80px 16px 100px 16px; /* Top padding for header, bottom for input */
  }

  .message {
    max-width: 90%;
  }

  .message.user .text,
  .message.ai .text {
    padding: 12px 16px;
    font-size: 1rem;
  }

  .input-area {
    padding: 16px;
    background: rgba(10, 10, 10, 0.95);
    backdrop-filter: blur(10px);
    padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
  }

  button {
    padding: 0 20px;
    font-size: 0.8rem;
  }
}
</style>
