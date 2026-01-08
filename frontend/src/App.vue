<script setup lang="ts">
import LoginModal from './login/components/LoginModal.vue';
</script>

<template>
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
</style>
