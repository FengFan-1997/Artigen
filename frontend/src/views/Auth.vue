<template>
  <div class="auth-container">
    <div class="auth-card">
      <h2>Redirecting…</h2>
      <p class="subtitle">Use unified email-code login at /login</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLoginModel } from '@/stores';

const router = useRouter();
const route = useRoute();
const loginStore = useLoginModel();

onMounted(() => {
  const redirect = String(route.query.redirect || '').trim();
  loginStore.open({ mode: 'login', returnTo: redirect || router.currentRoute.value.fullPath });
  router.replace(redirect || '/');
});
</script>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #0f172a;
  color: #fff;
}

.auth-card {
  background: #1e293b;
  padding: 2.5rem;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  border: 1px solid #334155;
}

h2 {
  text-align: center;
  margin-bottom: 0.5rem;
  font-size: 1.8rem;
  background: linear-gradient(135deg, #60a5fa, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  text-align: center;
  color: #94a3b8;
  margin-bottom: 2rem;
  font-size: 0.9rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  color: #cbd5e1;
  font-size: 0.9rem;
}

input {
  width: 100%;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #334155;
  background: #0f172a;
  color: #fff;
  font-size: 1rem;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
}

.auth-btn {
  width: 100%;
  padding: 0.8rem;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  font-weight: bold;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.auth-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.auth-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.toggle-mode {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.9rem;
  color: #94a3b8;
}

.toggle-mode span {
  color: #60a5fa;
  cursor: pointer;
  text-decoration: underline;
}

.error-msg {
  margin-top: 1rem;
  color: #ef4444;
  text-align: center;
  font-size: 0.9rem;
  background: rgba(239, 68, 68, 0.1);
  padding: 0.5rem;
  border-radius: 4px;
}
</style>
