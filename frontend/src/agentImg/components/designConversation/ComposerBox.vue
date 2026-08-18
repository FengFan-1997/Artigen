<template>
  <form class="composer-box" :class="{ compact }" @submit.prevent="emit('submit')">
    <textarea
      ref="textarea"
      :value="draft"
      name="design-request"
      autocomplete="off"
      rows="2"
      maxlength="20000"
      :placeholder="placeholder"
      aria-label="Design request"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown="onKeydown"
    ></textarea>
    <div v-if="attachments.length" class="attachment-list">
      <span v-for="file in attachments" :key="file.clientId">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2L10 19a5 5 0 0 1-7-7l9-9" /></svg>
        <b>{{ file.name }}</b>
        <small>{{ formatBytes(file.byteSize) }}</small>
        <button type="button" :aria-label="`Remove ${file.name}`" @click="emit('remove-attachment', file.clientId)">×</button>
      </span>
    </div>
    <div class="composer-actions">
      <button class="attach" type="button" @click="emit('attach')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2L10 19a5 5 0 0 1-7-7l9-9" /></svg>
        <span>{{ attachments.length ? `${attachments.length} 个附件` : '添加附件' }}</span>
      </button>
      <span class="privacy">LOCAL FIRST</span>
      <button class="send" type="submit" :disabled="busy || !draft.trim()" aria-label="Send request">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" /></svg>
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { DesignAttachmentManifest } from '../../services/designConversations';

const props = withDefaults(defineProps<{
  draft: string;
  attachments: DesignAttachmentManifest[];
  busy?: boolean;
  compact?: boolean;
  placeholder: string;
}>(), {
  busy: false,
  compact: false
});

const emit = defineEmits<{
  'update:draft': [value: string];
  submit: [];
  attach: [];
  'remove-attachment': [clientId: string];
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!props.busy && props.draft.trim()) emit('submit');
};
const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

watch(() => props.draft, async () => {
  await nextTick();
  const element = textarea.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${Math.min(180, Math.max(props.compact ? 54 : 68, element.scrollHeight))}px`;
});
</script>

<style scoped>
.composer-box { position: relative; padding: 15px 16px 13px 20px; border: 1px solid var(--border-strong,var(--border)); border-radius: 8px; color: var(--text); background: var(--surface); box-shadow: 0 22px 54px rgb(18 31 25 / 11%); transition: border-color 180ms ease,box-shadow 180ms ease; }
.composer-box::before { position: absolute; top: 16px; bottom: 16px; left: -1px; width: 2px; background: var(--acid); content: ''; }
.composer-box:focus-within { border-color: var(--focus,var(--selection)); box-shadow: 0 0 0 3px color-mix(in srgb,var(--focus,var(--selection)) 15%,transparent),0 24px 58px rgb(18 31 25 / 14%); }
textarea { display: block; width: 100%; min-height: 68px; max-height: 180px; padding: 5px 6px; resize: none; border: 0; outline: 0; color: var(--text); font: inherit; font-size: 16px; line-height: 1.6; background: transparent; }
textarea::placeholder { color: var(--muted); }
.compact textarea { min-height: 54px; }
.attachment-list { display: flex; flex-wrap: wrap; gap: 7px; padding: 5px 6px 11px; }
.attachment-list > span { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; background: var(--surface-raised); }
.attachment-list svg,.attach svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.attachment-list b { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-list small { color: var(--muted); white-space: nowrap; }
.attachment-list button { border: 0; color: var(--muted); background: transparent; cursor: pointer; }
.composer-actions { display: flex; align-items: center; gap: 9px; }
.attach { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 10px; border: 1px solid transparent; border-radius: 5px; color: var(--muted); font-size: 12px; font-weight: 650; background: transparent; cursor: pointer; }
.attach:hover { border-color: var(--border-strong,var(--border)); color: var(--text); background: var(--surface-raised); }
.privacy { color: var(--muted); font-size: 12px; font-weight: 650; letter-spacing: .04em; }
.send { display: grid; place-items: center; width: 40px; height: 40px; margin-left: auto; border: 1px solid var(--primary,var(--text)); border-radius: 5px; color: var(--primary-ink,var(--bg)); background: var(--primary,var(--text)); cursor: pointer; transition: color 160ms ease,background-color 160ms ease,border-color 160ms ease; }
.send:hover:not(:disabled) { border-color: var(--selection); color: var(--selection-ink); background: var(--selection); }
.send:disabled { border-color: var(--border); color: var(--muted); background: var(--surface-raised); cursor: not-allowed; }
.send svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; }
@media (max-width: 620px) {
  .composer-box { padding-inline: 14px; border-radius: 7px; }
  .privacy { display: none; }
  .attach span { font-size: 0; }
  .attach span::after { content: '附件'; font-size: 12px; }
  .attach,.send,.attachment-list button { min-width: 44px; min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .composer-box,.send { transition: none; } }
</style>
