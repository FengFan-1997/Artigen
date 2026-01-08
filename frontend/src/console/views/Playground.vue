<template>
  <div class="playground-container">
    <a-row :gutter="24">
      <!-- Left Panel: Settings -->
      <a-col :xs="24" :lg="8">
        <a-card title="Generation Settings" :bordered="false" class="settings-card">
          <a-form layout="vertical">
            <a-form-item label="Prompt" required>
              <a-textarea
                v-model:value="form.prompt"
                :rows="4"
                placeholder="Describe your image..."
                :maxLength="1000"
                show-count
              />
            </a-form-item>

            <a-form-item label="Negative Prompt">
              <a-textarea
                v-model:value="form.negativePrompt"
                :rows="2"
                placeholder="What to exclude..."
              />
            </a-form-item>

            <a-form-item label="Image Size">
              <a-select v-model:value="form.imageSize">
                <a-select-option value="1024x1024">Square (1024x1024)</a-select-option>
                <a-select-option value="768x1024">Portrait (768x1024)</a-select-option>
                <a-select-option value="1024x768">Landscape (1024x768)</a-select-option>
                <a-select-option value="512x512">Square Small (512x512)</a-select-option>
              </a-select>
            </a-form-item>

            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="Steps">
                  <a-input-number
                    v-model:value="form.steps"
                    :min="1"
                    :max="50"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="Guidance Scale">
                  <a-input-number
                    v-model:value="form.guidanceScale"
                    :min="1"
                    :max="20"
                    :step="0.1"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
            </a-row>

            <a-form-item label="Seed">
              <a-input-number
                v-model:value="form.seed"
                style="width: 100%"
                placeholder="Random (-1)"
              />
            </a-form-item>

            <a-form-item label="Reference Image (Optional)">
              <a-upload-dragger
                name="file"
                :multiple="false"
                :before-upload="beforeUpload"
                :show-upload-list="false"
              >
                <p class="ant-upload-drag-icon">
                  <inbox-outlined />
                </p>
                <p class="ant-upload-text">Click or drag file to this area to upload</p>
                <div v-if="imageUrl" class="uploaded-image-preview">
                  <img :src="imageUrl" alt="Reference" />
                  <delete-outlined class="remove-icon" @click.stop="clearImage" />
                </div>
              </a-upload-dragger>
            </a-form-item>

            <a-button type="primary" block size="large" :loading="loading" @click="handleGenerate">
              {{ loading ? 'Generating...' : 'Generate Image' }}
            </a-button>
          </a-form>
        </a-card>
      </a-col>

      <!-- Right Panel: Result -->
      <a-col :xs="24" :lg="16">
        <a-card title="Result" :bordered="false" class="result-card">
          <div class="result-area">
            <a-empty
              v-if="!resultImage && !loading"
              description="Enter a prompt and click Generate to see results"
            />

            <div v-if="loading" class="loading-state">
              <a-spin size="large" tip="Dreaming..." />
            </div>

            <div v-if="resultImage" class="image-display">
              <a-image :src="resultImage" />
              <div class="image-actions" style="margin-top: 16px">
                <a-button type="link" :href="resultImage" download="generated-image.png"
                  >Download</a-button
                >
              </div>
            </div>
          </div>
        </a-card>

        <!-- Debug/Logs -->
        <a-card v-if="logs.length" title="Logs" size="small" style="margin-top: 16px">
          <div class="logs-container">
            <div v-for="(log, index) in logs" :key="index" class="log-entry">
              {{ log }}
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { InboxOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import { useConsoleStore } from '@/stores/console';
import { useAuth } from '@/agent/composables/useAuth';
import { getCurrentUserId } from '@/login/session';

const { currentUser } = useAuth();
const userId = computed(() => currentUser.value?.userId || getCurrentUserId());
const consoleStore = useConsoleStore();

const loading = ref(false);
const resultImage = ref('');
const imageUrl = ref('');
const logs = ref<string[]>([]);

const form = reactive({
  prompt: '',
  negativePrompt: '',
  imageSize: '1024x1024',
  steps: 25,
  guidanceScale: 7.5,
  seed: undefined as number | undefined
});

onMounted(() => {
  consoleStore.init();
});

const beforeUpload = (file: File) => {
  const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
  if (!isJpgOrPng) {
    message.error('You can only upload JPG/PNG file!');
    return false;
  }
  const isLt2M = file.size / 1024 / 1024 < 2;
  if (!isLt2M) {
    message.error('Image must smaller than 2MB!');
    return false;
  }

  // Convert to base64
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    imageUrl.value = reader.result as string;
  };
  return false; // Prevent default upload
};

const clearImage = () => {
  imageUrl.value = '';
};

const handleGenerate = async () => {
  if (!form.prompt.trim()) {
    message.warning('Please enter a prompt');
    return;
  }

  // Check points
  const user = consoleStore.getUserById(userId.value);
  if (user && user.points < 5) {
    message.error('Insufficient credits. Please recharge.');
    return;
  }

  loading.value = true;
  resultImage.value = '';
  logs.value = [];
  logs.value.push(`Starting generation with prompt: ${form.prompt.substring(0, 50)}...`);

  try {
    // Simulate generation delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock Result
    const mockImages = [
      'https://picsum.photos/1024/1024?random=1',
      'https://picsum.photos/1024/1024?random=2',
      'https://picsum.photos/1024/1024?random=3'
    ];
    const finalImage = mockImages[Math.floor(Math.random() * mockImages.length)];

    resultImage.value = finalImage;
    logs.value.push('Generation completed successfully (Simulated).');

    // Update Console Store
    consoleStore.updatePoints(
      userId.value,
      -5,
      'usage',
      `Image Generation: ${form.prompt.substring(0, 20)}...`
    );

    consoleStore.generatedContent.push({
      id: crypto.randomUUID(),
      userId: userId.value,
      type: 'image',
      contentUrl: finalImage,
      prompt: form.prompt,
      timestamp: Date.now()
    });

    consoleStore.logActivity(userId.value, 'generate_image', {
      prompt: form.prompt,
      params: { ...form }
    });

    consoleStore.save();
  } catch (err: any) {
    console.error(err);
    message.error('Generation failed: ' + err.message);
    logs.value.push(`Error: ${err.message}`);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.playground-container {
  padding: 24px;
}
.settings-card {
  height: 100%;
}
.result-card {
  min-height: 500px;
}
.result-area {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}
.loading-state {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: 10;
}
.image-display {
  width: 100%;
  text-align: center;
}
.image-display :deep(.ant-image-img) {
  max-width: 100%;
  max-height: 600px;
  object-fit: contain;
}
.uploaded-image-preview {
  margin-top: 10px;
  position: relative;
  display: inline-block;
}
.uploaded-image-preview img {
  max-width: 100%;
  max-height: 150px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
}
.remove-icon {
  position: absolute;
  top: 5px;
  right: 5px;
  color: #ff4d4f;
  background: white;
  border-radius: 50%;
  padding: 4px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.logs-container {
  background: #1e1e1e;
  color: #00ff00;
  padding: 10px;
  font-family: monospace;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  font-size: 12px;
}
</style>
