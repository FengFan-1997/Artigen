<template>
  <transition name="fade">
    <div v-if="visible" class="modal-overlay" @click.self="closePopup">
      <section
        ref="dialogRef"
        class="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="base-task-popup-title"
        aria-describedby="base-task-popup-subtitle"
        tabindex="-1"
        @keydown="onDialogKeydown"
      >
        <div class="modal-header">
          <div class="header-left">
            <span class="header-icon" aria-hidden="true" v-html="icon"></span>
            <h2 id="base-task-popup-title" class="header-title">{{ title }}</h2>
          </div>
          <CloseButton @click="closePopup" />
        </div>
        <div id="base-task-popup-subtitle" class="modal-subtitle">{{ subtitle }}</div>

        <div class="modal-body">
          <ImageUploadArea
            :model-value="selectedFile"
            @update:model-value="$emit('update:selectedFile', $event)"
            :upload-text="uploadText"
            :upload-hint="uploadHint"
            :reupload-text="reuploadText"
            :placeholder-icon="placeholderIcon"
            :disabled="loading"
          />

          <div class="config-panel">
            <slot name="config"></slot>
          </div>
        </div>
      </section>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import CloseButton from './CloseButton.vue';
import ImageUploadArea from './ImageUploadArea.vue';

const props = defineProps<{
  visible: boolean;
  title: string;
  subtitle: string;
  icon: string;
  uploadText: string;
  uploadHint: string;
  reuploadText: string;
  placeholderIcon?: string;
  loading?: boolean;
  selectedFile: File | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:selectedFile', file: File | null): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      returnFocus = globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;
      await nextTick();
      dialogRef.value?.focus();
      return;
    }
    restoreFocus();
  },
  { immediate: true }
);

onBeforeUnmount(restoreFocus);

function closePopup(): void {
  emit('close');
}

function restoreFocus(): void {
  returnFocus?.focus();
  returnFocus = null;
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePopup();
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) {
    event.preventDefault();
    dialogRef.value.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && globalThis.document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && globalThis.document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-container {
  width: 900px;
  max-width: 95vw;
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  font-family: var(--common-font);
  box-sizing: border-box;
  max-height: calc(100vh - 32px);
  overflow: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-family: 'JetBrains Mono', monospace;
  border: 1px solid #fff;
  padding: 2px 6px;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.modal-container:focus-visible {
  outline: none;
}

.modal-container :deep(button:focus-visible),
.modal-container :deep(input:focus-visible),
.modal-container :deep(select:focus-visible),
.modal-container :deep(textarea:focus-visible),
.modal-container :deep([tabindex]:focus-visible) {
  outline: 2px solid #ccff00;
  outline-offset: 2px;
}

.modal-subtitle {
  color: #888;
  font-size: 12px;
  margin-bottom: 24px;
  margin-left: 54px;
}

.modal-body {
  display: flex;
  gap: 24px;
  height: 500px;
}

.config-panel {
  width: 300px;
  background: #161616;
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 960px) {
  .modal-container {
    width: 100%;
    height: 100%;
    max-width: none;
    border-radius: 0;
    padding: 16px;
    max-height: none;
  }

  .modal-body {
    flex-direction: column;
    height: auto;
    flex: 1;
    overflow-y: auto;
  }

  .config-panel {
    width: 100% !important;
    flex: none;
  }

  .modal-subtitle {
    margin-left: 0;
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
