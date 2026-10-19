<template>
  <section
    ref="container"
    class="workspace-diff-view"
    :data-comparison-layout="identical ? 'unchanged' : inlineComparison ? 'inline' : 'split'"
    :aria-label="label"
  >
    <div v-if="!identical" class="diff-labels" :class="{ inline: inlineComparison }">
      <span>{{ originalLabel }}</span
      ><span>{{ modifiedLabel }}</span>
    </div>
    <p v-if="identical" class="diff-no-changes" role="status">{{ noChangesLabel }}</p>
    <div v-else class="diff-host">
      <DiffView
        v-if="diffFile"
        class="github-diff"
        :diff-file="diffFile"
        :diff-view-mode="mode"
        :diff-view-theme="theme"
        :diff-view-highlight="true"
        :diff-view-wrap="inlineComparison"
        :diff-view-font-size="13"
        :style="{ height: '100%', minHeight: '0' }"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { DiffView, DiffModeEnum } from '@git-diff-view/vue';
import { generateDiffFile } from '@git-diff-view/file';
import '@git-diff-view/vue/styles/diff-view-pure.css';

const props = withDefaults(
  defineProps<{
    originalValue: string;
    modifiedValue: string;
    path: string;
    theme: 'light' | 'dark';
    label?: string;
    originalLabel?: string;
    modifiedLabel?: string;
    noChangesLabel?: string;
  }>(),
  {
    label: '文件差异',
    originalLabel: 'Original',
    modifiedLabel: 'Modified',
    noChangesLabel: 'No changes between these versions.'
  }
);

const container = ref<HTMLElement | null>(null);
const inlineComparison = ref(false);
const identical = computed(() => props.originalValue === props.modifiedValue);
const mode = computed(() =>
  inlineComparison.value ? DiffModeEnum.Unified : DiffModeEnum.SplitGitHub
);
const diffFile = computed(() => {
  if (identical.value) return null;
  const language = languageForPath(props.path);
  const file = generateDiffFile(
    props.path,
    props.originalValue,
    props.path,
    props.modifiedValue,
    language,
    language
  );
  file.initTheme(props.theme);
  file.init();
  file.buildSplitDiffLines();
  file.buildUnifiedDiffLines();
  return file;
});
let observer: ResizeObserver | null = null;

function updateLayout(width: number) {
  if (!width) return;
  inlineComparison.value = width < 720;
}

function languageForPath(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase() || '';
  const languages: Record<string, string> = {
    bash: 'bash',
    c: 'c',
    cc: 'cpp',
    cpp: 'cpp',
    cs: 'csharp',
    css: 'css',
    go: 'go',
    graphql: 'graphql',
    h: 'c',
    hpp: 'cpp',
    html: 'xml',
    htm: 'xml',
    java: 'java',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    kt: 'kotlin',
    less: 'less',
    md: 'markdown',
    mjs: 'javascript',
    mts: 'typescript',
    php: 'php',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    scss: 'scss',
    sh: 'bash',
    sql: 'sql',
    swift: 'swift',
    ts: 'typescript',
    tsx: 'tsx',
    vue: 'vue',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml'
  };
  return languages[extension] || 'plaintext';
}

onMounted(() => {
  const element = container.value;
  if (!element) return;
  updateLayout(element.clientWidth);
  observer = new ResizeObserver((entries) => updateLayout(entries[0]?.contentRect.width || 0));
  observer.observe(element);
});

onBeforeUnmount(() => observer?.disconnect());
</script>
<style scoped>
.workspace-diff-view {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  flex-direction: column;
}
.diff-labels {
  display: grid;
  flex: none;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}
.diff-labels span {
  min-width: 0;
  padding: 9px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diff-labels span + span {
  border-left: 1px solid var(--panel-border);
}
.diff-labels.inline {
  display: flex;
  align-items: center;
  gap: 12px;
}
.diff-labels.inline span + span {
  border-left: 0;
  padding-left: 0;
}
.diff-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.github-diff {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 100%;
}
.diff-host :deep(.diff-tailwindcss-wrapper),
.diff-host :deep(.diff-style-root),
.diff-host :deep(.diff-view-wrapper) {
  min-height: 100%;
}
.diff-host :deep(.diff-view-wrapper) {
  height: 100%;
}
.diff-no-changes {
  display: grid;
  flex: 1;
  min-height: 140px;
  padding: 24px;
  place-content: center;
  color: var(--muted);
  text-align: center;
  font-size: 13px;
}
</style>
