<template>
  <div class="auth-form">
    <h3 class="auth-title">{{ isLogin ? 'Welcome Back!' : 'Join Us' }}</h3>
    <p class="auth-subtitle">
      {{ isLogin ? 'Login to sync your memory' : 'Create an account to get started' }}
    </p>

    <div class="form-group">
      <input
        v-model="username"
        type="text"
        placeholder="Username"
        :disabled="isLoading"
        @keyup.enter="handleSubmit"
      />
    </div>

    <div class="form-group">
      <input
        v-model="password"
        type="password"
        placeholder="Password"
        :disabled="isLoading"
        @keyup.enter="handleSubmit"
      />
    </div>

    <div v-if="!isLogin" class="form-group">
      <input
        v-model="name"
        type="text"
        placeholder="Display Name (Optional)"
        :disabled="isLoading"
        @keyup.enter="handleSubmit"
      />
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <button class="submit-btn" @click="handleSubmit" :disabled="isLoading || !isValid">
      <span v-if="isLoading" class="spinner">↻</span>
      {{ isLogin ? 'Login' : 'Register' }}
    </button>

    <div class="auth-footer">
      <span v-if="isLogin">
        New here? <a href="#" @click.prevent="$emit('switch-mode', 'register')">Create account</a>
      </span>
      <span v-else>
        Already have an account?
        <a href="#" @click.prevent="$emit('switch-mode', 'login')">Login</a>
      </span>
    </div>
  </div>
</template>

<script lang="ts">
export default {};
</script>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuth } from '../composables/useAuth';

const props = defineProps<{
  mode: 'login' | 'register';
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'switch-mode', mode: 'login' | 'register'): void;
}>();

const { login, register, isLoading, error: authError } = useAuth();

const username = ref('');
const password = ref('');
const name = ref('');

const isLogin = computed(() => props.mode === 'login');
const isValid = computed(() => {
  return username.value.trim().length > 0 && password.value.trim().length > 0;
});

const error = computed(() => authError.value);

const handleSubmit = async () => {
  if (!isValid.value || isLoading.value) return;

  try {
    if (isLogin.value) {
      await login(username.value, password.value);
    } else {
      await register(username.value, password.value, name.value);
    }
    emit('success');
  } catch (e) {
    // Error is handled by useAuth and exposed via authError
  }
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
  background: rgba(56, 189, 248, 0.95);
  color: rgba(2, 6, 23, 0.95);
  border: none;
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

.submit-btn:disabled {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(226, 232, 240, 0.55);
  cursor: not-allowed;
}

.submit-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 1);
}

.error-message {
  color: rgba(254, 202, 202, 0.95);
  font-size: 12px;
  text-align: center;
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.25);
  padding: 8px;
  border-radius: 4px;
}

.auth-footer {
  text-align: center;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.65);
}

.auth-footer a {
  color: rgba(56, 189, 248, 0.95);
  text-decoration: none;
  font-weight: 600;
}

.auth-footer a:hover {
  text-decoration: underline;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
