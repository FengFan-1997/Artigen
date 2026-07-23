<template>
  <a-layout v-if="isLoggedIn" class="console-shell">
    <a-layout-sider
      v-model:collapsed="collapsed"
      class="console-sider"
      :class="{ 'console-sider--mobile': isMobile }"
      :collapsed-width="siderCollapsedWidth"
      :trigger="null"
      :width="256"
    >
      <button class="brand" type="button" @click="navTo('/console')">
        <span class="brand-mark">A</span>
        <span v-if="!collapsed" class="brand-copy">
          <strong>Artigen</strong>
          <small>Operations</small>
        </span>
      </button>

      <div v-if="!collapsed" class="environment-badge">
        <span class="environment-dot"></span>
        <span>{{ environmentLabel }}</span>
      </div>

      <nav class="console-nav" aria-label="后台导航">
        <div v-for="group in navigationGroups" :key="group.label" class="nav-group">
          <p v-if="!collapsed" class="nav-group-label">{{ group.label }}</p>
          <button
            v-for="item in group.items"
            :key="item.key"
            class="nav-item"
            :class="{ 'nav-item--active': currentRouteKey === item.key }"
            type="button"
            :title="collapsed ? item.label : undefined"
            @click="navTo(item.path)"
          >
            <component :is="item.icon" class="nav-icon" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </button>
        </div>
      </nav>

      <div class="sider-footer">
        <button class="nav-item" type="button" @click="navTo('/artigen')">
          <HomeOutlined class="nav-icon" />
          <span v-if="!collapsed">{{ ui.backToHome }}</span>
        </button>
        <div v-if="!collapsed" class="retention-note">
          <SafetyCertificateOutlined />
          <span>{{ ui.retention }}</span>
        </div>
      </div>
    </a-layout-sider>

    <div v-if="isMobile && !collapsed" class="sider-overlay" @click="collapsed = true"></div>

    <a-layout class="console-main">
      <header class="console-header">
        <div class="header-left">
          <button class="icon-button" type="button" :aria-label="ui.toggleMenu" @click="toggleSider">
            <MenuOutlined />
          </button>
          <div class="route-heading">
            <span>{{ ui.console }}</span>
            <strong>{{ currentRouteName }}</strong>
          </div>
        </div>

        <div class="header-right">
          <div class="system-indicator">
            <span class="system-dot"></span>
            <span>{{ ui.systemOnline }}</span>
          </div>
          <button class="refresh-button" type="button" @click="refreshCurrentPage">
            <ReloadOutlined />
            <span>{{ ui.refresh }}</span>
          </button>
          <a-dropdown>
            <button class="account-button" type="button">
              <span class="account-avatar">{{ userInitial }}</span>
              <span class="account-copy">
                <strong>{{ principalName }}</strong>
                <small>{{ roleLabel }}</small>
              </span>
              <DownOutlined />
            </button>
            <template #overlay>
              <a-menu>
                <a-menu-item key="settings" @click="navTo('/console/settings')">
                  <SettingOutlined /> {{ ui.settings }}
                </a-menu-item>
                <a-menu-divider />
                <a-menu-item key="logout" @click="handleLogout">
                  <LogoutOutlined /> {{ ui.logout }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </header>

      <a-layout-content class="console-content">
        <router-view :key="refreshKey" />
      </a-layout-content>
    </a-layout>
  </a-layout>

  <div v-else class="login-root">
    <div class="login-ambient login-ambient--one"></div>
    <div class="login-ambient login-ambient--two"></div>
    <div class="login-panel">
      <section class="login-story">
        <div class="login-brand">
          <span class="brand-mark brand-mark--large">A</span>
          <span>
            <strong>Artigen</strong>
            <small>Operations Console</small>
          </span>
        </div>
        <div class="login-story-copy">
          <span class="eyebrow">{{ ui.privateArea }}</span>
          <h1>{{ ui.loginHeadline }}</h1>
          <p>{{ ui.loginDescription }}</p>
          <div class="login-features">
            <span><SafetyCertificateOutlined /> {{ ui.secureFeature }}</span>
            <span><AuditOutlined /> {{ ui.auditFeature }}</span>
            <span><DatabaseOutlined /> {{ ui.dataFeature }}</span>
          </div>
        </div>
      </section>

      <section class="login-form-wrap">
        <div class="login-form-head">
          <span class="eyebrow">{{ environmentLabel }}</span>
          <h2>{{ ui.loginTitle }}</h2>
          <p>{{ ui.loginSub }}</p>
        </div>
        <a-form layout="vertical" @submit.prevent="handleLogin">
          <a-form-item :label="ui.usernameLabel">
            <a-input
              v-model:value="username"
              size="large"
              autocomplete="username"
              :placeholder="ui.usernamePlaceholder"
            />
          </a-form-item>
          <a-form-item :label="ui.passwordLabel">
            <a-input-password
              v-model:value="password"
              size="large"
              autocomplete="current-password"
              :placeholder="ui.passwordPlaceholder"
              @press-enter="handleLogin"
            />
          </a-form-item>
          <a-button class="login-submit" type="primary" size="large" block :loading="submitting" @click="handleLogin">
            {{ ui.loginBtn }}
          </a-button>
        </a-form>
        <p class="login-help">{{ ui.loginHelp }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  AuditOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DownOutlined,
  FileSearchOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  WalletOutlined
} from '@ant-design/icons-vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import {
  getConsoleAuthSession,
  getConsoleUserId,
  isConsoleAuthed,
  setConsoleAuthSession,
  useConsoleStore
} from '@/stores/console';

const router = useRouter();
const route = useRoute();
const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const username = ref('');
const password = ref('');
const submitting = ref(false);
const loginTick = ref(0);
const collapsed = ref(false);
const isMobile = ref(false);
const refreshKey = ref(0);
const siderCollapsedWidth = computed(() => (isMobile.value ? 0 : 76));

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        console: '运营后台',
        overview: '运营总览',
        users: '用户管理',
        credits: '点数账本',
        behavior: '行为轨迹',
        systemAudit: '系统审计',
        contentAudit: '内容审计',
        usage: '模型用量',
        settings: '系统设置',
        coreOperations: '核心运营',
        riskAndSystem: '风控与系统',
        backToHome: '返回产品站',
        retention: '行为数据保留 90 天',
        toggleMenu: '展开或收起导航',
        systemOnline: '服务在线',
        refresh: '刷新',
        logout: '退出登录',
        loginTitle: '管理员登录',
        loginSub: '使用已授权的管理员账号进入后台。',
        loginHeadline: '看清运营，管住风险。',
        loginDescription: '统一管理用户、点数、行为、生成调用与所有敏感后台操作。',
        privateArea: '受保护区域',
        secureFeature: '角色权限',
        auditFeature: '操作留痕',
        dataFeature: '真实数据源',
        usernameLabel: '管理员账号',
        passwordLabel: '密码',
        usernamePlaceholder: '请输入账号',
        passwordPlaceholder: '请输入密码',
        loginBtn: '进入运营后台',
        loginHelp: '登录凭证由服务端验证，不会保存在浏览器持久存储中。'
      }
    : {
        console: 'Operations',
        overview: 'Overview',
        users: 'Users',
        credits: 'Credit ledger',
        behavior: 'Behavior',
        systemAudit: 'System audit',
        contentAudit: 'Content audit',
        usage: 'Model usage',
        settings: 'Settings',
        coreOperations: 'Core operations',
        riskAndSystem: 'Risk & system',
        backToHome: 'Back to product',
        retention: 'Behavior retained for 90 days',
        toggleMenu: 'Toggle navigation',
        systemOnline: 'Service online',
        refresh: 'Refresh',
        logout: 'Log out',
        loginTitle: 'Administrator login',
        loginSub: 'Use an authorized administrator account to continue.',
        loginHeadline: 'Operate clearly. Control risk.',
        loginDescription: 'Manage users, credits, behavior, generation calls, and sensitive admin actions.',
        privateArea: 'Protected area',
        secureFeature: 'Role access',
        auditFeature: 'Audit trail',
        dataFeature: 'Canonical data',
        usernameLabel: 'Admin account',
        passwordLabel: 'Password',
        usernamePlaceholder: 'Enter account',
        passwordPlaceholder: 'Enter password',
        loginBtn: 'Open operations console',
        loginHelp: 'Credentials are validated by the server and are not persisted in browser storage.'
      }
);

const navigationGroups = computed(() => [
  {
    label: ui.value.coreOperations,
    items: [
      { key: 'overview', path: '/console', label: ui.value.overview, icon: markRaw(DashboardOutlined) },
      { key: 'users', path: '/console/users', label: ui.value.users, icon: markRaw(TeamOutlined) },
      { key: 'credits', path: '/console/credits', label: ui.value.credits, icon: markRaw(WalletOutlined) },
      { key: 'behavior', path: '/console/behavior', label: ui.value.behavior, icon: markRaw(UserSwitchOutlined) }
    ]
  },
  {
    label: ui.value.riskAndSystem,
    items: [
      { key: 'logs', path: '/console/logs', label: ui.value.systemAudit, icon: markRaw(AuditOutlined) },
      { key: 'audit', path: '/console/audit', label: ui.value.contentAudit, icon: markRaw(FileSearchOutlined) },
      { key: 'usage', path: '/console/usage', label: ui.value.usage, icon: markRaw(BarChartOutlined) },
      { key: 'settings', path: '/console/settings', label: ui.value.settings, icon: markRaw(SettingOutlined) }
    ]
  }
]);

const currentRouteKey = computed(() => {
  const path = route.path;
  if (path.includes('/users')) return 'users';
  if (path.includes('/credits') || path.includes('/billing')) return 'credits';
  if (path.includes('/behavior') || path.includes('/playground')) return 'behavior';
  if (path.includes('/logs')) return 'logs';
  if (path.includes('/audit')) return 'audit';
  if (path.includes('/usage')) return 'usage';
  if (path.includes('/settings')) return 'settings';
  return 'overview';
});

const currentRouteName = computed(() => {
  for (const group of navigationGroups.value) {
    const item = group.items.find((candidate) => candidate.key === currentRouteKey.value);
    if (item) return item.label;
  }
  return ui.value.overview;
});

const isLoggedIn = computed(() => {
  void loginTick.value;
  return isConsoleAuthed();
});
const principalName = computed(
  () => consoleStore.adminPrincipal?.username || getConsoleUserId() || 'admin'
);
const userInitial = computed(() => principalName.value.slice(0, 1).toUpperCase());
const roleLabel = computed(() => {
  const role = consoleStore.adminPrincipal?.role || getConsoleAuthSession()?.role || 'operator';
  return role === 'owner' ? 'Owner' : role === 'admin' ? 'Administrator' : 'Operator';
});
const environmentLabel = computed(() =>
  /(^|\\.)dev[.-]|localhost|127\\.0\\.0\\.1/i.test(window.location.hostname)
    ? 'DEV · 测试环境'
    : 'PROD · 线上环境'
);

const navTo = (path: string) => {
  if (isMobile.value) collapsed.value = true;
  void router.push(path);
};
const toggleSider = () => {
  collapsed.value = !collapsed.value;
};
const refreshCurrentPage = () => {
  refreshKey.value += 1;
};
const syncLoginTick = () => {
  loginTick.value += 1;
};

const humanizeLoginError = (error: any) => {
  const code = String(error?.apiError || error?.message || 'REQUEST_FAILED').trim();
  const zh = currentLang.value === 'zh';
  if (code === 'INVALID_INPUT') return zh ? '请输入账号和密码' : 'Enter username and password';
  if (code === 'INVALID_CREDENTIALS') return zh ? '账号或密码错误' : 'Invalid username or password';
  if (code === 'ADMIN_DATABASE_ROLE_REQUIRED')
    return zh ? '该账号还没有后台权限，请先授予管理员角色' : 'This account has no administrator role';
  if (code === 'ADMIN_AUTH_EXPIRED')
    return zh ? '登录已失效，请重新登录' : 'Session expired. Please log in again';
  if (/failed to fetch|network/i.test(code))
    return zh ? '服务暂时不可用，请稍后重试' : 'Service unavailable. Please try again';
  return zh ? `登录失败（${code}）` : `Login failed (${code})`;
};

const handleLogin = async () => {
  if (submitting.value) return;
  const u = String(username.value || '').trim();
  const p = String(password.value || '');
  if (!u || !p) {
    message.error(currentLang.value === 'zh' ? '请输入账号和密码' : 'Enter username and password');
    return;
  }
  submitting.value = true;
  try {
    consoleStore.init();
    const login = await consoleStore.adminLogin({ username: u, password: p });
    setConsoleAuthSession({
      userId: u,
      authHash: login.token,
      expiresAt: login.expiresAt,
      role: login.role
    });
    await consoleStore.fetchAdminPrincipal();
    password.value = '';
    message.success(currentLang.value === 'zh' ? '登录成功' : 'Login successful');
    syncLoginTick();
  } catch (error: any) {
    message.error(humanizeLoginError(error));
  } finally {
    submitting.value = false;
  }
};

const handleLogout = () => {
  consoleStore.clearAdminKey();
  syncLoginTick();
  void router.replace('/console');
};

let authTimer: number | null = null;
let resizeListener: (() => void) | null = null;

watch(
  () => route.path,
  () => {
    if (isMobile.value) collapsed.value = true;
  }
);

onMounted(() => {
  consoleStore.init();
  if (isLoggedIn.value) void consoleStore.fetchAdminPrincipal().catch(() => undefined);
  authTimer = window.setInterval(syncLoginTick, 30_000);
  window.addEventListener('storage', syncLoginTick);
  const syncViewport = () => {
    isMobile.value = window.innerWidth <= 900;
    if (isMobile.value) collapsed.value = true;
  };
  syncViewport();
  resizeListener = syncViewport;
  window.addEventListener('resize', resizeListener);
});

onBeforeUnmount(() => {
  if (authTimer) window.clearInterval(authTimer);
  window.removeEventListener('storage', syncLoginTick);
  if (resizeListener) window.removeEventListener('resize', resizeListener);
});
</script>

<style scoped>
.console-shell {
  --console-ink: #15223b;
  --console-muted: #69748a;
  --console-border: #e6eaf0;
  --console-primary: #3159df;
  min-height: 100vh;
  background: #f5f7fb;
}

.console-sider {
  position: sticky !important;
  top: 0;
  height: 100vh;
  overflow: hidden;
  z-index: 20;
  background:
    radial-gradient(circle at 10% 0%, rgba(75, 112, 255, 0.22), transparent 27%),
    #101a31 !important;
}

.console-sider--mobile {
  position: fixed !important;
  left: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  width: calc(100% - 28px);
  margin: 20px 14px 16px;
  padding: 8px;
  color: #fff;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.brand-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  color: #fff;
  background: linear-gradient(145deg, #5475f7, #7c4dff);
  box-shadow: 0 8px 24px rgba(62, 91, 218, 0.4);
  font-size: 17px;
  font-weight: 800;
}

.brand-mark--large {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  font-size: 21px;
}

.brand-copy {
  display: grid;
  gap: 1px;
}

.brand-copy strong {
  font-size: 17px;
  letter-spacing: 0.01em;
}

.brand-copy small {
  color: #99a5bf;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.environment-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 20px 22px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  color: #b7c2d9;
  background: rgba(255, 255, 255, 0.04);
  font-size: 11px;
  font-weight: 600;
}

.environment-dot,
.system-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #36c88a;
  box-shadow: 0 0 0 4px rgba(54, 200, 138, 0.13);
}

.console-nav {
  height: calc(100vh - 214px);
  padding: 0 12px;
  overflow-y: auto;
}

.nav-group + .nav-group {
  margin-top: 22px;
}

.nav-group-label {
  margin: 0 10px 8px;
  color: #68758f;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  margin: 3px 0;
  padding: 0 12px;
  color: #aeb9ce;
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 560;
  text-align: left;
  transition: 160ms ease;
}

.nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.07);
}

.nav-item--active {
  color: #fff;
  background: linear-gradient(90deg, rgba(77, 105, 233, 0.32), rgba(77, 105, 233, 0.11));
  box-shadow: inset 3px 0 #6681ff;
}

.nav-icon {
  flex: 0 0 auto;
  font-size: 16px;
}

.sider-footer {
  position: absolute;
  right: 12px;
  bottom: 14px;
  left: 12px;
}

.retention-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 8px 0;
  color: #6f7e9b;
  font-size: 10px;
}

.sider-overlay {
  position: fixed;
  inset: 0;
  z-index: 19;
  background: rgba(7, 13, 27, 0.48);
  backdrop-filter: blur(2px);
}

.console-main {
  min-width: 0;
  background: #f5f7fb;
}

.console-header {
  position: sticky;
  top: 0;
  z-index: 12;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 70px;
  padding: 0 28px;
  border-bottom: 1px solid var(--console-border);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(18px);
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.icon-button,
.refresh-button,
.account-button {
  border: 1px solid var(--console-border);
  background: #fff;
  cursor: pointer;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: #526079;
}

.route-heading {
  display: grid;
  gap: 1px;
}

.route-heading span {
  color: #8a94a8;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.route-heading strong {
  color: var(--console-ink);
  font-size: 16px;
}

.system-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #5e6a81;
  font-size: 12px;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 9px;
  color: #445069;
  font-size: 12px;
  font-weight: 600;
}

.account-button {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 5px 9px 5px 6px;
  border-radius: 12px;
}

.account-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: #fff;
  background: #273c75;
  font-weight: 700;
}

.account-copy {
  display: grid;
  min-width: 88px;
  text-align: left;
}

.account-copy strong {
  max-width: 140px;
  overflow: hidden;
  color: #202b41;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy small {
  color: #8a94a7;
  font-size: 10px;
}

.console-content {
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
  padding: 28px;
}

.console-content :deep(.ant-card) {
  border-color: var(--console-border);
  border-radius: 14px;
  box-shadow: 0 6px 24px rgba(32, 49, 85, 0.04);
}

.console-content :deep(.ant-table-wrapper) {
  min-width: 0;
}

.console-content :deep(.ant-table-thead > tr > th) {
  color: #68748a;
  background: #f7f8fb;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.035em;
}

.console-content :deep(.ant-table-tbody > tr > td) {
  color: #303b51;
  border-color: #eef0f4;
}

.console-content :deep(.ant-table-tbody > tr:hover > td) {
  background: #f8faff !important;
}

.login-root {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 32px;
  overflow: hidden;
  background: #0d1730;
}

.login-ambient {
  position: absolute;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.2;
}

.login-ambient--one {
  top: -220px;
  left: -160px;
  background: #4772ff;
}

.login-ambient--two {
  right: -180px;
  bottom: -240px;
  background: #8c4dff;
}

.login-panel {
  position: relative;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  width: min(920px, 100%);
  min-height: 560px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.34);
}

.login-story {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 42px;
  color: #fff;
  background:
    linear-gradient(145deg, rgba(14, 25, 52, 0.24), rgba(14, 25, 52, 0.78)),
    radial-gradient(circle at 85% 10%, #526fde 0, transparent 35%),
    #152444;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 13px;
}

.login-brand > span:last-child {
  display: grid;
}

.login-brand strong {
  font-size: 19px;
}

.login-brand small {
  color: #aebcda;
  font-size: 10px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.login-story-copy h1 {
  max-width: 430px;
  margin: 14px 0;
  color: #fff;
  font-size: clamp(34px, 5vw, 54px);
  line-height: 1.04;
}

.login-story-copy > p {
  max-width: 430px;
  margin: 0;
  color: #b9c5dd;
  font-size: 14px;
  line-height: 1.75;
}

.eyebrow {
  color: #6f87f8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.login-features {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 28px;
}

.login-features span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #bdc8dc;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
}

.login-form-wrap {
  align-self: center;
  padding: 46px;
}

.login-form-head {
  margin-bottom: 28px;
}

.login-form-head h2 {
  margin: 9px 0 6px;
  color: #18233a;
  font-size: 26px;
}

.login-form-head p,
.login-help {
  color: #7d879a;
  font-size: 12px;
  line-height: 1.6;
}

.login-submit {
  height: 44px;
  margin-top: 4px;
  border-radius: 9px;
  background: #3159df;
  box-shadow: 0 8px 20px rgba(49, 89, 223, 0.22);
  font-weight: 650;
}

.login-help {
  margin: 18px 0 0;
  text-align: center;
}

@media (max-width: 900px) {
  .console-content {
    padding: 18px;
  }

  .system-indicator,
  .refresh-button span,
  .account-copy {
    display: none;
  }

  .login-panel {
    grid-template-columns: 1fr;
    min-height: auto;
    max-width: 480px;
  }

  .login-story {
    min-height: 230px;
    padding: 30px;
  }

  .login-story-copy h1 {
    font-size: 35px;
  }

  .login-story-copy > p,
  .login-features {
    display: none;
  }
}

@media (max-width: 560px) {
  .console-header {
    padding: 0 14px;
  }

  .console-content {
    padding: 14px;
  }

  .login-root {
    padding: 14px;
  }

  .login-story {
    min-height: 190px;
    padding: 24px;
  }

  .login-form-wrap {
    padding: 30px 24px;
  }
}
</style>
