<template>
  <div class="orders-page">
    <TitleBar>
      <template #actions>
        <button class="nth-login-btn" type="button" @click="openAccountPopup('usage')">
          {{ ui.creditsUsage }}
        </button>
      </template>
    </TitleBar>

    <div class="orders-container">
      <header class="orders-header">
        <div class="orders-title">{{ ui.title }}</div>
        <div class="orders-actions">
          <button class="nth-login-btn" type="button" :disabled="loading" @click="loadOrders">
            {{ loading ? ui.loading : ui.refresh }}
          </button>
          <button class="nth-login-btn" type="button" @click="openAccountPopup('usage')">
            {{ ui.creditsUsage }}
          </button>
          <router-link class="nth-login-btn primary" to="/artigen/market">{{
            ui.goMarket
          }}</router-link>
        </div>
      </header>

      <div class="orders-sub">
        <span>{{ ui.userIdLabel }}</span>
        <span class="mono">{{ userIdText }}</span>
      </div>

      <div v-if="errorText" class="orders-error">{{ errorText }}</div>

      <div v-else-if="!orders.length && !loading" class="orders-empty">{{ ui.empty }}</div>

      <div v-else class="orders-list">
        <div v-for="o in orders" :key="o.afdianOrderId" class="order-card">
          <div class="order-row">
            <div class="label">{{ ui.orderId }}</div>
            <div class="value">
              <div class="mono">{{ o.afdianOrderId }}</div>
              <button
                class="mini-btn"
                type="button"
                @click="copyText(o.afdianOrderId, o.afdianOrderId)"
              >
                {{ copiedId === o.afdianOrderId ? ui.copied : ui.copy }}
              </button>
            </div>
          </div>
          <div class="order-row">
            <div class="label">{{ ui.credits }}</div>
            <div class="mono">+{{ o.credits }}</div>
          </div>
          <div class="order-row">
            <div class="label">{{ ui.time }}</div>
            <div class="mono">{{ formatTime(o.createdAt) }}</div>
          </div>
        </div>
      </div>
    </div>

    <GlobalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import TitleBar from '../components/TitleBar.vue';
import GlobalFooter from '../components/GlobalFooter.vue';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import { getCreditsOrders, type CreditsOrder } from '@/points';

const router = useRouter();
const loginStore = useLoginModel();

const openAccountPopup = (tab?: 'orders' | 'usage') => {
  try {
    window.dispatchEvent(
      new CustomEvent('app-account-popup-open', tab ? { detail: { tab } } : undefined)
    );
  } catch {}
};

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const loading = ref(false);
const orders = ref<CreditsOrder[]>([]);
const errorText = ref('');
const copiedId = ref('');

const userIdText = computed(() => {
  const uid = String(getCurrentUserId() || '').trim();
  return uid || '--';
});

const ensureAuthed = (afterLogin: () => void | Promise<void>) => {
  if (isLocalLoggedIn()) return true;
  loginStore.open({ mode: 'login', returnTo: router.currentRoute.value.fullPath, afterLogin });
  return false;
};

const formatTime = (ts: number) => {
  const n = Number(ts) || 0;
  if (!n) return '--';
  try {
    return new Date(n).toLocaleString();
  } catch {
    return '--';
  }
};

const copyText = async (text: string, key: string) => {
  const v = String(text || '').trim();
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    copiedId.value = key;
    window.setTimeout(() => {
      if (copiedId.value === key) copiedId.value = '';
    }, 1200);
  } catch {}
};

const loadOrders = async () => {
  const ok = ensureAuthed(() => loadOrders());
  if (!ok) return;
  if (loading.value) return;
  loading.value = true;
  errorText.value = '';
  try {
    const list = await getCreditsOrders();
    if (!list) {
      errorText.value = ui.value.loadFailed;
      orders.value = [];
      return;
    }
    orders.value = list;
  } finally {
    loading.value = false;
  }
};

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  router.push('/artigen/ai');
};

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  loadOrders();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});

const ui = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      title: '我的订单',
      userIdLabel: '用户ID：',
      orderId: '订单号',
      credits: '点数',
      time: '时间',
      refresh: '刷新',
      loading: '加载中...',
      goMarket: '去算力商城',
      creditsUsage: '点数明细',
      copy: '复制',
      copied: '已复制',
      empty: '暂无订单记录。',
      loadFailed: '加载失败：请稍后重试。'
    };
  }
  return {
    title: 'My Orders',
    userIdLabel: 'UserId:',
    orderId: 'OrderId',
    credits: 'Credits',
    time: 'Time',
    refresh: 'Refresh',
    loading: 'Loading...',
    goMarket: 'Go to Market',
    creditsUsage: 'Credits Usage',
    copy: 'Copy',
    copied: 'Copied',
    empty: 'No orders yet.',
    loadFailed: 'Failed to load. Please try again later.'
  };
});
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.orders-page {
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: 'Inter', sans-serif;
  background-image:
    linear-gradient(rgba(204, 255, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(204, 255, 0, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

.orders-container {
  max-width: 980px;
  margin: 0 auto;
  padding: 40px 24px 80px 24px;
}

.orders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.orders-title {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.5px;
}

.orders-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.orders-sub {
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 18px;
}

.mono {
  font-family:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
}

.orders-error {
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(127, 29, 29, 0.2);
  color: #fca5a5;
  padding: 12px 14px;
  border-radius: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.orders-empty {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.25);
  color: #94a3b8;
  padding: 14px 16px;
  border-radius: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.orders-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.order-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.75);
  border-radius: 14px;
  padding: 14px 14px;
}

.order-row {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}

.order-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.value {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.value .mono {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.mini-btn {
  height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  flex: 0 0 auto;
}

.mini-btn:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}
</style>
