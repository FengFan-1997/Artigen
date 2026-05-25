import { buildApiUrl } from '@/utils/api';
import {
  getAuthToken,
  getCurrentUserId,
  getOrCreateProjectId,
  getOrCreateSessionId,
  isLocalLoggedIn
} from '@/login/session';
import { trackEvent } from '@/utils/analytics';
import { getPageContext } from '@/utils/pageContext';

export type CreditsBalance = {
  userId: string;
  available: number;
  frozen: number;
  lastCheckinDay?: string;
};

const BALANCE_URL = buildApiUrl('/api/credits/balance');
const COSTS_URL = buildApiUrl('/api/credits/costs');
const CREATE_ORDER_URL = buildApiUrl('/api/pay/create-order');
const ORDERS_URL = buildApiUrl('/api/credits/orders');
const HOLDS_URL = buildApiUrl('/api/credits/holds');

export type CreditsCosts = { generate: number; img2img: number };

export const getCreditsCosts = async (): Promise<CreditsCosts | null> => {
  try {
    const res = await fetch(COSTS_URL);
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    if (!json || typeof json !== 'object') return null;
    const gen = Number(json?.generate ?? 0);
    const img = Number(json?.img2img ?? 0);
    if (!Number.isFinite(gen) || !Number.isFinite(img)) return null;
    return { generate: Math.max(0, Math.trunc(gen)), img2img: Math.max(0, Math.trunc(img)) };
  } catch {
    return null;
  }
};

export const getCreditsBalance = async (): Promise<CreditsBalance | null> => {
  try {
    if (!isLocalLoggedIn()) return null;
    const userId = getCurrentUserId();
    const token = getAuthToken();
    if (!token) return null;
    const url = `${BALANCE_URL}?userId=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const uid = typeof json?.userId === 'string' ? json.userId : '';
    if (!uid) return null;
    return {
      userId: uid,
      available: Number(json?.available ?? 0) || 0,
      frozen: Number(json?.frozen ?? 0) || 0
    };
  } catch {
    return null;
  }
};

export type PayPackageId = 'starter' | 'standard' | 'pro' | 'ultimate';

export type CreatePayOrderResult =
  | {
      ok: true;
      orderId: string;
      userId: string;
      packageId: PayPackageId;
      amountCny: number;
      credits: number;
      payUrl: string;
    }
  | { ok: false; error: string };

export const createPayOrder = async (packageId: PayPackageId): Promise<CreatePayOrderResult> => {
  try {
    if (!isLocalLoggedIn()) {
      trackEvent('pay_create_order_fail', {
        category: 'funnel',
        packageId,
        error: 'LOGIN_REQUIRED'
      });
      return { ok: false, error: 'LOGIN_REQUIRED' };
    }
    const userId = getCurrentUserId();
    const token = getAuthToken();
    if (!userId || !token) {
      trackEvent('pay_create_order_fail', {
        category: 'funnel',
        packageId,
        error: 'LOGIN_REQUIRED'
      });
      return { ok: false, error: 'LOGIN_REQUIRED' };
    }

    trackEvent('pay_create_order_start', { category: 'funnel', packageId });
    const res = await fetch(CREATE_ORDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        userId,
        packageId,
        sessionId: getOrCreateSessionId(),
        projectId: getOrCreateProjectId(),
        pageContext: getPageContext(),
        requestSource: 'site_pay_create_order'
      })
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const err =
        typeof json?.error === 'string' && json.error.trim()
          ? json.error.trim()
          : 'CREATE_ORDER_FAILED';
      trackEvent('pay_create_order_fail', { category: 'funnel', packageId, error: err });
      return { ok: false, error: err };
    }
    const orderId = typeof json?.orderId === 'string' ? json.orderId.trim() : '';
    const uid = typeof json?.userId === 'string' ? json.userId.trim() : '';
    const pid = typeof json?.packageId === 'string' ? json.packageId.trim() : '';
    if (!orderId || !uid || !pid) {
      trackEvent('pay_create_order_fail', {
        category: 'funnel',
        packageId,
        error: 'INVALID_RESPONSE'
      });
      return { ok: false, error: 'INVALID_RESPONSE' };
    }
    trackEvent('pay_create_order_success', { category: 'funnel', packageId, orderId });
    return {
      ok: true,
      orderId,
      userId: uid,
      packageId: pid as PayPackageId,
      amountCny: Number(json?.amountCny ?? 0) || 0,
      credits: Number(json?.credits ?? 0) || 0,
      payUrl: typeof json?.payUrl === 'string' ? json.payUrl.trim() : ''
    };
  } catch (e: any) {
    trackEvent('pay_create_order_fail', {
      category: 'funnel',
      packageId,
      error: typeof e?.message === 'string' ? e.message : 'NETWORK_ERROR'
    });
    return { ok: false, error: typeof e?.message === 'string' ? e.message : 'NETWORK_ERROR' };
  }
};

export type CreditsOrder = {
  afdianOrderId: string;
  userId: string;
  credits: number;
  packageId?: PayPackageId;
  createdAt: number;
};

export const getCreditsOrders = async (): Promise<CreditsOrder[] | null> => {
  try {
    if (!isLocalLoggedIn()) return null;
    const userId = getCurrentUserId();
    const token = getAuthToken();
    if (!userId || !token) return null;
    const url = `${ORDERS_URL}?userId=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const list = Array.isArray(json?.orders) ? json.orders : [];
    return list
      .map((o: any) => {
        const afdianOrderId = typeof o?.afdianOrderId === 'string' ? o.afdianOrderId.trim() : '';
        const uid = typeof o?.userId === 'string' ? o.userId.trim() : '';
        const credits = Number(o?.credits ?? 0) || 0;
        const packageIdRaw = typeof o?.packageId === 'string' ? o.packageId.trim() : '';
        const packageId: PayPackageId | undefined =
          packageIdRaw === 'starter' ||
          packageIdRaw === 'standard' ||
          packageIdRaw === 'pro' ||
          packageIdRaw === 'ultimate'
            ? (packageIdRaw as PayPackageId)
            : undefined;
        const createdAt = Number(o?.createdAt ?? 0) || 0;
        if (!afdianOrderId || !uid) return null;
        return {
          afdianOrderId,
          userId: uid,
          credits,
          ...(packageId ? { packageId } : {}),
          createdAt
        };
      })
      .filter((x: any) => !!x) as CreditsOrder[];
  } catch {
    return null;
  }
};

export type CreditsHoldStatus = 'frozen' | 'confirmed' | 'refunded';

export type CreditsHold = {
  id: string;
  userId: string;
  cost: number;
  reason: string;
  requestId: string;
  status: CreditsHoldStatus;
  createdAt: number;
  updatedAt: number;
};

export const getCreditsHolds = async (limit = 200): Promise<CreditsHold[] | null> => {
  try {
    if (!isLocalLoggedIn()) return null;
    const userId = getCurrentUserId();
    const token = getAuthToken();
    if (!userId || !token) return null;
    const n = Number(limit) || 200;
    const url = `${HOLDS_URL}?userId=${encodeURIComponent(userId)}&limit=${encodeURIComponent(String(n))}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const list = Array.isArray(json?.holds) ? json.holds : [];
    return list
      .map((h: any) => {
        const id = typeof h?.id === 'string' ? h.id.trim() : '';
        const uid = typeof h?.userId === 'string' ? h.userId.trim() : '';
        if (!id || !uid) return null;
        const cost = Number(h?.cost ?? 0) || 0;
        const reason = typeof h?.reason === 'string' ? h.reason.trim() : '';
        const requestId = typeof h?.requestId === 'string' ? h.requestId.trim() : '';
        const statusRaw = typeof h?.status === 'string' ? h.status.trim() : '';
        const status: CreditsHoldStatus =
          statusRaw === 'confirmed' || statusRaw === 'refunded' ? statusRaw : 'frozen';
        const createdAt = Number(h?.createdAt ?? 0) || 0;
        const updatedAt = Number(h?.updatedAt ?? 0) || 0;
        return { id, userId: uid, cost, reason, requestId, status, createdAt, updatedAt };
      })
      .filter((x: any) => !!x) as CreditsHold[];
  } catch {
    return null;
  }
};

export type CreditsCheckinResult =
  | { ok: true; alreadyCheckedIn: boolean; creditsAdded: number; wallet: CreditsBalance | null }
  | { ok: false; error: string };

export const checkinCredits = async (): Promise<CreditsCheckinResult> => {
  try {
    return { ok: false, error: 'DISABLED' };
  } catch (e: any) {
    return { ok: false, error: typeof e?.message === 'string' ? e.message : 'CHECKIN_FAILED' };
  }
};
