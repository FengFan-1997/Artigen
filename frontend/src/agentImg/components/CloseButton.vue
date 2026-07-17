<template>
  <button class="close-btn" type="button" :aria-label="label" @click="emit('click')">×</button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string;
}>(), {
  label: 'Close / 关闭'
});

const emit = defineEmits<{
  (e: 'click'): void;
}>();
</script>

<style scoped>
.close-btn {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  color: #cbd5f5;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    background 0.2s;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.close-btn:focus-visible {
  outline: 2px solid #ccff00;
  outline-offset: 2px;
}

.close-btn:hover {
  color: #fff;
  border-color: rgba(204, 255, 0, 0.6);
  background: rgba(204, 255, 0, 0.1);
}
</style>
