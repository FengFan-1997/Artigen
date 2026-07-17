<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>
    <a-alert
      v-if="dashboardDataError"
      type="error"
      show-icon
      :message="ui.loadFailed"
      style="margin-bottom: 16px"
    />

    <a-row :gutter="16">
      <a-col :xs="24" :sm="12" :lg="8">
        <a-card>
          <a-statistic
            :title="ui.totalAvailable"
            :value="walletAvailableTotal"
            :precision="0"
            :suffix="ui.credits"
          >
            <template #prefix>
              <wallet-outlined />
            </template>
          </a-statistic>
          <a-button
            type="primary"
            style="margin-top: 16px"
            @click="router.push('/console/users')"
            >{{ ui.inspectWallets }}</a-button
          >
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="8">
        <a-card>
          <a-statistic
            :title="ui.totalFrozen"
            :value="walletFrozenTotal"
            :precision="0"
            :suffix="ui.credits"
          />
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="8">
        <a-card>
          <a-statistic :title="ui.totalUsers" :value="consoleStore.adminUsersTotal" />
          <div style="margin-top: 10px; color: #888">{{ walletCoverage }}</div>
        </a-card>
      </a-col>
    </a-row>

    <a-card :title="ui.generationFunnel" style="margin-top: 24px">
      <a-row :gutter="[16, 16]">
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic
            :title="ui.generationSuccessRate"
            :value="generationMetrics.successRate"
            suffix="%"
            :precision="1"
          />
        </a-col>
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic
            :title="ui.refundRate"
            :value="generationMetrics.refundRate"
            suffix="%"
            :precision="1"
          />
        </a-col>
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic
            :title="ui.persistenceFailureRate"
            :value="generationMetrics.persistenceFailureRate"
            suffix="%"
            :precision="2"
          />
        </a-col>
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic
            :title="ui.unsettledHolds"
            :value="generationMetrics.unsettledHolds"
            :value-style="generationMetrics.unsettledHolds > 0 ? { color: '#cf1322' } : undefined"
          />
        </a-col>
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic :title="ui.queueP50P95" :value="generationMetrics.queueTiming" />
        </a-col>
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic :title="ui.providerP50P95" :value="generationMetrics.providerTiming" />
        </a-col>
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic
            :title="ui.costPerSuccess"
            :value="generationMetrics.costPerSuccess"
            prefix="¥"
            :precision="3"
          />
        </a-col>
        <a-col :xs="12" :sm="8" :lg="6">
          <a-statistic
            :title="ui.firstImageP50P95"
            :value="generationMetrics.firstImageTiming"
          />
        </a-col>
      </a-row>
      <a-table
        style="margin-top: 20px"
        :columns="funnelColumns"
        :data-source="funnelRows"
        row-key="event"
        pagination="false"
        size="small"
        :scroll="{ x: 720 }"
      />
    </a-card>

    <div style="margin-top: 24px">
      <a-row :gutter="16">
        <a-col :xs="24" :lg="16">
          <a-card :title="ui.usageTrend">
            <div class="dashboard-chart">
              <v-chart class="chart" :option="chartOption" autoresize />
            </div>
          </a-card>
        </a-col>
        <a-col :xs="24" :lg="8">
          <a-card :title="ui.trafficStats">
            <a-statistic :title="ui.totalViews" :value="trafficViews" style="margin-bottom: 16px" />
            <a-row :gutter="16" style="margin-bottom: 16px">
              <a-col :xs="8">
                <a-statistic :title="ui.trafficOrganic" :value="trafficSourceViews.organic" />
              </a-col>
              <a-col :xs="8">
                <a-statistic :title="ui.trafficSearch" :value="trafficSourceViews.search" />
              </a-col>
              <a-col :xs="8">
                <a-statistic :title="ui.trafficLink" :value="trafficSourceViews.link" />
              </a-col>
            </a-row>
            <a-row :gutter="16">
              <a-col :xs="12" :sm="12">
                <a-statistic :title="ui.conversions" :value="trafficConversions" />
              </a-col>
              <a-col :xs="12" :sm="12">
                <a-statistic :title="ui.ctr" :value="trafficCtr" suffix="%" :precision="1" />
              </a-col>
            </a-row>
            <div style="margin-top: 16px; font-size: 12px; color: #888">
              {{ ui.trafficNote }}
            </div>
          </a-card>
          <a-card :title="ui.quickActions" style="margin-top: 16px">
            <a-space direction="vertical" style="width: 100%">
              <a-button block type="primary" @click="router.push('/console/playground')">{{
                ui.tryPlayground
              }}</a-button>
              <a-button block @click="router.push('/console/usage')">{{
                ui.viewFullHistory
              }}</a-button>
              <a-button block @click="router.push('/console/users')">{{
                ui.userManagement
              }}</a-button>
            </a-space>
          </a-card>
        </a-col>
      </a-row>
    </div>

    <div style="margin-top: 24px">
      <a-row :gutter="16">
        <a-col :xs="24" :lg="12">
          <a-card :title="ui.toolPerformance">
            <a-table
              :columns="toolColumns"
              :data-source="toolStats"
              row-key="id"
              pagination="false"
              size="small"
            />
          </a-card>
        </a-col>
        <a-col :xs="24" :lg="12">
          <a-card :title="ui.clickAnalysis">
            <a-table
              :columns="clickColumns"
              :data-source="clickStats"
              row-key="id"
              pagination="false"
              size="small"
            />
          </a-card>
        </a-col>
      </a-row>
    </div>

    <div style="margin-top: 24px">
      <a-typography-title :level="4">{{ ui.recentActivity }}</a-typography-title>
      <a-table
        :columns="columns"
        :data-source="recentUsage"
        row-key="id"
        pagination="false"
        :scroll="{ x: 720 }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { WalletOutlined } from '@ant-design/icons-vue';
import { useConsoleStore } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components';
import VChart from 'vue-echarts';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, TitleComponent]);

const router = useRouter();
const consoleStore = useConsoleStore();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '总览',
        totalAvailable: '已加载用户可用点数合计',
        totalFrozen: '已加载用户冻结点数合计',
        totalUsers: '用户总数',
        credits: '点数',
        inspectWallets: '核对钱包与账本',
        walletCoverage: (loaded: number, total: number) => `钱包统计覆盖 ${loaded} / ${total} 位用户`,
        usageTrend: '用量趋势（近 7 天）',
        quickActions: '快捷操作',
        tryPlayground: '进入试验场',
        viewFullHistory: '查看完整记录',
        userManagement: '用户管理',
        recentActivity: '最近活动',
        colTime: '时间',
        colType: '类型',
        colDesc: '描述',
        colAmount: '数量',
        pointsSpent: '消耗点数',
        trafficStats: 'SEO 页面流量',
        totalViews: '总访问量',
        trafficOrganic: '自然',
        trafficSearch: '搜索',
        trafficLink: '外链',
        conversions: '转化点击',
        ctr: '转化率',
        trafficNote: '数据来源: /artigen/tools',
        toolPerformance: '工具表现',
        clickAnalysis: '点击分析',
        generationFunnel: '生图漏斗与生产健康（近 14 天）',
        generationSuccessRate: '有效任务成功率',
        refundRate: '失败任务全额退款率',
        persistenceFailureRate: '资产持久化失败率',
        unsettledHolds: '未结算预占',
        queueP50P95: '排队 p50 / p95',
        providerP50P95: 'Provider p50 / p95',
        firstImageP50P95: '首图 p50 / p95',
        costPerSuccess: '每成功任务成本',
        colStage: '阶段',
        colEvents: '事件数',
        colStageRate: '相对上一阶段',
        loadFailed: '服务端运营数据加载失败；下方不会使用浏览器假数据补位。',
        colToolName: '工具',
        colSuccess: '成功',
        colFail: '失败',
        colRate: '成功率',
        colPage: '页面',
        colTarget: '目标',
        colClicks: '点击'
      }
    : {
        title: 'Overview',
        totalAvailable: 'Available Credits (Loaded Users)',
        totalFrozen: 'Frozen Credits (Loaded Users)',
        totalUsers: 'Total Users',
        credits: 'Credits',
        inspectWallets: 'Inspect Wallets & Ledger',
        walletCoverage: (loaded: number, total: number) =>
          `Wallet coverage: ${loaded} / ${total} users`,
        usageTrend: 'Usage Trend (Last 7 Days)',
        quickActions: 'Quick Actions',
        tryPlayground: 'Try Playground',
        viewFullHistory: 'View Full History',
        userManagement: 'User Management',
        recentActivity: 'Recent Activity',
        colTime: 'Time',
        colType: 'Type',
        colDesc: 'Description',
        colAmount: 'Amount',
        pointsSpent: 'Points Spent',
        trafficStats: 'SEO Traffic',
        totalViews: 'Total Views',
        trafficOrganic: 'Organic',
        trafficSearch: 'Search',
        trafficLink: 'Referral',
        conversions: 'Conversions',
        ctr: 'CTR',
        trafficNote: 'Source: /artigen/tools',
        toolPerformance: 'Tool Performance',
        clickAnalysis: 'Click Analysis',
        generationFunnel: 'Generation Funnel & Production Health (14 days)',
        generationSuccessRate: 'Valid Task Success Rate',
        refundRate: 'Full Refund Rate on Failure',
        persistenceFailureRate: 'Asset Persistence Failure Rate',
        unsettledHolds: 'Unsettled Holds',
        queueP50P95: 'Queue p50 / p95',
        providerP50P95: 'Provider p50 / p95',
        firstImageP50P95: 'First Image p50 / p95',
        costPerSuccess: 'Cost per Successful Task',
        colStage: 'Stage',
        colEvents: 'Events',
        colStageRate: 'vs Previous Stage',
        loadFailed: 'Server operations data failed to load; browser mock data is never substituted.',
        colToolName: 'Tool Name',
        colSuccess: 'Success',
        colFail: 'Fail',
        colRate: 'Rate',
        colPage: 'Page',
        colTarget: 'Target',
        colClicks: 'Clicks'
      }
);

const walletAvailableTotal = computed(() =>
  consoleStore.adminUsers.reduce((sum, user) => sum + Number(user.wallet?.available || 0), 0)
);
const walletFrozenTotal = computed(() =>
  consoleStore.adminUsers.reduce((sum, user) => sum + Number(user.wallet?.frozen || 0), 0)
);
const walletCoverage = computed(() =>
  ui.value.walletCoverage(consoleStore.adminUsers.length, consoleStore.adminUsersTotal)
);

const trafficLoading = ref(false);
const dashboardDataError = ref(false);

const durationLabel = (p50: number, p95: number) => {
  const seconds = (value: number) => (Math.max(0, Number(value) || 0) / 1000).toFixed(1);
  return `${seconds(p50)}s / ${seconds(p95)}s`;
};

const generationMetrics = computed(() => {
  const funnel = consoleStore.generationFunnel;
  return {
    successRate: Number(funnel?.successRate || 0) * 100,
    refundRate: Number(funnel?.refundRate ?? 1) * 100,
    persistenceFailureRate: Number(funnel?.assetPersistenceFailureRate || 0) * 100,
    unsettledHolds: Number(funnel?.unsettledHolds?.count || 0),
    queueTiming: durationLabel(funnel?.timing?.queueP50Ms || 0, funnel?.timing?.queueP95Ms || 0),
    providerTiming: durationLabel(
      funnel?.timing?.providerP50Ms || 0,
      funnel?.timing?.providerP95Ms || 0
    ),
    firstImageTiming: durationLabel(
      funnel?.timing?.firstImageP50Ms || 0,
      funnel?.timing?.firstImageP95Ms || 0
    ),
    costPerSuccess: Number(funnel?.costPerSuccessfulTaskMinor || 0) / 100
  };
});

const funnelStageOrder = [
  'workspace_view',
  'prompt_start',
  'quote_shown',
  'quote_confirmed',
  'task_queued',
  'task_running',
  'task_success',
  'download',
  'edit',
  'variation'
];

const funnelRows = computed(() => {
  const events = consoleStore.generationFunnel?.events || {};
  return funnelStageOrder.map((event, index) => {
    const count = Number(events[event] || 0);
    const previous = index > 0 ? Number(events[funnelStageOrder[index - 1]] || 0) : 0;
    return {
      event,
      count,
      rate: index === 0 ? '—' : previous > 0 ? `${((count / previous) * 100).toFixed(1)}%` : '0.0%'
    };
  });
});

const funnelColumns = computed(() => [
  { title: ui.value.colStage, dataIndex: 'event', key: 'event' },
  { title: ui.value.colEvents, dataIndex: 'count', key: 'count' },
  { title: ui.value.colStageRate, dataIndex: 'rate', key: 'rate' }
]);

const normalizePage = (raw: any) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('/')) return s;
  try {
    const u = new URL(s);
    return `${u.pathname || ''}${u.search || ''}${u.hash || ''}`;
  } catch {
    return s;
  }
};

const safeParseUrl = (raw: any) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    return new URL(s);
  } catch {
    return null;
  }
};

const trafficSourceFromReferrer = (referrer: any) => {
  const u = safeParseUrl(referrer);
  const host = String(u?.hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return 'organic';
  const searchHosts = [
    'google.com',
    'bing.com',
    'yahoo.com',
    'duckduckgo.com',
    'baidu.com',
    'sogou.com',
    'so.com',
    'yandex.com',
    'naver.com',
    'sm.cn'
  ];
  const isSearch = searchHosts.some((x) => host === x || host.endsWith(`.${x}`));
  return isSearch ? 'search' : 'link';
};

const trafficEvents = computed(() => {
  const out: Array<{
    type: 'page_view' | 'click' | 'conversion' | 'generate_success' | 'generate_fail';
    page: string;
    target?: string;
    meta?: any;
    timestamp: number;
    id: string;
  }> = [];

  const adminEvents = Array.isArray(consoleStore.adminEvents) ? consoleStore.adminEvents : [];
  if (adminEvents.length > 0) {
    for (const evt of adminEvents) {
      const eventType = String(evt?.eventType || '').trim();
      const payload = evt?.payload && typeof evt.payload === 'object' ? evt.payload : {};
      const page = normalizePage((payload as any).pagePath || evt?.path || (payload as any).path);
      const timestamp = typeof evt?.ts === 'number' ? evt.ts : Date.now();
      const id =
        String(evt?.id || '').trim() ||
        `${timestamp}_${eventType}_${Math.random().toString(16).slice(2)}`;
      const trafficSource =
        String((evt as any)?.trafficSource || (payload as any)?.trafficSource || '')
          .trim()
          .toLowerCase() || '';
      const trafficRefHost = String((evt as any)?.trafficRefHost || '').trim() || '';
      const trafficSearchEngine = String((evt as any)?.trafficSearchEngine || '').trim() || '';

      if (eventType === 'page_view') {
        out.push({
          type: 'page_view',
          page,
          meta: {
            referrer: (evt as any)?.referrer || '',
            trafficSource,
            trafficRefHost,
            trafficSearchEngine
          },
          timestamp,
          id
        });
        continue;
      }
      if (eventType === 'tools_conversion') {
        out.push({
          type: 'conversion',
          page,
          target:
            String((payload as any).target || (payload as any).name || '').trim() || undefined,
          meta: payload,
          timestamp,
          id
        });
        continue;
      }
      if (eventType === 'tools_click' || eventType === 'tools_chip_click') {
        out.push({
          type: 'click',
          page,
          target:
            String((payload as any).target || '').trim() ||
            (eventType === 'tools_chip_click'
              ? String((payload as any).keyword || '').trim() || undefined
              : undefined),
          meta: payload,
          timestamp,
          id
        });
        continue;
      }
      if (eventType === 'ui_click') {
        const t =
          String((payload as any).targetText || '').trim() ||
          String((payload as any).targetHref || '').trim() ||
          String((payload as any).targetId || '').trim() ||
          String((payload as any).tag || '').trim();
        out.push({
          type: 'click',
          page,
          target: t || undefined,
          meta: payload,
          timestamp,
          id
        });
        continue;
      }
      if (eventType === 'ai_generate_success' || eventType === 'ai_generate_fail') {
        out.push({
          type: eventType === 'ai_generate_success' ? 'generate_success' : 'generate_fail',
          page,
          target: String((payload as any).toolId || (payload as any).model || '').trim()
            ? `tool:${String((payload as any).toolId || (payload as any).model || '').trim()}`
            : undefined,
          meta: payload,
          timestamp,
          id
        });
      }
    }
    return out;
  }

  return (consoleStore.trafficStats || []).map((t) => ({
    type: t.type,
    page: normalizePage(t.page),
    target: t.target,
    meta: t.meta,
    timestamp: t.timestamp,
    id: t.id
  }));
});

const trafficViews = computed(
  () =>
    trafficEvents.value.filter((t) => t.type === 'page_view' && t.page.includes('/tools')).length
);
const trafficSourceViews = computed(() => {
  const out = { organic: 0, search: 0, link: 0 };
  trafficEvents.value.forEach((t) => {
    if (t.type !== 'page_view') return;
    if (!t.page.includes('/tools')) return;
    const raw = String((t.meta as any)?.trafficSource || '')
      .trim()
      .toLowerCase();
    const src = raw || trafficSourceFromReferrer((t.meta as any)?.referrer);
    if (src === 'search') out.search++;
    else if (src === 'link') out.link++;
    else out.organic++;
  });
  return out;
});
const trafficConversions = computed(
  () =>
    trafficEvents.value.filter((t) => t.type === 'conversion' && t.page.includes('/tools')).length
);
const trafficCtr = computed(() =>
  trafficViews.value > 0 ? (trafficConversions.value / trafficViews.value) * 100 : 0
);

const recentUsage = computed(() => {
  return consoleStore.adminUsage.slice(0, 5).map((item) => ({
    id: item.requestId,
    timestamp: item.ts,
    type: item.trigger || item.provider || 'usage',
    description: [item.model, item.status].filter(Boolean).join(' · '),
    amount: Number(item.creditsDelta || 0)
  }));
});

const columns = computed(() => [
  {
    title: ui.value.colTime,
    dataIndex: 'timestamp',
    key: 'timestamp',
    customRender: ({ text }: any) => new Date(text).toLocaleString()
  },
  { title: ui.value.colType, dataIndex: 'type', key: 'type' },
  { title: ui.value.colDesc, dataIndex: 'description', key: 'description' },
  {
    title: ui.value.colAmount,
    dataIndex: 'amount',
    key: 'amount',
    customRender: ({ text }: any) => {
      const val = Number(text);
      return val > 0 ? `+${val}` : `${val}`;
    }
  }
]);

const chartOption = computed(() => {
  const dailyMap: Record<string, number> = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = 0;
  }

  consoleStore.adminUsage.forEach((item) => {
    const key = new Date(item.ts).toISOString().split('T')[0];
    if (dailyMap[key] !== undefined) {
      dailyMap[key] += Math.abs(Number(item.creditsDelta || 0));
    }
  });

  const dates = Object.keys(dailyMap);
  const values = dates.map((d) => dailyMap[d]);

  return {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: dates
    },
    yAxis: {
      type: 'value',
      name: ui.value.pointsSpent
    },
    series: [
      {
        data: values,
        type: 'line',
        smooth: true,
        areaStyle: {}
      }
    ]
  };
});

const clickStats = computed(() => {
  const map = new Map<string, { id: string; target: string; page: string; count: number }>();
  const pageViews = new Map<string, number>();

  trafficEvents.value.forEach((evt) => {
    if (evt.type === 'page_view') {
      const p = evt.page;
      pageViews.set(p, (pageViews.get(p) || 0) + 1);
    }
    if (evt.type === 'click' || evt.type === 'conversion') {
      const key = `${evt.page}::${evt.target}`;
      if (!map.has(key)) {
        map.set(key, { id: key, target: evt.target || 'unknown', page: evt.page, count: 0 });
      }
      map.get(key)!.count++;
    }
  });

  return Array.from(map.values())
    .map((item) => {
      const views = pageViews.get(item.page) || 0;
      const ctr = views > 0 ? ((item.count / views) * 100).toFixed(1) + '%' : '0%';
      return { ...item, ctr, views };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10
});

const toolStats = computed(() => {
  const map = new Map<string, { id: string; name: string; success: number; fail: number }>();

  trafficEvents.value.forEach((evt) => {
    if (evt.type === 'generate_success' || evt.type === 'generate_fail') {
      const toolId = evt.target?.replace('tool:', '') || 'unknown';
      const name = (evt.meta as any)?.toolName || toolId;

      if (!map.has(toolId)) {
        map.set(toolId, { id: toolId, name, success: 0, fail: 0 });
      }

      const item = map.get(toolId)!;
      if (evt.type === 'generate_success') item.success++;
      if (evt.type === 'generate_fail') item.fail++;
      // Update name if we get a better one
      if ((evt.meta as any)?.toolName) item.name = (evt.meta as any).toolName;
    }
  });

  return Array.from(map.values())
    .map((item) => {
      const total = item.success + item.fail;
      const rate = total > 0 ? ((item.success / total) * 100).toFixed(1) + '%' : '0%';
      return { ...item, rate };
    })
    .sort((a, b) => b.success + b.fail - (a.success + a.fail));
});

const toolColumns = computed(() => [
  { title: ui.value.colToolName, dataIndex: 'name', key: 'name' },
  { title: ui.value.colSuccess, dataIndex: 'success', key: 'success' },
  { title: ui.value.colFail, dataIndex: 'fail', key: 'fail' },
  { title: ui.value.colRate, dataIndex: 'rate', key: 'rate' }
]);

const clickColumns = computed(() => [
  { title: ui.value.colPage, dataIndex: 'page', key: 'page' },
  { title: ui.value.colTarget, dataIndex: 'target', key: 'target' },
  { title: ui.value.colClicks, dataIndex: 'count', key: 'count' },
  { title: ui.value.ctr, dataIndex: 'ctr', key: 'ctr' }
]);

onMounted(() => {
  consoleStore.init();
  const loadTraffic = async () => {
    if (trafficLoading.value) return;
    const key = String(consoleStore.adminKey || '').trim();
    if (!key) return;
    trafficLoading.value = true;
    dashboardDataError.value = false;
    try {
      await Promise.all([
        consoleStore.fetchAdminUsers({ limit: 2000, offset: 0 }),
        consoleStore.fetchAdminUsageLedger({ limit: 2000, offset: 0 }),
        consoleStore.fetchAdminCollectionEvents({ limit: 2000, offset: 0 }),
        consoleStore.fetchGenerationFunnel(14)
      ]);
    } catch (e) {
      void e;
      dashboardDataError.value = true;
    } finally {
      trafficLoading.value = false;
    }
  };
  void loadTraffic();
});
</script>

<style scoped>
.dashboard-chart {
  height: 300px;
}

@media (max-width: 768px) {
  .dashboard-chart {
    height: 220px;
  }
}

@media (max-width: 480px) {
  .dashboard-chart {
    height: 180px;
  }

  :deep(.ant-card-body) {
    padding: 12px;
  }

  :deep(.ant-statistic-content-value) {
    font-size: 20px;
  }
}
</style>

<style scoped>
.small-text-stat :deep(.ant-statistic-content-value) {
  font-size: 16px;
}
.chart {
  height: 100%;
  width: 100%;
}
</style>
