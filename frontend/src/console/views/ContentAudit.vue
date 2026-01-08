<template>
  <div>
    <a-typography-title :level="2">Content Audit</a-typography-title>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="images" tab="Generated Images">
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
                  <check-outlined /> Approve
                </a-button>
                <a-button type="text" danger size="small" @click="handleAudit(record, 'rejected')">
                  <close-outlined /> Reject
                </a-button>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="chat" tab="Chat History">
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
              <a-button size="small" @click="viewLogDetails(record)">View Full Log</a-button>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <!-- Log Details Modal -->
    <a-modal v-model:visible="isLogModalVisible" title="Log Details" footer="" width="600px">
      <div v-if="selectedLog">
        <p><strong>Action:</strong> {{ selectedLog.action }}</p>
        <p><strong>User:</strong> {{ selectedLog.userId }}</p>
        <p><strong>Time:</strong> {{ new Date(selectedLog.timestamp).toLocaleString() }}</p>
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

const consoleStore = useConsoleStore();
const activeTab = ref('images');
const isLogModalVisible = ref(false);
const selectedLog = ref<any>(null);

onMounted(() => {
  consoleStore.init();
});

const images = computed(() => consoleStore.generatedContent.filter((c) => c.type === 'image'));

const chatLogs = computed(() =>
  consoleStore.logs.filter((l) => l.action.includes('chat') || l.action.includes('generate'))
);

const imageColumns = [
  { title: 'Preview', key: 'preview' },
  { title: 'User ID', dataIndex: 'userId', key: 'userId' },
  { title: 'Prompt', dataIndex: 'prompt', key: 'prompt' },
  { title: 'Created At', dataIndex: 'timestamp', key: 'timestamp' },
  { title: 'Action', key: 'action' }
];

const chatColumns = [
  { title: 'User ID', dataIndex: 'userId', key: 'userId' },
  { title: 'Action', dataIndex: 'action', key: 'action' },
  { title: 'Details', dataIndex: 'details', key: 'details' },
  { title: 'Time', dataIndex: 'timestamp', key: 'timestamp' },
  { title: 'Action', key: 'action', width: 120 }
];

const viewLogDetails = (log: any) => {
  selectedLog.value = log;
  isLogModalVisible.value = true;
};

const handleAudit = (record: any, status: string) => {
  message.success(`Image ${status} successfully`);
  // Here we would normally call an API
};
</script>

<style scoped>
.success-text {
  color: #52c41a;
}
</style>
