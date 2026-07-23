<template>
  <div class="credits-page">
    <ConsolePageHeader :eyebrow="ui.eyebrow" :title="ui.title" :description="ui.description">
      <template #actions>
        <a-button :disabled="rows.length === 0" @click="exportCsv">
          <template #icon><DownloadOutlined /></template>
          {{ ui.export }}
        </a-button>
        <a-button type="primary" :loading="loading" @click="loadData">
          <template #icon><ReloadOutlined /></template>
          {{ ui.refresh }}
        </a-button>
      </template>
    </ConsolePageHeader>

    <section class="metric-grid">
      <ConsoleMetricCard :label="ui.available" :value="formatNumber(overview?.credits.available)" :hint="ui.canonicalBalance">
        <template #icon><WalletOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard tone="orange" :label="ui.frozen" :value="formatNumber(overview?.credits.frozen)" :hint="ui.pendingSettlement">
        <template #icon><LockOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard tone="green" :label="ui.entries24h" :value="formatNumber(overview?.credits.ledgerEntries24h)" :hint="ui.immutableLedger">
        <template #icon><FileDoneOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard
        :tone="(overview?.credits.overdueHolds || 0) > 0 ? 'orange' : 'violet'"
        :label="ui.overdueHolds"
        :value="formatNumber(overview?.credits.overdueHolds)"
        :hint="ui.needsReview"
      >
        <template #icon><WarningOutlined /></template>
      </ConsoleMetricCard>
    </section>

    <a-card class="ledger-card">
      <div class="filter-bar">
        <a-input
          v-model:value="filters.userId"
          :placeholder="ui.userPlaceholder"
          allow-clear
          style="width: 260px"
          @press-enter="applyFilters"
        />
        <a-select
          v-model:value="filters.entryType"
          :options="entryTypeOptions"
          :placeholder="ui.typePlaceholder"
          allow-clear
          style="width: 180px"
        />
        <a-range-picker v-model:value="filters.range" show-time />
        <a-button type="primary" :loading="loading" @click="applyFilters">{{ ui.filter }}</a-button>
        <a-button @click="resetFilters">{{ ui.reset }}</a-button>
        <span class="result-count">{{ ui.total(total) }}</span>
      </div>

      <a-alert
        v-if="errorMessage"
        type="error"
        show-icon
        :message="ui.loadFailed"
        :description="errorMessage"
        style="margin: 0 16px 16px"
      />

      <a-table
        :columns="columns"
        :data-source="rows"
        row-key="id"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1180 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'user'">
            <div class="identity-cell">
              <strong>{{ record.username || record.email || record.userId }}</strong>
              <span>{{ record.email || record.userId }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'entryType'">
            <a-tag :color="entryColor(record.entryType)">{{ entryLabel(record.entryType) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'availableDelta'">
            <span :class="deltaClass(record.deltaAvailable)">{{ signed(record.deltaAvailable) }}</span>
          </template>
          <template v-else-if="column.key === 'frozenDelta'">
            <span :class="deltaClass(record.deltaFrozen)">{{ signed(record.deltaFrozen) }}</span>
          </template>
          <template v-else-if="column.key === 'balance'">
            <div class="balance-cell">
              <strong>{{ formatNumber(record.balanceAvailable) }}</strong>
              <small>{{ ui.frozenShort }} {{ formatNumber(record.balanceFrozen) }}</small>
            </div>
          </template>
          <template v-else-if="column.key === 'reference'">
            <div class="reference-cell">
              <strong>{{ record.referenceType || '-' }}</strong>
              <span>{{ record.referenceId || '-' }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            {{ formatDate(record.createdAt) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  DownloadOutlined,
  FileDoneOutlined,
  LockOutlined,
  ReloadOutlined,
  WalletOutlined,
  WarningOutlined
} from '@ant-design/icons-vue';
import { storeToRefs } from 'pinia';
import ConsoleMetricCard from '@/console/components/ConsoleMetricCard.vue';
import ConsolePageHeader from '@/console/components/ConsolePageHeader.vue';
import { useConsoleStore } from '@/stores/console';
import { useLanguageStore } from '@/stores/language';

const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loading = ref(false);
const errorMessage = ref('');
const currentPage = ref(1);
const pageSize = ref(50);
const filters = reactive<{ userId: string; entryType?: string; range: any[] | null }>({
  userId: '',
  entryType: undefined,
  range: null
});

const rows = computed(() => consoleStore.adminCreditLedger);
const total = computed(() => consoleStore.adminCreditLedgerTotal);
const overview = computed(() => consoleStore.adminOverview);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        eyebrow: 'Wallet ledger',
        title: '点数账本',
        description: '以不可篡改的 PostgreSQL 钱包流水为准，核对发放、扣费、冻结、结算与退款。',
        export: '导出当前页',
        refresh: '刷新账本',
        available: '全站可用点数',
        frozen: '全站冻结点数',
        entries24h: '24 小时流水',
        overdueHolds: '逾期冻结',
        canonicalBalance: '来自 wallets 当前余额',
        pendingSettlement: '等待生成任务结算',
        immutableLedger: 'wallet_ledger 仅追加',
        needsReview: '大于 0 时需要处理',
        userPlaceholder: '用户 ID / 邮箱 / 用户名',
        typePlaceholder: '流水类型',
        filter: '筛选',
        reset: '重置',
        total: (count: number) => `共 ${count.toLocaleString()} 条`,
        loadFailed: '点数账本加载失败',
        user: '用户',
        type: '流水类型',
        availableDelta: '可用变动',
        frozenDelta: '冻结变动',
        balance: '变动后余额',
        reference: '业务引用',
        time: '时间',
        frozenShort: '冻结',
        purchase: '购买入账',
        charge: '任务扣费',
        hold: '冻结',
        release: '释放',
        refund: '退款',
        adjustment: '人工调整',
        migration: '迁移入账'
      }
    : {
        eyebrow: 'Wallet ledger',
        title: 'Credit ledger',
        description: 'Canonical, append-only PostgreSQL entries for grants, charges, holds, settlement, and refunds.',
        export: 'Export page',
        refresh: 'Refresh ledger',
        available: 'Available credits',
        frozen: 'Frozen credits',
        entries24h: 'Entries · 24h',
        overdueHolds: 'Overdue holds',
        canonicalBalance: 'Current wallets balance',
        pendingSettlement: 'Pending task settlement',
        immutableLedger: 'Append-only wallet_ledger',
        needsReview: 'Review when above zero',
        userPlaceholder: 'User ID / email / username',
        typePlaceholder: 'Entry type',
        filter: 'Filter',
        reset: 'Reset',
        total: (count: number) => `${count.toLocaleString()} entries`,
        loadFailed: 'Failed to load credit ledger',
        user: 'User',
        type: 'Entry type',
        availableDelta: 'Available delta',
        frozenDelta: 'Frozen delta',
        balance: 'Balance after',
        reference: 'Reference',
        time: 'Time',
        frozenShort: 'Frozen',
        purchase: 'Purchase',
        charge: 'Charge',
        hold: 'Hold',
        release: 'Release',
        refund: 'Refund',
        adjustment: 'Adjustment',
        migration: 'Migration'
      }
);

const entryTypeOptions = computed(() => [
  { label: ui.value.purchase, value: 'purchase' },
  { label: ui.value.charge, value: 'charge' },
  { label: ui.value.hold, value: 'hold' },
  { label: ui.value.release, value: 'release' },
  { label: ui.value.refund, value: 'refund' },
  { label: ui.value.adjustment, value: 'admin_adjustment' },
  { label: ui.value.migration, value: 'migration' }
]);
const columns = computed(() => [
  { title: ui.value.user, key: 'user', width: 220, fixed: 'left' },
  { title: ui.value.type, key: 'entryType', width: 150 },
  { title: ui.value.availableDelta, key: 'availableDelta', width: 120 },
  { title: ui.value.frozenDelta, key: 'frozenDelta', width: 120 },
  { title: ui.value.balance, key: 'balance', width: 140 },
  { title: ui.value.reference, key: 'reference', width: 230 },
  { title: ui.value.time, key: 'createdAt', width: 175 }
]);
const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['20', '50', '100'],
  showTotal: (count: number) => ui.value.total(count)
}));

const formatNumber = (value?: number) => Number(value || 0).toLocaleString();
const formatDate = (value?: number) => (value ? new Date(value).toLocaleString() : '-');
const signed = (value: number) => `${value > 0 ? '+' : ''}${formatNumber(value)}`;
const deltaClass = (value: number) =>
  value > 0 ? 'delta-positive' : value < 0 ? 'delta-negative' : 'delta-zero';
const entryLabel = (type: string) => {
  const key = String(type || '').toLowerCase();
  if (key.includes('purchase')) return ui.value.purchase;
  if (key.includes('charge')) return ui.value.charge;
  if (key.includes('hold')) return ui.value.hold;
  if (key.includes('release')) return ui.value.release;
  if (key.includes('refund')) return ui.value.refund;
  if (key.includes('adjust')) return ui.value.adjustment;
  if (key.includes('migration')) return ui.value.migration;
  return type || '-';
};
const entryColor = (type: string) => {
  const key = String(type || '').toLowerCase();
  if (key.includes('refund') || key.includes('purchase') || key.includes('migration')) return 'green';
  if (key.includes('charge')) return 'red';
  if (key.includes('hold')) return 'orange';
  return 'blue';
};
const dateValue = (value: any) => {
  if (!value) return undefined;
  if (typeof value.toISOString === 'function') return value.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

const loadData = async () => {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  const from = dateValue(filters.range?.[0]);
  const to = dateValue(filters.range?.[1]);
  const results = await Promise.allSettled([
    consoleStore.fetchAdminOverview(),
    consoleStore.fetchAdminCreditLedger({
      userId: filters.userId,
      entryType: filters.entryType,
      from,
      to,
      limit: pageSize.value,
      offset: (currentPage.value - 1) * pageSize.value
    })
  ]);
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
  if (rejected) errorMessage.value = String(rejected.reason?.message || rejected.reason);
  loading.value = false;
};
const applyFilters = () => {
  currentPage.value = 1;
  void loadData();
};
const resetFilters = () => {
  filters.userId = '';
  filters.entryType = undefined;
  filters.range = null;
  currentPage.value = 1;
  void loadData();
};
const handleTableChange = (page: any) => {
  currentPage.value = Number(page?.current || 1);
  pageSize.value = Number(page?.pageSize || 50);
  void loadData();
};
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const exportCsv = () => {
  const header = ['id', 'userId', 'entryType', 'deltaAvailable', 'deltaFrozen', 'balanceAvailable', 'balanceFrozen', 'referenceType', 'referenceId', 'createdAt'];
  const lines = [
    header.join(','),
    ...rows.value.map((row) =>
      header.map((key) => csvCell(key === 'createdAt' ? new Date(row.createdAt).toISOString() : (row as any)[key])).join(',')
    )
  ];
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `artigen-credit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

onMounted(loadData);
</script>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.ledger-card {
  margin-top: 14px;
}

.ledger-card :deep(.ant-card-body) {
  padding: 0;
}

.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 15px 16px;
  border-bottom: 1px solid #edf0f4;
}

.result-count {
  margin-left: auto;
  color: #8993a6;
  font-size: 11px;
}

.identity-cell,
.balance-cell,
.reference-cell {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.identity-cell strong,
.balance-cell strong,
.reference-cell strong {
  overflow: hidden;
  color: #2d394f;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-cell span,
.balance-cell small,
.reference-cell span {
  overflow: hidden;
  color: #939cad;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delta-positive {
  color: #16865b;
  font-weight: 750;
}

.delta-negative {
  color: #d15449;
  font-weight: 750;
}

.delta-zero {
  color: #8d96a7;
}

@media (max-width: 1050px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }

  .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-bar :deep(.ant-input-affix-wrapper),
  .filter-bar :deep(.ant-select),
  .filter-bar :deep(.ant-picker) {
    width: 100% !important;
  }

  .result-count {
    margin-left: 0;
  }
}
</style>
