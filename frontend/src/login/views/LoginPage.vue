<template>
  <div class="login-page">
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
          <button class="close" type="button" @click="close">×</button>
        </div>

        <div class="body">
          <div v-if="loginMethod === 'select'" class="method-list">
            <div class="sub">{{ subText }}</div>
            <button class="nth-login-btn method" type="button" @click="goMethod('google')">
              <i class="fa-brands fa-google icon"></i>
              <span>{{ t('login.method_google') }}</span>
            </button>
            <button class="nth-login-btn method" type="button" @click="goMethod('email')">
              <i class="fa-regular fa-envelope icon"></i>
              <span>{{ t('login.method_email') }}</span>
            </button>
            <button class="nth-login-btn method" type="button" @click="goMethod('password')">
              <i class="fa-solid fa-lock icon"></i>
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

            <button
              class="nth-login-btn primary"
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
            <div
              ref="googleButtonRef"
              class="google-btn"
              :class="{ disabled: googleLoading }"
            ></div>
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
              By continuing, you accept our
              <a href="#" class="footer-link">Terms of Service</a>
              and
              <a href="#" class="footer-link">Privacy Policy</a>
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
  fetchGoogleClientId,
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

const { t } = useLanguageStore();
const route = useRoute();
const router = useRouter();
const email = ref(getLastEmail());
const username = ref(getLastUsername());
const password = ref(username.value ? getSavedPassword(username.value) : '');
const sending = ref(false);
const loggingIn = ref(false);
const error = ref('');
const cooldownLeft = ref(0);
let timer: number | null = null;
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
  if (loginMethod.value === 'select') return t('login.choose_method_hint');
  if (loginMethod.value === 'google') return t('login.google_hint');
  return t('login.hint');
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

const sendCode = async () => {
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
  try {
    const res = await sendLoginCode(e);
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    startCooldown(res.cooldownSec);
    const redirect = redirectTarget.value;
    router.push({
      path: '/login/verify',
      query: { email: e, ...(redirect ? { redirect } : {}) }
    });
  } catch (e: any) {
    error.value = typeof e?.message === 'string' ? e.message : t('login.failed');
  } finally {
    sending.value = false;
  }
};

const loginWithPasswordSubmit = async () => {
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
    setLoggedIn({ userId: res.userId, token: res.token });
    const redirect = redirectTarget.value;
    router.replace(redirect || '/login/account');
  } catch (e: any) {
    error.value = typeof e?.message === 'string' ? e.message : t('login.failed');
  } finally {
    loggingIn.value = false;
  }
};

const loadGoogleScript = () => {
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const g = (window as any).google;
    if (g?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GOOGLE_SCRIPT_FAILED')), {
        once: true
      });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GOOGLE_SCRIPT_FAILED'));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
};

const renderGoogleButton = () => {
  const g = (window as any).google;
  if (!g?.accounts?.id || !googleButtonRef.value) return;
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
        setLoggedIn({ userId: res.userId, token: res.token });
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
    width: 420,
    text: 'continue_with'
  });
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

const ensureGoogleReady = async () => {
  if (loginMethod.value !== 'google') return;
  const cid = await loadGoogleClientId();
  if (!cid) {
    error.value = t('login.google_not_configured');
    return;
  }
  loadGoogleScript()
    .then(async () => {
      await nextTick();
      renderGoogleButton();
    })
    .catch(() => {
      error.value = t('login.google_load_failed');
    });
};

onMounted(() => {
  ensureGuestUserId();
  const entry = String(window.sessionStorage.getItem('login_entry') || '')
    .trim()
    .toLowerCase();
  if (entry === 'google' || entry === 'email' || entry === 'password') {
    loginMethod.value = entry;
  }
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
  width: 100%;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: 24px;
  gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 20px;
  font-weight: 500;
  transition: all 0.2s;
}

.nth-login-btn.method:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
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
  border: 1px solid #ccff00;
  background: #ccff00;
  color: #000;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 16px;
}

.nth-login-btn.primary:hover {
  background: #b3e600;
  border-color: #b3e600;
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
