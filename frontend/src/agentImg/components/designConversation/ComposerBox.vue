<template>
  <form class="composer-box" :class="{ compact }" @submit.prevent="emit('submit')">
    <textarea
      ref="textarea"
      :value="draft"
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
.composer-box { padding: 13px 14px 12px; border: 1px solid #bfc3b6; border-radius: 22px; background: #fff; box-shadow: 0 16px 50px rgba(16,17,15,.09); }
.composer-box:focus-within { border-color: #11120f; box-shadow: 0 16px 50px rgba(16,17,15,.12), 0 0 0 3px rgba(199,255,25,.45); }
textarea { display: block; width: 100%; min-height: 68px; max-height: 180px; padding: 6px 7px; resize: none; border: 0; outline: 0; color: #10110f; font: inherit; font-size: 16px; line-height: 1.55; background: transparent; }
textarea::placeholder { color: #696d64; }
.compact textarea { min-height: 54px; }
.attachment-list { display: flex; flex-wrap: wrap; gap: 7px; padding: 5px 6px 11px; }
.attachment-list > span { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 6px 8px; border: 1px solid #d9dcd2; border-radius: 9px; font-size: 11px; background: #f7f8f2; }
.attachment-list svg,.attach svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.attachment-list b { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-list small { color: #6d7068; white-space: nowrap; }
.attachment-list button { border: 0; color: #555850; background: transparent; cursor: pointer; }
.composer-actions { display: flex; align-items: center; gap: 9px; }
.attach { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 10px; border: 1px solid #d5d8ce; border-radius: 10px; color: #3e413b; font-size: 12px; font-weight: 700; background: #fafbf6; cursor: pointer; }
.attach:hover { border-color: #9da194; }
.privacy { color: #83877d; font-size: 9px; font-weight: 820; letter-spacing: .12em; }
.send { display: grid; place-items: center; width: 42px; height: 42px; margin-left: auto; border: 1px solid #0e0f0d; border-radius: 50%; color: #0e0f0d; background: #c7ff19; cursor: pointer; }
.send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 0 #10110f; }
.send:disabled { border-color: #d0d3c8; color: #a6a99f; background: #eff0e9; cursor: not-allowed; }
.send svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; }
@media (max-width: 620px) {
  .composer-box { border-radius: 18px; }
  .privacy { display: none; }
  .attach span { font-size: 0; }
  .attach span::after { content: '附件'; font-size: 12px; }
}
</style>
