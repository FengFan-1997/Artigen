<template>
  <div>
    <a-typography-title :level="2">Overview</a-typography-title>

    <a-row :gutter="16">
      <a-col :span="8">
        <a-card>
          <a-statistic title="Current Balance" :value="userPoints" :precision="0" suffix="Credits">
            <template #prefix>
              <wallet-outlined />
            </template>
          </a-statistic>
          <a-button type="primary" style="margin-top: 16px" @click="router.push('/console/billing')"
            >Recharge</a-button
          >
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card>
          <a-statistic title="Account Level" :value="userLevel" />
          <div style="margin-top: 16px">
            <a-tag :color="getLevelColor(userLevel)">{{ userLevel.toUpperCase() }}</a-tag>
          </div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card>
          <a-statistic title="User ID" :value="userId" class="small-text-stat" />
          <div style="margin-top: 10px; color: #888">{{ userEmail }}</div>
        </a-card>
      </a-col>
    </a-row>

    <div style="margin-top: 24px">
      <a-row :gutter="16">
        <a-col :span="16">
          <a-card title="Usage Trend (Last 7 Days)">
            <div style="height: 300px">
              <v-chart class="chart" :option="chartOption" autoresize />
            </div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card title="Quick Actions">
            <a-space direction="vertical" style="width: 100%">
              <a-button block type="primary" @click="router.push('/console/playground')"
                >Try Playground</a-button
              >
              <a-button block @click="router.push('/console/usage')">View Full History</a-button>
              <a-button block @click="router.push('/console/users')">User Management</a-button>
            </a-space>
          </a-card>
        </a-col>
      </a-row>
    </div>

    <div style="margin-top: 24px">
      <a-typography-title :level="4">Recent Activity</a-typography-title>
      <a-table :columns="columns" :data-source="recentUsage" row-key="id" pagination="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { WalletOutlined } from '@ant-design/icons-vue';
import { useAuth } from '@/agent/composables/useAuth';
import { getCurrentUserId } from '@/login/session';
import { useConsoleStore } from '@/stores/console';

import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components';
import VChart from 'vue-echarts';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, TitleComponent]);

const router = useRouter();
const { currentUser } = useAuth();
const consoleStore = useConsoleStore();

const userId = computed(() => currentUser.value?.userId || getCurrentUserId());
const userPoints = computed(() => consoleStore.getCurrentUser?.points || 0);
const userLevel = computed(() => consoleStore.getCurrentUser?.level || 'free');
const userEmail = computed(() => consoleStore.getCurrentUser?.email || 'N/A');

const recentUsage = computed(() => {
  return consoleStore.getUserTransactions(userId.value).slice(0, 5);
});

const columns = [
  {
    title: 'Time',
    dataIndex: 'timestamp',
    key: 'timestamp',
    customRender: ({ text }: any) => new Date(text).toLocaleString()
  },
  { title: 'Type', dataIndex: 'type', key: 'type' },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  {
    title: 'Amount',
    dataIndex: 'amount',
    key: 'amount',
    customRender: ({ text }: any) => {
      const val = Number(text);
      return val > 0 ? `+${val}` : `${val}`;
    }
  }
];

const chartOption = computed(() => {
  const transactions = consoleStore.getUserTransactions(userId.value);

  // Group by day
  const dailyMap: Record<string, number> = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = 0;
  }

  transactions.forEach((t) => {
    if (t.amount < 0) {
      // Only count spending
      const key = new Date(t.timestamp).toISOString().split('T')[0];
      if (dailyMap[key] !== undefined) {
        dailyMap[key] += Math.abs(t.amount);
      }
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
      name: 'Points Spent'
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

const getLevelColor = (level: string) => {
  switch (level) {
    case 'enterprise':
      return 'purple';
    case 'pro':
      return 'blue';
    default:
      return 'green';
  }
};

onMounted(() => {
  consoleStore.init();
  // Ensure the user has 9999 points as requested if it's the first time
  // Actually consoleStore.init() does this for new users, but let's be safe
  if (
    userId.value &&
    (!consoleStore.getUserById(userId.value) ||
      consoleStore.getUserById(userId.value)!.points < 9999)
  ) {
    // If user exists but points < 9999, maybe we shouldn't force reset unless explicit?
    // But the prompt says "Finally give me an account 9999 points".
    // Let's assume this means "Ensure I have at least 9999".
    consoleStore.grantMaxPoints(userId.value);
  }
});
</script>

<style scoped>
.small-text-stat :deep(.ant-statistic-content-value) {
  font-size: 16px;
}
.chart {
  height: 100%;
  width: 100%;
}
</style>
