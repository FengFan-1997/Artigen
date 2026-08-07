<template>
  <component :is="activeEditor" :key="editorVersion" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';

const LegacyEditor = defineAsyncComponent(() => import('./ImageEditor.vue'));
const EditorV2 = defineAsyncComponent(() => import('./ImageEditorV2.vue'));
const route = useRoute();

const editorDefaultFlag = String(import.meta.env.VITE_IMAGE_EDITOR_V2_DEFAULT ?? 'v2').toLowerCase();
const defaultToV2 = !['0', 'false', 'legacy', 'off'].includes(editorDefaultFlag);
const editorVersion = computed<'legacy' | 'v2'>(() => {
  const requested = String(route.query.editor ?? '').toLowerCase();
  if (requested === 'legacy' || requested === 'v2') return requested;
  return defaultToV2 ? 'v2' : 'legacy';
});
const activeEditor = computed(() => editorVersion.value === 'v2' ? EditorV2 : LegacyEditor);
</script>
