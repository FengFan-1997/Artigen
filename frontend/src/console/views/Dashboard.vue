<template>
  <div class="dashboard-page">
    <ConsolePageHeader :eyebrow="ui.eyebrow" :title="ui.title" :description="ui.description">
      <template #actions>
        <a-button :loading="loading" @click="loadDashboard">
          <template #icon><ReloadOutlined /></template>
          {{ ui.refresh }}
        </a-button>
        <a-button type="primary" @click="router.push('/console/users')">
          {{ ui.manageUsers }}
          <ArrowRightOutlined />
        </a-button>
      </template>
    </ConsolePageHeader>

    <a-alert
      v-if="errorMessage"
      class="dashboard-alert"
      type="error"
      show-icon
      :message="ui.loadFailed"
      :description="errorMessage"
    />

    <section class="metric-grid">
      <ConsoleMetricCard
        :label="ui.totalUsers"
        :value="formatNumber(overview?.users.total)"
        :hint="ui.newUsers(overview?.users.new7d || 0)"
      >
        <template #icon><TeamOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard
        tone="violet"
        :label="ui.availableCredits"
        :value="formatNumber(overview?.credits.available)"
        :hint="ui.frozenCredits(overview?.credits.frozen || 0)"
      >
        <template #icon><WalletOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard
        tone="green"
        :label="ui.behaviorEvents"
        :value="formatNumber(overview?.behavior.events24h)"
        :hint="ui.behaviorDetail(overview?.behavior.pageViews24h || 0, overview?.behavior.clicks24h || 0)"
      >
        <template #icon><UserSwitchOutlined /></template>
      </ConsoleMetricCard>
      <ConsoleMetricCard
        tone="orange"
        :label="ui.generationTasks"
        :value="formatNumber(overview?.generation.tasks24h)"
        :hint="ui.generationDetail(overview?.generation.success24h || 0, overview?.generation.failed24h || 0)"
      >
        <template #icon><ThunderboltOutlined /></template>
      </ConsoleMetricCard>
    </section>

    <section class="health-strip">
      <div>
        <span>{{ ui.activeUsers24h }}</span>
        <strong>{{ formatNumber(overview?.users.active24h) }}</strong>
      </div>
      <div>
        <span>{{ ui.ledger24h }}</span>
        <strong>{{ formatNumber(overview?.credits.ledgerEntries24h) }}</strong>
      </div>
      <div>
        <span>{{ ui.orders7d }}</span>
        <strong>{{ formatNumber(overview?.commerce.orders7d) }}</strong>
      </div>
      <div>
        <span>{{ ui.audit24h }}</span>
        <strong>{{ formatNumber(overview?.audit.events24h) }}</strong>
      </div>
      <div :class="{ 'health-warning': (overview?.credits.overdueHolds || 0) > 0 }">
        <span>{{ ui.overdueHolds }}</span>
        <strong>{{ formatNumber(overview?.credits.overdueHolds) }}</strong>
      </div>
    </section>

    <section class="dashboard-grid">
      <a-card class="trend-card" :bordered="true">
        <template #title>
          <div class="card-heading">
            <div>
              <strong>{{ ui.behaviorTrend }}</strong>
              <span>{{ ui.behaviorTrendSub }}</span>
            </div>
            <a-button type="link" @click="router.push('/console/behavior')">
              {{ ui.viewAll }}
            </a-button>
          </div>
        </template>

        <div v-if="dailyRows.length" class="trend-chart">
          <div v-for="row in dailyRows" :key="row.day" class="trend-column">
            <div class="bar-track">
              <span
                class="bar-segment bar-segment--click"
                :style="{ height: `${barHeight(row.clicks)}%` }"
                :title="`${ui.clicks}: ${row.clicks}`"
              ></span>
              <span
                class="bar-segment bar-segment--view"
                :style="{ height: `${barHeight(row.pageViews)}%` }"
                :title="`${ui.pageViews}: ${row.pageViews}`"
              ></span>
            </div>
            <small>{{ shortDay(row.day) }}</small>
          </div>
        </div>
        <a-empty v-else :description="ui.noBehavior" />

        <div class="chart-legend">
          <span><i class="legend-view"></i>{{ ui.pageViews }}</span>
          <span><i class="legend-click"></i>{{ ui.clicks }}</span>
          <span class="chart-total">{{ ui.activePeople(summary?.totals.activeUsers || 0) }}</span>
        </div>
      </a-card>

      <a-card class="ranking-card">
        <template #title>
          <div class="card-heading">
            <div>
              <strong>{{ ui.topPages }}</strong>
              <span>{{ ui.topPagesSub }}</span>
            </div>
          </div>
        </template>
        <div v-if="summary?.topPages.length" class="ranking-list">
          <div v-for="(item, index) in summary.topPages.slice(0, 6)" :key="item.key" class="ranking-row">
            <span class="ranking-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <div class="ranking-copy">
              <strong>{{ item.key }}</strong>
              <span class="ranking-meter">
                <i :style="{ width: `${rankingWidth(item.count)}%` }"></i>
              </span>
            </div>
            <b>{{ formatNumber(item.count) }}</b>
          </div>
        </div>
        <a-empty v-else :description="ui.noBehavior" />
      </a-card>
    </section>

    <section class="dashboard-grid dashboard-grid--bottom">
      <a-card>
        <template #title>
          <div class="card-heading">
            <div>
              <strong>{{ ui.recentCredits }}</strong>
              <span>{{ ui.recentCreditsSub }}</span>
            </div>
            <a-button type="link" @click="router.push('/console/credits')">{{ ui.viewAll }}</a-button>
          </div>
        </template>
        <a-table
          :columns="creditColumns"
          :data-source="creditRows"
          row-key="id"
          size="small"
          :pagination="false"
          :scroll="{ x: 620 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'user'">
              <div class="identity-cell">
                <strong>{{ record.username || record.email || record.userId }}</strong>
                <span>{{ record.userId }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'delta'">
              <span :class="record.deltaAvailable >= 0 ? 'delta-positive' : 'delta-negative'">
                {{ signed(record.deltaAvailable) }}
              </span>
            </template>
            <template v-else-if="column.key === 'createdAt'">
              {{ formatDate(record.createdAt) }}
            </template>
          </template>
        </a-table>
      </a-card>

      <a-card>
        <template #title>
          <div class="card-heading">
            <div>
              <strong>{{ ui.recentAudit }}</strong>
              <span>{{ ui.recentAuditSub }}</span>
            </div>
            <a-button type="link" @click="router.push('/console/logs')">{{ ui.viewAll }}</a-button>
          </div>
        </template>
        <div v-if="auditRows.length" class="audit-list">
          <div v-for="item in auditRows" :key="item.id" class="audit-row">
            <span class="audit-dot"></span>
            <div>
              <strong>{{ item.eventType }}</strong>
              <span>{{ item.actorName }} · {{ formatDate(item.createdAt) }}</span>
            </div>
            <a-tag>{{ item.targetType || 'system' }}</a-tag>
          </div>
        </div>
        <a-empty v-else :description="ui.noAudit" />
      </a-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowRightOutlined,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserSwitchOutlined,
  WalletOutlined
} from '@ant-design/icons-vue';
import { storeToRefs } from 'pinia';
import ConsoleMetricCard from '@/console/components/ConsoleMetricCard.vue';
import ConsolePageHeader from '@/console/components/ConsolePageHeader.vue';
import { useConsoleStore } from '@/stores/console';
import { useLanguageStore } from '@/stores/language';

const router = useRouter();
const consoleStore = useConsoleStore();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loading = ref(false);
const errorMessage = ref('');

const overview = computed(() => consoleStore.adminOverview);
const summary = computed(() => consoleStore.adminBehaviorSummary);
const creditRows = computed(() => consoleStore.adminCreditLedger.slice(0, 6));
const auditRows = computed(() => consoleStore.adminDatabaseAudit.slice(0, 6));
const dailyRows = computed(() => summary.value?.daily.slice(-14) || []);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        eyebrow: 'Operations pulse',
        title: '运营总览',
        description: '从真实数据库汇总用户、点数、行为、生成任务与后台操作，快速发现风险和异常。',
        refresh: '刷新数据',
        manageUsers: '管理用户',
        loadFailed: '部分数据加载失败',
        totalUsers: '用户总数',
        newUsers: (count: number) => `近 7 天新增 ${count.toLocaleString()} 人`,
        availableCredits: '全站可用点数',
        frozenCredits: (count: number) => `冻结 ${count.toLocaleString()} 点`,
        behaviorEvents: '24 小时行为事件',
        behaviorDetail: (views: number, clicks: number) => `${views.toLocaleString()} 访问 · ${clicks.toLocaleString()} 点击`,
        generationTasks: '24 小时生成任务',
        generationDetail: (success: number, failed: number) => `${success.toLocaleString()} 成功 · ${failed.toLocaleString()} 失败`,
        activeUsers24h: '24h 活跃用户',
        ledger24h: '24h 点数流水',
        orders7d: '7d 订单',
        audit24h: '24h 管理操作',
        overdueHolds: '逾期冻结',
        behaviorTrend: '访问与点击趋势',
        behaviorTrendSub: '最近 14 天用户行为',
        viewAll: '查看全部',
        pageViews: '访问',
        clicks: '点击',
        activePeople: (count: number) => `${count.toLocaleString()} 位活跃用户`,
        noBehavior: '暂时没有行为数据',
        topPages: '热门页面',
        topPagesSub: '按访问次数排序',
        recentCredits: '最新点数流水',
        recentCreditsSub: '不可篡改的钱包账本',
        recentAudit: '最新系统审计',
        recentAuditSub: '管理员与敏感操作留痕',
        noAudit: '暂时没有审计记录',
        colUser: '用户',
        colType: '类型',
        colDelta: '点数变动',
        colBalance: '变动后余额',
        colTime: '时间'
      }
    : {
        eyebrow: 'Operations pulse',
        title: 'Operations overview',
        description: 'Canonical database metrics for users, credits, behavior, generation tasks, and admin activity.',
        refresh: 'Refresh',
        manageUsers: 'Manage users',
        loadFailed: 'Some data failed to load',
        totalUsers: 'Total users',
        newUsers: (count: number) => `${count.toLocaleString()} new in 7 days`,
        availableCredits: 'Available credits',
        frozenCredits: (count: number) => `${count.toLocaleString()} frozen`,
        behaviorEvents: 'Behavior events · 24h',
        behaviorDetail: (views: number, clicks: number) => `${views.toLocaleString()} views · ${clicks.toLocaleString()} clicks`,
        generationTasks: 'Generation tasks · 24h',
        generationDetail: (success: number, failed: number) => `${success.toLocaleString()} success · ${failed.toLocaleString()} failed`,
        activeUsers24h: 'Active users · 24h',
        ledger24h: 'Ledger entries · 24h',
        orders7d: 'Orders · 7d',
        audit24h: 'Admin actions · 24h',
        overdueHolds: 'Overdue holds',
        behaviorTrend: 'Visits and clicks',
        behaviorTrendSub: 'Last 14 days',
        viewAll: 'View all',
        pageViews: 'Views',
        clicks: 'Clicks',
        activePeople: (count: number) => `${count.toLocaleString()} active users`,
        noBehavior: 'No behavior data yet',
        topPages: 'Top pages',
        topPagesSub: 'Ranked by visits',
        recentCredits: 'Recent credit entries',
        recentCreditsSub: 'Immutable wallet ledger',
        recentAudit: 'Recent system audit',
        recentAuditSub: 'Admin and sensitive operations',
        noAudit: 'No audit events yet',
        colUser: 'User',
        colType: 'Type',
        colDelta: 'Credit delta',
        colBalance: 'Balance',
        colTime: 'Time'
      }
);

const creditColumns = computed(() => [
  { title: ui.value.colUser, key: 'user', width: 180 },
  { title: ui.value.colType, dataIndex: 'entryType', key: 'entryType', width: 150 },
  { title: ui.value.colDelta, key: 'delta', width: 110 },
  { title: ui.value.colBalance, dataIndex: 'balanceAvailable', key: 'balance', width: 110 },
  { title: ui.value.colTime, key: 'createdAt', width: 155 }
]);

const maxDailyValue = computed(() =>
  Math.max(1, ...dailyRows.value.flatMap((row) => [row.pageViews, row.clicks]))
);
const barHeight = (value: number) => Math.max(value ? 7 : 0, (value / maxDailyValue.value) * 92);
const maxPageCount = computed(() => Math.max(1, ...(summary.value?.topPages.map((item) => item.count) || [1])));
const rankingWidth = (value: number) => Math.max(3, (value / maxPageCount.value) * 100);
const formatNumber = (value?: number) => Number(value || 0).toLocaleString();
const formatDate = (value?: number) => (value ? new Date(value).toLocaleString() : '-');
const shortDay = (value: string) => value.slice(5).replace('-', '/');
const signed = (value: number) => `${value > 0 ? '+' : ''}${Number(value || 0).toLocaleString()}`;

const loadDashboard = async () => {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  const results = await Promise.allSettled([
    consoleStore.fetchAdminOverview(),
    consoleStore.fetchAdminBehaviorSummary(14),
    consoleStore.fetchAdminCreditLedger({ limit: 6 }),
    consoleStore.fetchAdminDatabaseAudit({ limit: 6 })
  ]);
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
  if (rejected) errorMessage.value = String(rejected.reason?.message || rejected.reason || 'REQUEST_FAILED');
  loading.value = false;
};

onMounted(loadDashboard);
</script>

<style scoped>
.dashboard-alert {
  margin-bottom: 18px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.health-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 14px;
  padding: 13px 8px;
  border: 1px solid #e6eaf0;
  border-radius: 13px;
  background: #fff;
}

.health-strip > div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
  padding: 3px 12px;
  border-right: 1px solid #edf0f4;
}

.health-strip > div:last-child {
  border-right: 0;
}

.health-strip span {
  overflow: hidden;
  color: #7a859a;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-strip strong {
  color: #253149;
  font-size: 15px;
}

.health-warning strong {
  color: #d15245;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.8fr);
  gap: 14px;
  margin-top: 14px;
}

.dashboard-grid--bottom {
  grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.85fr);
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.card-heading > div {
  display: grid;
  gap: 2px;
}

.card-heading strong {
  color: #222e45;
  font-size: 14px;
}

.card-heading span {
  color: #8a94a7;
  font-size: 10px;
  font-weight: 400;
}

.trend-chart {
  display: grid;
  grid-template-columns: repeat(14, minmax(12px, 1fr));
  gap: 7px;
  height: 238px;
  padding: 10px 0 0;
}

.trend-column {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 8px;
  min-width: 0;
}

.bar-track {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  border-bottom: 1px solid #e9ecf2;
}

.bar-segment {
  width: min(7px, 35%);
  min-height: 0;
  border-radius: 4px 4px 1px 1px;
  transition: height 220ms ease;
}

.bar-segment--view {
  background: #3159df;
}

.bar-segment--click {
  background: #9f82ec;
}

.trend-column small {
  color: #9aa3b3;
  font-size: 9px;
  text-align: center;
}

.chart-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  color: #758095;
  font-size: 10px;
}

.chart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chart-legend i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

.legend-view {
  background: #3159df;
}

.legend-click {
  background: #9f82ec;
}

.chart-total {
  margin-left: auto;
}

.ranking-list {
  display: grid;
  gap: 18px;
}

.ranking-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.ranking-index {
  color: #a1a9b8;
  font-size: 10px;
}

.ranking-copy {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.ranking-copy strong {
  overflow: hidden;
  color: #364157;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-meter {
  height: 4px;
  overflow: hidden;
  border-radius: 3px;
  background: #edf0f6;
}

.ranking-meter i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3159df, #7e72e7);
}

.ranking-row b {
  color: #4a566d;
  font-size: 11px;
}

.identity-cell {
  display: grid;
  gap: 2px;
}

.identity-cell strong {
  overflow: hidden;
  color: #27334a;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-cell span {
  overflow: hidden;
  max-width: 180px;
  color: #9aa3b2;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delta-positive {
  color: #14865a;
  font-weight: 700;
}

.delta-negative {
  color: #d05448;
  font-weight: 700;
}

.audit-list {
  display: grid;
}

.audit-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid #eef0f4;
}

.audit-row:last-child {
  border-bottom: 0;
}

.audit-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5072e9;
  box-shadow: 0 0 0 4px #edf1ff;
}

.audit-row > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.audit-row strong {
  overflow: hidden;
  color: #344056;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-row span {
  color: #9099aa;
  font-size: 9px;
}

@media (max-width: 1180px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .health-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .health-strip > div:nth-child(3) {
    border-right: 0;
  }

  .health-strip > div:nth-child(n + 4) {
    margin-top: 10px;
  }

  .dashboard-grid,
  .dashboard-grid--bottom {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .metric-grid,
  .health-strip {
    grid-template-columns: 1fr;
  }

  .health-strip > div {
    justify-content: space-between;
    padding: 8px 12px;
    border-right: 0;
    border-bottom: 1px solid #edf0f4;
  }

  .health-strip > div:last-child {
    border-bottom: 0;
  }

  .trend-chart {
    gap: 3px;
    height: 190px;
  }

  .trend-column small {
    display: none;
  }
}
</style>
