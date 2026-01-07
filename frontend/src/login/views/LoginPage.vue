<template>
  <div class="login-page">
    <LanguageSwitcher />
    <div class="card">
      <div class="title">{{ t('login.title') }}</div>
      <div class="sub">{{ t('login.sub') }}</div>

      <div class="field">
        <div class="label">{{ t('login.email_label') }}</div>
        <input
          v-model.trim="email"
          class="control"
          type="email"
          :placeholder="t('login.email_placeholder')"
          autocomplete="email"
        />
      </div>

      <button
        class="btn primary"
        :disabled="sending || !email || cooldownLeft > 0"
        type="button"
        @click="sendCode"
      >
        {{
          cooldownLeft > 0
            ? t('login.resend_wait', { s: cooldownLeft })
            : sending
              ? t('login.sending')
              : t('login.send_code')
        }}
      </button>

      <div v-if="error" class="hint error">{{ error }}</div>
      <div v-else class="hint">{{ t('login.hint') }}</div>

      <div class="row">
        <router-link class="link" to="/">{{ t('login.back') }}</router-link>
        <router-link v-if="isLoggedIn" class="link" to="/login/account">{{
          t('login.account_title')
        }}</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { sendLoginCode } from '../api';
import { getLastEmail, setLastEmail } from '../storage';
import { isLocalLoggedIn } from '../session';
import { useLanguageStore } from '@/stores/language';
import LanguageSwitcher from '../components/LanguageSwitcher.vue';

const { t } = useLanguageStore();
const router = useRouter();
const email = ref(getLastEmail());
const sending = ref(false);
const error = ref('');
const cooldownLeft = ref(0);
let timer: number | null = null;

const isLoggedIn = computed(() => isLocalLoggedIn());

const startCooldown = (sec: number) => {
  cooldownLeft.value = Math.max(0, Math.floor(sec));
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(() => {
    cooldownLeft.value = Math.max(0, cooldownLeft.value - 1);
    if (cooldownLeft.value <= 0 && timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }, 1000);
};

const sendCode = async () => {
  error.value = '';
  if (!email.value) return;
  setLastEmail(email.value);
  sending.value = true;
  try {
    const res = await sendLoginCode(email.value);
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    startCooldown(res.cooldownSec);
    router.push({ path: '/login/verify', query: { email: email.value } });
  } catch (e: any) {
    error.value = typeof e?.message === 'string' ? e.message : t('login.failed');
  } finally {
    sending.value = false;
  }
};

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 10%, rgba(204, 255, 0, 0.08), transparent 40%),
    radial-gradient(circle at 80% 30%, rgba(147, 51, 234, 0.12), transparent 45%), #050505;
  color: #f1f5f9;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    Segoe UI,
    Roboto,
    Arial,
    sans-serif;
}

.card {
  width: min(520px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.9);
  box-shadow:
    0 0 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 22px;
}

.title {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}

.sub {
  color: #94a3b8;
  font-size: 13px;
  margin-bottom: 18px;
}

.field {
  margin-bottom: 14px;
}

.label {
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.control {
  width: 100%;
  padding: 12px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.45);
  color: #f1f5f9;
  outline: none;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  transition: all 0.2s;
}

.control:focus {
  border-color: rgba(204, 255, 0, 0.6);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.12);
}

.btn {
  width: 100%;
  border-radius: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.4);
  color: #f1f5f9;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.primary {
  border-color: rgba(204, 255, 0, 0.45);
  background: rgba(204, 255, 0, 0.14);
  color: #ccff00;
}

.btn.primary:hover:not(:disabled) {
  background: rgba(204, 255, 0, 0.22);
  border-color: rgba(204, 255, 0, 0.8);
}

.hint {
  margin-top: 12px;
  font-size: 12px;
  color: #64748b;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
}

.hint.error {
  color: #fca5a5;
}

.row {
  margin-top: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.link {
  color: #94a3b8;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  text-decoration: none;
}

.link:hover {
  color: #ccff00;
}
</style>
