import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { ChatMessage } from '../types';
import { readIntSetting } from '../utils/settings';
import { getUserId } from '../utils/user';

export const useAgentChatUi = (input: {
  isMobile: Ref<boolean>;
  agentSize: Ref<number>;
  x: Ref<number>;
  y: Ref<number>;
  markUserActivity: () => void;
  onOpen?: () => void;
  onClose?: () => void;
}) => {
  const MAX_UI_MESSAGES_KEY = 'agent_ui_max_messages';
  const CHAT_AUTO_CLOSE_MS_KEY = 'agent_chat_auto_close_ms';
  const chatMessagesKey = ref(`agent_ui_messages_v1_${getUserId()}`);

  const chatOpen = ref(false);
  const messages = ref<ChatMessage[]>([
    { role: 'agent', text: 'Hello! How can I help you today?' }
  ]);
  const maxUiMessages = ref(readIntSetting(MAX_UI_MESSAGES_KEY, 120, 20, 800));
  const chatAutoCloseMs = ref(readIntSetting(CHAT_AUTO_CLOSE_MS_KEY, 5000, 0, 600000));
  const lastChatActivityAt = ref(Date.now());
  let chatAutoCloseTimer: number | null = null;
  let persistTimer: number | null = null;

  const pushUiMessage = (msg: ChatMessage) => {
    messages.value.push(msg);
    const maxKeep = Math.max(20, Number(maxUiMessages.value) || 120);
    if (messages.value.length > maxKeep) {
      messages.value = messages.value.slice(-maxKeep);
    }
  };

  const loadMessagesFromStorage = () => {
    try {
      const raw = localStorage.getItem(chatMessagesKey.value);
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const maxKeep = Math.max(20, Number(maxUiMessages.value) || 120);
      const out: ChatMessage[] = [];
      for (const it of list) {
        const role = it?.role === 'user' ? 'user' : 'agent';
        const text = typeof it?.text === 'string' ? it.text.trim() : '';
        if (!text) continue;
        out.push({ role, text });
        if (out.length >= maxKeep) break;
      }
      messages.value = out.length
        ? out
        : [{ role: 'agent', text: 'Hello! How can I help you today?' }];
    } catch {
      messages.value = [{ role: 'agent', text: 'Hello! How can I help you today?' }];
    }
  };

  const persistMessagesThrottled = () => {
    if (persistTimer) return;
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      try {
        const maxKeep = Math.max(20, Number(maxUiMessages.value) || 120);
        localStorage.setItem(chatMessagesKey.value, JSON.stringify(messages.value.slice(-maxKeep)));
      } catch {}
    }, 250);
  };

  watch(
    () => messages.value,
    () => persistMessagesThrottled(),
    { deep: true }
  );

  const handleAuthChanged = () => {
    chatMessagesKey.value = `agent_ui_messages_v1_${getUserId()}`;
    loadMessagesFromStorage();
  };

  const scheduleChatAutoClose = (delayMs = chatAutoCloseMs.value, isLoading?: () => boolean) => {
    if (chatAutoCloseTimer) window.clearTimeout(chatAutoCloseTimer);
    chatAutoCloseTimer = window.setTimeout(
      () => {
        chatAutoCloseTimer = null;
        if (!chatOpen.value) return;
        const idleForMs = Date.now() - lastChatActivityAt.value;
        const closeMs = Math.max(0, Number(chatAutoCloseMs.value) || 5000);
        if (idleForMs < closeMs) {
          scheduleChatAutoClose(closeMs - idleForMs, isLoading);
          return;
        }
        if (typeof isLoading === 'function' && isLoading()) {
          scheduleChatAutoClose(1200, isLoading);
          return;
        }
        closeChat();
      },
      Math.max(200, delayMs)
    );
  };

  const handleChatActivity = (isLoading?: () => boolean) => {
    lastChatActivityAt.value = Date.now();
    input.markUserActivity();
    if (chatOpen.value) scheduleChatAutoClose(undefined, isLoading);
  };

  const openChat = (isLoading?: () => boolean) => {
    if (chatOpen.value) return;
    chatOpen.value = true;
    lastChatActivityAt.value = Date.now();
    input.markUserActivity();
    scheduleChatAutoClose(undefined, isLoading);
    if (input.isMobile.value) {
      const size = input.agentSize.value;
      input.x.value = (window.innerWidth - size) / 2;
      input.y.value = 40;
    }
    if (typeof input.onOpen === 'function') input.onOpen();
  };

  const closeChat = () => {
    if (!chatOpen.value) return;
    chatOpen.value = false;
    if (chatAutoCloseTimer) {
      window.clearTimeout(chatAutoCloseTimer);
      chatAutoCloseTimer = null;
    }
    if (typeof input.onClose === 'function') input.onClose();
  };

  const toggleChat = (isLoading?: () => boolean) => {
    if (chatOpen.value) closeChat();
    else openChat(isLoading);
  };

  onMounted(() => {
    chatMessagesKey.value = `agent_ui_messages_v1_${getUserId()}`;
    loadMessagesFromStorage();
    window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
  });

  onBeforeUnmount(() => {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = null;
    window.removeEventListener('app-auth-changed', handleAuthChanged as EventListener);
  });

  return {
    chatOpen,
    messages,
    maxUiMessages,
    chatAutoCloseMs,
    lastChatActivityAt,
    pushUiMessage,
    handleChatActivity,
    scheduleChatAutoClose,
    openChat,
    closeChat,
    toggleChat
  };
};
