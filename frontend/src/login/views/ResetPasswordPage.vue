<template>
  <div class="login-page">
    <LanguageSwitcher />
    <div class="card">
      <div class="title">{{ t('login.reset_title') }}</div>
      <div class="sub">{{ subText }}</div>

      <div class="field">
        <div class="label">{{ t('login.email_label') }}</div>
        <input
          v-model.trim="email"
          class="control"
          type="email"
          :disabled="step !== 'send'"
          :placeholder="t('login.email_placeholder')"
          autocomplete="email"
          @keyup.enter="step === 'send' ? sendCode() : resetPassword()"
        />
      </div>

      <template v-if="step === 'send'">
        <TurnstileWidget
          ref="turnstileRef"
          v-model="turnstileToken"
          :action="PASSWORD_RESET_TURNSTILE_ACTION"
        />
        <button
          class="nth-login-btn primary"
          :disabled="
            sending || !email || cooldownLeft > 0 || (turnstileRequired && !turnstileToken)
          "
          type="button"
          @click="sendCode()"
        >
          {{
            cooldownLeft > 0
              ? t('login.resend_wait', { s: cooldownLeft })
              : sending
                ? t('login.sending')
                : t('login.send_reset_code')
          }}
        </button>
      </template>

      <template v-else>
        <div class="field">
          <div class="label">{{ t('login.code_label') }}</div>
          <input
            v-model.trim="code"
            class="control"
            inputmode="numeric"
            maxlength="6"
            :placeholder="t('login.code_placeholder')"
            autocomplete="one-time-code"
            @keyup.enter="resetPassword"
          />
        </div>

        <div class="field">
          <div class="label">{{ t('login.new_password_label') }}</div>
          <input
            v-model="newPassword"
            class="control"
            type="password"
            :placeholder="t('login.password_placeholder')"
            autocomplete="new-password"
            @keyup.enter="resetPassword"
          />
        </div>

        <div class="field">
          <div class="label">{{ t('login.confirm_password_label') }}</div>
          <input
            v-model="confirmPassword"
            class="control"
            type="password"
            :placeholder="t('login.password_placeholder')"
            autocomplete="new-password"
            @keyup.enter="resetPassword"
          />
        </div>

        <div class="reset-resend">
          <TurnstileWidget
            v-if="cooldownLeft <= 0"
            ref="turnstileRef"
            v-model="turnstileToken"
            :action="PASSWORD_RESET_TURNSTILE_ACTION"
          />
          <button
            class="nth-login-btn reset-resend-btn"
            :disabled="
              sending ||
              cooldownLeft > 0 ||
              (turnstileRequired && !turnstileToken)
            "
            type="button"
            @click="resendCode"
          >
            {{
              cooldownLeft > 0
                ? t('login.resend_wait', { s: cooldownLeft })
                : sending
                  ? t('login.sending')
                  : t('login.send_reset_code')
            }}
          </button>
        </div>

        <button
          class="nth-login-btn primary"
          :disabled="
            resetting ||
            sending ||
            !email ||
            code.length < 6 ||
            !newPassword ||
            !confirmPassword
          "
          type="button"
          @click="resetPassword"
        >
          {{ resetting ? t('login.resetting') : t('login.reset_btn') }}
        </button>
      </template>

      <div v-if="error" class="hint error">{{ error }}</div>
      <div v-else class="hint">
        {{
          deliveryUnknown
            ? isZh
              ? '邮件可能已提交发送；若收到验证码可继续重置，否则请稍后重发。'
              : 'The email may have been submitted. Use the code if it arrives, or resend later.'
            : t('login.reset_hint')
        }}
      </div>

      <div class="row">
        <router-link class="link" to="/login">{{ t('login.back_to_login') }}</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { resetPasswordWithCode, sendPasswordResetCode } from '../api';
import { getLastEmail, setLastEmail } from '../storage';
import { useLanguageStore } from '@/stores/language';
import LanguageSwitcher from '../components/LanguageSwitcher.vue';
import TurnstileWidget from '../components/TurnstileWidget.vue';
import {
  beginOtpSend,
  clearOtpFlow,
  completeOtpSend,
  failOtpSend,
  getOtpCooldownSeconds,
  readOtpFlow
} from '../otpFlow';
import {
  isTurnstileConfigured,
  PASSWORD_RESET_TURNSTILE_ACTION
} from '../turnstile';

const languageStore = useLanguageStore();
const { t } = languageStore;
const router = useRouter();

const restoredResetFlow = readOtpFlow('password-reset');
const email = ref(restoredResetFlow?.email || getLastEmail());
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const step = ref<'send' | 'reset'>(
  restoredResetFlow?.deliveryStatus === 'accepted' ||
    restoredResetFlow?.deliveryStatus === 'unknown'
    ? 'reset'
    : 'send'
);

const sending = ref(false);
const resetting = ref(false);
const error = ref('');
const deliveryUnknown = ref(restoredResetFlow?.deliveryStatus === 'unknown');

const cooldownLeft = ref(getOtpCooldownSeconds(restoredResetFlow));
let timer: number | null = null;
const turnstileToken = ref('');
const turnstileRequired = isTurnstileConfigured();
const turnstileRef = ref<{ reset: () => void } | null>(null);

const subText = computed(() =>
  step.value === 'send'
    ? t('login.reset_sub')
    : t('login.reset_sub_sent', {
        email: String(email.value || '')
          .trim()
          .toLowerCase()
      })
);
const isZh = computed(() => String(languageStore.currentLang || 'zh').startsWith('zh'));

const startCooldown = (sec: number) => {
  const seconds = Math.max(0, Math.floor(Number(sec) || 0));
  cooldownLeft.value = seconds;
  if (timer) window.clearInterval(timer);
  timer = null;
  if (!seconds) return;
  const deadline = Date.now() + seconds * 1000;
  timer = window.setInterval(() => {
    cooldownLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (cooldownLeft.value <= 0 && timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }, 1000);
};

const sendCode = async (options: { forceNew?: boolean } = {}) => {
  if (
    sending.value ||
    resetting.value ||
    cooldownLeft.value > 0 ||
    (turnstileRequired && !turnstileToken.value)
  ) {
    return;
  }
  error.value = '';
  const e = String(email.value || '')
    .trim()
    .toLowerCase();
  if (!e) {
    error.value = t('login.enter_email');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    error.value = t('login.invalid_email');
    return;
  }
  email.value = e;
  sending.value = true;
  const attempt = beginOtpSend('password-reset', e, {
    forceNew: Boolean(options.forceNew)
  });
  try {
    const res = await sendPasswordResetCode(e, {
      idempotencyKey: attempt.idempotencyKey,
      turnstileToken: turnstileToken.value
    });
    if (!res.ok) {
      failOtpSend('password-reset', attempt.idempotencyKey, {
        cooldownSec: res.cooldownSec
      });
      error.value = res.message;
      turnstileRef.value?.reset();
      if (res.cooldownSec) startCooldown(res.cooldownSec);
      return;
    }
    completeOtpSend('password-reset', {
      email: e,
      idempotencyKey: attempt.idempotencyKey,
      challengeId: res.challengeId,
      deliveryStatus: res.deliveryStatus,
      cooldownSec: res.cooldownSec
    });
    turnstileRef.value?.reset();
    deliveryUnknown.value = res.deliveryStatus === 'unknown';
    setLastEmail(e);
    startCooldown(res.cooldownSec);
    step.value = 'reset';
  } catch (err: any) {
    turnstileRef.value?.reset();
    error.value = typeof err?.message === 'string' ? err.message : t('login.reset_failed');
  } finally {
    sending.value = false;
  }
};

const resendCode = () => sendCode({ forceNew: true });

const validatePasswordRules = (pw: string) => {
  if (!pw) return false;
  if (pw.length < 8 || pw.length > 128) return false;
  if (!/[a-z]/.test(pw)) return false;
  if (!/[A-Z]/.test(pw)) return false;
  if (!/\d/.test(pw)) return false;
  return true;
};

const resetPassword = async () => {
  if (resetting.value || sending.value) return;
  error.value = '';
  const e = String(email.value || '')
    .trim()
    .toLowerCase();
  if (!e) {
    error.value = t('login.enter_email');
    return;
  }
  const c = String(code.value || '').trim();
  if (!/^\d{6}$/.test(c)) {
    error.value = t('login.invalid_code');
    return;
  }
  const p1 = String(newPassword.value || '');
  const p2 = String(confirmPassword.value || '');
  if (!p1 || !p2) return;
  if (p1 !== p2) {
    error.value = t('login.password_mismatch');
    return;
  }
  if (!validatePasswordRules(p1)) {
    error.value = t('login.password_rules_error');
    return;
  }

  resetting.value = true;
  try {
    const res = await resetPasswordWithCode({ email: e, code: c, newPassword: p1 });
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    setLastEmail(e);
    clearOtpFlow('password-reset');
    router.replace('/login');
  } catch (err: any) {
    error.value = typeof err?.message === 'string' ? err.message : t('login.reset_failed');
  } finally {
    resetting.value = false;
  }
};

onMounted(() => {
  const restoredCooldown = getOtpCooldownSeconds(readOtpFlow('password-reset'));
  if (restoredCooldown > 0) startCooldown(restoredCooldown);
});

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

.control:disabled {
  opacity: 0.7;
}

.nth-login-btn {
  width: 100%;
  height: 48px;
  border-radius: 8px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: #f1f5f9;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.nth-login-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(204, 255, 0, 0.2), transparent);
  transition: left 0.5s;
}

.nth-login-btn:hover {
  border-color: var(--primary, #ccff00);
  color: var(--primary, #ccff00);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.15);
}

.nth-login-btn:hover::before {
  left: 100%;
}

.nth-login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.05);
}

.reset-resend {
  margin-bottom: 12px;
}

.reset-resend-btn {
  min-height: 44px;
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
  justify-content: flex-start;
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
