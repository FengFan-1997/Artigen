<template>
  <div class="behavior-page">
    <ConsolePageHeader :eyebrow="ui.eyebrow" :title="ui.title" :description="ui.description">
      <template #actions>
        <a-select v-model:value="days" :options="dayOptions" style="width: 120px" @change="loadData" />
        <a-button type="primary" :loading="loading" @click="loadData">
          <template #icon><ReloadOutlined /></template>
          {{ ui.refresh }}
        </a-button>
      </template>
    </ConsolePageHeader>

    <a-alert class="privacy-note" type="info" show-icon :message="ui.privacyTitle" :description="ui.privacyDescription" />

    <section class="metric-grid">
      <ConsoleMetricCard :label="ui.events" :value="formatNumber(summary?.totals.events)" :hint="ui.selectedPeriod">
        <template #icon><RadarChartOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard tone="violet" :label="ui.pageViews" :value="formatNumber(summary?.totals.pageViews)" :hint="ui.navigationEvents">
        <template #icon><EyeOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard tone="green" :label="ui.clicks" :value="formatNumber(summary?.totals.clicks)" :hint="ui.stableActionKeys">
        <template #icon><AimOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard tone="orange" :label="ui.activeUsers" :value="formatNumber(summary?.totals.activeUsers)" :hint="ui.authAndAnonymous">
        <template #icon><TeamOutlined /></template>
      </ConsoleMetricCard>
    </section>

    <section class="insight-grid">
      <a-card>
        <template #title><span class="card-title">{{ ui.dailyTrend }}</span></template>
        <div v-if="dailyRows.length" class="daily-chart">
          <div v-for="row in dailyRows" :key="row.day" class="daily-column">
            <div class="daily-bars">
              <i class="daily-view" :style="{ height: `${height(row.pageViews)}%` }"></i>
              <i class="daily-click" :style="{ height: `${height(row.clicks)}%` }"></i>
            </div>
            <span>{{ row.day.slice(5).replace('-', '/') }}</span>
          </div>
        </div>
        <a-empty v-else :description="ui.noData" />
        <div class="legend">
          <span><i class="legend-view"></i>{{ ui.pageViews }}</span>
          <span><i class="legend-click"></i>{{ ui.clicks }}</span>
        </div>
      </a-card>

      <a-card>
        <template #title><span class="card-title">{{ ui.topPages }}</span></template>
        <RankList :items="summary?.topPages || []" empty-text="暂无页面访问" />
      </a-card>

      <a-card>
        <template #title><span class="card-title">{{ ui.topActions }}</span></template>
        <RankList :items="summary?.topActions || []" empty-text="暂无点击操作" />
      </a-card>
    </section>

    <a-card class="events-card">
      <div class="filter-bar">
        <a-input v-model:value="filters.userId" :placeholder="ui.userPlaceholder" allow-clear style="width: 240px" />
        <a-select
          v-model:value="filters.eventType"
          :options="eventOptions"
          :placeholder="ui.eventPlaceholder"
          allow-clear
          style="width: 150px"
        />
        <a-input v-model:value="filters.path" :placeholder="ui.pathPlaceholder" allow-clear style="width: 220px" />
        <a-input v-model:value="filters.action" :placeholder="ui.actionPlaceholder" allow-clear style="width: 210px" />
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
        row-key="eventId"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1260 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'event'">
            <div class="event-cell">
              <span class="event-icon" :class="`event-icon--${record.eventType}`">
                <EyeOutlined v-if="record.eventType === 'page_view'" />
                <AimOutlined v-else-if="record.eventType === 'ui_click'" />
                <RadarChartOutlined v-else />
              </span>
              <span>
                <strong>{{ eventLabel(record.eventType) }}</strong>
                <small>{{ record.category }}</small>
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'user'">
            <div class="user-cell">
              <strong>{{ record.username || record.email || ui.anonymous }}</strong>
              <small>{{ record.userId || record.userRef || '-' }}</small>
            </div>
          </template>
          <template v-else-if="column.key === 'path'"><span class="mono">{{ record.path || '-' }}</span></template>
          <template v-else-if="column.key === 'action'"><span class="mono">{{ record.action || '-' }}</span></template>
          <template v-else-if="column.key === 'element'">{{ record.element || '-' }}</template>
          <template v-else-if="column.key === 'time'">{{ formatDate(record.ts) }}</template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue';
import { AimOutlined, EyeOutlined, RadarChartOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons-vue';
import { Empty } from 'ant-design-vue';
import { storeToRefs } from 'pinia';
import ConsoleMetricCard from '@/console/components/ConsoleMetricCard.vue';
import ConsolePageHeader from '@/console/components/ConsolePageHeader.vue';
import { useConsoleStore } from '@/stores/console';
import { useLanguageStore } from '@/stores/language';

const RankList = defineComponent({
  props: {
    items: { type: Array as () => Array<{ key: string; count: number }>, required: true },
    emptyText: { type: String, required: true }
  },
  setup(props) {
    return () => {
      if (!props.items.length) return h(Empty, { description: props.emptyText });
      const max = Math.max(1, ...props.items.map((item) => item.count));
      return h(
        'div',
        { class: 'rank-list' },
        props.items.slice(0, 8).map((item, index) =>
          h('div', { class: 'rank-row', key: item.key }, [
            h('span', { class: 'rank-number' }, String(index + 1).padStart(2, '0')),
            h('div', { class: 'rank-copy' }, [
              h('strong', item.key),
              h('span', { class: 'rank-track' }, [
                h('i', { style: { width: `${Math.max(3, (item.count / max) * 100)}%` } })
              ])
            ]),
            h('b', item.count.toLocaleString())
          ])
        )
      );
    };
  }
});

const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loading = ref(false);
const errorMessage = ref('');
const days = ref(14);
const currentPage = ref(1);
const pageSize = ref(50);
const filters = reactive({ userId: '', eventType: undefined as string | undefined, path: '', action: '' });

const summary = computed(() => consoleStore.adminBehaviorSummary);
const rows = computed(() => consoleStore.adminBehaviorEvents);
const total = computed(() => consoleStore.adminBehaviorTotal);
const dailyRows = computed(() => summary.value?.daily || []);
const maxDaily = computed(() => Math.max(1, ...dailyRows.value.flatMap((row) => [row.pageViews, row.clicks])));

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        eyebrow: 'Product analytics',
        title: '用户行为轨迹',
        description: '按用户、页面和稳定操作标识回看访问与点击，用于产品分析、故障定位和安全审计。',
        refresh: '刷新行为',
        privacyTitle: '隐私边界',
        privacyDescription: '只记录页面路径、稳定操作标识、时间和匿名化设备信息；不采集输入文字、提示词、图片地址、密码或密钥。默认保留 90 天。',
        events: '行为事件',
        pageViews: '页面访问',
        clicks: '界面点击',
        activeUsers: '活跃用户',
        selectedPeriod: '所选时间范围',
        navigationEvents: '页面路由访问',
        stableActionKeys: '不包含按钮文案',
        authAndAnonymous: '登录与匿名访客',
        dailyTrend: '每日行为趋势',
        topPages: '热门页面',
        topActions: '热门操作',
        noData: '暂时没有行为数据',
        userPlaceholder: '用户 ID / 邮箱 / 用户名',
        eventPlaceholder: '事件类型',
        pathPlaceholder: '页面路径，例如 /artigen',
        actionPlaceholder: '操作标识，例如 nav:market',
        filter: '筛选',
        reset: '重置',
        total: (count: number) => `共 ${count.toLocaleString()} 条`,
        loadFailed: '行为数据加载失败',
        event: '事件',
        user: '用户',
        page: '页面',
        action: '操作标识',
        element: '元素',
        device: '设备',
        time: '时间',
        anonymous: '匿名访客',
        pageView: '页面访问',
        click: '界面点击',
        sevenDays: '最近 7 天',
        fourteenDays: '最近 14 天',
        thirtyDays: '最近 30 天',
        ninetyDays: '最近 90 天'
      }
    : {
        eyebrow: 'Product analytics',
        title: 'User behavior',
        description: 'Trace visits and stable action identifiers by user and page for product analysis, debugging, and security.',
        refresh: 'Refresh',
        privacyTitle: 'Privacy boundary',
        privacyDescription: 'Only page paths, stable action keys, time, and anonymized device metadata are collected. No input text, prompts, image URLs, passwords, or secrets. Retention defaults to 90 days.',
        events: 'Events',
        pageViews: 'Page views',
        clicks: 'UI clicks',
        activeUsers: 'Active users',
        selectedPeriod: 'Selected period',
        navigationEvents: 'Route navigation',
        stableActionKeys: 'No button text',
        authAndAnonymous: 'Authenticated and anonymous',
        dailyTrend: 'Daily behavior',
        topPages: 'Top pages',
        topActions: 'Top actions',
        noData: 'No behavior data yet',
        userPlaceholder: 'User ID / email / username',
        eventPlaceholder: 'Event type',
        pathPlaceholder: 'Path, e.g. /artigen',
        actionPlaceholder: 'Action key, e.g. nav:market',
        filter: 'Filter',
        reset: 'Reset',
        total: (count: number) => `${count.toLocaleString()} events`,
        loadFailed: 'Failed to load behavior',
        event: 'Event',
        user: 'User',
        page: 'Page',
        action: 'Action key',
        element: 'Element',
        device: 'Device',
        time: 'Time',
        anonymous: 'Anonymous visitor',
        pageView: 'Page view',
        click: 'UI click',
        sevenDays: 'Last 7 days',
        fourteenDays: 'Last 14 days',
        thirtyDays: 'Last 30 days',
        ninetyDays: 'Last 90 days'
      }
);

const dayOptions = computed(() => [
  { label: ui.value.sevenDays, value: 7 },
  { label: ui.value.fourteenDays, value: 14 },
  { label: ui.value.thirtyDays, value: 30 },
  { label: ui.value.ninetyDays, value: 90 }
]);
const eventOptions = computed(() => [
  { label: ui.value.pageView, value: 'page_view' },
  { label: ui.value.click, value: 'ui_click' }
]);
const columns = computed(() => [
  { title: ui.value.event, key: 'event', width: 160, fixed: 'left' },
  { title: ui.value.user, key: 'user', width: 210 },
  { title: ui.value.page, key: 'path', width: 240 },
  { title: ui.value.action, key: 'action', width: 220 },
  { title: ui.value.element, key: 'element', width: 110 },
  { title: ui.value.device, dataIndex: 'deviceCategory', key: 'device', width: 100 },
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
const height = (value: number) => Math.max(value ? 6 : 0, (value / maxDaily.value) * 94);
const eventLabel = (type: string) => (type === 'page_view' ? ui.value.pageView : type === 'ui_click' ? ui.value.click : type);

const loadData = async () => {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  const results = await Promise.allSettled([
    consoleStore.fetchAdminBehaviorSummary(days.value),
    consoleStore.fetchAdminBehaviorEvents({
      userId: filters.userId,
      eventType: filters.eventType,
      path: filters.path,
      action: filters.action,
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
  filters.eventType = undefined;
  filters.path = '';
  filters.action = '';
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
.privacy-note {
  margin-bottom: 14px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.insight-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) repeat(2, minmax(260px, 0.8fr));
  gap: 14px;
  margin-top: 14px;
}

.card-title {
  color: #27334a;
  font-size: 14px;
}

.daily-chart {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12px, 1fr));
  gap: 5px;
  height: 220px;
}

.daily-column {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 7px;
  min-width: 0;
}

.daily-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  border-bottom: 1px solid #edf0f4;
}

.daily-bars i {
  width: min(7px, 38%);
  border-radius: 4px 4px 1px 1px;
}

.daily-view,
.legend-view {
  background: #3159df;
}

.daily-click,
.legend-click {
  background: #9c7ce8;
}

.daily-column > span {
  color: #9ba4b3;
  font-size: 8px;
  text-align: center;
}

.legend {
  display: flex;
  gap: 15px;
  margin-top: 12px;
  color: #7b8699;
  font-size: 10px;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

:deep(.rank-list) {
  display: grid;
  gap: 16px;
}

:deep(.rank-row) {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

:deep(.rank-number) {
  color: #a0a8b7;
  font-size: 9px;
}

:deep(.rank-copy) {
  display: grid;
  min-width: 0;
  gap: 6px;
}

:deep(.rank-copy strong) {
  overflow: hidden;
  color: #3c475c;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.rank-track) {
  height: 4px;
  overflow: hidden;
  border-radius: 3px;
  background: #edf0f5;
}

:deep(.rank-track i) {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3159df, #8d75df);
}

:deep(.rank-row b) {
  color: #566176;
  font-size: 10px;
}

.events-card {
  margin-top: 14px;
}

.events-card :deep(.ant-card-body) {
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
  gap: 9px;
}

.event-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #3159df;
  background: #edf1ff;
}

.event-icon--ui_click {
  color: #7a55cd;
  background: #f2edff;
}

.event-cell > span:last-child,
.user-cell {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.event-cell strong,
.user-cell strong {
  overflow: hidden;
  color: #2d394f;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-cell small,
.user-cell small {
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

@media (max-width: 1250px) {
  .insight-grid {
    grid-template-columns: 1fr 1fr;
  }

  .insight-grid > :first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 1000px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 650px) {
  .metric-grid,
  .insight-grid {
    grid-template-columns: 1fr;
  }

  .insight-grid > :first-child {
    grid-column: auto;
  }

  .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-bar :deep(.ant-input-affix-wrapper),
  .filter-bar :deep(.ant-input),
  .filter-bar :deep(.ant-select) {
    width: 100% !important;
  }

  .result-count {
    margin-left: 0;
  }
}
</style>
