<template>
  <svg
    class="workspace-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    :style="{ '--workspace-icon-size': `${size}px` }"
  >
    <template v-if="name === 'panel-left'"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16"/></template>
    <template v-else-if="name === 'panel-right'"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M15 4v16"/></template>
    <template v-else-if="name === 'close'"><path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></template>
    <template v-else-if="name === 'folder'"><path d="M3.5 7.5h6l2-2h9v14h-17z"/></template>
    <template v-else-if="name === 'tools'"><path d="M14.5 5.5a4 4 0 0 0 4.7 5.9l-8.8 8.8-3.6-3.6 8.8-8.8a4 4 0 0 0-1.1-2.3Z"/></template>
    <template v-else-if="name === 'image'"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m7 16 3.5-4 2.5 2.5 2.2-2.5 2.8 4M8.5 8.5h.01"/></template>
    <template v-else-if="name === 'spark'"><path d="M12 3.2 14.2 9l5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8L4 11.2 9.8 9z"/></template>
    <template v-else-if="name === 'moon'"><path d="M19.5 15.2A8 8 0 0 1 8.8 4.5 8 8 0 1 0 19.5 15.2Z"/></template>
    <template v-else-if="name === 'sun'"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></template>
    <template v-else-if="name === 'monitor'"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></template>
    <template v-else-if="name === 'settings'"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z"/></template>
    <template v-else-if="name === 'terminal'"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m7 10 2 2-2 2M12 15h5"/></template>
    <template v-else-if="name === 'list'"><path d="M6 6h13M6 12h13M6 18h9M3 6h.01M3 12h.01M3 18h.01"/></template>
    <template v-else-if="name === 'subagents'"><circle cx="12" cy="7" r="3"/><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M12 10v3M7.8 14.8 10 12.5M16.2 14.8 14 12.5"/></template>
    <template v-else-if="name === 'agent'"><path d="M8 4h8l3 4v8l-3 4H8l-3-4V8zM9 10h.01M15 10h.01M9 15h6"/></template>
    <template v-else-if="name === 'file'"><path d="M5 3.5h9l5 5v12H5zM14 3.5v5h5M8 13h8M8 17h6"/></template>
    <template v-else-if="name === 'attachment'"><path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2L10 19a5 5 0 0 1-7-7l9-9"/></template>
    <template v-else-if="name === 'send'"><path d="m5 12 7-7 7 7M12 5v14"/></template>
    <template v-else-if="name === 'refresh'"><path d="M20 7v5h-5M4 17v-5h5M6.1 8.5A7 7 0 0 1 18.5 7M17.9 15.5A7 7 0 0 1 5.5 17"/></template>
    <template v-else-if="name === 'arrow-right'"><path d="M5 12h14M14 7l5 5-5 5"/></template>
    <template v-else-if="name === 'chevron-right'"><path d="m9 6 6 6-6 6"/></template>
    <template v-else-if="name === 'chevron-down'"><path d="m8 10 4 4 4-4"/></template>
    <template v-else-if="name === 'trash'"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l1 14h9l1-14"/></template>
    <template v-else-if="name === 'download'"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></template>
    <template v-else-if="name === 'play'"><path d="m8 5 11 7-11 7z"/></template>
    <template v-else-if="name === 'stop'"><rect x="7" y="7" width="10" height="10" rx="1"/></template>
    <template v-else-if="name === 'pause'"><path d="M9 6v12M15 6v12"/></template>
    <template v-else-if="name === 'paper-plane'"><path d="m5 12 14-7-4 14-3-6zM12 13l7-8"/></template>
  </svg>
</template>

<script setup lang="ts">
type WorkspaceIconName =
  | 'panel-left' | 'panel-right' | 'close' | 'plus' | 'search' | 'folder' | 'tools'
  | 'image' | 'spark' | 'moon' | 'sun' | 'monitor' | 'settings' | 'terminal' | 'list'
  | 'subagents' | 'agent' | 'file' | 'attachment' | 'send' | 'refresh' | 'arrow-right'
  | 'chevron-right' | 'chevron-down' | 'trash' | 'download' | 'play' | 'stop' | 'pause'
  | 'paper-plane';

withDefaults(defineProps<{
  name: WorkspaceIconName;
  size?: 14 | 16 | 18 | 20;
}>(), {
  size: 16
});
</script>

<style scoped>
.workspace-icon {
  display: block;
  flex: 0 0 auto;
  width: var(--workspace-icon-size);
  height: var(--workspace-icon-size);
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
</style>
