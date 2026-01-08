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
          <span v-if="!collapsed" class="logo-text">Nth Me Console</span>
          <span v-else class="logo-text-small">N</span>
        </div>
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline">
        <a-menu-item key="dashboard" @click="router.push('/console')">
          <template #icon><dashboard-outlined /></template>
          <span>Overview</span>
        </a-menu-item>
        <a-menu-item key="playground" @click="router.push('/console/playground')">
          <template #icon><experiment-outlined /></template>
          <span>Playground</span>
        </a-menu-item>
        <a-menu-item key="billing" @click="router.push('/console/billing')">
          <template #icon><wallet-outlined /></template>
          <span>Billing & Credits</span>
        </a-menu-item>
        <a-menu-item key="usage" @click="router.push('/console/usage')">
          <template #icon><bar-chart-outlined /></template>
          <span>Usage History</span>
        </a-menu-item>
        <a-menu-item key="settings" @click="router.push('/console/settings')">
          <template #icon><setting-outlined /></template>
          <span>Settings</span>
        </a-menu-item>
        <a-menu-item key="users" @click="router.push('/console/users')">
          <template #icon><team-outlined /></template>
          <span>User Management</span>
        </a-menu-item>
        <a-menu-item key="audit" @click="router.push('/console/audit')">
          <template #icon><safety-certificate-outlined /></template>
          <span>Content Audit</span>
        </a-menu-item>
        <a-menu-divider />
        <a-menu-item key="home" @click="router.push('/')">
          <template #icon><home-outlined /></template>
          <span>Back to Home</span>
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
          <a-breadcrumb-item>Console</a-breadcrumb-item>
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
                <user-outlined /> Profile
              </a-menu-item>
              <a-menu-divider />
              <a-menu-item key="logout" @click="handleLogout">
                <logout-outlined /> Logout
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
        Nth Me ©2025 Created by Feng Fan
      </a-layout-footer>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
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

const router = useRouter();
const route = useRoute();
const { currentUser } = useAuth();
const userId = computed(() => currentUser.value?.userId || getCurrentUserId());

const collapsed = ref(false);
const selectedKeys = ref<string[]>(['dashboard']);

const currentRouteName = computed(() => {
  if (route.path.includes('/billing')) return 'Billing';
  if (route.path.includes('/usage')) return 'Usage';
  if (route.path.includes('/settings')) return 'Settings';
  if (route.path.includes('/playground')) return 'Playground';
  if (route.path.includes('/users')) return 'User Management';
  if (route.path.includes('/audit')) return 'Content Audit';
  return 'Overview';
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
