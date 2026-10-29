<template>
  <form class="composer-box" :class="{ compact }" :aria-busy="busy" @submit="onSubmit">
    <AttachmentStrip v-if="attachments.length" :attachments="attachments" :disabled="disabled || busy" :remove-label="removeAttachmentLabel" :zh="zh" @remove="emit('remove-attachment', $event)" />
    <textarea
      ref="textarea"
      :value="draft"
      :name="inputName"
      rows="2"
      maxlength="20000"
      autocomplete="off"
      :placeholder="placeholder"
      :aria-label="requestLabel"
      :disabled="disabled"
      @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
      @compositionstart="composing = true"
      @compositionend="composing = false"
      @keydown="onKeydown"
    ></textarea>
    <div class="composer-actions">
      <button v-if="allowAttachments" class="attach" type="button" :disabled="disabled || busy" :aria-label="`${attachLabel}: ${attachmentHint}`" :title="attachmentHint" @click="emit('attach')">
        <WorkspaceIcon name="attachment" />
        <span>{{ attachments.length ? `${attachments.length} ${attachmentCountLabel}` : attachLabel }}</span>
      </button>
      <span v-if="busy" class="composer-status" role="status">{{ busyLabel }}</span>
      <span v-else-if="attachments.length" class="privacy">{{ attachmentHint }}</span>
      <button class="send" type="submit" :disabled="!canSubmit" :aria-label="sendLabel" @click="onSendClick">
        <WorkspaceIcon name="send" :size="20" />
      </button>
    </div>
    <div v-if="helpText || keyboardHint" class="composer-help"><span>{{ helpText }}</span><span class="keyboard-hint">{{ keyboardHint }}</span></div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import WorkspaceIcon from '../workspace/WorkspaceIcon.vue';
import AttachmentStrip from './AttachmentStrip.vue';

const props = withDefaults(defineProps<{
  draft: string;
  attachments: ReadonlyArray<{ clientId: string; name: string; byteSize: number; mimeType?: string; file?: File }>;
  zh?: boolean;
  busy?: boolean;
  disabled?: boolean;
  allowAttachments?: boolean;
  busyLabel?: string;
  helpText?: string;
  keyboardHint?: string;
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
  zh: false,
  busy: false,
  disabled: false,
  allowAttachments: true,
  busyLabel: 'Sending…',
  helpText: '',
  keyboardHint: '',
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
const composing = ref(false);
const canSubmit = computed(() => !props.disabled && !props.busy && Boolean(props.draft.trim()) && props.draft.length <= 20000);
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || composing.value || event.keyCode === 229) return;
  event.preventDefault();
  if (canSubmit.value && !event.repeat) emit('submit');
};
const onSubmit = (event: SubmitEvent) => {
  event.preventDefault();
  if (canSubmit.value && !composing.value) emit('submit');
};
// A native double-click can dispatch a second submit after a very fast
// request has already resolved. Suppress only that second pointer activation;
// an intentional later click must still be allowed to refresh the quote.
const onSendClick = (event: MouseEvent) => {
  if (event.detail > 1) event.preventDefault();
};

const focusAtEnd = () => {
  const element = textarea.value;
  if (!element) return;
  element.focus();
  element.setSelectionRange(element.value.length, element.value.length);
};

defineExpose({ focus: () => textarea.value?.focus(), focusAtEnd });
watch([() => props.draft, () => props.compact], async () => {
  await nextTick();
  const element = textarea.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${Math.min(180, Math.max(props.compact ? 64 : 78, element.scrollHeight))}px`;
}, { immediate: true });
</script>

<style scoped>
.composer-box { width: 100%; min-width: 0; padding: 15px 16px 12px; border: 0; border-radius: 20px; color: var(--text); background: var(--surface); box-shadow: 0 18px 54px rgb(0 0 0 / 24%); transition: box-shadow 180ms cubic-bezier(.23,1,.32,1),background-color 180ms ease; }
.composer-box:focus-within { background: var(--surface-raised); box-shadow: 0 22px 62px rgb(0 0 0 / 30%), inset 0 0 0 2px var(--focus); }
textarea { display: block; width: 100%; min-height: 78px; max-height: min(180px, 24dvh); box-sizing: border-box; padding: 5px 6px 10px; resize: none; border: 0; outline: 0; color: var(--text); font: inherit; font-size: 16px; line-height: 1.58; background: transparent; }
.composer-box textarea:focus-visible { outline: 0; }
textarea::placeholder { color: var(--muted); }
.compact textarea { min-height: 64px; }
.composer-actions { display: flex; min-width: 0; align-items: center; gap: 10px; }
.attach { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 9px; border: 0; border-radius: 10px; color: var(--muted); font-size: 13px; font-weight: 610; background: transparent; cursor: pointer; transition: color 150ms ease,background-color 150ms ease,transform 120ms cubic-bezier(.23,1,.32,1); }
.attach:hover { color: var(--text); background: var(--surface-raised); }
.attach:active { transform: scale(.97); }
.privacy { min-width: 0; overflow: hidden; color: var(--muted); font-size: 12px; font-weight: 520; text-overflow: ellipsis; white-space: nowrap; }
.composer-status { min-width: 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.composer-help { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 14px; padding: 10px 6px 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.keyboard-hint { margin-left: auto; }
.attach:disabled { opacity: .5; cursor: not-allowed; }
textarea:disabled { color: var(--muted); cursor: not-allowed; }
.send { flex:0 0 auto; display: grid; place-items: center; width: 42px; height: 42px; margin-left: auto; padding: 0; border: 0; border-radius: 999px; color: var(--acid-ink); background: var(--acid); cursor: pointer; line-height: 1; transition: transform 120ms cubic-bezier(.23,1,.32,1),opacity 120ms ease,background-color 150ms ease; }
.send:active:not(:disabled) { transform: scale(.96); }
.send:disabled { color: var(--muted); background: var(--surface-raised); cursor: not-allowed; opacity: .58; }
.attach:focus-visible,.send:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (max-width: 799px) {
  .composer-box { padding: 13px 12px 10px; border-radius: 18px; }
  textarea,.compact textarea { min-height: 68px; }
  .privacy { display: none; }
  .keyboard-hint { display: none; }
  .attach span { display: none; }
  .attach { display: grid; padding: 0; place-items: center; gap: 0; }
  .attach,.send { min-width: 44px; min-height: 44px; }
}
@media (hover: hover) and (pointer: fine) {
  .send:hover:not(:disabled) { transform: translateY(-1px); }
}
@media (prefers-reduced-motion: reduce) {
  .composer-box,.attach,.send { transition-duration: 0s !important; }
}
</style>
