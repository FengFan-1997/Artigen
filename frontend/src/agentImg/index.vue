<template>
  <div class="agentimg-page">
    <div class="tool-container">
      <header class="top-header">
        <div class="top-header-inner">
          <router-link to="/agentimg" class="top-logo">
            <span class="top-logo-text">Nth Me</span>
          </router-link>

          <nav class="top-nav">
            <router-link to="/agentimg/format-factory" class="top-nav-item">{{
              ui.navFormatFactory
            }}</router-link>
            <router-link to="/agentimg/ai" class="top-nav-item active">{{
              ui.navAiWorkshop
            }}</router-link>
            <router-link to="/agentimg/market" class="top-nav-item">{{ ui.navMarket }}</router-link>
          </nav>

          <div class="top-actions">
            <button class="credits-btn" type="button" @click="goMarket" :disabled="creditsLoading">
              <span class="credits-icon">⚡</span>
              <span class="credits-value">{{ creditsText }}</span>
            </button>

            <div class="user-menu">
              <button class="avatar-btn" type="button" @click="toggleUserMenu">
                <span class="avatar-text">{{ avatarText }}</span>
              </button>
              <transition name="dropdown-fade">
                <div v-if="showUserMenu" class="user-dropdown">
                  <div class="user-row">
                    <div class="user-name">{{ userTitle }}</div>
                    <div class="user-sub">{{ userSubtitle }}</div>
                  </div>
                  <button class="user-item" type="button" @click="refreshCredits">
                    {{ refreshCreditsText }}
                  </button>
                  <button
                    class="user-item"
                    type="button"
                    @click="doCheckin"
                    :disabled="checkinLoading"
                  >
                    {{ checkinText }}
                  </button>
                  <button class="user-item" type="button" @click="goMarket">
                    {{ ui.goMarket }}
                  </button>
                  <button
                    v-if="isAuthed"
                    class="user-item danger"
                    type="button"
                    @click="handleLogout"
                  >
                    {{ ui.logout }}
                  </button>
                  <button v-else class="nth-login-btn" type="button" @click="onLoginClick">
                    {{ ui.loginOrRegister }}
                  </button>
                </div>
              </transition>
            </div>

            <router-link to="/agentimg" class="top-action-link">{{ ui.homeLink }}</router-link>
          </div>
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
            </section>
          </div>

          <div class="side-footer">
            <button class="primary side-action-btn" @click="onPrimary" :disabled="!canPrimary">
              <span v-if="loading" class="loading-spinner"></span>
              <span v-else>{{ primaryText }}</span>
            </button>
          </div>
        </aside>

        <!-- CENTER: Main Interaction -->
        <main class="main">
          <!-- Deep Thinking Mode -->
          <div v-if="deepMode && options.length > 0 && !finalPrompt" class="deep-thinking-view">
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
              <div class="dt-tab-title" style="font-size: 16px; margin-bottom: 12px">
                {{ options.find((o) => o.id === selectedOptionId)?.title }}
              </div>
              <p
                style="
                  color: var(--text-muted);
                  font-size: 13px;
                  line-height: 1.6;
                  margin-bottom: 16px;
                "
              >
                {{ options.find((o) => o.id === selectedOptionId)?.summary }}
              </p>
              <div class="chips-row" style="margin-bottom: 24px">
                <span
                  v-for="t in options.find((o) => o.id === selectedOptionId)?.styleTags"
                  :key="t"
                  class="chip"
                  >{{ t }}</span
                >
              </div>

              <div class="dt-actions">
                <button class="dt-btn" @click="onPrimary">{{ ui.generateThisDirection }}</button>
              </div>
            </div>
          </div>

          <div v-else class="chat-scroll">
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
                  <p>{{ ui.welcomeTitle }}</p>
                  <p>{{ ui.welcomeSub }}</p>
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

              <div
                v-for="item in historyTimeline"
                :key="item.id"
                class="msg msg-ai"
                :id="`gen-${item.id}`"
              >
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble">
                  <div class="result-panel">
                    <div class="panel-header">
                      <div class="panel-title">{{ ui.resultTitle }}</div>
                      <button class="copy-btn" type="button" @click="copyResult(item.result)">
                        {{ copied ? ui.copied : ui.copyAll }}
                      </button>
                    </div>

                    <div class="prompt-box">
                      <div class="box-label">{{ ui.positivePrompt }}</div>
                      <div class="box-content">{{ item.result.prompt }}</div>
                    </div>

                    <div class="prompt-box negative">
                      <div class="box-label">{{ ui.negativePrompt }}</div>
                      <div class="box-content">{{ item.result.negativePrompt }}</div>
                    </div>

                    <div class="params-row" v-if="item.result.params">
                      <div class="param-item" v-for="(val, key) in item.result.params" :key="key">
                        <span class="key">{{ key }}:</span>
                        <span class="val">{{ val }}</span>
                      </div>
                    </div>

                    <div class="prompt-box" v-if="item.image">
                      <div class="box-label">{{ ui.imageLabel }}</div>
                      <div class="box-content">
                        <img
                          :src="item.image"
                          alt="generated"
                          style="max-width: 100%; border-radius: 10px"
                        />
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
                :placeholder="ui.inputPlaceholder"
                :disabled="loading"
                maxlength="500"
                @keydown.enter.ctrl="onPrimary"
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
                  <button class="send-btn" @click="onPrimary" :disabled="!canPrimary">
                    <span v-if="loading">...</span>
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
            <div v-else class="history-item" v-for="item in history" :key="item.id">
              <button
                v-if="item.image"
                class="history-image-placeholder"
                type="button"
                @click="scrollToGeneration(item.id)"
              >
                <img
                  :src="item.image"
                  alt="generated"
                  style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px"
                />
              </button>
              <div class="history-content">
                <div class="history-prompt">{{ item.result.prompt }}</div>
                <div class="history-meta">
                  <span>{{ new Date(item.timestamp).toLocaleTimeString() }}</span>
                  <span class="copy-action" @click="copyHistoryPrompt(item.result.prompt)">
                    {{ copied ? ui.copied : ui.copy }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAgentImgFlow } from './composables/useAgentImgFlow';
import { useAgentImgSettings } from './composables/useAgentImgSettings';
import {
  ensureGuestUserId,
  getAuthToken,
  getCurrentUserId,
  isLocalLoggedIn,
  logoutLocal
} from '@/login/session';
import { useLoginModel } from '@/stores';
import { useLanguageStore } from '@/stores/language';
import { checkinCredits, getCreditsBalance, type CreditsBalance } from '@/points';
import { img2img, type GenerateImageInput } from './services/text';
import type { AgentImgPromptResult } from './types';

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
      welcomeTitle: '欢迎使用 AgentImg 产品摄影助手。',
      welcomeSub:
        '请在左侧配置您的产品信息，或直接在下方描述您的拍摄需求。我会为您提供专业的视觉方向建议。',
      memory: '历史记录',
      noHistory: '暂无历史记录',
      copy: '复制',
      copied: '已复制',
      copyAll: '复制全部',
      resultTitle: '生成结果',
      positivePrompt: 'Positive Prompt',
      negativePrompt: 'Negative Prompt',
      imageLabel: 'Image',
      addImage: '添加图片',
      deepThinkToggle: '深度思考',
      sendHint: 'Ctrl + Enter 发送',
      inputPlaceholder: '描述您的画面构想，例如：一瓶放置在冰块上的清爽气泡水，背景是阳光海滩...'
    };
  }
  return {
    navFormatFactory: 'Format Factory',
    navAiWorkshop: 'AI Workshop',
    navMarket: 'Compute Market',
    homeLink: 'Home',
    goMarket: 'Go to Market',
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
    welcomeTitle: 'Welcome to AgentImg Product Photography Assistant.',
    welcomeSub:
      'Configure your product details on the left, or describe your shooting needs below. I will suggest professional visual directions.',
    memory: 'History',
    noHistory: 'No history yet',
    copy: 'Copy',
    copied: 'Copied',
    copyAll: 'Copy All',
    resultTitle: 'Result',
    positivePrompt: 'Positive Prompt',
    negativePrompt: 'Negative Prompt',
    imageLabel: 'Image',
    addImage: 'Add Image',
    deepThinkToggle: 'Deep Thinking',
    sendHint: 'Ctrl + Enter to send',
    inputPlaceholder:
      'Describe your scene, e.g. a sparkling soda on ice cubes with a sunny beach background...'
  };
});

type HistoryItem = {
  id: number;
  timestamp: number;
  result: AgentImgPromptResult;
  image: string | null;
};

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
  finalPrompt: finalPrompt0,
  canAnalyze,
  canFinalize,
  reset,
  analyzeDirections,
  generateFinal
} = useAgentImgFlow({
  getContextText: () => contextText.value,
  getImages: async () => {
    const files: File[] = [];
    if (logoFile.value) files.push(logoFile.value);
    for (const f of previewFiles.value) if (f) files.push(f);
    const list = files.slice(0, 3);
    if (!list.length) return undefined;
    const inputs = await Promise.all(list.map(fileToGenerateInput));
    const ok = inputs.filter((x) => x && x.mimeType && x.dataBase64);
    return ok.length ? ok : undefined;
  }
});

const finalPrompt = finalPrompt0 as Ref<AgentImgPromptResult | null>;

const router = useRouter();

const copied = ref(false);
const showMobileSettings = ref(false);
const previewUrls = ref<string[]>(['', '']);
const previewFiles = ref<(File | null)[]>([null, null]);
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
const checkinLoading = ref(false);
const checkinStatus = ref<'idle' | 'ok' | 'already' | 'error'>('idle');
const finalImageUrl = ref('');
const history = ref<HistoryItem[]>([]);

const refreshCredits = async () => {
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

const refreshCreditsText = computed(() =>
  currentLang.value === 'zh' ? '刷新点数' : 'Refresh Credits'
);
const checkinText = computed(() => {
  if (checkinLoading.value) return currentLang.value === 'zh' ? '签到中…' : 'Checking in…';
  if (checkinStatus.value === 'ok') return currentLang.value === 'zh' ? '签到成功' : 'Checked in';
  if (checkinStatus.value === 'already')
    return currentLang.value === 'zh' ? '今日已签到' : 'Already checked in';
  if (checkinStatus.value === 'error')
    return currentLang.value === 'zh' ? '签到失败' : 'Check-in failed';
  return currentLang.value === 'zh' ? '每日签到' : 'Daily Check-in';
});

const doCheckin = async () => {
  if (checkinLoading.value) return;
  checkinLoading.value = true;
  checkinStatus.value = 'idle';
  const res = await checkinCredits();
  checkinLoading.value = false;
  if (!res.ok) {
    checkinStatus.value = 'error';
    return;
  }
  checkinStatus.value = res.alreadyCheckedIn ? 'already' : 'ok';
  if (res.wallet) creditsBalance.value = res.wallet;
  else await refreshCredits();
};

const showUserMenu = ref(false);

const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value;
};

const openLogin = (afterLogin?: null | (() => Promise<void> | void)) => {
  showUserMenu.value = false;
  const returnTo = router.currentRoute.value.fullPath;
  loginStore.open({ mode: 'login', returnTo, afterLogin });
};

const onLoginClick = () => {
  openLogin(null);
};

const userTitle = computed(() => {
  return isAuthed.value ? '已登录' : '游客模式';
});

const userSubtitle = computed(() => {
  const uid = String(authUserId.value || '').trim();
  return uid ? uid : 'unknown';
});

const avatarText = computed(() => {
  const uid = String(authUserId.value || '').trim();
  if (!uid) return '?';
  if (uid.startsWith('guest_')) return 'G';
  return uid.slice(0, 1).toUpperCase();
});

const handleLogout = () => {
  logoutLocal();
  try {
    window.dispatchEvent(new CustomEvent('app-auth-changed'));
  } catch {}
};

const goMarket = () => {
  router.push('/agentimg/market');
};

const primaryText = computed(() => {
  if (loading.value) return '思考中...';
  if (finalPrompt.value) return '再次生成';
  if (options.value.length > 0 && !finalPrompt.value) return '生成 Prompt';
  return deepMode.value ? '分析视觉方向' : '快速生成';
});

const canPrimary = computed(() => (deepMode.value ? canAnalyze.value : canFinalize.value));

const doPrimary = async () => {
  if (finalPrompt.value) {
    // Reset for new round but keep settings
    finalPrompt.value = null;
    finalImageUrl.value = '';
    options.value = [];
    selectedOptionId.value = '';
    // If userInput is empty, maybe don't clear it? Or clear it?
    // Let's keep user input for refinement
  }

  const getImgInputs = async () => {
    const files: File[] = [];
    if (logoFile.value) files.push(logoFile.value);
    for (const f of previewFiles.value) if (f) files.push(f);
    const list = files.slice(0, 3);
    if (!list.length) return null;
    const inputs = await Promise.all(list.map(fileToGenerateInput));
    const ok = inputs.filter((x) => x && x.mimeType && x.dataBase64);
    return ok.length ? ok : null;
  };

  const maybeRunImg2Img = async (fp: AgentImgPromptResult) => {
    const imgs = await getImgInputs();
    if (!imgs) return null;
    loading.value = true;
    error.value = '';
    const res = await img2img({
      prompt: fp.prompt,
      negativePrompt: fp.negativePrompt,
      params: fp.params,
      images: imgs,
      timeoutMs: 120000
    });
    loading.value = false;
    if (!res.ok) {
      if (res.wallet) creditsBalance.value = res.wallet;
      error.value =
        res.errorCode === 'INSUFFICIENT_CREDITS'
          ? currentLang.value === 'zh'
            ? '积分不足，请前往「算力商城」充值'
            : 'Insufficient credits. Please top up in the Market.'
          : res.errorCode === 'EMPTY_IMAGE'
            ? currentLang.value === 'zh'
              ? '请先上传一张参考图再出图'
              : 'Please upload a reference image first.'
            : currentLang.value === 'zh'
              ? `出图失败：${res.errorCode}`
              : `Image generation failed: ${res.errorCode}`;
      return null;
    }
    const url = String(res.images?.[0]?.url || '').trim();
    if (!url) return null;
    finalImageUrl.value = url;
    await refreshCredits();
    return url;
  };

  if (deepMode.value) {
    if (options.value.length === 0) {
      await analyzeDirections();
    } else {
      const fp = await generateFinal();
      if (fp) {
        const id = Date.now();
        const imgUrl = await maybeRunImg2Img(fp);
        history.value.unshift({
          id,
          timestamp: Date.now(),
          result: fp,
          image: imgUrl
        });
      }
    }
  } else {
    const fp = await generateFinal();
    if (fp) {
      const id = Date.now();
      const imgUrl = await maybeRunImg2Img(fp);
      history.value.unshift({
        id,
        timestamp: Date.now(),
        result: fp,
        image: imgUrl
      });
    }
  }
};

const onPrimary = async () => {
  if (!ensureAuthed(() => onPrimary())) return;
  await doPrimary();
};

const historyTimeline = computed(() => [...history.value].reverse());

const scrollToGeneration = (id: number) => {
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

const fileToGenerateInput = (f: File): Promise<GenerateImageInput> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('READ_FILE_FAILED'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      const m = raw.match(/^data:([^;]+);base64,(.+)$/);
      resolve({
        mimeType: (m?.[1] || f.type || 'image/png').trim(),
        dataBase64: String(m?.[2] || '').trim()
      });
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
  for (let i = 0; i < previewUrls.value.length; i++) setPreviewUrl(i, '');
});

onMounted(async () => {
  syncAuth();
  await refreshCredits();
  window.addEventListener('click', onWindowClick);
});

const onWindowClick = (e: MouseEvent) => {
  const el = e.target as HTMLElement | null;
  if (!el) return;
  if (el.closest('.user-menu') || el.closest('.auth-card')) return;
  showUserMenu.value = false;
};

onBeforeUnmount(() => {
  window.removeEventListener('click', onWindowClick);
});

const copyResult = async (res: AgentImgPromptResult) => {
  if (!res) return;
  const text = [
    res.prompt,
    '',
    '---',
    '',
    `negative_prompt: ${res.negativePrompt}`,
    res.params ? `params: ${JSON.stringify(res.params)}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await window.navigator.clipboard.writeText(text);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
};

const copyHistoryPrompt = async (text: string) => {
  const t = String(text || '').trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1000);
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
  padding: 24px;
  overflow-y: auto;
}
.dt-header {
  margin-bottom: 24px;
  text-align: center;
}
.dt-title {
  font-size: 20px;
  font-weight: 700;
  color: #ccff00;
  margin-bottom: 8px;
}
.dt-subtitle {
  font-size: 13px;
  color: var(--text-muted);
}
.dt-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.dt-tab {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
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
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dt-tab-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
.dt-content {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.dt-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}
.dt-btn {
  background: #ccff00;
  color: #000;
  border: none;
  padding: 10px 24px;
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

.copy-action {
  cursor: pointer;
  color: #ccff00;
  transition: opacity 0.2s;
}
.copy-action:hover {
  opacity: 0.8;
}
</style>
