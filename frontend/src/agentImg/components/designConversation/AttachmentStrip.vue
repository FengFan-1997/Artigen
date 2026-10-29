<template>
  <div class="attachment-strip" :class="{ overflow: hasOverflow, 'has-previous': canLeft || focusedArrow === -1 }">
    <button
      v-if="canLeft || focusedArrow === -1"
      class="scroll-arrow left"
      type="button"
      :aria-label="zh ? '查看前面的附件' : 'Previous attachments'"
      :aria-disabled="!canLeft"
      @focus="focusedArrow = -1"
      @blur="focusedArrow = null"
      @click="scroll(-1)"
    >
      <WorkspaceIcon name="chevron-right" :size="16" :style="{ transform: 'scaleX(-1)' }" />
    </button>
    <div ref="viewport" class="attachment-list" :class="{ 'fade-left': canLeft, 'fade-right': canRight }" @scroll="measure">
      <span v-for="file in attachments" :key="file.clientId" class="attachment-card" :class="{ image: thumbnail(file) }">
        <img v-if="thumbnail(file) && !failedPreviews.has(file.clientId)" :src="thumbnail(file)" alt="" class="thumbnail" @error="failedPreviews.add(file.clientId)" />
        <span v-else-if="thumbnail(file)" class="preview-fallback" role="status" :aria-label="zh ? `无法预览 ${file.name}` : `Cannot preview ${file.name}`">
          <WorkspaceIcon name="image" :size="20" />
        </span>
        <img v-else :src="fileIcon(file.name)" alt="" class="file-icon" />
        <span class="attachment-info" :class="{ 'visually-hidden': thumbnail(file) }">
          <b :title="file.name">{{ file.name }}</b>
          <small>{{ fileType(file.name) }} · {{ formatBytes(file.byteSize) }}</small>
        </span>
        <button
          type="button"
          :disabled="disabled"
          :aria-label="`${removeLabel} ${file.name}`"
          @click="remove($event, file.clientId)"
        >
          <WorkspaceIcon name="close" :size="14" />
        </button>
      </span>
    </div>
    <button
      v-if="canRight || focusedArrow === 1"
      class="scroll-arrow right"
      type="button"
      :aria-label="zh ? '查看后面的附件' : 'Next attachments'"
      :aria-disabled="!canRight"
      @focus="focusedArrow = 1"
      @blur="focusedArrow = null"
      @click="scroll(1)"
    >
      <WorkspaceIcon name="chevron-right" :size="16" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import WorkspaceIcon from '../workspace/WorkspaceIcon.vue';
import excelIcon from './attachment-icons/excel.svg';
import pdfIcon from './attachment-icons/pdf.svg';
import wordIcon from './attachment-icons/word.svg';
import codeIcon from './attachment-icons/code.svg';
import markdownIcon from './attachment-icons/markdown.svg';
import genericIcon from './attachment-icons/file.svg';

type Attachment = { clientId: string; name: string; byteSize: number; mimeType?: string; file?: File };
const props = withDefaults(defineProps<{
  attachments: ReadonlyArray<Attachment>;
  disabled?: boolean;
  removeLabel: string;
  zh?: boolean;
}>(), { disabled: false, zh: false });
const emit = defineEmits<{ remove: [clientId: string] }>();
const viewport = ref<HTMLElement | null>(null);
const canLeft = ref(false);
const canRight = ref(false);
const hasOverflow = ref(false);
const focusedArrow = ref<-1 | 1 | null>(null);
const urls = shallowRef(new Map<File, string>());
const failedPreviews = ref(new Set<string>());

// File extension is a presentation hint only; upload validation stays server-authoritative.
const fileType = (name: string) => {
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  if (extension === 'pdf') return 'PDF';
  if (extension === 'csv' || extension === 'tsv') return extension.toUpperCase();
  if (extension === 'xls' || extension === 'xlsx') return 'Excel';
  if (extension === 'doc' || extension === 'docx') return 'Word';
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') return 'Markdown';
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'r', 'sh', 'sql', 'html', 'css'].includes(extension || '')) return extension!.toUpperCase();
  return props.zh ? '文件' : 'File';
};
const fileIcon = (name: string) => {
  const type = fileType(name);
  if (type === 'PDF') return pdfIcon;
  if (['CSV', 'TSV', 'Excel'].includes(type)) return excelIcon;
  if (type === 'Word') return wordIcon;
  if (type === 'Markdown') return markdownIcon;
  if (['JS', 'JSX', 'TS', 'TSX', 'PY', 'R', 'SH', 'SQL', 'HTML', 'CSS'].includes(type)) return codeIcon;
  return genericIcon;
};
const thumbnail = (file: Attachment) => file.file ? urls.value.get(file.file) : undefined;
const formatBytes = (bytes: number) => bytes < 1024
  ? `${bytes} B`
  : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const measure = () => {
  const element = viewport.value;
  if (!element) return;
  canLeft.value = element.scrollLeft > 1;
  canRight.value = element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
  hasOverflow.value = element.scrollWidth > (element.parentElement?.clientWidth ?? element.clientWidth) + 1;
};
const scroll = (direction: -1 | 1) => {
  if (direction === -1 ? !canLeft.value : !canRight.value) return;
  viewport.value?.scrollBy({
    left: direction * Math.max(100, (viewport.value?.clientWidth ?? 0) - 48),
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  });
};
const remove = (event: MouseEvent, clientId: string) => {
  const button = event.currentTarget as HTMLButtonElement;
  if (document.activeElement === button) {
    const card = button.closest('.attachment-card');
    const adjacent = card?.nextElementSibling ?? card?.previousElementSibling;
    const target = adjacent?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?? button.closest('form')?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)');
    target?.focus({ preventScroll: true });
  }
  emit('remove', clientId);
};

watch(() => props.attachments.map(item => ({ file: item.file, mimeType: item.mimeType })), async attachments => {
  const files = new Set(attachments.flatMap(item => item.file && /^image\/(png|jpeg|webp|gif)$/i.test(item.mimeType || item.file.type) ? [item.file] : []));
  const next = new Map(urls.value);
  for (const [file, url] of next) if (!files.has(file)) { URL.revokeObjectURL(url); next.delete(file); }
  for (const file of files) if (!next.has(file)) next.set(file, URL.createObjectURL(file));
  urls.value = next;
  const ids = new Set(props.attachments.map(item => item.clientId));
  for (const id of failedPreviews.value) if (!ids.has(id)) failedPreviews.value.delete(id);
  await nextTick();
  measure();
}, { immediate: true });

let observer: ResizeObserver | undefined;
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && viewport.value) {
    observer = new ResizeObserver(measure);
    observer.observe(viewport.value);
  }
  measure();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  for (const url of urls.value.values()) URL.revokeObjectURL(url);
});
</script>

<style scoped>
.attachment-strip { position: relative; min-width: 0; max-width: 100%; padding: 0 0 8px; --attachment-arrow-space: 36px; }
.attachment-strip.overflow { padding-inline-end: var(--attachment-arrow-space); }
.attachment-strip.has-previous { padding-inline-start: var(--attachment-arrow-space); }
.attachment-list { display: flex; align-items: stretch; gap: 8px; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; padding: 3px 6px; }
.attachment-list.fade-left { --fade-left: 24px; }
.attachment-list.fade-right { --fade-right: 24px; }
.attachment-list.fade-left, .attachment-list.fade-right { mask-image: linear-gradient(to right, transparent, #000 var(--fade-left, 0px), #000 calc(100% - var(--fade-right, 0px)), transparent); }
.attachment-list:focus-within { mask-image: none; }
.attachment-list::-webkit-scrollbar { display: none; }
.attachment-card { box-sizing: border-box; position: relative; display: flex; align-items: center; flex: 0 0 208px; min-width: 0; height: 60px; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 12px; color: var(--text); background: var(--surface-hover); }
.attachment-card.image { flex-basis: 60px; padding: 0; overflow: hidden; }
.thumbnail { width: 100%; height: 100%; object-fit: cover; }
.file-icon { flex: none; width: 24px; height: 31px; }
.preview-fallback { display: grid; width: 100%; height: 100%; place-items: center; color: var(--muted); }
.attachment-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3px; }
.attachment-info b { overflow: hidden; font-size: 13px; font-weight: 500; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.attachment-info small { color: var(--muted); font-size: 11px; line-height: 16px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.attachment-card button { display: grid; flex: none; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; color: var(--muted); background: transparent; cursor: pointer; }
.attachment-card.image button { position: absolute; top: 0; right: 0; color: white; background: rgba(0, 0, 0, .72); }
.attachment-card button:hover:not(:disabled), .scroll-arrow:hover { color: var(--text); background: var(--surface-raised); }
.attachment-card button:focus-visible, .scroll-arrow:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.scroll-arrow { position: absolute; z-index: 1; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 32px; height: 44px; padding: 0; border: 0; border-radius: 8px; color: var(--text); background: var(--surface); cursor: pointer; }
.scroll-arrow.left { left: 0; }
.scroll-arrow.right { right: 0; }
.scroll-arrow[aria-disabled='true'] { opacity: .5; cursor: default; }
.attachment-card button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 799px), (pointer: coarse) {
  .attachment-strip { --attachment-arrow-space: 48px; }
  .attachment-card button, .scroll-arrow { min-width: 44px; min-height: 44px; }
}
@media (forced-colors: active) { .attachment-list { mask-image: none !important; } }
</style>
