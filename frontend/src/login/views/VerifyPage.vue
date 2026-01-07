<template>
  <div class="login-page">
    <LanguageSwitcher />
    <div class="card">
      <div class="title">{{ t('login.verify_title') }}</div>
      <div class="sub">{{ t('login.verify_subtitle', { email: emailDisplay }) }}</div>

      <div class="field">
        <div class="label">{{ t('login.code_label') }}</div>
        <input
          v-model.trim="code"
          class="control"
          inputmode="numeric"
          maxlength="6"
          :placeholder="t('login.code_placeholder')"
          autocomplete="one-time-code"
          @keyup.enter="verify"
        />
      </div>

      <button
        class="btn primary"
        :disabled="verifying || !email || code.length < 4"
        type="button"
        @click="verify"
      >
        {{ verifying ? t('login.verifying') : t('login.verify_btn') }}
      </button>

      <div v-if="error" class="hint error">{{ error }}</div>
      <div v-else class="hint">{{ t('login.verify_hint') }}</div>

      <div class="row">
        <router-link class="link" to="/login">{{ t('login.back_to_resend') }}</router-link>
        <router-link v-if="isLoggedIn" class="link" to="/login/account">{{
          t('login.account_title')
        }}</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { verifyLoginCode } from '../api';
import { getLastEmail, setLastEmail, upsertUser } from '../storage';
import { ensureGuestUserId, isLocalLoggedIn, setLoggedIn } from '../session';
import { useLanguageStore } from '@/stores/language';
import LanguageSwitcher from '../components/LanguageSwitcher.vue';

const { t } = useLanguageStore();

ensureGuestUserId();

const route = useRoute();
const router = useRouter();

const email = ref(
  String(route.query.email || '')
    .trim()
    .toLowerCase() || getLastEmail()
);
const code = ref('');
const verifying = ref(false);
const error = ref('');

const emailDisplay = computed(() => email.value || '');
const isLoggedIn = computed(() => isLocalLoggedIn());

const verify = async () => {
  error.value = '';
  const e = email.value.trim().toLowerCase();
  if (!e) {
    error.value = t('login.enter_email');
    return;
  }
  const c = code.value.trim();
  if (!c) {
    error.value = t('login.enter_code');
    return;
  }

  verifying.value = true;
  try {
    const res = await verifyLoginCode(e, c);
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    setLastEmail(e);
    upsertUser({ email: e, userId: res.userId });
    setLoggedIn({ userId: res.userId });
    router.push('/login/account');
  } catch (err: any) {
    error.value = typeof err?.message === 'string' ? err.message : t('login.failed');
  } finally {
    verifying.value = false;
  }
};
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
