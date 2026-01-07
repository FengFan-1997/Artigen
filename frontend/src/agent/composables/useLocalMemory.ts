import { computed, ref } from 'vue';
import {
  LOCAL_MEMORY_COMPRESS_HEAD,
  LOCAL_MEMORY_COMPRESS_LINE_MAX_CHARS,
  LOCAL_MEMORY_COMPRESS_MAX_LINES,
  LOCAL_MEMORY_COMPRESS_SCHEDULE_MS,
  LOCAL_MEMORY_COMPRESS_THRESHOLD,
  LOCAL_MEMORY_MAX_ITEMS,
  LOCAL_MEMORY_PERSIST_THROTTLE_MS,
  LOCAL_MEMORY_SERVER_FLUSH_DEBOUNCE_MS,
  LOCAL_MEMORY_SUMMARY_MAX_CHARS
} from '../constants';
import { safeJsonParse, scheduleIdleTask } from '../utils';
import { buildApiUrl, getApiBaseUrl, getAuthToken, getUserId } from '../utils/user';

export type LocalMemoryItem = {
  ts: number;
  role: 'user' | 'agent' | 'system';
  text: string;
  type?: string;
};

export type LocalMemory = { items: LocalMemoryItem[] };

export type MemoryFact = { ts: number; text: string };

export function useLocalMemory() {
  const localMemory = ref<LocalMemory>({ items: [] });
  const memoryKey = computed(() => `agent_memory_v1_${getUserId()}`);
  const memorySummaryKey = computed(() => `agent_memory_summary_v1_${getUserId()}`);
  const factsKey = computed(() => `agent_memory_facts_v1_${getUserId()}`);
  const memorySummary = ref('');
  const memoryFacts = ref<MemoryFact[]>([]);
  let persistTimer: number | null = null;
  let cancelCompress: null | (() => void) = null;
  let cancelFlush: null | (() => void) = null;
  const pendingToIngest: LocalMemoryItem[] = [];
  const apiBaseUrl = getApiBaseUrl();

  const coerceMemory = (raw: any): LocalMemory => {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const normalized: LocalMemoryItem[] = [];
    for (const it of items) {
      const role = it?.role;
      const text = it?.text;
      const ts = it?.ts;
      if (role !== 'user' && role !== 'agent' && role !== 'system') continue;
      if (typeof text !== 'string' || !text.trim()) continue;
      const safeTs = typeof ts === 'number' && Number.isFinite(ts) ? ts : Date.now();
      const type = typeof it?.type === 'string' && it.type.trim() ? it.type.trim() : undefined;
      normalized.push({ ts: safeTs, role, text, type });
      if (normalized.length >= LOCAL_MEMORY_MAX_ITEMS) break;
    }
    return { items: normalized.slice(-LOCAL_MEMORY_MAX_ITEMS) };
  };

  const loadLocalMemory = () => {
    const raw = (() => {
      try {
        return localStorage.getItem(memoryKey.value);
      } catch {
        return null;
      }
    })();

    const parsed = raw ? safeJsonParse<any>(raw, null) : null;
    localMemory.value = parsed ? coerceMemory(parsed) : { items: [] };

    const summaryRaw = (() => {
      try {
        return localStorage.getItem(memorySummaryKey.value);
      } catch {
        return null;
      }
    })();
    const rawSummaryText =
      summaryRaw && typeof summaryRaw === 'string' && summaryRaw.trim() ? summaryRaw : '';
    const trimmedSummaryText = rawSummaryText
      ? rawSummaryText.slice(-LOCAL_MEMORY_SUMMARY_MAX_CHARS)
      : '';
    memorySummary.value = trimmedSummaryText;
    if (rawSummaryText && rawSummaryText.length > LOCAL_MEMORY_SUMMARY_MAX_CHARS) {
      try {
        localStorage.setItem(memorySummaryKey.value, trimmedSummaryText);
      } catch {}
    }

    const factsRaw = (() => {
      try {
        return localStorage.getItem(factsKey.value);
      } catch {
        return null;
      }
    })();
    const parsedFacts = factsRaw ? safeJsonParse<any>(factsRaw, null) : null;
    const list = Array.isArray(parsedFacts) ? parsedFacts : [];
    const normalized: MemoryFact[] = [];
    for (const it of list) {
      const text = typeof it?.text === 'string' ? it.text.trim() : '';
      if (!text) continue;
      const ts = typeof it?.ts === 'number' && Number.isFinite(it.ts) ? it.ts : Date.now();
      normalized.push({ ts, text: text.slice(0, 240) });
      if (normalized.length >= 60) break;
    }
    memoryFacts.value = normalized.slice(-60);
  };

  const persistLocalMemory = () => {
    try {
      localStorage.setItem(
        memoryKey.value,
        JSON.stringify({ items: localMemory.value.items.slice(-LOCAL_MEMORY_MAX_ITEMS) })
      );
    } catch {}
  };

  const persistLocalMemoryThrottled = () => {
    if (persistTimer) return;
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      persistLocalMemory();
    }, LOCAL_MEMORY_PERSIST_THROTTLE_MS);
  };

  const persistMemorySummary = () => {
    try {
      localStorage.setItem(
        memorySummaryKey.value,
        String(memorySummary.value || '').slice(-LOCAL_MEMORY_SUMMARY_MAX_CHARS)
      );
    } catch {}
  };

  const persistMemoryFacts = () => {
    try {
      localStorage.setItem(factsKey.value, JSON.stringify(memoryFacts.value.slice(-60)));
    } catch {}
  };

  const normalizeFact = (text: string) =>
    String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const addMemoryFact = (text: string) => {
    const trimmed = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!trimmed) return;
    const norm = normalizeFact(trimmed);
    if (!norm) return;
    const existingIndex = memoryFacts.value.findIndex((f) => normalizeFact(f.text) === norm);
    const next = { ts: Date.now(), text: trimmed.slice(0, 240) };
    if (existingIndex >= 0) memoryFacts.value.splice(existingIndex, 1);
    memoryFacts.value.push(next);
    if (memoryFacts.value.length > 60) memoryFacts.value = memoryFacts.value.slice(-60);
    persistMemoryFacts();
  };

  const compressLocalMemoryIfNeeded = () => {
    const items = localMemory.value.items;
    if (items.length <= LOCAL_MEMORY_COMPRESS_THRESHOLD) return;
    const toCompress = items.slice(0, LOCAL_MEMORY_COMPRESS_HEAD);
    const keep = items.slice(LOCAL_MEMORY_COMPRESS_HEAD);

    const lines: string[] = [];
    for (const it of toCompress) {
      const role = it.role === 'user' ? 'U' : it.role === 'agent' ? 'A' : 'S';
      const head = it.type && it.role === 'system' ? `${role}:${it.type}` : role;
      const oneLine = String(it.text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, LOCAL_MEMORY_COMPRESS_LINE_MAX_CHARS);
      if (oneLine) lines.push(`${head} ${oneLine}`);
      if (lines.length >= LOCAL_MEMORY_COMPRESS_MAX_LINES) break;
    }
    const block = lines.join('\n').trim();
    if (!block) {
      localMemory.value.items = keep;
      persistLocalMemory();
      return;
    }

    const nextSummary = memorySummary.value
      ? `${memorySummary.value}\n\n${block}`.slice(-LOCAL_MEMORY_SUMMARY_MAX_CHARS)
      : block.slice(-LOCAL_MEMORY_SUMMARY_MAX_CHARS);
    memorySummary.value = nextSummary;
    persistMemorySummary();

    localMemory.value.items = keep;
    persistLocalMemoryThrottled();
  };

  const scheduleCompress = () => {
    if (cancelCompress) return;
    cancelCompress = scheduleIdleTask(() => {
      cancelCompress = null;
      compressLocalMemoryIfNeeded();
    }, LOCAL_MEMORY_COMPRESS_SCHEDULE_MS);
  };

  const flushToServer = async () => {
    if (!apiBaseUrl) {
      pendingToIngest.length = 0;
      return;
    }
    if (pendingToIngest.length === 0) return;

    const userId = getUserId();
    const token = getAuthToken();
    const items = pendingToIngest.splice(0, pendingToIngest.length);
    try {
      await fetch(buildApiUrl('/api/memory/ingest'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userId,
          items: items.map((x) => ({
            role: x.role,
            text: x.text,
            type: x.type,
            ts: x.ts
          }))
        })
      });
    } catch {
      pendingToIngest.unshift(...items.slice(-40));
      if (pendingToIngest.length > 80) pendingToIngest.length = 80;
    }
  };

  const scheduleFlushToServer = () => {
    if (cancelFlush) return;
    cancelFlush = scheduleIdleTask(() => {
      cancelFlush = null;
      void flushToServer();
    }, LOCAL_MEMORY_SERVER_FLUSH_DEBOUNCE_MS);
  };

  const pushMemoryItem = (item: Omit<LocalMemoryItem, 'ts'>) => {
    const next = { ...item, ts: Date.now() };
    localMemory.value.items.push(next);
    if (localMemory.value.items.length > LOCAL_MEMORY_MAX_ITEMS) {
      localMemory.value.items = localMemory.value.items.slice(-LOCAL_MEMORY_MAX_ITEMS);
    }
    pendingToIngest.push(next);
    if (pendingToIngest.length > 120) pendingToIngest.splice(0, pendingToIngest.length - 120);
    persistLocalMemoryThrottled();
    scheduleCompress();
    scheduleFlushToServer();
  };

  return {
    localMemory,
    memorySummary,
    memoryFacts,
    loadLocalMemory,
    pushMemoryItem,
    addMemoryFact
  };
}
