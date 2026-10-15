<template><div class="workspace-markdown" @click="openResource" v-html="rendered"></div></template>
<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';
import { buildApiUrl } from '@/utils/api';
import { openWorkspaceFile, type WorkspaceFile } from '../../services/workspaceFiles';
const props = withDefaults(defineProps<{ text: string; files?: WorkspaceFile[] }>(), {
  files: () => []
});
const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
const findFile = (value: string) =>
  props.files.find(
    (f) =>
      value === f.path ||
      value === f.path.split('/').at(-1) ||
      value === f.url ||
      value === `artifact:${f.originArtifactId}` ||
      value === `file:${f.id}`
  );
md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const file = findFile(String(String(token.attrGet('src') || '')));
  if (
    !file ||
    !/^image\/(png|jpeg|webp|gif)$/.test(file.mimeType) ||
    !/^\/api\/assets\/[a-f0-9-]+$/i.test(file.url)
  )
    return `<span>${md.utils.escapeHtml(token.content)}</span>`;
  return `<button type="button" class="inline-image" data-resource="${md.utils.escapeHtml(file.id)}"><img loading="lazy" alt="${md.utils.escapeHtml(token.content || file.path)}" src="${md.utils.escapeHtml(buildApiUrl(file.url))}" /></button>`;
};
const originalLink =
  md.renderer.rules.link_open ||
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const href = String(token.attrGet('href') || '');
  const file = findFile(href);
  if (file) {
    token.attrSet('data-resource', file.id);
    token.attrSet('href', '#');
  } else if (!/^(https?:|mailto:)/i.test(href)) {
    token.attrSet('href', '#');
  }
  token.attrSet('rel', 'noopener noreferrer');
  token.attrSet('target', '_blank');
  return originalLink(tokens, index, options, env, self);
};
const rendered = computed(() => md.render(props.text));
const openResource = (event: MouseEvent) => {
  const target = (event.target as Element).closest<HTMLElement>('[data-resource]');
  if (!target) return;
  event.preventDefault();
  const file = props.files.find((f) => f.id === target.dataset.resource);
  if (file) openWorkspaceFile(file);
};
</script>
<style scoped>
.workspace-markdown {
  font-size: 15px;
  line-height: 1.75;
  overflow-wrap: anywhere;
  min-width: 0;
}
.workspace-markdown :deep(p) {
  margin: 0 0 14px;
}
.workspace-markdown :deep(h1) {
  font-size: 26px;
}
.workspace-markdown :deep(h2) {
  font-size: 21px;
}
.workspace-markdown :deep(h3) {
  font-size: 17px;
}
.workspace-markdown :deep(:is(h1, h2, h3, h4)) {
  margin: 25px 0 10px;
  font-weight: 650;
  line-height: 1.4;
}
.workspace-markdown :deep(:is(h1, h2, h3):first-child) {
  margin-top: 0;
}
.workspace-markdown :deep(pre) {
  overflow: auto;
  padding: 14px;
  background: var(--surface);
  border-radius: 8px;
  font:
    13px/1.6 ui-monospace,
    SFMono-Regular,
    monospace;
}
.workspace-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.9em;
}
.workspace-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow: auto;
  border-collapse: collapse;
  font-size: 13px;
}
.workspace-markdown :deep(:is(td, th)) {
  min-width: max(10ch, 96px);
  overflow-wrap: normal;
  word-break: normal;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.workspace-markdown :deep(blockquote) {
  margin: 14px 0;
  padding-left: 16px;
  border-left: 1px solid var(--muted);
  color: var(--muted);
}
.workspace-markdown :deep(a) {
  color: var(--acid-text);
  text-underline-offset: 3px;
}
.workspace-markdown :deep(.inline-image) {
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}
.workspace-markdown :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 440px;
  object-fit: contain;
  border-radius: 8px;
}
</style>
