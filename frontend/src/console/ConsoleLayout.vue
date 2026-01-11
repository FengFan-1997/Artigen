<template>
  <a-layout v-if="isLoggedIn" style="min-height: 100vh">
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
        <a-menu-item key="dashboard" @click="router.push('/console')">
          <template #icon><dashboard-outlined /></template>
          <span>{{ ui.menuOverview }}</span>
        </a-menu-item>
        <a-menu-item key="playground" @click="router.push('/console/playground')">
          <template #icon><experiment-outlined /></template>
          <span>{{ ui.menuPlayground }}</span>
        </a-menu-item>
        <a-menu-item key="billing" @click="router.push('/console/billing')">
          <template #icon><wallet-outlined /></template>
          <span>{{ ui.menuBilling }}</span>
        </a-menu-item>
        <a-menu-item key="usage" @click="router.push('/console/usage')">
          <template #icon><bar-chart-outlined /></template>
          <span>{{ ui.menuUsage }}</span>
        </a-menu-item>
        <a-menu-item key="settings" @click="router.push('/console/settings')">
          <template #icon><setting-outlined /></template>
          <span>{{ ui.menuSettings }}</span>
        </a-menu-item>
        <a-menu-item key="users" @click="router.push('/console/users')">
          <template #icon><team-outlined /></template>
          <span>{{ ui.menuUsers }}</span>
        </a-menu-item>
        <a-menu-item key="audit" @click="router.push('/console/audit')">
          <template #icon><safety-certificate-outlined /></template>
          <span>{{ ui.menuAudit }}</span>
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="home" @click="router.push('/')">
          <template #icon><home-outlined /></template>
          <span>{{ ui.backToHome }}</span>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-header
        style="
          background: #fff;
          padding: 0 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
          z-index: 1;
        "
      >
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
              <a-menu-item key="profile" @click="router.push('/console/settings')">
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
      <a-layout-content style="margin: 24px">
        <div
          :style="{
            padding: '24px',
            background: '#fff',
            minHeight: '360px',
            borderRadius: '8px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }"
        >
          <router-view />
        </div>
      </a-layout-content>
      <a-layout-footer style="text-align: center; color: rgba(0, 0, 0, 0.45)">
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

const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const submitting = ref(false);
const loginTick = ref(0);

const consoleStore = useConsoleStore();

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
  if (!u || !p) {
    message.error(
      currentLang.value === 'zh' ? '请输入账号和密码' : 'Please enter username and password'
    );
    return;
  }
  submitting.value = true;
  try {
    consoleStore.init();
    const login = await consoleStore.adminLogin({ username: u, password: p });
    setConsoleAuthSession({
      userId: u,
      authHash: login.token,
      expiresAt: login.expiresAt
    });
    password.value = '';
    message.success(currentLang.value === 'zh' ? '登录成功' : 'Login successful');
    syncLoginTick();
  } catch (e: any) {
    message.error(humanizeLoginError(e));
  } finally {
    submitting.value = false;
  }
};

let authTimer: number | null = null;
onMounted(() => {
  consoleStore.init();
  authTimer = window.setInterval(() => syncLoginTick(), 30_000);
  try {
    window.addEventListener('storage', syncLoginTick);
  } catch {}
});

onBeforeUnmount(() => {
  if (authTimer) window.clearInterval(authTimer);
  authTimer = null;
  try {
    window.removeEventListener('storage', syncLoginTick);
  } catch {}
});

const handleLogout = () => {
  clearConsoleAuthSession();
  syncLoginTick();
  router.replace('/console');
};
</script>

<style scoped>
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
