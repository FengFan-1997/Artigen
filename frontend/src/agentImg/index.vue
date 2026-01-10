<template>
  <div class="artigen-page">
    <div class="tool-container">
      <TitleBar hideAuth>
        <template #actions>
          <div class="top-actions">
            <template v-if="isAuthed">
              <button
                class="credits-btn"
                type="button"
                @click="goMarket"
                :disabled="creditsLoading"
              >
                <span class="credits-icon">⚡</span>
                <span class="credits-value">{{ creditsText }}</span>
              </button>

              <div class="user-menu">
                <button class="avatar-btn" type="button" @click="() => openAccountPopup()">
                  <span class="avatar-text">{{ avatarText }}</span>
                </button>
              </div>
            </template>
            <button v-else class="nth-login-btn" type="button" @click="onLoginClick">
              {{ ui.loginOrRegister }}
            </button>

            <router-link to="/artigen" class="top-action-link">{{ ui.homeLink }}</router-link>
          </div>
        </template>
      </TitleBar>

      <div class="workspace">
        <div
          class="mobile-overlay"
          v-if="productSidebarOpen"
          @click="productSidebarOpen = false"
        ></div>

        <!-- LEFT: Product Configuration -->
        <transition name="side-fade">
          <aside
            v-show="productSidebarOpen"
            class="side"
            :class="{ 'mobile-open': productSidebarOpen }"
          >
            <div class="scroll-container">
              <section class="card settings-card">
                <div class="card-title">{{ ui.productProfile }}</div>

                <div class="form-group">
                  <div class="field">
                    <div class="label">{{ ui.productName }}</div>
                    <input
                      v-model="productName"
                      class="control"
                      type="text"
                      :placeholder="ui.productNamePh"
                      :disabled="loading"
                    />
                  </div>
                  <div class="field">
                    <div class="label">{{ ui.brandName }}</div>
                    <input
                      v-model="brandName"
                      class="control"
                      type="text"
                      :placeholder="ui.brandNamePh"
                      :disabled="loading"
                    />
                  </div>
                </div>

                <div class="field">
                  <div class="label">{{ ui.productCategory }}</div>
                  <div class="select-wrapper">
                    <select v-model="productCategory" class="control select" :disabled="loading">
                      <option value="" disabled selected>{{ ui.categoryPh }}</option>
                      <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </div>
                </div>

                <div class="field">
                  <div class="label">{{ ui.material }}</div>
                  <input
                    v-model="material"
                    class="control"
                    type="text"
                    :placeholder="ui.materialPh"
                    :disabled="loading"
                  />
                </div>

                <div class="card-divider"></div>
                <div class="card-title">{{ ui.visualStyle }}</div>

                <div class="field">
                  <div class="label">{{ ui.scene }}</div>
                  <input
                    v-model="sceneType"
                    class="control"
                    type="text"
                    :placeholder="ui.scenePh"
                    :disabled="loading"
                  />
                </div>

                <div class="field">
                  <div class="label">{{ ui.lighting }}</div>
                  <input
                    v-model="lighting"
                    class="control"
                    type="text"
                    :placeholder="ui.lightingPh"
                    :disabled="loading"
                  />
                </div>

                <div class="field">
                  <div class="label">{{ ui.primaryColor }}</div>
                  <input
                    v-model="primaryColor"
                    class="control"
                    type="text"
                    :placeholder="ui.primaryColorPh"
                    :disabled="loading"
                  />
                </div>

                <div v-show="false">
                  <div class="card-divider"></div>
                  <div class="card-title">{{ ui.brandAssets }}</div>

                  <div class="field">
                    <div class="label">{{ ui.logoFile }}</div>
                    <div class="file-input-wrapper">
                      <input
                        type="file"
                        accept="image/png,image/svg+xml"
                        @change="onLogoChange"
                        :disabled="loading"
                      />
                      <div class="file-trigger" :class="{ 'has-file': logoFileName }">
                        <span v-if="logoFileName" class="file-name">{{ logoFileName }}</span>
                        <span v-else class="placeholder">{{ ui.logoUploadPh }}</span>
                      </div>
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
        </transition>

        <!-- CENTER: Main Interaction -->
        <main class="main">
          <!-- Deep Thinking Mode -->
          <div v-if="deepMode && options.length > 0" class="deep-thinking-view">
            <div class="dt-header">
              <h2 class="dt-title">{{ ui.deepThinkingTitle }}</h2>
              <p class="dt-subtitle">{{ ui.deepThinkingSub }}</p>
            </div>

            <div class="dt-tabs">
              <div
                v-for="opt in options"
                :key="opt.id"
                class="dt-tab"
                :class="{ active: selectedOptionId === opt.id }"
                @click="selectedOptionId = opt.id"
              >
                <div class="dt-tab-title">
                  {{ opt.title }}
                  <span v-if="selectedOptionId === opt.id" style="color: #ccff00">✓</span>
                </div>
                <div class="dt-tab-desc">{{ opt.summary }}</div>
              </div>
            </div>

            <div class="dt-content" v-if="selectedOptionId">
              <div class="dt-option-edit">
                <div class="dt-tab-title" style="font-size: 16px; margin-bottom: 12px">
                  <input
                    class="control"
                    type="text"
                    :value="selectedOptionTitle"
                    @input="
                      (e) =>
                        updateSelectedOptionTitle(
                          String((e.target as HTMLInputElement).value || '')
                        )
                    "
                  />
                </div>
                <textarea
                  class="control"
                  rows="4"
                  style="margin-bottom: 16px"
                  :value="selectedOptionSummary"
                  @input="
                    (e) =>
                      updateSelectedOptionSummary(
                        String((e.target as HTMLTextAreaElement).value || '')
                      )
                  "
                ></textarea>
              </div>

              <div class="dt-actions">
                <button class="dt-btn" @click="onPrimary" :disabled="loading">
                  <span
                    v-if="loading"
                    class="loading-spinner"
                    style="width: 14px; height: 14px; border-width: 2px; margin-right: 8px"
                  ></span>
                  {{
                    loading
                      ? currentLang === 'zh'
                        ? '正在生成...'
                        : 'Generating...'
                      : ui.generateThisDirection
                  }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="chat-scroll" ref="chatScrollEl">
            <!-- Messages -->
            <div class="messages">
              <!-- Welcome Message -->
              <div class="msg msg-ai" v-if="!userInput && !loading && !options.length">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble">
                  <p>{{ ui.welcomeTitle }}</p>
                  <p>{{ ui.welcomeSub }}</p>
                </div>
              </div>

              <!-- Loading State -->
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

              <template v-for="item in history" :key="item.id">
                <div class="msg msg-user">
                  <div class="msg-avatar">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M12 12.2c2.56 0 4.64-2.08 4.64-4.64S14.56 2.92 12 2.92 7.36 5 7.36 7.56 9.44 12.2 12 12.2Zm0 2.12c-3.88 0-7.08 2.01-7.08 4.62V21h14.16v-2.06c0-2.61-3.2-4.62-7.08-4.62Z"
                        fill="currentColor"
                      />
                    </svg>
                  </div>
                  <div class="msg-bubble">
                    <div class="msg-text">{{ item.userText }}</div>
                    <div v-if="item.refImages && item.refImages.length" class="msg-ref-list">
                      <img
                        v-for="(u, idx) in item.refImages"
                        :key="idx"
                        class="msg-ref-img"
                        :src="u"
                        alt="ref"
                        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                      />
                    </div>
                  </div>
                </div>
                <div class="msg msg-ai" :id="`gen-${item.id}`">
                  <div class="msg-avatar">
                    <img src="/logo.png" alt="System" />
                  </div>
                  <div class="msg-bubble msg-media-bubble">
                    <div v-if="item.aiText" class="msg-ai-text">{{ item.aiText }}</div>
                    <img
                      v-if="item.image"
                      :src="item.image"
                      alt="generated"
                      class="msg-media-img"
                      @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                    />
                  </div>
                </div>
              </template>

              <div v-if="pendingUserText" class="msg msg-user">
                <div class="msg-avatar">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12 12.2c2.56 0 4.64-2.08 4.64-4.64S14.56 2.92 12 2.92 7.36 5 7.36 7.56 9.44 12.2 12 12.2Zm0 2.12c-3.88 0-7.08 2.01-7.08 4.62V21h14.16v-2.06c0-2.61-3.2-4.62-7.08-4.62Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div class="msg-bubble">{{ pendingUserText }}</div>
              </div>

              <div v-if="loading" class="msg msg-ai">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble loading-bubble">
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                  <span class="loading-text">{{ ui.loadingText }}</span>
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
                ref="chatInputRef"
                v-model="userInput"
                class="textarea"
                :placeholder="ui.inputPlaceholder"
                maxlength="500"
                @keydown.enter.ctrl="loading ? onStop() : onPrimary()"
              ></textarea>

              <div class="input-toolbar">
                <div class="left-tools">
                  <button class="tool-btn" @click="triggerUpload" :disabled="loading">
                    <span class="tool-icon">+</span>
                    <span class="tool-text">{{ ui.addImage }}</span>
                  </button>

                  <label v-if="!hasPreviews" class="toggle-btn" :class="{ active: deepMode }">
                    <input type="checkbox" v-model="deepMode" :disabled="loading" />
                    <span class="toggle-icon">✦</span>
                    <span class="toggle-text">{{ ui.deepThinkToggle }}</span>
                  </label>

                  <button
                    class="toggle-btn"
                    type="button"
                    :class="{ active: productSidebarOpen }"
                    @click="toggleProductSidebar"
                    :disabled="loading"
                  >
                    <span class="toggle-icon">▦</span>
                    <span class="toggle-text">{{ ui.productSpecial }}</span>
                  </button>

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
                  <span class="footer-hint">{{ ui.sendHint }}</span>
                  <button
                    class="send-btn"
                    :class="{ stop: loading }"
                    @click="loading ? onStop() : onPrimary()"
                    :disabled="loading ? false : !canPrimary"
                  >
                    <span v-if="loading">■</span>
                    <span v-else>↑</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside class="right-side">
          <div class="right-header">
            <span class="right-title">{{ ui.memory }}</span>
          </div>

          <div class="history-list">
            <div
              class="history-item"
              v-if="history.length === 0"
              style="text-align: center; padding: 24px 0; border: none; background: transparent"
            >
              <div style="font-size: 12px; color: var(--text-muted)">{{ ui.noHistory }}</div>
            </div>
            <button
              v-else
              class="history-item history-item-btn"
              v-for="item in historyForSidebar"
              :key="item.id"
              type="button"
              @click="scrollToGeneration(item.id)"
            >
              <div v-if="item.image" class="history-image-placeholder">
                <img
                  :src="item.image"
                  alt="generated"
                  style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px"
                  @error="(e) => ((e.target as HTMLImageElement).src = '/logo.png')"
                />
              </div>
              <div class="history-content">
                <div class="history-prompt">{{ item.userText }}</div>
                <div class="history-meta">
                  <span>{{ new Date(item.timestamp).toLocaleTimeString() }}</span>
                </div>
              </div>
            </button>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAgentImgFlow } from './composables/useAgentImgFlow';
import { useAgentImgSettings } from './composables/useAgentImgSettings';
import TitleBar from './components/TitleBar.vue';
import { buildApiUrl } from '@/utils/api';
import {
  ensureGuestUserId,
  getAuthToken,
  getCurrentUserId,
  isLocalLoggedIn
} from '@/login/session';
import { useLoginModel } from '@/stores';
import { useLanguageStore } from '@/stores/language';
import { getCreditsBalance, type CreditsBalance } from '@/points';
import { img2img, type GenerateImageInput, type Img2ImgImageInput } from './services/text';
import type { AgentImgPromptResult } from './types';
import { agentImgPromptLibrary } from './data/promptLibrary';

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const loginStore = useLoginModel();

const ui = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      navFormatFactory: '格式工厂',
      navAiWorkshop: 'AI工坊',
      navMarket: '算力商城',
      homeLink: '首页',
      goMarket: '去算力商城',
      myOrders: '我的订单',
      creditsUsage: '点数明细',
      logout: '退出登录',
      loginOrRegister: '登录 / 注册',
      productProfile: '产品档案',
      productName: '产品名称',
      productNamePh: '例如：极光精华液',
      brandName: '所属品牌',
      brandNamePh: '例如：LUMINA',
      productCategory: '产品品类',
      categoryPh: '选择品类...',
      material: '核心材质',
      materialPh: '例如：磨砂玻璃、透明塑料',
      visualStyle: '视觉风格',
      scene: '拍摄场景',
      scenePh: '例如：纯色摄影棚、自然光影',
      lighting: '布光风格',
      lightingPh: '例如：柔和漫射、强对比侧光',
      primaryColor: '主色调',
      primaryColorPh: '例如：#FF5500 或 暖橙色',
      brandAssets: '品牌资产',
      logoFile: 'Logo 文件',
      logoUploadPh: '点击上传 PNG/SVG',
      deepThinkingTitle: '深度思考分析',
      deepThinkingSub: '基于您的输入，为您规划了 4 个视觉方向',
      generateThisDirection: '生成该方向',
      welcomeTitle: '欢迎使用 Artigen 智能摄影助手。',
      welcomeSub:
        '请在左侧配置您的产品信息，或直接在下方描述您的拍摄需求。我会为您提供专业的视觉方向建议。',
      memory: '历史记录',
      noHistory: '暂无历史记录',
      resultTitle: '生成结果',
      positivePrompt: 'Positive Prompt',
      negativePrompt: 'Negative Prompt',
      imageLabel: 'Image',
      addImage: '添加图片',
      deepThinkToggle: '深度思考',
      productSpecial: '产品专项',
      sendHint: 'Ctrl + Enter 发送',
      inputPlaceholder: '描述你想要的产品图，比如：“一瓶精华液放在冰块上，背景是阳光海滩”...',
      loadingText: '正在处理，请耐心等待…'
    };
  }
  return {
    navFormatFactory: 'Format Factory',
    navAiWorkshop: 'AI Workshop',
    navMarket: 'Compute Market',
    homeLink: 'Home',
    goMarket: 'Go to Market',
    myOrders: 'My Orders',
    creditsUsage: 'Credits Usage',
    logout: 'Logout',
    loginOrRegister: 'Login / Register',
    productProfile: 'Product Profile',
    productName: 'Product Name',
    productNamePh: 'e.g. Aurora Serum',
    brandName: 'Brand',
    brandNamePh: 'e.g. LUMINA',
    productCategory: 'Category',
    categoryPh: 'Select a category...',
    material: 'Material',
    materialPh: 'e.g. Frosted glass, clear plastic',
    visualStyle: 'Visual Style',
    scene: 'Scene',
    scenePh: 'e.g. Studio backdrop, natural light',
    lighting: 'Lighting',
    lightingPh: 'e.g. Soft diffuse, high-contrast side light',
    primaryColor: 'Primary Color',
    primaryColorPh: 'e.g. #FF5500 or warm orange',
    brandAssets: 'Brand Assets',
    logoFile: 'Logo File',
    logoUploadPh: 'Upload PNG/SVG',
    deepThinkingTitle: 'Deep Thinking Analysis',
    deepThinkingSub: 'Based on your input, we planned 4 visual directions',
    generateThisDirection: 'Generate This Direction',
    welcomeTitle: 'Welcome to Artigen AI Photography Assistant.',
    welcomeSub:
      'Configure your product details on the left, or describe your shooting needs below. I will suggest professional visual directions.',
    memory: 'History',
    noHistory: 'No history yet',
    resultTitle: 'Result',
    positivePrompt: 'Positive Prompt',
    negativePrompt: 'Negative Prompt',
    imageLabel: 'Image',
    addImage: 'Add Image',
    deepThinkToggle: 'Deep Thinking',
    productSpecial: 'Product',
    sendHint: 'Ctrl + Enter to send',
    inputPlaceholder:
      'Describe your scene, e.g. a sparkling soda on ice cubes with a sunny beach background...',
    loadingText: 'Processing, please wait…'
  };
});

type HistoryItem = {
  id: string | number;
  timestamp: number;
  userText: string;
  result: AgentImgPromptResult;
  image: string | null;
  refImages?: string[];
  aiText?: string;
};

const MAX_HISTORY = 200;

const categories = computed(() =>
  currentLang.value === 'zh'
    ? [
        '消费品/日用',
        '护肤美妆',
        '食品饮料',
        '3C数码',
        '家居家电',
        '服饰鞋包',
        '珠宝配饰',
        '母婴用品',
        '医疗健康',
        '汽车出行',
        '文创礼品',
        '工业产品',
        '教育服务',
        '软件/互联网',
        '其他'
      ]
    : [
        'Consumer Goods',
        'Beauty & Skincare',
        'Food & Beverage',
        'Electronics',
        'Home & Appliances',
        'Fashion',
        'Jewelry & Accessories',
        'Baby & Kids',
        'Health & Wellness',
        'Automotive',
        'Gifts & IP',
        'Industrial',
        'Education & Services',
        'Software & Internet',
        'Other'
      ]
);

const {
  productName,
  productCategory,
  material,
  sceneType,
  lighting,
  primaryColor,
  brandName,
  logoFileName,
  logoFile,
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
  canAnalyze,
  reset,
  cancel,
  analyzeDirections
} = useAgentImgFlow({
  getContextText: () => contextText.value,
  getImages: async () => {
    const files: File[] = [];
    for (const f of previewFiles.value) if (f) files.push(f);
    const list = files.slice(0, 3);
    if (!list.length) return undefined;
    const inputs = await Promise.all(list.map(fileToGenerateInput));
    const ok = inputs.filter((x): x is GenerateImageInput => !!x && !!x.mimeType && !!x.dataBase64);
    return ok.length ? ok : undefined;
  }
});
const activeImgAbort = ref<AbortController | null>(null);
const abortImg2Img = () => {
  const ctl = activeImgAbort.value;
  if (!ctl) return;
  try {
    ctl.abort();
  } catch {}
  activeImgAbort.value = null;
};
const pendingUserText = ref('');
const chatScrollEl = ref<HTMLElement | null>(null);

const normalizeTag = (v: string) =>
  String(v || '')
    .trim()
    .replace(/\s+/g, ' ');

const ensureUniqueTags = (tags: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 24) break;
  }
  return out;
};

const applyStyleTagsToPrompt = (prompt: string, tags: string[]) => {
  let out = String(prompt || '').trim();
  const lower = () => out.toLowerCase();
  for (const t of ensureUniqueTags(tags)) {
    if (!t) continue;
    if (lower().includes(t.toLowerCase())) continue;
    if (!out) out = t;
    else out = `${out}${out.endsWith(',') || out.endsWith('，') ? ' ' : ', '}${t}`;
  }
  return out;
};

const selectedOptionIndex = computed(() => {
  const id = String(selectedOptionId.value || '').trim();
  if (!id) return -1;
  return options.value.findIndex((o) => o.id === id);
});

const selectedOptionTitle = computed(() => {
  const idx = selectedOptionIndex.value;
  return idx >= 0 ? options.value[idx]?.title || '' : '';
});

const selectedOptionSummary = computed(() => {
  const idx = selectedOptionIndex.value;
  return idx >= 0 ? options.value[idx]?.summary || '' : '';
});

const selectedOptionStyleTags = computed(() => {
  const idx = selectedOptionIndex.value;
  return idx >= 0 ? options.value[idx]?.styleTags || [] : [];
});

const updateSelectedOptionTitle = (next: string) => {
  const idx = selectedOptionIndex.value;
  if (idx < 0) return;
  const cur = options.value[idx];
  options.value[idx] = { ...cur, title: String(next || '') };
};

const updateSelectedOptionSummary = (next: string) => {
  const idx = selectedOptionIndex.value;
  if (idx < 0) return;
  const cur = options.value[idx];
  options.value[idx] = { ...cur, summary: String(next || '') };
};

const router = useRouter();

const productSidebarOpen = ref(false);
const previewUrls = ref<string[]>(['', '']);
const previewFiles = ref<(File | null)[]>([null, null]);
const fileInputs = ref<HTMLInputElement[]>([]);
const hasPreviews = computed(() => previewUrls.value.some((u) => !!u));

const toggleProductSidebar = () => {
  productSidebarOpen.value = !productSidebarOpen.value;
};

const triggerUpload = () => {
  // Find first empty slot
  let idx = previewUrls.value.findIndex((u) => !u);
  // If all full, replace the first one (or last one? let's do first)
  if (idx === -1) idx = 0;

  if (fileInputs.value[idx]) {
    fileInputs.value[idx].click();
  }
};

ensureGuestUserId();

const authUserId = ref(getCurrentUserId());
const authToken = ref(getAuthToken());
const authTick = ref(0);

const syncAuth = () => {
  authUserId.value = getCurrentUserId();
  authToken.value = getAuthToken();
};

const isAuthed = computed(() => {
  void authTick.value;
  const uid = String(authUserId.value || '').trim();
  const token = String(authToken.value || '').trim();
  return !!uid && !uid.startsWith('guest_') && !!token && isLocalLoggedIn();
});

const ensureAuthed = (after?: () => Promise<void> | void) => {
  syncAuth();
  if (isAuthed.value) return true;
  openLogin(after || null);
  return false;
};

const creditsBalance = ref<CreditsBalance | null>(null);
const creditsLoading = ref(false);
const finalImageUrl = ref('');
const history = ref<HistoryItem[]>([]);

const historyStorageKey = computed(() => {
  const uid = String(authUserId.value || '').trim() || ensureGuestUserId();
  return `artigen_history_v1_${uid}`;
});

const loadHistoryFromStorage = () => {
  try {
    const raw = window.localStorage.getItem(historyStorageKey.value);
    const parsed = raw ? JSON.parse(raw) : null;
    const list = Array.isArray(parsed) ? parsed : [];
    const normalized: HistoryItem[] = [];
    for (const it of list) {
      const id =
        typeof it?.id === 'string'
          ? it.id.trim()
          : typeof it?.id === 'number' && Number.isFinite(it.id)
            ? it.id
            : '';
      const timestamp =
        typeof it?.timestamp === 'number' && Number.isFinite(it.timestamp) ? it.timestamp : 0;
      const userText = typeof it?.userText === 'string' ? it.userText.trim() : '';
      const res = it?.result && typeof it.result === 'object' ? it.result : null;
      const prompt = typeof res?.prompt === 'string' ? res.prompt.trim() : '';
      const negativePrompt =
        typeof res?.negativePrompt === 'string' ? res.negativePrompt.trim() : '';
      if (!id || !timestamp || !prompt || !negativePrompt) continue;
      if (!userText || userText === prompt) continue;
      const params = res?.params && typeof res.params === 'object' ? res.params : undefined;
      const image = typeof it?.image === 'string' && it.image.trim() ? it.image.trim() : null;
      const aiText = typeof it?.aiText === 'string' && it.aiText.trim() ? it.aiText.trim() : '';
      const refImagesRaw = Array.isArray(it?.refImages) ? it.refImages : [];
      const refImages = refImagesRaw
        .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x: string) => !!x)
        .slice(0, 3);
      normalized.push({
        id,
        timestamp,
        userText,
        result: { prompt, negativePrompt, params },
        image,
        ...(refImages.length ? { refImages } : {}),
        ...(aiText ? { aiText } : {})
      });
      if (normalized.length >= MAX_HISTORY) break;
    }
    history.value = normalized;
  } catch {
    history.value = [];
  }
};

const historyForSidebar = computed(() => [...history.value].slice().reverse());

const resolveRemoteUrl = (raw: string) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('/')) return buildApiUrl(u);
  return u;
};

const loadHistoryFromServer = async () => {
  try {
    syncAuth();
    const userId = String(authUserId.value || '').trim();
    const token = String(authToken.value || '').trim();
    if (!userId || !token || !isAuthed.value) return false;
    const url = buildApiUrl(`/api/images/history/${encodeURIComponent(userId)}?limit=200`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const json: any = await res.json().catch(() => null);
    const items: any[] = Array.isArray(json?.items) ? json.items : [];
    const mapped = items
      .map((it): HistoryItem | null => {
        const ts = typeof it?.ts === 'number' && Number.isFinite(it.ts) ? it.ts : 0;
        const prompt = typeof it?.prompt === 'string' ? it.prompt.trim() : '';
        const negativePrompt =
          typeof it?.negativePrompt === 'string' ? it.negativePrompt.trim() : '';
        const images = Array.isArray(it?.images) ? it.images : [];
        const inputImages = Array.isArray(it?.inputImages) ? it.inputImages : [];
        const firstUrl = (() => {
          for (const img of images) {
            const u = typeof img?.url === 'string' ? img.url.trim() : '';
            const resolved = resolveRemoteUrl(u);
            if (resolved) return resolved;
          }
          return '';
        })();
        const refs = inputImages
          .map((x: any) => (typeof x?.url === 'string' ? x.url.trim() : ''))
          .map((x: string) => resolveRemoteUrl(x))
          .filter((x: string) => !!x)
          .slice(0, 3);
        if (!ts || !prompt || !negativePrompt) return null;
        const idRaw = typeof it?.id === 'string' && it.id.trim() ? it.id.trim() : `h_${ts}`;
        const aiText =
          currentLang.value === 'zh' ? '已从服务器历史记录恢复。' : 'Restored from server history.';
        return {
          id: idRaw,
          timestamp: ts,
          userText: prompt,
          result: { prompt, negativePrompt, params: it?.params },
          image: firstUrl || null,
          ...(refs.length ? { refImages: refs } : {}),
          ...(aiText ? { aiText } : {})
        };
      })
      .filter((x): x is HistoryItem => x !== null);
    mapped.sort((a, b) => a.timestamp - b.timestamp);
    history.value = mapped.slice(-MAX_HISTORY);
    return true;
  } catch {
    return false;
  }
};

let historyPersistTimer: number | null = null;
const persistHistoryThrottled = () => {
  if (isAuthed.value) return;
  if (historyPersistTimer) return;
  historyPersistTimer = window.setTimeout(() => {
    historyPersistTimer = null;
    try {
      window.localStorage.setItem(
        historyStorageKey.value,
        JSON.stringify(history.value.slice(0, MAX_HISTORY))
      );
    } catch {}
  }, 250);
};

watch(
  () => history.value,
  () => persistHistoryThrottled()
);

const scrollChatToBottom = () => {
  const el = chatScrollEl.value;
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
};

watch(
  () => [history.value.length, loading.value, pendingUserText.value],
  () => scrollChatToBottom()
);

const refreshCredits = async () => {
  if (!isAuthed.value) {
    creditsBalance.value = null;
    creditsLoading.value = false;
    return;
  }
  if (creditsLoading.value) return;
  creditsLoading.value = true;
  creditsBalance.value = await getCreditsBalance();
  creditsLoading.value = false;
};

const creditsText = computed(() => {
  const bal = creditsBalance.value;
  if (!bal) return '--';
  return String(Number(bal.available ?? 0));
});

const openAccountPopup = (tab?: 'orders' | 'usage') => {
  try {
    window.dispatchEvent(
      new CustomEvent('app-account-popup-open', tab ? { detail: { tab } } : undefined)
    );
  } catch {}
};

const openLogin = (afterLogin?: null | (() => Promise<void> | void)) => {
  const returnTo = router.currentRoute.value.fullPath;
  loginStore.open({ mode: 'login', returnTo, afterLogin });
};

const onLoginClick = () => {
  openLogin(null);
};

const avatarText = computed(() => {
  const uid = String(authUserId.value || '').trim();
  if (!uid) return '?';
  if (uid.startsWith('guest_')) return 'G';
  return uid.slice(0, 1).toUpperCase();
});

const goMarket = () => {
  router.push('/artigen/market');
};

const primaryText = computed(() => {
  if (loading.value) return currentLang.value === 'zh' ? '正在处理...' : 'Processing...';
  if (deepMode.value) {
    return options.value.length > 0
      ? currentLang.value === 'zh'
        ? '生成该方向'
        : 'Generate This Direction'
      : currentLang.value === 'zh'
        ? '分析视觉方向'
        : 'Analyze Directions';
  }
  return currentLang.value === 'zh' ? '快速生成' : 'Generate';
});

const canPrimary = computed(() => {
  if (loading.value) return false;
  if (deepMode.value) {
    if (options.value.length === 0) return canAnalyze.value;
    return !!String(selectedOptionId.value || '').trim() && !!String(userInput.value || '').trim();
  }
  return !!String(userInput.value || '').trim();
});

const fileToThumbDataUrl = (f: File): Promise<string | null> => {
  return new Promise((resolve) => {
    const srcUrl = URL.createObjectURL(f);
    const done = (v: string | null) => {
      try {
        URL.revokeObjectURL(srcUrl);
      } catch {}
      resolve(v);
    };

    const fallbackRead = () => {
      const reader = new FileReader();
      reader.onerror = () => done(null);
      reader.onload = () => {
        const raw = String(reader.result || '');
        if (!raw.startsWith('data:image/')) return done(null);
        done(raw);
      };
      reader.readAsDataURL(f);
    };

    const drawThumb = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
      const maxDim = 360;
      const scale = Math.min(1, maxDim / Math.max(w || 1, h || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((w || 1) * scale));
      canvas.height = Math.max(1, Math.round((h || 1) * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return fallbackRead();
      try {
        draw(ctx);
      } catch {
        return fallbackRead();
      }
      try {
        done(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        fallbackRead();
      }
    };

    const tryBitmap = async () => {
      const fn = (window as any).createImageBitmap;
      if (typeof fn !== 'function') return false;
      try {
        const bmp = (await fn(f)) as ImageBitmap;
        drawThumb(bmp.width, bmp.height, (ctx) => {
          const canvas = ctx.canvas as HTMLCanvasElement;
          ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        });
        try {
          bmp.close();
        } catch {}
        return true;
      } catch {
        return false;
      }
    };

    void (async () => {
      const ok = await tryBitmap();
      if (ok) return;
      const img = new Image();
      try {
        (img as any).decoding = 'async';
      } catch {}
      img.onload = () => {
        drawThumb(img.width || 1, img.height || 1, (ctx) => {
          const canvas = ctx.canvas as HTMLCanvasElement;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        });
      };
      img.onerror = () => fallbackRead();
      img.src = srcUrl;
    })();
  });
};

const humanizeImgError = (code: string) => {
  const c = String(code || '').trim();
  if (!c) return currentLang.value === 'zh' ? '出图失败，请稍后再试' : 'Image generation failed.';
  if (c === 'ABORTED' || c === 'AbortError' || /aborted/i.test(c))
    return currentLang.value === 'zh' ? '已取消' : 'Cancelled.';
  if (c === 'INSUFFICIENT_CREDITS')
    return currentLang.value === 'zh'
      ? '积分不足，请前往「算力商城」充值'
      : 'Insufficient credits. Please top up in the Market.';
  if (c === 'EMPTY_IMAGE')
    return currentLang.value === 'zh'
      ? '请先上传一张参考图再出图'
      : 'Please upload a reference image first.';
  return currentLang.value === 'zh' ? `出图失败：${c}` : `Image generation failed: ${c}`;
};

const buildDeepPrompt = (baseText: string) => {
  const title = String(selectedOptionTitle.value || '').trim();
  const summary = String(selectedOptionSummary.value || '').trim();
  const tags = ensureUniqueTags(selectedOptionStyleTags.value || []).join(', ');
  const parts = [String(baseText || '').trim(), title, summary, tags].filter(Boolean);
  return parts.join(', ');
};

const buildNegativePrompt = (extra?: string[]) => {
  const base = Array.isArray(agentImgPromptLibrary.safeNegative)
    ? agentImgPromptLibrary.safeNegative
    : [];
  const extraTags = Array.isArray(extra) ? extra : [];
  const allowLogo = !!logoFile.value;
  const filteredBase = allowLogo
    ? base.filter((t) => {
        const k = normalizeTag(t).toLowerCase();
        return k !== 'watermark' && k !== 'signature' && k !== 'text';
      })
    : base;
  const merged = ensureUniqueTags([...filteredBase, ...extraTags]);
  return merged.join(', ');
};

const applyLogoInstructionToPrompt = (prompt: string) => {
  const p = String(prompt || '').trim();
  if (!logoFile.value) return p;
  const inst =
    currentLang.value === 'zh'
      ? '在画面左上角添加提供的品牌Logo（使用上传的Logo参考图），小尺寸，四周留出边距，保持Logo清晰且不变形，尽量不要改变原有主体与构图。'
      : 'Add the provided brand logo (use the uploaded logo reference image) to the top-left corner, small size with margin, keep it crisp and not distorted, and preserve the original subject and composition as much as possible.';
  if (!p) return inst;
  return `${p}\n\n${inst}`;
};

const doPrimary = async () => {
  cancel();
  abortImg2Img();
  const activeUserText = String(userInput.value || '').trim();
  pendingUserText.value = activeUserText;
  if (!activeUserText) {
    pendingUserText.value = '';
    return;
  }

  const getImgInputs = async () => {
    const files: File[] = [];
    for (const f of previewFiles.value) if (f) files.push(f);
    const list = files.slice(0, 3);
    if (!list.length) return [];
    const inputs = await Promise.all(list.map(fileToGenerateInput));
    const ok = inputs.filter((x): x is GenerateImageInput => !!x && !!x.mimeType && !!x.dataBase64);
    return ok.length ? ok : [];
  };

  const runGen = async (fp: AgentImgPromptResult) => {
    const refImgs = await getImgInputs();
    const logoInput = logoFile.value ? await fileToGenerateInput(logoFile.value) : null;
    const hasLogo = !!logoInput && !!logoFile.value;
    const buildFinalImages = () => {
      if (!hasLogo) return refImgs as Img2ImgImageInput[];
      if (refImgs.length)
        return [...refImgs.slice(0, 2), logoInput as GenerateImageInput] as Img2ImgImageInput[];
      return [logoInput as GenerateImageInput] as Img2ImgImageInput[];
    };

    const runOnce = async (args: {
      prompt: string;
      negativePrompt?: string;
      params?: AgentImgPromptResult['params'];
      images: Img2ImgImageInput[];
    }) => {
      abortImg2Img();
      const ctl = new AbortController();
      activeImgAbort.value = ctl;
      const res = await img2img({
        prompt: args.prompt,
        negativePrompt: args.negativePrompt,
        params: args.params,
        images: args.images,
        timeoutMs: 120000,
        signal: ctl.signal
      });
      if (activeImgAbort.value === ctl) activeImgAbort.value = null;
      if (!res.ok) {
        if (res.wallet) creditsBalance.value = res.wallet;
        error.value = humanizeImgError(res.errorCode || res.error);
        return { ok: false as const, url: '' };
      }
      const url = String(res.images?.[0]?.url || '').trim();
      const resolvedUrl = resolveRemoteUrl(url);
      if (!resolvedUrl) {
        error.value = humanizeImgError('EMPTY_IMAGE_RESULT');
        return { ok: false as const, url: '' };
      }
      return { ok: true as const, url: resolvedUrl };
    };

    loading.value = true;
    error.value = '';

    if (!hasLogo) {
      const out = await runOnce({
        prompt: fp.prompt,
        negativePrompt: fp.negativePrompt,
        params: fp.params,
        images: buildFinalImages()
      });
      loading.value = false;
      if (out.ok) {
        finalImageUrl.value = out.url;
        await refreshCredits();
      }
      return out;
    }

    if (refImgs.length) {
      const out = await runOnce({
        prompt: applyLogoInstructionToPrompt(fp.prompt),
        negativePrompt: fp.negativePrompt,
        params: fp.params,
        images: buildFinalImages()
      });
      loading.value = false;
      if (out.ok) {
        finalImageUrl.value = out.url;
        await refreshCredits();
      }
      return out;
    }

    const base = await runOnce({
      prompt: fp.prompt,
      negativePrompt: fp.negativePrompt,
      params: fp.params,
      images: []
    });
    if (!base.ok) {
      loading.value = false;
      return base;
    }
    const final = await runOnce({
      prompt: applyLogoInstructionToPrompt(fp.prompt),
      negativePrompt: fp.negativePrompt,
      params: fp.params,
      images: [base.url, logoInput as GenerateImageInput]
    });
    loading.value = false;
    if (final.ok) {
      finalImageUrl.value = final.url;
      await refreshCredits();
    }
    return final;
  };

  if (deepMode.value) {
    if (options.value.length === 0) {
      const p = analyzeDirections();
      userInput.value = '';
      await p;
      pendingUserText.value = '';
      return;
    }

    const idx = selectedOptionIndex.value;
    if (idx < 0) {
      userInput.value = '';
      pendingUserText.value = '';
      return;
    }
    const opt = options.value[idx];
    const prompt = applyStyleTagsToPrompt(buildDeepPrompt(activeUserText), opt.styleTags || []);
    const negativePrompt = buildNegativePrompt(opt.negativeTags || []);
    const fp: AgentImgPromptResult = { prompt, negativePrompt };
    options.value = [];
    selectedOptionId.value = '';

    const id = Date.now();
    userInput.value = '';
    const { ok, url } = await runGen(fp);
    const refThumbsRaw = await Promise.all(
      previewFiles.value
        .filter((f): f is File => !!f)
        .slice(0, 3)
        .map((f) => fileToThumbDataUrl(f))
    );
    const refThumbs = refThumbsRaw.filter((x): x is string => !!x);
    if (ok) {
      const aiText =
        currentLang.value === 'zh'
          ? `生成完成：已根据你的提示词生成图片${refThumbs.length ? '（已参考你上传的图片）' : ''}${logoFile.value ? '（已叠加Logo）' : ''}。`
          : `Done: image generated from your prompt${refThumbs.length ? ' (with your reference image)' : ''}${logoFile.value ? ' (with logo applied)' : ''}.`;
      history.value = [
        ...history.value,
        {
          id,
          timestamp: Date.now(),
          userText: activeUserText,
          result: fp,
          image: url,
          ...(refThumbs.length ? { refImages: refThumbs } : {}),
          ...(aiText ? { aiText } : {})
        }
      ].slice(-MAX_HISTORY);
    }
    pendingUserText.value = '';
    return;
  }

  const fp: AgentImgPromptResult = {
    prompt: activeUserText,
    negativePrompt: buildNegativePrompt()
  };
  const id = Date.now();
  userInput.value = '';
  const { ok, url } = await runGen(fp);
  const refThumbsRaw = await Promise.all(
    previewFiles.value
      .filter((f): f is File => !!f)
      .slice(0, 3)
      .map((f) => fileToThumbDataUrl(f))
  );
  const refThumbs = refThumbsRaw.filter((x): x is string => !!x);
  if (ok) {
    const aiText =
      currentLang.value === 'zh'
        ? `生成完成：已根据你的提示词生成图片${refThumbs.length ? '（已参考你上传的图片）' : ''}${logoFile.value ? '（已叠加Logo）' : ''}。`
        : `Done: image generated from your prompt${refThumbs.length ? ' (with your reference image)' : ''}${logoFile.value ? ' (with logo applied)' : ''}.`;
    history.value = [
      ...history.value,
      {
        id,
        timestamp: Date.now(),
        userText: activeUserText,
        result: fp,
        image: url,
        ...(refThumbs.length ? { refImages: refThumbs } : {}),
        ...(aiText ? { aiText } : {})
      }
    ].slice(-MAX_HISTORY);
  }
  pendingUserText.value = '';
};

const onPrimary = async () => {
  if (!ensureAuthed(() => onPrimary())) return;
  await doPrimary();
};

const onStop = () => {
  cancel();
  abortImg2Img();
};

const scrollToGeneration = (id: string | number) => {
  const el = document.getElementById(`gen-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const onLogoChange = (e: Event) => {
  const input = e.target as HTMLInputElement | null;
  const f = input?.files && input.files.length ? input.files[0] : null;
  setLogoFile(f);
  if (input) input.value = '';
};

const fileToGenerateInput = (f: File): Promise<GenerateImageInput | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const raw = String(reader.result || '');
      const toInput = (dataUrl: string): GenerateImageInput => {
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        return {
          mimeType: (m?.[1] || f.type || 'image/png').trim(),
          dataBase64: String(m?.[2] || '').trim()
        };
      };

      const shouldCompress = f.size > 2.5 * 1024 * 1024;
      if (!shouldCompress) return resolve(toInput(raw));

      const img = new Image();
      img.onload = () => {
        const maxDim = 1536;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        if (scale >= 1) return resolve(toInput(raw));

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(toInput(raw));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(toInput(raw));
            const r2 = new FileReader();
            r2.onerror = () => resolve(toInput(raw));
            r2.onload = () => resolve(toInput(String(r2.result || raw)));
            r2.readAsDataURL(blob);
          },
          'image/jpeg',
          0.92
        );
      };
      img.onerror = () => resolve(toInput(raw));
      img.src = raw;
    };
    reader.readAsDataURL(f);
  });
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
  previewFiles.value[idx] = f;
  setPreviewUrl(idx, url);
  deepMode.value = false;
  cancel();
  abortImg2Img();
  reset();
  if (input) input.value = '';
  if (userInput.value.trim()) {
    void onPrimary();
  }
};

const clearPreview = (idx: number) => {
  previewFiles.value[idx] = null;
  setPreviewUrl(idx, '');
};

onBeforeUnmount(() => {
  abortImg2Img();
  for (let i = 0; i < previewUrls.value.length; i++) setPreviewUrl(i, '');
});

const handleAuthChanged = () => {
  syncAuth();
  authTick.value++;
  if (isAuthed.value) void loadHistoryFromServer();
  else loadHistoryFromStorage();
  if (isAuthed.value) void refreshCredits();
  else creditsBalance.value = null;
};

const chatInputRef = ref<HTMLTextAreaElement | null>(null);

const onGlobalPointerDown = (e: PointerEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  if (target.closest('input, textarea, [contenteditable="true"], .msg-bubble')) return;

  const active = document.activeElement as HTMLElement | null;
  if (!active) return;

  if (active === chatInputRef.value) {
    try {
      chatInputRef.value?.blur();
    } catch {}
    return;
  }

  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active.getAttribute('contenteditable') === 'true'
  ) {
    try {
      active.blur();
    } catch {}
  }
};

onMounted(() => {
  handleAuthChanged();
  window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
  document.addEventListener('pointerdown', onGlobalPointerDown, true);
});

onBeforeUnmount(() => {
  abortImg2Img();
  if (historyPersistTimer) window.clearTimeout(historyPersistTimer);
  historyPersistTimer = null;
  window.removeEventListener('app-auth-changed', handleAuthChanged as EventListener);
  document.removeEventListener('pointerdown', onGlobalPointerDown, true);
});
</script>

<style scoped>
@import './styles/cyberpunk.css';

.artigen-page {
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
  cursor: default;
  user-select: none;
}

.artigen-page .msg-bubble {
  cursor: text;
  user-select: text;
}

.artigen-page textarea,
.artigen-page input[type='text'],
.artigen-page input[type='search'],
.artigen-page input[type='email'],
.artigen-page input[type='password'] {
  cursor: text;
  user-select: text;
}

.artigen-page button,
.artigen-page select,
.artigen-page input[type='checkbox'],
.artigen-page input[type='range'],
.artigen-page input[type='file'] {
  cursor: pointer;
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

.artigen-page,
.artigen-page * {
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
  margin: 0 0 0 auto;
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
  background: rgba(0, 0, 0, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 0 12px;
  color: var(--text-main);
  font-size: 13px;
  transition: all 0.2s;
}
.control:hover {
  background: rgba(0, 0, 0, 0.8);
  border-color: rgba(255, 255, 255, 0.15);
}
.control:focus {
  background: rgba(0, 0, 0, 0.86);
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
  -webkit-appearance: none;
  -moz-appearance: none;
  cursor: pointer;
  background-image: none !important;
}
.select::-ms-expand {
  display: none;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-add-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.tag-add-row .control {
  flex: 1;
  min-width: 0;
}
.tag-add-row .ghost {
  height: 36px;
  padding: 0 14px;
  border-radius: 6px;
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
  background: #000;
  background-image: none;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 1300px;
  margin: 0 0 0 auto;
  width: 100%;
}

/* Messages */
.msg {
  display: flex;
  gap: 16px;
  animation: fadeIn 0.3s ease-out;
}
.msg-user {
  margin-bottom: 20px;
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
.msg-user .msg-avatar {
  background:
    radial-gradient(120% 120% at 28% 22%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 48%),
    linear-gradient(
      135deg,
      rgba(204, 255, 0, 0.95) 0%,
      rgba(102, 255, 204, 0.86) 55%,
      rgba(84, 109, 255, 0.78) 100%
    );
  border: 1px solid rgba(204, 255, 0, 0.45);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55) inset,
    0 10px 24px rgba(0, 0, 0, 0.45),
    0 0 18px rgba(204, 255, 0, 0.12);
  color: rgba(10, 10, 10, 0.9);
}
.msg-user .msg-avatar svg {
  width: 62%;
  height: 62%;
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
  text-align: left;
  max-width: 80%;
  margin-bottom: 40px;
}
.msg-user .msg-bubble {
  background: rgba(204, 255, 0, 0.1);
  border-color: rgba(204, 255, 0, 0.3);
  color: var(--text-main);
}

.msg-media-bubble {
  background: transparent;
  padding: 0;
  border: none;
}
.msg-media-img {
  max-width: 100%;
  border-radius: 12px;
  display: block;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}
.msg-ai-text {
  font-size: 13px;
  color: rgba(241, 245, 249, 0.92);
  margin-bottom: 10px;
  text-align: left;
}
.msg-ref-list {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.msg-ref-img {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.loading-bubble {
  display: flex;
  gap: 6px;
  width: fit-content;
}
.loading-text {
  margin-left: 6px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
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
  text-align: left;
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

.side-fade-enter-active,
.side-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.side-fade-enter-from,
.side-fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
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
  display: none;
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

  .mobile-overlay {
    display: block;
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

/* New Header Styles */
.top-header {
  height: 64px;
  background: rgba(5, 5, 5, 0.8);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  z-index: 20;
}
.top-header-inner {
  height: 100%;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.top-logo-text {
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  letter-spacing: -0.5px;
}
.top-nav {
  display: flex;
  gap: 8px;
}
.top-nav-item {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 4px;
  transition: all 0.2s;
}
.top-nav-item.active,
.top-nav-item:hover {
  color: #ccff00;
  background: rgba(204, 255, 0, 0.1);
}
.top-action-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: 4px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.credits-btn {
  border: 1px solid rgba(204, 255, 0, 0.25);
  background: rgba(204, 255, 0, 0.08);
  color: var(--text-main);
  padding: 6px 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.credits-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credits-btn:hover:not(:disabled) {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(204, 255, 0, 0.14);
}

.credits-icon {
  opacity: 0.9;
}

.credits-value {
  color: #ccff00;
  font-weight: 700;
}

.user-menu {
  position: relative;
}

.avatar-btn {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.35);
  color: var(--text-main);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 900;
  letter-spacing: -0.2px;
  transition: all 0.2s;
}

.avatar-btn:hover {
  border-color: rgba(204, 255, 0, 0.55);
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.08);
}

.avatar-text {
  transform: translateY(0.5px);
}

.user-dropdown {
  position: absolute;
  top: 44px;
  right: 0;
  width: 220px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 10, 10, 0.96);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  overflow: hidden;
  z-index: 60;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

.user-row {
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.user-name {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-main);
  font-family: 'JetBrains Mono', monospace;
}

.user-sub {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  transition: background 0.2s;
}

.user-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.user-item.danger {
  color: rgba(252, 165, 165, 0.95);
}

.auth-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.auth-card {
  width: min(440px, 100%);
  border-radius: 14px;
  background: rgba(8, 8, 8, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 30px 90px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}

/* Right Side Panel */
.right-side {
  width: 280px;
  background: rgba(5, 5, 5, 0.6);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 5;
}
.right-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.right-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  text-transform: uppercase;
}
.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.history-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-muted);
}
.history-item-btn {
  width: 100%;
  text-align: left;
  cursor: pointer;
  appearance: none;
  font: inherit;
}
.history-item-btn:hover {
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.06);
}
.history-prompt {
  color: var(--text-main);
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.history-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  opacity: 0.7;
}
.right-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
}
.ghost-btn {
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  transition: all 0.2s;
}
.ghost-btn:hover {
  border-color: var(--text-main);
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
}

/* Deep Thinking Tabs View */
.deep-thinking-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
}
.dt-header {
  margin-bottom: 16px;
  text-align: left;
}
.dt-title {
  font-size: 18px;
  font-weight: 700;
  color: #ccff00;
  margin-bottom: 6px;
}
.dt-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}
.dt-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.dt-tab {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.dt-tab:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(204, 255, 0, 0.5);
}
.dt-tab.active {
  background: rgba(204, 255, 0, 0.1);
  border-color: #ccff00;
  box-shadow: 0 0 20px rgba(204, 255, 0, 0.1);
}
.dt-tab-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dt-tab-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dt-content {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.dt-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.dt-btn {
  background: #ccff00;
  color: #000;
  border: none;
  padding: 9px 18px;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s;
}
.dt-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(204, 255, 0, 0.3);
}

/* Main Content Area */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  height: 100%;
  overflow: hidden;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.history-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.history-image-placeholder {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.history-content {
  flex: 1;
  min-width: 0;
}

@media (min-width: 1280px) {
  .chat-scroll {
    padding: 34px 32px;
  }

  .messages {
    max-width: 1180px;
    gap: 36px;
  }

  .msg {
    gap: 18px;
  }

  .msg-avatar {
    width: 44px;
    height: 44px;
  }

  .msg-bubble {
    padding: 22px;
    font-size: 15px;
    margin-bottom: 44px;
  }

  .right-side {
    width: 340px;
  }

  .right-header {
    padding: 16px 14px;
  }

  .right-title {
    font-size: 15px;
  }

  .history-list {
    padding: 12px 10px;
    direction: rtl;
  }

  .history-list > * {
    direction: ltr;
  }

  .history-list::-webkit-scrollbar {
    width: 8px;
  }

  .history-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .history-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
  }

  .history-list::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.26);
  }

  .history-item {
    padding: 14px;
    font-size: 13px;
    border-radius: 10px;
  }

  .history-image-placeholder {
    width: 54px;
    height: 54px;
    border-radius: 10px;
  }
}
</style>
