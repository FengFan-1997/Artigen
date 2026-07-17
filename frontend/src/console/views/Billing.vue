<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-alert
      type="info"
      show-icon
      :message="ui.canonicalTitle"
      :description="ui.canonicalDescription"
    />

    <a-card :title="ui.actionsTitle" style="margin-top: 24px">
      <a-space wrap>
        <a-button type="primary" @click="router.push('/artigen/market')">
          {{ ui.openMarket }}
        </a-button>
        <a-button @click="router.push('/console/users')">
          {{ ui.openUsers }}
        </a-button>
        <a-button @click="router.push('/console/usage')">
          {{ ui.openUsage }}
        </a-button>
      </a-space>
    </a-card>

    <a-card :title="ui.safetyTitle" style="margin-top: 16px">
      <a-typography-paragraph>{{ ui.safetyDescription }}</a-typography-paragraph>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const router = useRouter();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        title: '计费与点数',
        canonicalTitle: '控制台不创建充值或模拟入账',
        canonicalDescription:
          '套餐、报价和支付订单只来自服务端 PostgreSQL。购买请进入点数商城；按用户核对订单、余额和冻结记录请进入用户管理。',
        actionsTitle: '真实业务入口',
        openMarket: '打开点数商城',
        openUsers: '查看用户与钱包',
        openUsage: '查看用量记录',
        safetyTitle: '财务安全边界',
        safetyDescription:
          '后台余额调整必须生成不可变账本和审计记录。此页面不会在浏览器本地增加点数，也不会用假订单展示“充值成功”。'
      }
    : {
        title: 'Billing & Credits',
        canonicalTitle: 'The console never creates mock payments or credits',
        canonicalDescription:
          'Packages, quotes, and payment orders come only from PostgreSQL-backed server APIs. Use the credit market to purchase, or User Management to inspect canonical orders, wallets, and holds.',
        actionsTitle: 'Canonical business entry points',
        openMarket: 'Open Credit Market',
        openUsers: 'View Users & Wallets',
        openUsage: 'View Usage',
        safetyTitle: 'Financial safety boundary',
        safetyDescription:
          'Admin balance adjustments always append an immutable ledger and audit event. This page never grants browser-local credits or displays a fake successful order.'
      }
);
</script>
