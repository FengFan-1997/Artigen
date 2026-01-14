<template>
  <div class="artigen-page">
    <div class="tool-container">
      <TitleBar hideAuth hideLangOnMobile>
        <template #actions>
          <div class="top-actions">
            <template v-if="isAuthed">
              <div ref="creditsContainerRef" class="credits-container">
                <button
                  class="credits-btn"
                  type="button"
                  @click="toggleCreditsPopover"
                  :disabled="creditsLoading"
                >
                  <span class="credits-icon">⚡</span>
                  <span class="credits-value">{{ creditsText }}</span>
                </button>

                <transition name="dropdown-fade">
                  <div v-if="creditsPopoverOpen" class="credits-popover" @click.stop>
                    <div class="credits-pop-head">
                      <div class="credits-pop-title">{{ ui.creditsBalance }}</div>
                      <div class="credits-pop-total">
                        {{ ui.totalCredits }}: {{ totalCreditsText }}
                      </div>
                    </div>
                    <div class="credits-pop-balance">
                      <span class="credits-pop-icon">⚡</span>
                      <span class="credits-pop-value">{{ creditsText }}</span>
                    </div>
                    <div class="credits-pop-actions">
                      <button
                        class="credits-pop-btn"
                        type="button"
                        @click="refreshCredits"
                        :disabled="creditsLoading"
                      >
                        {{ ui.refreshCredits }}
                      </button>
                      <button class="credits-pop-btn primary" type="button" @click="goMarket">
                        {{ ui.goMarket }}
                      </button>
                    </div>
                  </div>
                </transition>
              </div>

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

      <transition name="top-tip-fade">
        <div v-if="topTipOpen" class="top-tip">{{ topTipText }}</div>
      </transition>

      <div class="workspace">
        <div
          class="mobile-overlay"
          v-if="productSidebarOpen || historySidebarOpen"
          @click="closeMobileOverlays"
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
                  <div class="label">{{ ui.designElements }}</div>
                  <div class="chips-row" v-if="designElements.length">
                    <div
                      v-for="tag in designElements"
                      :key="tag"
                      class="chip active"
                      @click="toggleDesignElement(tag)"
                    >
                      {{ tag }} ×
                    </div>
                  </div>
                  <div class="tag-add-row">
                    <input
                      v-model="newDesignElement"
                      class="control"
                      type="text"
                      :placeholder="ui.add + '...'"
                      :disabled="loading"
                      @keydown.enter.prevent="addDesignElement"
                    />
                    <button class="ghost" @click="addDesignElement" :disabled="loading">+</button>
                  </div>
                </div>

                <div class="field">
                  <div class="label">{{ ui.style }}</div>
                  <div class="chips-row" v-if="styles.length">
                    <div
                      v-for="tag in styles"
                      :key="tag"
                      class="chip active"
                      @click="toggleStyle(tag)"
                    >
                      {{ tag }} ×
                    </div>
                  </div>
                  <div class="tag-add-row">
                    <input
                      v-model="newStyle"
                      class="control"
                      type="text"
                      :placeholder="ui.add + '...'"
                      :disabled="loading"
                      @keydown.enter.prevent="addStyle"
                    />
                    <button class="ghost" @click="addStyle" :disabled="loading">+</button>
                  </div>
                </div>

                <div class="field">
                  <div class="label">{{ ui.colorScheme }}</div>
                  <div class="chips-row" v-if="colors.length">
                    <div
                      v-for="tag in colors"
                      :key="tag"
                      class="chip active"
                      @click="toggleColor(tag)"
                    >
                      {{ tag }} ×
                    </div>
                  </div>
                  <div class="tag-add-row">
                    <input
                      v-model="newColor"
                      class="control"
                      type="text"
                      :placeholder="ui.add + '...'"
                      :disabled="loading"
                      @keydown.enter.prevent="addColor"
                    />
                    <button class="ghost" @click="addColor" :disabled="loading">+</button>
                  </div>
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
                <span v-else>{{ primaryTextWithCost }}</span>
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
                  class="control control-textarea"
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
                <div class="dt-generate-wrap">
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
                        : primaryTextWithCost
                    }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="chat-scroll" ref="chatScrollEl">
            <!-- Messages -->
            <div class="messages">
              <!-- Welcome Message -->
              <div class="msg msg-ai" v-if="!pendingUserText && !loading && !options.length">
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
                <div v-if="item.notice && item.notice.type === 'cancel'" class="msg msg-ai">
                  <div class="msg-avatar">
                    <img src="/logo.png" alt="System" />
                  </div>
                  <div class="msg-bubble error-bubble">
                    <div class="error-icon">!</div>
                    <div class="error-text">{{ item.notice.text }}</div>
                  </div>
                </div>
                <div v-if="item.aiText || item.image" class="msg msg-ai" :id="`gen-${item.id}`">
                  <div class="msg-avatar">
                    <img src="/logo.png" alt="System" />
                  </div>
                  <div class="msg-bubble msg-media-bubble">
                    <div v-if="item.aiText" class="msg-ai-text">{{ item.aiText }}</div>
                    <div v-if="item.image" class="msg-image-wrap">
                      <img
                        :src="item.image"
                        alt="generated"
                        class="msg-media-img"
                        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                      />
                      <div class="msg-image-actions">
                        <button
                          class="msg-image-action-btn"
                          type="button"
                          @click.stop="downloadMsgImage(item.image)"
                        >
                          {{ ui.download }}
                        </button>
                        <button
                          class="msg-image-action-btn"
                          type="button"
                          @click.stop="referenceMsgImage(item.image)"
                        >
                          {{ ui.reference }}
                        </button>
                      </div>
                    </div>
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
              <div v-if="pendingNotice && pendingUserText" class="msg msg-ai">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble error-bubble">
                  <div class="error-icon">!</div>
                  <div class="error-text">{{ pendingNotice.text }}</div>
                </div>
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
                :class="{ 'drag-over': chatInputDragOver }"
                :placeholder="ui.inputPlaceholder"
                maxlength="500"
                @dragover="onChatInputDragOver"
                @dragleave="onChatInputDragLeave"
                @drop="onChatInputDrop"
              ></textarea>
              <div v-if="chatInputDragOver" class="drop-hint">{{ ui.dropHint }}</div>

              <div class="input-toolbar">
                <div class="left-tools">
                  <button class="tool-btn upload-btn" @click="triggerUpload" :disabled="loading">
                    <span class="tool-icon">+</span>
                    <span class="tool-text">{{ ui.addImage }}</span>
                  </button>

                  <div class="model-menu">
                    <button
                      class="toggle-btn model-btn"
                      type="button"
                      :title="currentModelTip"
                      :disabled="loading"
                      @click="toggleModelMenu"
                    >
                      <span class="toggle-icon">○</span>
                      <span class="toggle-text">{{ currentModelLabel }}</span>
                    </button>
                    <div v-if="modelMenuOpen" class="model-dropdown" @mousedown.stop @click.stop>
                      <button
                        v-for="m in modelOptions"
                        :key="m.id || 'auto'"
                        class="model-item"
                        type="button"
                        :class="{ active: m.id === selectedModelId }"
                        @click="selectModel(m)"
                      >
                        <div class="model-main">
                          <div class="model-name">{{ m.label }}</div>
                          <div class="model-badge">{{ m.badge }}</div>
                        </div>
                        <div v-if="m.hint" class="model-hint">{{ m.hint }}</div>
                      </button>
                    </div>
                  </div>

                  <label
                    class="toggle-btn"
                    :class="{ active: deepMode }"
                    :title="hasPreviews && !deepMode ? ui.deepThinkDisabledTip : ''"
                  >
                    <input
                      type="checkbox"
                      v-model="deepMode"
                      :disabled="loading || (!deepMode && hasPreviews)"
                    />
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
                  <button
                    class="toggle-btn history-toggle-btn"
                    type="button"
                    :class="{ active: historySidebarOpen }"
                    @click="toggleHistorySidebar"
                    :disabled="loading"
                  >
                    <span class="toggle-icon">🕒</span>
                    <span class="toggle-text">{{ ui.memory }}</span>
                  </button>
                  <button
                    class="send-btn"
                    :class="{ stop: loading || isStyleSelecting, 'has-cost': showSendCostInline }"
                    @click="
                      loading
                        ? onStopProcessing()
                        : isStyleSelecting
                          ? onExitStyleSelection()
                          : onPrimary()
                    "
                    :disabled="loading ? false : isStyleSelecting ? false : !canPrimary"
                    :title="generateHoverTip"
                  >
                    <span v-if="loading || isStyleSelecting">■</span>
                    <template v-else>
                      <span class="send-icon">↑</span>
                      <span v-if="showSendCostInline" class="send-cost-inline">{{
                        sendCostText
                      }}</span>
                    </template>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside class="right-side" :class="{ 'mobile-open': historySidebarOpen }">
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
              @click="onHistoryItemClick(item.id)"
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

            <div class="guide-card">
              <div class="guide-title">{{ ui.guideTitle }}</div>
              <div class="guide-desc">{{ ui.guideDesc }}</div>
              <div class="guide-chips">
                <span v-for="k in ui.guideKeywords" :key="k" class="guide-chip">{{ k }}</span>
              </div>
              <details v-for="f in ui.guideFaqs" :key="f.q" class="guide-faq">
                <summary class="guide-q">{{ f.q }}</summary>
                <div class="guide-a">{{ f.a }}</div>
              </details>
            </div>
          </div>
        </aside>
      </div>
    </div>
    <!-- Download Dialog -->
    <div
      v-if="showDownloadDialog"
      class="download-dialog-overlay"
      @click="showDownloadDialog = false"
    >
      <div class="download-dialog" @click.stop>
        <div class="download-header">
          <h3>下载图片</h3>
          <button class="close-btn" @click="showDownloadDialog = false">×</button>
        </div>
        <div class="download-options">
          <button class="download-option-btn" @click="handleDownloadOption('1024')">
            <span class="res-label">1024 x 1024</span>
            <span class="res-tag">HD</span>
          </button>
          <button class="download-option-btn" @click="handleDownloadOption('2k')">
            <span class="res-label">2048 x 2048</span>
            <span class="res-tag">2K</span>
          </button>
          <button
            class="download-option-btn"
            @click="handleDownloadOption('4k')"
            :disabled="!isProPlus"
          >
            <span class="res-label">4096 x 4096</span>
            <span class="res-tag">4K</span>
          </button>
        </div>
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
import { trackEvent } from '@/utils/analytics';
import {
  getCreditsBalance,
  type CreditsBalance,
  getCreditsCosts,
  type CreditsCosts,
  getCreditsOrders,
  type PayPackageId
} from '@/points';
import { img2img, type GenerateImageInput, type Img2ImgImageInput } from './services/text';
import type { AgentImgPromptResult } from './types';
import { agentImgPromptLibrary } from './data/promptLibrary';
import { downloadBlob } from '@/agentImg/logic/formatFactory/url';

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
      creditsBalance: '点数余额',
      totalCredits: '总点数',
      refreshCredits: '刷新点数',
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
      designElements: '设计元素',
      style: '风格',
      colorScheme: '色系',
      add: '添加',
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
      generateThisDirection: '生成',
      welcomeTitle: '欢迎使用 Artigen AI 工坊。',
      welcomeSub:
        '请简单描述您想要生成的图片 或上传参考图。发送后我会优化您的输入并且结合相关提示词并生成结果。',
      memory: '历史记录',
      noHistory: '暂无历史记录',
      resultTitle: '生成结果',
      positivePrompt: 'Positive Prompt',
      negativePrompt: 'Negative Prompt',
      imageLabel: 'Image',
      download: '下载',
      reference: '引用',
      addImage: '添加图片',
      model: '模型',
      modelTip: '当前：默认模型',
      modelStandard: '默认模型',
      modelNanobanana: 'Nano Banana',
      modelNanobananaPro: 'Nano BananaPro',
      modelLocked: '需要 Pro 以上',
      modelComingSoon: '暂未接入',
      costTip: '预计扣费：{n} 点/次（以实际扣费为准）',
      deepThinkToggle: '深度思考',
      deepThinkDisabledTip: '图生图暂不支持深度思考',
      productSpecial: '产品专项',
      sendHint: 'Ctrl + Enter 发送',
      inputPlaceholder: '描述你想要的产品图，比如：“一瓶精华液放在冰块上，背景是阳光海滩”...',
      dropHint: '拖拽图片到这里松开即可添加',
      loadingText: '正在处理，请耐心等待…',
      guideTitle: '使用指南 / 我们的优势',
      guideDesc:
        '先在左侧「产品档案」补齐关键信息，再用一句话描述场景；打开「深度思考」会自动优化提示词与构图。支持多参考图图生图，让风格与质感更稳定。',
      guideKeywords: [
        '深度思考模型',
        '多参考图生成',
        '主流强力生图模型',
        '电商产品工作流',
        '4K 高清下载（Pro+）'
      ],
      guideFaqs: [
        {
          q: '文件会上传到服务器吗？',
          a: '格式工厂相关工具默认在浏览器本地处理；AI 工坊在生成/图生图时会将必要信息（提示词/参考图）发送到模型服务完成生成。'
        },
        {
          q: '从哪里开始更快？',
          a: '有参考图就用图生图；只有想法就用文生图。做电商图建议先填产品档案，再选择风格/场景。'
        },
        {
          q: '深度思考有什么用？',
          a: '深度思考会自动补全构图、光影、材质与质量词，并做提示词结构化，让同样输入更容易出“电商成片”。'
        },
        {
          q: '怎么提高一致性与可控性？',
          a: '支持多张参考图同时参与生成，建议用：产品图 + 风格参考 + 场景参考；再配合产品档案字段，稳定输出。'
        },
        {
          q: '我们的优势是什么？',
          a: '内置深度思考模型做提示词与构图优化；支持多图同时作为参考进行生成；接入多种主流强力生图模型，覆盖写实/商业/风格化等场景。'
        }
      ]
    };
  }
  return {
    navFormatFactory: 'Format Factory',
    navAiWorkshop: 'AI Workshop',
    navMarket: 'Compute Market',
    homeLink: 'Home',
    goMarket: 'Go to Market',
    creditsBalance: 'Credit balance',
    totalCredits: 'Total credits',
    refreshCredits: 'Refresh credits',
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
    designElements: 'Design Elements',
    style: 'Style',
    colorScheme: 'Color Scheme',
    add: 'Add',
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
    generateThisDirection: 'Generate',
    welcomeTitle: 'Welcome to Artigen AI Workshop.',
    welcomeSub:
      'Please briefly describe the image you want to generate, or upload a reference image. After you send, I’ll refine your input, combine it with relevant prompts, and generate the result.',
    memory: 'History',
    noHistory: 'No history yet',
    resultTitle: 'Result',
    positivePrompt: 'Positive Prompt',
    negativePrompt: 'Negative Prompt',
    imageLabel: 'Image',
    download: 'Download',
    reference: 'Reference',
    addImage: 'Add image',
    model: 'Model',
    modelTip: 'Current: Default model',
    modelStandard: 'Default model',
    modelNanobanana: 'Nano Banana',
    modelNanobananaPro: 'Nano BananaPro',
    modelLocked: 'Requires Pro pack or higher',
    modelComingSoon: 'Coming soon',
    costTip: 'Est. cost: {n} credits/run (actual deduction may vary)',
    deepThinkToggle: 'Deep Thinking',
    deepThinkDisabledTip: 'Deep Thinking is disabled for image-to-image',
    productSpecial: 'Product',
    sendHint: 'Ctrl + Enter to send',
    inputPlaceholder:
      'Describe your scene, e.g. a sparkling soda on ice cubes with a sunny beach background...',
    dropHint: 'Drop image here to add',
    loadingText: 'Processing, please wait…',
    guideTitle: 'Quick guide / Why us',
    guideDesc:
      'Fill the product profile first, then describe the scene in one line. Turn on Deep Thinking to refine prompts and composition. Multi-reference img2img keeps style and texture consistent.',
    guideKeywords: [
      'deep thinking model',
      'multi-reference img2img',
      'top image generation models',
      'commerce workflow',
      '4K download (Pro+)'
    ],
    guideFaqs: [
      {
        q: 'Do files get uploaded to a server?',
        a: 'Format Factory tools run locally in your browser by default. For AI generation/img2img, we send the required inputs (prompts/reference images) to the model service to produce results.'
      },
      {
        q: 'Where should I start for faster results?',
        a: 'Use img2img when you have references; use text-to-image for fast ideation. For commerce images, complete the product profile first.'
      },
      {
        q: 'What does Deep Thinking do?',
        a: 'It refines prompts and composition by adding lighting/material/quality cues, making outputs look more like polished commerce visuals.'
      },
      {
        q: 'How to improve consistency and control?',
        a: 'Use multi-reference img2img: combine a product photo, a style reference, and a scene reference. Product profile fields further stabilize results.'
      },
      {
        q: 'What makes it different?',
        a: 'Deep Thinking improves prompts and composition; multi-reference generation for stronger control; and access to powerful mainstream image models for diverse styles.'
      }
    ]
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
  notice?: { type: 'cancel'; text: string } | null;
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
  designElements,
  toggleDesignElement,
  styles,
  toggleStyle,
  colors,
  toggleColor
} = useAgentImgSettings();

const newDesignElement = ref('');
const newStyle = ref('');
const newColor = ref('');

const addDesignElement = () => {
  if (newDesignElement.value.trim()) {
    toggleDesignElement(newDesignElement.value.trim());
    newDesignElement.value = '';
  }
};

const addStyle = () => {
  if (newStyle.value.trim()) {
    toggleStyle(newStyle.value.trim());
    newStyle.value = '';
  }
};

const addColor = () => {
  if (newColor.value.trim()) {
    toggleColor(newColor.value.trim());
    newColor.value = '';
  }
};

const buildProductProfileContextText = () => {
  const zh = currentLang.value === 'zh';
  const sep = zh ? '：' : ': ';
  const joinTags = (tags: string[]) => (zh ? tags.join('、') : tags.join(', '));

  const pName = String(productName.value || '').trim();
  const pCat = String(productCategory.value || '').trim();
  const bName = String(brandName.value || '').trim();
  const mat = String(material.value || '').trim();
  const scene = String(sceneType.value || '').trim();
  const light = String(lighting.value || '').trim();
  const color = String(primaryColor.value || '').trim();
  const logo = String(logoFileName.value || '').trim();
  const de = Array.isArray(designElements.value)
    ? designElements.value.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const st = Array.isArray(styles.value)
    ? styles.value.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const cs = Array.isArray(colors.value)
    ? colors.value.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  const hasAny =
    !!pName ||
    !!pCat ||
    !!bName ||
    !!mat ||
    !!scene ||
    !!light ||
    !!color ||
    !!logo ||
    de.length > 0 ||
    st.length > 0 ||
    cs.length > 0;

  if (!hasAny) return '';

  const lines: string[] = [];
  lines.push(
    zh
      ? `目标${sep}电商商品图/商业成片（主体突出、构图干净、避免文字与水印）`
      : `Goal${sep}e-commerce product visual (commercial-ready, clean composition, subject-first, avoid text/watermarks)`
  );
  if (pName) lines.push(`${zh ? '产品名称' : 'Product Name'}${sep}${pName}`);
  if (pCat) lines.push(`${zh ? '类目' : 'Category'}${sep}${pCat}`);
  if (bName) lines.push(`${zh ? '品牌' : 'Brand'}${sep}${bName}`);
  if (mat) lines.push(`${zh ? '材质' : 'Material'}${sep}${mat}`);
  if (scene) lines.push(`${zh ? '场景' : 'Scene'}${sep}${scene}`);
  if (light) lines.push(`${zh ? '布光' : 'Lighting'}${sep}${light}`);
  if (color) lines.push(`${zh ? '主色调' : 'Primary Color'}${sep}${color}`);
  lines.push(
    `${zh ? 'Logo' : 'Logo'}${sep}${logo ? (zh ? `有（${logo}）` : `Yes (${logo})`) : zh ? '无' : 'No'}`
  );
  if (de.length) lines.push(`${zh ? '设计元素' : 'Design Elements'}${sep}${joinTags(de)}`);
  if (st.length) lines.push(`${zh ? '风格' : 'Style'}${sep}${joinTags(st)}`);
  if (cs.length) lines.push(`${zh ? '色系' : 'Color Scheme'}${sep}${joinTags(cs)}`);
  return lines.join('\n');
};

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
  getContextText: () => buildProductProfileContextText(),
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
const lastUserText = ref('');
const chatScrollEl = ref<HTMLElement | null>(null);
const activeRequestId = ref('');
const pendingNotice = ref<{ type: 'cancel'; text: string } | null>(null);

const clearCancelNotices = () => {
  pendingNotice.value = null;
  history.value = history.value.map((it) => {
    if (it.notice && it.notice.type === 'cancel') return { ...it, notice: null };
    return it;
  });
};

const setCancelNoticeForHistory = (id: string | number, text: string) => {
  const t = String(text || '').trim();
  if (!t) return;
  history.value = history.value.map((it) => {
    if (it.id !== id) return it;
    return { ...it, notice: { type: 'cancel', text: t } };
  });
};

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

const isStyleSelecting = computed(() => deepMode.value && options.value.length > 0);

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
const historySidebarOpen = ref(false);
const previewUrls = ref<string[]>(['', '']);
const previewFiles = ref<(File | null)[]>([null, null]);
const fileInputs = ref<HTMLInputElement[]>([]);
const hasPreviews = computed(() => previewUrls.value.some((u) => !!u));

const modelMenuOpen = ref(false);
const selectedModelId = ref<string>('');
const userTier = ref<PayPackageId | ''>('');
const userTierLoading = ref(false);

const rankOfTier = (tier: PayPackageId | '') => {
  if (tier === 'starter') return 1;
  if (tier === 'standard') return 2;
  if (tier === 'pro') return 3;
  if (tier === 'ultimate') return 4;
  return 0;
};

const isProPlus = computed(() => rankOfTier(userTier.value) >= 3);

const refreshUserTier = async () => {
  if (!isAuthed.value) {
    userTier.value = '';
    userTierLoading.value = false;
    return;
  }
  if (userTierLoading.value) return;
  userTierLoading.value = true;
  try {
    const orders = await getCreditsOrders();
    if (!orders || !orders.length) {
      userTier.value = '';
      return;
    }
    const max = orders.reduce<PayPackageId | ''>((acc, o) => {
      const next = o.packageId || '';
      return rankOfTier(next) > rankOfTier(acc) ? next : acc;
    }, '');
    userTier.value = max;
  } finally {
    userTierLoading.value = false;
  }
};

const modelOptions = computed(() => {
  const autoHint =
    currentLang.value === 'zh'
      ? '自动：按图生图/文生图自动选择'
      : 'Auto: picks based on img2img/txt2img';
  const txtHint =
    currentLang.value === 'zh' ? '更适合纯提示词出图' : 'Better for text-only generation';
  const editHint =
    currentLang.value === 'zh' ? '更适合带参考图编辑' : 'Better for image editing with references';
  return [
    { id: '', label: ui.value.modelStandard, badge: 'AUTO', hint: autoHint, requiresPro: false },
    {
      id: 'Qwen/Qwen-Image',
      label: ui.value.modelNanobanana,
      badge: 'TXT',
      hint: txtHint,
      requiresPro: true
    },
    {
      id: 'Qwen/Qwen-Image-Edit-2509',
      label: ui.value.modelNanobananaPro,
      badge: 'EDIT',
      hint: editHint,
      requiresPro: true
    }
  ];
});
const currentModelLabel = computed(() => {
  const found = modelOptions.value.find((x) => x.id === selectedModelId.value);
  return found?.label || ui.value.modelStandard;
});
const currentModelTip = computed(() => {
  const label = currentModelLabel.value;
  return currentLang.value === 'zh' ? `当前：${label}` : `Current: ${label}`;
});
const toggleModelMenu = () => {
  modelMenuOpen.value = !modelMenuOpen.value;
};
const ensureProAccessOrRedirect = async () => {
  if (!ensureAuthed()) return false;
  if (!userTier.value) await refreshUserTier();
  if (isProPlus.value) return true;
  modelMenuOpen.value = false;
  showTopTip(ui.value.modelLocked);
  router.push({ path: '/artigen/market', query: { proOnly: '1' } });
  return false;
};
const selectModel = async (m: { id: string; requiresPro?: boolean }) => {
  const id = String(m?.id || '').trim();
  if (m?.requiresPro) {
    const ok = await ensureProAccessOrRedirect();
    if (!ok) return;
  }
  selectedModelId.value = id;
  modelMenuOpen.value = false;
};

const closeMobileOverlays = () => {
  productSidebarOpen.value = false;
  historySidebarOpen.value = false;
};

const toggleProductSidebar = () => {
  const next = !productSidebarOpen.value;
  productSidebarOpen.value = next;
  if (next) historySidebarOpen.value = false;
};

const toggleHistorySidebar = () => {
  const next = !historySidebarOpen.value;
  historySidebarOpen.value = next;
  if (next) productSidebarOpen.value = false;
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
const creditsCosts = ref<CreditsCosts | null>(null);
const finalImageUrl = ref('');
const history = ref<HistoryItem[]>([]);

const chatInputDragOver = ref(false);

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
      if (isHiddenHistoryItem(userText)) continue;
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

const isHiddenHistoryItem = (userText: string) => {
  const t = String(userText || '')
    .trim()
    .toLowerCase();
  return t.startsWith('id_photo:') || t.startsWith('old_photo:');
};

const resolveRemoteUrl = (raw: string) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('/')) return buildApiUrl(u);
  return u;
};

const extractUserTextFromPrompt = (prompt: string) => {
  const p = String(prompt || '').trim();
  if (!p) return '';
  const m1 = p.match(/(?:^|\n\n)\s*(?:用户需求|User Request)\s*:\s*\n([\s\S]+)$/i);
  if (m1 && typeof m1[1] === 'string' && m1[1].trim()) return m1[1].trim();
  const m2 = p.match(/(?:^|\n\n)\s*(?:用户需求|User Request)\s*:\s*([\s\S]+)$/i);
  if (m2 && typeof m2[1] === 'string' && m2[1].trim()) return m2[1].trim();
  const m3 = p.match(/(?:^|\n\n)\s*User input\s*:\s*([\s\S]+)$/i);
  if (m3 && typeof m3[1] === 'string' && m3[1].trim()) return m3[1].trim();
  return p;
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
        const userText = (() => {
          const ut = typeof it?.userText === 'string' ? it.userText.trim() : '';
          if (ut) return ut;
          return extractUserTextFromPrompt(prompt);
        })();
        if (isHiddenHistoryItem(userText)) return null;
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
        if (!ts || !prompt || !negativePrompt || !userText) return null;
        const idRaw = typeof it?.id === 'string' && it.id.trim() ? it.id.trim() : `h_${ts}`;
        return {
          id: idRaw,
          timestamp: ts,
          userText,
          result: { prompt, negativePrompt, params: it?.params },
          image: firstUrl || null,
          ...(refs.length ? { refImages: refs } : {}),
          notice: null
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

const topTipText = ref('');
const topTipOpen = ref(false);
let topTipTimer: number | null = null;
const showTopTip = (msg: string) => {
  const m = String(msg || '').trim();
  if (!m) return;
  topTipText.value = m;
  topTipOpen.value = true;
  if (topTipTimer) window.clearTimeout(topTipTimer);
  topTipTimer = window.setTimeout(() => {
    topTipTimer = null;
    topTipOpen.value = false;
  }, 3200);
};

watch(
  () => error.value,
  (v) => {
    const m = String(v || '').trim();
    if (!m) return;
    const cancelled =
      m === 'Cancelled.' || m === '已取消' || /cancelled/i.test(m) || /取消/.test(m);
    if (cancelled) {
      const reqId = String(activeRequestId.value || '').trim();
      if (reqId) setCancelNoticeForHistory(reqId, m);
      else if (pendingUserText.value) pendingNotice.value = { type: 'cancel', text: m };
      error.value = '';
      return;
    }
    showTopTip(m);
  }
);

const onHistoryItemClick = (id: string | number) => {
  scrollToGeneration(id);
  historySidebarOpen.value = false;
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

const refreshCosts = async () => {
  if (creditsCosts.value) return;
  creditsCosts.value = await getCreditsCosts();
};

const creditsText = computed(() => {
  const bal = creditsBalance.value;
  if (!bal) return '--';
  return String(Number(bal.available ?? 0));
});

const totalCreditsText = computed(() => {
  const bal = creditsBalance.value;
  if (!bal) return '--';
  const a = Number(bal.available ?? 0) || 0;
  const f = Number(bal.frozen ?? 0) || 0;
  return String(a + f);
});

const creditsPopoverOpen = ref(false);
const creditsContainerRef = ref<HTMLElement | null>(null);

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
  creditsPopoverOpen.value = false;
  router.push('/artigen/market');
};

const toggleCreditsPopover = () => {
  creditsPopoverOpen.value = !creditsPopoverOpen.value;
  if (creditsPopoverOpen.value) void refreshCredits();
};

const primaryText = computed(() => {
  if (loading.value) return currentLang.value === 'zh' ? '正在处理...' : 'Processing...';
  if (deepMode.value) {
    return options.value.length > 0
      ? ui.value.generateThisDirection
      : currentLang.value === 'zh'
        ? '分析视觉方向'
        : 'Analyze Directions';
  }
  return currentLang.value === 'zh' ? '快速生成' : 'Generate';
});

const primaryTextWithCost = computed(() => {
  if (loading.value) return primaryText.value;
  if (!showGenerateCost.value) return primaryText.value;
  return `${primaryText.value} ${sendCostText.value}`;
});

const resolvedCost = computed(() => {
  const costs = creditsCosts.value;
  const fallback = 10;
  if (!costs) return fallback;
  const img2imgCost = Math.max(0, Number(costs.img2img ?? fallback) || 0);
  const generateCost = Math.max(0, Number(costs.generate ?? fallback) || 0);
  if (deepMode.value && options.value.length === 0) return generateCost;
  return img2imgCost;
});

const canPrimary = computed(() => {
  if (loading.value) return false;
  if (deepMode.value) {
    if (options.value.length === 0) return canAnalyze.value;
    return (
      !!String(selectedOptionId.value || '').trim() &&
      (!!String(userInput.value || '').trim() || !!String(lastUserText.value || '').trim())
    );
  }
  return !!String(userInput.value || '').trim();
});

const generateHoverTip = computed(() => {
  if (loading.value) return '';
  return String(ui.value.costTip || '').replace('{n}', String(resolvedCost.value));
});

const showGenerateCost = computed(() => {
  if (deepMode.value) return options.value.length > 0;
  return true;
});

const sendCostText = computed(() => {
  const n = resolvedCost.value;
  return `⚡${n}`;
});

const showSendCostInline = computed(
  () => !loading.value && !deepMode.value && !isStyleSelecting.value
);

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
  if (c === 'CLIENT_ABORTED') return currentLang.value === 'zh' ? '已取消' : 'Cancelled.';
  if (c === 'API_ERROR_499') return currentLang.value === 'zh' ? '已取消' : 'Cancelled.';
  if (c === 'UPSTREAM_TIMEOUT' || c === 'API_ERROR_504')
    return currentLang.value === 'zh' ? '服务超时，请稍后再试' : 'Request timed out, please retry.';
  if (c === 'INSUFFICIENT_CREDITS')
    return currentLang.value === 'zh'
      ? '积分不足，请前往「算力商城」充值'
      : 'Insufficient credits. Please top up in the Market.';
  if (c === 'EMPTY_IMAGE')
    return currentLang.value === 'zh'
      ? '请先上传一张参考图再出图'
      : 'Please upload a reference image first.';
  if (c === 'REQUEST_IN_PROGRESS')
    return currentLang.value === 'zh'
      ? '请求处理中，请稍后再试'
      : 'Request in progress, try again later.';
  if (c === 'DUPLICATE_REQUEST')
    return currentLang.value === 'zh'
      ? '重复请求，请稍后再试'
      : 'Duplicate request, try again later.';
  if (c === 'EMPTY_IMAGE_RESULT')
    return currentLang.value === 'zh' ? '出图失败：服务未返回图片' : 'Failed: empty image result.';
  if (c === 'CREDITS_CONFIRM_FAILED')
    return currentLang.value === 'zh'
      ? '扣费确认失败，已回滚，请重试'
      : 'Credits confirmation failed (rolled back). Please retry.';
  if (c === 'MISSING_SILICONFLOW_API_KEY')
    return currentLang.value === 'zh' ? '服务未配置，请联系管理员' : 'Server not configured.';
  if (c === 'NETWORK_ERROR' || c === 'FETCH_ERROR')
    return currentLang.value === 'zh' ? '网络错误，请稍后再试' : 'Network error, please try again.';
  if (c.startsWith('SILICONFLOW_IMAGE_'))
    return currentLang.value === 'zh'
      ? '服务繁忙或参数错误，请稍后再试'
      : 'Upstream error, please try again.';
  return currentLang.value === 'zh' ? `出图失败：${c}` : `Image generation failed: ${c}`;
};

const buildDeepPrompt = (baseText: string) => {
  const title = String(selectedOptionTitle.value || '').trim();
  const summary = String(selectedOptionSummary.value || '').trim();
  const tags = ensureUniqueTags(selectedOptionStyleTags.value || []).join(', ');
  const parts = [String(baseText || '').trim(), title, summary, tags].filter(Boolean);
  return parts.join(', ');
};

const buildDeepDisplayText = (_userText: string, opt: { title: string; summary: string }) => {
  const title = String(opt?.title || '').trim();
  const summary = String(opt?.summary || '').trim();
  if (title && summary) return `${title} ${summary}`.trim();
  return (title || summary).trim();
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

const buildPromptWithContext = (userText: string) => {
  const u = String(userText || '').trim();
  const ctx = String(buildProductProfileContextText() || '').trim();
  if (!ctx) return u;
  const prefix = currentLang.value === 'zh' ? '产品档案' : 'Product Profile';
  const req = currentLang.value === 'zh' ? '用户需求' : 'User Request';
  if (!u) return `${prefix}:\n${ctx}`;
  return `${prefix}:\n${ctx}\n\n${req}:\n${u}`;
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
  clearCancelNotices();
  cancel();
  abortImg2Img();
  const rawUserText = String(userInput.value || '').trim();
  const activeUserText = rawUserText || String(lastUserText.value || '').trim();
  if (rawUserText) lastUserText.value = rawUserText;
  if (!activeUserText) {
    return;
  }

  trackEvent('ai_generate_start', {
    category: 'funnel',
    deepMode: !!deepMode.value,
    model: String(selectedModelId.value || '').trim(),
    hasRef: previewFiles.value.filter((f) => !!f).length > 0,
    hasLogo: !!logoFile.value
  });

  const getImgInputs = async () => {
    const files: File[] = [];
    for (const f of previewFiles.value) if (f) files.push(f);
    const list = files.slice(0, 3);
    if (!list.length) return [];
    const inputs = await Promise.all(list.map(fileToGenerateInput));
    const ok = inputs.filter((x): x is GenerateImageInput => !!x && !!x.mimeType && !!x.dataBase64);
    return ok.length ? ok : [];
  };

  const runGen = async (fp: AgentImgPromptResult, requestId: string, displayUserText: string) => {
    const refImgs = await getImgInputs();
    const logoInput = logoFile.value ? await fileToGenerateInput(logoFile.value) : null;
    const hasLogo = !!logoInput && !!logoFile.value;
    const buildFinalImages = () => {
      if (!hasLogo) return refImgs as Img2ImgImageInput[];
      if (refImgs.length)
        return [...refImgs.slice(0, 2), logoInput as GenerateImageInput] as Img2ImgImageInput[];
      return [logoInput as GenerateImageInput] as Img2ImgImageInput[];
    };

    activeRequestId.value = requestId;

    const runOnce = async (args: {
      prompt: string;
      userText: string;
      negativePrompt?: string;
      params?: AgentImgPromptResult['params'];
      images: Img2ImgImageInput[];
    }) => {
      abortImg2Img();
      const ctl = new AbortController();
      activeImgAbort.value = ctl;
      const res = await img2img({
        prompt: args.prompt,
        userText: args.userText,
        negativePrompt: args.negativePrompt,
        params: args.params,
        images: args.images,
        model: selectedModelId.value,
        reason: 'ai_design',
        timeoutMs: 120000,
        requestId,
        deepMode: !!deepMode.value,
        signal: ctl.signal
      });
      if (activeImgAbort.value === ctl) activeImgAbort.value = null;
      if (!res.ok) {
        if (res.wallet) creditsBalance.value = res.wallet;
        const code = String(res.errorCode || res.error || '').trim();
        const abortLike =
          code === 'ABORTED' ||
          code === 'AbortError' ||
          code === 'CLIENT_ABORTED' ||
          code === 'API_ERROR_499' ||
          /aborted/i.test(code) ||
          /AbortError/i.test(code);
        if (abortLike) {
          const msg = humanizeImgError(code || 'ABORTED');
          setCancelNoticeForHistory(requestId, msg);
          trackEvent('ai_generate_abort', {
            category: 'funnel',
            error: code || 'ABORTED',
            model: String(selectedModelId.value || '').trim(),
            deepMode: !!deepMode.value
          });
          return { ok: false as const, url: '' };
        }
        error.value = humanizeImgError(code);
        trackEvent('ai_generate_fail', {
          category: 'funnel',
          error: code || 'FAILED',
          model: String(selectedModelId.value || '').trim(),
          deepMode: !!deepMode.value
        });
        return { ok: false as const, url: '' };
      }
      const url = String(res.images?.[0]?.url || '').trim();
      const resolvedUrl = resolveRemoteUrl(url);
      if (!resolvedUrl) {
        error.value = humanizeImgError('EMPTY_IMAGE_RESULT');
        trackEvent('ai_generate_fail', {
          category: 'funnel',
          error: 'EMPTY_IMAGE_RESULT',
          model: String(selectedModelId.value || '').trim(),
          deepMode: !!deepMode.value
        });
        return { ok: false as const, url: '' };
      }
      trackEvent('ai_generate_success', {
        category: 'funnel',
        model: String(selectedModelId.value || '').trim(),
        deepMode: !!deepMode.value,
        hasRef: previewFiles.value.filter((f) => !!f).length > 0,
        hasLogo: !!logoFile.value
      });
      return { ok: true as const, url: resolvedUrl };
    };

    loading.value = true;
    error.value = '';
    const out = await runOnce({
      prompt: hasLogo ? applyLogoInstructionToPrompt(fp.prompt) : fp.prompt,
      userText: displayUserText,
      negativePrompt: fp.negativePrompt,
      params: fp.params,
      images: buildFinalImages()
    });
    loading.value = false;
    if (activeRequestId.value === requestId) activeRequestId.value = '';
    if (out.ok) {
      finalImageUrl.value = out.url;
      await refreshCredits();
    }
    return out;
  };

  if (deepMode.value) {
    if (options.value.length === 0) {
      pendingUserText.value = activeUserText;
      const p = analyzeDirections();
      userInput.value = '';
      await p;
      await refreshCredits();
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
    const baseText = buildPromptWithContext(activeUserText);
    const prompt = applyStyleTagsToPrompt(buildDeepPrompt(baseText), opt.styleTags || []);
    const negativePrompt = buildNegativePrompt(opt.negativeTags || []);
    const fp: AgentImgPromptResult = { prompt, negativePrompt };
    options.value = [];
    selectedOptionId.value = '';

    userInput.value = '';
    const refThumbsRaw = await Promise.all(
      previewFiles.value
        .filter((f): f is File => !!f)
        .slice(0, 3)
        .map((f) => fileToThumbDataUrl(f))
    );
    const refThumbs = refThumbsRaw.filter((x): x is string => !!x);
    const requestId = `img2img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const displayText = buildDeepDisplayText(activeUserText, {
      title: String(opt?.title || '').trim(),
      summary: String(opt?.summary || '').trim()
    });
    history.value = [
      ...history.value,
      {
        id: requestId,
        timestamp: Date.now(),
        userText: displayText || activeUserText,
        result: fp,
        image: null,
        ...(refThumbs.length ? { refImages: refThumbs } : {}),
        notice: null
      }
    ].slice(-MAX_HISTORY);
    pendingUserText.value = '';
    const { ok, url } = await runGen(fp, requestId, displayText || activeUserText);
    if (ok) {
      history.value = history.value.map((it) => (it.id === requestId ? { ...it, image: url } : it));
    }
    return;
  }

  const fp: AgentImgPromptResult = {
    prompt: buildPromptWithContext(activeUserText),
    negativePrompt: buildNegativePrompt()
  };
  userInput.value = '';
  const refThumbsRaw = await Promise.all(
    previewFiles.value
      .filter((f): f is File => !!f)
      .slice(0, 3)
      .map((f) => fileToThumbDataUrl(f))
  );
  const refThumbs = refThumbsRaw.filter((x): x is string => !!x);
  const requestId = `img2img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  history.value = [
    ...history.value,
    {
      id: requestId,
      timestamp: Date.now(),
      userText: activeUserText,
      result: fp,
      image: null,
      ...(refThumbs.length ? { refImages: refThumbs } : {}),
      notice: null
    }
  ].slice(-MAX_HISTORY);
  pendingUserText.value = '';
  const { ok, url } = await runGen(fp, requestId, activeUserText);
  if (ok) {
    history.value = history.value.map((it) => (it.id === requestId ? { ...it, image: url } : it));
  }
};

const onPrimary = async () => {
  if (!ensureAuthed(() => onPrimary())) return;
  trackEvent('ai_generate_click', {
    category: 'funnel',
    deepMode: !!deepMode.value,
    model: String(selectedModelId.value || '').trim(),
    hasRef: previewFiles.value.filter((f) => !!f).length > 0,
    hasLogo: !!logoFile.value
  });
  await doPrimary();
};

const onStopProcessing = () => {
  const reqId = String(activeRequestId.value || '').trim();
  if (reqId) {
    setCancelNoticeForHistory(reqId, humanizeImgError('ABORTED'));
  } else if (pendingUserText.value) {
    pendingNotice.value = { type: 'cancel', text: humanizeImgError('ABORTED') };
  }
  cancel();
  abortImg2Img();
};

const restoreLastUserTextToInput = () => {
  const t = String(lastUserText.value || '').trim();
  if (!t) return;
  const cur = String(userInput.value || '');
  if (!cur.trim()) {
    userInput.value = t;
    return;
  }
  const sep = cur.endsWith('\n') ? '' : '\n';
  userInput.value = `${cur}${sep}${t}`;
};

const onExitStyleSelection = () => {
  if (!options.value.length) return;
  options.value = [];
  selectedOptionId.value = '';
  pendingUserText.value = '';
  restoreLastUserTextToInput();
  scrollChatToBottom();
};

watch(
  () => deepMode.value,
  () => {
    if (options.value.length) onExitStyleSelection();
  }
);

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

const setPreviewFileAt = (idx: number, f: File) => {
  const url = URL.createObjectURL(f);
  previewFiles.value[idx] = f;
  setPreviewUrl(idx, url);
};

const afterPreviewsChanged = (keepDeep: boolean) => {
  if (!keepDeep) deepMode.value = false;
  cancel();
  abortImg2Img();
  if (!keepDeep) reset();
};

const onPreviewChange = (idx: number, e: Event) => {
  const input = e.target as HTMLInputElement | null;
  const f = input?.files && input.files.length ? input.files[0] : null;
  if (!f) {
    if (input) input.value = '';
    return;
  }
  setPreviewFileAt(idx, f);
  const keepDeep = isStyleSelecting.value;
  afterPreviewsChanged(keepDeep);
  if (input) input.value = '';
};

const onChatInputDragOver = (e: DragEvent) => {
  if (loading.value) return;
  e.preventDefault();
  chatInputDragOver.value = true;
};

const onChatInputDragLeave = (e: DragEvent) => {
  e.preventDefault();
  chatInputDragOver.value = false;
};

const onChatInputDrop = (e: DragEvent) => {
  if (loading.value) return;
  e.preventDefault();
  e.stopPropagation();
  chatInputDragOver.value = false;

  const dt = e.dataTransfer;
  const files = dt?.files ? Array.from(dt.files) : [];
  const images = files.filter(
    (f) => f && typeof f.type === 'string' && f.type.startsWith('image/')
  );
  if (!images.length) return;

  const emptySlots = previewUrls.value.map((u, i) => (!u ? i : -1)).filter((i) => i >= 0);

  let overwriteIdx = 0;
  for (const f of images) {
    const idx = emptySlots.length
      ? (emptySlots.shift() as number)
      : overwriteIdx++ % previewUrls.value.length;
    setPreviewFileAt(idx, f);
  }

  const keepDeep = isStyleSelecting.value;
  afterPreviewsChanged(keepDeep);
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
  if (isAuthed.value) void refreshUserTier();
  else userTier.value = '';
};

const chatInputRef = ref<HTMLTextAreaElement | null>(null);

const onGlobalPointerDown = (e: PointerEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  if (creditsPopoverOpen.value && !target.closest('.credits-container')) {
    creditsPopoverOpen.value = false;
  }

  if (modelMenuOpen.value && !target.closest('.model-menu')) modelMenuOpen.value = false;

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

let wideSidebarMql: MediaQueryList | null = null;
const onWideSidebarChange = (e: MediaQueryListEvent) => {
  if (e.matches) productSidebarOpen.value = true;
};

type AgentImgPrefillItem = { kind: 'data' | 'url'; value: string };
const AGENT_IMG_PREFILL_KEY = 'agentImg:prefillRef_v1';

const consumeAgentImgPrefill = (): AgentImgPrefillItem[] => {
  try {
    const raw = window.localStorage.getItem(AGENT_IMG_PREFILL_KEY);
    if (!raw) return [];
    window.localStorage.removeItem(AGENT_IMG_PREFILL_KEY);
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    const normalized = list
      .map((it: any): AgentImgPrefillItem | null => {
        const kind = it?.kind === 'data' ? 'data' : it?.kind === 'url' ? 'url' : '';
        const value = String(it?.value || '').trim();
        if (!kind || !value) return null;
        return { kind, value };
      })
      .filter((x: any): x is AgentImgPrefillItem => !!x);
    return normalized.slice(0, previewUrls.value.length);
  } catch {
    return [];
  }
};

const extFromMime = (mime: string) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
};

const prefillItemToFile = async (it: AgentImgPrefillItem): Promise<File | null> => {
  const v = String(it?.value || '').trim();
  if (!v) return null;
  try {
    const res = await fetch(v);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (
      !String(blob.type || '')
        .toLowerCase()
        .startsWith('image/')
    )
      return null;
    const ext = extFromMime(blob.type);
    return new File([blob], `reference_${Date.now().toString(36)}.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
};

const fetchImageBlob = async (url: string): Promise<Blob | null> => {
  try {
    const u = String(url || '').trim();
    if (!u) return null;
    const res = await fetch(u);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (
      !String(blob.type || '')
        .toLowerCase()
        .startsWith('image/')
    )
      return null;
    return blob;
  } catch {
    return null;
  }
};

const showDownloadDialog = ref(false);
const downloadTargetUrl = ref('');

const downloadMsgImage = (url: string) => {
  const s = String(url || '').trim();
  if (!s) return;
  downloadTargetUrl.value = s;
  showDownloadDialog.value = true;
};

const handleDownloadOption = async (label: string) => {
  if (label === '4k' && !isProPlus.value) {
    showDownloadDialog.value = false;
    showTopTip(
      currentLang.value === 'zh' ? '4K 下载仅 Pro 及以上可用' : '4K download requires Pro+'
    );
    trackEvent('AgentImg', 'download_locked', '4k');
    return;
  }
  showDownloadDialog.value = false;
  const url = downloadTargetUrl.value;
  if (!url) return;

  const blob = await fetchImageBlob(url);
  if (!blob) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'image';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {}
    }
    return;
  }

  let targetSize = 0;
  if (label === '1024') targetSize = 1024;
  else if (label === '2k') targetSize = 2048;
  else if (label === '4k') targetSize = 4096;

  if (targetSize > 0) {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    } catch {
      URL.revokeObjectURL(objectUrl);
      return;
    }

    const canvas = document.createElement('canvas');
    const scale = targetSize / Math.max(img.width, img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => {
          if (b) {
            downloadBlob(b, `artigen_${label}_${Date.now().toString(36)}.png`);
          }
          URL.revokeObjectURL(objectUrl);
        },
        'image/png',
        0.95
      );
      return;
    }
    URL.revokeObjectURL(objectUrl);
  }

  const ext = extFromMime(blob.type);
  downloadBlob(blob, `artigen_${Date.now().toString(36)}.${ext}`);
};

const referenceMsgImage = async (url: string) => {
  const s = String(url || '').trim();
  if (!s) return;
  const keepDeep = isStyleSelecting.value;
  const f = await prefillItemToFile({ kind: 'url', value: s });
  if (!f) return;
  const emptySlots = previewUrls.value.map((u, i) => (!u ? i : -1)).filter((i) => i >= 0);
  const idx = emptySlots.length ? (emptySlots[0] as number) : 0;
  setPreviewFileAt(idx, f);
  afterPreviewsChanged(keepDeep);
  try {
    chatInputRef.value?.focus();
  } catch {}
};

const applyPrefillRefImages = async () => {
  const items = consumeAgentImgPrefill();
  if (!items.length) return;
  const keepDeep = isStyleSelecting.value;
  const emptySlots = previewUrls.value.map((u, i) => (!u ? i : -1)).filter((i) => i >= 0);
  let overwriteIdx = 0;
  for (const it of items) {
    const f = await prefillItemToFile(it);
    if (!f) continue;
    const idx = emptySlots.length
      ? (emptySlots.shift() as number)
      : overwriteIdx++ % previewUrls.value.length;
    setPreviewFileAt(idx, f);
  }
  afterPreviewsChanged(keepDeep);
  try {
    chatInputRef.value?.focus();
  } catch {}
};

onMounted(() => {
  handleAuthChanged();
  void applyPrefillRefImages();
  try {
    wideSidebarMql = window.matchMedia('(min-width: 1920px)');
    if (wideSidebarMql.matches) productSidebarOpen.value = true;
    wideSidebarMql.addEventListener('change', onWideSidebarChange);
  } catch {}
  window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
  document.addEventListener('pointerdown', onGlobalPointerDown, true);
  void refreshCosts();
});

onBeforeUnmount(() => {
  abortImg2Img();
  if (historyPersistTimer) window.clearTimeout(historyPersistTimer);
  historyPersistTimer = null;
  try {
    wideSidebarMql?.removeEventListener('change', onWideSidebarChange);
  } catch {}
  wideSidebarMql = null;
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
  min-height: 100vh;
  min-height: 100dvh;
  height: 100vh;
  height: 100dvh;
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
  min-height: 0;
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
  min-height: 0;
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

.settings-card {
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-title {
  font-size: 15px;
  font-weight: 800;
  color: #e2e8f0;
  letter-spacing: 0.2px;
}

.card-divider {
  height: 1px;
  background: var(--border-color);
  margin: 8px 0;
}

.form-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  font-weight: 600;
  color: rgba(226, 232, 240, 0.7);
  letter-spacing: 0.2px;
}
.control-textarea {
  height: 200px !important;
}
.control {
  width: 100%;
  height: 38px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 0 12px;
  color: var(--text-main);
  font-size: 13px;
  transition: all 0.2s;
}
.control:hover {
  background: rgba(255, 255, 255, 0.055);
  border-color: rgba(255, 255, 255, 0.18);
}
.control:focus {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(204, 255, 0, 0.65);
  box-shadow: 0 0 0 3px rgba(204, 255, 0, 0.08);
  outline: none;
}
.control:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.control::placeholder {
  color: rgba(148, 163, 184, 0.55);
}

.select-wrapper {
  position: relative;
}
.select-wrapper::after {
  content: '';
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 5px;
  background-color: var(--text-muted);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  pointer-events: none;
  opacity: 0.8;
  transition: transform 0.2s;
}
.select-wrapper:hover::after {
  background-color: var(--text-main);
  transform: translateY(-50%) scale(1.1);
}
.select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  cursor: pointer;
  background-image: none !important;
  padding-right: 36px;
}
.select::-ms-expand {
  display: none;
}

.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
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

.msg-image-wrap {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.msg-image-actions {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  height: 34px;
  border-radius: 12px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: rgba(2, 6, 23, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
  pointer-events: none;
}

.msg-image-wrap:hover .msg-image-actions {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.msg-image-action-btn {
  flex: 1;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(241, 245, 249, 0.92);
  font-size: 12px;
  line-height: 1;
}

.msg-image-action-btn:hover {
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.1);
  color: rgba(241, 245, 249, 0.98);
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
  position: relative;
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
  width: 80px;
  height: 80px;
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
  border: none;
  font-size: 15px;
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

.textarea.drag-over {
  box-shadow: 0 0 0 1px var(--primary);
  background: rgba(204, 255, 0, 0.06);
}

.drop-hint {
  position: absolute;
  inset: 12px 12px 52px 12px;
  border-radius: 10px;
  border: 1px dashed rgba(204, 255, 0, 0.45);
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(241, 245, 249, 0.92);
  font-size: 12px;
  letter-spacing: 0.2px;
  pointer-events: none;
  z-index: 5;
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

.model-menu {
  position: relative;
}

.model-dropdown {
  position: absolute;
  bottom: 100%;
  top: auto;
  left: 0;
  margin-bottom: 10px;
  min-width: 260px;
  max-width: min(560px, 86vw);
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(10, 10, 10, 0.92);
  backdrop-filter: blur(14px);
  box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 90;
}

.model-item {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  padding: 10px 10px;
  color: var(--text-main);
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
}

.model-item:hover:not(:disabled) {
  border-color: rgba(204, 255, 0, 0.35);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.16);
}

.model-item:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.model-item.active {
  border-color: rgba(204, 255, 0, 0.7);
  background: rgba(204, 255, 0, 0.06);
  box-shadow: 0 0 0 1px rgba(204, 255, 0, 0.18);
}

.model-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.model-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 800;
  color: #e2e8f0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
  flex: 0 0 auto;
}

.model-item.active .model-name {
  color: #ccff00;
}

.model-item.active .model-badge {
  border-color: rgba(204, 255, 0, 0.35);
  color: #ccff00;
  background: rgba(204, 255, 0, 0.06);
}

.model-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.25;
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

.model-btn {
  cursor: pointer;
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

.top-tip {
  position: fixed;
  top: 74px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  max-width: min(680px, 92vw);
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  color: rgba(248, 113, 113, 0.95);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.2;
  letter-spacing: 0.2px;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-tip::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background: rgba(248, 113, 113, 0.95);
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.55);
  vertical-align: middle;
}

.top-tip-fade-enter-active,
.top-tip-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.top-tip-fade-enter-from,
.top-tip-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

.right-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.history-toggle-btn {
  display: none;
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
  gap: 6px;
  transition: all 0.2s;
  position: relative;
  overflow: visible;
}
.send-btn:hover:not(:disabled) {
  background: var(--primary);
}
.send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.send-btn.has-cost {
  width: auto;
  padding: 0 10px;
  justify-content: center;
}

.send-cost-inline {
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.2px;
  line-height: 1;
}

.input-generate-cost {
  width: auto;
  margin: 0;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 11px;
  opacity: 0.95;
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
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 10000;
  animation: fadeIn 0.3s;
}

@media (max-width: 1280px) {
  .input-toolbar .toggle-text {
    display: none;
  }

  .input-toolbar .tool-text {
    display: none;
  }

  .upload-btn {
    padding: 0 10px;
  }

  .history-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-overlay {
    display: block;
    top: 0;
    height: 100vh;
  }

  .side {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: min(320px, 86vw);
    transform: translateX(-100%);
    background: #0a0a0a;
    border-right: 1px solid var(--border-color);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.5);
    z-index: 10001;
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .side.mobile-open {
    transform: translateX(0);
  }

  .side-fade-enter-from {
    opacity: 0;
    transform: translateX(-100%);
  }

  .side-fade-leave-from {
    opacity: 1;
    transform: translateX(0);
  }

  .side-fade-leave-to {
    opacity: 0;
    transform: translateX(-100%);
  }
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: flex;
  }

  .form-group {
    grid-template-columns: 1fr;
  }

  .mobile-overlay {
    display: block;
    top: 0;
    height: 100vh;
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

  .model-dropdown {
    grid-template-columns: 1fr;
    min-width: min(320px, 86vw);
  }

  .upload-btn .tool-text {
    display: none;
  }

  .upload-btn {
    padding: 0 10px;
  }

  .side {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: min(320px, 86vw);
    transform: translateX(-100%);
    background: #0a0a0a;
    border-right: 1px solid var(--border-color);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.5);
    z-index: 10000;
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

.generate-cost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: fit-content;
  margin: 0 auto 10px auto;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  background: rgba(139, 92, 246, 0.85);
  color: rgba(255, 255, 255, 0.95);
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.2px;
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.55);
}

.dt-generate-cost {
  width: auto;
  margin: 0 0 10px 0;
  display: inline-flex;
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
  display: none;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
  border: 1px solid var(--border-color);
  padding: 8px 14px;
  border-radius: 4px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nth-login-btn {
  height: 38px;
  padding: 0 14px;
  font-size: 13px;
  border-radius: 999px;
}

.credits-btn {
  border: 1px solid rgba(204, 255, 0, 0.25);
  background: rgba(204, 255, 0, 0.08);
  color: var(--text-main);
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
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
  font-weight: 800;
}

.credits-container {
  position: relative;
  display: inline-flex;
}

.credits-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 280px;
  border-radius: 14px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  z-index: 60;
}

.credits-pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: rgba(241, 245, 249, 0.86);
  font-size: 12px;
}

.credits-pop-title {
  font-weight: 800;
}

.credits-pop-total {
  color: rgba(148, 163, 184, 0.95);
}

.credits-pop-balance {
  margin-top: 10px;
  border-radius: 12px;
  padding: 12px 12px;
  background: rgba(204, 255, 0, 0.08);
  border: 1px solid rgba(204, 255, 0, 0.18);
  display: flex;
  align-items: center;
  gap: 10px;
}

.credits-pop-icon {
  line-height: 1;
}

.credits-pop-value {
  color: rgba(241, 245, 249, 0.95);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.3px;
}

.credits-pop-actions {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.credits-pop-btn {
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(241, 245, 249, 0.92);
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.credits-pop-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.credits-pop-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credits-pop-btn.primary {
  border-color: rgba(204, 255, 0, 0.28);
  background: rgba(204, 255, 0, 0.1);
  color: rgba(241, 245, 249, 0.95);
}

.credits-pop-btn.primary:hover {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(204, 255, 0, 0.14);
}

.user-menu {
  position: relative;
}

.avatar-btn {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(204, 255, 0, 0.28);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
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

@media (max-width: 1280px) {
  .right-side {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: min(320px, 86vw);
    transform: translateX(100%);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
    background: #0a0a0a;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
    z-index: 10001;
  }

  .right-side.mobile-open {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }
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

.guide-card {
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  transition:
    transform 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    background 0.22s ease;
  animation: guideFadeIn 0.35s ease-out both;
}

.guide-card:hover {
  transform: translateY(-2px);
  border-color: rgba(204, 255, 0, 0.35);
  background: rgba(204, 255, 0, 0.05);
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(204, 255, 0, 0.08);
}

.guide-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 8px;
  font-family: var(--common-font);
  letter-spacing: -0.2px;
}

.guide-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 10px;
  font-family: var(--common-font);
}

.guide-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.guide-chip {
  font-size: 11px;
  color: #ccff00;
  border: 1px solid rgba(204, 255, 0, 0.25);
  background: rgba(204, 255, 0, 0.08);
  padding: 5px 8px;
  border-radius: 999px;
  font-family: var(--common-font);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.guide-chip:hover {
  transform: translateY(-1px);
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(204, 255, 0, 0.12);
  box-shadow:
    0 0 0 1px rgba(204, 255, 0, 0.06),
    0 12px 24px rgba(0, 0, 0, 0.35);
}

.guide-faq {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.16);
  border-radius: 10px;
  padding: 10px 10px;
  margin-top: 10px;
  transition:
    transform 0.22s ease,
    border-color 0.22s ease,
    background 0.22s ease,
    box-shadow 0.22s ease;
  animation: guideFadeIn 0.35s ease-out both;
}

.guide-faq:hover {
  transform: translateY(-1px);
  border-color: rgba(204, 255, 0, 0.25);
  background: rgba(204, 255, 0, 0.04);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

.guide-faq[open] {
  border-color: rgba(204, 255, 0, 0.4);
  background: rgba(204, 255, 0, 0.05);
  box-shadow:
    0 0 0 1px rgba(204, 255, 0, 0.08),
    0 16px 38px rgba(0, 0, 0, 0.4);
}

.guide-q {
  cursor: pointer;
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 800;
  list-style: none;
  font-family: var(--common-font);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  user-select: none;
}

.guide-q::after {
  content: '+';
  color: rgba(148, 163, 184, 0.95);
  font-weight: 900;
  transform-origin: center;
  transition:
    transform 0.22s ease,
    color 0.22s ease;
  flex: 0 0 auto;
}

.guide-faq[open] .guide-q {
  color: rgba(204, 255, 0, 0.95);
  text-shadow: 0 0 14px rgba(204, 255, 0, 0.18);
}

.guide-faq[open] .guide-q::after {
  transform: rotate(45deg);
  color: rgba(204, 255, 0, 0.95);
}

.guide-faq summary::-webkit-details-marker {
  display: none;
}

.guide-a {
  margin-top: 10px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.7;
  font-family: var(--common-font);
}

@keyframes guideFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

.dt-generate-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
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

.download-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.download-dialog {
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 90%;
  max-width: 360px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.download-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.download-header h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}
.close-btn {
  background: transparent;
  border: none;
  color: #999;
  font-size: 24px;
  padding: 0;
  line-height: 1;
}

.download-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.download-option-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #fff;
  transition: all 0.2s;
}
.download-option-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(204, 255, 0, 0.5);
}

.res-label {
  font-size: 14px;
  font-weight: 500;
}
.res-tag {
  font-size: 11px;
  background: rgba(204, 255, 0, 0.15);
  color: #ccff00;
  padding: 2px 6px;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .download-dialog-overlay {
    align-items: flex-end;
  }
  .download-dialog {
    width: 100%;
    max-width: 100%;
    border-radius: 20px 20px 0 0;
    margin-bottom: 0;
    padding-bottom: 40px;
    animation: slideUpMobile 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideUpMobile {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
