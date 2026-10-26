<template><div class="workspace-markdown" @click="onMarkdownClick" v-html="rendered"></div></template>
<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import { buildApiUrl } from '@/utils/api';
import { useLanguageStore } from '@/stores/language';
import { openWorkspaceFile, type WorkspaceFile } from '../../services/workspaceFiles';
const props = withDefaults(defineProps<{ text: string; files?: WorkspaceFile[] }>(), {
  files: () => []
});
const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
const language = useLanguageStore();
const zh = computed(() => language.currentLang === 'zh');
const copyLabel = computed(() => zh.value ? '复制代码' : 'Copy code');
const originalFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const label = md.utils.escapeHtml(tokens[index]!.info.trim().split(/\s+/)[0] || 'text');
  return `<div class="md-code-block"><div class="md-code-header"><span class="md-code-language" title="${label}">${label}</span><button type="button" class="md-code-copy" data-copy-code>${copyLabel.value}</button><span class="md-code-feedback" role="status" aria-live="polite" aria-atomic="true"></span></div>${originalFence(tokens, index, options, env, self)}</div>\n`;
};
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
    token.attrSet('title', file.path);
    token.attrSet('href', '#');
  } else if (!/^(https?:|mailto:)/i.test(href)) {
    token.attrSet('href', '#');
  }
  token.attrSet('rel', 'noopener noreferrer');
  token.attrSet('target', '_blank');
  return originalLink(tokens, index, options, env, self);
};
const rendered = computed(() => md.render(props.text));
let copyButton: HTMLButtonElement | null = null;
let copyRevision = 0;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function clearCodeCopy() {
  copyRevision++;
  clearTimeout(copyTimer);
  copyTimer = undefined;
  if (copyButton?.isConnected) {
    copyButton.disabled = false;
    copyButton.removeAttribute('aria-busy');
    copyButton.textContent = copyLabel.value;
    const status = copyButton.parentElement?.querySelector('.md-code-feedback');
    if (status) status.textContent = '';
  }
  copyButton = null;
}
async function copyCode(button: HTMLButtonElement) {
  if (button.disabled) return;
  const text = button.closest('.md-code-block')?.querySelector('pre > code')?.textContent;
  if (text == null) return;
  clearCodeCopy();
  const request = copyRevision;
  copyButton = button;
  // Keep the v-html code nodes intact so copy feedback preserves selection and scroll.
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = zh.value ? '正在复制…' : 'Copying…';
  const status = button.parentElement?.querySelector('.md-code-feedback');
  try {
    await navigator.clipboard.writeText(text);
    if (request !== copyRevision || !button.isConnected) return;
    button.textContent = zh.value ? '已复制' : 'Copied';
    if (status) status.textContent = zh.value ? '代码已复制' : 'Code copied';
  } catch {
    if (request !== copyRevision || !button.isConnected) return;
    button.textContent = zh.value ? '复制失败，重试' : 'Copy failed; retry';
    if (status) status.textContent = zh.value ? '复制失败，请检查剪贴板权限后重试' : 'Copy failed. Check clipboard access and try again.';
  }
  if (request !== copyRevision || !button.isConnected) return;
  button.disabled = false;
  button.removeAttribute('aria-busy');
  copyTimer = setTimeout(clearCodeCopy, 1800);
}
watch(rendered, clearCodeCopy, { flush: 'sync' });
onBeforeUnmount(clearCodeCopy);
const onMarkdownClick = (event: MouseEvent) => {
  const copy = (event.target as Element).closest<HTMLButtonElement>('button[data-copy-code]');
  if (copy) {
    event.preventDefault();
    void copyCode(copy);
    return;
  }
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
.workspace-markdown :deep(:is(ul, ol)) {
  margin-block: 0 14px;
  padding-inline-start: 1.5em;
}
.workspace-markdown :deep(ol) { padding-inline-start: 2.5em; }
.workspace-markdown :deep(li + li) { margin-block-start: 6px; }
.workspace-markdown :deep(li > :is(ul, ol)) { margin-block: 6px 0; }
.workspace-markdown :deep(li > p) { margin-block: 0 8px; }
.workspace-markdown :deep(li > :last-child) { margin-block-end: 0; }
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
.workspace-markdown :deep(:not(pre) > code) {
  display: inline-block;
  box-sizing: border-box;
  max-width: 100%;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  color: var(--text);
  background: var(--surface-hover);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.workspace-markdown :deep(pre code) {
  font-size: inherit;
}
.workspace-markdown :deep(.md-code-block) { min-width: 0; margin: 16px 0; overflow: hidden; border-radius: 8px; background: var(--surface); }
.workspace-markdown :deep(.md-code-header) { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 6px 8px 6px 14px; }
.workspace-markdown :deep(.md-code-language) { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 20px; color: var(--muted); }
.workspace-markdown :deep(.md-code-copy) { flex: none; min-height: 28px; padding: 4px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; }
.workspace-markdown :deep(.md-code-copy:focus-visible) { outline: 2px solid var(--focus); outline-offset: -2px; }
.workspace-markdown :deep(.md-code-copy:disabled) { cursor: progress; opacity: 1; }
.workspace-markdown :deep(.md-code-block pre) { margin: 0; border-radius: 0; background: transparent; overscroll-behavior: contain; }
.workspace-markdown :deep(.md-code-feedback) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (hover: hover) and (pointer: fine) {
  .workspace-markdown :deep(.md-code-copy:hover:not(:disabled)) { background: var(--surface-hover); color: var(--text); }
}
@media (max-width: 799px), (pointer: coarse) {
  .workspace-markdown :deep(.md-code-copy) { min-width: 44px; min-height: 44px; }
}
.workspace-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow: auto;
  border-collapse: collapse;
  font-size: 13px;
}
.workspace-markdown :deep(:is(td, th)) {
  min-width: 10ch;
  overflow-wrap: normal;
  word-break: normal;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.workspace-markdown :deep(thead th) {
  color: var(--text);
  background: var(--surface-hover);
  font-weight: 650;
}
.workspace-markdown :deep(tbody tr:last-child td) {
  border-bottom: 0;
}
.workspace-markdown :deep(blockquote) {
  margin: 14px 0;
  padding: 12px 16px;
  border: 0;
  border-radius: 8px;
  color: var(--text);
  background: var(--surface-raised);
}
.workspace-markdown :deep(blockquote > :last-child) {
  margin-bottom: 0;
}
.workspace-markdown :deep(a) {
  color: var(--acid-text);
  text-underline-offset: 3px;
}
.workspace-markdown :deep(a[data-resource]) {
  display: inline-block;
  box-sizing: border-box;
  max-width: min(100%, 36ch);
  padding: 2px 6px;
  border: 0;
  border-radius: 5px;
  color: var(--text);
  background: var(--surface-raised);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
.workspace-markdown :deep(a[data-resource] code) {
  padding: 0;
  color: inherit;
  background: transparent;
  font-size: inherit;
}
.workspace-markdown :deep(a[data-resource]:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .workspace-markdown :deep(a[data-resource]:hover) {
    background: var(--surface-hover);
    text-decoration: underline;
  }
}
@media (max-width: 799px), (pointer: coarse) {
  .workspace-markdown :deep(a[data-resource]) {
    min-height: 44px;
    padding: 10px 8px;
  }
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
