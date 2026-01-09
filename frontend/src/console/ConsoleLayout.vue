<template>
  <a-layout style="min-height: 100vh">
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
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
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
import { useAuth } from '@/agent/composables/useAuth';
import { getCurrentUserId } from '@/login/session';
import { useLanguageStore } from '@/stores/language';

const router = useRouter();
const route = useRoute();
const { currentUser } = useAuth();
const userId = computed(() => currentUser.value?.userId || getCurrentUserId());

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

const handleLogout = () => {
  // Simple logout logic
  router.push('/');
};
</script>

<style scoped>
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
