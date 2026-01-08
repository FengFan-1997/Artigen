<template>
  <div>
    <a-typography-title :level="2">Usage History</a-typography-title>

    <a-card>
      <div style="margin-bottom: 16px; display: flex; gap: 16px; flex-wrap: wrap">
        <a-range-picker v-model:value="dateRange" />
        <a-button type="primary" @click="fetchUsage" :loading="loading">Filter</a-button>
      </div>

      <a-table
        :columns="columns"
        :data-source="items"
        row-key="requestId"
        :pagination="pagination"
        :loading="loading"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'model'">
            <a-tag color="blue">{{ record.model }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="showDetails(record)">Details</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:visible="detailsVisible" title="Usage Details" footer="" width="600px">
      <a-descriptions bordered column="1" size="small">
        <a-descriptions-item label="Request ID">{{ currentRecord?.requestId }}</a-descriptions-item>
        <a-descriptions-item label="Time">{{
          currentRecord?.ts ? new Date(currentRecord.ts).toLocaleString() : ''
        }}</a-descriptions-item>
        <a-descriptions-item label="Model">{{ currentRecord?.model }}</a-descriptions-item>
        <a-descriptions-item label="Cost"
          >{{ currentRecord?.creditsDelta }} Credits</a-descriptions-item
        >
        <a-descriptions-item label="Tokens">
          In: {{ currentRecord?.tokensIn }} / Out: {{ currentRecord?.tokensOut }}
        </a-descriptions-item>
      </a-descriptions>

      <div style="margin-top: 16px">
        <h4>Raw Data</h4>
        <pre
          style="
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            overflow: auto;
            max-height: 300px;
          "
          >{{ JSON.stringify(currentRecord, null, 2) }}</pre
        >
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuth } from '@/agent/composables/useAuth';
import { getCurrentUserId } from '@/login/session';
import { useConsoleStore } from '@/stores/console';

const { currentUser } = useAuth();
const userId = computed(() => currentUser.value?.userId || getCurrentUserId());
const consoleStore = useConsoleStore();
const loading = ref(false);
const dateRange = ref<any[]>([]);
const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true
});

const detailsVisible = ref(false);
const currentRecord = ref<any>(null);

const columns = [
  {
    title: 'Time',
    dataIndex: 'ts',
    key: 'ts',
    width: 180,
    customRender: ({ text }: any) => new Date(text).toLocaleString()
  },
  { title: 'Request ID', dataIndex: 'requestId', key: 'requestId', ellipsis: true },
  { title: 'Type', dataIndex: 'trigger', key: 'trigger' },
  { title: 'Description', dataIndex: 'model', key: 'model' }, // Using model col for description
  { title: 'Credits', dataIndex: 'creditsDelta', key: 'creditsDelta', align: 'right' },
  { title: 'Action', key: 'action', width: 100, fixed: 'right' }
];

const items = computed(() => {
  const transactions = consoleStore
    .getUserTransactions(userId.value)
    .filter((t) => t.type === 'usage' || t.type === 'admin_gift' || t.type === 'refund');

  return transactions.map((t) => ({
    ts: t.timestamp,
    requestId: t.id,
    trigger: t.type,
    model: t.description,
    creditsDelta: t.amount,
    tokensIn: t.meta?.tokensIn || 0,
    tokensOut: t.meta?.tokensOut || 0,
    status: 'ok',
    ...t.meta
  }));
});

onMounted(() => {
  consoleStore.init();
});

const fetchUsage = () => {
  // Client-side filtering if needed, for now just relying on computed
  loading.value = true;
  setTimeout(() => {
    loading.value = false;
  }, 300);
};

const handleTableChange = (pag: any) => {
  pagination.value.current = pag.current;
  pagination.value.pageSize = pag.pageSize;
};

const showDetails = (record: any) => {
  currentRecord.value = record;
  detailsVisible.value = true;
};
</script>
