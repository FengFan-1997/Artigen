<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-card>
      <div style="margin-bottom: 16px; display: flex; gap: 16px; flex-wrap: wrap">
        <a-range-picker v-model:value="dateRange" />
        <a-button type="primary" @click="fetchUsage" :loading="loading">{{ ui.filter }}</a-button>
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
            <a-button type="link" size="small" @click="showDetails(record)">{{
              ui.details
            }}</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:visible="detailsVisible" :title="ui.usageDetails" footer="" width="600px">
      <a-descriptions bordered column="1" size="small">
        <a-descriptions-item :label="ui.requestId">{{
          currentRecord?.requestId
        }}</a-descriptions-item>
        <a-descriptions-item :label="ui.time">{{
          currentRecord?.ts ? new Date(currentRecord.ts).toLocaleString() : ''
        }}</a-descriptions-item>
        <a-descriptions-item :label="ui.model">{{ currentRecord?.model }}</a-descriptions-item>
        <a-descriptions-item :label="ui.cost"
          >{{ currentRecord?.creditsDelta }} {{ ui.credits }}</a-descriptions-item
        >
        <a-descriptions-item :label="ui.tokens">
          {{ ui.inLabel }}: {{ currentRecord?.tokensIn }} / {{ ui.outLabel }}:
          {{ currentRecord?.tokensOut }}
        </a-descriptions-item>
      </a-descriptions>

      <div style="margin-top: 16px">
        <h4>{{ ui.rawData }}</h4>
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
import { getConsoleUserId, useConsoleStore } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const userId = computed(() => getConsoleUserId());
const consoleStore = useConsoleStore();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '使用记录',
        filter: '筛选',
        details: '详情',
        usageDetails: '用量详情',
        requestId: '请求 ID',
        time: '时间',
        model: '模型',
        cost: '消耗',
        credits: '点数',
        tokens: 'Tokens',
        inLabel: '输入',
        outLabel: '输出',
        rawData: '原始数据',
        colTime: '时间',
        colRequestId: '请求 ID',
        colType: '类型',
        colDesc: '描述',
        colCredits: '点数',
        colAction: '操作'
      }
    : {
        title: 'Usage History',
        filter: 'Filter',
        details: 'Details',
        usageDetails: 'Usage Details',
        requestId: 'Request ID',
        time: 'Time',
        model: 'Model',
        cost: 'Cost',
        credits: 'Credits',
        tokens: 'Tokens',
        inLabel: 'In',
        outLabel: 'Out',
        rawData: 'Raw Data',
        colTime: 'Time',
        colRequestId: 'Request ID',
        colType: 'Type',
        colDesc: 'Description',
        colCredits: 'Credits',
        colAction: 'Action'
      }
);

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

const columns = computed(() => [
  {
    title: ui.value.colTime,
    dataIndex: 'ts',
    key: 'ts',
    width: 180,
    customRender: ({ text }: any) => new Date(text).toLocaleString()
  },
  { title: ui.value.colRequestId, dataIndex: 'requestId', key: 'requestId', ellipsis: true },
  { title: ui.value.colType, dataIndex: 'trigger', key: 'trigger' },
  { title: ui.value.colDesc, dataIndex: 'model', key: 'model' },
  { title: ui.value.colCredits, dataIndex: 'creditsDelta', key: 'creditsDelta', align: 'right' },
  { title: ui.value.colAction, key: 'action', width: 100, fixed: 'right' }
]);

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
