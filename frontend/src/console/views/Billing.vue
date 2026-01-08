<template>
  <div>
    <a-typography-title :level="2">Billing & Credits</a-typography-title>

    <a-card title="Recharge Credits" :bordered="false" style="background: transparent">
      <a-row :gutter="[24, 24]">
        <a-col :span="24" :md="8" v-for="pkg in packages" :key="pkg.id">
          <div
            class="pricing-card"
            :class="{ featured: pkg.featured }"
            @click="currentPackage = pkg"
          >
            <div class="featured-tag" v-if="pkg.featured">RECOMMENDED</div>
            <h3 class="pkg-credits">{{ pkg.credits }} Credits</h3>
            <div class="pkg-price">¥{{ pkg.price }}</div>
            <ul class="pkg-features">
              <li><check-circle-outlined /> {{ Math.floor(pkg.credits / 1) }} standard images</li>
              <li><check-circle-outlined /> Valid forever</li>
              <li><check-circle-outlined /> Priority support</li>
            </ul>
            <a-button
              :type="pkg.featured ? 'primary' : 'default'"
              block
              size="large"
              :loading="paying && currentPackage?.id === pkg.id"
              @click.stop="handlePay(pkg)"
            >
              Recharge Now
            </a-button>
          </div>
        </a-col>
      </a-row>
    </a-card>

    <div style="margin-top: 48px">
      <a-typography-title :level="4">Order History</a-typography-title>
      <a-table :columns="columns" :data-source="orders" row-key="orderId" :loading="loadingOrders">
        <template #bodyCell="{ column }">
          <template v-if="column.key === 'status'">
            <a-tag color="green">SUCCESS</a-tag>
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
import { useAuth } from '@/agent/composables/useAuth';
import { getCurrentUserId } from '@/login/session';
import { useConsoleStore } from '@/stores/console';

const { currentUser } = useAuth();
const userId = computed(() => currentUser.value?.userId || getCurrentUserId());
const consoleStore = useConsoleStore();

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

const columns = [
  { title: 'Order ID', dataIndex: 'orderId', key: 'orderId' },
  {
    title: 'Time',
    dataIndex: 'createdAt',
    key: 'createdAt',
    customRender: ({ text }: any) => new Date(text).toLocaleString()
  },
  {
    title: 'Amount',
    dataIndex: 'credits',
    key: 'credits',
    customRender: ({ text }: any) => `+${text} Credits`
  },
  { title: 'Status', key: 'status' }
];

onMounted(() => {
  consoleStore.init();
});

const handlePay = async (pkg: any) => {
  paying.value = true;
  currentPackage.value = pkg;

  // Simulate API call
  setTimeout(() => {
    consoleStore.updatePoints(
      userId.value,
      pkg.credits,
      'recharge',
      `Purchased ${pkg.credits} Credits Package`
    );
    message.success('Recharge successful!');
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
