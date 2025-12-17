<template>
  <div class="custom-cursor" ref="cursorRef"></div>
  <div class="custom-cursor-follower" ref="cursorFollowerRef"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import gsap from 'gsap';

const cursorRef = ref<HTMLElement | null>(null);
const cursorFollowerRef = ref<HTMLElement | null>(null);

const onMouseMove = (event: MouseEvent) => {
  if (cursorRef.value) {
    gsap.to(cursorRef.value, {
      x: event.clientX,
      y: event.clientY,
      duration: 0
    });
  }
  if (cursorFollowerRef.value) {
    gsap.to(cursorFollowerRef.value, {
      x: event.clientX,
      y: event.clientY,
      duration: 0.2
    });
  }
};

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove);
});
</script>

<style scoped>
.custom-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  background-color: #38bdf8;
  border-radius: 50%;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  mix-blend-mode: difference;
}

.custom-cursor-follower {
  position: fixed;
  top: 0;
  left: 0;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(56, 189, 248, 0.5);
  border-radius: 50%;
  pointer-events: none;
  z-index: 9998;
  transform: translate(-50%, -50%);
  transition:
    width 0.3s,
    height 0.3s,
    background-color 0.3s;
}
@media (max-width: 768px) {
  .custom-cursor,
  .custom-cursor-follower {
    display: none !important;
  }
}
</style>
