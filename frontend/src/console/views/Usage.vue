<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-card>
      <div style="margin-bottom: 16px; display: flex; gap: 16px; flex-wrap: wrap">
        <a-input v-model:value="filterUserId" :placeholder="ui.userFilterPh" style="width: 240px" />
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
          <template v-if="column.key === 'modelTag'">
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
import { useConsoleStore } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { message } from 'ant-design-vue';

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
        userId: '用户 ID',
        model: '模型',
        cost: '消耗',
        credits: '点数',
        tokens: 'Tokens',
        inLabel: '输入',
        outLabel: '输出',
        rawData: '原始数据',
        colTime: '时间',
        colUserId: '用户 ID',
        colRequestId: '请求 ID',
        colType: '类型',
        colDesc: '描述',
        colCredits: '点数',
        colAction: '操作',
        userFilterPh: '可选：按用户 ID 过滤'
      }
    : {
        title: 'Usage History',
        filter: 'Filter',
        details: 'Details',
        usageDetails: 'Usage Details',
        requestId: 'Request ID',
        time: 'Time',
        userId: 'User ID',
        model: 'Model',
        cost: 'Cost',
        credits: 'Credits',
        tokens: 'Tokens',
        inLabel: 'In',
        outLabel: 'Out',
        rawData: 'Raw Data',
        colTime: 'Time',
        colUserId: 'User ID',
        colRequestId: 'Request ID',
        colType: 'Type',
        colDesc: 'Description',
        colCredits: 'Credits',
        colAction: 'Action',
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

const loading = ref(false);
const dateRange = ref<any[]>([]);
const filterUserId = ref('');
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
  { title: ui.value.colUserId, dataIndex: 'userId', key: 'userId', width: 180, ellipsis: true },
  { title: ui.value.colRequestId, dataIndex: 'requestId', key: 'requestId', ellipsis: true },
  { title: ui.value.colType, dataIndex: 'trigger', key: 'trigger' },
  { title: ui.value.colDesc, dataIndex: 'model', key: 'modelTag' },
  { title: ui.value.colCredits, dataIndex: 'creditsDelta', key: 'creditsDelta', align: 'right' },
  { title: ui.value.colAction, key: 'action', width: 100, fixed: 'right' }
]);

const items = computed(() => {
  return consoleStore.adminUsage;
});

onMounted(() => {
  consoleStore.init();
  void fetchUsage();
});

const fetchUsage = async () => {
  if (loading.value) return;
  loading.value = true;
  try {
    const offset = (pagination.value.current - 1) * pagination.value.pageSize;
    const from = dateRange.value?.[0]?.valueOf ? dateRange.value[0].valueOf() : undefined;
    const to = dateRange.value?.[1]?.valueOf ? dateRange.value[1].valueOf() : undefined;
    await consoleStore.fetchAdminUsageLedger({
      userId: filterUserId.value,
      from,
      to,
      limit: pagination.value.pageSize,
      offset
    });
    pagination.value.total = consoleStore.adminUsageTotal;
  } catch (e) {
    showAdminError(e);
  } finally {
    loading.value = false;
  }
};

const handleTableChange = (pag: any) => {
  pagination.value.current = pag.current;
  pagination.value.pageSize = pag.pageSize;
  void fetchUsage();
};

const showDetails = (record: any) => {
  currentRecord.value = record;
  detailsVisible.value = true;
};
</script>
