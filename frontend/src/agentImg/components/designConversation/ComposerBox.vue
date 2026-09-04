<template>
  <form class="composer-box" :class="{ compact }" @submit="onSubmit">
    <textarea
      ref="textarea"
      :value="draft"
      :name="inputName"
      rows="2"
      maxlength="20000"
      autocomplete="off"
      :placeholder="placeholder"
      :aria-label="requestLabel"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @keydown="onKeydown"
    ></textarea>
    <div v-if="attachments.length" class="attachment-list">
      <span v-for="file in attachments" :key="file.clientId">
        <WorkspaceIcon name="attachment" />
        <b>{{ file.name }}</b>
        <small>{{ formatBytes(file.byteSize) }}</small>
        <button type="button" :aria-label="`${removeAttachmentLabel} ${file.name}`" @click="emit('remove-attachment', file.clientId)">
          <WorkspaceIcon name="close" :size="14" />
        </button>
      </span>
    </div>
    <div class="composer-actions">
      <button class="attach" type="button" :aria-label="`${attachLabel}: ${attachmentHint}`" :title="attachmentHint" @click="emit('attach')">
        <WorkspaceIcon name="attachment" />
        <span>{{ attachments.length ? `${attachments.length} ${attachmentCountLabel}` : attachLabel }}</span>
      </button>
      <span v-if="attachments.length" class="privacy">{{ attachmentHint }}</span>
      <button class="send" type="submit" :disabled="busy || !draft.trim()" :aria-label="sendLabel" @click="onSendClick">
        <WorkspaceIcon name="send" :size="20" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { DesignAttachmentManifest } from '../../services/designConversations';
import WorkspaceIcon from '../workspace/WorkspaceIcon.vue';

const props = withDefaults(defineProps<{
  draft: string;
  attachments: DesignAttachmentManifest[];
  busy?: boolean;
  compact?: boolean;
  placeholder: string;
  attachLabel?: string;
  attachmentCountLabel?: string;
  attachmentHint?: string;
  requestLabel?: string;
  sendLabel?: string;
  removeAttachmentLabel?: string;
  inputName?: string;
}>(), {
  busy: false,
  compact: false,
  attachLabel: 'Add files',
  attachmentCountLabel: 'files',
  attachmentHint: 'Files stay on this device until a cloud task needs them',
  requestLabel: 'Design request',
  sendLabel: 'Send request',
  removeAttachmentLabel: 'Remove',
  inputName: 'design-request'
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
const onSubmit = (event: SubmitEvent) => {
  event.preventDefault();
  emit('submit');
};
// A native double-click can dispatch a second submit after a very fast
// request has already resolved. Suppress only that second pointer activation;
// an intentional later click must still be allowed to refresh the quote.
const onSendClick = (event: MouseEvent) => {
  if (event.detail > 1) event.preventDefault();
};
const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

watch(() => props.draft, async () => {
  await nextTick();
  const element = textarea.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${Math.min(180, Math.max(props.compact ? 64 : 78, element.scrollHeight))}px`;
});
</script>

<style scoped>
.composer-box { width: 100%; min-width: 0; padding: 15px 16px 12px; border: 0; border-radius: 20px; color: var(--text); background: var(--surface); box-shadow: 0 18px 54px rgb(0 0 0 / 24%); transition: box-shadow 180ms cubic-bezier(.23,1,.32,1),background-color 180ms ease; }
.composer-box:focus-within { background: var(--surface-raised); box-shadow: 0 22px 62px rgb(0 0 0 / 30%), 0 0 0 2px color-mix(in srgb,var(--acid) 72%,transparent); }
textarea { display: block; width: 100%; min-height: 78px; max-height: 180px; box-sizing: border-box; padding: 5px 6px 10px; resize: none; border: 0; outline: 0; color: var(--text); font: inherit; font-size: 16px; line-height: 1.58; background: transparent; }
textarea::placeholder { color: var(--muted); }
.compact textarea { min-height: 64px; }
.attachment-list { display: flex; flex-wrap: wrap; gap: 7px; padding: 5px 6px 11px; }
.attachment-list > span { display: inline-flex; min-width: 0; align-items: center; gap: 7px; max-width: 100%; padding: 7px 9px; border: 0; border-radius: 9px; font-size: 12px; background: var(--surface-hover); }
.attachment-list b { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-list small { color: var(--muted); white-space: nowrap; }
.attachment-list button { display: grid; flex: 0 0 auto; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 7px; color: var(--muted); background: transparent; cursor: pointer; }
.composer-actions { display: flex; min-width: 0; align-items: center; gap: 10px; }
.attach { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 9px; border: 0; border-radius: 10px; color: var(--muted); font-size: 13px; font-weight: 610; background: transparent; cursor: pointer; transition: color 150ms ease,background-color 150ms ease,transform 120ms cubic-bezier(.23,1,.32,1); }
.attach:hover { color: var(--text); background: var(--surface-raised); }
.attach:active { transform: scale(.97); }
.privacy { min-width: 0; overflow: hidden; color: var(--muted); font-size: 12px; font-weight: 520; text-overflow: ellipsis; white-space: nowrap; }
.send { display: grid; place-items: center; width: 42px; height: 42px; margin-left: auto; padding: 0; border: 0; border-radius: 999px; color: var(--acid-ink); background: var(--acid); cursor: pointer; line-height: 1; transition: transform 120ms cubic-bezier(.23,1,.32,1),opacity 120ms ease,background-color 150ms ease; }
.send:active:not(:disabled) { transform: scale(.96); }
.send:disabled { color: var(--muted); background: var(--surface-raised); cursor: not-allowed; opacity: .58; }
.attach:focus-visible,.send:focus-visible,.attachment-list button:focus-visible { outline: 2px solid var(--acid); outline-offset: 2px; }
@media (max-width: 799px) {
  .composer-box { padding: 13px 12px 10px; border-radius: 18px; }
  textarea,.compact textarea { min-height: 68px; }
  .privacy { display: none; }
  .attach span { display: none; }
  .attach { display: grid; padding: 0; place-items: center; gap: 0; }
  .attach,.send,.attachment-list button { min-width: 44px; min-height: 44px; }
}
@media (hover: hover) and (pointer: fine) {
  .send:hover:not(:disabled) { transform: translateY(-1px); }
}
@media (prefers-reduced-motion: reduce) {
  .composer-box,.attach,.send { transition-duration: 0s !important; }
}
</style>
