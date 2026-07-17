import { defineStore } from 'pinia';
import { buildApiUrl } from '@/utils/api';
import {
  sanitizeAnalyticsPayload,
  sanitizeAnalyticsUrl,
  trackBackendEvent
} from '@/utils/analytics';

const AUTH_STORAGE_KEY = 'console_auth_v1';
const STORAGE_KEY = 'console_store_v1';
const ADMIN_KEY_STORAGE_KEY = 'console_admin_key_v1';
const ADMIN_AUTH_MODE_STORAGE_KEY = 'console_admin_auth_mode_v1';

type AdminAuthMode = 'bearer' | 'x-admin-key';

export type ConsoleAuthSession = {
  userId: string;
  expiresAt: number;
  authHash: string;
};

let consoleAuthSession: ConsoleAuthSession | null = null;
let consoleAdminKey = '';
let consoleAdminAuthMode: AdminAuthMode = 'bearer';

export const clearLegacyConsoleCredentialStorage = () => {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    localStorage.removeItem(ADMIN_AUTH_MODE_STORAGE_KEY);
  } catch {}
};

clearLegacyConsoleCredentialStorage();

export const getConsoleAuthSession = (): ConsoleAuthSession | null => {
  return consoleAuthSession ? { ...consoleAuthSession } : null;
};

export const isConsoleAuthed = (): boolean => {
  const s = getConsoleAuthSession();
  if (s && s.expiresAt > Date.now()) return true;
  const adminKey = getConsoleAdminKey();
  return !!adminKey;
};

export const getConsoleUserId = (): string => {
  const s = getConsoleAuthSession();
  if (s?.userId) return s.userId;
  const adminKey = getConsoleAdminKey();
  return adminKey ? 'admin' : '';
};

export const setConsoleAuthSession = (session: ConsoleAuthSession) => {
  const userId = String(session.userId || '').trim();
  const authHash = String(session.authHash || '').trim();
  const expiresAt = Number(session.expiresAt || 0);
  if (!userId || !authHash || !Number.isFinite(expiresAt)) throw new Error('INVALID_SESSION');
  consoleAuthSession = { userId, authHash, expiresAt };
};

export const clearConsoleAuthSession = () => {
  consoleAuthSession = null;
  clearLegacyConsoleCredentialStorage();
};

const inferAdminAuthMode = (token: string): AdminAuthMode => {
  const t = String(token || '').trim();
  if (!t) return 'bearer';
  const dotCount = (t.match(/\./g) || []).length;
  return dotCount === 2 ? 'bearer' : 'x-admin-key';
};

export const getConsoleAdminKey = (): string => {
  return consoleAdminKey;
};

export const getConsoleAdminAuthMode = (): AdminAuthMode => {
  return consoleAdminAuthMode;
};

export const setConsoleAdminKey = (key: string) => {
  const v = String(key || '').trim();
  if (!v) throw new Error('INVALID_ADMIN_KEY');
  consoleAdminKey = v;
};

export const setConsoleAdminAuthMode = (mode: AdminAuthMode) => {
  consoleAdminAuthMode = mode === 'x-admin-key' ? 'x-admin-key' : 'bearer';
};

export const clearConsoleAdminKey = () => {
  consoleAdminKey = '';
  clearLegacyConsoleCredentialStorage();
};

export const clearConsoleAdminAuthMode = () => {
  consoleAdminAuthMode = 'bearer';
  clearLegacyConsoleCredentialStorage();
};

// Types
export interface ConsoleUser {
  userId: string;
  email: string;
  level: 'free' | 'pro' | 'biz' | 'enterprise';
  points: number;
  totalSpent: number;
  joinedAt: number;
  lastActiveAt: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'recharge' | 'usage' | 'admin_gift' | 'refund';
  amount: number; // positive for add, negative for spend
  description: string;
  timestamp: number;
  meta?: any;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string; // 'generate_image', 'chat', 'login', etc.
  details: any;
  timestamp: number;
}

export interface GeneratedContent {
  id: string;
  userId: string;
  type: 'image' | 'text';
  contentUrl?: string; // for images
  textContent?: string; // for chat
  prompt?: string;
  timestamp: number;
}

export interface TrafficEvent {
  id: string;
  type: 'page_view' | 'click' | 'conversion' | 'generate_success' | 'generate_fail';
  page: string;
  target?: string;
  meta?: any;
  timestamp: number;
}

export type AdminWallet = {
  available?: number;
  frozen?: number;
  updatedAt?: number;
};

export type AdminRateLimitStats = {
  totalBuckets?: number;
  topTags?: Array<{ tag: string; buckets: number }>;
  updatedAt?: number;
};

export type AdminUserItem = {
  userId: string;
  email: string;
  username: string;
  name: string;
  createdAt: number;
  lastSeen: number;
  visits: number;
  wallet?: AdminWallet | null;
};

export type AdminImageRef = { kind: 'url'; url: string } | { kind: 'data'; mime?: string };

export type AdminImageHistoryItem = {
  id: string;
  ts: number;
  type: string;
  source?: string;
  provider?: string;
  model?: string;
  cost?: number;
  userText?: string;
  prompt?: string;
  negativePrompt?: string;
  params?: any;
  images?: AdminImageRef[];
  inputImages?: AdminImageRef[];
  userId: string;
  username?: string;
  email?: string;
};

export type AdminUsagePlan = {
  deepMode?: boolean;
  initialInput?: string;
  [key: string]: any;
};

export type AdminUsageLedgerItem = {
  requestId: string;
  ts: number;
  userId: string;
  username?: string;
  email?: string;
  sessionId?: string;
  projectId?: string;
  trigger?: string;
  provider?: string;
  model?: string;
  inputCount?: number;
  outputCount?: number;
  tokensIn?: number;
  tokensOut?: number;
  tokensTotal?: number;
  creditsDelta?: number;
  status?: string;
  durationMs?: number;
  ip?: string;
  ua?: string;
  usedUrl?: string;
  plan?: AdminUsagePlan;
};

export type AdminAnalyticsEventItem = {
  id: string;
  ts: number;
  eventType: string;
  payload?: Record<string, any>;
  path?: string;
  location?: string;
  referrer?: string;
  trafficSource?: string;
  trafficRefHost?: string;
  trafficSearchEngine?: string;
  trafficUtmMedium?: string;
  trafficUtmSource?: string;
  trafficUtmCampaign?: string;
  userId?: string;
  ip?: string;
  ua?: string;
};

export type GenerationFunnel = {
  days: number;
  events: Record<string, number>;
  operations: Array<{
    operation: string;
    success: number;
    failed: number;
    cancelled: number;
    refundedCredits: number;
    chargedCredits: number;
    avgQueueMs: number;
  }>;
  successRate: number;
  refundRate: number;
  assetPersistenceFailureRate: number;
  costPerSuccessfulTaskMinor: number;
  refundedCredits: number;
  unsettledHolds: { count: number; overdueCount: number; credits: number };
  timing: {
    queueP50Ms: number;
    queueP95Ms: number;
    firstImageP50Ms: number;
    firstImageP95Ms: number;
    providerP50Ms: number;
    providerP95Ms: number;
  };
};

export type AdminAuditHistoryItem = {
  id?: string;
  ts?: number;
  kind?: string;
  biz?: string;
  status?: string;
  provider?: string;
  model?: string;
  usedUrl?: string;
  durationMs?: number;
  requestSource?: string;
  sessionId?: string;
  projectId?: string;
  pageContext?: any;
  userText?: string;
  aiText?: string;
  ip?: string;
  ua?: string;
  username?: string;
  email?: string;
  userId?: string;
  [k: string]: any;
};

export type AiBgSeoCopy = {
  pagePath: string;
  title: string;
  description: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  h1: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  featureTitle: string;
  featureItems: string[];
  useCasesTitle: string;
  useCases: string[];
  updatedAt: number;
};

const buildUrlWithQuery = (path: string, query: Record<string, any>) => {
  const base = buildApiUrl(path);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null) continue;
    const s = typeof v === 'string' ? v.trim() : String(v);
    if (!s) continue;
    sp.set(k, s);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
};

const buildDefaultAiBgSeoCopy = (): AiBgSeoCopy => ({
  pagePath: '/artigen/image-workshop',
  title: 'AI 背景生成 - 一键替换商品图背景 | Artigen',
  description:
    '上传商品图即可自动抠图并生成高质感场景背景，支持替换与叠加模式，提升电商图片转化率。',
  keywords: 'AI 背景,商品图,电商主图,抠图,场景图,背景替换,AI 作图',
  ogTitle: 'AI 背景生成｜快速替换商品图背景',
  ogDescription: '选择风格、上传图片，一键生成电商商品场景图，支持多种尺寸与风格。',
  ogImage: '',
  h1: 'AI 背景生成',
  heroTitle: '让商品图瞬间拥有高级场景',
  heroSubtitle: '选择背景风格，上传图片，秒级生成适配电商的高质感场景图。',
  ctaPrimary: '立即生成',
  ctaSecondary: '查看示例',
  featureTitle: '核心优势',
  featureItems: ['自动抠图，无需修图基础', '多风格背景，一键适配', '支持替换与叠加两种模式'],
  useCasesTitle: '适用场景',
  useCases: ['电商主图', '新品上架', '品牌宣传', '社媒投放'],
  updatedAt: Date.now()
});

const isAdminAuthErrorStatus = (status: number) => status === 401 || status === 403;

const toAdminRequestError = (res: Response, json: any) => {
  const status = typeof res?.status === 'number' ? res.status : 0;
  const apiError =
    typeof json?.error === 'string' && json.error.trim()
      ? json.error.trim()
      : `HTTP_${status || 0}`;
  const code = isAdminAuthErrorStatus(status) ? 'ADMIN_AUTH_INVALID' : apiError;
  const err = new Error(code);
  (err as any).status = status;
  (err as any).apiError = apiError;
  return err;
};

const buildAdminHeaders = (token: string, mode: AdminAuthMode): Record<string, string> | null => {
  const t = String(token || '').trim();
  if (!t) return null;
  const headers: Record<string, string> = {};
  if (mode === 'x-admin-key') headers['x-admin-key'] = t;
  else headers['Authorization'] = `Bearer ${t}`;
  return headers;
};

export const useConsoleStore = defineStore('console', {
  state: () => ({
    users: [] as ConsoleUser[],
    transactions: [] as Transaction[],
    logs: [] as ActivityLog[],
    generatedContent: [] as GeneratedContent[],
    trafficStats: [] as TrafficEvent[],
    aiBgSeoCopy: buildDefaultAiBgSeoCopy(),
    adminKey: '' as string,
    adminAuthMode: 'bearer' as AdminAuthMode,
    adminUsers: [] as AdminUserItem[],
    adminUsersTotal: 0,
    adminImages: [] as AdminImageHistoryItem[],
    adminImagesTotal: 0,
    adminUsage: [] as AdminUsageLedgerItem[],
    adminUsageTotal: 0,
    adminEvents: [] as AdminAnalyticsEventItem[],
    adminEventsTotal: 0,
    generationFunnel: null as GenerationFunnel | null,
    adminBehaviorEvents: [] as AdminAnalyticsEventItem[],
    adminBehaviorTotal: 0,
    adminAudit: [] as AdminAuditHistoryItem[],
    adminAuditTotal: 0,
    adminChats: [] as any[],
    adminChatsTotal: 0,
    adminOrders: [] as any[],
    adminOrdersTotal: 0,
    adminRateLimitStats: null as AdminRateLimitStats | null,
    isInitialized: false
  }),

  getters: {
    getUserById: (state) => (userId: string) => {
      return state.users.find((u) => u.userId === userId);
    },
    getCurrentUser: (state) => {
      const uid = getConsoleUserId();
      return state.users.find((u) => u.userId === uid);
    },
    getUserTransactions: (state) => (userId: string) => {
      return state.transactions
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    getUserLogs: (state) => (userId: string) => {
      return state.logs
        .filter((l) => l.userId === userId)
        .sort((a, b) => b.timestamp - a.timestamp);
    }
  },

  actions: {
    init() {
      if (this.isInitialized) return;

      // Load from localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          // Never hydrate fake balances/orders/content written by the old
          // browser-only console. Canonical finance now comes from PostgreSQL.
          this.users = [];
          this.transactions = [];
          this.logs = [];
          this.generatedContent = [];
          this.trafficStats = data.trafficStats || [];
          this.aiBgSeoCopy = data.aiBgSeoCopy || buildDefaultAiBgSeoCopy();
        } catch (e) {
          console.error('Failed to load console store', e);
        }
      }

      this.adminKey = getConsoleAdminKey();
      this.adminAuthMode = getConsoleAdminAuthMode();
      if (this.adminKey) {
        const inferred = inferAdminAuthMode(this.adminKey);
        if (this.adminAuthMode !== inferred) {
          this.adminAuthMode = inferred;
          setConsoleAdminAuthMode(inferred);
        }
      }

      this.isInitialized = true;
      this.save();
    },

    async adminLogin(input: { username: string; password: string }) {
      const username = String(input?.username || '').trim();
      const password = String(input?.password || '');
      if (!username || !password) throw new Error('INVALID_INPUT');

      const url = buildApiUrl('/api/admin/login');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw toAdminRequestError(res, json);

      const token = String(json?.token || '').trim();
      const expiresAt = Number(json?.expiresAt || 0) || 0;
      if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
        throw new Error('LOGIN_FAILED');

      this.setAdminKey(token);
      this.adminAuthMode = 'bearer';
      setConsoleAdminAuthMode('bearer');
      return { ok: true as const, token, expiresAt };
    },

    setAdminKey(key: string, mode: AdminAuthMode = 'bearer') {
      const v = String(key || '').trim();
      setConsoleAdminKey(v);
      this.adminKey = v;
      this.adminAuthMode = mode;
      setConsoleAdminAuthMode(mode);
    },

    setAdminApiKey(key: string) {
      this.setAdminKey(key, 'x-admin-key');
    },

    clearAdminKey() {
      clearConsoleAdminKey();
      clearConsoleAdminAuthMode();
      clearConsoleAuthSession();
      this.adminKey = '';
      this.adminAuthMode = 'bearer';
    },

    async fetchAdminUsers(input?: { q?: string; limit?: number; offset?: number }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildUrlWithQuery('/api/admin/users', {
        q: input?.q || '',
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: AdminUserItem[] = Array.isArray(json?.items) ? json.items : [];
      this.adminUsers = items;
      this.adminUsersTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminUsersTotal };
    },

    async fetchAdminImagesHistory(input?: { userId?: string; limit?: number; offset?: number }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildUrlWithQuery('/api/admin/images/history', {
        userId: input?.userId || '',
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: AdminImageHistoryItem[] = Array.isArray(json?.items) ? json.items : [];
      this.adminImages = items;
      this.adminImagesTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminImagesTotal };
    },

    async fetchAdminUsageLedger(input?: {
      userId?: string;
      from?: number | string;
      to?: number | string;
      limit?: number;
      offset?: number;
    }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildUrlWithQuery('/api/admin/usage/ledger', {
        userId: input?.userId || '',
        from: input?.from,
        to: input?.to,
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: AdminUsageLedgerItem[] = Array.isArray(json?.items) ? json.items : [];
      this.adminUsage = items;
      this.adminUsageTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminUsageTotal };
    },

    async fetchAdminCollectionEvents(input?: {
      eventType?: string;
      limit?: number;
      offset?: number;
    }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildUrlWithQuery('/api/admin/collection/events', {
        eventType: input?.eventType || '',
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: AdminAnalyticsEventItem[] = Array.isArray(json?.items) ? json.items : [];
      this.adminEvents = items;
      this.adminEventsTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminEventsTotal };
    },
    async fetchGenerationFunnel(days = 14) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildUrlWithQuery('/api/admin/generation/funnel', { days });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      this.generationFunnel = json.funnel as GenerationFunnel;
      return { ok: true as const, funnel: this.generationFunnel };
    },
    async fetchAdminEvents(input?: { userId?: string; limit?: number; offset?: number }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildUrlWithQuery('/api/admin/events', {
        userId: input?.userId || '',
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: AdminAnalyticsEventItem[] = Array.isArray(json?.items) ? json.items : [];
      this.adminBehaviorEvents = items;
      this.adminBehaviorTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminBehaviorTotal };
    },

    async fetchAdminAuditHistory(input?: {
      userId?: string;
      biz?: string;
      kind?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildUrlWithQuery('/api/admin/audit/history', {
        userId: input?.userId || '',
        biz: input?.biz || '',
        kind: input?.kind || '',
        status: input?.status || '',
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: AdminAuditHistoryItem[] = Array.isArray(json?.items) ? json.items : [];
      this.adminAudit = items;
      this.adminAuditTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminAuditTotal };
    },

    async fetchAdminRateLimitStats() {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const url = buildApiUrl('/api/admin/ratelimit/stats');
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const stats: AdminRateLimitStats =
        json && typeof json === 'object'
          ? {
              totalBuckets: Number(json.totalBuckets ?? 0) || 0,
              topTags: Array.isArray(json.topTags) ? json.topTags : [],
              updatedAt: Number(json.updatedAt ?? 0) || Date.now()
            }
          : { totalBuckets: 0, topTags: [], updatedAt: Date.now() };
      this.adminRateLimitStats = stats;
      return { ok: true as const, stats };
    },

    async fetchAdminChatsHistory(input: { userId: string; limit?: number; offset?: number }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const userId = String(input?.userId || '').trim();
      if (!userId) throw new Error('MISSING_USER_ID');

      const url = buildUrlWithQuery('/api/admin/chats/history', {
        userId,
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: any[] = Array.isArray(json?.items) ? json.items : [];
      this.adminChats = items.map((it) => {
        if (!it || typeof it !== 'object') return it;
        const ts =
          typeof (it as any).ts === 'number'
            ? (it as any).ts
            : typeof (it as any).timestamp === 'number'
              ? (it as any).timestamp
              : Number((it as any).timestamp || (it as any).ts || 0) || 0;
        const text =
          typeof (it as any).text === 'string'
            ? (it as any).text
            : typeof (it as any).content === 'string'
              ? (it as any).content
              : String((it as any).text || (it as any).content || '');
        const role =
          typeof (it as any).role === 'string' ? (it as any).role : String((it as any).role || '');
        return { ...it, ts, text, role };
      });
      this.adminChatsTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminChatsTotal };
    },

    async setAdminUserCredits(input: { userId: string; available: number }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const userId = String(input?.userId || '').trim();
      const availableRaw = Number.parseInt(String((input as any)?.available ?? ''), 10);
      const available = Number.isFinite(availableRaw) && availableRaw >= 0 ? availableRaw : null;
      if (!userId) throw new Error('MISSING_USER_ID');
      if (available === null) throw new Error('INVALID_AVAILABLE');

      const url = buildApiUrl('/api/admin/users/credits');
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ userId, available })
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const wallet = json?.wallet && typeof json.wallet === 'object' ? json.wallet : null;
      this.adminUsers = (this.adminUsers || []).map((u) =>
        u.userId === userId ? { ...u, wallet } : u
      );
      return { ok: true as const, wallet };
    },

    async fetchAdminOrders(input: { userId: string; limit?: number; offset?: number }) {
      const adminKey = String(this.adminKey || '').trim();
      if (!adminKey) throw new Error('ADMIN_AUTH_REQUIRED');
      const headers = buildAdminHeaders(adminKey, this.adminAuthMode);
      if (!headers) throw new Error('ADMIN_AUTH_REQUIRED');
      const userId = String(input?.userId || '').trim();
      if (!userId) throw new Error('MISSING_USER_ID');

      const url = buildUrlWithQuery('/api/admin/orders', {
        userId,
        limit: input?.limit ?? 200,
        offset: input?.offset ?? 0
      });
      const res = await fetch(url, { headers });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (isAdminAuthErrorStatus(res.status)) this.clearAdminKey();
        throw toAdminRequestError(res, json);
      }
      const items: any[] = Array.isArray(json?.items) ? json.items : [];
      this.adminOrders = items;
      this.adminOrdersTotal = Number(json?.total || items.length) || items.length;
      return { ok: true as const, total: this.adminOrdersTotal };
    },

    recordTraffic(event: Omit<TrafficEvent, 'id' | 'timestamp'>) {
      const page = sanitizeAnalyticsUrl(event.page);
      const rawTarget = String(event.target || '').trim();
      const target = /^[a-z0-9][a-z0-9:_-]{0,119}$/i.test(rawTarget) ? rawTarget : '';
      const meta = sanitizeAnalyticsPayload(event.meta);
      const safeEvent: TrafficEvent = {
        type: event.type,
        page,
        ...(target ? { target } : {}),
        ...(Object.keys(meta).length ? { meta } : {}),
        id: crypto.randomUUID(),
        timestamp: Date.now()
      };
      this.trafficStats.push(safeEvent);
      this.save();

      void trackBackendEvent(event.type, {
        pagePath: page,
        ...(target ? { target } : {}),
        ...(Object.keys(meta).length ? { meta } : {})
      });
    },

    save() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          trafficStats: this.trafficStats,
          aiBgSeoCopy: this.aiBgSeoCopy
        })
      );
    },

    setAiBgSeoCopy(input: Partial<AiBgSeoCopy>) {
      this.aiBgSeoCopy = {
        ...this.aiBgSeoCopy,
        ...input,
        updatedAt: Date.now()
      };
      this.save();
    },

    resetAiBgSeoCopy() {
      this.aiBgSeoCopy = buildDefaultAiBgSeoCopy();
      this.save();
    }
  }
});
