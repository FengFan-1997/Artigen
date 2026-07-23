<template>
  <div class="audit-page">
    <ConsolePageHeader :eyebrow="ui.eyebrow" :title="ui.title" :description="ui.description">
      <template #actions>
        <a-button type="primary" :loading="loading" @click="loadData">
          <template #icon><ReloadOutlined /></template>
          {{ ui.refresh }}
        </a-button>
      </template>
    </ConsolePageHeader>

    <section class="audit-overview">
      <div>
        <span class="overview-icon"><AuditOutlined /></span>
        <span><small>{{ ui.audit24h }}</small><strong>{{ formatNumber(overview?.audit.events24h) }}</strong></span>
      </div>
      <div>
        <span class="overview-icon overview-icon--blue"><SafetyCertificateOutlined /></span>
        <span><small>{{ ui.rateLimitBuckets }}</small><strong>{{ formatNumber(rateStats?.totalBuckets) }}</strong></span>
      </div>
      <div>
        <span class="overview-icon overview-icon--green"><DatabaseOutlined /></span>
        <span><small>{{ ui.source }}</small><strong>PostgreSQL</strong></span>
      </div>
      <div>
        <span class="overview-icon overview-icon--orange"><ClockCircleOutlined /></span>
        <span><small>{{ ui.updated }}</small><strong>{{ formatDate(overview?.generatedAt) }}</strong></span>
      </div>
    </section>

    <a-card class="audit-card">
      <div class="filter-bar">
        <a-input v-model:value="filters.actor" :placeholder="ui.actorPlaceholder" allow-clear style="width: 230px" />
        <a-input v-model:value="filters.eventType" :placeholder="ui.eventPlaceholder" allow-clear style="width: 230px" />
        <a-input v-model:value="filters.targetType" :placeholder="ui.targetPlaceholder" allow-clear style="width: 180px" />
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
        :scroll="{ x: 1200 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'event'">
            <div class="event-cell">
              <span class="event-dot"></span>
              <span>
                <strong>{{ record.eventType }}</strong>
                <small>{{ eventDescription(record) }}</small>
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'actor'">
            <div class="stack-cell">
              <strong>{{ record.actorName || 'system' }}</strong>
              <small>{{ record.actorId }}</small>
            </div>
          </template>
          <template v-else-if="column.key === 'target'">
            <div class="stack-cell">
              <strong>{{ record.targetType || 'system' }}</strong>
              <small>{{ record.targetId || '-' }}</small>
            </div>
          </template>
          <template v-else-if="column.key === 'requestId'"><span class="mono">{{ record.requestId || '-' }}</span></template>
          <template v-else-if="column.key === 'metadata'">
            <a-popover v-if="record.metadata && Object.keys(record.metadata).length" trigger="click">
              <template #content><pre class="metadata-pre">{{ pretty(record.metadata) }}</pre></template>
              <a-button type="link" size="small">{{ ui.inspect }}</a-button>
            </a-popover>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'time'">{{ formatDate(record.createdAt) }}</template>
        </template>
      </a-table>
    </a-card>

    <a-card class="rate-card">
      <template #title><span class="card-title">{{ ui.rateLimitTitle }}</span></template>
      <div v-if="rateStats?.topTags?.length" class="rate-list">
        <div v-for="item in rateStats.topTags" :key="item.tag" class="rate-row">
          <span class="mono">{{ item.tag }}</span>
          <span class="rate-track"><i :style="{ width: `${rateWidth(item.buckets)}%` }"></i></span>
          <strong>{{ item.buckets.toLocaleString() }}</strong>
        </div>
      </div>
      <a-empty v-else :description="ui.noRateData" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  AuditOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons-vue';
import { storeToRefs } from 'pinia';
import ConsolePageHeader from '@/console/components/ConsolePageHeader.vue';
import { useConsoleStore, type AdminDatabaseAuditEvent } from '@/stores/console';
import { useLanguageStore } from '@/stores/language';

const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loading = ref(false);
const errorMessage = ref('');
const currentPage = ref(1);
const pageSize = ref(50);
const filters = reactive<{ actor: string; eventType: string; targetType: string; range: any[] | null }>({
  actor: '',
  eventType: '',
  targetType: '',
  range: null
});

const rows = computed(() => consoleStore.adminDatabaseAudit);
const total = computed(() => consoleStore.adminDatabaseAuditTotal);
const overview = computed(() => consoleStore.adminOverview);
const rateStats = computed(() => consoleStore.adminRateLimitStats);
const maxRate = computed(() => Math.max(1, ...(rateStats.value?.topTags?.map((item) => item.buckets) || [1])));

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        eyebrow: 'Accountability',
        title: '系统审计日志',
        description: '追踪管理员和系统敏感操作，保留操作者、目标、请求编号与结构化变更元数据。',
        refresh: '刷新日志',
        audit24h: '24 小时审计事件',
        rateLimitBuckets: '限流桶',
        source: '权威数据源',
        updated: '统计更新时间',
        actorPlaceholder: '操作者 ID / 邮箱 / 用户名',
        eventPlaceholder: '事件类型，例如 admin.user.status_changed',
        targetPlaceholder: '目标类型，例如 user',
        filter: '筛选',
        reset: '重置',
        total: (count: number) => `共 ${count.toLocaleString()} 条`,
        loadFailed: '审计日志加载失败',
        event: '事件',
        actor: '操作者',
        target: '目标',
        requestId: '请求编号',
        metadata: '变更详情',
        time: '发生时间',
        inspect: '查看',
        rateLimitTitle: '当前限流热点',
        noRateData: '暂无限流数据'
      }
    : {
        eyebrow: 'Accountability',
        title: 'System audit log',
        description: 'Trace sensitive administrator and system activity with actor, target, request ID, and structured change metadata.',
        refresh: 'Refresh logs',
        audit24h: 'Audit events · 24h',
        rateLimitBuckets: 'Rate-limit buckets',
        source: 'Canonical source',
        updated: 'Stats updated',
        actorPlaceholder: 'Actor ID / email / username',
        eventPlaceholder: 'Event type, e.g. admin.user.status_changed',
        targetPlaceholder: 'Target type, e.g. user',
        filter: 'Filter',
        reset: 'Reset',
        total: (count: number) => `${count.toLocaleString()} events`,
        loadFailed: 'Failed to load audit events',
        event: 'Event',
        actor: 'Actor',
        target: 'Target',
        requestId: 'Request ID',
        metadata: 'Changes',
        time: 'Time',
        inspect: 'Inspect',
        rateLimitTitle: 'Current rate-limit hotspots',
        noRateData: 'No rate-limit data'
      }
);

const columns = computed(() => [
  { title: ui.value.event, key: 'event', width: 300, fixed: 'left' },
  { title: ui.value.actor, key: 'actor', width: 190 },
  { title: ui.value.target, key: 'target', width: 210 },
  { title: ui.value.requestId, key: 'requestId', width: 200 },
  { title: ui.value.metadata, key: 'metadata', width: 100 },
  { title: ui.value.time, key: 'time', width: 175 }
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
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const rateWidth = (value: number) => Math.max(3, (value / maxRate.value) * 100);
const eventDescription = (event: AdminDatabaseAuditEvent) => {
  const metadata = event.metadata || {};
  if (metadata.from !== undefined || metadata.to !== undefined)
    return `${String(metadata.from ?? '-')} → ${String(metadata.to ?? '-')}`;
  return event.targetType || 'system';
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
  const results = await Promise.allSettled([
    consoleStore.fetchAdminOverview(),
    consoleStore.fetchAdminRateLimitStats(),
    consoleStore.fetchAdminDatabaseAudit({
      actor: filters.actor,
      eventType: filters.eventType,
      targetType: filters.targetType,
      from: dateValue(filters.range?.[0]),
      to: dateValue(filters.range?.[1]),
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
  filters.actor = '';
  filters.eventType = '';
  filters.targetType = '';
  filters.range = null;
  currentPage.value = 1;
  void loadData();
};
const handleTableChange = (page: any) => {
  currentPage.value = Number(page?.current || 1);
  pageSize.value = Number(page?.pageSize || 50);
  void loadData();
};

onMounted(loadData);
</script>

<style scoped>
.audit-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 14px;
  border: 1px solid #e6eaf0;
  border-radius: 13px;
  background: #fff;
}

.audit-overview > div {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 16px 18px;
  border-right: 1px solid #edf0f4;
}

.audit-overview > div:last-child {
  border-right: 0;
}

.overview-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: #7653cf;
  background: #f2edff;
}

.overview-icon--blue {
  color: #3159df;
  background: #edf1ff;
}

.overview-icon--green {
  color: #16845a;
  background: #e9f8f1;
}

.overview-icon--orange {
  color: #b36b14;
  background: #fff3e2;
}

.audit-overview > div > span:last-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.audit-overview small {
  color: #8993a5;
  font-size: 9px;
}

.audit-overview strong {
  overflow: hidden;
  color: #27334a;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-card :deep(.ant-card-body) {
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

.event-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.event-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5474e6;
  box-shadow: 0 0 0 4px #edf1ff;
}

.event-cell > span:last-child,
.stack-cell {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.event-cell strong,
.stack-cell strong {
  overflow: hidden;
  color: #2e394f;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-cell small,
.stack-cell small {
  overflow: hidden;
  color: #939cad;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  display: inline-block;
  max-width: 230px;
  overflow: hidden;
  color: #657087;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.metadata-pre {
  max-width: 420px;
  max-height: 320px;
  margin: 0;
  overflow: auto;
  font-size: 11px;
}

.rate-card {
  margin-top: 14px;
}

.card-title {
  color: #27334a;
  font-size: 14px;
}

.rate-list {
  display: grid;
  gap: 13px;
}

.rate-row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 70px;
  align-items: center;
  gap: 12px;
}

.rate-track {
  height: 6px;
  overflow: hidden;
  border-radius: 4px;
  background: #edf0f5;
}

.rate-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3159df, #9176e4);
}

.rate-row strong {
  color: #4d586e;
  font-size: 11px;
  text-align: right;
}

@media (max-width: 980px) {
  .audit-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-overview > div:nth-child(2) {
    border-right: 0;
  }

  .audit-overview > div:nth-child(n + 3) {
    border-top: 1px solid #edf0f4;
  }
}

@media (max-width: 650px) {
  .audit-overview {
    grid-template-columns: 1fr;
  }

  .audit-overview > div {
    border-right: 0;
    border-bottom: 1px solid #edf0f4;
  }

  .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-bar :deep(.ant-input-affix-wrapper),
  .filter-bar :deep(.ant-input),
  .filter-bar :deep(.ant-picker) {
    width: 100% !important;
  }

  .result-count {
    margin-left: 0;
  }

  .rate-row {
    grid-template-columns: minmax(100px, 0.8fr) minmax(0, 1fr) 45px;
  }
}
</style>
