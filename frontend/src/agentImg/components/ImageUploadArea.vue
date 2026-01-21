<template>
  <div
    class="upload-area"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
    @click="triggerFileSelect"
    :class="{ 'drag-over': isDragOver, 'has-file': !!previewUrl, disabled }"
  >
    <input
      type="file"
      ref="fileInput"
      class="hidden-input"
      :accept="accept"
      :disabled="disabled"
      @change="onFileSelect"
    />

    <template v-if="previewUrl">
      <img :src="previewUrl" class="preview-img" alt="Preview" />
      <div class="reupload-overlay">
        <span>{{ reuploadText }}</span>
      </div>
    </template>
    <template v-else>
      <div class="upload-placeholder">
        <div class="folder-icon">{{ placeholderIcon }}</div>
        <div class="upload-text">{{ uploadText }}</div>
        <div class="upload-hint">{{ uploadHint }}</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: File | null;
    uploadText: string;
    uploadHint: string;
    reuploadText: string;
    placeholderIcon?: string;
    accept?: string;
    disabled?: boolean;
  }>(),
  {
    placeholderIcon: '📁',
    accept: 'image/*',
    disabled: false
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: File | null): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const isDragOver = ref(false);

const previewObjectUrl = ref<string>('');
const previewUrl = computed(() => previewObjectUrl.value);

const revokePreviewUrl = () => {
  try {
    if (previewObjectUrl.value) URL.revokeObjectURL(previewObjectUrl.value);
  } catch {}
  previewObjectUrl.value = '';
};

const syncPreviewFromFile = (file: File | null) => {
  revokePreviewUrl();
  if (!file) return;
  previewObjectUrl.value = URL.createObjectURL(file);
};

watch(
  () => props.modelValue,
  (file) => {
    syncPreviewFromFile(file);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  revokePreviewUrl();
});

const triggerFileSelect = () => {
  if (props.disabled) return;
  fileInput.value?.click();
};

const handleFile = (file: File) => {
  if (props.disabled) return;
  if (!file.type.startsWith('image/')) return;
  emit('update:modelValue', file);
  try {
    if (fileInput.value) fileInput.value.value = '';
  } catch {}
};

const onFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) handleFile(input.files[0]);
};

const handleDragOver = () => {
  if (props.disabled) return;
  isDragOver.value = true;
};

const handleDragLeave = () => {
  isDragOver.value = false;
};

const handleDrop = (e: DragEvent) => {
  isDragOver.value = false;
  if (props.disabled) return;
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
};
</script>

<style scoped>
.upload-area {
  margin-top: 10px;
  flex: 1;
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  background: rgba(10, 10, 10, 0.6);
}

.upload-area.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.upload-area::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    linear-gradient(90deg, transparent 0%, rgba(204, 255, 0, 0.03) 50%, transparent 100%),
    radial-gradient(circle at center, rgba(204, 255, 0, 0.05) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.upload-area.drag-over,
.upload-area:hover {
  border-color: #ccff00;
  background: rgba(15, 15, 15, 0.9);
  box-shadow:
    0 0 40px rgba(204, 255, 0, 0.15),
    inset 0 0 20px rgba(204, 255, 0, 0.05);
  transform: translateY(-2px);
}

.upload-area.disabled:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(10, 10, 10, 0.6);
  box-shadow: none;
  transform: none;
}

.upload-area:hover::before {
  opacity: 1;
}

.hidden-input {
  display: none;
}

.upload-placeholder {
  text-align: center;
  transition: transform 0.3s ease;
}

.upload-area:hover .upload-placeholder {
  transform: scale(1.05);
}

.folder-icon {
  font-size: 64px;
  margin-bottom: 24px;
  opacity: 0.8;
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.1));
}

.upload-area:hover .folder-icon {
  filter: drop-shadow(0 0 15px rgba(204, 255, 0, 0.3));
}

.upload-text {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #fff;
}

.upload-hint {
  font-size: 12px;
  color: #666;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.reupload-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.reupload-overlay span {
  color: #fff;
  border: 1px solid #fff;
  padding: 8px 16px;
  border-radius: 4px;
}

.upload-area:hover .reupload-overlay {
  opacity: 1;
}

@media (max-width: 960px) {
  .upload-area {
    min-height: 300px;
    flex: none;
  }
}
</style>
