import { ref, type Ref } from 'vue';

export const MOTION_PRIORITY = {
  avatarPlan: 100,
  user: 90,
  ai: 80,
  system: 70,
  micro: 40,
  idle: 30
} as const;

export function useMotionArbitration(input: {
  motionCommand: Ref<string>;
  lockInteraction: (ms: number) => void;
}) {
  type MotionEntry = {
    until: number;
    priority: number;
    name: string;
    source: string;
    channel: string;
    updatedAt: number;
    lockInteractionMs?: number;
  };

  const perChannel = ref<Record<string, MotionEntry>>({});
  const winnerKey = ref<string>('');
  let winnerTimer: number | null = null;
  let arbToken = 0;

  const cleanupExpired = (now: number) => {
    const obj = perChannel.value;
    for (const [k, v] of Object.entries(obj)) {
      if (!v || typeof v.until !== 'number') {
        delete obj[k];
        continue;
      }
      if (now >= v.until) delete obj[k];
    }
  };

  const pickWinner = (now: number): { key: string; entry: MotionEntry } | null => {
    let best: { key: string; entry: MotionEntry } | null = null;
    for (const [key, entry] of Object.entries(perChannel.value)) {
      if (!entry || now >= entry.until) continue;
      if (!best) {
        best = { key, entry };
        continue;
      }
      if (entry.priority > best.entry.priority) best = { key, entry };
      else if (entry.priority === best.entry.priority && entry.updatedAt > best.entry.updatedAt)
        best = { key, entry };
    }
    return best;
  };

  const scheduleWinnerRecalc = (ms: number) => {
    if (winnerTimer) window.clearTimeout(winnerTimer);
    const d = Math.max(0, Math.round(ms));
    arbToken += 1;
    const token = arbToken;
    winnerTimer = window.setTimeout(() => {
      if (arbToken !== token) return;
      updateWinner();
    }, d);
  };

  const updateWinner = () => {
    const now = Date.now();
    cleanupExpired(now);
    const best = pickWinner(now);
    const nextKey = best ? best.key : '';
    if (!best) {
      winnerKey.value = '';
      input.motionCommand.value = '';
      if (winnerTimer) {
        window.clearTimeout(winnerTimer);
        winnerTimer = null;
      }
      return;
    }

    winnerKey.value = nextKey;
    input.motionCommand.value = best.entry.name;
    scheduleWinnerRecalc(best.entry.until - now + 2);
  };

  const requestMotion = (
    name: string,
    duration?: number,
    options?: {
      priority?: number;
      source?: string;
      force?: boolean;
      lockInteractionMs?: number;
      channel?: string;
    }
  ) => {
    const n = String(name || '').trim();
    if (!n) return false;
    const d = typeof duration === 'number' && Number.isFinite(duration) ? duration : 2000;
    const now = Date.now();
    const channel = String(options?.channel || options?.source || 'default').trim() || 'default';
    const priority =
      typeof options?.priority === 'number' && Number.isFinite(options.priority)
        ? options.priority
        : MOTION_PRIORITY.system;
    const source = String(options?.source || 'unknown').trim() || 'unknown';
    const force = !!options?.force;

    const cur = perChannel.value[channel];
    if (cur && !force && now < cur.until) {
      if (priority < cur.priority) return false;
      if (priority === cur.priority && cur.name === n) return false;
    }

    perChannel.value[channel] = {
      until: now + Math.max(200, d),
      priority,
      name: n,
      source,
      channel,
      updatedAt: now,
      lockInteractionMs:
        typeof options?.lockInteractionMs === 'number' && options.lockInteractionMs > 0
          ? options.lockInteractionMs
          : undefined
    };

    const prevWinner = winnerKey.value;
    updateWinner();
    if (winnerKey.value === channel && prevWinner !== winnerKey.value) {
      const lockMs = perChannel.value[channel]?.lockInteractionMs;
      if (typeof lockMs === 'number' && lockMs > 0) input.lockInteraction(lockMs);
    } else if (winnerKey.value === channel) {
      const lockMs = perChannel.value[channel]?.lockInteractionMs;
      if (typeof lockMs === 'number' && lockMs > 0) input.lockInteraction(lockMs);
    }
    return true;
  };

  const playMotionInternal = (name: string, duration?: number) => {
    requestMotion(name, duration, { priority: MOTION_PRIORITY.system, source: 'internal' });
  };

  const clearChannel = (channel: string) => {
    const key = String(channel || '').trim();
    if (!key) return;
    if (perChannel.value[key]) delete perChannel.value[key];
    updateWinner();
  };

  const clearAll = () => {
    perChannel.value = {};
    updateWinner();
  };

  return {
    requestMotion,
    playMotionInternal,
    clearChannel,
    clearAll
  };
}
