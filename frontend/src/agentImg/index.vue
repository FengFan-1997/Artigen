<template>
  <div class="artigen-page">
    <div class="tool-container">
      <TitleBar hideAuth hideLangOnMobile>
        <template #actions>
          <div class="top-actions">
            <CreditsUserActions
              :is-authed="isAuthed"
              :avatar-text="avatarText"
              :credits-text="creditsText"
              :total-credits-text="totalCreditsText"
              :credits-loading="creditsLoading"
              :on-refresh-credits="refreshCredits"
              :on-go-market="goMarket"
              :on-open-account-popup="openAccountPopup"
              :on-login-click="onLoginClick"
            >
              <router-link to="/artigen" class="top-action-link">{{ ui.homeLink }}</router-link>
            </CreditsUserActions>
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

        <div class="model-menu-overlay" v-if="modelMenuOpen" @click="modelMenuOpen = false"></div>

        <!-- LEFT: Product Configuration -->
        <transition name="side-fade">
          <ProductSidebar
            v-show="productSidebarOpen"
            :ui="ui"
            :is-open="productSidebarOpen"
            :loading="loading"
            :can-primary="canPrimary"
            :primary-text="primaryTextWithCost"
            :categories="categories"
            @primary="onPrimary"
          />
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
                  <span v-if="selectedOptionId === opt.id" class="dt-check-icon">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ccff00"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </span>
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
                  class="control control-textarea text1"
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
                        : primaryText
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

              <!-- Error State -->
              <div v-if="error" class="msg msg-ai">
                <div class="msg-avatar">
                  <img src="/logo.png" alt="System" />
                </div>
                <div class="msg-bubble error-bubble">
                  <div class="error-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
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
                        :src="resolveRefUrl(u)"
                        crossorigin="anonymous"
                        alt="ref"
                        @click.stop="openImagePreview(u)"
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
                    <div class="error-icon">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    </div>
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
                        :src="resolveRefUrl(item.image)"
                        alt="generated"
                        class="msg-media-img"
                        crossorigin="anonymous"
                        @click.stop="openImagePreview(item.image)"
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
                          @click.stop="editMsgImage(item.image)"
                        >
                          {{ ui.edit }}
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
                  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
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
                  <div class="error-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
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
                  <button class="mini-remove-btn" :disabled="loading" @click="clearPreview(idx)">
                    ×
                  </button>
                </div>
              </div>

              <textarea
                ref="chatInputRef"
                v-model="userInput"
                class="textarea"
                :class="{ 'drag-over': chatInputDragOver }"
                :placeholder="ui.inputPlaceholder"
                :disabled="loading"
                maxlength="500"
                @dragover="onChatInputDragOver"
                @dragleave="onChatInputDragLeave"
                @drop="onChatInputDrop"
              ></textarea>
              <div v-if="chatInputDragOver" class="drop-hint">{{ ui.dropHint }}</div>

              <div class="input-toolbar">
                <div class="left-tools">
                  <button class="tool-btn upload-btn" @click="triggerUpload" :disabled="loading">
                    <span class="tool-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </span>
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
                      <span class="toggle-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                        </svg>
                      </span>
                      <span class="toggle-text">{{ currentModelLabel }}</span>
                    </button>
                    <div
                      v-if="modelMenuOpen"
                      class="model-menu-overlay"
                      @click.stop="modelMenuOpen = false"
                    ></div>
                    <div v-if="modelMenuOpen" class="model-dropdown" @mousedown.stop @click.stop>
                      <button
                        v-for="m in modelOptions"
                        :key="m.id || 'auto'"
                        class="model-item"
                        type="button"
                        :class="{
                          active: m.id === selectedModelId,
                          locked: m.requiresPro && !isProPlus
                        }"
                        @click="selectModel(m, showTopTip)"
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
                    <span class="toggle-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polygon
                          points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                        ></polygon>
                      </svg>
                    </span>
                    <span class="toggle-text">{{ ui.deepThinkToggle }}</span>
                  </label>

                  <button
                    class="toggle-btn"
                    type="button"
                    :class="{ active: productSidebarOpen }"
                    @click="toggleProductSidebar"
                    :disabled="loading"
                  >
                    <span class="toggle-icon">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        width="16"
                        height="16"
                      >
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                      </svg>
                    </span>
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
                    <span class="toggle-icon">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        width="16"
                        height="16"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                    </span>
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
                    <span v-if="loading || isStyleSelecting">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="none"
                      >
                        <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
                      </svg>
                    </span>
                    <template v-else>
                      <span class="send-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <line x1="12" y1="19" x2="12" y2="5"></line>
                          <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                      </span>
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

        <aside
          v-show="historySidebarOpen"
          class="right-side"
          :class="{ 'mobile-open': historySidebarOpen }"
        >
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
              @click="onHistoryItemClick(item.id, closeHistorySidebar)"
            >
              <div v-if="item.image" class="history-image-placeholder">
                <img
                  :src="resolveRefUrl(item.image)"
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
              <details
                v-for="f in ui.guideFaqs"
                :key="f.q"
                class="guide-faq"
                :open="
                  f.q ===
                  (currentLang === 'zh' ? '深度思考有什么用？' : 'What does Deep Thinking do?')
                "
              >
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
          <CloseButton @click="showDownloadDialog = false" />
        </div>
        <div class="download-options">
          <button
            class="download-option-btn"
            @click="handleDownloadOption('1024', downloadTargetUrl, isProPlus)"
          >
            <span class="res-label">1024 x 1024</span>
            <span class="res-tag">HD</span>
          </button>
          <button
            class="download-option-btn"
            @click="handleDownloadOption('2k', downloadTargetUrl, isProPlus)"
          >
            <span class="res-label">2048 x 2048</span>
            <span class="res-tag">2K</span>
          </button>
          <button
            class="download-option-btn"
            @click="handleDownloadOption('4k', downloadTargetUrl, isProPlus)"
          >
            <span class="res-label">4096 x 4096</span>
            <span class="res-tag">4K</span>
          </button>
          <button class="download-option-btn" @click="editMsgImage(downloadTargetUrl)">
            <span class="res-label">{{ ui.edit }}</span>
            <span class="res-tag">{{ ui.edit }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="imagePreviewOpen" class="img-preview-overlay" @click="closeImagePreview">
      <div class="img-preview-dialog" @click.stop>
        <div class="img-preview-header">
          <div class="img-preview-title">{{ ui.imageLabel }}</div>
          <CloseButton @click="closeImagePreview" />
        </div>
        <div class="img-preview-body">
          <img :src="imagePreviewResolvedUrl" alt="Preview" class="img-preview-img" />
        </div>
        <div class="img-preview-actions">
          <button
            class="img-preview-btn"
            type="button"
            @click="downloadMsgImage(imagePreviewRawUrl)"
          >
            {{ ui.download }}
          </button>
          <button class="img-preview-btn" type="button" @click="editMsgImage(imagePreviewRawUrl)">
            {{ ui.edit }}
          </button>
          <button
            class="img-preview-btn secondary"
            type="button"
            @click="referenceMsgImage(imagePreviewRawUrl)"
          >
            {{ ui.reference }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { useRouter } from 'vue-router';
import { useAgentImgFlow } from './composables/useAgentImgFlow';
import { useAgentImgSettings } from './composables/useAgentImgSettings';
import TitleBar from './components/TitleBar.vue';
import CreditsUserActions from './components/CreditsUserActions.vue';
import ProductSidebar from './components/ProductSidebar.vue';
import CloseButton from './components/CloseButton.vue';
import type { GenerateImageInput } from './services/text';

// New Composables
import { useAgentImgAuth } from './composables/useAgentImgAuth';
import { useAgentImgCredits } from './composables/useAgentImgCredits';
import { useAgentImgHistory } from './composables/useAgentImgHistory';
import { useAgentImgLocale } from './composables/useAgentImgLocale';
import { useAgentImgModels } from './composables/useAgentImgModels';
import { useAgentImgUI } from './composables/useAgentImgUI';
import { useAgentImgUpload } from './composables/useAgentImgUpload';
import { useAgentImgGeneration } from './composables/useAgentImgGeneration';
import { buildApiUrl, getApiBaseUrl } from '@/utils/api';

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const router = useRouter();

// --- 1. Locale ---
const { ui, categories } = useAgentImgLocale();

// --- 2. Auth ---
const {
  authUserId,
  authToken,
  isAuthed,
  ensureAuthed,
  onLoginClick,
  avatarText,
  openAccountPopup,
  syncAuth
} = useAgentImgAuth();

// --- 3. Credits ---
const {
  creditsBalance,
  creditsLoading,
  creditsCosts,
  refreshCredits,
  refreshCosts,
  creditsText,
  totalCreditsText,
  goMarket
} = useAgentImgCredits(isAuthed);

// --- 4. UI State ---
const {
  topTipText,
  topTipOpen,
  showTopTip,
  productSidebarOpen,
  historySidebarOpen,
  isMobileViewport,
  closeMobileOverlays,
  toggleProductSidebar,
  toggleHistorySidebar,
  showDownloadDialog,
  downloadTargetUrl,
  showDownload,
  handleDownloadOption
} = useAgentImgUI();

const closeHistorySidebar = () => {
  if (isMobileViewport()) historySidebarOpen.value = false;
};

// --- 5. Models ---
const {
  selectedModelId,
  modelMenuOpen,
  userTier,
  isProPlus,
  refreshUserTier,
  modelOptions,
  currentModelLabel,
  currentModelTip,
  toggleModelMenu,
  selectModel
} = useAgentImgModels(ensureAuthed, ui);

// --- 6. Upload / Previews ---
const chatInputRef = ref<HTMLTextAreaElement | null>(null);
const userInputMemory = ref<string[]>([]);

// Proxy for deepMode to break circular dependency
const deepModeProxy = ref(false);

const {
  previewUrls,
  previewFiles,
  fileInputs,
  hasPreviews,
  triggerUpload,
  onPreviewChange,
  clearPreview,
  setPreviewFileAt,
  setPreviewUrlAt,
  fileToGenerateInput,
  fileToThumbDataUrl,
  cleanup: cleanupPreviews
} = useAgentImgUpload(
  deepModeProxy,
  () => cancel(),
  () => abortImg2Img(),
  () => reset()
);

// --- Settings ---
const { logoFile, buildProductProfileContextText } = useAgentImgSettings();

// --- Flow ---
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
  getUserInputMemory: () => userInputMemory.value,
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

// Sync deepMode
watch(deepMode, (v) => {
  if (deepModeProxy.value !== v) deepModeProxy.value = v;
});
watch(deepModeProxy, (v) => {
  if (deepMode.value !== v) deepMode.value = v;
});

// --- 7. History ---
const chatScrollEl = ref<HTMLElement | null>(null);
const scrollChatToBottom = () => {
  const el = chatScrollEl.value;
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
};

const {
  history,
  loadHistoryFromStorage,
  loadHistoryFromServer,
  historyForSidebar,
  onHistoryItemClick,
  setCancelNoticeForHistory
} = useAgentImgHistory(authUserId, authToken, isAuthed, syncAuth, scrollChatToBottom);

// --- 8. Generation ---
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

const {
  pendingUserText,
  lastUserText,
  pendingNotice,
  doPrimary,
  onStopProcessing,
  onExitStyleSelection,
  abortImg2Img
} = useAgentImgGeneration({
  auth: { ensureAuthed },
  credits: { refreshCredits, creditsBalance },
  models: { selectedModelId },
  memory: { userInputMemory },
  upload: {
    previewFiles,
    logoFile,
    fileToGenerateInput,
    fileToThumbDataUrl
  },
  history: {
    history,
    setCancelNoticeForHistory
  },
  flow: {
    userInput,
    deepMode,
    options,
    selectedOptionId,
    selectedOptionTitle,
    selectedOptionSummary,
    selectedOptionStyleTags,
    analyzeDirections,
    cancel
  },
  settings: {
    buildProductProfileContextText
  },
  ui: {
    error,
    loading,
    scrollChatToBottom,
    showTopTip
  }
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

const chatInputDragOver = ref(false);

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
  if (!keepDeep) deepMode.value = false;
  cancel();
  abortImg2Img();
  if (!keepDeep) reset();
};

watch(
  () => [history.value.length, loading.value, pendingUserText.value],
  () => scrollChatToBottom()
);

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

const sendCostValue = computed(() => {
  const costs = creditsCosts.value;
  const fallback = 10;
  const img2imgCost = Math.max(0, Number(costs?.img2img ?? fallback) || 0);
  if (deepMode.value) return 15;
  return img2imgCost;
});

const generateHoverTip = computed(() => {
  if (loading.value) return '';
  return String(ui.value.costTip || '').replace('{n}', String(sendCostValue.value));
});

const showGenerateCost = computed(() => {
  if (deepMode.value) return options.value.length > 0;
  return true;
});

const sendCostText = computed(() => `⚡${sendCostValue.value}`);

const showSendCostInline = computed(
  () => !loading.value && !isStyleSelecting.value && (!deepMode.value || options.value.length === 0)
);

const onPrimary = doPrimary;

const downloadMsgImage = (url: string) => showDownload(resolveRefUrl(url));

const IMAGE_EDITOR_PREFILL_KEY = 'imageEditor:prefill_v1';

const writeEditorPrefill = (value: string) => {
  const v = String(value || '').trim();
  if (!v) return;
  try {
    window.localStorage.setItem(
      IMAGE_EDITOR_PREFILL_KEY,
      JSON.stringify({ value: v, ts: Date.now() })
    );
  } catch {}
};

const editMsgImage = (url: string) => {
  const s = String(url || '').trim();
  if (!s) return;
  const resolved = resolveRefUrl(s);
  const isData = s.startsWith('data:');
  const isAbsolutePath = s.startsWith('/');
  const isHttp = /^https?:\/\//i.test(s);
  const stored = isData || isAbsolutePath || isHttp ? s : resolved || s;
  writeEditorPrefill(stored);
  const useQuery = !isData && !resolved.includes('token=') && stored.length < 1800;
  const query = useQuery ? { img: stored } : { prefill: '1' };
  showDownloadDialog.value = false;
  imagePreviewOpen.value = false;
  router.push({ path: '/artigen/image-editor', query });
};

const imagePreviewOpen = ref(false);
const imagePreviewRawUrl = ref('');
const imagePreviewResolvedUrl = computed(() => resolveRefUrl(imagePreviewRawUrl.value));

const openImagePreview = (url: string) => {
  const s = String(url || '').trim();
  if (!s) return;
  imagePreviewRawUrl.value = s;
  imagePreviewOpen.value = true;
};

const closeImagePreview = () => {
  imagePreviewOpen.value = false;
  imagePreviewRawUrl.value = '';
};

// Prefill logic
type AgentImgPrefillItem = { kind: 'data' | 'url'; value: string };
const AGENT_IMG_PREFILL_KEY = 'agentImg:prefillRef_v1';

const consumeAgentImgPrefill = (): AgentImgPrefillItem[] => {
  try {
    const raw = window.localStorage.getItem(AGENT_IMG_PREFILL_KEY);
    if (!raw) return [];
    window.localStorage.removeItem(AGENT_IMG_PREFILL_KEY);
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    return list
      .map((it: any) => ({
        kind: it?.kind === 'data' ? 'data' : it?.kind === 'url' ? 'url' : '',
        value: String(it?.value || '').trim()
      }))
      .filter((x: any) => x.kind && x.value)
      .slice(0, previewUrls.value.length);
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

const dataUrlToFile = (dataUrl: string): File | null => {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) return null;
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = String(m[1] || '').trim() || 'image/png';
  const b64 = String(m[2] || '');
  try {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    const ext = extFromMime(mime);
    return new File([bytes], `reference_${Date.now().toString(36)}.${ext}`, { type: mime });
  } catch {
    return null;
  }
};

const imageElToFile = (img: HTMLImageElement, maxEdge = 1024): Promise<File | null> => {
  return new Promise((resolve) => {
    try {
      if (!img.complete || !img.naturalWidth || !img.naturalHeight) return resolve(null);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const limit = Math.max(1, Number(maxEdge) || 1);
      const scale = Math.min(1, limit / Math.max(w || 1, h || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } catch {
        return resolve(null);
      }
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          const ext = extFromMime(blob.type);
          resolve(
            new File([blob], `reference_${Date.now().toString(36)}.${ext}`, { type: blob.type })
          );
        },
        'image/png',
        0.92
      );
    } catch {
      resolve(null);
    }
  });
};

const resolveRefUrl = (raw: string) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('data:')) return u;
  const base = getApiBaseUrl();
  const built = (() => {
    if (u.startsWith('/')) {
      if (u.startsWith('/files/')) {
        if (!base) return u;
        if (base.endsWith('/api')) return `${base.slice(0, -4)}${u}`;
        return `${base}${u}`;
      }
      return buildApiUrl(u);
    }
    return u;
  })();
  const token = String(authToken.value || '').trim();
  if (!token) return built;
  try {
    const url = new URL(built, window.location.origin);
    if (!url.pathname.startsWith('/files/')) return built;
    if (!url.searchParams.get('token')) url.searchParams.set('token', token);
    return url.toString();
  } catch {
    if (!built.includes('/files/')) return built;
    const join = built.includes('?') ? '&' : '?';
    if (built.includes('token=')) return built;
    return `${built}${join}token=${encodeURIComponent(token)}`;
  }
};

const prefillItemToFile = async (it: AgentImgPrefillItem): Promise<File | null> => {
  const v = String(it?.value || '').trim();
  if (!v) return null;
  const direct = dataUrlToFile(v);
  if (direct) return direct;
  const tryFetchToBlob = async (
    url: string,
    opts?: { headers?: Record<string, string> }
  ): Promise<Blob | null> => {
    try {
      const res = await fetch(url, opts);
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
  try {
    const resolved = resolveRefUrl(v);
    let blob = await tryFetchToBlob(resolved || v);
    if (!blob && resolved && resolved !== v) blob = await tryFetchToBlob(v);
    if (!blob) {
      const token = String(authToken.value || '').trim();
      if (token && (resolved || v).includes('/files/')) {
        blob = await tryFetchToBlob(resolved || v, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    }
    if (!blob && /^https?:\/\//i.test(v)) {
      const proxyUrl = buildApiUrl(`/api/proxy/image?url=${encodeURIComponent(v)}`);
      blob = await tryFetchToBlob(proxyUrl);
    }
    if (!blob) return null;
    const ext = extFromMime(blob.type);
    return new File([blob], `reference_${Date.now().toString(36)}.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
};

const referenceMsgImage = async (url: string) => {
  const s = String(url || '').trim();
  if (!s) return;
  const resolved = resolveRefUrl(s);
  const keepDeep = isStyleSelecting.value;
  const emptySlots = previewUrls.value.map((u, i) => (!u ? i : -1)).filter((i) => i >= 0);
  const idx = emptySlots.length ? (emptySlots[0] as number) : 0;
  let f = dataUrlToFile(s);
  let seededUrl = '';
  if (!f) {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.msg-media-img'));
    const match = imgs.find(
      (img) =>
        img.currentSrc === s ||
        img.src === s ||
        (resolved && (img.currentSrc === resolved || img.src === resolved))
    );
    if (match) {
      seededUrl = String(match.currentSrc || match.src || '').trim();
      if (seededUrl) setPreviewUrlAt(idx, seededUrl);
      f = await imageElToFile(match, 1024);
    }
  }
  if (!f) f = await prefillItemToFile({ kind: 'url', value: s });
  if (!f) {
    if (seededUrl) setPreviewUrlAt(idx, '');
    showTopTip(
      currentLang.value === 'zh'
        ? '图片无法引用（可能存在跨域限制）'
        : 'Cannot reference image (CORS blocked)'
    );
    return;
  }
  setPreviewFileAt(idx, f);
  // Manual trigger of side effects if setPreviewFileAt2 doesn't do it
  if (!keepDeep) deepMode.value = false;
  cancel();
  abortImg2Img();
  if (!keepDeep) reset();

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
  // Manual trigger side effects
  if (!keepDeep) deepMode.value = false;
  cancel();
  abortImg2Img();
  if (!keepDeep) reset();

  try {
    chatInputRef.value?.focus();
  } catch {}
};

const handleAuthChanged = () => {
  syncAuth();
  // authTick.value++; // authTick is inside useAgentImgAuth, not reactive from here?
  // Wait, useAgentImgAuth returned authTick ref.
  // But we need to make sure syncing updates it.
  // Actually syncAuth inside useAgentImgAuth updates the refs.
  if (isAuthed.value) {
    void loadHistoryFromServer().then((ok) => {
      if (!ok) loadHistoryFromStorage();
    });
  } else loadHistoryFromStorage();
  if (isAuthed.value) void refreshCredits();
  else creditsBalance.value = null;
  if (isAuthed.value) void refreshUserTier();
  else userTier.value = '';
};

let wideSidebarMql: MediaQueryList | null = null;
const onWideSidebarChange = (e: MediaQueryListEvent) => {
  if (e.matches) productSidebarOpen.value = true;
};

const onGlobalPointerDown = (e: PointerEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

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
  // if (historyPersistTimer) ... handled in useAgentImgHistory
  try {
    wideSidebarMql?.removeEventListener('change', onWideSidebarChange);
  } catch {}
  wideSidebarMql = null;
  window.removeEventListener('app-auth-changed', handleAuthChanged as EventListener);
  document.removeEventListener('pointerdown', onGlobalPointerDown, true);
  cleanupPreviews();
});
</script>

<style>
@import './styles/main.css';

.text1 {
  height: 200px !important;
}
</style>
