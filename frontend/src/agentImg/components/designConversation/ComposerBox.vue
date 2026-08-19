<template>
  <form class="composer-box" :class="{ compact }" @submit.prevent="emit('submit')">
    <textarea
      ref="textarea"
      :value="draft"
      name="design-request"
      rows="2"
      maxlength="20000"
      autocomplete="off"
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
        <button type="button" :aria-label="`Remove ${file.name}`" @click="emit('remove-attachment', file.clientId)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </span>
    </div>
    <div class="composer-actions">
      <button class="attach" type="button" :aria-label="`${attachLabel}: ${attachmentHint}`" :title="attachmentHint" @click="emit('attach')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2L10 19a5 5 0 0 1-7-7l9-9" /></svg>
        <span>{{ attachments.length ? `${attachments.length} ${attachmentCountLabel}` : attachLabel }}</span>
      </button>
      <span v-if="attachments.length" class="privacy">{{ attachmentHint }}</span>
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
  attachLabel?: string;
  attachmentCountLabel?: string;
  attachmentHint?: string;
}>(), {
  busy: false,
  compact: false,
  attachLabel: 'Add files',
  attachmentCountLabel: 'files',
  attachmentHint: 'Files stay on this device until a cloud task needs them'
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
.composer-box { width: 100%; min-width: 0; padding: 13px 14px 12px; border: 0; border-radius: 15px; color: var(--text); background: var(--surface); box-shadow: 0 12px 32px rgb(0 0 0 / 16%); }
.composer-box:focus-within { box-shadow: 0 14px 36px rgb(0 0 0 / 22%), 0 0 0 2px color-mix(in srgb,var(--acid) 68%,transparent); }
textarea { display: block; width: 100%; min-height: 68px; max-height: 180px; box-sizing: border-box; padding: 6px 7px; resize: none; border: 0; outline: 0; color: var(--text); font: inherit; font-size: 16px; line-height: 1.55; background: transparent; }
textarea::placeholder { color: var(--muted); }
.compact textarea { min-height: 54px; }
.attachment-list { display: flex; flex-wrap: wrap; gap: 7px; padding: 5px 6px 11px; }
.attachment-list > span { display: inline-flex; min-width: 0; align-items: center; gap: 6px; max-width: 100%; padding: 6px 8px; border: 0; border-radius: 8px; font-size: 11px; background: var(--surface-raised); }
.attachment-list svg,.attach svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.attachment-list b { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-list small { color: var(--muted); white-space: nowrap; }
.attachment-list button { display: grid; flex: 0 0 auto; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 7px; color: var(--muted); background: transparent; cursor: pointer; }.attachment-list button svg { width: 14px; height: 14px; }
.composer-actions { display: flex; min-width: 0; align-items: center; gap: 9px; }
.attach { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 9px; border: 0; border-radius: 9px; color: var(--muted); font-size: 12px; font-weight: 650; background: transparent; cursor: pointer; }
.attach:hover { color: var(--text); background: var(--surface-raised); }
.privacy { min-width: 0; overflow: hidden; color: var(--muted); font-size: 11px; font-weight: 520; text-overflow: ellipsis; white-space: nowrap; }
.send { display: grid; place-items: center; width: 42px; height: 42px; margin-left: auto; border: 0; border-radius: 10px; color: var(--acid-ink); background: var(--acid); cursor: pointer; transition: transform 120ms cubic-bezier(.23,1,.32,1),opacity 120ms ease; }
.send:active:not(:disabled) { transform: scale(.96); }
.send:disabled { color: var(--muted); background: var(--surface-raised); cursor: not-allowed; opacity: .58; }
.send svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; }
.attach:focus-visible,.send:focus-visible,.attachment-list button:focus-visible { outline: 2px solid var(--acid); outline-offset: 2px; }
@media (max-width: 620px) {
  .composer-box { border-radius: 14px; }
  .privacy { display: none; }
  .attach span { display: none; }
  .attach,.send,.attachment-list button { min-width: 44px; min-height: 44px; }
}
</style>
