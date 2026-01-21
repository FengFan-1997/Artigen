<template>
  <router-link :to="to" :class="[itemClass, { active }]" @click="emit('click')">
    <slot />
  </router-link>
</template>

<script setup lang="ts">
defineProps<{
  to: string;
  itemClass: string;
  active?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
}>();
</script>
