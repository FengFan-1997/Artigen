<template>
  <div class="login-page">
    <transition name="top-tip-fade">
      <div v-if="topTipOpen" class="top-tip">{{ topTipText }}</div>
    </transition>
    <LanguageSwitcher />
    <div class="card">
      <!-- Left Side Image Panel -->
      <div class="panel-side">
        <div class="side-content">
          <div class="side-logo">Artigen</div>
          <div class="side-text">
            <h2>Welcome Back</h2>
            <p>Sign in to continue your creative journey.</p>
          </div>
        </div>
      </div>

      <!-- Right Side Form Panel -->
      <div class="panel-main">
        <div class="head">
          <div class="title">{{ titleText }}</div>
          <button
            class="close"
            type="button"
            :aria-label="currentLang === 'zh' ? '关闭登录页面' : 'Close login page'"
            @click="close"
          >
            ×
          </button>
        </div>

        <div class="body">
          <div v-if="loginMethod === 'select'" class="method-list">
            <div class="sub">{{ subText }}</div>
            <div class="oauth-block">
              <button
                v-if="!googleButtonReady"
                class="nth-login-btn method google-fallback-btn"
                type="button"
                :disabled="googleLoading || googleSdkLoading"
                :aria-busy="googleSdkLoading"
                @click="retryGoogleLogin"
              >
                <span class="google-mark" aria-hidden="true">G</span>
                <span>{{ t('login.method_google') }}</span>
                <span v-if="googleSdkLoading" class="google-spinner" aria-hidden="true"></span>
              </button>
              <div
                v-show="googleButtonReady"
                ref="googleButtonRef"
                class="google-btn"
                :class="{ disabled: googleLoading }"
              ></div>
              <div v-if="googleStatusText" class="google-network-note">
                {{ googleStatusText }}
              </div>
            </div>
            <button class="nth-login-btn method" type="button" @click="goMethod('email')">
              <span class="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="20"
                  height="20"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                </svg>
              </span>
              <span>{{ t('login.method_email') }}</span>
            </button>
            <button class="nth-login-btn method" type="button" @click="goMethod('password')">
              <span class="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="20"
                  height="20"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </span>
              <span>{{ t('login.method_password') }}</span>
            </button>
          </div>

          <div v-else-if="loginMethod === 'email'">
            <div class="sub">{{ subText }}</div>
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

            <TurnstileWidget
              ref="turnstileRef"
              v-model="turnstileToken"
              :action="EMAIL_OTP_TURNSTILE_ACTION"
            />

            <button
              class="nth-login-btn primary"
              :disabled="
                sending || !email || cooldownLeft > 0 || (turnstileRequired && !turnstileToken)
              "
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

          <div v-else-if="loginMethod === 'password'">
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
              <input
                v-model="password"
                class="control"
                type="password"
                :placeholder="t('login.password_placeholder')"
                autocomplete="current-password"
                @keyup.enter="loginWithPasswordSubmit"
              />
            </div>

            <button
              class="nth-login-btn primary"
              :disabled="loggingIn || !username || !password"
              type="button"
              @click="loginWithPasswordSubmit"
            >
              {{ loggingIn ? t('login.verifying') : t('login.login_btn') }}
            </button>
          </div>

          <div v-else class="oauth-block">
            <div class="sub">{{ subText }}</div>
            <button
              v-if="!googleButtonReady"
              class="nth-login-btn method google-fallback-btn"
              type="button"
              :disabled="googleLoading || googleSdkLoading"
              :aria-busy="googleSdkLoading"
              @click="retryGoogleLogin"
            >
              <span class="google-mark" aria-hidden="true">G</span>
              <span>{{ t('login.method_google') }}</span>
              <span v-if="googleSdkLoading" class="google-spinner" aria-hidden="true"></span>
            </button>
            <div
              v-show="googleButtonReady"
              ref="googleButtonRef"
              class="google-btn"
              :class="{ disabled: googleLoading }"
            ></div>
            <div v-if="googleStatusText" class="google-network-note">
              {{ googleStatusText }}
            </div>
          </div>

          <div v-if="error" class="hint error">{{ error }}</div>
          <div v-else class="hint">{{ hintText }}</div>

          <div class="row">
            <router-link
              v-if="loginMethod !== 'select'"
              class="link-btn"
              to="/login"
              @click.prevent="backToMethods"
            >
              {{ t('login.back_to_methods') }}
            </router-link>
          </div>

          <!-- Footer for bottom space -->
          <div class="footer-links">
            <span class="footer-text">
              {{ currentLang === 'zh' ? '继续即表示你同意' : 'By continuing, you accept our' }}
              <router-link class="footer-link" to="/legal/terms">{{
                t('login.terms_of_use')
              }}</router-link>
              {{ currentLang === 'zh' ? '及' : 'and' }}
              <router-link class="footer-link" to="/legal/privacy">{{
                t('login.privacy_policy')
              }}</router-link>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  resolveGoogleClientId,
  loginWithGoogleIdToken,
  loginWithPassword,
  sendLoginCode
} from '../api';
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
import LanguageSwitcher from '../components/LanguageSwitcher.vue';
import TurnstileWidget from '../components/TurnstileWidget.vue';
import { loadGoogleIdentityScript, resetGoogleIdentityScript } from '../googleIdentity';
import {
  beginOtpSend,
  completeOtpSend,
  failOtpSend,
  getOtpCooldownSeconds,
  readOtpFlow
} from '../otpFlow';
import { EMAIL_OTP_TURNSTILE_ACTION, isTurnstileConfigured } from '../turnstile';

const languageStore = useLanguageStore();
const { t } = languageStore;
const currentLang = computed(() => languageStore.currentLang);
const route = useRoute();
const router = useRouter();
const restoredLoginFlow = readOtpFlow('login');
const email = ref(restoredLoginFlow?.email || getLastEmail());
const username = ref(getLastUsername());
const password = ref(username.value ? getSavedPassword(username.value) : '');
const sending = ref(false);
const loggingIn = ref(false);
const error = ref('');
const cooldownLeft = ref(getOtpCooldownSeconds(restoredLoginFlow));
let timer: number | null = null;
const topTipOpen = ref(false);
const topTipText = ref('');
let topTipTimer: number | null = null;
const googleClientId = ref('');
const googleButtonRef = ref<HTMLDivElement | null>(null);
const googleLoading = ref(false);
const googleConfigResolved = ref(false);
const googleButtonReady = ref(false);
const googleSdkLoading = ref(false);
const googleSdkFailed = ref(false);
const turnstileToken = ref('');
const turnstileRequired = isTurnstileConfigured();
const turnstileRef = ref<{ reset: () => void } | null>(null);

const loadGoogleClientId = async () => {
  if (googleClientId.value) return googleClientId.value;
  try {
    const cid = await resolveGoogleClientId();
    if (cid) googleClientId.value = cid;
  } catch {
  } finally {
    googleConfigResolved.value = true;
  }
  return googleClientId.value;
};

const googleStatusText = computed(() => {
  if (googleConfigResolved.value && !googleClientId.value) return t('login.google_not_configured');
  if (googleSdkFailed.value) return t('login.google_load_failed');
  return '';
});

const close = () => {
  router.push('/');
};

const redirectTarget = computed(() => String(route.query.redirect || '').trim());
const loginMethod = ref<'select' | 'google' | 'email' | 'password'>('select');

const titleText = computed(() => {
  if (loginMethod.value === 'select') return t('login.choose_method_title');
  return t('login.title');
});

const subText = computed(() => {
  if (loginMethod.value === 'select') return t('login.choose_method_sub');
  if (loginMethod.value === 'google') return t('login.google_sub');
  if (loginMethod.value === 'password') return t('login.password_login_sub');
  return t('login.sub');
});

const hintText = computed(() => {
  if (loginMethod.value === 'select') {
    return t('login.choose_method_hint');
  }
  if (loginMethod.value === 'google') return t('login.google_hint');
  return t('login.hint');
});

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

const showTopTip = (msg: string) => {
  topTipText.value = msg;
  topTipOpen.value = true;
  if (topTipTimer) window.clearTimeout(topTipTimer);
  topTipTimer = window.setTimeout(() => {
    topTipOpen.value = false;
  }, 3000);
};

const sendCode = async () => {
  if (
    sending.value ||
    loggingIn.value ||
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
  setLastEmail(e);
  sending.value = true;
  const previous = readOtpFlow('login');
  const attempt = beginOtpSend('login', e, {
    forceNew:
      previous?.email === e &&
      previous.deliveryStatus === 'unknown' &&
      getOtpCooldownSeconds(previous) === 0
  });
  try {
    const res = await sendLoginCode(e, {
      idempotencyKey: attempt.idempotencyKey,
      turnstileToken: turnstileToken.value
    });
    if (!res.ok) {
      failOtpSend('login', attempt.idempotencyKey, { cooldownSec: res.cooldownSec });
      error.value = res.message;
      turnstileRef.value?.reset();
      if (res.cooldownSec) startCooldown(res.cooldownSec);
      return;
    }
    completeOtpSend('login', {
      email: e,
      idempotencyKey: attempt.idempotencyKey,
      challengeId: res.challengeId,
      deliveryStatus: res.deliveryStatus,
      cooldownSec: res.cooldownSec
    });
    turnstileRef.value?.reset();
    startCooldown(res.cooldownSec);
    const redirect = redirectTarget.value;
    router.push({
      path: '/login/verify',
      query: { ...(redirect ? { redirect } : {}) }
    });
  } catch (e: any) {
    turnstileRef.value?.reset();
    error.value = typeof e?.message === 'string' ? e.message : t('login.failed');
  } finally {
    sending.value = false;
  }
};

const loginWithPasswordSubmit = async () => {
  if (loggingIn.value || sending.value) return;
  error.value = '';
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
    setLoggedIn({ userId: res.userId });
    const redirect = redirectTarget.value;
    router.replace(redirect || '/login/account');
  } catch (e: any) {
    error.value = typeof e?.message === 'string' ? e.message : t('login.failed');
  } finally {
    loggingIn.value = false;
  }
};

const renderGoogleButton = () => {
  const g = (window as any).google;
  if (!g?.accounts?.id || !googleButtonRef.value) return false;
  googleButtonRef.value.innerHTML = '';
  g.accounts.id.initialize({
    client_id: googleClientId.value,
    callback: async (resp: any) => {
      error.value = '';
      const idToken = String(resp?.credential || '').trim();
      if (!idToken) {
        error.value = t('login.google_failed');
        return;
      }
      googleLoading.value = true;
      try {
        const res = await loginWithGoogleIdToken(idToken);
        if (!res.ok) {
          error.value = res.message;
          return;
        }
        if (res.email) {
          setLastEmail(res.email);
          upsertUser({ email: res.email, userId: res.userId });
        }
        setLoggedIn({ userId: res.userId });
        const redirect = redirectTarget.value;
        router.replace(redirect || '/login/account');
      } catch (e: any) {
        error.value = typeof e?.message === 'string' ? e.message : t('login.failed');
      } finally {
        googleLoading.value = false;
      }
    }
  });
  g.accounts.id.renderButton(googleButtonRef.value, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    width: googleButtonRef.value.clientWidth || 420,
    text: 'continue_with'
  });
  googleButtonReady.value = true;
  return true;
};

const retryGoogleLogin = async () => {
  error.value = '';
  const cid = await loadGoogleClientId();
  if (!cid) {
    error.value = t('login.google_not_configured');
    return;
  }
  resetGoogleIdentityScript();
  googleButtonReady.value = false;
  await ensureGoogleReady(true);
  if (googleSdkFailed.value) showTopTip(t('login.google_load_failed'));
};

const setMethod = (method: 'google' | 'email' | 'password' | 'select') => {
  loginMethod.value = method;
  try {
    if (method === 'select') window.sessionStorage.removeItem('login_entry');
    else window.sessionStorage.setItem('login_entry', method);
  } catch {}
};

const goMethod = (method: 'google' | 'email' | 'password') => {
  setMethod(method);
};

const backToMethods = () => {
  setMethod('select');
};

const ensureGoogleReady = async (forceRetry = false) => {
  if (loginMethod.value !== 'google' && loginMethod.value !== 'select') return;
  const cid = await loadGoogleClientId();
  if (!cid) {
    return;
  }
  if (forceRetry) resetGoogleIdentityScript();
  googleSdkLoading.value = true;
  googleSdkFailed.value = false;
  googleButtonReady.value = false;
  try {
    await loadGoogleIdentityScript();
    await nextTick();
    if (!renderGoogleButton()) throw new Error('GOOGLE_SCRIPT_FAILED');
  } catch (err) {
    console.error('Failed to load Google script', err);
    googleSdkFailed.value = true;
    resetGoogleIdentityScript();
  } finally {
    googleSdkLoading.value = false;
  }
};

onMounted(() => {
  ensureGuestUserId();
  let entry = '';
  try {
    entry = String(window.sessionStorage.getItem('login_entry') || '')
      .trim()
      .toLowerCase();
  } catch {}
  if (entry === 'google' || entry === 'email' || entry === 'password') {
    loginMethod.value = entry;
  }
  const restoredCooldown = getOtpCooldownSeconds(readOtpFlow('login'));
  if (restoredCooldown > 0) startCooldown(restoredCooldown);
  void ensureGoogleReady();
});

watch(
  () => loginMethod.value,
  () => {
    error.value = '';
    if (loginMethod.value === 'password') {
      const saved = getSavedPassword(String(username.value || '').trim());
      if (!password.value && saved) password.value = saved;
    }
    void ensureGoogleReady();
  }
);

watch(
  () => String(username.value || '').trim(),
  (u) => {
    if (!u) return;
    if (password.value) return;
    const saved = getSavedPassword(u);
    if (saved) password.value = saved;
  }
);

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
  if (topTipTimer) window.clearTimeout(topTipTimer);
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
  display: flex;
  width: min(900px, 95vw);
  height: min(600px, 90vh);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.95);
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  overflow: hidden;
}

.panel-side {
  flex: 1;
  background: url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop')
    center/cover no-repeat;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 40px;
  position: relative;
}

.panel-side::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent 60%);
}

.side-content {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.side-logo {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #fff;
}

.side-text h2 {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 10px;
  color: #fff;
}

.side-text p {
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 16px;
}

.panel-main {
  width: 450px;
  display: flex;
  flex-direction: column;
  background: #18181b;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32px 32px 0;
}

.title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}

.close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.body {
  padding: 24px 32px 32px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.sub {
  color: #94a3b8;
  font-size: 16px;
  margin-bottom: 24px;
}

.method-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nth-login-btn.method {
  position: relative;
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #dadce0;
  border-radius: 999px;
  color: #3c4043;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.nth-login-btn.method:hover {
  background: #f7f8f8;
  box-shadow:
    0 1px 2px 0 rgba(60, 64, 67, 0.3),
    0 1px 3px 1px rgba(60, 64, 67, 0.15);
}

.nth-login-btn.method .icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.icon {
  font-size: 16px;
}

.field {
  margin-bottom: 16px;
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
  height: 56px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.3);
  color: #f1f5f9;
  outline: none;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 16px;
  transition: all 0.2s;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.control:focus {
  border-color: rgba(204, 255, 0, 0.6);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.12);
}

.nth-login-btn.primary {
  width: 100%;
  height: 56px;
  padding: 0 20px;
  border-radius: 8px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: #f1f5f9;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 16px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nth-login-btn.primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(204, 255, 0, 0.2), transparent);
  transition: left 0.5s;
}

.nth-login-btn.primary:hover {
  border-color: var(--primary, #ccff00);
  color: var(--primary, #ccff00);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.15);
}

.nth-login-btn.primary:hover::before {
  left: 100%;
}

.nth-login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  margin-top: 16px;
  font-size: 13px;
  color: #64748b;
  text-align: center;
}

.hint.error {
  color: #fca5a5;
}

.oauth-block {
  margin-top: 20px;
}

.google-btn {
  display: flex;
  justify-content: center;
  width: 100%;
}

.google-btn.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.google-fallback-btn {
  position: relative;
  justify-content: center;
  gap: 10px;
  background: #fff;
  border-color: rgba(255, 255, 255, 0.82);
  color: #3c4043;
}

.google-fallback-btn:hover {
  background: #f8fafc;
  border-color: #fff;
  color: #202124;
}

.google-mark {
  font-size: 18px;
  font-weight: 800;
  background: conic-gradient(from -45deg, #4285f4 0 25%, #34a853 0 50%, #fbbc05 0 75%, #ea4335 0);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.google-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(60, 64, 67, 0.22);
  border-top-color: #4285f4;
  border-radius: 50%;
  animation: google-spin 0.8s linear infinite;
}

.google-network-note {
  margin-top: 8px;
  color: #fbbf24;
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}

@keyframes google-spin {
  to {
    transform: rotate(360deg);
  }
}

.row {
  margin-top: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;
  text-decoration: none;
}

.link-btn:hover {
  color: #ccff00;
}

.footer-links {
  margin-top: auto;
  padding-top: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 11px;
  color: #64748b;
}

.footer-text {
  color: #64748b;
  margin-bottom: 5px;
}

.footer-link {
  color: #94a3b8;
  text-decoration: none;
  font-weight: 600;
  margin: 0 2px;
  transition: color 0.2s;
}

.footer-link:hover {
  color: #ccff00;
}

@media (max-width: 768px) {
  .card {
    flex-direction: column;
    height: auto;
    max-height: 90vh;
  }

  .panel-side {
    display: none;
  }

  .panel-main {
    width: 100%;
  }
}
</style>
