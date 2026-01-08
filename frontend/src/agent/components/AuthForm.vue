<template>
  <div class="auth-form">
    <h3 class="auth-title">邮箱验证码登录</h3>
    <p class="auth-subtitle">统一使用 /login（QQ SMTP 验证码）</p>

    <button class="submit-btn nth-login-btn" type="button" @click="goLogin">前往登录</button>
  </div>
</template>

<script lang="ts">
export default {};
</script>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useLoginModel } from '@/stores';

defineProps<{
  mode: 'login' | 'register';
}>();

const route = useRoute();
const loginStore = useLoginModel();

const goLogin = () => {
  loginStore.open({ mode: 'login', returnTo: String(route.fullPath || '').trim() });
};
</script>

<style scoped>
.auth-form {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: rgba(226, 232, 240, 0.92);
}

.auth-title {
  margin: 0;
  font-size: 24px;
  color: rgba(226, 232, 240, 0.98);
  text-align: center;
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.95), rgba(139, 92, 246, 0.95));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.auth-subtitle {
  margin: 0;
  font-size: 14px;
  color: rgba(226, 232, 240, 0.7);
  text-align: center;
  margin-bottom: 8px;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box; /* Fix width overflow */
  background: rgba(2, 6, 23, 0.25);
  color: rgba(226, 232, 240, 0.95);
}

.form-group input::placeholder {
  color: rgba(226, 232, 240, 0.55);
}

.form-group input:focus {
  border-color: rgba(56, 189, 248, 0.7);
}

.submit-btn {
  background: transparent;
  color: rgba(226, 232, 240, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 12px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}
</style>
