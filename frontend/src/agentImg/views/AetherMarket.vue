<template>
  <div class="market-page">
    <TitleBar />

    <div class="market-container">
      <header class="page-header">
        <div class="badge-row">
          <span class="badge-dot"></span>
          <span class="badge-text">{{ ui.navBtn }}</span>
        </div>

        <div class="title-stack">
          <h1 class="page-title">
            <span class="market-title-accent">{{ ui.pageTitle1 }}</span> {{ ui.pageTitle2 }}
            <span class="bolt">⚡</span>
          </h1>
          <p class="page-desc">{{ ui.subtitle }}</p>
        </div>
      </header>

      <div class="currency-toggle">
        <div class="toggle-bg">
          <button
            class="toggle-btn"
            :class="{ active: currency === 'USD' }"
            @click="currency = 'USD'"
          >
            US USD
          </button>
          <button
            class="toggle-btn"
            :class="{ active: currency === 'CNY' }"
            @click="currency = 'CNY'"
          >
            CN CNY
          </button>
        </div>
      </div>

      <div class="pricing-grid">
        <!-- Starter Pack -->
        <div class="pricing-card" v-if="!proOnly">
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">⚛️</span>
            </div>
            <h2>{{ ui.starterTitle }}</h2>
            <p class="pack-en">Starter Pack</p>
            <div class="badge standard">👤 STANDARD</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(9.9) }}</span>
            </div>
            <div class="compute-amount">
              ⚡ {{ formatCredits(PACK_CREDITS.starter) }} {{ ui.computeUnit }}
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.starterFeature1 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.starterFeature2 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.starterFeature3 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.starterFeature4 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.starterFeature5 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.starterFeature6 }}</span>
            </li>
            <li class="disabled">
              <span class="cross">✗</span
              ><span class="feature-text">{{ ui.starterDisabledPro }}</span>
            </li>
          </ul>

          <button
            class="buy-btn"
            type="button"
            :disabled="payCreating"
            @click="handleBuy('starter')"
          >
            {{ buyingPackageId === 'starter' ? ui.creatingOrder : ui.buyNow }}
          </button>
        </div>

        <!-- Standard Pack -->
        <div class="pricing-card" v-if="!proOnly">
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">⚡</span>
            </div>
            <h2>{{ ui.standardTitle }}</h2>
            <p class="pack-en">Standard Pack</p>
            <div class="badge standard">👤 STANDARD</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(19.9) }}</span>
            </div>
            <div class="compute-amount">
              ⚡ {{ formatCredits(PACK_CREDITS.standard) }} {{ ui.computeUnit }}
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check">✓</span
              ><span class="feature-text">{{ ui.standardFeature1 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonLicense }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonOwnership }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonExports }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonModelBase }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard1 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard2 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard3 }}</span>
            </li>
          </ul>

          <button
            class="buy-btn"
            type="button"
            :disabled="payCreating"
            @click="handleBuy('standard')"
          >
            {{ buyingPackageId === 'standard' ? ui.creatingOrder : ui.buyNow }}
          </button>
        </div>

        <!-- Professional Pack (Green Theme) -->
        <div class="pricing-card pro-theme">
          <div class="tag-recommend">✨ {{ ui.recommend }}</div>
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">✨</span>
            </div>
            <h2>{{ ui.proTitle }}</h2>
            <p class="pack-en">Pro Pack</p>
            <div class="badge pro">🔒 PRO ACCESS</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(49.9) }}</span>
            </div>
            <div class="compute-amount">
              ⚡ {{ formatCredits(PACK_CREDITS.pro) }} {{ ui.computeUnit }}
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.proFeature1 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonLicense }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonOwnership }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonExports }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonModelBase }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard1 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard2 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard3 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierPro1 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierPro2 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierPro3 }}</span>
            </li>
          </ul>

          <button
            class="buy-btn primary"
            type="button"
            :disabled="payCreating"
            @click="handleBuy('pro')"
          >
            {{ buyingPackageId === 'pro' ? ui.creatingOrder : ui.buyNow }}
          </button>
        </div>

        <!-- Ultimate Pack (Gold Theme) -->
        <div class="pricing-card ultimate-theme">
          <div class="tag-recommend gold">👑 {{ ui.ultimateTag }}</div>
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">👑</span>
            </div>
            <h2>{{ ui.ultimateTitle }}</h2>
            <p class="pack-en">Ultimate Pack</p>
            <div class="badge ultimate">🔒 PRO ACCESS</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(99.9) }}</span>
            </div>
            <div class="compute-amount">
              ⚡ {{ formatCredits(PACK_CREDITS.ultimate) }} {{ ui.computeUnit }}
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check">✓</span
              ><span class="feature-text">{{ ui.ultimateFeature1 }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonLicense }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonOwnership }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonExports }}</span>
            </li>
            <li>
              <span class="check">✓</span><span class="feature-text">{{ ui.commonModelBase }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard1 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard2 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierStandard3 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierPro1 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierPro2 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierPro3 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierUltimate1 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierUltimate2 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierUltimate3 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check">✓</span><span class="feature-text">{{ ui.tierUltimate4 }}</span>
            </li>
          </ul>

          <button
            class="buy-btn gold"
            type="button"
            :disabled="payCreating"
            @click="handleBuy('ultimate')"
          >
            <template v-if="buyingPackageId === 'ultimate'">{{ ui.creatingOrder }}</template>
            <template v-else>{{ ui.buyNow }}</template>
          </button>
        </div>
      </div>
    </div>

    <!-- Info Section (SEO) -->
    <div class="info-section">
      <div class="info-container">
        <h2 class="info-title">{{ ui.contentTitle }}</h2>
        <p class="info-desc">{{ ui.contentDesc }}</p>

        <div class="info-grid">
          <div class="info-card">
            <div class="info-card-title">> {{ ui.useCasesTitle }}</div>
            <ul class="info-list">
              <li v-for="(item, idx) in ui.useCases" :key="idx" class="info-list-item">
                <span class="info-list-icon">#</span>
                {{ item }}
              </li>
            </ul>
          </div>

          <div class="info-card">
            <div class="info-card-title">> {{ ui.longTailTitle }}</div>
            <div class="info-chips">
              <span v-for="(chip, idx) in ui.longTailKeywords" :key="idx" class="info-chip">
                {{ chip }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FAQ Section -->
    <div class="faq-section faq-mobile-pad">
      <div class="faq-left">
        <div class="faq-title-large">{{ ui.faqTitle }}</div>
        <div class="faq-subtitle">{{ ui.faqSubtitle }}</div>
      </div>
      <div class="faq-list">
        <details v-for="f in ui.faqs" :key="f.q" class="faq-item">
          <summary class="faq-q">
            <span class="q-text">{{ f.q }}</span>
            <span class="q-icon">+</span>
          </summary>
          <div class="faq-a-wrapper">
            <div class="faq-a">{{ f.a }}</div>
          </div>
        </details>
      </div>
    </div>

    <GlobalFooter />

    <Teleport to="body">
      <div v-if="payOpen" class="pay-modal" @mousedown.self="closePay">
        <div class="pay-panel" role="dialog" aria-modal="true">
          <div class="pay-head">
            <div class="pay-title">{{ ui.payTitle }}</div>
            <button class="pay-close" type="button" @click="closePay">×</button>
          </div>

          <div class="pay-body">
            <div class="pay-sub">{{ ui.paySub }}</div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payUserIdLabel }}</div>
              <div class="pay-value">
                <div class="pay-mono">{{ payUserId }}</div>
                <button
                  class="pay-copy"
                  type="button"
                  :disabled="payUserId === '--'"
                  @click="copyPayValue(payUserId, 'userId')"
                >
                  {{ copiedKey === 'userId' ? ui.copied : ui.copy }}
                </button>
              </div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payOrderIdLabel }}</div>
              <div class="pay-value">
                <div class="pay-mono">{{ payOrderIdText }}</div>
                <button
                  class="pay-copy"
                  type="button"
                  :disabled="payOrderIdText === '--'"
                  @click="copyPayValue(payOrderIdText, 'orderId')"
                >
                  {{ copiedKey === 'orderId' ? ui.copied : ui.copy }}
                </button>
              </div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payPackageLabel }}</div>
              <div class="pay-mono">{{ payPackageText }}</div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payCreditsLabel }}</div>
              <div class="pay-mono">+{{ payCreditsText }}</div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payBalanceLabel }}</div>
              <div class="pay-value">
                <div class="pay-mono">{{ latestCreditsText }}</div>
                <button
                  class="pay-copy"
                  type="button"
                  :disabled="payRefreshing"
                  @click="refreshBalanceOnce"
                >
                  {{ payRefreshing ? ui.refreshing : ui.refresh }}
                </button>
              </div>
            </div>

            <div class="pay-actions">
              <button class="nth-login-btn" type="button" :disabled="!payUrl" @click="openPayUrl">
                {{ ui.openPayPage }}
              </button>
              <button
                class="nth-login-btn primary"
                type="button"
                :disabled="payChecking || payRefreshing"
                @click="checkPaidOnce"
              >
                {{ payChecking ? ui.checkingPaid : ui.iHavePaid }}
              </button>
            </div>

            <div
              class="pay-hint"
              :class="{ ok: payStatus === 'success', error: payStatus === 'failed' }"
            >
              {{ payHintText }}
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import GlobalFooter from '../components/GlobalFooter.vue';
import TitleBar from '../components/TitleBar.vue';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { useRoute, useRouter } from 'vue-router';
import { createPayOrder, getCreditsBalance, type PayPackageId } from '@/points';
import { getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import { useConsoleStore } from '@/stores/console';
import { trackEvent } from '@/utils/analytics';

const PACK_CREDITS: Record<PayPackageId, number> = {
  starter: 400,
  standard: 1000,
  pro: 3000,
  ultimate: 10000
};

const formatCredits = (n: number) => {
  const v = Number(n || 0) || 0;
  return v.toLocaleString();
};

const currency = ref<'CNY' | 'USD'>('CNY');

const currencySymbol = computed(() => (currency.value === 'CNY' ? '¥' : '$'));
const exchangeRate = 0.14; // Approximate CNY to USD rate

const getPrice = (cnyPrice: number) => {
  if (currency.value === 'CNY') {
    return cnyPrice.toFixed(2);
  } else {
    return (cnyPrice * exchangeRate).toFixed(2);
  }
};

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loginStore = useLoginModel();
const consoleStore = useConsoleStore();

const route = useRoute();
const router = useRouter();

const proOnly = computed(() => {
  const raw = String((route.query as any)?.proOnly || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true';
});

const payOpen = ref(false);
const payChecking = ref(false);
const payRefreshing = ref(false);
const payCreating = ref(false);
const buyingPackageId = ref<PayPackageId | ''>('');
const copiedKey = ref<'userId' | 'orderId' | ''>('');
const payStatus = ref<'idle' | 'polling' | 'success' | 'failed'>('idle');
const payError = ref('');
const payOrderId = ref('');
const payPackageId = ref<PayPackageId | ''>('');
const payCredits = ref(0);
const payUrl = ref('');
const baselineCredits = ref<number | null>(null);
const latestCredits = ref<number | null>(null);

const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const pollTick = ref(0);

let pollTimer: number | null = null;
let pollStartedAt = 0;

const stopPolling = () => {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = null;
};

const closePay = () => {
  stopPolling();
  pollStartedAt = 0;
  pollTick.value = 0;
  payOpen.value = false;
  payChecking.value = false;
  payRefreshing.value = false;
  payStatus.value = 'idle';
  payError.value = '';
  payOrderId.value = '';
  payPackageId.value = '';
  payCredits.value = 0;
  payUrl.value = '';
  baselineCredits.value = null;
  latestCredits.value = null;
};

const onKeyDown = (e: KeyboardEvent) => {
  if (!payOpen.value) return;
  if (e.key === 'Escape') closePay();
};

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  consoleStore.recordTraffic({
    type: 'page_view',
    page: '/artigen/market',
    meta: { referrer: document.referrer }
  });
});

onBeforeUnmount(() => {
  stopPolling();
  window.removeEventListener('keydown', onKeyDown);
});

const payUserId = computed(() => {
  const uid = String(getCurrentUserId() || '').trim();
  return uid || '--';
});

const payCreditsText = computed(() => String(Number(payCredits.value || 0)));

const payOrderIdText = computed(() => {
  const id = String(payOrderId.value || '').trim();
  return id || '--';
});

const payPackageText = computed(() => {
  const pid = String(payPackageId.value || '').trim();
  if (!pid) return '--';
  return pid;
});

const latestCreditsText = computed(() => {
  const v = latestCredits.value;
  if (typeof v !== 'number') return '--';
  return String(Number(v) || 0);
});

const pollRemainingSec = computed(() => {
  if (payStatus.value !== 'polling') return null;
  if (!pollStartedAt) return null;
  const nowMs = Date.now() + pollTick.value * 0;
  const remainingMs = POLL_TIMEOUT_MS - (nowMs - pollStartedAt);
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
});

const payHintText = computed(() => {
  const raw = String(payError.value || '').trim();
  if (raw) {
    if (raw === 'LOGIN_REQUIRED') return ui.value.payLoginRequired;
    if (raw === 'INVALID_PACKAGE') return ui.value.payInvalidPackage;
    if (raw === 'CREATE_ORDER_FAILED') return ui.value.payCreateFailed;
    if (raw === 'INVALID_RESPONSE') return ui.value.payCreateFailed;
    if (raw === 'NETWORK_ERROR') return ui.value.payNetworkError;
    return raw;
  }
  if (payStatus.value === 'success') {
    const base = baselineCredits.value;
    const cur = latestCredits.value;
    const delta =
      typeof base === 'number' && typeof cur === 'number' && cur > base ? cur - base : null;
    const add = typeof delta === 'number' && delta > 0 ? String(delta) : payCreditsText.value;
    return currentLang.value === 'zh'
      ? `到账成功：+${add} 点数，余额已更新。`
      : `Success: +${add} credits. Balance updated.`;
  }
  if (payStatus.value === 'failed') return ui.value.payTimeout;
  if (payStatus.value === 'polling') {
    const sec = pollRemainingSec.value;
    return typeof sec === 'number' ? `${ui.value.payPolling} (${sec}s)` : ui.value.payPolling;
  }
  return ui.value.payGuide;
});

const openPayUrl = () => {
  const u = String(payUrl.value || '').trim();
  if (!u) return;
  trackEvent('market_open_pay_url', { category: 'conversion', orderId: payOrderId.value });
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/market',
    target: 'open_pay_url_btn',
    meta: { orderId: payOrderId.value }
  });
  try {
    const w = window.open(u, '_blank', 'noopener,noreferrer');
    if (!w) window.location.assign(u);
  } catch {
    window.location.assign(u);
  }
};

const refreshBalance = async () => {
  const bal = await getCreditsBalance();
  latestCredits.value = bal ? Number(bal.available ?? 0) || 0 : null;
  return latestCredits.value;
};

const refreshBalanceOnce = async () => {
  if (payRefreshing.value) return;
  payRefreshing.value = true;
  try {
    const cur = await refreshBalance();
    if (typeof baselineCredits.value !== 'number' && typeof cur === 'number')
      baselineCredits.value = cur;
  } finally {
    payRefreshing.value = false;
  }
};

const copyPayValue = async (value: string, key: 'userId' | 'orderId') => {
  const v = String(value || '').trim();
  if (!v || v === '--') return;
  try {
    await navigator.clipboard.writeText(v);
    copiedKey.value = key;
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = '';
    }, 1500);
  } catch {}
};

const checkPaidOnce = async () => {
  if (!payOrderId.value) return;
  trackEvent('market_check_paid_click', { category: 'conversion', orderId: payOrderId.value });
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/market',
    target: 'check_paid_btn',
    meta: { orderId: payOrderId.value }
  });

  payChecking.value = true;
  try {
    const base = baselineCredits.value;
    const cur = await refreshBalance();
    if (typeof base !== 'number' && typeof cur === 'number') {
      baselineCredits.value = cur;
      return;
    }
    if (typeof base === 'number' && typeof cur === 'number' && cur > base) {
      payStatus.value = 'success';
      stopPolling();
      return;
    }
  } finally {
    payChecking.value = false;
  }
};

const startPolling = () => {
  stopPolling();
  pollStartedAt = Date.now();
  pollTick.value = 0;
  payStatus.value = 'polling';
  pollTimer = window.setInterval(async () => {
    pollTick.value++;
    const base = baselineCredits.value;
    const cur = await refreshBalance();
    if (typeof base !== 'number' && typeof cur === 'number') {
      baselineCredits.value = cur;
      return;
    }
    if (typeof base === 'number' && typeof cur === 'number' && cur > base) {
      payStatus.value = 'success';
      stopPolling();
      return;
    }
    if (Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
      payStatus.value = 'failed';
      stopPolling();
    }
  }, 4000);
};

const ensureAuthed = (afterLogin: () => void | Promise<void>) => {
  if (isLocalLoggedIn()) return true;
  loginStore.open({ mode: 'login', returnTo: router.currentRoute.value.fullPath, afterLogin });
  return false;
};

const handleBuy = async (packageId: PayPackageId) => {
  if (payCreating.value) return;
  const ok = ensureAuthed(() => handleBuy(packageId));
  if (!ok) return;

  // Pre-open window to bypass popup blocker
  let newWindow: Window | null = null;
  try {
    newWindow = window.open('', '_blank');
  } catch {}

  payError.value = '';
  payChecking.value = false;
  payRefreshing.value = false;
  payCreating.value = true;
  buyingPackageId.value = packageId;

  try {
    const created = await createPayOrder(packageId);
    if (!created.ok) {
      if (newWindow) newWindow.close();
      payError.value = created.error;
      payOpen.value = true;
      return;
    }
    payOrderId.value = created.orderId;
    payPackageId.value = created.packageId;
    payCredits.value = created.credits;
    payUrl.value = created.payUrl;
    payOpen.value = true;

    const bal = await getCreditsBalance();
    baselineCredits.value = bal ? Number(bal.available ?? 0) || 0 : null;
    latestCredits.value = baselineCredits.value;

    if (payUrl.value) {
      if (newWindow && !newWindow.closed) {
        try {
          newWindow.location.replace(payUrl.value);
        } catch {
          openPayUrl();
        }
      } else openPayUrl();
    } else {
      if (newWindow) newWindow.close();
    }
    startPolling();
  } catch {
    if (newWindow) newWindow.close();
  } finally {
    payCreating.value = false;
    buyingPackageId.value = '';
  }
};

const ui = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      pageTitle1: '点数',
      pageTitle2: '商城',
      subtitle: ' 选择适合你的点数包',
      navBtn: '点数商城',
      myOrders: '我的订单',
      creditsUsage: '点数明细',
      computeUnit: '点数/月',
      buyNow: '立即购买',
      creatingOrder: '创建订单中...',
      activateNow: '立即激活',
      recommend: '推荐',
      ultimateTag: '旗舰版',
      starterTitle: '入门包',
      standardTitle: '标准包',
      proTitle: '专业包',
      ultimateTitle: '旗舰包',
      starterFeature1: `${PACK_CREDITS.starter} 点数/月`,
      starterFeature2: '个人商业授权',
      starterFeature3: '作品完全所有权与隐私保护',
      starterFeature4: '高质量设计导出',
      starterFeature5: '标准队列',
      starterFeature6: '支持 Standard 模型与基础风格',
      starterDisabledPro: 'Pro 模型不可用',
      commonLicense: '个人商业授权',
      commonOwnership: '作品完全所有权与隐私保护',
      commonExports: '高质量设计导出',
      commonModelBase: '支持 Standard 模型与基础风格',
      tierStandard1: '优先队列（最快）',
      tierStandard2: '高级理解智能体（更智能）',
      tierStandard3: '支持所有风格',
      tierPro1: '高级图像模型（Nano Banana / Nano BananaPro）',
      tierPro2: '下载 4K 生成图片',
      tierPro3: '加入用户社群',
      tierUltimate1: '终身 VIP 标识',
      tierUltimate2: '提前体验新工具',
      tierUltimate3: '加入核心用户群',
      tierUltimate4: '专家服务',
      standardFeature1: `${PACK_CREDITS.standard} 点数`,
      proFeature1: `${PACK_CREDITS.pro} 点数`,
      ultimateFeature1: `${PACK_CREDITS.ultimate} 点数`,
      contentTitle: '创作指南',
      contentDesc: '专业级 AI 绘画平台，释放您的无限创意。',
      useCasesTitle: '应用场景',
      useCases: [
        '自媒体运营 (小红书/公众号配图)',
        '品牌设计 (Logo/海报/包装)',
        '游戏开发 (角色立绘/场景概念)',
        '电商营销 (商品图/AI 模特)',
        '个人娱乐 (二次元头像/壁纸)'
      ],
      longTailTitle: '热门关键词',
      longTailKeywords: [
        'AI绘画',
        'Stable Diffusion',
        'Midjourney平替',
        '二次元',
        '文生图',
        '图生图',
        '4K高清',
        '写实人像'
      ],
      faqTitle: '常见问题',
      faqSubtitle: '关于版权、画质与充值的解答',
      faqs: [
        {
          q: '生成的图片可以商用吗？',
          a: '可以。入门包及以上提供个人商业授权，并支持作品完全所有权与隐私保护。'
        },
        {
          q: '生成失败会扣点数吗？',
          a: '不会。如果因系统原因导致生成失败，点数会自动退回您的账户。'
        },
        {
          q: '如何获得更高清的图片？',
          a: '入门包/标准包支持高质量设计导出；专业包/旗舰包支持下载 4K 生成图片。'
        },
        {
          q: '什么是优先队列（最快）？',
          a: '优先队列会让你的任务更快进入执行，通常等待更短，适合高频创作或赶进度场景。'
        },
        {
          q: '购买后多久到账？',
          a: '一般会在支付成功后自动到账；如偶发延迟，可在弹窗里点击“我已支付，检查到账”。'
        },
        {
          q: '点数怎么消耗？一次大概多少？',
          a: '每次生成会按任务类型扣点数；具体扣费会在生成按钮上显示预计消耗。生成失败因系统原因会自动退回。'
        },
        {
          q: '支持手机端使用吗？',
          a: '完美支持。我们的界面已针对手机浏览器进行深度适配，随时随地创作。'
        },
        { q: '点数有效期是多久？', a: '充值点数永久有效。赠送的点数通常有 30 天有效期。' }
      ],
      payTitle: '完成支付',
      paySub:
        '打开支付页面后通常无需手动填写备注；如支付页未自动带出订单信息，可粘贴：userId=<你的用户ID> orderId=<订单号>。支付完成后系统会自动检测到账。',
      payUserIdLabel: '用户ID',
      payOrderIdLabel: '订单号',
      payPackageLabel: '套餐',
      payCreditsLabel: '到账点数',
      payBalanceLabel: '当前点数',
      copy: '复制',
      copied: '已复制',
      refresh: '刷新',
      refreshing: '刷新中...',
      openPayPage: '打开支付页面',
      iHavePaid: '我已支付，检查到账',
      checkingPaid: '检查中...',
      payGuide: '等待支付完成…',
      payPolling: '正在检测到账…',
      paySuccess: '到账成功。',
      payTimeout: '检测超时：如已支付请稍后再试或联系客服。',
      payLoginRequired: '请先登录再购买。',
      payInvalidPackage: '套餐无效，请刷新页面后重试。',
      payCreateFailed: '创建订单失败，请稍后重试。',
      payNetworkError: '网络错误，请检查网络后重试。'
    };
  }
  return {
    pageTitle1: 'Buy',
    pageTitle2: 'Credits',
    subtitle: ' Choose the right credit pack for you',
    navBtn: 'Credits Market',
    myOrders: 'My Orders',
    creditsUsage: 'Credits Usage',
    computeUnit: 'Credits',
    buyNow: 'Buy Now',
    creatingOrder: 'Creating...',
    activateNow: 'Activate Now',
    recommend: 'Recommended',
    ultimateTag: 'Ultimate',
    starterTitle: 'Starter',
    standardTitle: 'Standard',
    proTitle: 'Pro',
    ultimateTitle: 'Ultimate',
    starterFeature1: `${PACK_CREDITS.starter} credits`,
    starterFeature2: 'Personal commercial license',
    starterFeature3: 'Full ownership & privacy protection',
    starterFeature4: 'High-quality design exports',
    starterFeature5: 'Standard queue',
    starterFeature6: 'Standard model + basic styles',
    starterDisabledPro: 'Pro model not available',
    commonLicense: 'Personal commercial license',
    commonOwnership: 'Full ownership & privacy protection',
    commonExports: 'High-quality design exports',
    commonModelBase: 'Standard model + basic styles',
    tierStandard1: 'Priority queue (fastest)',
    tierStandard2: 'Advanced understanding agent (smarter)',
    tierStandard3: 'Access all styles',
    tierPro1: 'Advanced image models (Nano Banana / Nano BananaPro)',
    tierPro2: 'Download 4K generated images',
    tierPro3: 'Join the community',
    tierUltimate1: 'Lifetime VIP badge',
    tierUltimate2: 'Early access to new tools',
    tierUltimate3: 'Join the core group',
    tierUltimate4: 'Expert service',
    standardFeature1: `${PACK_CREDITS.standard} credits monthly`,
    proFeature1: `${PACK_CREDITS.pro} credits monthly`,
    ultimateFeature1: `${PACK_CREDITS.ultimate} credits monthly`,
    contentTitle: 'Creative Guide',
    contentDesc: 'Professional AI art platform to unleash your creativity.',
    useCasesTitle: 'Use Cases',
    useCases: [
      'Social Media (Instagram/TikTok)',
      'Brand Design (Logo/Poster)',
      'Game Assets (Characters/Scenes)',
      'E-commerce (Product Photos/AI Models)',
      'Personal Fun (Avatars/Wallpapers)'
    ],
    longTailTitle: 'Popular Keywords',
    longTailKeywords: [
      'AI Art',
      'Stable Diffusion',
      'Midjourney Alternative',
      'Anime',
      'Text-to-Image',
      'Img-to-Img',
      '4K HD',
      'Photorealistic'
    ],
    faqTitle: 'FAQs',
    faqSubtitle: 'Answers about copyright, quality, and credits',
    faqs: [
      {
        q: 'Can I use images commercially?',
        a: 'Yes. Starter plan and above includes personal commercial licensing, with full ownership & privacy protection.'
      },
      {
        q: 'Will failed generations cost credits?',
        a: 'No. Credits are automatically refunded if generation fails due to system errors.'
      },
      {
        q: 'How to get higher resolution?',
        a: 'Starter/Standard include high-quality exports. Pro/Ultimate include 4K image downloads.'
      },
      {
        q: 'What is the Priority Queue (fastest)?',
        a: 'Priority queue pushes your tasks ahead so they usually start sooner, great for high-volume creation or tight deadlines.'
      },
      {
        q: 'How fast will credits be delivered after payment?',
        a: 'Credits are usually delivered automatically right after payment. If there is a delay, click “I have paid, check now” in the payment modal.'
      },
      {
        q: 'How are credits charged per generation?',
        a: 'Credits are charged per task type. The estimated cost is shown on the generate button before you run it. System-failed generations are automatically refunded.'
      },
      {
        q: 'Is it mobile friendly?',
        a: 'Yes. Our interface is fully optimized for mobile browsers.'
      },
      {
        q: 'Do credits expire?',
        a: 'Purchased credits never expire. Bonus credits usually expire in 30 days.'
      }
    ],
    payTitle: 'Complete Payment',
    paySub:
      'Usually no manual remark is needed. If the payment page does not show order info, paste: userId=<your userId> orderId=<orderId>. We will auto-detect credits.',
    payUserIdLabel: 'UserId',
    payOrderIdLabel: 'OrderId',
    payPackageLabel: 'Package',
    payCreditsLabel: 'Credits',
    payBalanceLabel: 'Current credits',
    copy: 'Copy',
    copied: 'Copied',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    openPayPage: 'Open payment page',
    iHavePaid: 'I have paid, check now',
    checkingPaid: 'Checking...',
    payGuide: 'Waiting for payment…',
    payPolling: 'Checking credits…',
    paySuccess: 'Success.',
    payTimeout: 'Timeout. If paid, try again later.',
    payLoginRequired: 'Please log in before purchasing.',
    payInvalidPackage: 'Invalid package. Refresh and try again.',
    payCreateFailed: 'Failed to create order. Please try again later.',
    payNetworkError: 'Network error. Please try again.'
  };
});
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.top-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  background: rgba(5, 5, 5, 0.7);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.top-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.top-logo {
  text-decoration: none;
}

.top-logo-text {
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  letter-spacing: -0.5px;
}

.top-nav {
  display: flex;
  gap: 18px;
  align-items: center;
}

.top-nav-item {
  font-family: var(--common-font);
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-nav-item:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.top-nav-item.active {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.6);
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.15);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-action-link {
  font-family: var(--common-font);
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-action-link:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.market-page {
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: var(--common-font);
  padding-top: 0;
  background-image:
    linear-gradient(rgba(204, 255, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(204, 255, 0, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

.market-container {
  max-width: 1520px;
  margin: 0 auto;
  padding: 0 24px;
}

.page-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  row-gap: 20px;
  margin-top: 60px;
  margin-bottom: 60px;
  align-items: start;
}

.badge-row {
  grid-column: 1;
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 10px;
}

.badge-dot {
  width: 8px;
  height: 8px;
  background: #ccff00;
  border-radius: 50%;
  box-shadow: 0 0 8px #ccff00;
}

.badge-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: #ccff00;
}

.title-stack {
  grid-column: 1 / -1;
  justify-self: center;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.page-title {
  font-size: 64px;
  font-weight: 900;
  margin: 0;
  letter-spacing: -1px;
}

.market-title-accent {
  color: var(--neon-green);
  text-shadow: 0 0 18px rgba(204, 255, 0, 0.28);
}

.bolt {
  color: #ffd700;
  display: inline-block;
  animation: pulse 2s infinite;
}

.page-desc {
  color: #64748b;
  font-family: var(--common-font);
  font-size: 18px;
  margin: 0;
  max-width: 860px;
}

/* Currency Toggle */
.currency-toggle {
  display: flex;
  justify-content: center;
  margin-bottom: 60px;
}

.toggle-bg {
  background: #1e1e1e;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  gap: 4px;
  border: 1px solid #333;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #666;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s ease;
}

.toggle-btn.active {
  background: #ccff00;
  color: #000;
  box-shadow: 0 2px 10px rgba(204, 255, 0, 0.2);
}

/* Pricing Grid */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-bottom: 80px;
}

.pricing-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 10, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 32px 24px;
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s;
  cursor: pointer;
}

.pricing-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  border-color: rgba(204, 255, 0, 0.3);
}

.pricing-card:active {
  transform: translateY(-2px) scale(0.99);
}

/* Card Corners */
.card-corner {
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1px solid transparent;
  transition: all 0.3s ease;
}

.pricing-card:hover .card-corner {
  border-color: #666;
}

.top-left {
  top: -1px;
  left: -1px;
  border-top: 2px solid #333;
  border-left: 2px solid #333;
}
.top-right {
  top: -1px;
  right: -1px;
  border-top: 2px solid #333;
  border-right: 2px solid #333;
}
.bottom-left {
  bottom: -1px;
  left: -1px;
  border-bottom: 2px solid #333;
  border-left: 2px solid #333;
}
.bottom-right {
  bottom: -1px;
  right: -1px;
  border-bottom: 2px solid #333;
  border-right: 2px solid #333;
}

/* Card Content */
.card-header {
  margin-bottom: 24px;
}

.icon-box {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.icon {
  font-size: 24px;
}

.pricing-card h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
  color: #fff;
}

.pack-en {
  color: #64748b;
  font-size: 14px;
  font-family: var(--common-font);
  margin-bottom: 12px;
}

.badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.badge.standard {
  background: #333;
  color: #ccc;
  border: 1px solid #444;
}

.badge.pro {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge.ultimate {
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

/* Price Section */
.price-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.price {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.price .symbol {
  font-size: 20px;
  color: #64748b;
}

.compute-amount {
  color: #ccff00;
  font-family: var(--common-font);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* Features */
.features {
  list-style: none;
  padding: 0;
  margin: 0 0 32px 0;
  flex: 1;
  text-align: left;
}

.features li {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  line-height: 1.5;
}

.check {
  color: #64748b;
  flex: 0 0 auto;
  margin-top: 2px;
}

.cross {
  color: #444;
  flex: 0 0 auto;
  margin-top: 2px;
}

.feature-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: left;
  display: block;
}

.features li.disabled {
  color: #475569;
  text-decoration: line-through;
}

.features li.tier-standard {
  color: #a78bfa;
}

.features li.tier-standard .check {
  color: #a78bfa;
}

.features li.tier-pro {
  color: #10b981;
}

.features li.tier-pro .check {
  color: #10b981;
}

.features li.tier-ultimate {
  color: #ffd700;
}

.features li.tier-ultimate .check {
  color: #ffd700;
}

/* Buttons */
.buy-btn {
  width: 100%;
  height: 56px;
  margin-top: auto;
  padding: 0 14px;
  background: transparent;
  border: 1px solid #444;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: var(--common-font);
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.buy-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.buy-btn:disabled:hover {
  border-color: #444;
  background: transparent;
}

.pro-theme .buy-btn.primary:disabled:hover {
  background: #064e3b;
  border-color: #064e3b;
  color: #10b981;
  box-shadow: none;
}

.ultimate-theme .buy-btn.gold:disabled:hover {
  background: #ffd700;
  border-color: #ffd700;
  color: #000;
  box-shadow: none;
}

.buy-btn:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

/* Pro Theme Overrides */
.pro-theme:hover {
  border-color: #10b981;
  box-shadow: 0 20px 40px rgba(16, 185, 129, 0.1);
}

.pro-theme .icon-box {
  color: #10b981;
}

.pro-theme .compute-amount {
  color: #10b981;
}

.pro-theme .buy-btn.primary {
  background: #064e3b;
  border-color: #064e3b;
  color: #10b981;
}

.pro-theme .buy-btn.primary:hover {
  background: #10b981;
  color: #000;
}

/* Ultimate Theme Overrides */
.ultimate-theme {
  border-color: rgba(255, 215, 0, 0.3);
}

.ultimate-theme:hover {
  border-color: #ffd700;
  box-shadow: 0 20px 40px rgba(255, 215, 0, 0.1);
}

.ultimate-theme .icon-box {
  color: #ffd700;
}

.ultimate-theme .compute-amount {
  color: #ffd700;
}

.ultimate-theme .buy-btn.gold {
  background: #ffd700;
  border-color: #ffd700;
  color: #000;
}

.ultimate-theme .buy-btn.gold:hover {
  background: #ffe44d;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
}

/* Recommended Tags */
.tag-recommend {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #064e3b;
  color: #10b981;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #10b981;
}

.tag-recommend.gold {
  background: #713f12;
  color: #ffd700;
  border-color: #ffd700;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    margin-top: 40px;
    margin-bottom: 40px;
    row-gap: 16px;
  }

  .page-title {
    font-size: 40px;
  }

  .pricing-grid {
    grid-template-columns: 1fr;
  }
}

.pay-modal {
  position: fixed;
  inset: 0;
  z-index: 20010;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.pay-panel {
  width: min(520px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(12, 12, 12, 0.92);
  box-shadow:
    0 0 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  color: #f1f5f9;
}

.pay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 0 16px;
}

.pay-title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.5px;
}

.pay-close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.pay-close:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.pay-body {
  padding: 16px;
}

.pay-sub {
  color: #94a3b8;
  font-size: 13px;
  margin-bottom: 16px;
  font-family: var(--common-font);
}

.pay-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.pay-value {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.pay-label {
  font-family: var(--common-font);
  font-size: 12px;
  color: #94a3b8;
}

.pay-mono {
  font-family: var(--common-font);
  font-size: 12px;
  color: rgba(241, 245, 249, 0.92);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.pay-copy {
  height: 36px;
  padding: 0 12px;
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

.pay-copy:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.pay-copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pay-copy:disabled:hover {
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(241, 245, 249, 0.92);
}

.pay-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.pay-hint {
  margin-top: 14px;
  font-size: 12px;
  color: #64748b;
  font-family: var(--common-font);
}

.pay-hint.ok {
  color: rgba(204, 255, 0, 0.95);
}

.pay-hint.error {
  color: #fca5a5;
}

/* New Styles */
.pro-theme {
  border-color: rgba(16, 185, 129, 0.4);
}

.save-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.4);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.save-badge.gold {
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
  border-color: rgba(255, 215, 0, 0.3);
}
</style>
