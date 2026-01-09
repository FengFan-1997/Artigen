import { buildApiUrl } from '@/utils/api';
import { getAuthToken, getCurrentUserId, isLocalLoggedIn } from '@/login/session';

export type CreditsBalance = {
  userId: string;
  available: number;
  frozen: number;
  lastCheckinDay?: string;
};

const BALANCE_URL = buildApiUrl('/api/credits/balance');

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
