<template>
  <transition name="fade">
    <div v-if="visible" class="modal-overlay" @click="$emit('close')">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <div class="header-left">
            <span class="header-icon" v-html="icon"></span>
            <span class="header-title">{{ title }}</span>
          </div>
          <CloseButton @click="$emit('close')" />
        </div>
        <div class="modal-subtitle">{{ subtitle }}</div>

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
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import CloseButton from './CloseButton.vue';
import ImageUploadArea from './ImageUploadArea.vue';

defineProps<{
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

defineEmits<{
  (e: 'close'): void;
  (e: 'update:selectedFile', file: File | null): void;
}>();
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
  font-size: 18px;
  font-weight: 700;
  color: #fff;
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
</style>
