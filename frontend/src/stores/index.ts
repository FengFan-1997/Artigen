import { defineStore } from 'pinia';

export const useChatStore = defineStore('chat', {
  state: () => ({
    chatType: 'text'
  }),
  actions: {
    setChatType(type: string) {
      this.chatType = type;
    }
  }
});

export const useLoginModel = defineStore('login', {
  state: () => ({
    isOpen: false,
    mode: 'login' as 'login' | 'register',
    step: 'email' as 'email' | 'verify',
    email: '',
    returnTo: '' as string
  }),
  actions: {
    open(input?: {
      mode?: 'login' | 'register';
      email?: string;
      returnTo?: string;
      afterLogin?: (() => void | Promise<void>) | null;
    }) {
      this.mode = input?.mode || 'login';
      this.step = 'email';
      this.email = String(input?.email || '')
        .trim()
        .toLowerCase();
      this.returnTo = String(input?.returnTo || '').trim();
      (this as any)._afterLogin = typeof input?.afterLogin === 'function' ? input.afterLogin : null;
      this.isOpen = true;
    },
    close() {
      this.isOpen = false;
      this.step = 'email';
      (this as any)._afterLogin = null;
    },
    setMode(mode: 'login' | 'register') {
      this.mode = mode;
    },
    setStep(step: 'email' | 'verify') {
      this.step = step;
    },
    setEmail(email: string) {
      this.email = String(email || '')
        .trim()
        .toLowerCase();
    },
    async runAfterLogin() {
      const fn = (this as any)._afterLogin as null | (() => void | Promise<void>);
      (this as any)._afterLogin = null;
      if (!fn) return;
      await fn();
    }
  }
});
