<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-card>
      <div
        class="usage-toolbar"
        style="margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap"
      >
        <a-input
          v-model:value="filterUserId"
          :placeholder="ui.userFilterPh"
          style="width: min(240px, 100%)"
        />
        <a-range-picker v-model:value="dateRange" />
        <a-select
          v-model:value="filterTrigger"
          :options="triggerOptions"
          :placeholder="ui.triggerPh"
          allowClear
          style="width: 160px"
        />
        <a-select
          v-model:value="filterModel"
          :options="modelOptions"
          :placeholder="ui.modelPh"
          allowClear
          show-search
          :filter-option="filterSelectOption"
          style="width: 200px"
        />
        <a-select
          v-model:value="filterStatus"
          :options="statusOptions"
          :placeholder="ui.statusPh"
          allowClear
          style="width: 160px"
        />
        <a-select
          v-model:value="filterProvider"
          :options="providerOptions"
          :placeholder="ui.providerPh"
          allowClear
          style="width: 160px"
        />
        <a-button type="primary" @click="fetchUsage" :loading="loading">{{ ui.filter }}</a-button>
        <a-button @click="fetchAnalytics" :loading="analyticsLoading">{{
          analyticsLoaded ? ui.refreshAnalytics : ui.loadAnalytics
        }}</a-button>
        <a-switch
          v-model:checked="analyticsEnabled"
          :checked-children="ui.analyticsOn"
          :un-checked-children="ui.analyticsOff"
          :disabled="!analyticsLoaded"
        />
        <a-button @click="exportCsv" :disabled="analyticsFilteredItems.length === 0">{{
          ui.exportCsv
        }}</a-button>
      </div>

      <a-alert
        v-if="analyticsEnabled"
        type="info"
        show-icon
        :message="ui.analyticsTip(analyticsFilteredItems.length)"
        style="margin-bottom: 16px"
      />

      <a-row :gutter="16" style="margin-bottom: 16px">
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statRequests" :value="statRequests" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statUsers" :value="statUsers" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statCredits" :value="statCreditsSpent" :precision="2" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statTokens" :value="statTokensTotal" />
          </a-card>
        </a-col>
      </a-row>

      <a-row :gutter="16" style="margin-bottom: 16px">
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statSuccessRate" :value="statSuccessRate" suffix="%" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statAvgLatency" :value="statAvgLatencyMs" suffix="ms" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statP95Latency" :value="statP95LatencyMs" suffix="ms" />
          </a-card>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-card>
            <a-statistic :title="ui.statUniqueIp" :value="statUniqueIp" />
          </a-card>
        </a-col>
      </a-row>

      <a-card :title="ui.trendTitle" style="margin-bottom: 16px">
        <div
          class="usage-trend-toolbar"
          style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px"
        >
          <a-radio-group v-model:value="granularity">
            <a-radio-button value="hour">{{ ui.byHour }}</a-radio-button>
            <a-radio-button value="day">{{ ui.byDay }}</a-radio-button>
          </a-radio-group>
        </div>
        <div style="height: 320px">
          <v-chart class="chart" :option="trendChartOption" autoresize />
        </div>
      </a-card>

      <a-row :gutter="16" style="margin-bottom: 16px">
        <a-col :xs="24" :lg="12">
          <a-card :title="ui.topModelsTitle">
            <a-table
              :columns="topModelsColumns"
              :data-source="topModels"
              row-key="key"
              size="small"
              :pagination="false"
              :scroll="{ x: 520 }"
            />
          </a-card>
        </a-col>
        <a-col :xs="24" :lg="12">
          <a-card :title="ui.topUsersTitle">
            <a-table
              :columns="topUsersColumns"
              :data-source="topUsers"
              row-key="key"
              size="small"
              :pagination="false"
              :scroll="{ x: 520 }"
            />
          </a-card>
        </a-col>
      </a-row>

      <a-table
        :columns="columns"
        :data-source="items"
        row-key="requestId"
        :pagination="pagination"
        :loading="loading"
        :tableLayout="'fixed'"
        :scroll="{ x: 1100 }"
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

    <a-modal
      v-model:visible="detailsVisible"
      :title="ui.usageDetails"
      footer=""
      width="90%"
      style="max-width: 600px"
    >
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
import { useConsoleStore, type AdminUsageLedgerItem } from '@/stores/console';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { message } from 'ant-design-vue';

import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import VChart from 'vue-echarts';

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent]);

const consoleStore = useConsoleStore();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '使用记录',
        filter: '筛选',
        loadAnalytics: '拉取更多用于分析',
        refreshAnalytics: '刷新分析数据',
        analyticsOn: '分析数据',
        analyticsOff: '分页数据',
        exportCsv: '导出 CSV',
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
        userFilterPh: '可选：按用户 ID 过滤',
        triggerPh: '触发类型',
        modelPh: '模型',
        statusPh: '状态',
        providerPh: 'Provider',
        statRequests: '请求数',
        statUsers: '用户数',
        statCredits: '消耗点数',
        statTokens: 'Tokens 总量',
        statSuccessRate: '成功率',
        statAvgLatency: '平均耗时',
        statP95Latency: 'P95 耗时',
        statUniqueIp: '独立 IP',
        trendTitle: '趋势（请求数/消耗点数）',
        byHour: '按小时',
        byDay: '按天',
        topModelsTitle: '模型 Top',
        topUsersTitle: '用户 Top',
        analyticsTip: (n: number) => `当前分析基于 ${n} 条记录（受筛选与拉取上限影响）`
      }
    : {
        title: 'Usage History',
        filter: 'Filter',
        loadAnalytics: 'Load more for analytics',
        refreshAnalytics: 'Refresh analytics',
        analyticsOn: 'Analytics',
        analyticsOff: 'Paged',
        exportCsv: 'Export CSV',
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
        userFilterPh: 'Optional: filter by userId',
        triggerPh: 'Trigger',
        modelPh: 'Model',
        statusPh: 'Status',
        providerPh: 'Provider',
        statRequests: 'Requests',
        statUsers: 'Users',
        statCredits: 'Credits Spent',
        statTokens: 'Tokens Total',
        statSuccessRate: 'Success Rate',
        statAvgLatency: 'Avg Latency',
        statP95Latency: 'P95 Latency',
        statUniqueIp: 'Unique IP',
        trendTitle: 'Trend (Requests / Credits)',
        byHour: 'Hourly',
        byDay: 'Daily',
        topModelsTitle: 'Top Models',
        topUsersTitle: 'Top Users',
        analyticsTip: (n: number) => `Analytics based on ${n} rows (limited by fetch cap & filters)`
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
const filterTrigger = ref<string | undefined>(undefined);
const filterModel = ref<string | undefined>(undefined);
const filterStatus = ref<string | undefined>(undefined);
const filterProvider = ref<string | undefined>(undefined);
const granularity = ref<'hour' | 'day'>('day');

const analyticsLoading = ref(false);
const analyticsEnabled = ref(false);
const analyticsItems = ref<AdminUsageLedgerItem[]>([]);

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
  {
    title: ui.value.colType,
    dataIndex: 'trigger',
    key: 'trigger',
    customRender: ({ record }: any) => getUsageTypeLabel(record)
  },
  {
    title: ui.value.colDesc,
    dataIndex: 'model',
    key: 'modelTag',
    customRender: ({ record }: any) => getUsageDescLabel(record)
  },
  {
    title: ui.value.colCredits,
    dataIndex: 'creditsDelta',
    key: 'creditsDelta',
    align: 'right',
    customRender: ({ record }: any) => formatCreditsSpent(record)
  },
  { title: ui.value.colAction, key: 'action', width: 100, fixed: 'right' }
]);

const items = computed(() => {
  return consoleStore.adminUsage;
});

const analyticsLoaded = computed(() => analyticsItems.value.length > 0);

const filterSelectOption = (input: string, option: any) => {
  const q = String(input || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const label = String(option?.label ?? option?.value ?? '')
    .trim()
    .toLowerCase();
  return label.includes(q);
};

const toNum = (v: any) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toKey = (v: any) => String(v ?? '').trim();

const formatCreditsSpent = (it: any) => {
  const d = toNum(it?.creditsDelta);
  const spent = Math.max(0, d);
  const fixed = Math.round(spent * 100) / 100;
  return fixed ? fixed : 0;
};

const isImgTrigger = (t: string) => {
  const k = t.trim().toLowerCase();
  return k === 'img2img' || k === 'ai_design' || k === 'id_photo' || k === 'old_photo';
};

const isDeepImg = (it: any) => {
  if (it?.plan && typeof it.plan === 'object' && 'deepMode' in it.plan)
    return !!(it.plan as any).deepMode;
  return false;
};

const getUsageTypeLabel = (it: any) => {
  const trig = toKey(it?.trigger);
  const k = trig.toLowerCase();
  const zh = currentLang.value === 'zh';
  if (k === 'id_photo') return zh ? '证件照' : 'ID Photo';
  if (k === 'old_photo') return zh ? '老照片修复' : 'Old Photo Restore';
  if (k === 'ai_design')
    return isDeepImg(it)
      ? zh
        ? '深度思考生图'
        : 'Deep-think Image'
      : zh
        ? '非深度思考生图'
        : 'Image';
  if (k === 'img2img') return zh ? '图生图' : 'Image-to-Image';
  if (k === 'chat') return zh ? '对话' : 'Chat';
  if (k === 'task') return zh ? '任务' : 'Task';
  if (k === 'interaction') return zh ? '交互' : 'Interaction';
  if (k === 'idle') return zh ? '空闲' : 'Idle';
  if (k === 'dom') return zh ? '页面行为' : 'DOM';
  if (k === 'error') return zh ? '错误' : 'Error';
  return trig || '-';
};

const getUsageDescLabel = (it: any) => {
  const provider = toKey(it?.provider);
  const model = toKey(it?.model);
  const trig = toKey(it?.trigger);
  const k = trig.toLowerCase();
  if (isImgTrigger(k)) {
    const plan = it?.plan && typeof it.plan === 'object' ? it.plan : null;
    const userTextRaw = plan && typeof plan.userText === 'string' ? plan.userText : '';
    const userText = String(userTextRaw || '').trim();
    if (userText) return userText.slice(0, 80);
    return model || provider || '-';
  }
  if (provider && model) return `${provider} / ${model}`;
  return model || provider || '-';
};

const isSuccess = (status: any) => {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  if (!s) return true;
  if (s === 'ok' || s === 'success') return true;
  if (/^2\d\d$/.test(s)) return true;
  if (s.startsWith('2')) return true;
  return false;
};

const analyticsBaseItems = computed<AdminUsageLedgerItem[]>(() => {
  return analyticsEnabled.value ? analyticsItems.value : consoleStore.adminUsage;
});

const analyticsFilteredItems = computed<AdminUsageLedgerItem[]>(() => {
  const trig = toKey(filterTrigger.value);
  const model = toKey(filterModel.value);
  const status = toKey(filterStatus.value);
  const provider = toKey(filterProvider.value);
  return analyticsBaseItems.value.filter((it) => {
    if (trig && toKey(it.trigger) !== trig) return false;
    if (model && toKey(it.model) !== model) return false;
    if (status && toKey(it.status) !== status) return false;
    if (provider && toKey(it.provider) !== provider) return false;
    return true;
  });
});

const buildOptions = (values: string[]) => {
  const uniq = Array.from(new Set(values.filter((v) => v.trim()))).sort((a, b) =>
    a.localeCompare(b)
  );
  return uniq.map((v) => ({ value: v, label: v }));
};

const triggerOptions = computed(() =>
  buildOptions(analyticsBaseItems.value.map((it) => toKey(it.trigger)))
);
const modelOptions = computed(() =>
  buildOptions(analyticsBaseItems.value.map((it) => toKey(it.model)))
);
const statusOptions = computed(() =>
  buildOptions(analyticsBaseItems.value.map((it) => toKey(it.status)))
);
const providerOptions = computed(() =>
  buildOptions(analyticsBaseItems.value.map((it) => toKey(it.provider)))
);

const statRequests = computed(() => analyticsFilteredItems.value.length);

const statUsers = computed(() => {
  const set = new Set<string>();
  analyticsFilteredItems.value.forEach((it) => {
    const uid = toKey(it.userId);
    if (uid) set.add(uid);
  });
  return set.size;
});

const statUniqueIp = computed(() => {
  const set = new Set<string>();
  analyticsFilteredItems.value.forEach((it) => {
    const ip = toKey(it.ip);
    if (ip) set.add(ip);
  });
  return set.size;
});

const statCreditsSpent = computed(() => {
  let sum = 0;
  analyticsFilteredItems.value.forEach((it) => {
    const d = toNum(it.creditsDelta);
    if (d > 0) sum += d;
  });
  return sum;
});

const statTokensTotal = computed(() => {
  let sum = 0;
  analyticsFilteredItems.value.forEach((it) => {
    const t = toNum(it.tokensTotal);
    sum += t > 0 ? t : toNum(it.tokensIn) + toNum(it.tokensOut);
  });
  return sum;
});

const statSuccessRate = computed(() => {
  const total = analyticsFilteredItems.value.length;
  if (total <= 0) return 0;
  let ok = 0;
  analyticsFilteredItems.value.forEach((it) => {
    if (isSuccess(it.status)) ok += 1;
  });
  return Math.round((ok / total) * 1000) / 10;
});

const latencyValues = computed(() => {
  const list: number[] = [];
  analyticsFilteredItems.value.forEach((it) => {
    const d = toNum(it.durationMs);
    if (d > 0) list.push(d);
  });
  list.sort((a, b) => a - b);
  return list;
});

const statAvgLatencyMs = computed(() => {
  const list = latencyValues.value;
  if (list.length === 0) return 0;
  const sum = list.reduce((a, b) => a + b, 0);
  return Math.round(sum / list.length);
});

const statP95LatencyMs = computed(() => {
  const list = latencyValues.value;
  if (list.length === 0) return 0;
  const idx = Math.min(list.length - 1, Math.floor(list.length * 0.95) - 1);
  return Math.round(list[Math.max(0, idx)]);
});

const toTimeBucketKey = (ts: number, mode: 'hour' | 'day') => {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (mode === 'day') return `${yyyy}-${mm}-${dd}`;
  const hh = String(d.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:00`;
};

const trendSeries = computed(() => {
  const map = new Map<string, { req: number; credits: number }>();
  const mode = granularity.value;
  analyticsFilteredItems.value.forEach((it) => {
    const key = toTimeBucketKey(toNum(it.ts), mode);
    const prev = map.get(key) || { req: 0, credits: 0 };
    prev.req += 1;
    const d = toNum(it.creditsDelta);
    if (d > 0) prev.credits += d;
    map.set(key, prev);
  });
  const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  return {
    keys,
    req: keys.map((k) => map.get(k)!.req),
    credits: keys.map((k) => Math.round(map.get(k)!.credits * 100) / 100)
  };
});

const trendChartOption = computed(() => {
  const series = trendSeries.value;
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: [ui.value.statRequests, ui.value.statCredits] },
    grid: { left: 48, right: 48, top: 40, bottom: 36 },
    xAxis: { type: 'category', data: series.keys, axisLabel: { hideOverlap: true } },
    yAxis: [
      { type: 'value', name: ui.value.statRequests },
      { type: 'value', name: ui.value.statCredits }
    ],
    series: [
      { name: ui.value.statRequests, data: series.req, type: 'bar', yAxisIndex: 0 },
      {
        name: ui.value.statCredits,
        data: series.credits,
        type: 'line',
        smooth: true,
        yAxisIndex: 1
      }
    ]
  };
});

type TopRow = { key: string; count: number; credits: number; tokens: number };

const topModels = computed<TopRow[]>(() => {
  const map = new Map<string, TopRow>();
  analyticsFilteredItems.value.forEach((it) => {
    const key = toKey(it.model) || '-';
    const prev = map.get(key) || { key, count: 0, credits: 0, tokens: 0 };
    prev.count += 1;
    const d = toNum(it.creditsDelta);
    if (d > 0) prev.credits += d;
    prev.tokens += toNum(it.tokensTotal) || toNum(it.tokensIn) + toNum(it.tokensOut);
    map.set(key, prev);
  });
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || b.credits - a.credits)
    .slice(0, 10)
    .map((r) => ({ ...r, credits: Math.round(r.credits * 100) / 100 }));
});

const topUsers = computed<TopRow[]>(() => {
  const map = new Map<string, TopRow>();
  analyticsFilteredItems.value.forEach((it) => {
    const key = toKey(it.userId) || '-';
    const prev = map.get(key) || { key, count: 0, credits: 0, tokens: 0 };
    prev.count += 1;
    const d = toNum(it.creditsDelta);
    if (d > 0) prev.credits += d;
    prev.tokens += toNum(it.tokensTotal) || toNum(it.tokensIn) + toNum(it.tokensOut);
    map.set(key, prev);
  });
  return Array.from(map.values())
    .sort((a, b) => b.credits - a.credits || b.count - a.count)
    .slice(0, 10)
    .map((r) => ({ ...r, credits: Math.round(r.credits * 100) / 100 }));
});

const topModelsColumns = computed(() => [
  { title: ui.value.model, dataIndex: 'key', key: 'key', ellipsis: true },
  { title: ui.value.statRequests, dataIndex: 'count', key: 'count', width: 100, align: 'right' },
  { title: ui.value.statCredits, dataIndex: 'credits', key: 'credits', width: 120, align: 'right' },
  { title: ui.value.statTokens, dataIndex: 'tokens', key: 'tokens', width: 140, align: 'right' }
]);

const topUsersColumns = computed(() => [
  { title: ui.value.userId, dataIndex: 'key', key: 'key', ellipsis: true },
  { title: ui.value.statRequests, dataIndex: 'count', key: 'count', width: 100, align: 'right' },
  { title: ui.value.statCredits, dataIndex: 'credits', key: 'credits', width: 120, align: 'right' },
  { title: ui.value.statTokens, dataIndex: 'tokens', key: 'tokens', width: 140, align: 'right' }
]);

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

const fetchAnalytics = async () => {
  if (analyticsLoading.value) return;
  analyticsLoading.value = true;
  try {
    const from = dateRange.value?.[0]?.valueOf ? dateRange.value[0].valueOf() : undefined;
    const to = dateRange.value?.[1]?.valueOf ? dateRange.value[1].valueOf() : undefined;
    const cap = 2000;
    const pageSize = 200;
    let offset = 0;
    const all: AdminUsageLedgerItem[] = [];
    while (all.length < cap) {
      await consoleStore.fetchAdminUsageLedger({
        userId: filterUserId.value,
        from,
        to,
        limit: pageSize,
        offset
      });
      const batch = Array.isArray(consoleStore.adminUsage) ? consoleStore.adminUsage : [];
      if (batch.length === 0) break;
      all.push(...batch);
      offset += batch.length;
      if (batch.length < pageSize) break;
      if (offset >= consoleStore.adminUsageTotal && consoleStore.adminUsageTotal > 0) break;
    }
    analyticsItems.value = all.slice(0, cap);
    analyticsEnabled.value = true;
    void fetchUsage();
  } catch (e) {
    showAdminError(e);
  } finally {
    analyticsLoading.value = false;
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

const exportCsv = () => {
  const rows = analyticsFilteredItems.value;
  const headers = [
    'ts',
    'requestId',
    'userId',
    'trigger',
    'provider',
    'model',
    'status',
    'durationMs',
    'tokensIn',
    'tokensOut',
    'tokensTotal',
    'creditsDelta',
    'ip',
    'usedUrl'
  ];
  const esc = (v: any) => {
    const s = String(v ?? '');
    const needs = /[",\n\r]/.test(s);
    const t = s.replace(/"/g, '""');
    return needs ? `"${t}"` : t;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = (r as any)[h];
          if (h === 'ts') return esc(val ? new Date(toNum(val)).toISOString() : '');
          return esc(val);
        })
        .join(',')
    )
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `usage_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
</script>

<style scoped>
.chart {
  height: 100%;
  width: 100%;
}

@media (max-width: 768px) {
  .usage-toolbar :deep(.ant-input),
  .usage-toolbar :deep(.ant-picker),
  .usage-toolbar :deep(.ant-select),
  .usage-toolbar :deep(.ant-btn) {
    width: 100% !important;
  }

  .usage-toolbar :deep(.ant-switch) {
    width: auto !important;
  }

  .usage-trend-toolbar :deep(.ant-radio-group) {
    width: 100%;
    display: flex;
  }

  .usage-trend-toolbar :deep(.ant-radio-button-wrapper) {
    flex: 1 1 50%;
    text-align: center;
  }

  .chart {
    height: 240px;
  }

  :deep(.ant-modal) {
    width: 100% !important;
    max-width: 100% !important;
    top: 0;
    padding-bottom: 0;
  }

  :deep(.ant-modal-content) {
    min-height: 100vh;
    border-radius: 0;
  }

  :deep(.ant-modal-body) {
    padding: 16px;
  }

  :deep(.ant-descriptions-item-label),
  :deep(.ant-descriptions-item-content) {
    font-size: 12px;
  }

  :deep(.ant-pagination) {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  :deep(.ant-pagination-item),
  :deep(.ant-pagination-prev),
  :deep(.ant-pagination-next) {
    min-width: 32px;
    height: 32px;
    line-height: 32px;
  }

  :deep(.ant-pagination-item a) {
    line-height: 32px;
  }

  :deep(.ant-pagination-options),
  :deep(.ant-pagination-total-text),
  :deep(.ant-pagination-options-quick-jumper) {
    display: none !important;
  }
}
@media (max-width: 480px) {
  .usage-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .usage-toolbar > * {
    width: 100% !important;
    margin-right: 0 !important;
  }
}
</style>
