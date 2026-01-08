import { buildApiUrl } from '@/utils/api';
import { ensureGuestUserId, getAuthToken } from '@/login/session';

export type CreditsBalance = {
  userId: string;
  available: number;
  frozen: number;
  lastCheckinDay?: string;
};

const BALANCE_URL = buildApiUrl('/api/credits/balance');
const CHECKIN_URL = buildApiUrl('/api/credits/checkin');

export const getCreditsBalance = async (): Promise<CreditsBalance | null> => {
  try {
    const userId = ensureGuestUserId();
    const token = getAuthToken();
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
    const userId = ensureGuestUserId();
    const token = getAuthToken();
    const res = await fetch(CHECKIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ userId })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok)
      return { ok: false, error: String(json?.error || json?.message || 'CHECKIN_FAILED') };
    return {
      ok: true,
      alreadyCheckedIn: !!json?.alreadyCheckedIn,
      creditsAdded: Number(json?.creditsAdded ?? 0) || 0,
      wallet: (json?.wallet as CreditsBalance | null) || null
    };
  } catch (e: any) {
    return { ok: false, error: typeof e?.message === 'string' ? e.message : 'CHECKIN_FAILED' };
  }
};
