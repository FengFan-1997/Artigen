<template>
  <Teleport to="body">
    <transition name="top-tip-fade">
      <div v-if="topTipOpen" class="top-tip">{{ topTipText }}</div>
    </transition>
    <div v-if="isOpen" class="login-modal" @mousedown.self="onBackdrop">
      <div class="panel" role="dialog" aria-modal="true">
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
            <button class="close" type="button" @click="close">×</button>
          </div>

          <div class="body">
            <div v-if="entryStep === 'select'" class="step">
              <div class="sub">{{ subText }}</div>

              <div class="method-list">
                <div class="oauth-block">
                  <div
                    ref="googleButtonRef"
                    class="google-btn"
                    :class="{ disabled: googleLoading }"
                  ></div>
                </div>
                <div class="hint" :class="{ error: !!error }" v-if="error || info">
                  {{ error || info }}
                </div>
                <button class="nth-login-btn method" type="button" @click="chooseMethod('email')">
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
                <button
                  class="nth-login-btn method"
                  type="button"
                  @click="chooseMethod('password')"
                >
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
            </div>

            <div v-else-if="entryStep === 'google'" class="step">
              <div class="sub">{{ subText }}</div>

              <div class="oauth-block">
                <div
                  ref="googleButtonRef"
                  class="google-btn"
                  :class="{ disabled: googleLoading }"
                ></div>
              </div>

              <div class="hint" :class="{ error: !!error }">
                {{ error || info }}
              </div>

              <div class="row">
                <button class="link-btn" type="button" @click="backToMethods">
                  {{ t('login.back_to_methods') }}
                </button>
              </div>
            </div>

            <div v-else-if="entryStep === 'email_input'" class="step">
              <div class="sub">{{ subText }}</div>
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
              <div class="hint" :class="{ error: !!error }">
                {{ error || info }}
              </div>
              <button
                class="nth-login-btn primary"
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
              <div class="row">
                <button class="link-btn" type="button" @click="backToMethods">
                  {{ t('login.back_to_methods') }}
                </button>
              </div>
            </div>

            <div v-else-if="entryStep === 'email_verify'" class="step">
              <div class="sub">{{ subText }}</div>
              <div class="field">
                <div class="label">{{ t('login.code_label') }}</div>
                <input
                  v-model.trim="code"
                  class="control"
                  inputmode="numeric"
                  maxlength="6"
                  :placeholder="t('login.code_placeholder')"
                  autocomplete="one-time-code"
                  @keyup.enter="verifyCode"
                />
              </div>
              <div class="hint" :class="{ error: !!error }">
                {{ error || info }}
              </div>
              <button
                class="nth-login-btn primary"
                :disabled="loggingIn || !emailLocal || code.length < 6"
                type="button"
                @click="verifyCode"
              >
                {{ loggingIn ? t('login.verifying') : t('login.verify_btn') }}
              </button>
              <div class="row">
                <button class="link-btn" type="button" @click="entryStep = 'email_input'">
                  {{ t('login.back_to_resend') }}
                </button>
              </div>
            </div>

            <div v-else-if="mode === 'login'" class="step">
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
                <button class="link-btn" type="button" @click="backToMethods">
                  {{ t('login.back_to_methods') }}
                </button>
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
                <button class="link-btn" type="button" @click="backToMethods">
                  {{ t('login.back_to_methods') }}
                </button>
                <button class="link-btn" type="button" @click="toggleMode">
                  {{ toggleModeText }}
                </button>
              </div>
            </div>
          </div>

          <div class="footer-links">
            <span class="footer-text">
              By continuing, you accept our
              <router-link class="footer-link" to="/legal/terms" @click="close"
                >Terms of Service</router-link
              >
              and
              <router-link class="footer-link" to="/legal/privacy" @click="close"
                >Privacy Policy</router-link
              >
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useLoginModel } from '@/stores';
import {
  fetchGoogleClientId,
  loginWithGoogleIdToken,
  loginWithPassword,
  registerWithEmailCode,
  sendLoginCode,
  verifyLoginCode
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
import { useRouter } from 'vue-router';
import { buildApiUrl } from '@/utils/api';

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
const entryStep = ref<'select' | 'google' | 'password' | 'email_input' | 'email_verify'>('select');
const sending = ref(false);
const loggingIn = ref(false);
const registering = ref(false);
const error = ref('');
const info = ref('');
const topTipOpen = ref(false);
const topTipText = ref('');
const cooldownLeft = ref(0);
let timer: number | null = null;
let topTipTimer: number | null = null;
const googleClientId = ref(String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim());
const googleButtonRef = ref<HTMLDivElement | null>(null);
const googleLoading = ref(false);
let googleScriptPromise: Promise<void> | null = null;

const loadGoogleClientId = async () => {
  if (googleClientId.value) return googleClientId.value;
  try {
    const cid = await fetchGoogleClientId();
    if (cid) googleClientId.value = cid;
  } catch {}
  return googleClientId.value;
};

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;
    entryStep.value = 'select';
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
    error.value = '';
    info.value = '';
    void ensureGoogleReady();
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

const titleText = computed(() => {
  if (entryStep.value === 'select') return t('login.choose_method_title');
  if (entryStep.value === 'google') return t('login.title');
  if (entryStep.value === 'email_input') return t('login.method_email');
  if (entryStep.value === 'email_verify') return t('login.verify_title');
  return mode.value === 'register' ? t('login.register') : t('login.login');
});
const toggleModeText = computed(() =>
  mode.value === 'register' ? t('login.switch_to_login') : t('login.switch_to_register')
);
const subText = computed(() => {
  if (entryStep.value === 'select') return t('login.choose_method_sub');
  if (entryStep.value === 'google') return t('login.google_sub');
  if (entryStep.value === 'email_input') return t('login.sub');
  if (entryStep.value === 'email_verify')
    return t('login.verify_subtitle', { email: emailLocal.value });
  return mode.value === 'register' ? t('login.register_sub') : t('login.password_login_sub');
});

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

const showTopTip = (msg: string) => {
  topTipText.value = msg;
  topTipOpen.value = true;
  if (topTipTimer) window.clearTimeout(topTipTimer);
  topTipTimer = window.setTimeout(() => {
    topTipOpen.value = false;
  }, 3000);
};

const loadGoogleScript = () => {
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const g = (window as any).google;
    if (g?.accounts?.id) {
      resolve();
      return;
    }
    const resolveScriptUrl = (useProxy: boolean) => {
      if (!useProxy) return 'https://accounts.google.com/gsi/client';
      const proxyUrl = buildApiUrl('/api/proxy/google-gsi');
      return proxyUrl || 'https://accounts.google.com/gsi/client';
    };
    const appendScript = (useProxy: boolean) => {
      const script = document.createElement('script');
      script.src = resolveScriptUrl(useProxy);
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = '1';
      script.dataset.googleProxy = useProxy ? '1' : '0';
      script.onload = () => resolve();
      script.onerror = () => {
        if (useProxy) {
          script.remove();
          appendScript(false);
          return;
        }
        reject(new Error('GOOGLE_SCRIPT_FAILED'));
      };
      document.head.appendChild(script);
    };
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          const useProxy = (existing as HTMLScriptElement).dataset.googleProxy === '1';
          if (useProxy) {
            existing.remove();
            appendScript(false);
            return;
          }
          reject(new Error('GOOGLE_SCRIPT_FAILED'));
        },
        { once: true }
      );
      return;
    }
    appendScript(true);
  });
  return googleScriptPromise;
};

const initGoogleButton = () => {
  if (
    !googleClientId.value ||
    !isOpen.value ||
    (entryStep.value !== 'google' && entryStep.value !== 'select')
  )
    return;
  const el = googleButtonRef.value;
  if (!el) return;
  loadGoogleScript()
    .then(() => {
      const g = (window as any).google;
      if (!g?.accounts?.id) {
        showTopTip(t('login.google_load_failed'));
        return;
      }
      el.innerHTML = '';
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
            setLoggedIn({ userId: res.userId, token: res.token });
            try {
              window.dispatchEvent(new CustomEvent('app-auth-changed'));
            } catch {}
            close();
            await loginStore.runAfterLogin();
          } catch (e: any) {
            error.value = typeof e?.message === 'string' ? e.message : t('login.failed');
          } finally {
            googleLoading.value = false;
          }
        }
      });
      g.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: el.clientWidth || 360,
        text: 'continue_with'
      });
    })
    .catch((err) => {
      console.error('Failed to load Google script', err);
      showTopTip(t('login.google_load_failed'));
    });
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

const chooseMethod = async (method: 'google' | 'email' | 'password') => {
  error.value = '';
  info.value = '';
  if (method === 'email') {
    entryStep.value = 'email_input';
    return;
  }
  if (method === 'password') {
    entryStep.value = 'password';
    loginStore.setMode('login');
    return;
  }
  entryStep.value = 'select';
  await ensureGoogleReady(true);
};

const ensureGoogleReady = async (showError = false) => {
  if (!isOpen.value) return;
  if (entryStep.value !== 'google' && entryStep.value !== 'select') return;
  const cid = await loadGoogleClientId();
  if (!cid) {
    if (showError) error.value = t('login.google_not_configured');
    return;
  }
  await nextTick();
  initGoogleButton();
};

watch(
  () => entryStep.value,
  () => {
    void ensureGoogleReady();
  }
);

const backToMethods = () => {
  entryStep.value = 'select';
  error.value = '';
  info.value = '';
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
    // info.value = res.message || t('login.success');
    startCooldown(res.cooldownSec);
    entryStep.value = 'email_verify';
  } catch (err: any) {
    error.value = typeof err?.message === 'string' ? err.message : t('login.failed');
  } finally {
    sending.value = false;
  }
};

const verifyCode = async () => {
  error.value = '';
  const e = String(emailLocal.value || '')
    .trim()
    .toLowerCase();
  const c = String(code.value || '').trim();
  if (!e) return;
  if (!c) {
    error.value = t('login.enter_code');
    return;
  }
  loggingIn.value = true;
  try {
    const res = await verifyLoginCode(e, c);
    if (!res.ok) {
      error.value = res.message;
      return;
    }
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
    loggingIn.value = false;
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
  if (topTipTimer) window.clearTimeout(topTipTimer);
});
</script>

<style scoped>
/* Top Tip */
.top-tip {
  position: fixed;
  top: 74px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20001;
  max-width: min(680px, 92vw);
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  color: rgba(248, 113, 113, 0.95);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.2;
  letter-spacing: 0.2px;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-tip::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background: rgba(248, 113, 113, 0.95);
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.55);
  vertical-align: middle;
}

.top-tip-fade-enter-active,
.top-tip-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.top-tip-fade-enter-from,
.top-tip-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

.login-modal {
  position: fixed;
  inset: 0;
  z-index: 20000;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.panel {
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
  width: 400px;
  display: flex;
  flex-direction: column;
  background: #18181b;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
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
  padding: 0 24px 24px;
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
  border-color: #dadce0;
  color: #3c4043;
  box-shadow:
    0 1px 2px 0 rgba(60, 64, 67, 0.3),
    0 1px 3px 1px rgba(60, 64, 67, 0.15);
}

.nth-login-btn.method::before {
  display: none;
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

.password-hint {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 8px;
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
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

.row {
  margin-top: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
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

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;
}

.link-btn:hover {
  color: #ccff00;
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
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.06);
  color: #f1f5f9;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.nth-login-btn:hover::before {
  left: 100%;
}

.nth-login-btn.primary {
  width: 100%;
  height: 56px;
  background: #ccff00;
  color: #000;
  border-color: #ccff00;
  font-weight: 700;
  font-size: 16px;
  margin-top: 16px;
}

.nth-login-btn.primary:hover {
  background: #d6ff33;
  border-color: #d6ff33;
  color: #000;
  box-shadow:
    0 1px 2px 0 rgba(60, 64, 67, 0.3),
    0 1px 3px 1px rgba(60, 64, 67, 0.15);
}

.nth-login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.05);
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

@media (max-width: 768px) {
  .panel {
    flex-direction: column;
    height: auto;
    max-height: 90vh;
  }

  .panel-side {
    display: none; /* Hide image on mobile */
  }

  .panel-main {
    width: 100%;
  }
}
</style>
