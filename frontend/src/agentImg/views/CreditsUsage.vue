<template>
  <div class="usage-page">
    <TitleBar>
      <template #actions>
        <button class="nth-login-btn" type="button" @click="openAccountPopup('orders')">
          {{ ui.myOrders }}
        </button>
      </template>
    </TitleBar>

    <div class="usage-container">
      <header class="usage-header">
        <div class="usage-title">{{ ui.title }}</div>
        <div class="usage-actions">
          <button class="nth-login-btn" type="button" :disabled="loading" @click="loadHolds">
            {{ loading ? ui.loading : ui.refresh }}
          </button>
          <router-link class="nth-login-btn primary" to="/artigen/market">{{
            ui.goMarket
          }}</router-link>
        </div>
      </header>

      <div class="usage-sub">
        <span>{{ ui.userIdLabel }}</span>
        <span class="mono">{{ userIdText }}</span>
      </div>

      <div class="usage-filters">
        <button
          class="filter-btn"
          type="button"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          {{ ui.filterAll }} <span class="mono">{{ counts.all }}</span>
        </button>
        <button
          class="filter-btn"
          type="button"
          :class="{ active: filter === 'frozen' }"
          @click="filter = 'frozen'"
        >
          {{ ui.filterFrozen }} <span class="mono">{{ counts.frozen }}</span>
        </button>
        <button
          class="filter-btn"
          type="button"
          :class="{ active: filter === 'confirmed' }"
          @click="filter = 'confirmed'"
        >
          {{ ui.filterCharged }} <span class="mono">{{ counts.confirmed }}</span>
        </button>
        <button
          class="filter-btn"
          type="button"
          :class="{ active: filter === 'refunded' }"
          @click="filter = 'refunded'"
        >
          {{ ui.filterRefunded }} <span class="mono">{{ counts.refunded }}</span>
        </button>
      </div>

      <div v-if="errorText" class="usage-error">{{ errorText }}</div>

      <div v-else-if="!filteredHolds.length && !loading" class="usage-empty">{{ ui.empty }}</div>

      <div v-else class="usage-list">
        <div v-for="h in filteredHolds" :key="h.id" class="usage-card">
          <div class="usage-row">
            <div class="label">{{ ui.amount }}</div>
            <div class="value">
              <span class="status-pill" :class="`st-${h.status}`">{{ statusText(h.status) }}</span>
              <span class="mono amount" :class="amountClass(h.status)">{{ amountText(h) }}</span>
            </div>
          </div>

          <div class="usage-row">
            <div class="label">{{ ui.reason }}</div>
            <div class="mono">{{ reasonText(h.reason) }}</div>
          </div>

          <div class="usage-row">
            <div class="label">{{ ui.holdId }}</div>
            <div class="value">
              <div class="mono">{{ h.id }}</div>
              <button class="mini-btn" type="button" @click="copyText(h.id, `hid:${h.id}`)">
                {{ copiedKey === `hid:${h.id}` ? ui.copied : ui.copy }}
              </button>
            </div>
          </div>

          <div class="usage-row">
            <div class="label">{{ ui.requestId }}</div>
            <div class="value">
              <div class="mono">{{ h.requestId || '--' }}</div>
              <button
                class="mini-btn"
                type="button"
                :disabled="!h.requestId"
                @click="copyText(h.requestId, `rid:${h.id}`)"
              >
                {{ copiedKey === `rid:${h.id}` ? ui.copied : ui.copy }}
              </button>
            </div>
          </div>

          <div class="usage-row">
            <div class="label">{{ ui.time }}</div>
            <div class="mono">{{ formatTime(h.createdAt) }}</div>
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
import { getCreditsHolds, type CreditsHold, type CreditsHoldStatus } from '@/points';

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
const holds = ref<CreditsHold[]>([]);
const errorText = ref('');
const copiedKey = ref('');

type FilterKey = 'all' | CreditsHoldStatus;
const filter = ref<FilterKey>('all');

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
  if (key === 'ai_design') return zh ? 'AI 设计' : 'AI Design';
  if (key === 'id_photo') return zh ? '智能证件照生成' : 'Smart ID Photo';
  if (key === 'old_photo') return zh ? '老照片修复' : 'Old Photo Restoration';
  if (key === 'chat') return zh ? '对话' : 'Chat';
  if (key === 'recharge') return zh ? '充值' : 'Recharge';
  if (key === 'admin_gift') return zh ? '赠送' : 'Gift';
  return r;
};

const counts = computed(() => {
  const list = holds.value || [];
  let frozen = 0;
  let confirmed = 0;
  let refunded = 0;
  for (const h of list) {
    if (h.status === 'confirmed') confirmed++;
    else if (h.status === 'refunded') refunded++;
    else frozen++;
  }
  return { all: list.length, frozen, confirmed, refunded };
});

const filteredHolds = computed(() => {
  const f = filter.value;
  if (f === 'all') return holds.value;
  return holds.value.filter((h) => h.status === f);
});

const copyText = async (text: string, key: string) => {
  const v = String(text || '').trim();
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    copiedKey.value = key;
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = '';
    }, 1200);
  } catch {}
};

const loadHolds = async () => {
  const ok = ensureAuthed(() => loadHolds());
  if (!ok) return;
  if (loading.value) return;
  loading.value = true;
  errorText.value = '';
  try {
    const list = await getCreditsHolds(200);
    if (!list) {
      errorText.value = ui.value.loadFailed;
      holds.value = [];
      return;
    }
    holds.value = list;
    if (filter.value !== 'all' && !holds.value.some((h) => h.status === filter.value)) {
      filter.value = 'all';
    }
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
  loadHolds();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});

const ui = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      title: '点数明细',
      userIdLabel: '用户ID：',
      amount: '变动',
      reason: '原因',
      holdId: '冻结ID',
      requestId: '请求ID',
      time: '时间',
      refresh: '刷新',
      loading: '加载中...',
      goMarket: '去算力商城',
      myOrders: '我的订单',
      filterAll: '全部',
      filterFrozen: '冻结',
      filterCharged: '扣费',
      filterRefunded: '退款',
      copy: '复制',
      copied: '已复制',
      empty: '暂无记录。',
      loadFailed: '加载失败：请稍后重试。'
    };
  }
  return {
    title: 'Credits Usage',
    userIdLabel: 'UserId:',
    amount: 'Amount',
    reason: 'Reason',
    holdId: 'HoldId',
    requestId: 'RequestId',
    time: 'Time',
    refresh: 'Refresh',
    loading: 'Loading...',
    goMarket: 'Go to Market',
    myOrders: 'My Orders',
    filterAll: 'All',
    filterFrozen: 'Frozen',
    filterCharged: 'Charged',
    filterRefunded: 'Refunded',
    copy: 'Copy',
    copied: 'Copied',
    empty: 'No records yet.',
    loadFailed: 'Failed to load. Please try again later.'
  };
});
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.usage-page {
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: var(--common-font);
  background-image:
    linear-gradient(rgba(204, 255, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(204, 255, 0, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

.usage-container {
  max-width: 980px;
  margin: 0 auto;
  padding: 40px 24px 80px 24px;
}

.usage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.usage-title {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.5px;
}

.usage-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.usage-sub {
  color: #94a3b8;
  font-family: var(--common-font);
  font-size: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 18px;
}

.usage-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.filter-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  font-family: var(--common-font);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.filter-btn.active {
  border-color: rgba(204, 255, 0, 0.7);
  color: rgba(204, 255, 0, 0.95);
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.12);
}

.amount.positive {
  color: rgba(34, 197, 94, 0.95);
}

.amount.negative {
  color: rgba(239, 68, 68, 0.95);
}

.mono {
  font-family: var(--common-font);
}

.usage-error {
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(127, 29, 29, 0.2);
  color: #fca5a5;
  padding: 12px 14px;
  border-radius: 12px;
  font-family: var(--common-font);
  font-size: 12px;
}

.usage-empty {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.25);
  color: #94a3b8;
  padding: 14px 16px;
  border-radius: 12px;
  font-family: var(--common-font);
  font-size: 12px;
}

.usage-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.usage-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 12, 12, 0.75);
  border-radius: 14px;
  padding: 14px 14px;
}

.usage-row {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}

.usage-row:last-child {
  margin-bottom: 0;
}

.label {
  color: #94a3b8;
  font-family: var(--common-font);
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
  font-family: var(--common-font);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  flex: 0 0 auto;
}

.mini-btn:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.status-pill {
  height: 26px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-family: var(--common-font);
  font-size: 12px;
  color: rgba(241, 245, 249, 0.92);
  background: rgba(0, 0, 0, 0.2);
  flex: 0 0 auto;
}

.status-pill.st-frozen {
  border-color: rgba(250, 204, 21, 0.35);
  color: rgba(250, 204, 21, 0.95);
}

.status-pill.st-confirmed {
  border-color: rgba(239, 68, 68, 0.35);
  color: rgba(239, 68, 68, 0.95);
}

.status-pill.st-refunded {
  border-color: rgba(34, 197, 94, 0.35);
  color: rgba(34, 197, 94, 0.95);
}
</style>
