<template>
  <div class="image-workshop-page">
    <TitleBar />

    <main class="main-content">
      <div class="page-header">
        <div class="badge-row">
          <span class="badge-dot"></span>
          <span class="badge-text">{{ ui.status }}</span>
        </div>

        <div class="title-stack">
          <h1 class="page-title">
            <span class="title-text-group">
              {{ ui.titleMain }} <span class="highlight">{{ ui.titleHighlight }}</span>
            </span>
            <span class="real-beta-badge">Beta</span>
          </h1>
          <div class="mode-separation-note">{{ ui.beta }}</div>
          <p class="page-desc">{{ ui.desc }}</p>
        </div>
      </div>

      <div class="tools-grid">
        <ToolCard
          tool-id="TOOL_01"
          badge="NEW"
          icon=""
          :title="ui.toolIdTitle"
          :desc="ui.toolIdDesc"
          :launch="ui.launch"
          @click="openIdPhotoPopup"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="12" cy="10" r="3"></circle>
              <path d="M7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"></path>
            </svg>
          </template>
        </ToolCard>

        <ToolCard
          tool-id="TOOL_02"
          badge="HOT"
          badge-tone="hot"
          icon=""
          :title="ui.toolOldTitle"
          :desc="ui.toolOldDesc"
          :launch="ui.launch"
          @click="openOldPhotoPopup"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
              <path d="M22 12h-2"></path>
              <path d="M2 12h2"></path>
            </svg>
          </template>
        </ToolCard>

        <ToolCard
          tool-id="TOOL_03"
          :badge="currentLang === 'en' ? 'LOCAL FREE / AI PAID' : '本地免费 / AI 付费'"
          icon=""
          :title="ui.toolIngredientTitle"
          :desc="ui.toolIngredientDesc"
          :launch="ui.launch"
          @click="openIngredientList"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </template>
        </ToolCard>

        <ToolCard
          tool-id="TOOL_04"
          badge="NEW"
          icon=""
          :title="ui.toolBgTitle"
          :desc="ui.toolBgDesc"
          :launch="ui.launch"
          @click="openAiBackgroundPopup"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
              <path d="M12 21a9 9 0 0 0 9-9"></path>
            </svg>
          </template>
        </ToolCard>

        <ToolCard
          tool-id="TOOL_05"
          badge="NEW"
          icon=""
          :title="ui.toolEditorTitle"
          :desc="ui.toolEditorDesc"
          :launch="ui.launch"
          @click="openImageEditor"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </template>
        </ToolCard>
      </div>

      <div class="info-section">
        <div class="info-container">
          <h2 class="info-title">{{ ui.contentTitle }}</h2>
          <p class="info-desc">{{ ui.contentDesc }}</p>

          <div class="info-grid">
            <div class="info-card">
              <div class="info-card-title">> {{ ui.useCasesTitle }}</div>
              <ul class="info-list">
                <li v-for="(item, idx) in ui.useCases" :key="idx" class="info-list-item">
                  <span class="info-list-icon"
                    ><svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      width="14"
                      height="14"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline></svg
                  ></span>
                  {{ item }}
                </li>
              </ul>
            </div>

            <div class="info-card">
              <div class="info-card-title">> {{ ui.longTailTitle }}</div>
              <div class="info-chips">
                <span v-for="(chip, idx) in ui.longTailKeywords" :key="idx" class="info-chip">
                  {{ chip }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="faq-section faq-mobile-pad">
        <div class="faq-left">
          <div class="faq-title-large">{{ ui.faqTitle }}</div>
          <div class="faq-subtitle">{{ ui.faqSubtitle }}</div>
        </div>
        <div class="faq-list">
          <details v-for="f in ui.faqs" :key="f.q" class="faq-item">
            <summary class="faq-q">
              <span class="q-text">{{ f.q }}</span>
              <span class="q-icon"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line></svg
              ></span>
            </summary>
            <div class="faq-a-wrapper">
              <div class="faq-a">{{ f.a }}</div>
            </div>
          </details>
        </div>
      </div>
    </main>

    <GlobalFooter />

    <transition name="fade">
      <div v-if="resultVisible" class="result-overlay" @click.self="closeResult">
        <section
          ref="resultDialogRef"
          class="result-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workshop-result-title"
          tabindex="-1"
          @keydown="onResultDialogKeydown"
        >
          <div class="result-header">
            <h2 id="workshop-result-title" class="result-title">{{ resultTitle }}</h2>
            <CloseButton @click="closeResult" />
          </div>
          <div v-if="resultError" class="result-error" role="alert">{{ resultError }}</div>
          <div v-else class="result-body">
            <div v-if="resultLoading" class="result-loading" role="status" aria-live="polite">
              <div class="loading-spinner" aria-hidden="true"></div>
              <div class="loading-text">{{ ui.loading }}</div>
              <button class="result-btn secondary cancel-request" type="button" @click="cancelActiveRequest">
                {{ ui.cancel }}
              </button>
            </div>
            <div v-if="resultUrl" class="result-image-wrap">
              <div v-if="resultImageBroken" class="result-image-missing">
                <div class="result-image-missing-title">{{ ui.imageMissing }}</div>
                <div class="result-image-missing-sub">{{ ui.imageMissingSub }}</div>
              </div>
              <div v-else-if="resultSourceUrl" class="old-photo-comparison">
                <figure>
                  <img :src="resultSourceUrl" class="result-image" :alt="ui.before" />
                  <figcaption>{{ ui.before }}</figcaption>
                </figure>
                <figure>
                  <img :src="resultUrl" class="result-image" :alt="ui.after" @error="resultImageBroken = true" />
                  <figcaption>{{ ui.version }} {{ resultVersion }}</figcaption>
                </figure>
              </div>
              <img v-else :src="resultUrl" class="result-image" alt="Result" @error="resultImageBroken = true" />
            </div>
            <div class="result-actions">
              <button
                class="result-btn"
                type="button"
                @click="downloadResult"
                :disabled="!resultUrl || resultLoading || resultImageBroken"
              >
                {{ ui.download }}
              </button>
              <button class="result-btn secondary" type="button" @click="closeResult">
                {{ ui.close }}
              </button>
            </div>
          </div>
        </section>
      </div>
    </transition>

    <StandardIdPhotoPopup
      :visible="isStandardIdPhotoPopupOpen"
      @close="closeWorkshopPopup('id-photo')"
      @open-ai="openAiProfessionalPortrait"
    />

    <IdPhotoPopup
      :visible="isIdPhotoPopupOpen"
      :credits-cost="idPhotoQuote?.credits ?? 0"
      :quote-loading="idPhotoQuoteLoading"
      :quote-error="idPhotoQuoteError"
      @close="closeWorkshopPopup('id-photo')"
      @generate="handleGenerateIdPhoto"
    />

    <OldPhotoPopup
      :visible="isOldPhotoPopupOpen"
      :credits-cost="oldPhotoQuote?.credits ?? 0"
      :quote-loading="oldPhotoQuoteLoading"
      :quote-error="oldPhotoQuoteError"
      @close="closeWorkshopPopup('old-photo')"
      @restore="handleRestoreOldPhoto"
    />

    <AiBackgroundPopup
      :visible="isAiBackgroundPopupOpen"
      :credits-cost="backgroundQuote?.credits ?? 0"
      :quote-loading="backgroundQuoteLoading"
      :quote-error="backgroundQuoteError"
      @close="closeWorkshopPopup('background')"
      @generate="handleGenerateAiBackground"
    />

    <IngredientLabel
      :visible="isIngredientPopupOpen"
      @close="closeWorkshopPopup('ingredient-label')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import TitleBar from '../components/TitleBar.vue';
import GlobalFooter from '../components/GlobalFooter.vue';
import StandardIdPhotoPopup from '../components/StandardIdPhotoPopup.vue';
import IdPhotoPopup from '../components/IdPhotoPopup.vue';
import OldPhotoPopup from '../components/OldPhotoPopup.vue';
import AiBackgroundPopup from '../components/AiBackgroundPopup.vue';
import ToolCard from '../components/ToolCard.vue';
import CloseButton from '../components/CloseButton.vue';
import IngredientLabel from './IngredientLabel.vue';
import { trackPageView, trackEvent } from '../../utils/analytics';
import { setMeta } from '../../utils/seo';
import { downloadBlob } from '../logic/formatFactory/url';
import { useConsoleStore } from '@/stores/console';
import { getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import { resourceFetch } from '@/login/authFetch';
import { useLanguageStore } from '@/stores/language';
import {
  cancelToolTask,
  quoteToolTask,
  taskAssetUrl,
  type ToolTaskQuote
} from '../services/toolTasks';
import {
  cancelPersistedWorkshopTask,
  loadPendingWorkshopTask,
  resumePersistedWorkshopTask,
  startPersistedWorkshopTask
} from '../services/workshopTasks';

const isStandardIdPhotoPopupOpen = ref(false);
const isIdPhotoPopupOpen = ref(false);
const isOldPhotoPopupOpen = ref(false);
const isIngredientPopupOpen = ref(false);
const isAiBackgroundPopupOpen = ref(false);

const resultVisible = ref(false);
const resultTitle = ref('');
const resultUrl = ref('');
const resultError = ref('');
const resultLoading = ref(false);
const activeRequestId = ref('');
const resultImageBroken = ref(false);
const resultSourceUrl = ref('');
const resultVersion = ref(0);
const resultDialogRef = ref<HTMLElement | null>(null);
let resultReturnFocus: HTMLElement | null = null;
let activeRequestController: AbortController | null = null;
const activeToolTaskId = ref('');
const activeWorkshopSlot = ref('');
const oldPhotoQuote = ref<ToolTaskQuote | null>(null);
const oldPhotoQuoteLoading = ref(false);
const oldPhotoQuoteError = ref('');
let oldPhotoQuoteController: AbortController | null = null;
const idPhotoQuote = ref<ToolTaskQuote | null>(null);
const idPhotoQuoteLoading = ref(false);
const idPhotoQuoteError = ref('');
let idPhotoQuoteController: AbortController | null = null;
const backgroundQuote = ref<ToolTaskQuote | null>(null);
const backgroundQuoteLoading = ref(false);
const backgroundQuoteError = ref('');
let backgroundQuoteController: AbortController | null = null;

const router = useRouter();
const route = useRoute();
const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() => {
  const en = currentLang.value === 'en';
  return {
    status: en ? 'IMAGE WORKFLOWS' : '影像工作流',
    titleMain: en ? 'AI Image' : 'AI 影像',
    titleHighlight: en ? 'Workshop' : '工坊',
    beta: en ? 'Local and cloud modes are labeled separately' : '本地与云端模式明确分开',
    desc: en
      ? 'Create local standard ID photos or professional portraits, enhance old photos, replace backgrounds, lay out labels, or open Editor 2.0.'
      : '本地制作标准证件照或云端职业形象，也可增强老照片、替换背景、排版标签并进入编辑器 2.0。',
    toolIdTitle: en ? 'ID Photo & Professional Portrait' : '证件照与职业形象',
    toolIdDesc: en
      ? 'Free local standard ID photos or paid cloud AI professional portraits, clearly separated.'
      : '免费本地标准证件照与付费云端 AI 职业形象明确分开。',
    toolOldTitle: en ? 'AI Old Photo Enhancement' : 'AI 老照片增强',
    toolOldDesc: en
      ? 'Paid enhancement with optional inferred colorization; not a factual reconstruction.'
      : '付费清晰增强与可选推测性上色；不宣称历史事实复原。',
    toolIngredientTitle: en ? 'Ingredient Label Layout' : '配料标签排版助手',
    toolIngredientDesc: en
      ? 'Lay out only supplied text; no invented content or compliance conclusion.'
      : '只排版用户原文，不补全内容，也不提供合规结论。',
    toolBgTitle: en ? 'AI Background' : 'AI 背景',
    toolBgDesc: en
      ? 'Replace or add realistic backgrounds with local preview.'
      : '一键换背景/加场景，支持本地预览与主体可调',
    toolEditorTitle: en ? 'Image Editor 2.0' : '图片编辑器 2.0',
    toolEditorDesc: en
      ? 'Non-destructive layers, autosave, local Workers, and PNG/JPEG/WebP export.'
      : '非破坏图层、自动保存、本地 Worker 与 PNG/JPEG/WebP 导出。',
    launch: 'LAUNCH',
    resultTitle: en ? 'Result' : '生成结果',
    download: en ? 'Download' : '下载',
    close: en ? 'Close' : '关闭',
    loading: en ? 'Generating, please wait…' : '正在生成，请稍候…',
    cancel: en ? 'Cancel request' : '取消任务',
    cancelled: en ? 'Request cancelled. Reserved credits were released.' : '任务已取消，预占点数已释放。',
    cancelPending: en
      ? 'Cancellation is pending confirmation. Refreshing will safely resume and retry it.'
      : '取消仍待服务端确认；刷新后会安全恢复并继续确认。',
    cancelCompleted: en
      ? 'The task completed before cancellation. No refund was claimed.'
      : '任务已在取消前完成，本次不宣称退款。',
    before: en ? 'Before' : '增强前',
    after: en ? 'After' : '增强后',
    version: en ? 'Version' : '版本',
    fileReadFailed: en ? 'Failed to read image. Please try again.' : '图片读取失败，请重试',
    loginRequired: en ? 'Please sign in to use this feature.' : '请先登录后使用（当前免费）',
    imageMissing: en ? 'Image unavailable' : '图片已失效',
    imageMissingSub: en ? 'The original image could not be loaded.' : '原图暂时无法加载',

    contentTitle: en ? 'Usage Guide' : '使用专栏',
    contentDesc: en
      ? 'Each workflow states whether it stays local or uploads after confirmation.'
      : '每个工作流都会明确标注本地处理，或在确认后上传。',
    useCasesTitle: en ? 'Use Cases' : '使用场景',
    useCases: en
      ? [
          'Standard ID photo: free local sizing, background color and 6-inch print layout.',
          'Professional portrait: paid cloud generation with explicit confirmation.',
          'Restoration: denoise, enhance clarity, optional colorization.',
          'AI Background: replace/add scenes for product shots and portraits.',
          'Ingredient label: source-only organization and editable layout.',
          'E-commerce: quick assets for listings and packaging drafts.',
          'Personal: restore old photos and export higher quality copies.'
        ]
      : [
          '标准证件照：免费本地完成尺寸、背景色与 6 寸打印排版。',
          '职业形象：明确确认后进行付费云端生成。',
          '老照片增强：去噪、清晰增强、可选推测性上色。',
          'AI 背景：商品图/人物图一键换背景或补充场景。',
          '配料标签：只整理用户原文并排版，新增事实会被拒绝。',
          '电商/品牌：快速产出可用素材，用于商品页与包装打样。',
          '个人留存：修复旧照片并导出更高质量版本。'
        ],
    longTailTitle: en ? 'Popular Keywords' : '热门关键词',
    longTailKeywords: en
      ? [
          'ID photo background',
          '1-inch / 2-inch photo',
          'passport photo',
          'old photo colorize',
          'photo denoise',
          'ingredient label layout',
          'source-only ingredient organizer',
          'label image'
        ]
      : [
          '证件照换底',
          '一寸二寸',
          '护照签证照',
          '老照片上色',
          '照片去噪',
          '配料标签排版',
          '原文整理工具',
          '标签图生成'
        ],
    faqTitle: en ? 'FAQ' : '常见问题',
    faqSubtitle: en ? 'Modules, beta notes, and quality tips.' : '关于模块、Beta 与效果的说明',
    faqs: en
      ? [
          {
            q: 'What modules are included in Image Workshop?',
            a: 'Current workflows cover AI professional portraits, old-photo enhancement, local/AI backgrounds, source-only ingredient label layout, and Editor 2.0.'
          },
          {
            q: 'Is Image Workshop in beta?',
            a: 'Yes. We are iterating quickly and may adjust workflows or outputs based on feedback.'
          },
          {
            q: 'Will a failed generation charge credits?',
            a: 'No. If the request fails due to system reasons, credits are refunded automatically.'
          },
          {
            q: 'What ID photo specs are supported?',
            a: 'The local tool includes 295×413 1-inch, 413×579 2-inch and 390×567 passport presets, plus custom px or mm + DPI.'
          },
          {
            q: 'How do I choose denoise / colorize for old photos?',
            a: 'Enable denoise for grainy photos. Enable colorize if you want a colorized result; keep it off for a more faithful restoration.'
          },
          {
            q: 'Does the ingredient label assistant certify compliance?',
            a: 'No. It only arranges supplied text. It rejects newly introduced facts and provides no legal or regulatory conclusion.'
          },
          {
            q: 'Do you store my uploaded photos?',
            a: 'Standard ID photos stay on your device and are never uploaded. Paid AI workflows upload only after explicit confirmation.'
          }
        ]
      : [
          {
            q: '影像工坊目前有哪些模块？',
            a: '当前包含：AI 职业形象、老照片增强、本地/AI 换背景、只基于原文的配料标签排版，以及图片编辑器 2.0。'
          },
          {
            q: '影像工坊是 Beta 吗？',
            a: '是的。当前处于 Beta 阶段，我们会根据反馈持续优化流程与效果。'
          },
          {
            q: '生成失败会扣点吗？',
            a: '不会。若因系统原因生成失败，点数会自动退回。'
          },
          {
            q: '证件照支持哪些规格？',
            a: '本地工具包含一寸 295×413、二寸 413×579、护照 390×567，并支持自定义 px 或 mm + DPI。'
          },
          {
            q: '老照片去噪/上色怎么选？',
            a: '噪点明显建议开去噪；想要彩色效果再打开上色。追求“更还原”的修复可以只开去噪。'
          },
          {
            q: '配料标签助手能保证合规吗？',
            a: '不能。它只整理和排版用户提供的原文，新增事实会被拒绝，也不会给出法律或监管合规结论。'
          },
          {
            q: '上传的照片会被保存吗？',
            a: '标准证件照全程保留在当前设备且不会上传；付费 AI 工作流只会在明确确认后上传。'
          }
        ]
  };
});

onMounted(() => {
  consoleStore.init();
  consoleStore.recordTraffic({
    type: 'page_view',
    page: '/artigen/image-workshop',
    meta: { referrer: document.referrer }
  });
  trackPageView('/artigen/image-workshop');
  setMeta({
    title:
      currentLang.value === 'zh'
        ? 'Artigen 影像工坊 - 标准证件照/职业形象/老照片增强/换背景/图片编辑'
        : 'Artigen Image Workshop - ID Photo / Portrait / Enhancement / Background / Editor',
    description:
      currentLang.value === 'zh'
        ? 'Artigen 明确区分免费本地标准证件照与付费 AI 职业形象，并提供老照片增强、换背景与图片编辑。'
        : 'Artigen separates free local standard ID photos from paid AI professional portraits, with enhancement and editing tools.',
    keywords:
      currentLang.value === 'zh'
        ? '标准证件照,一寸照,二寸照,护照照片,AI职业形象,老照片增强,背景替换,图片编辑器'
        : 'standard ID photo,1-inch photo,2-inch photo,passport photo,AI professional portrait,image editor'
  });
  void resumePendingImageWorkshopTask();
});

const openIdPhotoPopup = () => {
  isIdPhotoPopupOpen.value = false;
  isStandardIdPhotoPopupOpen.value = true;
  if (route.params.toolId !== 'id-photo') router.push('/artigen/image-workshop/id-photo');
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'id_photo_mode_select'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'id_photo_mode_select');
};

const openAiProfessionalPortrait = () => {
  isStandardIdPhotoPopupOpen.value = false;
  isIdPhotoPopupOpen.value = true;
  void loadIdPhotoQuote();
  trackEvent('ImageWorkshop', 'select_mode', 'ai_professional_portrait');
};

const isAuthenticated = () => {
  const uid = String(getCurrentUserId() || '').trim();
  return Boolean(uid && !uid.startsWith('guest_') && isLocalLoggedIn());
};

const loadIdPhotoQuote = async () => {
  idPhotoQuoteController?.abort();
  const controller = new AbortController();
  idPhotoQuoteController = controller;
  idPhotoQuote.value = null;
  idPhotoQuoteError.value = '';
  if (!isAuthenticated()) {
    idPhotoQuoteLoading.value = false;
    idPhotoQuoteError.value = 'LOGIN_REQUIRED';
    return;
  }
  idPhotoQuoteLoading.value = true;
  try {
    idPhotoQuote.value = await quoteToolTask({
      toolId: 'id-photo',
      operation: 'professional-portrait'
    }, controller.signal);
  } catch (error: any) {
    if (!controller.signal.aborted) {
      idPhotoQuoteError.value = String(error?.code || error?.name || 'QUOTE_FAILED');
    }
  } finally {
    if (idPhotoQuoteController === controller) {
      idPhotoQuoteController = null;
      idPhotoQuoteLoading.value = false;
    }
  }
};

const loadBackgroundQuote = async () => {
  backgroundQuoteController?.abort();
  const controller = new AbortController();
  backgroundQuoteController = controller;
  backgroundQuote.value = null;
  backgroundQuoteError.value = '';
  if (!isAuthenticated()) {
    backgroundQuoteLoading.value = false;
    backgroundQuoteError.value = 'LOGIN_REQUIRED';
    return;
  }
  backgroundQuoteLoading.value = true;
  try {
    backgroundQuote.value = await quoteToolTask({
      toolId: 'background',
      operation: 'ai-scene'
    }, controller.signal);
  } catch (error: any) {
    if (!controller.signal.aborted) {
      backgroundQuoteError.value = String(error?.code || error?.name || 'QUOTE_FAILED');
    }
  } finally {
    if (backgroundQuoteController === controller) {
      backgroundQuoteController = null;
      backgroundQuoteLoading.value = false;
    }
  }
};

const loadOldPhotoQuote = async () => {
  oldPhotoQuoteController?.abort();
  const controller = new AbortController();
  oldPhotoQuoteController = controller;
  oldPhotoQuote.value = null;
  oldPhotoQuoteError.value = '';
  const uid = String(getCurrentUserId() || '').trim();
  if (!uid || uid.startsWith('guest_') || !isLocalLoggedIn()) {
    oldPhotoQuoteLoading.value = false;
    oldPhotoQuoteError.value = 'LOGIN_REQUIRED';
    return;
  }
  oldPhotoQuoteLoading.value = true;
  try {
    const quote = await quoteToolTask({ toolId: 'old-photo', operation: 'enhance' }, controller.signal);
    if (oldPhotoQuoteController !== controller || controller.signal.aborted) return;
    oldPhotoQuote.value = quote;
  } catch (error: any) {
    if (controller.signal.aborted) return;
    oldPhotoQuoteError.value = String(error?.code || error?.name || 'QUOTE_FAILED');
  } finally {
    if (oldPhotoQuoteController === controller) {
      oldPhotoQuoteController = null;
      oldPhotoQuoteLoading.value = false;
    }
  }
};

const openOldPhotoPopup = () => {
  isOldPhotoPopupOpen.value = true;
  void loadOldPhotoQuote();
  if (route.params.toolId !== 'old-photo') router.push('/artigen/image-workshop/old-photo');
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'old_photo'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'old_photo');
};

const openIngredientList = () => {
  isIngredientPopupOpen.value = true;
  if (route.params.toolId !== 'ingredient-label') {
    router.push('/artigen/image-workshop/ingredient-label');
  }
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'ingredient_list'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'ingredient_list');
};

const openAiBackgroundPopup = () => {
  isAiBackgroundPopupOpen.value = true;
  void loadBackgroundQuote();
  if (route.params.toolId !== 'background') router.push('/artigen/image-workshop/background');
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'ai_background'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'ai_background');
};

const openImageEditor = () => {
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/image-workshop',
    target: 'image_editor'
  });
  trackEvent('ImageWorkshop', 'open_tool', 'image_editor');
  router.push('/artigen/image-workshop/image-editor');
};

const closeWorkshopPopup = (toolId: string) => {
  if (toolId === 'id-photo') {
    isStandardIdPhotoPopupOpen.value = false;
    isIdPhotoPopupOpen.value = false;
    idPhotoQuoteController?.abort();
    idPhotoQuoteController = null;
    idPhotoQuoteLoading.value = false;
  }
  if (toolId === 'old-photo') {
    isOldPhotoPopupOpen.value = false;
    oldPhotoQuoteController?.abort();
    oldPhotoQuoteController = null;
    oldPhotoQuoteLoading.value = false;
  }
  if (toolId === 'ingredient-label') isIngredientPopupOpen.value = false;
  if (toolId === 'background') {
    isAiBackgroundPopupOpen.value = false;
    backgroundQuoteController?.abort();
    backgroundQuoteController = null;
    backgroundQuoteLoading.value = false;
  }
  if (String(route.params.toolId || '') === toolId) router.push('/artigen/image-workshop');
};

watch(
  () => String(route.params.toolId || ''),
  (toolId) => {
    if (toolId === 'id-photo' && !isIdPhotoPopupOpen.value) {
      isStandardIdPhotoPopupOpen.value = true;
    } else if (toolId !== 'id-photo') {
      isStandardIdPhotoPopupOpen.value = false;
      isIdPhotoPopupOpen.value = false;
      idPhotoQuoteController?.abort();
      idPhotoQuoteController = null;
      idPhotoQuoteLoading.value = false;
    }
    if (toolId === 'old-photo') {
      isOldPhotoPopupOpen.value = true;
      if (!oldPhotoQuote.value && !oldPhotoQuoteLoading.value) void loadOldPhotoQuote();
    } else {
      isOldPhotoPopupOpen.value = false;
      oldPhotoQuoteController?.abort();
      oldPhotoQuoteController = null;
      oldPhotoQuoteLoading.value = false;
    }
    if (toolId === 'ingredient-label') isIngredientPopupOpen.value = true;
    if (toolId === 'background') {
      isAiBackgroundPopupOpen.value = true;
      if (!backgroundQuote.value && !backgroundQuoteLoading.value) void loadBackgroundQuote();
    } else {
      isAiBackgroundPopupOpen.value = false;
      backgroundQuoteController?.abort();
      backgroundQuoteController = null;
      backgroundQuoteLoading.value = false;
    }
  },
  { immediate: true }
);

watch(resultVisible, async (visible) => {
  if (visible) {
    await nextTick();
    resultReturnFocus = globalThis.document.activeElement instanceof HTMLElement
      ? globalThis.document.activeElement
      : null;
    resultDialogRef.value?.focus();
    return;
  }
  await nextTick();
  if (resultReturnFocus?.isConnected) resultReturnFocus.focus();
  resultReturnFocus = null;
});

onBeforeUnmount(() => {
  oldPhotoQuoteController?.abort();
  oldPhotoQuoteController = null;
  idPhotoQuoteController?.abort();
  idPhotoQuoteController = null;
  backgroundQuoteController?.abort();
  backgroundQuoteController = null;
  activeRequestController?.abort();
  activeRequestController = null;
  if (resultSourceUrl.value.startsWith('blob:')) URL.revokeObjectURL(resultSourceUrl.value);
  resultSourceUrl.value = '';
});

const humanizeError = (code: string) => {
  const c = String(code || '').trim();
  const en = currentLang.value === 'en';
  if (!c) return en ? 'Request failed. Please try again later.' : '请求失败，请稍后再试';
  if (c === 'INSUFFICIENT_CREDITS')
    return en ? 'Insufficient credits. Please top up in the Market.' : '积分不足，请前往「点数商城」充值';
  if (c === 'LOGIN_REQUIRED') return en ? 'Please sign in first.' : '请先登录后再试';
  if (c === 'BROWSER_STORAGE_UNAVAILABLE') {
    return en
      ? 'The browser could not safely save recovery data, so no paid task was submitted.'
      : '浏览器无法安全保存任务恢复信息，本次未提交付费任务';
  }
  if (
    c === 'PAID_FEATURES_DISABLED' ||
    c === 'DATABASE_NOT_CONFIGURED' ||
    c === 'LEGACY_BILLING_DISABLED' ||
    c === 'TOOL_OPERATION_UNAVAILABLE' ||
    c === 'TASK_PAYLOAD_KEY_MISSING' ||
    c === 'MODEL_PROFILE_UNAVAILABLE'
  ) {
    return en ? 'Paid enhancement is currently unavailable.' : '付费增强当前不可用';
  }
  if (c === 'PRICE_CHANGED' || c === 'QUOTE_ALREADY_USED' || c === 'QUOTE_NOT_FOUND') {
    return en ? 'The quote changed. Reopen the tool to confirm the latest price.' : '报价已变化，请重新打开工具确认最新价格';
  }
  if (c === 'TASK_CANCELLED' || c === 'AbortError') return ui.value.cancelled;
  if (c === 'TASK_CANCEL_PENDING') return ui.value.cancelPending;
  if (c === 'OUTPUT_COMPOSITION_CHANGED') {
    return en ? 'The result changed the original composition and was rejected. Credits were refunded.' : '结果改变了原始构图，已拒绝并退款';
  }
  if (c.startsWith('OUTPUT_') || c === 'INVALID_OUTPUT') {
    return en ? 'The output failed integrity checks. Credits were refunded.' : '输出未通过完整性校验，已退款';
  }
  if (c === 'MISSING_SILICONFLOW_API_KEY')
    return en ? 'Service is not configured. Please try again later.' : '服务未配置，请稍后再试';
  if (c === 'SERVER_BUSY' || c === 'SERVICE_BUSY' || c === 'API_ERROR_503')
    return en ? 'Service busy. Please try again later.' : '服务繁忙，请稍后再试';
  if (c === 'CONTENT_POLICY_REJECTED')
    return en ? 'This request could not be processed under the content policy.' : '此请求未通过内容安全校验，请调整后重试';
  if (c === 'PROVIDER_TIMEOUT' || c === 'TASK_LEASE_LOST')
    return en ? 'The generation service timed out. Credits were refunded.' : '生成服务超时，已退款';
  if (c === 'EMPTY_IMAGE_RESULT')
    return en ? 'Generation failed: empty image result.' : '出图失败：服务未返回图片';
  if (/failed to fetch|network/i.test(c))
    return en ? 'Network error. Please try again.' : '网络异常或服务不可用，请稍后再试';
  if (/timeout/i.test(c) || c === 'UPSTREAM_TIMEOUT' || c === 'API_ERROR_504')
    return en ? 'Request timed out. Please try again.' : '请求超时，请稍后再试';
  return c.length > 160 ? `${c.slice(0, 160)}…` : c;
};

const openResult = (args: { title: string; url?: string; error?: string }) => {
  resultTitle.value = args.title;
  resultUrl.value = String(args.url || '').trim();
  resultError.value = String(args.error || '').trim();
  resultImageBroken.value = false;
  resultVisible.value = true;
};

const confirmActiveCancellation = async () => {
  const slot = activeWorkshopSlot.value;
  try {
    let task = slot ? await cancelPersistedWorkshopTask(slot) : null;
    if (!task && activeToolTaskId.value) {
      task = await cancelToolTask(activeToolTaskId.value);
    }
    if (!task) return { state: 'pending' as const };
    activeToolTaskId.value = '';
    activeWorkshopSlot.value = '';
    if (task.status === 'success') return { state: 'success' as const, task };
    if (task.status === 'cancelled' || task.status === 'failed') {
      return { state: 'released' as const, task };
    }
    return { state: 'pending' as const, task };
  } catch {
    return { state: 'pending' as const };
  }
};

const closeResult = () => {
  const shouldCancel = Boolean(activeWorkshopSlot.value || activeToolTaskId.value);
  if (activeRequestController) activeRequestController.abort();
  activeRequestController = null;
  if (shouldCancel) void confirmActiveCancellation();
  resultVisible.value = false;
  resultUrl.value = '';
  resultError.value = '';
  resultTitle.value = '';
  resultLoading.value = false;
  activeRequestId.value = '';
  resultImageBroken.value = false;
  if (resultSourceUrl.value.startsWith('blob:')) URL.revokeObjectURL(resultSourceUrl.value);
  resultSourceUrl.value = '';
  resultVersion.value = 0;
};

const onResultDialogKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeResult();
    return;
  }
  if (event.key !== 'Tab' || !resultDialogRef.value) return;
  const focusable = Array.from(resultDialogRef.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) {
    event.preventDefault();
    resultDialogRef.value.focus();
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
};

const cancelActiveRequest = async () => {
  const controller = activeRequestController;
  activeRequestController = null;
  activeRequestId.value = '';
  controller?.abort();
  resultLoading.value = false;
  resultUrl.value = '';
  resultError.value = ui.value.cancelPending;
  const outcome = await confirmActiveCancellation();
  if (!resultVisible.value) return;
  if (outcome.state === 'released') {
    resultError.value = ui.value.cancelled;
    trackEvent('ImageWorkshop', 'generate_cancel', 'confirmed');
    return;
  }
  if (outcome.state === 'success') {
    const assetId = String(outcome.task.result?.assets?.[0]?.assetId || '').trim();
    if (assetId) {
      resultError.value = '';
      resultVersion.value = 1;
      resultUrl.value = taskAssetUrl(assetId);
    } else {
      resultError.value = ui.value.cancelCompleted;
    }
    trackEvent('ImageWorkshop', 'generate_cancel', 'completed_before_cancel');
    return;
  }
  resultError.value = ui.value.cancelPending;
  trackEvent('ImageWorkshop', 'generate_cancel', 'pending_confirmation');
};

const extFromMime = (mime: string) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
};

const fetchImageBlob = async (url: string): Promise<Blob | null> => {
  try {
    const u = String(url || '').trim();
    if (!u) return null;
    const res = await resourceFetch(u);
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

const downloadResult = async () => {
  const url = String(resultUrl.value || '').trim();
  if (!url) return;
  const blob = await fetchImageBlob(url);
  if (blob) {
    const ext = extFromMime(blob.type);
    downloadBlob(blob, `artigen_${Date.now().toString(36)}.${ext}`);
    return;
  }
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
};

const runPaidImageTask = async (args: {
  slot: string;
  title: string;
  toolId: string;
  operation: string;
  options: Record<string, unknown>;
  quote: ToolTaskQuote;
  file: File;
  analyticsTarget: string;
  showSource?: boolean;
}) => {
  activeRequestController?.abort();
  const controller = new AbortController();
  activeRequestController = controller;
  const requestId = `workshop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  activeRequestId.value = requestId;
  activeWorkshopSlot.value = args.slot;
  resultLoading.value = true;
  if (resultSourceUrl.value.startsWith('blob:')) URL.revokeObjectURL(resultSourceUrl.value);
  resultSourceUrl.value = args.showSource ? URL.createObjectURL(args.file) : '';
  resultVersion.value = 0;
  openResult({ title: args.title });
  consoleStore.recordTraffic({
    type: 'conversion',
    page: '/artigen/image-workshop',
    target: args.analyticsTarget
  });
  trackEvent('ImageWorkshop', 'task_start', args.analyticsTarget);
  let terminalReached = false;
  try {
    const task = await startPersistedWorkshopTask({
      slot: args.slot,
      toolId: args.toolId,
      operation: args.operation,
      options: args.options,
      quote: args.quote,
      file: args.file,
      signal: controller.signal,
      onTask: (next) => {
        activeToolTaskId.value = next.taskId;
      }
    });
    terminalReached = true;
    activeWorkshopSlot.value = '';
    if (activeToolTaskId.value === task.taskId) activeToolTaskId.value = '';
    if (activeRequestId.value !== requestId || controller.signal.aborted) return;
    if (task.status !== 'success') {
      throw new Error(task.error?.code || (task.status === 'cancelled' ? 'TASK_CANCELLED' : 'WORKSHOP_AI_FAILED'));
    }
    const assetId = String(task.result?.assets?.[0]?.assetId || '').trim();
    if (!assetId) throw new Error('INVALID_OUTPUT');
    resultLoading.value = false;
    resultVersion.value = 1;
    openResult({ title: args.title, url: taskAssetUrl(assetId) });
    trackEvent('ImageWorkshop', 'task_success', args.analyticsTarget);
  } catch (error: any) {
    if (controller.signal.aborted || activeRequestId.value !== requestId) return;
    resultLoading.value = false;
    const code = String(error?.code || error?.message || error?.name || 'WORKSHOP_AI_FAILED');
    openResult({ title: args.title, error: humanizeError(code) });
    trackEvent('ImageWorkshop', 'task_fail', code);
  } finally {
    if (terminalReached) activeWorkshopSlot.value = '';
    if (activeRequestController === controller) activeRequestController = null;
  }
};

const resumePendingImageWorkshopTask = async () => {
  const candidates = [
    { slot: 'old-photo', title: ui.value.toolOldTitle, analyticsTarget: 'old_photo_recovered' },
    { slot: 'professional-portrait', title: ui.value.toolIdTitle, analyticsTarget: 'professional_portrait_recovered' },
    { slot: 'background-ai-scene', title: ui.value.toolBgTitle, analyticsTarget: 'background_scene_recovered' }
  ];
  for (const candidate of candidates) {
    const stored = await loadPendingWorkshopTask(candidate.slot);
    if (!stored) continue;
    const controller = new AbortController();
    activeRequestController?.abort();
    activeRequestController = controller;
    activeWorkshopSlot.value = candidate.slot;
    const requestId = `recover_${Date.now().toString(36)}_${candidate.slot}`;
    activeRequestId.value = requestId;
    resultLoading.value = true;
    if (candidate.slot === 'old-photo' && stored.file) {
      if (resultSourceUrl.value.startsWith('blob:')) URL.revokeObjectURL(resultSourceUrl.value);
      resultSourceUrl.value = URL.createObjectURL(stored.file);
    }
    openResult({ title: candidate.title });
    try {
      const task = await resumePersistedWorkshopTask(
        candidate.slot,
        controller.signal,
        (next) => {
          activeToolTaskId.value = next.taskId;
        }
      );
      if (!task) continue;
      resultLoading.value = false;
      if (activeToolTaskId.value === task.taskId) activeToolTaskId.value = '';
      activeWorkshopSlot.value = '';
      if (task.status !== 'success') {
        openResult({
          title: candidate.title,
          error: humanizeError(task.error?.code || (task.status === 'cancelled' ? 'TASK_CANCELLED' : 'WORKSHOP_AI_FAILED'))
        });
      } else {
        const assetId = String(task.result?.assets?.[0]?.assetId || '').trim();
        if (!assetId) {
          openResult({ title: candidate.title, error: humanizeError('INVALID_OUTPUT') });
        } else {
          resultVersion.value = 1;
          openResult({ title: candidate.title, url: taskAssetUrl(assetId) });
        }
      }
      trackEvent('ImageWorkshop', 'task_recovered', candidate.analyticsTarget);
      if (activeRequestController === controller) activeRequestController = null;
      return;
    } catch (error: any) {
      if (controller.signal.aborted) return;
      resultLoading.value = false;
      const code = String(error?.code || error?.message || error?.name || 'WORKSHOP_AI_FAILED');
      openResult({ title: candidate.title, error: humanizeError(code) });
      if (activeRequestController === controller) activeRequestController = null;
      return;
    }
  }
};

const handleGenerateIdPhoto = async (file: File, type: string) => {
  const quote = idPhotoQuote.value;
  if (!quote) {
    openResult({ title: ui.value.toolIdTitle, error: humanizeError(idPhotoQuoteError.value || 'QUOTE_NOT_FOUND') });
    return;
  }
  isIdPhotoPopupOpen.value = false;
  idPhotoQuote.value = null;
  await runPaidImageTask({
    slot: 'professional-portrait',
    title: ui.value.toolIdTitle,
    toolId: 'id-photo',
    operation: 'professional-portrait',
    options: { style: String(type || '').trim() || 'finance' },
    quote,
    file,
    analyticsTarget: `professional_portrait:${String(type || '').trim() || 'finance'}`
  });
};

const handleGenerateAiBackground = async (
  file: File,
  args: {
    mode: 'replace' | 'add';
    presetId: string;
    presetSrc: string;
    presetW: number;
    presetH: number;
    localResultUrl?: string;
    subjectScale?: number;
    subjectOffset?: { x: number; y: number };
  }
) => {
  isAiBackgroundPopupOpen.value = false;
  const presetId = String(args?.presetId || '').trim();
  const localResultUrl = String(args?.localResultUrl || '').trim();

  if (localResultUrl) {
    resultLoading.value = false;
    openResult({ title: ui.value.toolBgTitle, url: localResultUrl });
    consoleStore.recordTraffic({
      type: 'generate_success',
      page: '/artigen/image-workshop',
      target: `ai_background_local:${presetId || 'preset'}`
    });
    trackEvent('ImageWorkshop', 'generate_success', `ai_background_local:${presetId || 'preset'}`);
    return;
  }

  const quote = backgroundQuote.value;
  if (!quote) {
    openResult({ title: ui.value.toolBgTitle, error: humanizeError(backgroundQuoteError.value || 'QUOTE_NOT_FOUND') });
    return;
  }
  backgroundQuote.value = null;
  await runPaidImageTask({
    slot: 'background-ai-scene',
    title: ui.value.toolBgTitle,
    toolId: 'background',
    operation: 'ai-scene',
    options: {
      mode: 'add',
      presetId,
      subjectScale: Number(args?.subjectScale ?? 1),
      subjectOffset: {
        x: Number(args?.subjectOffset?.x ?? 0),
        y: Number(args?.subjectOffset?.y ?? 0)
      }
    },
    quote,
    file,
    analyticsTarget: `ai_background:add:${presetId || 'preset'}`
  });
};

const runOldPhotoTask = async (file: File, options: { colorize: boolean; denoise: boolean }) => {
  const quote = oldPhotoQuote.value;
  if (!quote) {
    openResult({ title: ui.value.toolOldTitle, error: humanizeError(oldPhotoQuoteError.value || 'QUOTE_NOT_FOUND') });
    return;
  }

  isOldPhotoPopupOpen.value = false;
  oldPhotoQuote.value = null;
  oldPhotoQuoteError.value = '';
  activeRequestController?.abort();
  const controller = new AbortController();
  activeRequestController = controller;
  activeWorkshopSlot.value = 'old-photo';
  const requestId = `oldphoto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  activeRequestId.value = requestId;
  if (resultSourceUrl.value.startsWith('blob:')) URL.revokeObjectURL(resultSourceUrl.value);
  resultSourceUrl.value = URL.createObjectURL(file);
  resultVersion.value = 0;
  resultLoading.value = true;
  openResult({ title: ui.value.toolOldTitle });
  consoleStore.recordTraffic({
    type: 'conversion',
    page: '/artigen/image-workshop/old-photo',
    target: options.colorize ? 'enhance_colorize' : 'enhance'
  });
  trackEvent('ImageWorkshop', 'task_start', options.colorize ? 'old_photo_colorize' : 'old_photo_enhance');

  let terminalReached = false;
  try {
    const task = await startPersistedWorkshopTask({
      slot: 'old-photo',
      toolId: 'old-photo',
      operation: options.colorize ? 'enhance-colorize' : 'enhance',
      options: { denoise: options.denoise },
      quote,
      file,
      signal: controller.signal,
      onTask: (next) => {
        activeToolTaskId.value = next.taskId;
      }
    });
    terminalReached = true;
    activeWorkshopSlot.value = '';
    if (activeToolTaskId.value === task.taskId) activeToolTaskId.value = '';
    if (activeRequestId.value !== requestId || controller.signal.aborted) return;
    if (task.status !== 'success') {
      throw new Error(task.error?.code || (task.status === 'cancelled' ? 'TASK_CANCELLED' : 'OLD_PHOTO_FAILED'));
    }
    const assetId = String(task.result?.assets?.[0]?.assetId || '').trim();
    if (!assetId) throw new Error('INVALID_OUTPUT');
    resultLoading.value = false;
    resultVersion.value = 1;
    openResult({ title: ui.value.toolOldTitle, url: taskAssetUrl(assetId) });
    trackEvent('ImageWorkshop', 'task_success', 'old_photo');
  } catch (error: any) {
    if (controller.signal.aborted || activeRequestId.value !== requestId) return;
    resultLoading.value = false;
    const code = String(error?.code || error?.message || error?.name || 'OLD_PHOTO_FAILED');
    openResult({ title: ui.value.toolOldTitle, error: humanizeError(code) });
    trackEvent('ImageWorkshop', 'task_fail', code);
  } finally {
    if (terminalReached) activeWorkshopSlot.value = '';
    if (activeRequestController === controller) activeRequestController = null;
  }
};

const handleRestoreOldPhoto = async (file: File, options: any) => {
  const uid = String(getCurrentUserId() || '').trim();
  const authed = !!uid && !uid.startsWith('guest_') && isLocalLoggedIn();
  if (!authed) {
    openResult({ title: ui.value.toolOldTitle, error: ui.value.loginRequired });
    consoleStore.recordTraffic({
      type: 'click',
      page: '/artigen/image-workshop',
      target: 'old_photo_login_required'
    });
    trackEvent('ImageWorkshop', 'login_required', 'old_photo');
    return;
  }
  const opts = {
    colorize: !!options?.colorize,
    denoise: !!options?.denoise
  };
  await runOldPhotoTask(file, opts);
};
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.image-workshop-page {
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: 'Inter', sans-serif;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding: 80px 40px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

.page-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  row-gap: 20px;
  margin-bottom: 60px;
  align-items: start;
}

.badge-row {
  grid-column: 1;
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 10px;
}

.badge-dot {
  width: 8px;
  height: 8px;
  background: #ccff00;
  border-radius: 50%;
  box-shadow: 0 0 8px #ccff00;
}

.badge-text {
  color: #ccff00;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
}

.title-stack {
  grid-column: 1 / -1;
  justify-self: center;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.page-title {
  font-size: 64px;
  font-weight: 900;
  margin: 0;
  letter-spacing: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}

.title-text-group {
  white-space: nowrap;
}

.highlight {
  color: #ccff00;
}

.real-beta-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  color: #ff9900;
  font-weight: 700;
  margin-left: 2px;
  margin-right: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.9;
}

.mode-separation-note {
  font-size: 14px;
  background: rgba(147, 51, 234, 0.2);
  border: 1px solid rgba(147, 51, 234, 0.5);
  color: #e9d5ff;
  padding: 8px 14px;
  border-radius: 8px;
  font-weight: normal;
  letter-spacing: 0;
  line-height: 1.4;
}

.page-desc {
  color: #94a3b8;
  font-size: 18px;
  margin: 0;
  max-width: 860px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 40px;
  padding: 0 40px;
  position: relative;
  z-index: 100;
}

.disabled {
  opacity: 0.8;
}

.result-overlay {
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

.result-container {
  width: 920px;
  max-width: 95vw;
  box-sizing: border-box;
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  max-height: calc(100vh - 32px);
  overflow: auto;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.result-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #fff;
}

.result-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-loading {
  width: 100%;
  box-sizing: border-box;
  height: 520px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.cancel-request {
  min-height: 44px;
  margin-top: 8px;
}

.loading-spinner {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 3px solid rgba(255, 255, 255, 0.16);
  border-top-color: rgba(204, 255, 0, 0.95);
  animation: spin 0.9s linear infinite;
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.18);
}

.loading-text {
  font-size: 13px;
  color: rgba(226, 232, 240, 0.75);
  font-weight: 700;
}

.result-error {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  border: 1px solid rgba(255, 107, 107, 0.28);
  border-radius: 10px;
  background: rgba(255, 107, 107, 0.07);
  color: rgba(255, 180, 180, 0.92);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 700;
}

.result-image-wrap {
  width: 100%;
  box-sizing: border-box;
  height: 520px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.old-photo-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.old-photo-comparison figure {
  margin: 0;
  min-width: 0;
}

.old-photo-comparison .result-image {
  width: 100%;
  height: min(48vh, 480px);
  object-fit: contain;
  background: #0b0d0e;
}

.old-photo-comparison figcaption {
  padding-top: 8px;
  color: rgba(226, 232, 240, 0.76);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 640px) {
  .old-photo-comparison {
    grid-template-columns: 1fr;
  }

  .old-photo-comparison .result-image {
    height: min(30vh, 300px);
  }
}

.result-image-missing {
  width: 100%;
  height: 100%;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: rgba(226, 232, 240, 0.72);
  background: rgba(255, 255, 255, 0.035);
}

.result-image-missing-title {
  color: rgba(241, 245, 249, 0.86);
  font-size: 13px;
  font-weight: 800;
}

.result-image-missing-sub {
  color: rgba(148, 163, 184, 0.86);
  font-size: 12px;
}

.result-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.result-btn {
  min-height: 44px;
  appearance: none;
  border: 1px solid rgba(204, 255, 0, 0.6);
  background: rgba(204, 255, 0, 0.14);
  color: #ccff00;
  padding: 10px 14px;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.result-container:focus-visible {
  outline: none;
}

.result-container :is(button, input, select, textarea, [tabindex]):focus-visible,
:deep(.tool-card:focus-visible) {
  outline: 2px solid #ccff00;
  outline-offset: 3px;
}

.result-btn.secondary {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #ddd;
}

.result-btn:disabled {
  opacity: 1;
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.045);
  color: rgba(226, 232, 240, 0.42);
  cursor: not-allowed;
}

.result-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .page-title {
    font-size: 26px;
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 8px;
    white-space: normal;
  }

  .title-text-group {
    white-space: normal;
  }

  .real-beta-badge {
    margin: 0;
    font-size: 13px;
  }

  .mode-separation-note {
    width: min(100%, 360px);
  }

  .tools-grid {
    grid-template-columns: 1fr;
    padding: 0;
    gap: 20px;
  }

  .main-content {
    padding: 40px 20px;
  }
}

@media (max-width: 350px) {
  .page-title {
    font-size: 22px;
  }
  .tools-grid {
    gap: 12px;
    padding: 0 12px;
  }

  :deep(.tool-card) {
    padding: 20px !important;
    min-height: auto !important;
  }

  :deep(.tool-title) {
    font-size: 20px !important;
  }

  :deep(.tool-icon) {
    font-size: 32px !important;
    padding: 6px 12px !important;
  }

  :deep(.tool-desc) {
    font-size: 13px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
