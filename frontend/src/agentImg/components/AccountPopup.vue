<template>
  <transition name="popup-fade">
    <div v-if="open" class="account-overlay" @click="close">
      <div class="account-card" @click.stop>
        <section class="left-pane">
          <header class="left-header">
            <div class="left-title">{{ ui.title }}</div>
            <button class="icon-btn" type="button" @click="close">✕</button>
          </header>

          <div class="user-block">
            <div class="row">
              <div class="label">{{ ui.userId }}</div>
              <div class="mono">{{ userIdText }}</div>
            </div>
            <div class="balance-grid">
              <div class="balance-item">
                <div class="balance-label">{{ ui.available }}</div>
                <div class="balance-value mono">{{ availableText }}</div>
              </div>
              <div class="balance-item">
                <div class="balance-label">{{ ui.frozen }}</div>
                <div class="balance-value mono">{{ frozenText }}</div>
              </div>
            </div>

            <div class="left-actions">
              <button
                class="btn btn-text-center"
                type="button"
                :disabled="balanceLoading"
                @click="refreshBalance"
              >
                {{ balanceLoading ? ui.loading : ui.refreshCredits }}
              </button>
              <button class="btn primary btn-text-center" type="button" @click="goMarket">
                {{ ui.goMarket }}
              </button>
              <button class="btn danger btn-text-center" type="button" @click="handleLogout">
                {{ ui.logout }}
              </button>
            </div>
          </div>
        </section>

        <section class="right-pane">
          <header class="tabs">
            <div class="tabs-center">
              <button
                class="tab"
                type="button"
                :class="{ active: activeTab === 'orders' }"
                @click="activeTab = 'orders'"
              >
                {{ ui.myOrders }}
              </button>
              <button
                class="tab"
                type="button"
                :class="{ active: activeTab === 'usage' }"
                @click="activeTab = 'usage'"
              >
                {{ ui.creditsUsage }}
              </button>
            </div>
            <div class="tabs-actions">
              <button
                v-if="activeTab === 'orders'"
                class="mini-btn btn"
                type="button"
                :disabled="ordersLoading"
                @click="loadOrders"
              >
                {{ ordersLoading ? ui.loading : ui.refresh }}
              </button>
              <button
                v-else
                class="mini-btn btn"
                type="button"
                :disabled="holdsLoading"
                @click="loadHolds"
              >
                {{ holdsLoading ? ui.loading : ui.refresh }}
              </button>
            </div>
          </header>

          <div class="panel">
            <div v-if="activeTab === 'orders'" class="panel-body">
              <div v-if="ordersError" class="panel-error">{{ ordersError }}</div>
              <div v-else-if="!orders.length && !ordersLoading" class="panel-empty">
                {{ ui.emptyOrders }}
              </div>
              <div v-else class="list">
                <div v-for="o in orders" :key="o.afdianOrderId" class="item-card">
                  <div class="item-row">
                    <div class="item-label">{{ ui.orderId }}</div>
                    <div class="mono item-value">{{ o.afdianOrderId }}</div>
                  </div>
                  <div class="item-row">
                    <div class="item-label">{{ ui.credits }}</div>
                    <div class="mono item-value positive">+{{ o.credits }}</div>
                  </div>
                  <div class="item-row">
                    <div class="item-label">{{ ui.time }}</div>
                    <div class="mono item-value">{{ formatTime(o.createdAt) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="panel-body no-scroll">
              <div v-if="holdsError" class="panel-error">{{ holdsError }}</div>
              <div v-else-if="!holds.length && !holdsLoading" class="panel-empty">
                {{ ui.emptyUsage }}
              </div>
              <div v-else class="list">
                <div v-for="h in holds" :key="h.id" class="item-card">
                  <div class="item-row">
                    <div class="item-label">{{ ui.amount }}</div>
                    <div class="item-value">
                      <span class="status-pill" :class="`st-${h.status}`">{{
                        statusText(h.status)
                      }}</span>
                      <span class="mono amount" :class="amountClass(h.status)">{{
                        amountText(h)
                      }}</span>
                    </div>
                  </div>
                  <div class="item-row">
                    <div class="item-label">{{ ui.reason }}</div>
                    <div class="mono item-value">{{ reasonText(h.reason) }}</div>
                  </div>
                  <div class="item-row">
                    <div class="item-label">{{ ui.time }}</div>
                    <div class="mono item-value">{{ formatTime(h.createdAt) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { getCurrentUserId, isLocalLoggedIn, logoutLocal } from '@/login/session';
import {
  getCreditsBalance,
  getCreditsHolds,
  getCreditsOrders,
  type CreditsBalance,
  type CreditsHold,
  type CreditsHoldStatus,
  type CreditsOrder
} from '@/points';

type TabKey = 'orders' | 'usage';

const router = useRouter();
const route = useRoute();
const loginStore = useLoginModel();

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const open = ref(false);
const activeTab = ref<TabKey>('orders');

const balanceLoading = ref(false);
const balance = ref<CreditsBalance | null>(null);

const ordersLoading = ref(false);
const orders = ref<CreditsOrder[]>([]);
const ordersError = ref('');

const holdsLoading = ref(false);
const holds = ref<CreditsHold[]>([]);
const holdsError = ref('');

const isAuthed = computed(() => isLocalLoggedIn());

const userIdText = computed(() => {
  const uid = String(getCurrentUserId() || '').trim();
  return uid || '--';
});

const availableText = computed(() => {
  if (balanceLoading.value && !balance.value) return '--';
  const n = Number(balance.value?.available ?? 0);
  if (!Number.isFinite(n)) return '--';
  return String(n);
});

const frozenText = computed(() => {
  if (balanceLoading.value && !balance.value) return '--';
  const n = Number(balance.value?.frozen ?? 0);
  if (!Number.isFinite(n)) return '--';
  return String(n);
});

const formatTime = (ts: number) => {
  const n = Number(ts) || 0;
  if (!n) return '--';
  try {
    return new Date(n).toLocaleString();
  } catch {
    return '--';
  }
};

const statusText = (st: CreditsHoldStatus) => {
  if (currentLang.value === 'zh') {
    if (st === 'confirmed') return '已扣费';
    if (st === 'refunded') return '已退款';
    return '已冻结';
  }
  if (st === 'confirmed') return 'Charged';
  if (st === 'refunded') return 'Refunded';
  return 'Frozen';
};

const amountText = (h: CreditsHold) => {
  const cost = Number(h.cost ?? 0) || 0;
  if (cost <= 0) return '--';
  if (h.status === 'refunded') return `+${cost}`;
  return `-${cost}`;
};

const amountClass = (st: CreditsHoldStatus) => {
  if (st === 'refunded') return 'positive';
  return 'negative';
};

const reasonText = (raw?: string) => {
  const r = String(raw || '').trim();
  if (!r) return '--';
  const key = r.toLowerCase();
  const zh = currentLang.value === 'zh';
  if (key === 'img2img') return zh ? '图片生成' : 'Image generation';
  if (key === 'generate') return zh ? '文本生成' : 'Text generation';
  if (key === 'ai_design') return zh ? '提示词优化' : 'Prompt Optimization';
  if (key === 'id_photo') return zh ? '智能证件照生成' : 'Smart ID Photo';
  if (key === 'old_photo') return zh ? '老照片修复' : 'Old Photo Restoration';
  if (key === 'chat') return zh ? '对话' : 'Chat';
  if (key === 'recharge') return zh ? '充值' : 'Recharge';
  if (key === 'admin_gift') return zh ? '赠送' : 'Gift';
  return r;
};

const ui = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      title: '账号',
      userId: '用户ID',
      available: '可用点数',
      frozen: '冻结点数',
      refreshCredits: '刷新点数',
      goMarket: '去点数商城',
      logout: '退出登录',
      myOrders: '我的订单',
      creditsUsage: '点数明细',
      refresh: '刷新',
      loading: '加载中...',
      emptyOrders: '暂无订单记录。',
      emptyUsage: '暂无点数记录。',
      orderId: '订单号',
      credits: '点数',
      time: '时间',
      amount: '金额',
      reason: '原因'
    };
  }
  return {
    title: 'Account',
    userId: 'UserId',
    available: 'Available',
    frozen: 'Frozen',
    refreshCredits: 'Refresh Credits',
    goMarket: 'Go to Market',
    logout: 'Logout',
    myOrders: 'My Orders',
    creditsUsage: 'Credits Usage',
    refresh: 'Refresh',
    loading: 'Loading...',
    emptyOrders: 'No orders yet.',
    emptyUsage: 'No usage yet.',
    orderId: 'OrderId',
    credits: 'Credits',
    time: 'Time',
    amount: 'Amount',
    reason: 'Reason'
  };
});

const close = () => {
  open.value = false;
};

const refreshBalance = async () => {
  if (!isAuthed.value) {
    balance.value = null;
    balanceLoading.value = false;
    return;
  }
  if (balanceLoading.value) return;
  balanceLoading.value = true;
  try {
    balance.value = await getCreditsBalance();
  } finally {
    balanceLoading.value = false;
  }
};

const loadOrders = async () => {
  if (!isAuthed.value) return;
  if (ordersLoading.value) return;
  ordersLoading.value = true;
  ordersError.value = '';
  try {
    const list = await getCreditsOrders();
    if (!list) {
      ordersError.value = currentLang.value === 'zh' ? '加载失败：请稍后重试。' : 'Failed to load.';
      orders.value = [];
      return;
    }
    orders.value = list.slice(0, 80);
  } finally {
    ordersLoading.value = false;
  }
};

const loadHolds = async () => {
  if (!isAuthed.value) return;
  if (holdsLoading.value) return;
  holdsLoading.value = true;
  holdsError.value = '';
  try {
    const list = await getCreditsHolds(120);
    if (!list) {
      holdsError.value = currentLang.value === 'zh' ? '加载失败：请稍后重试。' : 'Failed to load.';
      holds.value = [];
      return;
    }
    holds.value = list.slice(0, 120);
  } finally {
    holdsLoading.value = false;
  }
};

const ensureAuthed = (afterLogin: () => void | Promise<void>) => {
  if (isAuthed.value) return true;
  loginStore.open({ mode: 'login', returnTo: router.currentRoute.value.fullPath, afterLogin });
  return false;
};

const openPopup = async (tab?: TabKey) => {
  const ok = ensureAuthed(() => openPopup(tab));
  if (!ok) return;
  if (tab) activeTab.value = tab;
  open.value = true;
  void refreshBalance();
  void loadOrders();
  void loadHolds();
};

const goMarket = () => {
  close();
  router.push('/artigen/market');
};

const handleLogout = () => {
  close();
  logoutLocal({ redirectTo: route.fullPath || '/artigen' });
  try {
    window.dispatchEvent(new CustomEvent('app-auth-changed'));
  } catch {}
};

const onKeyDown = (e: KeyboardEvent) => {
  if (!open.value) return;
  if (e.key === 'Escape') close();
};

const onOpenEvent = (e: Event) => {
  const ce = e as CustomEvent<{ tab?: TabKey }>;
  const tab = ce?.detail?.tab;
  void openPopup(tab);
};

onMounted(() => {
  window.addEventListener('app-account-popup-open', onOpenEvent as EventListener);
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('app-account-popup-open', onOpenEvent as EventListener);
  window.removeEventListener('keydown', onKeyDown);
});

watch(
  () => route.fullPath,
  () => {
    if (!open.value) return;
    close();
  }
);
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: all 0.2s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.account-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.68);
  backdrop-filter: blur(8px);
  z-index: 220;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 92px 28px 28px 28px;
}

@media (max-width: 600px) {
  .account-overlay {
    justify-content: center;
    align-items: center;
    padding: 16px 12px;
  }
}

@media (max-width: 480px) {
  .account-overlay {
    align-items: center;
    padding: 12px 8px;
  }

  .account-card {
    width: 100%;
    max-width: calc(100vw - 16px);
    height: auto;
    max-height: calc(100vh - 24px);
    margin: 0 auto;
  }
}

@media (max-width: 350px) {
  .btn {
    padding: 0 4px;
    font-size: 11px;
    height: 36px;
  }
  .mini-btn,
  .tab {
    padding: 0 6px;
    font-size: 11px;
    min-width: 50px;
  }
  .tabs-actions {
    min-width: 60px;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.account-card {
  width: min(1200px, 100%);
  height: min(860px, calc(100vh - 60px));
  max-height: min(860px, calc(100vh - 60px));
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(8, 8, 8, 0.92);
  box-shadow:
    0 40px 120px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(255, 255, 255, 0.04);
  display: grid;
  grid-template-columns: 360px 1fr;
  overflow: hidden;
}

.left-pane {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(5, 5, 5, 0.55);
  display: flex;
  flex-direction: column;
  padding: 40px;
  gap: 40px;
}

.left-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.left-title {
  font-family: var(--common-font);
  font-weight: 900;
  letter-spacing: 0.5px;
  font-size: 32px;
  color: rgba(241, 245, 249, 0.95);
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.28);
  color: rgba(241, 245, 249, 0.92);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  border-color: rgba(204, 255, 0, 0.5);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(204, 255, 0, 0.95);
}

.user-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  margin-bottom: 8px;
}

.label {
  color: #94a3b8;
  font-family: var(--common-font);
  font-size: 16px;
  font-weight: 500;
}

.mono {
  font-family: var(--common-font);
  font-size: 16px;
  font-weight: 500;
  color: rgba(241, 245, 249, 0.95);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.balance-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.balance-item {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.65);
  border-radius: 14px;
  padding: 18px;
}

.balance-label {
  color: #94a3b8;
  font-family: var(--common-font);
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
}

.balance-value {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.4px;
}

.left-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
  flex: 1;
}

.btn {
  height: 56px;
  padding: 0 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  font-family: var(--common-font);
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.btn-text-center {
  text-align: center;
}

.btn:hover {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.06);
}

.btn.primary {
  border-color: rgba(204, 255, 0, 0.3);
}

.btn.primary:hover {
  border-color: rgba(204, 255, 0, 0.65);
  background: rgba(204, 255, 0, 0.08);
  color: rgba(204, 255, 0, 0.95);
}

.btn.danger {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
  color: #fca5a5;
  margin-top: auto;
}

.btn.danger:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
  color: #fff;
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.15);
}

.right-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.22);
}

@media (max-width: 500px) {
  .tabs {
    padding: 10px;
  }
}

.tabs-center {
  flex: 1;
  display: flex;
  gap: 10px;
  justify-content: flex-start;
}

@media (max-width: 500px) {
  .tabs-center {
    gap: 6px;
  }
}

.tabs-actions {
  display: flex;
  justify-content: flex-end;
  min-width: 120px;
}

@media (max-width: 500px) {
  .tabs-actions {
    min-width: 80px;
  }
}

.tab {
  height: 44px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  font-family: var(--common-font);
  font-size: 13px;
  font-weight: 800;
  min-width: 96px;
  cursor: pointer;
  transition: all 0.2s;
}

@media (max-width: 500px) {
  .tab {
    height: 36px;
    padding: 0 12px;
    font-size: 12px;
    min-width: 80px;
  }
}

.tab:hover {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.06);
}

.tab.active {
  border-color: rgba(204, 255, 0, 0.6);
  background: rgba(204, 255, 0, 0.08);
  color: rgba(204, 255, 0, 0.95);
}

.panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 14px;
}

.panel-body.no-scroll {
  overflow-x: hidden;
}

.mini-btn {
  height: 44px;
  padding: 0 18px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  font-family: var(--common-font);
  font-size: 13px;
  font-weight: 800;
  min-width: 96px;
  cursor: pointer;
  transition: all 0.2s;
}

@media (max-width: 500px) {
  .mini-btn {
    height: 36px;
    padding: 0 12px;
    font-size: 12px;
    min-width: 80px;
  }
}

.mini-btn:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.panel-error,
.panel-empty {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12px;
  padding: 12px 14px;
  font-family: var(--common-font);
  font-size: 12px;
  color: #94a3b8;
}

.panel-error {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(127, 29, 29, 0.2);
  color: #fca5a5;
}

.list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.item-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.75);
  border-radius: 14px;
  padding: 24px;
}

.item-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}

.item-row:last-child {
  margin-bottom: 0;
}

.item-label {
  color: #94a3b8;
  font-family: var(--common-font);
  font-size: 14px;
}

.item-value {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.positive {
  color: rgba(134, 239, 172, 0.95);
}

.negative {
  color: rgba(252, 165, 165, 0.95);
}

.amount {
  font-weight: 900;
}

.status-pill {
  height: 24px;
  padding: 0 12px;
  border-radius: 999px;
  font-family: var(--common-font);
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  flex: 0 0 auto;
}

.status-pill.st-frozen {
  border-color: rgba(148, 163, 184, 0.4);
  color: rgba(148, 163, 184, 0.95);
}

.status-pill.st-confirmed {
  border-color: rgba(239, 68, 68, 0.35);
  color: rgba(252, 165, 165, 0.95);
}

.status-pill.st-refunded {
  border-color: rgba(204, 255, 0, 0.35);
  color: rgba(204, 255, 0, 0.95);
}

@media (max-width: 900px) {
  .account-overlay {
    padding: 80px 16px 24px 16px;
    align-items: flex-start;
    justify-content: center;
  }

  .account-card {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: calc(100dvh - 100px);
    max-height: calc(100dvh - 100px);
    display: flex;
    flex-direction: column;
  }

  .left-pane {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 16px;
    flex-shrink: 0;
  }

  .right-pane {
    flex: 1;
    min-height: 0;
  }
}
</style>
