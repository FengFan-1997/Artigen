<template>
  <a-layout v-if="isLoggedIn" class="console-shell">
    <a-layout-sider
      v-model:collapsed="collapsed"
      collapsible
      breakpoint="lg"
      width="240"
      theme="dark"
    >
      <div class="logo-container">
        <div class="logo">
          <span v-if="!collapsed" class="logo-text">{{ ui.logo }}</span>
          <span v-else class="logo-text-small">A</span>
        </div>
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline">
        <a-menu-item key="dashboard" @click="navTo('/console', 'dashboard')">
          <template #icon><dashboard-outlined /></template>
          <span>{{ ui.menuOverview }}</span>
        </a-menu-item>
        <a-menu-item key="playground" @click="navTo('/console/playground', 'playground')">
          <template #icon><experiment-outlined /></template>
          <span>{{ ui.menuPlayground }}</span>
        </a-menu-item>
        <a-menu-item key="billing" @click="navTo('/console/billing', 'billing')">
          <template #icon><wallet-outlined /></template>
          <span>{{ ui.menuBilling }}</span>
        </a-menu-item>
        <a-menu-item key="usage" @click="navTo('/console/usage', 'usage')">
          <template #icon><bar-chart-outlined /></template>
          <span>{{ ui.menuUsage }}</span>
        </a-menu-item>
        <a-menu-item key="settings" @click="navTo('/console/settings', 'settings')">
          <template #icon><setting-outlined /></template>
          <span>{{ ui.menuSettings }}</span>
        </a-menu-item>
        <a-menu-item key="users" @click="navTo('/console/users', 'users')">
          <template #icon><team-outlined /></template>
          <span>{{ ui.menuUsers }}</span>
        </a-menu-item>
        <a-menu-item key="audit" @click="navTo('/console/audit', 'audit')">
          <template #icon><safety-certificate-outlined /></template>
          <span>{{ ui.menuAudit }}</span>
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="home" @click="navTo('/', 'home')">
          <template #icon><home-outlined /></template>
          <span>{{ ui.backToHome }}</span>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout class="console-main">
      <a-layout-header class="console-header">
        <a-breadcrumb>
          <a-breadcrumb-item>{{ ui.console }}</a-breadcrumb-item>
          <a-breadcrumb-item>{{ currentRouteName }}</a-breadcrumb-item>
        </a-breadcrumb>

        <a-dropdown>
          <a-space class="user-dropdown" style="cursor: pointer">
            <a-avatar style="background-color: #1890ff" :size="32">
              {{ userId.slice(0, 1).toUpperCase() }}
            </a-avatar>
            <span class="username">{{ userId }}</span>
            <down-outlined />
          </a-space>
          <template #overlay>
            <a-menu>
              <a-menu-item key="profile" @click="navTo('/console/settings', 'profile')">
                <user-outlined /> {{ ui.profile }}
              </a-menu-item>
              <a-menu-divider />
              <a-menu-item key="logout" @click="handleLogout">
                <logout-outlined /> {{ ui.logout }}
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-layout-header>
      <a-layout-content class="console-content">
        <div class="console-card">
          <div class="console-card-scroll">
            <router-view />
          </div>
        </div>
      </a-layout-content>
      <a-layout-footer class="console-footer">
        {{ ui.footer }}
      </a-layout-footer>
    </a-layout>
  </a-layout>

  <div v-else class="login-root">
    <div class="login-card">
      <div class="login-title">{{ ui.loginTitle }}</div>
      <div class="login-sub">{{ ui.loginSub }}</div>

      <a-form layout="vertical" @submit.prevent>
        <a-form-item :label="ui.usernameLabel">
          <a-input v-model:value="username" autocomplete="username" />
        </a-form-item>
        <a-form-item :label="ui.passwordLabel">
          <a-input-password v-model:value="password" autocomplete="off" />
        </a-form-item>
        <a-form-item :label="ui.adminKeyLabel">
          <a-input v-model:value="adminKeyInput" autocomplete="off" />
        </a-form-item>
        <a-button type="primary" block :loading="submitting" @click="handleLogin">
          {{ ui.loginBtn }}
        </a-button>
      </a-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  DashboardOutlined,
  WalletOutlined,
  BarChartOutlined,
  SettingOutlined,
  HomeOutlined,
  UserOutlined,
  LogoutOutlined,
  DownOutlined,
  ExperimentOutlined,
  TeamOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { useLanguageStore } from '@/stores/language';
import {
  clearConsoleAuthSession,
  getConsoleUserId,
  isConsoleAuthed,
  setConsoleAuthSession,
  useConsoleStore
} from '@/stores/console';
import { trackEvent } from '@/utils/analytics';

const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const adminKeyInput = ref('');
const submitting = ref(false);
const loginTick = ref(0);

const consoleStore = useConsoleStore();

const navTo = (path: string, target: string) => {
  trackEvent('console_nav_click', { userId: userId.value, target, path, from: route.path });
  router.push(path);
};

const isLoggedIn = computed(() => {
  void loginTick.value;
  return isConsoleAuthed();
});

const userId = computed(() => {
  void loginTick.value;
  return getConsoleUserId() || '';
});

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const collapsed = ref(false);
const selectedKeys = ref<string[]>(['dashboard']);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        logo: 'Artigen 控制台',
        console: '控制台',
        menuOverview: '总览',
        menuPlayground: '试验场',
        menuBilling: '计费与点数',
        menuUsage: '使用记录',
        menuSettings: '设置',
        menuUsers: '用户管理',
        menuAudit: '内容审计',
        backToHome: '返回首页',
        profile: '个人资料',
        logout: '退出登录',
        loginTitle: 'Artigen 控制台登录',
        loginSub: '请输入账号与密码进入管理系统',
        usernameLabel: '账号',
        passwordLabel: '密码',
        adminKeyLabel: 'ADMIN_KEY（可选）',
        loginBtn: '登录',
        footer: 'Artigen ©2025 Created by Feng Fan',
        routeOverview: '总览',
        routeBilling: '计费',
        routeUsage: '用量',
        routeSettings: '设置',
        routePlayground: '试验场',
        routeUsers: '用户管理',
        routeAudit: '内容审计'
      }
    : {
        logo: 'Artigen Console',
        console: 'Console',
        menuOverview: 'Overview',
        menuPlayground: 'Playground',
        menuBilling: 'Billing & Credits',
        menuUsage: 'Usage History',
        menuSettings: 'Settings',
        menuUsers: 'User Management',
        menuAudit: 'Content Audit',
        backToHome: 'Back to Home',
        profile: 'Profile',
        logout: 'Logout',
        loginTitle: 'Artigen Console Login',
        loginSub: 'Enter username and password to continue',
        usernameLabel: 'Username',
        passwordLabel: 'Password',
        adminKeyLabel: 'ADMIN_KEY (optional)',
        loginBtn: 'Login',
        footer: 'Artigen ©2025 Created by Feng Fan',
        routeOverview: 'Overview',
        routeBilling: 'Billing',
        routeUsage: 'Usage',
        routeSettings: 'Settings',
        routePlayground: 'Playground',
        routeUsers: 'User Management',
        routeAudit: 'Content Audit'
      }
);

const currentRouteKey = computed(() => {
  if (route.path.includes('/billing')) return 'billing';
  if (route.path.includes('/usage')) return 'usage';
  if (route.path.includes('/settings')) return 'settings';
  if (route.path.includes('/playground')) return 'playground';
  if (route.path.includes('/users')) return 'users';
  if (route.path.includes('/audit')) return 'audit';
  return 'overview';
});

const currentRouteName = computed(() => {
  if (currentRouteKey.value === 'billing') return ui.value.routeBilling;
  if (currentRouteKey.value === 'usage') return ui.value.routeUsage;
  if (currentRouteKey.value === 'settings') return ui.value.routeSettings;
  if (currentRouteKey.value === 'playground') return ui.value.routePlayground;
  if (currentRouteKey.value === 'users') return ui.value.routeUsers;
  if (currentRouteKey.value === 'audit') return ui.value.routeAudit;
  return ui.value.routeOverview;
});

watch(
  () => route.path,
  (path) => {
    if (path.includes('/billing')) selectedKeys.value = ['billing'];
    else if (path.includes('/usage')) selectedKeys.value = ['usage'];
    else if (path.includes('/settings')) selectedKeys.value = ['settings'];
    else if (path.includes('/playground')) selectedKeys.value = ['playground'];
    else if (path.includes('/users')) selectedKeys.value = ['users'];
    else if (path.includes('/audit')) selectedKeys.value = ['audit'];
    else selectedKeys.value = ['dashboard'];
  },
  { immediate: true }
);

const syncLoginTick = () => {
  loginTick.value++;
};

const humanizeLoginError = (e: any) => {
  const code = String(e?.message || '').trim();
  const apiError = String((e as any)?.apiError || '').trim();
  const err = apiError || code || 'REQUEST_FAILED';
  const zh = currentLang.value === 'zh';

  if (err === 'INVALID_INPUT')
    return zh ? '请输入账号和密码' : 'Please enter username and password';
  if (err === 'INVALID_CREDENTIALS') return zh ? '账号或密码错误' : 'Invalid username or password';
  if (err === 'ADMIN_ACCOUNT_NOT_CONFIGURED')
    return zh
      ? '后端未配置管理员账号（请设置 CONSOLE_ADMIN_USERNAME/PASSWORD，或使用 ADMIN_KEY 登录）'
      : 'Admin account is not configured on backend';
  if (err === 'ADMIN_NOT_CONFIGURED')
    return zh
      ? '后端未配置 ADMIN_KEY（请在 Zeabur 设置）'
      : 'ADMIN_KEY is not configured on backend';
  if (err === 'ADMIN_AUTH_EXPIRED')
    return zh ? '登录已失效，请重新登录' : 'Session expired, please login again';
  if (/failed to fetch/i.test(err) || /network/i.test(err))
    return zh
      ? '网络异常或服务不可用，请稍后再试'
      : 'Network error or service unavailable. Please try again.';

  return zh ? '登录失败' : 'Login failed';
};

const handleLogin = async () => {
  if (submitting.value) return;
  const u = String(username.value || '').trim();
  const p = String(password.value || '');
  const key = String(adminKeyInput.value || '').trim();
  const usingAdminKey = !!key;
  if (!usingAdminKey && (!u || !p)) {
    message.error(
      currentLang.value === 'zh'
        ? '请输入账号和密码，或填入 ADMIN_KEY'
        : 'Enter username/password or ADMIN_KEY'
    );
    return;
  }
  submitting.value = true;
  try {
    consoleStore.init();
    if (usingAdminKey) {
      consoleStore.setAdminApiKey(key);
      setConsoleAuthSession({
        userId: 'admin',
        authHash: `admin_key_${key.slice(0, 12)}`,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
      });
      username.value = '';
      password.value = '';
      adminKeyInput.value = '';
      message.success(currentLang.value === 'zh' ? '登录成功' : 'Login successful');
      trackEvent('console_login_success', { mode: 'admin_key' });
    } else {
      const login = await consoleStore.adminLogin({ username: u, password: p });
      setConsoleAuthSession({
        userId: u,
        authHash: login.token,
        expiresAt: login.expiresAt
      });
      password.value = '';
      adminKeyInput.value = '';
      message.success(currentLang.value === 'zh' ? '登录成功' : 'Login successful');
      trackEvent('console_login_success', { userId: u, mode: 'account' });
    }
    syncLoginTick();
  } catch (e: any) {
    message.error(humanizeLoginError(e));
  } finally {
    submitting.value = false;
  }
};

let authTimer: number | null = null;
let clickListener: ((e: MouseEvent) => void) | null = null;
onMounted(() => {
  consoleStore.init();
  authTimer = window.setInterval(() => syncLoginTick(), 30_000);
  try {
    window.addEventListener('storage', syncLoginTick);
  } catch {}

  clickListener = (e: MouseEvent) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const btn = el.closest('button');
    if (!btn) return;
    if (btn.closest('.ant-menu')) return;

    const label =
      String(
        btn.getAttribute('data-track') || btn.getAttribute('aria-label') || btn.textContent || ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'button';

    trackEvent('console_button_click', {
      userId: userId.value,
      path: route.fullPath || route.path,
      label,
      disabled: btn.hasAttribute('disabled') || (btn as any).disabled === true
    });
  };
  try {
    window.addEventListener('click', clickListener, true);
  } catch {}
});

onBeforeUnmount(() => {
  if (authTimer) window.clearInterval(authTimer);
  authTimer = null;
  try {
    window.removeEventListener('storage', syncLoginTick);
  } catch {}
  if (clickListener) {
    try {
      window.removeEventListener('click', clickListener, true);
    } catch {}
  }
  clickListener = null;
});

const handleLogout = () => {
  trackEvent('console_logout', { userId: userId.value });
  clearConsoleAuthSession();
  syncLoginTick();
  router.replace('/console');
};
</script>

<style scoped>
.console-shell {
  min-height: 100vh;
  background: #0b1220;
}

.console-main {
  min-width: 0;
  background: #0b1220;
}

.console-header {
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(15, 23, 42, 0.88);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  z-index: 2;
}

.console-content {
  padding: clamp(12px, 2vw, 18px);
  min-width: 0;
  min-height: 0;
}

.console-card {
  min-width: 0;
  min-height: 360px;
  padding: clamp(12px, 2vw, 18px);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.18),
    0 20px 60px rgba(0, 0, 0, 0.25);
}

.console-card-scroll {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.console-footer {
  text-align: center;
  color: rgba(241, 245, 249, 0.55);
  background: transparent;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

:deep(.ant-breadcrumb),
:deep(.ant-breadcrumb a),
:deep(.ant-breadcrumb span) {
  color: rgba(241, 245, 249, 0.9);
}

:deep(.ant-layout-sider) {
  background: #001529;
}

:deep(.ant-typography),
:deep(.ant-typography-title) {
  color: rgba(241, 245, 249, 0.95);
}

:deep(.ant-card) {
  background: rgba(2, 6, 23, 0.35);
  border-color: rgba(255, 255, 255, 0.08);
}

:deep(.ant-card-head) {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

:deep(.ant-card-head-title) {
  color: rgba(241, 245, 249, 0.92);
}

:deep(.ant-table-wrapper) {
  min-width: 0;
}

:deep(.ant-table) {
  background: transparent;
  color: rgba(241, 245, 249, 0.9);
}

:deep(.ant-table-container) {
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

:deep(.ant-table-thead > tr > th) {
  background: rgba(15, 23, 42, 0.88) !important;
  color: rgba(241, 245, 249, 0.92) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

:deep(.ant-table-tbody > tr > td) {
  background: transparent !important;
  color: rgba(241, 245, 249, 0.9) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
}

:deep(.ant-table-tbody > tr.ant-table-row:hover > td) {
  background: rgba(56, 189, 248, 0.08) !important;
}

:deep(.ant-table-cell-ellipsis) {
  color: rgba(241, 245, 249, 0.9);
}

:deep(.ant-tabs-nav) {
  margin: 0 0 16px 0;
}

:deep(.ant-tabs-nav::before) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

:deep(.ant-tabs-tab) {
  color: rgba(241, 245, 249, 0.75);
}

:deep(.ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn) {
  color: rgba(241, 245, 249, 0.95);
}

:deep(.ant-tabs-ink-bar) {
  background: rgba(56, 189, 248, 0.9);
}

:deep(.ant-input),
:deep(.ant-input-affix-wrapper),
:deep(.ant-input-search .ant-input-group),
:deep(.ant-input-search .ant-input-group-addon),
:deep(.ant-select-selector),
:deep(.ant-picker),
:deep(.ant-input-number),
:deep(.ant-input-number-input) {
  background: rgba(2, 6, 23, 0.45) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: rgba(241, 245, 249, 0.92) !important;
}

:deep(.ant-input::placeholder) {
  color: rgba(241, 245, 249, 0.45);
}

:deep(.ant-picker-input > input::placeholder) {
  color: rgba(241, 245, 249, 0.45);
}

:deep(.ant-select-selection-placeholder) {
  color: rgba(241, 245, 249, 0.45) !important;
}

:deep(.ant-modal-content) {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
}

:deep(.ant-modal-header) {
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

:deep(.ant-modal-title) {
  color: rgba(241, 245, 249, 0.95);
}

:deep(.ant-modal-close-x) {
  color: rgba(241, 245, 249, 0.85);
}

:deep(.ant-divider) {
  border-color: rgba(255, 255, 255, 0.08);
}

:deep(.ant-typography strong) {
  color: rgba(241, 245, 249, 0.92);
}

@media (max-width: 768px) {
  .console-header {
    padding: 0 12px;
  }

  .console-content {
    padding: 12px;
  }

  .console-card {
    padding: 12px;
    border-radius: 12px;
  }
}

.login-root {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1220;
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}

.login-title {
  font-size: 18px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.9);
}

.login-sub {
  margin-top: 6px;
  margin-bottom: 18px;
  color: rgba(0, 0, 0, 0.55);
  font-size: 13px;
}

.logo-container {
  padding: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.logo {
  height: 32px;
  background: rgba(255, 255, 255, 0.1);
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.logo-text {
  color: white;
  font-weight: 600;
  font-size: 16px;
  letter-spacing: 0.5px;
}

.logo-text-small {
  color: white;
  font-weight: bold;
  font-size: 18px;
}

.username {
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
}

.user-dropdown:hover {
  opacity: 0.8;
}
</style>
