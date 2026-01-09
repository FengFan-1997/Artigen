<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="images" :tab="ui.tabImages">
        <a-table :dataSource="images" :columns="imageColumns" rowKey="id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'preview'">
              <a-image
                :width="100"
                :src="record.contentUrl || 'https://via.placeholder.com/100?text=No+Image'"
              />
            </template>
            <template v-else-if="column.key === 'timestamp'">
              {{ new Date(record.timestamp).toLocaleString() }}
            </template>
            <template v-else-if="column.key === 'action'">
              <a-space>
                <a-button
                  type="text"
                  size="small"
                  class="success-text"
                  @click="handleAudit(record, 'approved')"
                >
                  <check-outlined /> {{ ui.approve }}
                </a-button>
                <a-button type="text" danger size="small" @click="handleAudit(record, 'rejected')">
                  <close-outlined /> {{ ui.reject }}
                </a-button>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="chat" :tab="ui.tabChat">
        <a-table :dataSource="chatLogs" :columns="chatColumns" rowKey="id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'timestamp'">
              {{ new Date(record.timestamp).toLocaleString() }}
            </template>
            <template v-else-if="column.key === 'details'">
              <div
                style="
                  max-width: 400px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                "
              >
                {{ JSON.stringify(record.details) }}
              </div>
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
          <strong>{{ ui.actionLabel }}:</strong> {{ selectedLog.action }}
        </p>
        <p>
          <strong>{{ ui.userLabel }}:</strong> {{ selectedLog.userId }}
        </p>
        <p>
          <strong>{{ ui.timeLabel }}:</strong>
          {{ new Date(selectedLog.timestamp).toLocaleString() }}
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
          >{{ JSON.stringify(selectedLog.details, null, 2) }}</pre
        >
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useConsoleStore } from '@/stores/console';
import { message } from 'ant-design-vue';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons-vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const consoleStore = useConsoleStore();
const activeTab = ref('images');
const isLogModalVisible = ref(false);
const selectedLog = ref<any>(null);

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '内容审计',
        tabImages: '生成图片',
        tabChat: '对话记录',
        approve: '通过',
        reject: '拒绝',
        viewFullLog: '查看完整日志',
        logDetails: '日志详情',
        actionLabel: '动作',
        userLabel: '用户',
        timeLabel: '时间',
        colPreview: '预览',
        colUserId: '用户 ID',
        colPrompt: '提示词',
        colCreatedAt: '创建时间',
        colAction: '操作',
        colLogAction: '动作',
        colDetails: '详情',
        colTime: '时间',
        auditSuccess: (status: string) => `图片已${status === 'approved' ? '通过' : '拒绝'}`
      }
    : {
        title: 'Content Audit',
        tabImages: 'Generated Images',
        tabChat: 'Chat History',
        approve: 'Approve',
        reject: 'Reject',
        viewFullLog: 'View Full Log',
        logDetails: 'Log Details',
        actionLabel: 'Action',
        userLabel: 'User',
        timeLabel: 'Time',
        colPreview: 'Preview',
        colUserId: 'User ID',
        colPrompt: 'Prompt',
        colCreatedAt: 'Created At',
        colAction: 'Action',
        colLogAction: 'Action',
        colDetails: 'Details',
        colTime: 'Time',
        auditSuccess: (status: string) => `Image ${status} successfully`
      }
);

onMounted(() => {
  consoleStore.init();
});

const images = computed(() => consoleStore.generatedContent.filter((c) => c.type === 'image'));

const chatLogs = computed(() =>
  consoleStore.logs.filter((l) => l.action.includes('chat') || l.action.includes('generate'))
);

const imageColumns = computed(() => [
  { title: ui.value.colPreview, key: 'preview' },
  { title: ui.value.colUserId, dataIndex: 'userId', key: 'userId' },
  { title: ui.value.colPrompt, dataIndex: 'prompt', key: 'prompt' },
  { title: ui.value.colCreatedAt, dataIndex: 'timestamp', key: 'timestamp' },
  { title: ui.value.colAction, key: 'action' }
]);

const chatColumns = computed(() => [
  { title: ui.value.colUserId, dataIndex: 'userId', key: 'userId' },
  { title: ui.value.colLogAction, dataIndex: 'action', key: 'action' },
  { title: ui.value.colDetails, dataIndex: 'details', key: 'details' },
  { title: ui.value.colTime, dataIndex: 'timestamp', key: 'timestamp' },
  { title: ui.value.colAction, key: 'action', width: 120 }
]);

const viewLogDetails = (log: any) => {
  selectedLog.value = log;
  isLogModalVisible.value = true;
};

const handleAudit = (record: any, status: string) => {
  message.success(ui.value.auditSuccess(status));
  // Here we would normally call an API
};
</script>

<style scoped>
.success-text {
  color: #52c41a;
}
</style>
