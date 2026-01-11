<template>
  <header ref="headerRef" class="header">
    <router-link to="/artigen" class="logo">
      <span class="logo-text">Artigen</span>
    </router-link>

    <button class="nav-toggle" type="button" @click="isMobileMenuOpen = !isMobileMenuOpen">
      ≡
    </button>

    <nav class="nav-links">
      <router-link
        to="/artigen/format-factory"
        class="nav-item"
        :class="{ active: activeKey === 'format' }"
      >
        {{ ui.navFormatFactory }}
      </router-link>
      <router-link to="/artigen/ai" class="nav-item" :class="{ active: activeKey === 'ai' }">
        {{ ui.navAiWorkshop }}
      </router-link>
      <router-link
        to="/artigen/market"
        class="nav-item"
        :class="{ active: activeKey === 'market' }"
      >
        {{ ui.navMarket }}
      </router-link>
    </nav>

    <div class="header-right">
      <div
        ref="langContainerRef"
        class="lang-container"
        :class="{ 'mobile-hide': hideLangOnMobile }"
        @click="isLangMenuOpen = !isLangMenuOpen"
      >
        <button class="lang-switch" type="button">
          <span class="globe-icon">🌐</span>
          <span class="lang-label">{{ langLabel }}</span>
          <span class="arrow" :class="{ open: isLangMenuOpen }">⌄</span>
        </button>
        <transition name="dropdown-fade">
          <div v-if="isLangMenuOpen" class="lang-dropdown">
            <div
              class="lang-option"
              :class="{ active: currentLang === 'zh' }"
              @click.stop="selectLanguage('zh')"
            >
              ZH · 中文
            </div>
            <div
              class="lang-option"
              :class="{ active: currentLang === 'en' }"
              @click.stop="selectLanguage('en')"
            >
              EN · English
            </div>
          </div>
        </transition>
      </div>

      <slot name="actions"></slot>

      <button v-if="!hideAuth" class="login-btn nth-login-btn" type="button" @click="goLogin">
        {{ loginText }}
      </button>
    </div>
  </header>

  <transition name="dropdown-fade">
    <div v-if="isMobileMenuOpen" ref="mobileMenuRef" class="mobile-menu">
      <router-link
        to="/artigen/ai"
        class="mobile-item"
        :class="{ active: activeKey === 'ai' }"
        @click="isMobileMenuOpen = false"
      >
        {{ ui.navAiWorkshop }}
      </router-link>
      <router-link
        to="/artigen/format-factory"
        class="mobile-item"
        :class="{ active: activeKey === 'format' }"
        @click="isMobileMenuOpen = false"
      >
        {{ ui.navFormatFactory }}
      </router-link>
      <router-link
        to="/artigen/market"
        class="mobile-item"
        :class="{ active: activeKey === 'market' }"
        @click="isMobileMenuOpen = false"
      >
        {{ ui.navMarket }}
      </router-link>
    </div>
  </transition>

  <AccountPopup />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import AccountPopup from './AccountPopup.vue';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { isLocalLoggedIn } from '@/login/session';

defineProps<{
  hideAuth?: boolean;
  hideLangOnMobile?: boolean;
}>();

const router = useRouter();
const route = useRoute();

const headerRef = ref<HTMLElement | null>(null);
const mobileMenuRef = ref<HTMLElement | null>(null);

const isLangMenuOpen = ref(false);
const langContainerRef = ref<HTMLElement | null>(null);
const isMobileMenuOpen = ref(false);

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const loginStore = useLoginModel();

const authTick = ref(0);
const isAuthed = computed(() => {
  return authTick.value >= 0 && isLocalLoggedIn();
});

const handleAuthChanged = () => {
  authTick.value++;
};

const onDocMouseDown = (e: MouseEvent) => {
  const target = e.target;
  if (!(target instanceof Node)) return;
  if (isLangMenuOpen.value) {
    const el = langContainerRef.value;
    if (el && el.contains(target)) return;
    isLangMenuOpen.value = false;
  }
  if (isMobileMenuOpen.value) {
    const h = headerRef.value;
    if (h && h.contains(target)) return;
    const m = mobileMenuRef.value;
    if (m && m.contains(target)) return;
    isMobileMenuOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown);
  window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown);
  window.removeEventListener('app-auth-changed', handleAuthChanged as EventListener);
});

const selectLanguage = (lang: 'zh' | 'en') => {
  languageStore.setLanguage(lang);
  isLangMenuOpen.value = false;
};

const langLabel = computed(() => (currentLang.value === 'zh' ? 'ZH' : 'EN'));

const ui = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      navFormatFactory: '格式工厂',
      navAiWorkshop: 'AI工坊',
      navMarket: '算力商城'
    };
  }
  return {
    navFormatFactory: 'Format Factory',
    navAiWorkshop: 'AI Workshop',
    navMarket: 'Compute Market'
  };
});

const activeKey = computed<'format' | 'ai' | 'market'>(() => {
  const p = String(route.path || '');
  if (p.startsWith('/artigen/format-factory')) return 'format';
  if (p.startsWith('/artigen/market')) return 'market';
  return 'ai';
});

const loginText = computed(() => {
  if (isAuthed.value) return currentLang.value === 'zh' ? '账号' : 'ACCOUNT';
  return currentLang.value === 'zh' ? '登录' : 'LOGIN';
});

const goLogin = () => {
  if (isAuthed.value) {
    try {
      window.dispatchEvent(new CustomEvent('app-account-popup-open'));
    } catch {}
    return;
  }
  const returnTo = router.currentRoute.value.fullPath;
  loginStore.open({ mode: 'login', returnTo });
};
</script>

<style scoped>
.header {
  height: 80px;
  display: flex;
  border-bottom: 1px solid var(--border-color);
  align-items: center;
  padding: 0 40px;
}

.logo {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.logo-text {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 24px;
  margin-right: 80px;
  color: var(--primary, #ccff00);
  letter-spacing: -1px;
}

.nav-links {
  display: flex;
  gap: 40px;
}

.nav-item {
  color: var(--text-muted, #94a3b8);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;
  position: relative;
  padding: 4px 0;
}

.nav-item::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 2px;
  background-color: var(--primary, #ccff00);
  transition: width 0.3s ease;
  box-shadow: 0 0 8px var(--primary, #ccff00);
}

.nav-item:hover,
.nav-item.active {
  color: var(--text-main, #f1f5f9);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.nav-item:hover::after,
.nav-item.active::after {
  width: 100%;
}

.header-right {
  display: flex;
  margin: 0 0 0 auto;
  gap: 24px;
  align-items: center;
}

.nav-toggle {
  display: none;
  background: transparent;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  color: var(--text-main, #f1f5f9);
  width: 36px;
  height: 34px;
  border-radius: 6px;
  font-size: 20px;
  line-height: 1;
  padding: 0;
}

.mobile-menu {
  display: none;
}

.mobile-item {
  display: block;
  padding: 14px 18px;
  text-decoration: none;
  color: var(--text-muted, #94a3b8);
  font-size: 14px;
  font-weight: 600;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  background: rgba(5, 5, 5, 0.9);
  text-align: left;
}

.mobile-item.active {
  color: var(--text-main, #f1f5f9);
}

.lang-container {
  position: relative;
  cursor: pointer;
}

.lang-switch {
  background: transparent;
  border: none;
  color: var(--text-muted, #94a3b8);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  line-height: 1;
  gap: 6px;
  transition: color 0.2s;
}

.globe-icon {
  line-height: 1;
}

.lang-label {
  font-family: 'JetBrains Mono', monospace;
}

.lang-switch:hover {
  color: var(--text-main, #f1f5f9);
}

.lang-switch .arrow {
  margin-top: -11px;
  display: inline-block;
}

.lang-switch .arrow.open {
  margin-top: 11px;
  transform: rotate(180deg);
}

.lang-dropdown {
  position: absolute;
  top: 120%;
  right: 0;
  width: 140px;
  background: rgba(10, 10, 10, 0.95);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(10px);
  padding: 8px 0;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.lang-option {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  transition: all 0.2s;
  font-family: 'JetBrains Mono', monospace;
}

.lang-option:hover {
  background: rgba(204, 255, 0, 0.1);
  color: var(--primary, #ccff00);
}

.lang-option.active {
  color: var(--primary, #ccff00);
  font-weight: 700;
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.login-btn {
  background: transparent;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  color: var(--text-main, #f1f5f9);
  padding: 8px 20px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  letter-spacing: 1px;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.login-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(204, 255, 0, 0.2), transparent);
  transition: left 0.5s;
}

.login-btn:hover {
  border-color: var(--primary, #ccff00);
  color: var(--primary, #ccff00);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.15);
}

.login-btn:hover::before {
  left: 100%;
}

@media (max-width: 720px) {
  .header {
    height: 64px;
    padding: 0 14px;
  }

  .logo-text {
    font-size: 18px;
    margin-right: 0;
  }

  .nav-toggle {
    margin-left: 10px;
  }

  .lang-container.mobile-hide {
    display: none;
  }

  .nav-links {
    display: none;
  }

  .header-right {
    gap: 12px;
  }

  .nav-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .lang-switch {
    font-size: 13px;
  }

  .login-btn {
    padding: 7px 14px;
    font-size: 13px;
    letter-spacing: 0.5px;
  }

  .mobile-menu {
    display: block;
    position: sticky;
    top: 0;
    z-index: 60;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    background: rgba(5, 5, 5, 0.92);
    backdrop-filter: blur(10px);
  }
}

@media (max-width: 360px) {
  .header-right {
    gap: 8px;
  }

  .globe-icon {
    display: none;
  }

  .nav-toggle {
    width: 34px;
  }

  .login-btn {
    padding: 7px 10px;
  }
}
</style>
