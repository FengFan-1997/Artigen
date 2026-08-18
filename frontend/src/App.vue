<script setup lang="ts">
import LoginModal from './login/components/LoginModal.vue';

const appEnvironment = String(import.meta.env.VITE_APP_ENV || '').trim().toLowerCase();
const isDevEnvironment = appEnvironment === 'dev' || appEnvironment === 'development';
</script>

<template>
  <div v-if="isDevEnvironment" class="dev-environment-badge" role="status">
    DEV 测试环境
  </div>
  <router-view></router-view>
  <LoginModal />
  <!-- <Agent /> -->
</template>

<style>
/* Global styles can go here */
#app {
  width: 100%;
  min-height: 100vh;
}

.dev-environment-badge {
  position: fixed;
  top: 10px;
  left: 50%;
  z-index: 10050;
  transform: translateX(-50%);
  padding: 5px 12px;
  border: 1px solid #F1BD4F;
  border-radius: 999px;
  background: #1A1D1A;
  box-shadow: 0 8px 30px #0E100F;
  color: #F2F4EE;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1.5;
  pointer-events: none;
}

@media (max-width: 799px) {
  .dev-environment-badge {
    top: 12px;
    right: max(8px, env(safe-area-inset-right));
    left: auto;
    display: grid;
    width: 44px;
    height: 28px;
    padding: 0;
    transform: none;
    place-items: center;
    font-size: 0;
    letter-spacing: 0;
    line-height: 1;
  }

  .dev-environment-badge::after {
    font-size: 10px;
    letter-spacing: 0.1em;
    content: 'DEV';
  }

  body:has(.dev-environment-badge) .agent-workspace-shell .topbar-actions {
    padding-right: 50px;
  }

  body:has(.dev-environment-badge) .agent-workspace-shell .inspector-head {
    padding-right: 60px;
  }
}
</style>
