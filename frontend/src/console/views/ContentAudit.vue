<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="images" :tab="ui.tabImages">
        <div style="margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap">
          <a-input
            v-model:value="filterUserId"
            :placeholder="ui.userFilterPh"
            style="width: 260px"
          />
          <a-button type="primary" :loading="loadingImages" @click="fetchImages">{{
            ui.refresh
          }}</a-button>
        </div>
        <a-table :dataSource="images" :columns="imageColumns" rowKey="id" :loading="loadingImages">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'preview'">
              <a-image
                :width="100"
                :src="record.previewUrl || 'https://via.placeholder.com/100?text=No+Image'"
              />
            </template>
            <template v-else-if="column.key === 'upload'">
              <a-image
                :width="100"
                :src="record.uploadPreviewUrl || 'https://via.placeholder.com/100?text=No+Upload'"
              />
            </template>
            <template v-else-if="column.key === 'type'">
              {{ record.model || record.type || '-' }}
            </template>
            <template v-else-if="column.key === 'ts'">
              {{ record.ts ? new Date(record.ts).toLocaleString() : '-' }}
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="chat" :tab="ui.tabChat">
        <div style="margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap">
          <a-input
            v-model:value="filterUserId"
            :placeholder="ui.userFilterPh"
            style="width: 260px"
          />
          <a-button type="primary" :loading="loadingUsage" @click="fetchUsage">{{
            ui.refresh
          }}</a-button>
        </div>
        <a-table
          :dataSource="chatLogs"
          :columns="chatColumns"
          rowKey="requestId"
          :loading="loadingUsage"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'ts'">
              {{ record.ts ? new Date(record.ts).toLocaleString() : '-' }}
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button size="small" @click="viewLogDetails(record)">{{ ui.viewFullLog }}</a-button>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <!-- Log Details Modal -->
    <a-modal v-model:visible="isLogModalVisible" :title="ui.logDetails" footer="" width="600px">
      <div v-if="selectedLog">
        <p>
          <strong>{{ ui.actionLabel }}:</strong> {{ selectedLog.trigger }}
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
        <pre
          style="
            background: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            overflow: auto;
            max-height: 400px;
          "
          >{{ JSON.stringify(selectedLog, null, 2) }}</pre
        >
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useConsoleStore } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { buildApiUrl } from '@/utils/api';
import { message } from 'ant-design-vue';

const consoleStore = useConsoleStore();
const activeTab = ref('images');
const isLogModalVisible = ref(false);
const selectedLog = ref<any>(null);
const filterUserId = ref('');
const loadingImages = ref(false);
const loadingUsage = ref(false);

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '内容审计',
        tabImages: '生成图片',
        tabChat: '调用记录',
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
        colCreatedAt: '创建时间',
        colProvider: '渠道',
        colModel: '模型',
        colCredits: '消耗',
        colTime: '时间',
        refresh: '刷新',
        userFilterPh: '可选：按用户 ID 过滤'
      }
    : {
        title: 'Content Audit',
        tabImages: 'Generated Images',
        tabChat: 'Requests',
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
        colCreatedAt: 'Created At',
        colProvider: 'Provider',
        colModel: 'Model',
        colCredits: 'Credits',
        colTime: 'Time',
        refresh: 'Refresh',
        userFilterPh: 'Optional: filter by userId'
      }
);

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
  void fetchImages();
  void fetchUsage();
});

const resolveUrl = (raw: string) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('/')) return buildApiUrl(u);
  return u;
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

const imageColumns = computed(() => [
  { title: ui.value.colPreview, key: 'preview' },
  { title: ui.value.colUpload, key: 'upload' },
  { title: ui.value.colUsername, dataIndex: 'username', key: 'username', width: 160 },
  { title: ui.value.colEmail, dataIndex: 'email', key: 'email', ellipsis: true, width: 220 },
  { title: ui.value.colType, key: 'type', width: 220 },
  { title: ui.value.colPrompt, dataIndex: 'prompt', key: 'prompt' },
  { title: ui.value.colCreatedAt, dataIndex: 'ts', key: 'ts', width: 180 }
]);

const chatColumns = computed(() => [
  { title: ui.value.colUsername, dataIndex: 'username', key: 'username', width: 160 },
  { title: ui.value.colEmail, dataIndex: 'email', key: 'email', ellipsis: true, width: 220 },
  { title: ui.value.actionLabel, dataIndex: 'trigger', key: 'trigger', width: 160 },
  { title: ui.value.colProvider, dataIndex: 'provider', key: 'provider', width: 120 },
  { title: ui.value.colModel, dataIndex: 'model', key: 'model', ellipsis: true },
  {
    title: ui.value.colCredits,
    dataIndex: 'creditsDelta',
    key: 'creditsDelta',
    width: 100,
    align: 'right'
  },
  { title: ui.value.colTime, dataIndex: 'ts', key: 'ts', width: 180 },
  { title: ui.value.colCreatedAt, key: 'action', width: 120 }
]);

const viewLogDetails = (log: any) => {
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
</script>

<style scoped></style>
