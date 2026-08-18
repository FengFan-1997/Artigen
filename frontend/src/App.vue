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
  border: 1px solid rgba(250, 204, 21, 0.72);
  border-radius: 999px;
  background: rgba(120, 53, 15, 0.94);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.32);
  color: #fef3c7;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1.5;
  pointer-events: none;
}

@media (max-width: 799px) {
  .dev-environment-badge {
    top: 12px;
    right: calc(max(8px, env(safe-area-inset-right)) + 48px);
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
}
</style>
