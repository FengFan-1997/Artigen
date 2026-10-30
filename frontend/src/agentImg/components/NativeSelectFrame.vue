<template>
  <span class="native-select-frame">
    <slot />
    <ChevronDown class="native-select-chevron" :size="16" :stroke-width="1.75" aria-hidden="true" focusable="false" />
  </span>
</template>

<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
</script>

<style scoped>
.native-select-frame { position: relative; display: inline-flex; min-width: 0; }
.native-select-frame :deep(select) { width: 100%; min-width: 0; appearance: none; }
.native-select-frame :deep(select.workspace-select), .native-select-frame :deep(select.portrait-style) { padding-inline-end: 40px; }
.native-select-chevron { position: absolute; inset-inline-end: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: currentColor; }
@media (forced-colors: active) {
  .native-select-frame :deep(select) { appearance: auto; }
  .native-select-chevron { display: none; }
}
</style>
