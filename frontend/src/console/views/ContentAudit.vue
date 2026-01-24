<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="images" :tab="ui.tabImages">
        <div class="table-toolbar">
          <div class="table-toolbar-left">
            <a-button class="icon-btn" @click="openColumnModal('images')">
              <template #icon><SettingOutlined /></template>
              {{ ui.columns }}
            </a-button>
            <a-input
              v-model:value="filterUserId"
              :placeholder="ui.userFilterPh"
              class="filter-input"
            />
            <a-button type="primary" :loading="loadingImages" @click="fetchImages">{{
              ui.refresh
            }}</a-button>
          </div>
        </div>

        <div class="table-wrap">
          <a-table
            :dataSource="images"
            :columns="imageColumns"
            rowKey="id"
            :loading="loadingImages"
            :tableLayout="'fixed'"
            :scroll="{ x: imageScrollX }"
          >
            <template #headerCell="{ column }">
              <div class="th-wrap">
                <span class="th-title">{{ column.title }}</span>
                <span
                  class="th-resizer"
                  @mousedown="(e) => onResizeMouseDown(e, 'images', column.key)"
                />
              </div>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'preview'">
                <div class="img-center">
                  <div class="img-hover">
                    <a-image :width="100" :src="record.previewUrl || NO_IMAGE_URL" />
                    <div v-if="canActOnUrl(record.previewUrl)" class="img-actions">
                      <a-button
                        size="small"
                        type="text"
                        class="img-action-btn"
                        @click.stop="downloadImage(record.previewUrl, record.id)"
                      >
                        <template #icon><DownloadOutlined /></template>
                        {{ ui.download }}
                      </a-button>
                      <a-button
                        size="small"
                        type="text"
                        class="img-action-btn"
                        @click.stop="referenceImage(record.previewUrl)"
                      >
                        <template #icon><LinkOutlined /></template>
                        {{ ui.reference }}
                      </a-button>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else-if="column.key === 'upload'">
                <div class="img-center">
                  <div class="img-hover">
                    <a-image :width="100" :src="record.uploadPreviewUrl || NO_UPLOAD_URL" />
                    <div v-if="canActOnUrl(record.uploadPreviewUrl)" class="img-actions">
                      <a-button
                        size="small"
                        type="text"
                        class="img-action-btn"
                        @click.stop="downloadImage(record.uploadPreviewUrl, record.id)"
                      >
                        <template #icon><DownloadOutlined /></template>
                        {{ ui.download }}
                      </a-button>
                      <a-button
                        size="small"
                        type="text"
                        class="img-action-btn"
                        @click.stop="referenceImage(record.uploadPreviewUrl)"
                      >
                        <template #icon><LinkOutlined /></template>
                        {{ ui.reference }}
                      </a-button>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else-if="column.key === 'type'">
                {{ record.model || record.type || '-' }}
              </template>
              <template v-else-if="column.key === 'ts'">
                {{ record.ts ? new Date(record.ts).toLocaleString() : '-' }}
              </template>
              <template v-else-if="column.key === 'userText'">
                <div class="prompt-cell">{{ record.userText || '' }}</div>
              </template>
              <template v-else-if="column.key === 'prompt'">
                <div class="prompt-cell">{{ record.prompt || '' }}</div>
              </template>
            </template>
          </a-table>
        </div>
      </a-tab-pane>

      <a-tab-pane key="chat" :tab="ui.tabChat">
        <div class="table-toolbar">
          <div class="table-toolbar-left">
            <a-button class="icon-btn" @click="openColumnModal('chat')">
              <template #icon><SettingOutlined /></template>
              {{ ui.columns }}
            </a-button>
            <a-input
              v-model:value="filterUserId"
              :placeholder="ui.userFilterPh"
              class="filter-input"
            />
            <a-button type="primary" :loading="loadingUsage" @click="fetchUsage">{{
              ui.refresh
            }}</a-button>
          </div>
        </div>
        <div class="table-wrap">
          <a-table
            :dataSource="chatLogs"
            :columns="chatColumns"
            rowKey="requestId"
            :loading="loadingUsage"
            :tableLayout="'fixed'"
            :scroll="{ x: chatScrollX }"
          >
            <template #headerCell="{ column }">
              <div class="th-wrap">
                <span class="th-title">{{ column.title }}</span>
                <span
                  class="th-resizer"
                  @mousedown="(e) => onResizeMouseDown(e, 'chat', column.key)"
                />
              </div>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'ts'">
                {{ record.ts ? new Date(record.ts).toLocaleString() : '-' }}
              </template>
              <template v-else-if="column.key === 'action'">
                <a-button size="small" @click="viewLogDetails(record)">{{
                  ui.viewFullLog
                }}</a-button>
              </template>
            </template>
          </a-table>
        </div>
      </a-tab-pane>

      <a-tab-pane key="behavior" :tab="ui.tabBehavior">
        <div class="table-toolbar">
          <div class="table-toolbar-left">
            <a-input
              v-model:value="filterUserId"
              :placeholder="ui.userFilterPh"
              class="filter-input"
            />
            <a-input
              v-model:value="filterBehaviorAction"
              :placeholder="ui.behaviorActionFilterPh"
              class="filter-input"
            />
            <a-button type="primary" @click="refreshBehavior">{{ ui.refresh }}</a-button>
          </div>
        </div>
        <div class="table-wrap">
          <a-table
            :dataSource="behaviorLogs"
            :columns="behaviorColumns"
            rowKey="id"
            :tableLayout="'fixed'"
            :scroll="{ x: behaviorScrollX }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'ts'">
                {{ record.ts ? new Date(record.ts).toLocaleString() : '-' }}
              </template>
              <template v-else-if="column.key === 'details'">
                <div class="prompt-cell">{{ formatBehaviorDetails(record.details) }}</div>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-button size="small" @click="viewBehaviorDetails(record)">{{
                  ui.viewFullLog
                }}</a-button>
              </template>
            </template>
          </a-table>
        </div>
      </a-tab-pane>

      <a-tab-pane key="events" :tab="ui.tabEvents">
        <div class="table-toolbar">
          <div class="table-toolbar-left">
            <a-input
              v-model:value="filterEventType"
              :placeholder="ui.eventTypeFilterPh"
              class="filter-input"
            />
            <a-button type="primary" :loading="loadingEvents" @click="fetchEvents">{{
              ui.refresh
            }}</a-button>
          </div>
        </div>
        <div class="table-wrap">
          <a-table
            :dataSource="events"
            :columns="eventColumns"
            rowKey="id"
            :loading="loadingEvents"
            :tableLayout="'fixed'"
            :scroll="{ x: eventScrollX }"
          >
            <template #headerCell="{ column }">
              <div class="th-wrap">
                <span class="th-title">{{ column.title }}</span>
                <span
                  class="th-resizer"
                  @mousedown="(e) => onResizeMouseDown(e, 'events', column.key)"
                />
              </div>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'ts'">
                {{ record.ts ? new Date(record.ts).toLocaleString() : '-' }}
              </template>
              <template v-else-if="column.key === 'payload'">
                <div class="prompt-cell">{{ formatPayload(record.payload) }}</div>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-button size="small" @click="viewEventDetails(record)">{{
                  ui.viewFullLog
                }}</a-button>
              </template>
            </template>
          </a-table>
        </div>
      </a-tab-pane>

      <a-tab-pane key="seo" :tab="ui.tabSeo">
        <div class="seo-grid">
          <a-card class="seo-card" :title="ui.seoConfigTitle">
            <a-form layout="vertical">
              <a-form-item :label="ui.seoPagePath">
                <a-input v-model:value="seoDraft.pagePath" />
              </a-form-item>
              <a-form-item :label="ui.seoTitle">
                <a-input v-model:value="seoDraft.title" />
              </a-form-item>
              <a-form-item :label="ui.seoDescription">
                <a-textarea v-model:value="seoDraft.description" :rows="3" />
              </a-form-item>
              <a-form-item :label="ui.seoKeywords">
                <a-input v-model:value="seoDraft.keywords" />
              </a-form-item>
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item :label="ui.seoOgTitle">
                    <a-input v-model:value="seoDraft.ogTitle" />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item :label="ui.seoOgImage">
                    <a-input v-model:value="seoDraft.ogImage" />
                  </a-form-item>
                </a-col>
              </a-row>
              <a-form-item :label="ui.seoOgDescription">
                <a-textarea v-model:value="seoDraft.ogDescription" :rows="2" />
              </a-form-item>
              <a-divider />
              <a-form-item :label="ui.seoH1">
                <a-input v-model:value="seoDraft.h1" />
              </a-form-item>
              <a-form-item :label="ui.seoHeroTitle">
                <a-input v-model:value="seoDraft.heroTitle" />
              </a-form-item>
              <a-form-item :label="ui.seoHeroSubtitle">
                <a-textarea v-model:value="seoDraft.heroSubtitle" :rows="2" />
              </a-form-item>
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item :label="ui.seoCtaPrimary">
                    <a-input v-model:value="seoDraft.ctaPrimary" />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item :label="ui.seoCtaSecondary">
                    <a-input v-model:value="seoDraft.ctaSecondary" />
                  </a-form-item>
                </a-col>
              </a-row>
              <a-form-item :label="ui.seoFeatureTitle">
                <a-input v-model:value="seoDraft.featureTitle" />
              </a-form-item>
              <a-form-item :label="ui.seoFeatureItems">
                <a-textarea v-model:value="featureInput" :rows="4" />
              </a-form-item>
              <a-form-item :label="ui.seoUseCasesTitle">
                <a-input v-model:value="seoDraft.useCasesTitle" />
              </a-form-item>
              <a-form-item :label="ui.seoUseCases">
                <a-textarea v-model:value="useCaseInput" :rows="4" />
              </a-form-item>
            </a-form>
            <div class="seo-actions">
              <a-button type="primary" @click="saveSeo">{{ ui.save }}</a-button>
              <a-button @click="resetSeo">{{ ui.restoreDefault }}</a-button>
              <span class="seo-updated">{{ ui.lastUpdated }} {{ seoUpdatedAt }}</span>
            </div>
          </a-card>
          <a-card class="seo-card" :title="ui.seoPreviewTitle">
            <div class="seo-preview">
              <div class="seo-meta">
                <div class="seo-meta-label">{{ ui.seoTitle }}</div>
                <div class="seo-meta-value">{{ seoDraft.title || '-' }}</div>
              </div>
              <div class="seo-meta">
                <div class="seo-meta-label">{{ ui.seoDescription }}</div>
                <div class="seo-meta-value">{{ seoDraft.description || '-' }}</div>
              </div>
              <div class="seo-meta">
                <div class="seo-meta-label">{{ ui.seoKeywords }}</div>
                <div class="seo-meta-value">{{ seoDraft.keywords || '-' }}</div>
              </div>
              <a-divider />
              <div class="seo-hero">
                <div class="seo-h1">{{ seoDraft.h1 || '-' }}</div>
                <div class="seo-hero-title">{{ seoDraft.heroTitle || '-' }}</div>
                <div class="seo-hero-sub">{{ seoDraft.heroSubtitle || '-' }}</div>
                <div class="seo-cta-row">
                  <a-button type="primary">{{ seoDraft.ctaPrimary || ui.seoCtaPrimary }}</a-button>
                  <a-button>{{ seoDraft.ctaSecondary || ui.seoCtaSecondary }}</a-button>
                </div>
              </div>
              <a-divider />
              <div class="seo-section">
                <div class="seo-section-title">
                  {{ seoDraft.featureTitle || ui.seoFeatureTitle }}
                </div>
                <ul class="seo-list">
                  <li v-for="(item, idx) in previewFeatureItems" :key="idx">{{ item }}</li>
                </ul>
              </div>
              <div class="seo-section">
                <div class="seo-section-title">
                  {{ seoDraft.useCasesTitle || ui.seoUseCasesTitle }}
                </div>
                <ul class="seo-list">
                  <li v-for="(item, idx) in previewUseCases" :key="idx">{{ item }}</li>
                </ul>
              </div>
            </div>
          </a-card>
        </div>
      </a-tab-pane>
    </a-tabs>

    <a-modal
      v-model:visible="isColumnModalVisible"
      :title="ui.columnSettings"
      width="90%"
      style="max-width: 560px"
      :okButtonProps="{ disabled: modalSelectedKeys.length === 0 }"
      @ok="isColumnModalVisible = false"
    >
      <a-checkbox-group v-model:value="modalSelectedKeys" :options="modalColumnOptions" />
      <template #footer>
        <a-button @click="resetColumns(columnModalTab)">{{ ui.reset }}</a-button>
        <a-button @click="isColumnModalVisible = false">{{ ui.close }}</a-button>
      </template>
    </a-modal>

    <!-- Log Details Modal -->
    <a-modal
      v-model:visible="isLogModalVisible"
      :title="ui.logDetails"
      footer=""
      width="90%"
      style="max-width: 600px"
    >
      <div v-if="selectedLog">
        <p>
          <strong>{{ ui.actionLabel }}:</strong> {{ selectedLog.eventType || selectedLog.trigger }}
        </p>
        <p>
          <strong>{{ ui.colUsername }}:</strong> {{ selectedLog.username || '-' }}
        </p>
        <p>
          <strong>{{ ui.colEmail }}:</strong> {{ selectedLog.email || '-' }}
        </p>
        <p>
          <strong>{{ ui.userLabel }}:</strong> {{ selectedLog.userId }}
        </p>
        <p>
          <strong>{{ ui.timeLabel }}:</strong>
          {{ selectedLog.ts ? new Date(selectedLog.ts).toLocaleString() : '' }}
        </p>
        <a-divider />
        <pre class="log-json">{{ JSON.stringify(selectedLog, null, 2) }}</pre>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useConsoleStore, type AiBgSeoCopy } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { buildApiUrl } from '@/utils/api';
import { message } from 'ant-design-vue';
import { DownloadOutlined, LinkOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { downloadBlob } from '@/agentImg/logic/formatFactory/url';

const consoleStore = useConsoleStore();
const activeTab = ref('images');
const isLogModalVisible = ref(false);
const selectedLog = ref<any>(null);
const filterUserId = ref('');
const filterEventType = ref('');
const filterBehaviorAction = ref('');
const behaviorTick = ref(0);
const loadingImages = ref(false);
const loadingUsage = ref(false);
const loadingEvents = ref(false);

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '内容审计',
        tabImages: '生成图片',
        tabChat: '调用记录',
        tabBehavior: '用户行为',
        tabEvents: '埋点事件',
        tabSeo: 'AI 背景 SEO & 文案',
        viewFullLog: '查看完整日志',
        logDetails: '日志详情',
        actionLabel: '动作',
        userLabel: '用户',
        timeLabel: '时间',
        colPreview: '预览',
        colUpload: '用户上传图片',
        colUsername: '用户名',
        colEmail: '邮箱',
        colType: '模型',
        colPrompt: '提示词',
        colUserText: '用户输入',
        colCreatedAt: '创建时间',
        colProvider: '渠道',
        colModel: '模型',
        colCredits: '消耗',
        colTime: '时间',
        colEventType: '事件',
        colPath: '路径',
        colPayload: '参数',
        colAction: '行为',
        colDetails: '详情',
        refresh: '刷新',
        userFilterPh: '可选：按用户 ID 过滤',
        eventTypeFilterPh: '可选：按事件类型过滤（例如 page_view）',
        behaviorActionFilterPh: '可选：按行为类型过滤（例如 generate_image）',
        columns: '列设置',
        columnSettings: '列表列设置',
        download: '下载',
        reference: '引用',
        reset: '重置',
        close: '关闭',
        seoConfigTitle: 'SEO 与文案配置',
        seoPreviewTitle: '页面预览',
        seoPagePath: '页面路径',
        seoTitle: 'SEO 标题',
        seoDescription: 'SEO 描述',
        seoKeywords: 'SEO 关键词',
        seoOgTitle: 'OG 标题',
        seoOgDescription: 'OG 描述',
        seoOgImage: 'OG 图片',
        seoH1: 'H1 标题',
        seoHeroTitle: '主标题',
        seoHeroSubtitle: '副标题',
        seoCtaPrimary: '主按钮文案',
        seoCtaSecondary: '次按钮文案',
        seoFeatureTitle: '优势标题',
        seoFeatureItems: '优势列表（每行一条）',
        seoUseCasesTitle: '场景标题',
        seoUseCases: '适用场景（每行一条）',
        save: '保存',
        restoreDefault: '恢复默认',
        lastUpdated: '最后更新'
      }
    : {
        title: 'Content Audit',
        tabImages: 'Generated Images',
        tabChat: 'Requests',
        tabBehavior: 'User Activity',
        tabEvents: 'Tracking Events',
        tabSeo: 'AI Background SEO & Copy',
        viewFullLog: 'View Full Log',
        logDetails: 'Log Details',
        actionLabel: 'Action',
        userLabel: 'User',
        timeLabel: 'Time',
        colPreview: 'Preview',
        colUpload: 'User Upload',
        colUsername: 'Username',
        colEmail: 'Email',
        colType: 'Model',
        colPrompt: 'Prompt',
        colUserText: 'User Input',
        colCreatedAt: 'Created At',
        colProvider: 'Provider',
        colModel: 'Model',
        colCredits: 'Credits',
        colTime: 'Time',
        colEventType: 'Event',
        colPath: 'Path',
        colPayload: 'Payload',
        colAction: 'Action',
        colDetails: 'Details',
        refresh: 'Refresh',
        userFilterPh: 'Optional: filter by userId',
        eventTypeFilterPh: 'Optional: filter by event type (e.g. page_view)',
        behaviorActionFilterPh: 'Optional: filter by action (e.g. generate_image)',
        columns: 'Columns',
        columnSettings: 'Column Settings',
        download: 'Download',
        reference: 'Reference',
        reset: 'Reset',
        close: 'Close',
        seoConfigTitle: 'SEO & Copy',
        seoPreviewTitle: 'Preview',
        seoPagePath: 'Page Path',
        seoTitle: 'SEO Title',
        seoDescription: 'SEO Description',
        seoKeywords: 'SEO Keywords',
        seoOgTitle: 'OG Title',
        seoOgDescription: 'OG Description',
        seoOgImage: 'OG Image',
        seoH1: 'H1 Title',
        seoHeroTitle: 'Hero Title',
        seoHeroSubtitle: 'Hero Subtitle',
        seoCtaPrimary: 'Primary CTA',
        seoCtaSecondary: 'Secondary CTA',
        seoFeatureTitle: 'Feature Title',
        seoFeatureItems: 'Feature List (one per line)',
        seoUseCasesTitle: 'Use Case Title',
        seoUseCases: 'Use Cases (one per line)',
        save: 'Save',
        restoreDefault: 'Restore Default',
        lastUpdated: 'Last Updated'
      }
);

const events = computed(() => consoleStore.adminEvents || []);
const buildBehaviorLogs = (_tick: number) => {
  const userFilter = String(filterUserId.value || '').trim();
  const actionFilter = String(filterBehaviorAction.value || '')
    .trim()
    .toLowerCase();
  return (consoleStore.logs || [])
    .filter((item) => {
      if (!item) return false;
      if (userFilter && String(item.userId || '').trim() !== userFilter) return false;
      if (
        actionFilter &&
        !String(item.action || '')
          .toLowerCase()
          .includes(actionFilter)
      )
        return false;
      return true;
    })
    .map((item) => ({ ...item, ts: item.timestamp }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
};
const behaviorLogs = computed(() => buildBehaviorLogs(behaviorTick.value));

const formatPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return '';
  try {
    const text = JSON.stringify(payload);
    return text.length > 220 ? `${text.slice(0, 220)}…` : text;
  } catch {
    return '';
  }
};

const formatBehaviorDetails = (details: any) => {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details;
  try {
    const text = JSON.stringify(details);
    return text.length > 220 ? `${text.slice(0, 220)}…` : text;
  } catch {
    return '';
  }
};

const NO_IMAGE_URL = 'https://via.placeholder.com/100?text=No+Image';
const NO_UPLOAD_URL = 'https://via.placeholder.com/100?text=No+Upload';
const AGENT_IMG_PREFILL_KEY = 'agentImg:prefillRef_v1';

const showAdminError = (e: any) => {
  const code = String(e?.message || '').trim();
  const apiError = String((e as any)?.apiError || '').trim();
  const err = apiError || code || 'REQUEST_FAILED';
  if (err === 'ADMIN_AUTH_REQUIRED') {
    message.error(currentLang.value === 'zh' ? '请先登录后台' : 'Please login first');
    return;
  }
  if (
    err === 'ADMIN_AUTH_INVALID' ||
    err === 'ADMIN_AUTH_FORBIDDEN' ||
    err === 'ADMIN_AUTH_EXPIRED'
  ) {
    message.error(
      currentLang.value === 'zh' ? '登录已失效，请重新登录' : 'Session expired, please login again'
    );
    return;
  }
  if (err === 'ADMIN_NOT_CONFIGURED') {
    message.error(
      currentLang.value === 'zh'
        ? '后端未配置 ADMIN_KEY（请在 Zeabur 设置）'
        : 'ADMIN_KEY is not configured on backend'
    );
    return;
  }
  if (err === 'ADMIN_ACCOUNT_NOT_CONFIGURED') {
    message.error(
      currentLang.value === 'zh'
        ? '后端未配置管理员账号（请设置 CONSOLE_ADMIN_USERNAME/PASSWORD）'
        : 'Admin account is not configured on backend'
    );
    return;
  }
  message.error(currentLang.value === 'zh' ? '拉取失败，请稍后重试' : 'Request failed, try again');
};

onMounted(() => {
  consoleStore.init();
  hydrateColumnPreferences();
  void fetchImages();
  void fetchUsage();
  void fetchEvents();
});

const resolveUrl = (raw: string) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('/')) return buildApiUrl(u);
  return u;
};

const canActOnUrl = (raw: any) => {
  const u = String(raw || '').trim();
  if (!u) return false;
  if (u.startsWith('https://via.placeholder.com/')) return false;
  return true;
};

const extFromMime = (mime: string) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
};

const fetchImageBlob = async (url: string): Promise<Blob | null> => {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s, window.location.href);
    const sameOrigin = u.origin === window.location.origin;
    const token = String(consoleStore.adminKey || '').trim();
    const headers: Record<string, string> = {};
    if (sameOrigin && token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(u.href, { headers: Object.keys(headers).length ? headers : undefined });
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

const downloadImage = async (url: string, id?: string) => {
  const s = String(url || '').trim();
  if (!s) return;
  const blob = await fetchImageBlob(s);
  if (blob) {
    const ext = extFromMime(blob.type);
    const safeId = String(id || '').trim() || Date.now().toString(36);
    downloadBlob(blob, `audit_${safeId}.${ext}`);
    return;
  }
  try {
    const a = document.createElement('a');
    a.href = s;
    a.download = 'image';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    try {
      window.open(s, '_blank', 'noopener,noreferrer');
    } catch {}
  }
};

type AgentImgPrefillItem = { kind: 'data' | 'url'; value: string };
const writeAgentImgPrefill = (items: AgentImgPrefillItem[]) => {
  try {
    window.localStorage.setItem(AGENT_IMG_PREFILL_KEY, JSON.stringify({ items, ts: Date.now() }));
  } catch {}
};

const referenceImage = async (url: string) => {
  const s = String(url || '').trim();
  if (!s) return;
  const blob = await fetchImageBlob(s);
  if (blob && blob.size <= 2.5 * 1024 * 1024) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.startsWith('data:image/')) {
        writeAgentImgPrefill([{ kind: 'data', value: dataUrl }]);
        window.open('/artigen/ai', '_blank', 'noopener,noreferrer');
        message.success(
          currentLang.value === 'zh' ? '已引用到 AI 工坊' : 'Referenced in AI Workshop'
        );
        return;
      }
    } catch {}
  }
  writeAgentImgPrefill([{ kind: 'url', value: s }]);
  window.open('/artigen/ai', '_blank', 'noopener,noreferrer');
  message.success(currentLang.value === 'zh' ? '已引用到 AI 工坊' : 'Referenced in AI Workshop');
};

const images = computed(() => {
  return consoleStore.adminImages.map((it) => {
    const refs = Array.isArray(it.images) ? it.images : [];
    let previewUrl = '';
    for (const r of refs) {
      if (r && typeof r === 'object' && (r as any).kind === 'url') {
        const u = resolveUrl(String((r as any).url || ''));
        if (u) {
          previewUrl = u;
          break;
        }
      }
    }
    const inRefs = Array.isArray((it as any).inputImages) ? (it as any).inputImages : [];
    let uploadPreviewUrl = '';
    for (const r of inRefs) {
      if (r && typeof r === 'object' && (r as any).kind === 'url') {
        const u = resolveUrl(String((r as any).url || ''));
        if (u) {
          uploadPreviewUrl = u;
          break;
        }
      }
    }
    return { ...it, previewUrl, uploadPreviewUrl };
  });
});

const chatLogs = computed(() => {
  const items = consoleStore.adminUsage;
  return items.filter((x) => {
    const t = String(x.trigger || '').toLowerCase();
    return t.includes('chat') || t.includes('generate') || t.includes('img');
  });
});

type SimpleColumn = {
  title: string;
  key: string;
  dataIndex?: string;
  width?: number;
  ellipsis?: boolean;
  align?: 'left' | 'right' | 'center';
};

const STORAGE_PREFIX = 'console:contentAudit';
const STORAGE_IMAGES_VISIBLE = `${STORAGE_PREFIX}:images:visible`;
const STORAGE_IMAGES_WIDTHS = `${STORAGE_PREFIX}:images:widths`;
const STORAGE_CHAT_VISIBLE = `${STORAGE_PREFIX}:chat:visible`;
const STORAGE_CHAT_WIDTHS = `${STORAGE_PREFIX}:chat:widths`;
const STORAGE_EVENTS_VISIBLE = `${STORAGE_PREFIX}:events:visible`;
const STORAGE_EVENTS_WIDTHS = `${STORAGE_PREFIX}:events:widths`;

const baseImageColumns = computed<SimpleColumn[]>(() => [
  { title: ui.value.colPreview, key: 'preview', width: 170 },
  { title: ui.value.colUpload, key: 'upload', width: 170 },
  {
    title: ui.value.colUsername,
    dataIndex: 'username',
    key: 'username',
    width: 120,
    ellipsis: true
  },
  { title: ui.value.colEmail, dataIndex: 'email', key: 'email', width: 140, ellipsis: true },
  { title: ui.value.colType, key: 'type', width: 120, ellipsis: true },
  { title: ui.value.colPrompt, dataIndex: 'prompt', key: 'prompt', width: 460 },
  { title: ui.value.colUserText, dataIndex: 'userText', key: 'userText', width: 360 },
  { title: ui.value.colCreatedAt, dataIndex: 'ts', key: 'ts', width: 190 }
]);

const baseChatColumns = computed<SimpleColumn[]>(() => [
  {
    title: ui.value.colUsername,
    dataIndex: 'username',
    key: 'username',
    width: 140,
    ellipsis: true
  },
  { title: ui.value.colEmail, dataIndex: 'email', key: 'email', width: 180, ellipsis: true },
  { title: ui.value.actionLabel, dataIndex: 'trigger', key: 'trigger', width: 160, ellipsis: true },
  {
    title: ui.value.colProvider,
    dataIndex: 'provider',
    key: 'provider',
    width: 120,
    ellipsis: true
  },
  { title: ui.value.colModel, dataIndex: 'model', key: 'model', width: 160, ellipsis: true },
  {
    title: ui.value.colCredits,
    dataIndex: 'creditsDelta',
    key: 'creditsDelta',
    width: 110,
    align: 'right'
  },
  { title: ui.value.colTime, dataIndex: 'ts', key: 'ts', width: 190 },
  { title: ui.value.colCreatedAt, key: 'action', width: 140 }
]);

const baseEventColumns = computed<SimpleColumn[]>(() => [
  { title: ui.value.colTime, dataIndex: 'ts', key: 'ts', width: 190 },
  {
    title: ui.value.colEventType,
    dataIndex: 'eventType',
    key: 'eventType',
    width: 170,
    ellipsis: true
  },
  { title: ui.value.userLabel, dataIndex: 'userId', key: 'userId', width: 140, ellipsis: true },
  { title: ui.value.colPath, dataIndex: 'path', key: 'path', width: 240, ellipsis: true },
  { title: ui.value.colPayload, key: 'payload', width: 520 },
  { title: ui.value.colCreatedAt, key: 'action', width: 140 }
]);

const baseBehaviorColumns = computed<SimpleColumn[]>(() => [
  { title: ui.value.colTime, dataIndex: 'ts', key: 'ts', width: 190 },
  { title: ui.value.userLabel, dataIndex: 'userId', key: 'userId', width: 140, ellipsis: true },
  {
    title: ui.value.colAction,
    dataIndex: 'action',
    key: 'behaviorAction',
    width: 160,
    ellipsis: true
  },
  { title: ui.value.colDetails, key: 'details', width: 520 },
  { title: ui.value.colCreatedAt, key: 'action', width: 140 }
]);

const imageVisibleKeys = ref<string[]>([]);
const chatVisibleKeys = ref<string[]>([]);
const eventVisibleKeys = ref<string[]>([]);
const imageColumnWidths = ref<Record<string, number>>({});
const chatColumnWidths = ref<Record<string, number>>({});
const eventColumnWidths = ref<Record<string, number>>({});

const getDefaultVisibleKeys = (tab: 'images' | 'chat' | 'events') =>
  (tab === 'images'
    ? baseImageColumns.value
    : tab === 'chat'
      ? baseChatColumns.value
      : baseEventColumns.value
  ).map((c) => c.key);

const safeReadJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const safeWriteJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const mergeVisibleKeys = (stored: string[], defaults: string[]) => {
  const out = Array.isArray(stored)
    ? stored.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const seen = new Set(out);
  for (const k of defaults) {
    const key = String(k || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
};

const hydrateColumnPreferences = () => {
  const imgVisible = safeReadJson<string[]>(STORAGE_IMAGES_VISIBLE, []);
  const chatVisible = safeReadJson<string[]>(STORAGE_CHAT_VISIBLE, []);
  const eventVisible = safeReadJson<string[]>(STORAGE_EVENTS_VISIBLE, []);
  const imgDefaults = getDefaultVisibleKeys('images');
  const chatDefaults = getDefaultVisibleKeys('chat');
  const eventDefaults = getDefaultVisibleKeys('events');
  imageVisibleKeys.value = imgVisible.length
    ? mergeVisibleKeys(imgVisible, imgDefaults)
    : imgDefaults;
  chatVisibleKeys.value = chatVisible.length
    ? mergeVisibleKeys(chatVisible, chatDefaults)
    : chatDefaults;
  eventVisibleKeys.value = eventVisible.length
    ? mergeVisibleKeys(eventVisible, eventDefaults)
    : eventDefaults;
  imageColumnWidths.value = safeReadJson<Record<string, number>>(STORAGE_IMAGES_WIDTHS, {});
  chatColumnWidths.value = safeReadJson<Record<string, number>>(STORAGE_CHAT_WIDTHS, {});
  eventColumnWidths.value = safeReadJson<Record<string, number>>(STORAGE_EVENTS_WIDTHS, {});
};

watch(
  imageVisibleKeys,
  (v) => {
    safeWriteJson(STORAGE_IMAGES_VISIBLE, v);
  },
  { deep: true }
);
watch(
  chatVisibleKeys,
  (v) => {
    safeWriteJson(STORAGE_CHAT_VISIBLE, v);
  },
  { deep: true }
);

watch(
  eventVisibleKeys,
  (v) => {
    safeWriteJson(STORAGE_EVENTS_VISIBLE, v);
  },
  { deep: true }
);

const withWidths = (tab: 'images' | 'chat' | 'events', cols: SimpleColumn[]) => {
  const widths =
    tab === 'images'
      ? imageColumnWidths.value
      : tab === 'chat'
        ? chatColumnWidths.value
        : eventColumnWidths.value;
  return cols.map((c) => ({ ...c, width: Math.max(80, Number(widths[c.key] ?? c.width ?? 120)) }));
};

const imageColumns = computed(() => {
  const allowed = new Set(
    imageVisibleKeys.value.length ? imageVisibleKeys.value : getDefaultVisibleKeys('images')
  );
  return withWidths(
    'images',
    baseImageColumns.value.filter((c) => allowed.has(c.key))
  );
});

const chatColumns = computed(() => {
  const allowed = new Set(
    chatVisibleKeys.value.length ? chatVisibleKeys.value : getDefaultVisibleKeys('chat')
  );
  return withWidths(
    'chat',
    baseChatColumns.value.filter((c) => allowed.has(c.key))
  );
});

const eventColumns = computed(() => {
  const allowed = new Set(
    eventVisibleKeys.value.length ? eventVisibleKeys.value : getDefaultVisibleKeys('events')
  );
  return withWidths(
    'events',
    baseEventColumns.value.filter((c) => allowed.has(c.key))
  );
});

const sumWidths = (cols: SimpleColumn[]) =>
  cols.reduce((acc, c) => acc + (Number(c.width) || 0), 0);
const imageScrollX = computed(() => Math.max(900, sumWidths(imageColumns.value)));
const chatScrollX = computed(() => Math.max(900, sumWidths(chatColumns.value)));
const eventScrollX = computed(() => Math.max(900, sumWidths(eventColumns.value)));
const behaviorColumns = computed(() => baseBehaviorColumns.value);
const behaviorScrollX = computed(() => Math.max(900, sumWidths(behaviorColumns.value)));

const isColumnModalVisible = ref(false);
const columnModalTab = ref<'images' | 'chat' | 'events'>('images');
const openColumnModal = (tab: 'images' | 'chat' | 'events') => {
  columnModalTab.value = tab;
  isColumnModalVisible.value = true;
};

const modalSelectedKeys = computed<string[]>({
  get: () =>
    columnModalTab.value === 'images'
      ? imageVisibleKeys.value
      : columnModalTab.value === 'chat'
        ? chatVisibleKeys.value
        : eventVisibleKeys.value,
  set: (val) => {
    if (columnModalTab.value === 'images') imageVisibleKeys.value = val;
    else if (columnModalTab.value === 'chat') chatVisibleKeys.value = val;
    else eventVisibleKeys.value = val;
  }
});

const modalColumnOptions = computed(() => {
  const cols =
    columnModalTab.value === 'images'
      ? baseImageColumns.value
      : columnModalTab.value === 'chat'
        ? baseChatColumns.value
        : baseEventColumns.value;
  return cols.map((c) => ({ label: c.title, value: c.key }));
});

const persistWidthsForTab = (tab: 'images' | 'chat' | 'events') => {
  safeWriteJson(
    tab === 'images'
      ? STORAGE_IMAGES_WIDTHS
      : tab === 'chat'
        ? STORAGE_CHAT_WIDTHS
        : STORAGE_EVENTS_WIDTHS,
    tab === 'images'
      ? imageColumnWidths.value
      : tab === 'chat'
        ? chatColumnWidths.value
        : eventColumnWidths.value
  );
};

const resetColumns = (tab: 'images' | 'chat' | 'events') => {
  if (tab === 'images') {
    imageVisibleKeys.value = getDefaultVisibleKeys('images');
    imageColumnWidths.value = {};
    safeWriteJson(STORAGE_IMAGES_VISIBLE, imageVisibleKeys.value);
    safeWriteJson(STORAGE_IMAGES_WIDTHS, imageColumnWidths.value);
    return;
  }
  if (tab === 'chat') {
    chatVisibleKeys.value = getDefaultVisibleKeys('chat');
    chatColumnWidths.value = {};
    safeWriteJson(STORAGE_CHAT_VISIBLE, chatVisibleKeys.value);
    safeWriteJson(STORAGE_CHAT_WIDTHS, chatColumnWidths.value);
    return;
  }
  eventVisibleKeys.value = getDefaultVisibleKeys('events');
  eventColumnWidths.value = {};
  safeWriteJson(STORAGE_EVENTS_VISIBLE, eventVisibleKeys.value);
  safeWriteJson(STORAGE_EVENTS_WIDTHS, eventColumnWidths.value);
};

const resizeState = ref<null | {
  tab: 'images' | 'chat' | 'events';
  key: string;
  startX: number;
  startWidth: number;
}>(null);

const getWidthFor = (tab: 'images' | 'chat' | 'events', key: string) => {
  const widths =
    tab === 'images'
      ? imageColumnWidths.value
      : tab === 'chat'
        ? chatColumnWidths.value
        : eventColumnWidths.value;
  const base =
    tab === 'images'
      ? baseImageColumns.value
      : tab === 'chat'
        ? baseChatColumns.value
        : baseEventColumns.value;
  const fromBase = base.find((c) => c.key === key)?.width ?? 120;
  return Math.max(80, Number(widths[key] ?? fromBase));
};

const setWidthFor = (tab: 'images' | 'chat' | 'events', key: string, width: number) => {
  const clamped = Math.max(80, Math.min(900, Math.round(width)));
  if (tab === 'images') imageColumnWidths.value = { ...imageColumnWidths.value, [key]: clamped };
  else if (tab === 'chat') chatColumnWidths.value = { ...chatColumnWidths.value, [key]: clamped };
  else eventColumnWidths.value = { ...eventColumnWidths.value, [key]: clamped };
};

const onResizeMouseMove = (e: MouseEvent) => {
  const st = resizeState.value;
  if (!st) return;
  const next = st.startWidth + (e.clientX - st.startX);
  setWidthFor(st.tab, st.key, next);
};

const stopResize = () => {
  const st = resizeState.value;
  if (!st) return;
  resizeState.value = null;
  try {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  } catch {}
  window.removeEventListener('mousemove', onResizeMouseMove);
  window.removeEventListener('mouseup', stopResize);
  persistWidthsForTab(st.tab);
};

const onResizeMouseDown = (e: MouseEvent, tab: 'images' | 'chat' | 'events', key: string) => {
  e.preventDefault();
  e.stopPropagation();
  const startWidth = getWidthFor(tab, String(key));
  resizeState.value = { tab, key: String(key), startX: e.clientX, startWidth };
  try {
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  } catch {}
  window.addEventListener('mousemove', onResizeMouseMove);
  window.addEventListener('mouseup', stopResize);
};

onBeforeUnmount(() => {
  stopResize();
});

const viewLogDetails = (log: any) => {
  selectedLog.value = log;
  isLogModalVisible.value = true;
};

const viewEventDetails = (evt: any) => {
  selectedLog.value = evt;
  isLogModalVisible.value = true;
};

const viewBehaviorDetails = (log: any) => {
  selectedLog.value = log;
  isLogModalVisible.value = true;
};

const fetchImages = async () => {
  if (loadingImages.value) return;
  loadingImages.value = true;
  try {
    await consoleStore.fetchAdminImagesHistory({
      userId: filterUserId.value,
      limit: 200,
      offset: 0
    });
  } catch (e) {
    showAdminError(e);
  } finally {
    loadingImages.value = false;
  }
};

const fetchUsage = async () => {
  if (loadingUsage.value) return;
  loadingUsage.value = true;
  try {
    await consoleStore.fetchAdminUsageLedger({
      userId: filterUserId.value,
      limit: 200,
      offset: 0
    });
  } catch (e) {
    showAdminError(e);
  } finally {
    loadingUsage.value = false;
  }
};

const fetchEvents = async () => {
  if (loadingEvents.value) return;
  loadingEvents.value = true;
  try {
    await consoleStore.fetchAdminCollectionEvents({
      eventType: filterEventType.value,
      limit: 200,
      offset: 0
    });
  } catch (e) {
    showAdminError(e);
  } finally {
    loadingEvents.value = false;
  }
};

const refreshBehavior = () => {
  behaviorTick.value += 1;
};

const makeSeoDraft = (src: AiBgSeoCopy): AiBgSeoCopy => ({
  ...src,
  featureItems: Array.isArray(src.featureItems) ? [...src.featureItems] : [],
  useCases: Array.isArray(src.useCases) ? [...src.useCases] : []
});

const seoDraft = ref<AiBgSeoCopy>(makeSeoDraft(consoleStore.aiBgSeoCopy));
const featureInput = ref('');
const useCaseInput = ref('');

const syncSeoDraft = (src: AiBgSeoCopy) => {
  seoDraft.value = makeSeoDraft(src);
  featureInput.value = (seoDraft.value.featureItems || []).join('\n');
  useCaseInput.value = (seoDraft.value.useCases || []).join('\n');
};

watch(
  () => consoleStore.aiBgSeoCopy,
  (val) => {
    if (val) syncSeoDraft(val);
  },
  { deep: true, immediate: true }
);

const normalizeLines = (input: string) =>
  String(input || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

const previewFeatureItems = computed(() => {
  const items = normalizeLines(featureInput.value);
  if (items.length) return items;
  if (seoDraft.value.featureItems?.length) return seoDraft.value.featureItems;
  return ['-'];
});

const previewUseCases = computed(() => {
  const items = normalizeLines(useCaseInput.value);
  if (items.length) return items;
  if (seoDraft.value.useCases?.length) return seoDraft.value.useCases;
  return ['-'];
});

const seoUpdatedAt = computed(() => {
  const ts = Number(seoDraft.value.updatedAt || 0);
  if (!Number.isFinite(ts) || ts <= 0) return '-';
  return new Date(ts).toLocaleString();
});

const saveSeo = () => {
  const payload: Partial<AiBgSeoCopy> = {
    ...seoDraft.value,
    featureItems: normalizeLines(featureInput.value),
    useCases: normalizeLines(useCaseInput.value)
  };
  consoleStore.setAiBgSeoCopy(payload);
  syncSeoDraft(consoleStore.aiBgSeoCopy);
  message.success(currentLang.value === 'zh' ? '已保存' : 'Saved');
};

const resetSeo = () => {
  consoleStore.resetAiBgSeoCopy();
  syncSeoDraft(consoleStore.aiBgSeoCopy);
  message.success(currentLang.value === 'zh' ? '已恢复默认' : 'Restored');
};
</script>

<style scoped>
.table-toolbar {
  margin-bottom: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.table-toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}

.filter-input {
  width: min(260px, 100%);
}

.icon-btn {
  background: rgba(2, 6, 23, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(241, 245, 249, 0.92);
}

.table-wrap {
  min-width: 0;
  overflow: auto;
}

.th-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  padding-right: 10px;
}

.th-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.th-resizer {
  position: absolute;
  right: 0;
  top: 0;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
}

.th-resizer::after {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.12);
}

.img-center {
  display: flex;
  justify-content: center;
}

.img-hover {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 10px;
  overflow: hidden;
}

.img-actions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 28px;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.72);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 2;
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.img-hover :deep(.ant-image) {
  width: 100%;
  height: 100%;
  display: block;
}

.img-hover :deep(.ant-image-img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.img-hover :deep(.ant-image-mask) {
  z-index: 1;
}

.img-hover:hover .img-actions {
  opacity: 1;
  transform: translateY(0);
}

.img-action-btn {
  color: rgba(241, 245, 249, 0.9);
  padding: 0 6px;
  height: 24px;
  line-height: 24px;
}

.img-action-btn:hover {
  color: rgba(255, 255, 255, 1);
  background: rgba(255, 255, 255, 0.08);
}

.prompt-cell {
  white-space: pre-wrap;
  word-break: break-word;
}

.log-json {
  background: rgba(2, 6, 23, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 12px;
  border-radius: 10px;
  overflow: auto;
  max-height: 400px;
  color: rgba(241, 245, 249, 0.9);
}

.seo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.seo-card {
  height: 100%;
}

@media (max-width: 768px) {
  .table-toolbar {
    align-items: stretch;
  }

  .table-toolbar-left {
    width: 100%;
  }

  .filter-input {
    width: 100%;
  }

  .table-toolbar-left :deep(.ant-btn) {
    width: 100%;
  }

  .img-hover {
    width: 72px;
    height: 72px;
    border-radius: 8px;
  }

  .img-action-btn {
    font-size: 12px;
    padding: 0 4px;
  }

  .img-actions {
    opacity: 1;
    transform: translateY(0);
  }

  :deep(.ant-tabs-nav) {
    overflow-x: auto;
  }

  .seo-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
@media (max-width: 480px) {
  .table-toolbar-left {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .filter-input {
    width: 100%;
  }

  .table-toolbar-left > .ant-btn {
    width: 100%;
  }
}
</style>
