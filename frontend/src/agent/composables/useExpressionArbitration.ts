import { ref } from 'vue';
import { MOTION_PRIORITY } from './useMotionArbitration';

export function useExpressionArbitration(input: {
  clearVisualTransientEmotions: () => void;
  applyExpression: (expression: string | undefined, duration: number) => void;
}) {
  type ExpressionEntry = {
    until: number;
    priority: number;
    expression: string;
    source: string;
    channel: string;
    updatedAt: number;
  };

  const perChannel = ref<Record<string, ExpressionEntry>>({});
  const winnerKey = ref<string>('');
  const winnerSig = ref<string>('');
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

  const pickWinner = (now: number): { key: string; entry: ExpressionEntry } | null => {
    let best: { key: string; entry: ExpressionEntry } | null = null;
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
    if (!best) {
      winnerKey.value = '';
      winnerSig.value = '';
      if (winnerTimer) {
        window.clearTimeout(winnerTimer);
        winnerTimer = null;
      }
      return;
    }
    const nextSig = `${best.key}|${best.entry.expression}|${best.entry.until}`;
    if (winnerSig.value !== nextSig) {
      winnerSig.value = nextSig;
      winnerKey.value = best.key;
      input.clearVisualTransientEmotions();
      input.applyExpression(best.entry.expression, best.entry.until - now);
    } else {
      winnerKey.value = best.key;
    }
    scheduleWinnerRecalc(best.entry.until - now + 2);
  };

  const requestExpression = (
    expression: string | undefined,
    duration: number,
    options?: { priority?: number; source?: string; force?: boolean; channel?: string }
  ) => {
    const exp = String(expression || '').trim();
    if (!exp) return false;
    const d = Math.max(200, Math.round(duration));
    const now = Date.now();
    const priority =
      typeof options?.priority === 'number' && Number.isFinite(options.priority)
        ? options.priority
        : MOTION_PRIORITY.system;
    const source = String(options?.source || 'unknown').trim() || 'unknown';
    const force = !!options?.force;
    const channel = String(options?.channel || options?.source || 'default').trim() || 'default';

    const cur = perChannel.value[channel];
    if (cur && !force && now < cur.until) {
      if (priority < cur.priority) return false;
      if (priority === cur.priority && cur.expression.toLowerCase() === exp.toLowerCase())
        return false;
    }

    perChannel.value[channel] = {
      until: now + d,
      priority,
      expression: exp,
      source,
      channel,
      updatedAt: now
    };
    updateWinner();
    return true;
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

  return { requestExpression, clearChannel, clearAll };
}
