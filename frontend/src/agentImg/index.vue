<template>
  <div class="agentimg-page">
    <div class="tool-container">
      <header class="tool-header">
        <div class="header-left">
          <button class="mobile-menu-btn" @click="showMobileSettings = !showMobileSettings">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </button>

          <div class="mark">
            <div class="mark-dot"></div>
            <div class="mark-text">
              <h1>AgentImg</h1>
              <p class="subtitle">AI Product Photography · Professional Grade</p>
            </div>
          </div>
        </div>

        <div class="header-center">
          <div class="header-actions">
            <button class="ghost" @click="resetAll" :disabled="loading">重置</button>
            <div class="credits-badge" v-if="creditsBalance">
              <span class="credits-label">能量</span>
              <span class="credits-value">{{ creditsBalance.available }}</span>
            </div>
          </div>
        </div>

        <div class="header-right">
          <router-link to="/agentimg" class="back-link">Back</router-link>
        </div>
      </header>

      <div class="workspace">
        <div
          class="mobile-overlay"
          v-if="showMobileSettings"
          @click="showMobileSettings = false"
        ></div>

        <!-- LEFT: Product Configuration -->
        <aside class="side" :class="{ 'mobile-open': showMobileSettings }">
          <div class="scroll-container">
            <section class="card settings-card">
              <div class="card-title">产品档案</div>

              <div class="form-group">
                <div class="field">
                  <div class="label">产品名称</div>
                  <input
                    v-model="productName"
                    class="control"
                    type="text"
                    placeholder="例如：极光精华液"
                    :disabled="loading"
                  />
                </div>
                <div class="field">
                  <div class="label">所属品牌</div>
                  <input
                    v-model="brandName"
                    class="control"
                    type="text"
                    placeholder="例如：LUMINA"
                    :disabled="loading"
                  />
                </div>
              </div>

              <div class="field">
                <div class="label">产品品类</div>
                <div class="select-wrapper">
                  <select v-model="productCategory" class="control select" :disabled="loading">
                    <option value="" disabled selected>选择品类...</option>
                    <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                  </select>
                </div>
              </div>

              <div class="field">
                <div class="label">核心材质</div>
                <input
                  v-model="material"
                  class="control"
                  type="text"
                  placeholder="例如：磨砂玻璃、透明塑料"
                  :disabled="loading"
                />
              </div>

              <div class="card-divider"></div>
              <div class="card-title">视觉风格</div>

              <div class="field">
                <div class="label">拍摄场景</div>
                <input
                  v-model="sceneType"
                  class="control"
                  type="text"
                  placeholder="例如：纯色摄影棚、自然光影"
                  :disabled="loading"
                />
              </div>

              <div class="field">
                <div class="label">布光风格</div>
                <input
                  v-model="lighting"
                  class="control"
                  type="text"
                  placeholder="例如：柔和漫射、强对比侧光"
                  :disabled="loading"
                />
              </div>

              <div class="field">
                <div class="label">主色调</div>
                <input
                  v-model="primaryColor"
                  class="control"
                  type="text"
                  placeholder="例如：#FF5500 或 暖橙色"
                  :disabled="loading"
                />
              </div>

              <div class="card-divider"></div>
              <div class="card-title">品牌资产</div>

              <div class="field">
                <div class="label">Logo 文件</div>
                <div class="file-input-wrapper">
                  <input
                    type="file"
                    accept="image/png,image/svg+xml"
                    @change="onLogoChange"
                    :disabled="loading"
                  />
                  <div class="file-trigger" :class="{ 'has-file': logoFileName }">
                    <span v-if="logoFileName" class="file-name">{{ logoFileName }}</span>
                    <span v-else class="placeholder">点击上传 PNG/SVG</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div class="side-footer">
            <button class="primary side-action-btn" @click="onPrimary" :disabled="!canPrimary">
              <span v-if="loading" class="loading-spinner"></span>
              <span v-else>{{ primaryText }}</span>
            </button>
          </div>
        </aside>

        <!-- RIGHT: Chat & Results -->
        <main class="chat-area">
          <div class="chat-scroll">
            <!-- Messages -->
            <div class="messages">
              <!-- User Message -->
              <div
                class="msg msg-user"
                v-if="userInput && (loading || options.length > 0 || finalPrompt)"
              >
                <div class="msg-avatar">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="12" fill="#333" />
                    <path
                      d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"
                      fill="#888"
                    />
                  </svg>
                </div>
                <div class="msg-bubble">
                  {{ userInput }}
                </div>
              </div>

              <!-- Welcome Message -->
              <div
                class="msg msg-ai"
                v-if="!userInput && !loading && !options.length && !finalPrompt"
              >
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble">
                  <p>欢迎使用 AgentImg 产品摄影助手。</p>
                  <p>
                    请在左侧配置您的产品信息，或直接在下方描述您的拍摄需求。我会为您提供专业的视觉方向建议。
                  </p>
                </div>
              </div>

              <!-- Loading State -->
              <div v-if="loading" class="msg msg-ai">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble loading-bubble">
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                </div>
              </div>

              <!-- Error State -->
              <div v-if="error" class="msg msg-ai">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble error-bubble">
                  <div class="error-icon">!</div>
                  <div class="error-text">{{ error }}</div>
                </div>
              </div>

              <!-- Step 1: Direction Options -->
              <div v-if="options.length > 0 && !finalPrompt" class="msg msg-ai">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble">
                  <p
                    class="msg-text-header"
                    style="margin-bottom: 16px; color: var(--text-muted); font-size: 13px"
                  >
                    为您分析出以下视觉方向，请选择：
                  </p>
                  <div class="direction-grid">
                    <div
                      v-for="opt in options"
                      :key="opt.id"
                      class="direction-card"
                      :class="{ selected: selectedOptionId === opt.id }"
                      @click="selectedOptionId = opt.id"
                    >
                      <div class="card-header">
                        <div class="opt-title">{{ opt.title }}</div>
                        <div class="opt-radio"></div>
                      </div>
                      <div class="opt-summary">{{ opt.summary }}</div>
                      <div class="opt-tags">
                        <span v-for="t in opt.styleTags.slice(0, 3)" :key="t">{{ t }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Step 2: Final Result -->
              <div v-if="finalPrompt" class="msg msg-ai">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble">
                  <div class="result-panel">
                    <div class="panel-header">
                      <div class="panel-title">生成结果</div>
                      <button class="copy-btn" @click="copyFinal">
                        {{ copied ? '已复制' : '复制全部' }}
                      </button>
                    </div>

                    <div class="prompt-box">
                      <div class="box-label">Positive Prompt</div>
                      <div class="box-content">{{ finalPrompt.prompt }}</div>
                    </div>

                    <div class="prompt-box negative">
                      <div class="box-label">Negative Prompt</div>
                      <div class="box-content">{{ finalPrompt.negativePrompt }}</div>
                    </div>

                    <div class="params-row" v-if="finalPrompt.params">
                      <div class="param-item" v-for="(val, key) in finalPrompt.params" :key="key">
                        <span class="key">{{ key }}:</span>
                        <span class="val">{{ val }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Chat Footer -->
          <div class="chat-footer">
            <div class="input-wrapper">
              <!-- Preview List -->
              <div class="inner-preview-list" v-if="hasPreviews">
                <div
                  v-for="(url, idx) in previewUrls"
                  :key="idx"
                  v-show="url"
                  class="mini-preview-item"
                >
                  <img :src="url" alt="ref" />
                  <button class="mini-remove-btn" @click="clearPreview(idx)">×</button>
                </div>
              </div>

              <textarea
                v-model="userInput"
                class="textarea"
                placeholder="描述您的画面构想，例如：一瓶放置在冰块上的清爽气泡水，背景是阳光海滩..."
                :disabled="loading"
                maxlength="500"
                @keydown.enter.ctrl="onPrimary"
              ></textarea>

              <div class="input-toolbar">
                <div class="left-tools">
                  <button class="tool-btn" @click="triggerUpload" :disabled="loading">
                    <span class="tool-icon">+</span>
                    <span class="tool-text">添加图片</span>
                  </button>

                  <label class="toggle-btn" :class="{ active: deepMode }">
                    <input type="checkbox" v-model="deepMode" :disabled="loading" />
                    <span class="toggle-icon">✦</span>
                    <span class="toggle-text">深度思考</span>
                  </label>

                  <!-- Hidden Inputs -->
                  <input
                    v-for="(url, idx) in previewUrls"
                    :key="'file-' + idx"
                    type="file"
                    accept="image/*"
                    :ref="
                      (el) => {
                        if (el) fileInputs[idx] = el as HTMLInputElement;
                      }
                    "
                    style="display: none"
                    @change="(e) => onPreviewChange(idx, e)"
                    :disabled="loading"
                  />
                </div>

                <div class="right-tools">
                  <span class="footer-hint">Ctrl + Enter 发送</span>
                  <button class="send-btn" @click="onPrimary" :disabled="!canPrimary">
                    <span v-if="loading">...</span>
                    <span v-else>↑</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAgentImgFlow } from './composables/useAgentImgFlow';
import { useAgentImgSettings } from './composables/useAgentImgSettings';
import { getCreditsBalance, type CreditsBalance } from './services/text';

// Static Data
const categories = ['护肤美妆', '食品饮料', '3C数码', '服饰鞋包', '家居生活', '珠宝首饰'];
const materials = ['磨砂玻璃', '透明塑料', '拉丝金属', '原木', '陶瓷', '织物'];
const scenes = ['纯色摄影棚', '自然光影', '极简几何', '户外实景', '超现实霓虹', '生活居家'];
const lightings = ['柔和漫射', '强对比侧光', '轮廓背光', '彩色氛围光'];

const {
  productName,
  productCategory,
  material,
  sceneType,
  lighting,
  primaryColor,
  brandName,
  logoFileName,
  setLogoFile,
  contextText
} = useAgentImgSettings();

const {
  userInput,
  deepMode,
  loading,
  error,
  options,
  selectedOptionId,
  finalPrompt,
  canAnalyze,
  canFinalize,
  reset,
  analyzeDirections,
  generateFinal
} = useAgentImgFlow({
  getContextText: () => contextText.value
});

const copied = ref(false);
const showMobileSettings = ref(false);
const previewUrls = ref<string[]>(['', '']);
const fileInputs = ref<HTMLInputElement[]>([]);
const hasPreviews = computed(() => previewUrls.value.some((u) => !!u));

const triggerUpload = () => {
  // Find first empty slot
  let idx = previewUrls.value.findIndex((u) => !u);
  // If all full, replace the first one (or last one? let's do first)
  if (idx === -1) idx = 0;

  if (fileInputs.value[idx]) {
    fileInputs.value[idx].click();
  }
};

const creditsBalance = ref<CreditsBalance | null>(null);
const creditsLoading = ref(false);

const refreshCredits = async () => {
  if (creditsLoading.value) return;
  creditsLoading.value = true;
  creditsBalance.value = await getCreditsBalance();
  creditsLoading.value = false;
};

const primaryText = computed(() => {
  if (loading.value) return '思考中...';
  if (finalPrompt.value) return '再次生成';
  if (options.value.length > 0 && !finalPrompt.value) return '生成 Prompt';
  return deepMode.value ? '分析视觉方向' : '快速生成';
});

const canPrimary = computed(() => (deepMode.value ? canAnalyze.value : canFinalize.value));

const onPrimary = async () => {
  if (finalPrompt.value) {
    // Reset for new round but keep settings
    finalPrompt.value = null;
    options.value = [];
    selectedOptionId.value = '';
    // If userInput is empty, maybe don't clear it? Or clear it?
    // Let's keep user input for refinement
  }

  if (deepMode.value) {
    if (options.value.length === 0) {
      await analyzeDirections();
    } else {
      await generateFinal();
    }
  } else {
    await generateFinal();
  }

  await refreshCredits();
};

const resetAll = () => {
  productName.value = '';
  brandName.value = '';
  productCategory.value = '';
  material.value = '';
  sceneType.value = '';
  lighting.value = '';
  primaryColor.value = '';
  setLogoFile(null);
  userInput.value = '';
  reset();
};

const onLogoChange = (e: Event) => {
  const input = e.target as HTMLInputElement | null;
  const f = input?.files && input.files.length ? input.files[0] : null;
  setLogoFile(f);
  if (input) input.value = '';
};

const setPreviewUrl = (idx: number, nextUrl: string) => {
  const cur = previewUrls.value[idx];
  if (cur && cur.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(cur);
    } catch {}
  }
  previewUrls.value[idx] = nextUrl;
};

const onPreviewChange = (idx: number, e: Event) => {
  const input = e.target as HTMLInputElement | null;
  const f = input?.files && input.files.length ? input.files[0] : null;
  if (!f) {
    if (input) input.value = '';
    return;
  }
  const url = URL.createObjectURL(f);
  setPreviewUrl(idx, url);
  if (input) input.value = '';
};

const clearPreview = (idx: number) => {
  setPreviewUrl(idx, '');
};

onBeforeUnmount(() => {
  for (let i = 0; i < previewUrls.value.length; i++) setPreviewUrl(i, '');
});

onMounted(async () => {
  await refreshCredits();
});

const copyFinal = async () => {
  if (!finalPrompt.value) return;
  const text = [
    finalPrompt.value.prompt,
    '',
    '---',
    '',
    `negative_prompt: ${finalPrompt.value.negativePrompt}`,
    finalPrompt.value.params ? `params: ${JSON.stringify(finalPrompt.value.params)}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
};
</script>

<style scoped>
@import './styles/cyberpunk.css';

.agentimg-page {
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --primary: #ccff00;
  --primary-dim: rgba(204, 255, 0, 0.15);
  --primary-hover: #b3e600;
  --bg-dark: #050505;
  --bg-card: #111111;
  --border-color: rgba(255, 255, 255, 0.15);
  --border-active: rgba(204, 255, 0, 0.5);

  width: 100%;
  height: 100vh;
  background: var(--bg-dark);
  color: var(--text-main);
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
::-webkit-scrollbar-track {
  background: transparent;
}

.tool-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.agentimg-page,
.agentimg-page * {
  box-sizing: border-box;
}

/* Header */
.tool-header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(5, 5, 5, 0.8);
  backdrop-filter: blur(10px);
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 0 0 auto;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 0;
}

.header-right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
}

.mark {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mark-dot {
  width: 10px;
  height: 10px;
  background: var(--primary);
  border-radius: 2px;
  box-shadow: 0 0 10px var(--primary);
}
.mark-text h1 {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.5px;
}
.subtitle {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex-wrap: wrap;
  row-gap: 8px;
}

.ghost {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.ghost:hover {
  border-color: var(--text-main);
  color: var(--text-main);
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
}

.credits-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border: 1px solid rgba(204, 255, 0, 0.25);
  background: rgba(204, 255, 0, 0.08);
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-main);
}

.credits-label {
  color: var(--text-muted);
  letter-spacing: 0.2px;
}

.credits-value {
  font-family: 'JetBrains Mono', monospace;
  color: var(--primary);
  font-weight: 700;
}

.back-link {
  font-size: 14px;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
}
.back-link:hover {
  color: var(--primary);
  border-color: var(--border-color);
  background: rgba(255, 255, 255, 0.03);
}

.workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
  height: calc(100vh - 64px);
}

.side {
  width: 288px;
  background: rgba(5, 5, 5, 0.6);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 5;
  transition: transform 0.3s ease;
  overflow-x: hidden;
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-divider {
  height: 1px;
  background: var(--border-color);
  margin: 8px 0;
}

.form-group {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.form-group .field {
  min-width: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 12px;
  color: var(--text-muted);
}

.control {
  width: 100%;
  height: 36px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0 12px;
  color: var(--text-main);
  font-size: 13px;
  transition: all 0.2s;
}
.control:hover {
  background: rgba(255, 255, 255, 0.12);
}
.control:focus {
  background: rgba(0, 0, 0, 0.3);
  border-color: var(--primary);
  outline: none;
}
.control:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.select-wrapper {
  position: relative;
}
.select-wrapper::after {
  content: '▼';
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 8px;
  color: var(--text-muted);
  pointer-events: none;
}
.select {
  appearance: none;
  cursor: pointer;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.side-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  background: rgba(5, 5, 5, 0.9);
}

.chip {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid transparent;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.chip:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.chip.active {
  background: var(--primary-dim);
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: 0 0 10px rgba(204, 255, 0, 0.2);
}

.file-input-wrapper {
  position: relative;
  height: 36px;
}
.file-input-wrapper input {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}
.file-trigger {
  width: 100%;
  height: 100%;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
  transition: all 0.2s;
}
.file-input-wrapper:hover .file-trigger {
  border-color: var(--primary);
  color: var(--text-main);
}
.file-trigger.has-file {
  border-style: solid;
  border-color: var(--primary);
  background: var(--primary-dim);
  color: var(--primary);
}

.primary {
  width: 100%;
  height: 44px;
  border-radius: 8px;
  background: var(--primary);
  color: #000;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(204, 255, 0, 0.2);
  border: none;
  cursor: pointer;
}
.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(204, 255, 0, 0.3);
  background: var(--primary-hover);
}
.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

/* Chat Area */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background-image:
    radial-gradient(circle at 50% 0%, rgba(204, 255, 0, 0.03) 0%, transparent 40%),
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size:
    100% 100%,
    40px 40px,
    40px 40px;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
}

/* Messages */
.msg {
  display: flex;
  gap: 16px;
  animation: fadeIn 0.3s ease-out;
}
.msg-user {
  flex-direction: row-reverse;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.msg-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
}
.msg-avatar img,
.msg-avatar svg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.msg-bubble {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  font-size: 14px;
  line-height: 1.6;
  max-width: 80%;
}
.msg-user .msg-bubble {
  background: rgba(204, 255, 0, 0.1);
  border-color: rgba(204, 255, 0, 0.3);
  color: var(--text-main);
}

.loading-bubble {
  display: flex;
  gap: 6px;
  width: fit-content;
}
.typing-dot {
  width: 6px;
  height: 6px;
  background: var(--primary);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}
.typing-dot:nth-child(1) {
  animation-delay: -0.32s;
}
.typing-dot:nth-child(2) {
  animation-delay: -0.16s;
}
@keyframes typing {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.error-bubble {
  border-color: #ff3333 !important;
  background: rgba(255, 51, 51, 0.05) !important;
  color: #ff3333;
  display: flex;
  align-items: center;
  gap: 12px;
}
.error-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ff3333;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* Direction Cards Grid */
.direction-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  animation: fadeIn 0.4s ease-out;
}
.direction-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.direction-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.3);
}
.direction-card.selected {
  border-color: var(--primary);
  background: rgba(204, 255, 0, 0.02);
  box-shadow: 0 0 0 1px var(--primary-dim);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.opt-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}
.opt-radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  position: relative;
}
.direction-card.selected .opt-radio {
  border-color: var(--primary);
}
.direction-card.selected .opt-radio::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
}

.opt-summary {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
  min-height: 40px;
}
.opt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.opt-tags span {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
}

/* Result Panel */
.result-panel {
  background: rgba(25, 25, 25, 0.8);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  animation: fadeIn 0.4s ease-out;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-title::before {
  content: '✦';
}

.copy-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: var(--text-main);
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.prompt-box {
  background: #000;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.prompt-box.negative {
  border-color: rgba(255, 51, 51, 0.2);
}
.box-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
  font-weight: 700;
}
.prompt-box.negative .box-label {
  color: #ff6666;
}

.box-content {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #ccc;
  word-break: break-all;
  white-space: pre-wrap;
}

.params-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
.param-item {
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}
.param-item .key {
  color: var(--text-muted);
  margin-right: 4px;
}
.param-item .val {
  color: var(--primary);
}

/* Chat Footer Input */
.chat-footer {
  padding: 20px 40px;
  border-top: 1px solid var(--border-color);
  background: rgba(5, 5, 5, 0.9);
  backdrop-filter: blur(10px);
}
.input-wrapper {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.input-wrapper:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary-dim);
}

/* Inner Preview List */
.inner-preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
}
.mini-preview-item {
  width: 60px;
  height: 60px;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}
.mini-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mini-remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 50%;
  border: none;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mini-remove-btn:hover {
  background: #ff3333;
}

.textarea {
  width: 100%;
  height: 60px;
  background: transparent;
  border: none;
  color: var(--text-main);
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
}

/* Input Toolbar */
.input-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
}
.left-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tool-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  border-radius: 6px;
  height: 32px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}
.tool-icon {
  font-size: 16px;
  line-height: 1;
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 32px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}
.toggle-btn.active {
  background: var(--primary-dim);
  color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}
.toggle-btn input {
  display: none;
}

.right-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.footer-hint {
  font-size: 11px;
  color: var(--text-muted);
}
.send-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--text-main);
  color: #000;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.send-btn:hover:not(:disabled) {
  background: var(--primary);
}
.send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Mobile Responsiveness */
.mobile-menu-btn {
  display: none;
  flex-direction: column;
  justify-content: space-between;
  width: 24px;
  height: 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  z-index: 20;
}
.mobile-menu-btn .bar {
  width: 100%;
  height: 2px;
  background: var(--text-main);
  border-radius: 2px;
  transition: all 0.3s;
}

.mobile-overlay {
  position: fixed;
  top: 64px;
  left: 0;
  width: 100%;
  height: calc(100vh - 64px);
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 4;
  animation: fadeIn 0.3s;
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: flex;
  }

  .header-left {
    gap: 12px;
  }

  .subtitle {
    display: none;
  }

  .toggle-text {
    display: none;
  }

  .side {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: min(320px, 86vw);
    transform: translateX(-100%);
    background: #0a0a0a;
    border-right: 1px solid var(--border-color);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.5);
  }

  .side.mobile-open {
    transform: translateX(0);
  }

  .chat-area {
    width: 100%;
  }

  .chat-scroll {
    padding: 20px 16px;
  }

  .chat-footer {
    padding: 16px;
  }

  .direction-grid {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 1280px) {
  .side {
    width: 320px;
  }
  .form-group {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
