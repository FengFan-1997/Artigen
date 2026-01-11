import { buildApiUrl } from '@/utils/api';
import { getAuthToken, getCurrentUserId, isLocalLoggedIn } from '@/login/session';

export type CreditsBalance = {
  userId: string;
  available: number;
  frozen: number;
  lastCheckinDay?: string;
};

const BALANCE_URL = buildApiUrl('/api/credits/balance');
const CREATE_ORDER_URL = buildApiUrl('/api/pay/create-order');
const ORDERS_URL = buildApiUrl('/api/credits/orders');
const HOLDS_URL = buildApiUrl('/api/credits/holds');

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
    if (!isLocalLoggedIn()) return { ok: false, error: 'LOGIN_REQUIRED' };
    const userId = getCurrentUserId();
    const token = getAuthToken();
    if (!userId || !token) return { ok: false, error: 'LOGIN_REQUIRED' };
    const res = await fetch(CREATE_ORDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ userId, packageId })
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      const err =
        typeof json?.error === 'string' && json.error.trim()
          ? json.error.trim()
          : 'CREATE_ORDER_FAILED';
      return { ok: false, error: err };
    }
    const orderId = typeof json?.orderId === 'string' ? json.orderId.trim() : '';
    const uid = typeof json?.userId === 'string' ? json.userId.trim() : '';
    const pid = typeof json?.packageId === 'string' ? json.packageId.trim() : '';
    if (!orderId || !uid || !pid) return { ok: false, error: 'INVALID_RESPONSE' };
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
