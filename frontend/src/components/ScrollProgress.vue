<template>
  <div class="scroll-progress-container">
    <div class="scroll-progress-bar" :style="{ width: progress + '%' }"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

const progress = ref(0);

const updateProgress = () => {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrolled = (scrollTop / height) * 100;
  progress.value = scrolled;
};

onMounted(() => {
  window.addEventListener('scroll', updateProgress);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateProgress);
});
</script>

<style scoped>
.scroll-progress-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: transparent;
  z-index: 9999;
  pointer-events: none;
}

.scroll-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  width: 0%;
  transition: width 0.1s;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
}
</style>
