<template>
  <div class="playground-container">
    <a-row :gutter="24">
      <!-- Left Panel: Settings -->
      <a-col :xs="24" :lg="8">
        <a-card :title="ui.generationSettings" :bordered="false" class="settings-card">
          <a-form layout="vertical">
            <a-form-item :label="ui.prompt" required>
              <a-textarea
                v-model:value="form.prompt"
                :rows="4"
                :placeholder="ui.promptPh"
                :maxLength="1000"
                show-count
              />
            </a-form-item>

            <a-form-item :label="ui.negativePrompt">
              <a-textarea
                v-model:value="form.negativePrompt"
                :rows="2"
                :placeholder="ui.negativePromptPh"
              />
            </a-form-item>

            <a-form-item :label="ui.imageSize">
              <a-select v-model:value="form.imageSize">
                <a-select-option value="1024x1024">{{ ui.square1024 }}</a-select-option>
                <a-select-option value="768x1024">{{ ui.portrait }}</a-select-option>
                <a-select-option value="1024x768">{{ ui.landscape }}</a-select-option>
                <a-select-option value="512x512">{{ ui.squareSmall }}</a-select-option>
              </a-select>
            </a-form-item>

            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item :label="ui.steps">
                  <a-input-number
                    v-model:value="form.steps"
                    :min="1"
                    :max="50"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item :label="ui.guidanceScale">
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

            <a-form-item :label="ui.seed">
              <a-input-number
                v-model:value="form.seed"
                style="width: 100%"
                :placeholder="ui.seedPh"
              />
            </a-form-item>

            <a-form-item :label="ui.referenceImage">
              <a-upload-dragger
                name="file"
                :multiple="false"
                :before-upload="beforeUpload"
                :show-upload-list="false"
              >
                <p class="ant-upload-drag-icon">
                  <inbox-outlined />
                </p>
                <p class="ant-upload-text">{{ ui.uploadHint }}</p>
                <div v-if="imageUrl" class="uploaded-image-preview">
                  <img :src="imageUrl" alt="Reference" />
                  <delete-outlined class="remove-icon" @click.stop="clearImage" />
                </div>
              </a-upload-dragger>
            </a-form-item>

            <a-button type="primary" block size="large" :loading="loading" @click="handleGenerate">
              {{ loading ? ui.generating : ui.generateImage }}
            </a-button>
          </a-form>
        </a-card>
      </a-col>

      <!-- Right Panel: Result -->
      <a-col :xs="24" :lg="16">
        <a-card :title="ui.result" :bordered="false" class="result-card">
          <div class="result-area">
            <a-empty v-if="!resultImage && !loading" :description="ui.emptyDesc" />

            <div v-if="loading" class="loading-state">
              <a-spin size="large" :tip="ui.dreaming" />
            </div>

            <div v-if="resultImage" class="image-display">
              <a-image :src="resultImage" />
              <div class="image-actions" style="margin-top: 16px">
                <a-button type="link" :href="resultImage" download="generated-image.png">{{
                  ui.download
                }}</a-button>
              </div>
            </div>
          </div>
        </a-card>

        <!-- Debug/Logs -->
        <a-card v-if="logs.length" :title="ui.logs" size="small" style="margin-top: 16px">
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
import { getConsoleUserId, useConsoleStore } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const userId = computed(() => getConsoleUserId());
const consoleStore = useConsoleStore();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        generationSettings: '生成设置',
        prompt: '提示词',
        promptPh: '描述你想生成的图片…',
        negativePrompt: '反向提示词',
        negativePromptPh: '不希望出现的内容…',
        imageSize: '图片尺寸',
        square1024: '正方形（1024x1024）',
        portrait: '竖版（768x1024）',
        landscape: '横版（1024x768）',
        squareSmall: '小图正方形（512x512）',
        steps: '步数',
        guidanceScale: '引导强度',
        seed: '随机种子',
        seedPh: '随机（-1）',
        referenceImage: '参考图（可选）',
        uploadHint: '点击或拖拽文件到此区域上传',
        generating: '生成中…',
        generateImage: '生成图片',
        result: '结果',
        emptyDesc: '输入提示词并点击生成，即可看到结果',
        dreaming: '生成中…',
        download: '下载',
        logs: '日志',
        onlyJpgPng: '仅支持上传 JPG/PNG 文件！',
        max2m: '图片大小不能超过 2MB！',
        enterPrompt: '请输入提示词',
        insufficientCredits: '点数不足，请先充值。',
        promptOptimization: '提示词优化',
        startLog: (p: string) => `开始生成，提示词：${p}...`,
        doneLog: '生成完成（模拟）。',
        failed: (msg: string) => `生成失败：${msg}`
      }
    : {
        generationSettings: 'Generation Settings',
        prompt: 'Prompt',
        promptPh: 'Describe your image...',
        negativePrompt: 'Negative Prompt',
        negativePromptPh: 'What to exclude...',
        imageSize: 'Image Size',
        square1024: 'Square (1024x1024)',
        portrait: 'Portrait (768x1024)',
        landscape: 'Landscape (1024x768)',
        squareSmall: 'Square Small (512x512)',
        steps: 'Steps',
        guidanceScale: 'Guidance Scale',
        seed: 'Seed',
        seedPh: 'Random (-1)',
        referenceImage: 'Reference Image (Optional)',
        uploadHint: 'Click or drag file to this area to upload',
        generating: 'Generating...',
        generateImage: 'Generate Image',
        result: 'Result',
        emptyDesc: 'Enter a prompt and click Generate to see results',
        dreaming: 'Dreaming...',
        download: 'Download',
        logs: 'Logs',
        onlyJpgPng: 'You can only upload JPG/PNG file!',
        max2m: 'Image must smaller than 2MB!',
        enterPrompt: 'Please enter a prompt',
        insufficientCredits: 'Insufficient credits. Please recharge.',
        promptOptimization: 'Prompt Optimization',
        startLog: (p: string) => `Starting generation with prompt: ${p}...`,
        doneLog: 'Generation completed successfully (Simulated).',
        failed: (msg: string) => `Generation failed: ${msg}`
      }
);

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
    message.error(ui.value.onlyJpgPng);
    return false;
  }
  const isLt2M = file.size / 1024 / 1024 < 2;
  if (!isLt2M) {
    message.error(ui.value.max2m);
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
    message.warning(ui.value.enterPrompt);
    return;
  }

  // Check points
  const user = consoleStore.getUserById(userId.value);
  if (user && user.points < 5) {
    message.error(ui.value.insufficientCredits);
    return;
  }

  loading.value = true;
  resultImage.value = '';
  logs.value = [];
  logs.value.push(ui.value.startLog(form.prompt.substring(0, 50)));

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
    logs.value.push(ui.value.doneLog);

    // Update Console Store
    consoleStore.updatePoints(userId.value, -5, 'usage', ui.value.promptOptimization);

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
    message.error(ui.value.failed(String(err?.message || '')));
    logs.value.push(ui.value.failed(String(err?.message || '')));
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

@media (max-width: 768px) {
  .playground-container {
    padding: 12px;
  }

  .settings-card {
    height: auto;
    margin-bottom: 16px;
  }

  .result-card {
    min-height: 360px;
  }

  .result-area {
    min-height: 280px;
  }
}

@media (max-width: 480px) {
  .playground-container {
    padding: 8px;
  }

  :deep(.ant-form-item) {
    margin-bottom: 12px;
  }

  :deep(.ant-card-body) {
    padding: 12px;
  }

  .uploaded-image-preview img {
    max-height: 100px;
  }

  .result-card {
    min-height: auto;
  }

  .result-area {
    min-height: 200px;
  }
}
</style>
