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
    isShow: false,
    isLogin: false
  }),
  actions: {
    setIsShow(show: boolean, login: boolean) {
      this.isShow = show;
      this.isLogin = login;
    }
  }
});
