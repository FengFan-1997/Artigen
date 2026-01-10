<template>
  <div>
    <a-typography-title :level="2">{{ ui.title }}</a-typography-title>

    <a-card :title="ui.rechargeCredits" :bordered="false" style="background: transparent">
      <a-row :gutter="[24, 24]">
        <a-col :span="24" :md="8" v-for="pkg in packages" :key="pkg.id">
          <div
            class="pricing-card"
            :class="{ featured: pkg.featured }"
            @click="currentPackage = pkg"
          >
            <div class="featured-tag" v-if="pkg.featured">{{ ui.recommended }}</div>
            <h3 class="pkg-credits">{{ pkg.credits }} {{ ui.credits }}</h3>
            <div class="pkg-price">¥{{ pkg.price }}</div>
            <ul class="pkg-features">
              <li>
                <check-circle-outlined /> {{ getStandardImagesText(Math.floor(pkg.credits / 1)) }}
              </li>
              <li><check-circle-outlined /> {{ ui.validForever }}</li>
              <li><check-circle-outlined /> {{ ui.prioritySupport }}</li>
            </ul>
            <a-button
              :type="pkg.featured ? 'primary' : 'default'"
              block
              size="large"
              :loading="paying && currentPackage?.id === pkg.id"
              @click.stop="handlePay(pkg)"
            >
              {{ ui.rechargeNow }}
            </a-button>
          </div>
        </a-col>
      </a-row>
    </a-card>

    <div style="margin-top: 48px">
      <a-typography-title :level="4">{{ ui.orderHistory }}</a-typography-title>
      <a-table :columns="columns" :data-source="orders" row-key="orderId" :loading="loadingOrders">
        <template #bodyCell="{ column }">
          <template v-if="column.key === 'status'">
            <a-tag color="green">{{ ui.success }}</a-tag>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { message } from 'ant-design-vue';
import { CheckCircleOutlined } from '@ant-design/icons-vue';
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
        title: '计费与点数',
        rechargeCredits: '点数充值',
        recommended: '推荐',
        credits: '点数',
        validForever: '永久有效',
        prioritySupport: '优先支持',
        rechargeNow: '立即充值',
        orderHistory: '订单记录',
        success: '成功',
        colOrderId: '订单号',
        colTime: '时间',
        colAmount: '数量',
        colStatus: '状态',
        rechargeSuccess: '充值成功！',
        purchasedPkg: (credits: number) => `购买 ${credits} 点数套餐`
      }
    : {
        title: 'Billing & Credits',
        rechargeCredits: 'Recharge Credits',
        recommended: 'RECOMMENDED',
        credits: 'Credits',
        validForever: 'Valid forever',
        prioritySupport: 'Priority support',
        rechargeNow: 'Recharge Now',
        orderHistory: 'Order History',
        success: 'SUCCESS',
        colOrderId: 'Order ID',
        colTime: 'Time',
        colAmount: 'Amount',
        colStatus: 'Status',
        rechargeSuccess: 'Recharge successful!',
        purchasedPkg: (credits: number) => `Purchased ${credits} Credits Package`
      }
);

const orders = computed(() => {
  return consoleStore
    .getUserTransactions(userId.value)
    .filter((t) => t.type === 'recharge')
    .map((t) => ({
      orderId: t.id,
      createdAt: t.timestamp,
      credits: t.amount,
      status: 'success'
    }));
});

const loadingOrders = ref(false);
const paying = ref(false);

const packages = [
  { id: 'p1', credits: 100, price: 9.9, featured: false },
  { id: 'p2', credits: 500, price: 39.9, featured: true },
  { id: 'p3', credits: 2000, price: 129.9, featured: false }
];
const currentPackage = ref<any>(null);

const columns = computed(() => [
  { title: ui.value.colOrderId, dataIndex: 'orderId', key: 'orderId' },
  {
    title: ui.value.colTime,
    dataIndex: 'createdAt',
    key: 'createdAt',
    customRender: ({ text }: any) => new Date(text).toLocaleString()
  },
  {
    title: ui.value.colAmount,
    dataIndex: 'credits',
    key: 'credits',
    customRender: ({ text }: any) => `+${text} ${ui.value.credits}`
  },
  { title: ui.value.colStatus, key: 'status' }
]);

onMounted(() => {
  consoleStore.init();
});

const getStandardImagesText = (n: number) => {
  return currentLang.value === 'zh' ? `${n} 张标准出图` : `${n} standard images`;
};

const handlePay = async (pkg: any) => {
  paying.value = true;
  currentPackage.value = pkg;

  // Simulate API call
  setTimeout(() => {
    consoleStore.updatePoints(
      userId.value,
      pkg.credits,
      'recharge',
      ui.value.purchasedPkg(pkg.credits)
    );
    message.success(ui.value.rechargeSuccess);
    paying.value = false;
    currentPackage.value = null;
  }, 1500);
};
</script>

<style scoped>
.pricing-card {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.pricing-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-4px);
  border-color: #1890ff;
}

.pricing-card.featured {
  border: 2px solid #1890ff;
  background: #f0f5ff;
}

.featured-tag {
  position: absolute;
  top: 12px;
  right: -30px;
  background: #1890ff;
  color: #fff;
  padding: 4px 30px;
  transform: rotate(45deg);
  font-size: 12px;
  font-weight: bold;
}

.pkg-credits {
  font-size: 24px;
  color: #333;
  margin-bottom: 8px;
}

.pkg-price {
  font-size: 36px;
  font-weight: bold;
  color: #1890ff;
  margin-bottom: 24px;
}

.pkg-features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
  text-align: left;
  color: #666;
}

.pkg-features li {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pkg-features .anticon {
  color: #52c41a;
}
</style>
