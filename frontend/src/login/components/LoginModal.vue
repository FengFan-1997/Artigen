<template>
  <Teleport to="body">
    <div v-if="isOpen" class="login-modal" @mousedown.self="onBackdrop">
      <div class="panel" role="dialog" aria-modal="true">
        <div class="head">
          <div class="title">{{ titleText }}</div>
          <button class="close" type="button" @click="close">×</button>
        </div>

        <div class="body">
          <div v-if="mode === 'login'" class="step">
            <div class="sub">{{ subText }}</div>

            <div class="field">
              <div class="label">{{ t('login.username_label') }}</div>
              <input
                v-model.trim="username"
                class="control"
                type="text"
                :placeholder="t('login.username_placeholder')"
                autocomplete="username"
              />
            </div>

            <div class="field">
              <div class="label">{{ t('login.password_label') }}</div>
              <div class="password-hint">{{ t('login.password_hint') }}</div>
              <input
                v-model="password"
                class="control"
                type="password"
                :placeholder="t('login.password_placeholder')"
                autocomplete="current-password"
                @keyup.enter="login"
              />
            </div>

            <button
              class="nth-login-btn primary"
              :disabled="loggingIn || !username || !password"
              type="button"
              @click="login"
            >
              {{ loggingIn ? t('login.verifying') : t('login.login_btn') }}
            </button>

            <div class="hint" :class="{ error: !!error }">
              {{ error || info }}
            </div>

            <div class="row">
              <button class="link-btn" type="button" @click="goResetPassword">
                {{ t('login.forgot_password') }}
              </button>
              <button class="link-btn" type="button" @click="toggleMode">
                {{ toggleModeText }}
              </button>
            </div>
          </div>

          <div v-else class="step">
            <div class="sub">{{ subText }}</div>

            <div class="field">
              <div class="label">{{ t('login.username_label') }}</div>
              <input
                v-model.trim="username"
                class="control"
                type="text"
                :placeholder="t('login.username_placeholder')"
                autocomplete="username"
              />
            </div>

            <div class="field">
              <div class="label">{{ t('login.password_label') }}</div>
              <div class="password-hint">{{ t('login.password_hint') }}</div>
              <input
                v-model="password"
                class="control"
                type="password"
                :placeholder="t('login.password_placeholder')"
                autocomplete="new-password"
              />
            </div>

            <div class="field">
              <div class="label">{{ t('login.email_label') }}</div>
              <input
                v-model.trim="emailLocal"
                class="control"
                type="email"
                :placeholder="t('login.email_placeholder')"
                autocomplete="email"
              />
            </div>

            <div class="grid">
              <div class="field">
                <div class="label">{{ t('login.code_label') }}</div>
                <input
                  v-model.trim="code"
                  class="control"
                  inputmode="numeric"
                  maxlength="6"
                  :placeholder="t('login.code_placeholder')"
                  autocomplete="one-time-code"
                  @keyup.enter="register"
                />
              </div>

              <button
                class="nth-login-btn"
                :disabled="sending || !emailLocal || cooldownLeft > 0"
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
            </div>

            <button
              class="nth-login-btn primary"
              :disabled="registering || !username || !password || !emailLocal || code.length < 6"
              type="button"
              @click="register"
            >
              {{ registering ? t('login.verifying') : t('login.register_btn') }}
            </button>

            <div class="hint" :class="{ error: !!error }">
              {{ error || info }}
            </div>

            <div class="row">
              <button class="link-btn" type="button" @click="close">{{ t('login.back') }}</button>
              <button class="link-btn" type="button" @click="toggleMode">
                {{ toggleModeText }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useLoginModel } from '@/stores';
import { loginWithPassword, registerWithEmailCode, sendLoginCode } from '../api';
import {
  getLastEmail,
  getLastUsername,
  getSavedPassword,
  setLastEmail,
  setLastUsername,
  setSavedPassword,
  upsertUser
} from '../storage';
import { ensureGuestUserId, setLoggedIn } from '../session';
import { useLanguageStore } from '@/stores/language';
import { useRouter } from 'vue-router';

const languageStore = useLanguageStore();
const { t } = languageStore;

const loginStore = useLoginModel();
const { isOpen, mode, email } = storeToRefs(loginStore);
const router = useRouter();

ensureGuestUserId();

const goResetPassword = () => {
  close();
  router.push('/login/reset');
};

const emailLocal = ref(getLastEmail());
const username = ref('');
const password = ref('');
const code = ref('');
const sending = ref(false);
const loggingIn = ref(false);
const registering = ref(false);
const error = ref('');
const info = ref('');
const cooldownLeft = ref(0);
let timer: number | null = null;

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;
    const nextEmail = String(email.value || emailLocal.value || '')
      .trim()
      .toLowerCase();
    emailLocal.value = nextEmail || getLastEmail();
    code.value = '';
    const lastU = getLastUsername();
    username.value = lastU;
    password.value = lastU ? getSavedPassword(lastU) : '';
    error.value = '';
    info.value = '';
    cooldownLeft.value = 0;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }
);

watch(
  () => String(username.value || '').trim(),
  (u) => {
    if (!isOpen.value) return;
    if (password.value) return;
    if (!u) return;
    const saved = getSavedPassword(u);
    if (saved) password.value = saved;
  }
);

const titleText = computed(() =>
  mode.value === 'register' ? t('login.register') : t('login.login')
);
const toggleModeText = computed(() =>
  mode.value === 'register' ? t('login.switch_to_login') : t('login.switch_to_register')
);
const subText = computed(() =>
  mode.value === 'register' ? t('login.register_sub') : t('login.password_login_sub')
);

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

const isPasswordValidForRegister = (pw: string) => {
  const p = String(pw || '');
  if (p.length < 8 || p.length > 128) return false;
  if (!/[a-z]/.test(p)) return false;
  if (!/[A-Z]/.test(p)) return false;
  if (!/\d/.test(p)) return false;
  return true;
};

const close = () => {
  const to = String((loginStore as any).returnTo || '').trim();
  loginStore.close();
  if (to && router.currentRoute.value.fullPath !== to) {
    try {
      router.push(to);
    } catch {}
  }
};

const onBackdrop = () => {
  close();
};

const toggleMode = () => {
  loginStore.setMode(mode.value === 'register' ? 'login' : 'register');
};

const sendCode = async () => {
  error.value = '';
  info.value = '';
  const e = String(emailLocal.value || '')
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
  setLastEmail(e);
  loginStore.setEmail(e);
  sending.value = true;
  try {
    const res = await sendLoginCode(e);
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    info.value = res.message || t('login.success');
    startCooldown(res.cooldownSec);
  } catch (err: any) {
    error.value = typeof err?.message === 'string' ? err.message : t('login.failed');
  } finally {
    sending.value = false;
  }
};

const login = async () => {
  error.value = '';
  info.value = '';
  const u = String(username.value || '').trim();
  const p = String(password.value || '');
  if (!u || !p) return;
  loggingIn.value = true;
  try {
    const res = await loginWithPassword(u, p);
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    setLastUsername(u);
    setSavedPassword(u, p);
    setLoggedIn({ userId: res.userId, token: res.token });
    try {
      window.dispatchEvent(new CustomEvent('app-auth-changed'));
    } catch {}
    close();
    await loginStore.runAfterLogin();
  } catch (err: any) {
    error.value = typeof err?.message === 'string' ? err.message : t('login.failed');
  } finally {
    loggingIn.value = false;
  }
};

const register = async () => {
  error.value = '';
  info.value = '';
  const u = String(username.value || '').trim();
  const p = String(password.value || '');
  const e = String(emailLocal.value || '')
    .trim()
    .toLowerCase();
  const c = String(code.value || '').trim();
  if (!u || !p || !e || !c) return;
  if (!isPasswordValidForRegister(p)) {
    error.value = t('login.password_rules_error');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    error.value = t('login.invalid_email');
    return;
  }
  if (!/^\d{6}$/.test(c)) {
    error.value = t('login.invalid_code');
    return;
  }
  registering.value = true;
  try {
    const res = await registerWithEmailCode({ username: u, password: p, email: e, code: c });
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    setLastUsername(u);
    setSavedPassword(u, p);
    setLastEmail(e);
    upsertUser({ email: e, userId: res.userId });
    setLoggedIn({ userId: res.userId, token: res.token });
    try {
      window.dispatchEvent(new CustomEvent('app-auth-changed'));
    } catch {}
    close();
    await loginStore.runAfterLogin();
  } catch (err: any) {
    error.value = typeof err?.message === 'string' ? err.message : t('login.failed');
  } finally {
    registering.value = false;
  }
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) close();
};

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.login-modal {
  position: fixed;
  inset: 0;
  z-index: 20000;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.panel {
  width: min(520px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.92);
  box-shadow:
    0 0 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 12px;
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

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 0 16px;
}

.title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.5px;
}

.close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.close:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.body {
  padding: 16px;
}

.sub {
  color: #94a3b8;
  font-size: 13px;
  margin-bottom: 16px;
}

.password-hint {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 8px;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
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
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.45);
  color: #f1f5f9;
  outline: none;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.control:focus {
  border-color: rgba(204, 255, 0, 0.6);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.12);
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
  gap: 12px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 14px;
}

.grid .field {
  margin-bottom: 0;
}

.grid .nth-login-btn {
  width: auto;
  padding: 12px 14px;
  white-space: nowrap;
  height: 44px;
}

.link-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.link-btn:hover {
  color: #ccff00;
}

.nth-login-btn {
  width: 100%;
}
</style>
