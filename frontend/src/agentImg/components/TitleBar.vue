<template>
  <header ref="headerRef" class="header">
    <router-link to="/artigen" class="logo">
      <span class="logo-text">Artigen</span>
    </router-link>

    <button class="nav-toggle" type="button" @click="isMobileMenuOpen = !isMobileMenuOpen">
      ≡
    </button>

    <nav class="nav-links">
      <router-link to="/artigen" class="nav-item" :class="{ active: activeKey === 'home' }">
        {{ ui.navHome }}
      </router-link>
      <router-link to="/artigen/ai" class="nav-item" :class="{ active: activeKey === 'ai' }">
        {{ ui.navAiDesign }}
      </router-link>
      <router-link
        to="/artigen/format-factory"
        class="nav-item"
        :class="{ active: activeKey === 'format' }"
      >
        {{ ui.navFormatFactory }}
      </router-link>
      <router-link
        to="/artigen/image-workshop"
        class="nav-item"
        :class="{ active: activeKey === 'image' }"
      >
        {{ ui.navImageWorkshop }}
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

      <slot name="actions">
        <div v-if="!hideAuth" class="top-actions">
          <template v-if="isAuthed">
            <div ref="creditsContainerRef" class="credits-container">
              <button class="credits-btn" type="button" @click="toggleCreditsPopover">
                <span class="credits-icon">⚡</span>
                <span class="credits-value">{{ creditsText }}</span>
              </button>

              <transition name="dropdown-fade">
                <div v-if="creditsPopoverOpen" class="credits-popover" @click.stop>
                  <div class="credits-pop-head">
                    <div class="credits-pop-title">{{ ui.creditsBalance }}</div>
                    <div class="credits-pop-total">
                      {{ ui.totalCredits }}: {{ totalCreditsText }}
                    </div>
                  </div>
                  <div class="credits-pop-balance">
                    <span class="credits-pop-icon">⚡</span>
                    <span class="credits-pop-value">{{ creditsText }}</span>
                  </div>
                  <div class="credits-pop-actions">
                    <button
                      class="credits-pop-btn"
                      type="button"
                      @click="refreshCredits"
                      :disabled="creditsLoading"
                    >
                      {{ ui.refreshCredits }}
                    </button>
                    <button class="credits-pop-btn primary" type="button" @click="goMarket">
                      {{ ui.upgradeForMore }}
                    </button>
                  </div>
                </div>
              </transition>
            </div>
            <button class="avatar-btn" type="button" @click="openAccountPopup">
              <span class="avatar-text">{{ avatarText }}</span>
            </button>
          </template>
          <button v-else class="login-btn nth-login-btn" type="button" @click="goLogin">
            {{ loginText }}
          </button>
        </div>
      </slot>
    </div>
  </header>

  <transition name="dropdown-fade">
    <div v-if="isMobileMenuOpen" ref="mobileMenuRef" class="mobile-menu">
      <router-link
        to="/artigen"
        class="mobile-item"
        :class="{ active: activeKey === 'home' }"
        @click="isMobileMenuOpen = false"
      >
        {{ ui.navHome }}
      </router-link>
      <router-link
        to="/artigen/ai"
        class="mobile-item"
        :class="{ active: activeKey === 'ai' }"
        @click="isMobileMenuOpen = false"
      >
        {{ ui.navAiDesign }}
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
        to="/artigen/image-workshop"
        class="mobile-item"
        :class="{ active: activeKey === 'image' }"
        @click="isMobileMenuOpen = false"
      >
        {{ ui.navImageWorkshop }}
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import AccountPopup from './AccountPopup.vue';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import { getCreditsBalance, type CreditsBalance } from '@/points';

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
const creditsPopoverOpen = ref(false);
const creditsContainerRef = ref<HTMLElement | null>(null);

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

const creditsBalance = ref<CreditsBalance | null>(null);
const creditsLoading = ref(false);

const refreshCredits = async () => {
  if (!isAuthed.value) {
    creditsBalance.value = null;
    creditsLoading.value = false;
    return;
  }
  if (creditsLoading.value) return;
  creditsLoading.value = true;
  try {
    creditsBalance.value = await getCreditsBalance();
  } finally {
    creditsLoading.value = false;
  }
};

const onDocMouseDown = (e: MouseEvent) => {
  const target = e.target;
  if (!(target instanceof Node)) return;
  if (isLangMenuOpen.value) {
    const el = langContainerRef.value;
    if (el && el.contains(target)) return;
    isLangMenuOpen.value = false;
  }
  if (creditsPopoverOpen.value) {
    const el = creditsContainerRef.value;
    if (el && el.contains(target)) return;
    creditsPopoverOpen.value = false;
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
  void refreshCredits();
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
      navHome: '首页',
      navAiDesign: 'AI设计',
      navFormatFactory: '格式工厂',
      navImageWorkshop: 'AI影像工坊',
      navMarket: '算力商城',
      creditsBalance: 'Credit balance',
      totalCredits: 'Total credits',
      refreshCredits: '刷新点数',
      upgradeForMore: 'Upgrade for more'
    };
  }
  return {
    navHome: 'Home',
    navAiDesign: 'AI Design',
    navFormatFactory: 'Format Factory',
    navImageWorkshop: 'AI Image Workshop',
    navMarket: 'Compute Market',
    creditsBalance: 'Credit balance',
    totalCredits: 'Total credits',
    refreshCredits: 'Refresh credits',
    upgradeForMore: 'Upgrade for more'
  };
});

const activeKey = computed<'format' | 'ai' | 'market' | 'image' | 'home'>(() => {
  const p = String(route.path || '');
  if (p === '/artigen' || p === '/artigen/') return 'home';
  if (p.startsWith('/artigen/format-factory')) return 'format';
  if (p.startsWith('/artigen/market')) return 'market';
  if (p.startsWith('/artigen/image-workshop')) return 'image';
  if (p.startsWith('/artigen/ai')) return 'ai';
  return 'home';
});

const loginText = computed(() => {
  return currentLang.value === 'zh' ? '登录 / 注册' : 'LOGIN / SIGN UP';
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

const openAccountPopup = () => {
  try {
    window.dispatchEvent(new CustomEvent('app-account-popup-open'));
  } catch {}
};

const avatarText = computed(() => {
  const uid = String(getCurrentUserId() || '').trim();
  if (!uid) return '?';
  if (uid.startsWith('guest_')) return 'G';
  return uid.slice(0, 1).toUpperCase();
});

const creditsText = computed(() => {
  const bal = creditsBalance.value;
  if (!bal) return '--';
  return String(Number(bal.available ?? 0));
});

const totalCreditsText = computed(() => {
  const bal = creditsBalance.value;
  if (!bal) return '--';
  const a = Number(bal.available ?? 0) || 0;
  const f = Number(bal.frozen ?? 0) || 0;
  return String(a + f);
});

const goMarket = () => {
  creditsPopoverOpen.value = false;
  router.push('/artigen/market');
};

const toggleCreditsPopover = () => {
  creditsPopoverOpen.value = !creditsPopoverOpen.value;
  if (creditsPopoverOpen.value) void refreshCredits();
};

watch(
  () => isAuthed.value,
  () => void refreshCredits()
);
</script>

<style scoped>
.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
@media (max-width: 400px) {
  .top-actions {
    font-size: 13px;
  }
}
.credits-btn {
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(204, 255, 0, 0.28);
  background: rgba(204, 255, 0, 0.08);
  color: rgba(241, 245, 249, 0.95);
  font-family: var(--common-font);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.credits-btn:hover:not(:disabled) {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(204, 255, 0, 0.12);
}

.credits-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credits-icon {
  line-height: 1;
}

.credits-value {
  color: var(--primary, #ccff00);
  font-weight: 800;
}

.credits-container {
  position: relative;
  display: inline-flex;
}

.credits-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 280px;
  border-radius: 14px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  z-index: 30;
}

.credits-pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: rgba(241, 245, 249, 0.86);
  font-size: 12px;
}

.credits-pop-title {
  font-weight: 700;
}

.credits-pop-total {
  color: rgba(148, 163, 184, 0.95);
}

.credits-pop-balance {
  margin-top: 10px;
  border-radius: 12px;
  padding: 12px 12px;
  background: rgba(204, 255, 0, 0.08);
  border: 1px solid rgba(204, 255, 0, 0.18);
  display: flex;
  align-items: center;
  gap: 10px;
}

.credits-pop-icon {
  line-height: 1;
}

.credits-pop-value {
  color: rgba(241, 245, 249, 0.95);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.3px;
}

.credits-pop-actions {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.credits-pop-btn {
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(241, 245, 249, 0.92);
  font-family: var(--common-font);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.credits-pop-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.credits-pop-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credits-pop-btn.primary {
  border-color: rgba(204, 255, 0, 0.28);
  background: rgba(204, 255, 0, 0.1);
  color: rgba(241, 245, 249, 0.95);
}

.credits-pop-btn.primary:hover {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(204, 255, 0, 0.14);
}

.avatar-btn {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(204, 255, 0, 0.28);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.avatar-btn:hover {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(255, 255, 255, 0.06);
}

.avatar-text {
  font-family: var(--common-font);
  font-weight: 900;
  letter-spacing: 0.4px;
}

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
  font-family: var(--common-font);
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
  font-size: 18px;
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
  color: var(--primary, #ccff00);
  text-shadow: 0 0 12px rgba(204, 255, 0, 0.6);
}

.nav-item:hover::after,
.nav-item.active::after {
  width: 100%;
  box-shadow: 0 0 10px var(--primary, #ccff00);
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
  color: var(--primary, #ccff00);
  background: rgba(204, 255, 0, 0.1);
  text-shadow: 0 0 12px rgba(204, 255, 0, 0.4);
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
  font-family: var(--common-font);
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
  font-family: var(--common-font);
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
  font-family: var(--common-font);
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

@media (max-width: 980px) {
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
