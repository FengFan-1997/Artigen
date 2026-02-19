<template>
  <div class="titlebar">
    <div class="header-spacer"></div>

    <header ref="headerRef" class="header">
      <router-link to="/artigen" class="logo">
        <span class="logo-text">Artigen</span>
      </router-link>

      <button class="nav-toggle" type="button" @click="isMobileMenuOpen = !isMobileMenuOpen">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          width="24"
          height="24"
        >
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      <nav class="nav-links">
        <NavItem to="/artigen" item-class="nav-item" :active="activeKey === 'home'">
          {{ ui.navHome }}
        </NavItem>
        <NavItem to="/artigen/ai" item-class="nav-item" :active="activeKey === 'ai'">
          {{ ui.navAiDesign }}
        </NavItem>
        <div
          ref="toolsContainerRef"
          class="tools-container"
          @mouseenter="openToolsMenu"
          @mouseleave="scheduleCloseToolsMenu"
        >
          <NavItem
            to="/artigen/tools"
            item-class="nav-item"
            :active="activeKey === 'format'"
            @click="isToolsMenuOpen = false"
          >
            {{ ui.navFormatFactory }}
          </NavItem>

          <transition name="dropdown-fade">
            <div
              v-if="isToolsMenuOpen"
              class="tools-popover"
              @mouseenter="cancelCloseToolsMenu"
              @mouseleave="scheduleCloseToolsMenu"
              @click.stop
            >
              <div class="tools-pop-inner">
                <div class="tools-pop-header">
                  <div class="tools-pop-title">{{ ui.toolsPopoverTitle }}</div>
                  <NavItem
                    to="/artigen/tools"
                    item-class="tools-pop-all"
                    @click="isToolsMenuOpen = false"
                  >
                    {{ ui.viewAllTools }} →
                  </NavItem>
                </div>

                <div class="tools-pop-grid">
                  <button
                    v-for="tool in localizedTools"
                    :key="tool.id"
                    type="button"
                    class="tools-pop-item"
                    @click="handleToolClick(tool.id)"
                  >
                    <span class="tools-pop-icon" v-html="tool.icon"></span>
                    <span class="tools-pop-text">
                      <span class="tools-pop-name">{{ tool.name }}</span>
                      <span class="tools-pop-desc">{{ tool.description }}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </transition>
        </div>
        <NavItem to="/artigen/image-workshop" item-class="nav-item" :active="activeKey === 'image'">
          {{ ui.navImageWorkshop }}
        </NavItem>
        <NavItem to="/artigen/market" item-class="nav-item" :active="activeKey === 'market'">
          {{ ui.navMarket }}
        </NavItem>
        <NavItem to="/artigen/about" item-class="nav-item" :active="activeKey === 'about'">
          {{ ui.navAbout }}
        </NavItem>
      </nav>

      <div class="header-right">
        <div
          ref="langContainerRef"
          class="lang-container"
          :class="{ 'mobile-hide': hideLangOnMobile }"
          @click="isLangMenuOpen = !isLangMenuOpen"
        >
          <button class="lang-switch" type="button">
            <span class="globe-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path
                  d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                ></path>
              </svg>
            </span>
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
            <CreditsUserActions
              :is-authed="isAuthed"
              :avatar-text="avatarText"
              :credits-text="creditsText"
              :total-credits-text="totalCreditsText"
              :credits-loading="creditsLoading"
              :on-refresh-credits="refreshCredits"
              :on-go-market="goMarket"
              :on-open-account-popup="openAccountPopup"
              :on-login-click="onLoginClick"
            />
          </div>
        </slot>
      </div>
    </header>

    <transition name="dropdown-fade">
      <div v-if="isMobileMenuOpen" ref="mobileMenuRef" class="mobile-menu">
        <NavItem
          to="/artigen"
          item-class="mobile-item"
          :active="activeKey === 'home'"
          @click="isMobileMenuOpen = false"
        >
          {{ ui.navHome }}
        </NavItem>
        <NavItem
          to="/artigen/ai"
          item-class="mobile-item"
          :active="activeKey === 'ai'"
          @click="isMobileMenuOpen = false"
        >
          {{ ui.navAiDesign }}
        </NavItem>

        <div class="mobile-item-group">
          <div
            class="mobile-item has-arrow"
            :class="{ active: activeKey === 'format' }"
            @click="isMobileToolsExpanded = !isMobileToolsExpanded"
          >
            {{ ui.navFormatFactory }}
            <span class="arrow" :class="{ open: isMobileToolsExpanded }">⌄</span>
          </div>
          <div v-if="isMobileToolsExpanded" class="mobile-sub-menu">
            <div
              v-for="tool in localizedTools"
              :key="tool.id"
              class="mobile-sub-item"
              @click.stop="handleToolClick(tool.id)"
            >
              <span class="mobile-tool-icon" v-html="tool.icon"></span>
              {{ tool.name }}
            </div>
            <NavItem
              to="/artigen/tools"
              item-class="mobile-sub-item view-all"
              @click="
                isMobileMenuOpen = false;
                isMobileToolsExpanded = false;
              "
            >
              {{ ui.viewAllTools }} →
            </NavItem>
          </div>
        </div>

        <NavItem
          to="/artigen/image-workshop"
          item-class="mobile-item"
          :active="activeKey === 'image'"
          @click="isMobileMenuOpen = false"
        >
          {{ ui.navImageWorkshop }}
        </NavItem>
        <NavItem
          to="/artigen/market"
          item-class="mobile-item"
          :active="activeKey === 'market'"
          @click="isMobileMenuOpen = false"
        >
          {{ ui.navMarket }}
        </NavItem>
        <NavItem
          to="/artigen/about"
          item-class="mobile-item"
          :active="activeKey === 'about'"
          @click="isMobileMenuOpen = false"
        >
          {{ ui.navAbout }}
        </NavItem>
      </div>
    </transition>

    <AccountPopup />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import AccountPopup from './AccountPopup.vue';
import CreditsUserActions from './CreditsUserActions.vue';
import NavItem from './NavItem.vue';
import { useLanguageStore } from '@/stores/language';
import { formatFactoryTools } from '../data/formatFactoryTools';
import { useAgentImgAuth } from '../composables/useAgentImgAuth';
import { useAgentImgCredits } from '../composables/useAgentImgCredits';

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

// Tools Dropdown
const isToolsMenuOpen = ref(false);
const toolsContainerRef = ref<HTMLElement | null>(null);
const isMobileToolsExpanded = ref(false);
let toolsCloseTimer: number | null = null;

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const { isAuthed, onLoginClick, avatarText, openAccountPopup, syncAuth } = useAgentImgAuth();
const { creditsBalance, creditsLoading, refreshCredits, creditsText, totalCreditsText, goMarket } =
  useAgentImgCredits(isAuthed);

const handleAuthChanged = () => {
  syncAuth();
  if (isAuthed.value) void refreshCredits();
  else creditsBalance.value = null;
};

const onDocMouseDown = (e: MouseEvent) => {
  const target = e.target;
  if (!(target instanceof Node)) return;
  if (isLangMenuOpen.value) {
    const el = langContainerRef.value;
    if (el && el.contains(target)) return;
    isLangMenuOpen.value = false;
  }
  // Tools menu click outside
  if (isToolsMenuOpen.value) {
    const el = toolsContainerRef.value;
    if (el && el.contains(target)) return;
    isToolsMenuOpen.value = false;
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
  if (toolsCloseTimer !== null) window.clearTimeout(toolsCloseTimer);
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
      navFormatFactory: '工具',
      navImageWorkshop: 'AI影像工坊',
      navMarket: '点数商城',
      toolsPopoverTitle: '图像与文件处理工具',
      viewAllTools: '查看全部工具'
    };
  }
  return {
    navHome: 'Home',
    navAiDesign: 'AI Design',
    navFormatFactory: 'Tools',
    navImageWorkshop: 'AI Image Workshop',
    navMarket: 'Compute Market',
    navAbout: 'About',
    toolsPopoverTitle: 'Image & File Tools',
    viewAllTools: 'View all tools'
  };
});

const localizedTools = computed(() => {
  const isZh = currentLang.value === 'zh';
  return formatFactoryTools
    .filter((t) => t.status === 'ready' && t.id !== 'ingredient-list')
    .map((t) => ({
      id: t.id,
      icon: t.icon,
      name: isZh ? t.name : t.nameEn,
      description: isZh ? t.description : t.descriptionEn
    }));
});

const handleToolClick = (toolId: string) => {
  isToolsMenuOpen.value = false;
  isMobileMenuOpen.value = false;
  isMobileToolsExpanded.value = false;
  router.push({ path: '/artigen/tools', query: { tool: toolId } }).catch(() => {});
};

const openToolsMenu = () => {
  if (toolsCloseTimer !== null) {
    window.clearTimeout(toolsCloseTimer);
    toolsCloseTimer = null;
  }
  isToolsMenuOpen.value = true;
};

const scheduleCloseToolsMenu = () => {
  if (toolsCloseTimer !== null) window.clearTimeout(toolsCloseTimer);
  toolsCloseTimer = window.setTimeout(() => {
    isToolsMenuOpen.value = false;
    toolsCloseTimer = null;
  }, 120);
};

const cancelCloseToolsMenu = () => {
  if (toolsCloseTimer !== null) {
    window.clearTimeout(toolsCloseTimer);
    toolsCloseTimer = null;
  }
};

const activeKey = computed<'format' | 'ai' | 'market' | 'image' | 'home' | 'about'>(() => {
  const p = String(route.path || '');
  if (p === '/artigen' || p === '/artigen/') return 'home';
  if (p.startsWith('/artigen/tools') || p.startsWith('/artigen/format-factory')) return 'format';
  if (p.startsWith('/artigen/market')) return 'market';
  if (p.startsWith('/artigen/image-workshop')) return 'image';
  if (p.startsWith('/artigen/ai')) return 'ai';
  if (p.startsWith('/artigen/about')) return 'about';
  return 'home';
});

watch(() => isAuthed.value, handleAuthChanged);
</script>

<style scoped>
.titlebar {
  --header-height: 80px;
}

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
  /* border-radius: 999px; */
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
  /* border-radius: 999px; */
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
  height: var(--header-height);
  display: flex;
  border-bottom: 1px solid var(--border-color);
  align-items: center;
  padding: 0 40px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  z-index: 120;
  background: rgba(5, 5, 5, 0.82);
  backdrop-filter: blur(10px);
  box-sizing: border-box;
}

.header-spacer {
  height: calc(var(--header-height) + 20px);
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

.tools-container {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tools-popover {
  position: fixed;
  top: var(--header-height);
  left: 0;
  right: 0;
  width: 100vw;
  border-radius: 0 0 18px 18px;
  padding: 18px 0 22px;
  background: rgba(0, 0, 0, 0.86);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  z-index: 115;
}

.tools-pop-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 40px;
}

.tools-pop-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.tools-pop-title {
  font-family: var(--common-font);
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.6px;
  color: rgba(241, 245, 249, 0.9);
}

.tools-pop-all {
  text-decoration: none;
  font-size: 12px;
  font-weight: 700;
  color: rgba(204, 255, 0, 0.95);
  transition: opacity 0.2s;
}

.tools-pop-all:hover {
  opacity: 0.85;
}

.tools-pop-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-height: min(480px, 60vh);
  overflow: auto;
  padding-right: 4px;
}

.tools-pop-item {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 10px 10px;
  cursor: pointer;
  margin-top: 5px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  transition: all 0.2s;
  font-family: var(--common-font);
}

.tools-pop-item:hover {
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.08);
  transform: translateY(-1px);
}

.tools-pop-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  margin-top: 2px;
}

.mobile-tool-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--primary, #ccff00);
}

.mobile-tool-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.tools-pop-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tools-pop-name {
  color: rgba(241, 245, 249, 0.92);
  font-weight: 800;
  font-size: 13px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tools-pop-desc {
  color: rgba(148, 163, 184, 0.95);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1200px) {
  .tools-pop-inner {
    padding: 0 24px;
  }
}

@media (min-width: 1100px) {
  .tools-pop-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1500px) {
  .tools-pop-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
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

.mobile-item-group .mobile-item.has-arrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.mobile-item-group .arrow {
  transition: transform 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.mobile-item-group .arrow.open {
  transform: rotate(180deg);
}

.mobile-sub-menu {
  background: rgba(5, 5, 5, 0.9);
}

.mobile-sub-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
  font-weight: 600;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  cursor: pointer;
  text-decoration: none;
  user-select: none;
  background: rgba(5, 5, 5, 0.9);
}

.mobile-sub-item:hover {
  background: rgba(204, 255, 0, 0.06);
  color: rgba(241, 245, 249, 0.95);
}

.mobile-sub-item.view-all {
  color: var(--primary, #ccff00);
  font-weight: 800;
  justify-content: space-between;
}

.mobile-tool-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  line-height: 1;
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
  .titlebar {
    --header-height: 64px;
  }

  .header {
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
    position: fixed;
    top: var(--header-height);
    left: 0;
    right: 0;
    z-index: 110;
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
