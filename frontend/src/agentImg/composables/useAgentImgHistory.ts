import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { buildApiUrl } from '@/utils/api';
import { ensureGuestUserId } from '@/login/session';
import { authFetch } from '@/login/authFetch';
import { fetchJsonQuery } from '@/services/serverState';
import type { AgentImgPromptResult } from '../types';

export type HistoryItem = {
  id: string | number;
  timestamp: number;
  userText: string;
  result: AgentImgPromptResult;
  image: string | null;
  status?: 'pending' | 'success' | 'failed' | 'cancelled';
  errorCode?: string;
  errorText?: string;
  failedStage?: 'directions' | 'generation' | 'image_load' | 'unknown';
  refImages?: string[];
  aiText?: string;
  notice?: { type: 'cancel'; text: string } | null;
  taskV2?: boolean;
  taskId?: string;
  assetId?: string;
  profileId?: string;
  aspectRatio?: string;
};

const MAX_HISTORY = 200;
const HISTORY_STORAGE_VERSION = 2;
const HISTORY_STORAGE_PREFIX = 'artigen_history_v2_';
const LEGACY_HISTORY_STORAGE_PREFIX = 'artigen_history_v1_';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

type PersistedHistoryItemV2 = {
  id: string | number;
  timestamp: number;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  errorCode?: string;
  failedStage?: 'directions' | 'generation' | 'image_load' | 'unknown';
  taskV2?: true;
  taskId?: string;
  assetId?: string;
  profileId?: string;
  aspectRatio?: string;
};

type PersistedHistoryV2 = {
  version: typeof HISTORY_STORAGE_VERSION;
  items: PersistedHistoryItemV2[];
};

const normalizePersistedId = (raw: unknown): string | number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^[A-Za-z0-9_-]{1,96}$/.test(value) ? value : null;
};

const normalizeHistoryStatus = (
  raw: unknown
): PersistedHistoryItemV2['status'] | null => {
  return raw === 'pending' || raw === 'success' || raw === 'failed' || raw === 'cancelled'
    ? raw
    : null;
};

export const serializeAgentImgHistory = (items: HistoryItem[]) => {
  const persistedItems: PersistedHistoryItemV2[] = [];
  for (const item of items.slice(-MAX_HISTORY)) {
    const id = normalizePersistedId(item.id);
    const timestamp =
      typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) && item.timestamp > 0
        ? item.timestamp
        : 0;
    const status = normalizeHistoryStatus(item.status);
    const taskId =
      typeof item.taskId === 'string' && UUID_PATTERN.test(item.taskId.trim())
        ? item.taskId.trim()
        : '';
    const assetId =
      typeof item.assetId === 'string' && UUID_PATTERN.test(item.assetId.trim())
        ? item.assetId.trim()
        : '';
    // A successful legacy entry without an opaque asset cannot be restored
    // safely. Authenticated history is reconstructed from the server instead.
    if (id === null || !timestamp || !status || (status === 'success' && !assetId)) continue;
    const errorCode =
      typeof item.errorCode === 'string' && SAFE_CODE_PATTERN.test(item.errorCode.trim())
        ? item.errorCode.trim()
        : '';
    const failedStage =
      item.failedStage === 'directions' ||
      item.failedStage === 'generation' ||
      item.failedStage === 'image_load' ||
      item.failedStage === 'unknown'
        ? item.failedStage
        : undefined;
    const profileId =
      typeof item.profileId === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(item.profileId.trim())
        ? item.profileId.trim()
        : '';
    const aspectRatio =
      typeof item.aspectRatio === 'string' && /^\d{1,3}:\d{1,3}$/.test(item.aspectRatio.trim())
        ? item.aspectRatio.trim()
        : '';
    persistedItems.push({
      id,
      timestamp,
      status,
      ...(errorCode ? { errorCode } : {}),
      ...(failedStage ? { failedStage } : {}),
      ...(item.taskV2 === true ? { taskV2: true } : {}),
      ...(taskId ? { taskId } : {}),
      ...(assetId ? { assetId } : {}),
      ...(profileId ? { profileId } : {}),
      ...(aspectRatio ? { aspectRatio } : {})
    });
  }
  const payload: PersistedHistoryV2 = {
    version: HISTORY_STORAGE_VERSION,
    items: persistedItems
  };
  return JSON.stringify(payload);
};

export const deserializeAgentImgHistory = (
  raw: string | null,
  language: 'zh' | 'en' = 'en'
): HistoryItem[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedHistoryV2> | null;
    if (
      !parsed ||
      parsed.version !== HISTORY_STORAGE_VERSION ||
      !Array.isArray(parsed.items)
    ) {
      return [];
    }
    const placeholder =
      language === 'zh' ? '已保存的生成任务' : 'Saved generation task';
    const normalized: HistoryItem[] = [];
    for (const item of parsed.items.slice(-MAX_HISTORY)) {
      const id = normalizePersistedId(item?.id);
      const timestamp =
        typeof item?.timestamp === 'number' &&
        Number.isFinite(item.timestamp) &&
        item.timestamp > 0
          ? item.timestamp
          : 0;
      const status = normalizeHistoryStatus(item?.status);
      const taskId =
        typeof item?.taskId === 'string' && UUID_PATTERN.test(item.taskId.trim())
          ? item.taskId.trim()
          : '';
      const assetId =
        typeof item?.assetId === 'string' && UUID_PATTERN.test(item.assetId.trim())
          ? item.assetId.trim()
          : '';
      if (id === null || !timestamp || !status || (status === 'success' && !assetId)) continue;
      const errorCode =
        typeof item?.errorCode === 'string' && SAFE_CODE_PATTERN.test(item.errorCode.trim())
          ? item.errorCode.trim()
          : '';
      const failedStage =
        item?.failedStage === 'directions' ||
        item?.failedStage === 'generation' ||
        item?.failedStage === 'image_load' ||
        item?.failedStage === 'unknown'
          ? item.failedStage
          : undefined;
      const profileId =
        typeof item?.profileId === 'string' &&
        /^[A-Za-z0-9._-]{1,64}$/.test(item.profileId.trim())
          ? item.profileId.trim()
          : '';
      const aspectRatio =
        typeof item?.aspectRatio === 'string' &&
        /^\d{1,3}:\d{1,3}$/.test(item.aspectRatio.trim())
          ? item.aspectRatio.trim()
          : '';
      normalized.push({
        id,
        timestamp,
        userText: placeholder,
        result: { prompt: '', negativePrompt: '' },
        image: assetId ? `/api/assets/${encodeURIComponent(assetId)}` : null,
        status,
        ...(errorCode ? { errorCode } : {}),
        ...(failedStage ? { failedStage } : {}),
        ...(item?.taskV2 === true ? { taskV2: true } : {}),
        ...(taskId ? { taskId } : {}),
        ...(assetId ? { assetId } : {}),
        ...(profileId ? { profileId } : {}),
        ...(aspectRatio ? { aspectRatio } : {})
      });
    }
    return normalized;
  } catch {
    return [];
  }
};

export function useAgentImgHistory(
  authUserId: Ref<string>,
  isAuthed: Ref<boolean>,
  syncAuth: () => void,
  _scrollChatToBottom: () => void
) {
  const history = ref<HistoryItem[]>([]);

  const historyStorageKey = computed(() => {
    const uid = String(authUserId.value || '').trim() || ensureGuestUserId();
    return `${HISTORY_STORAGE_PREFIX}${uid}`;
  });

  const legacyHistoryStorageKey = computed(() => {
    const uid = String(authUserId.value || '').trim() || ensureGuestUserId();
    return `${LEGACY_HISTORY_STORAGE_PREFIX}${uid}`;
  });

  const isHiddenHistoryItem = (userText: string) => {
    const t = String(userText || '')
      .trim()
      .toLowerCase();
    return t.startsWith('id_photo:') || t.startsWith('old_photo:');
  };

  const readHistoryFromStorage = () => {
    try {
      // Older builds stored prompts, product profiles and image URLs verbatim.
      // Never deserialize that schema; remove it during the first V2 read.
      window.localStorage.removeItem(legacyHistoryStorageKey.value);
      const raw = window.localStorage.getItem(historyStorageKey.value);
      const language = String(window.localStorage.getItem('app_lang') || '').startsWith('zh')
        ? 'zh'
        : 'en';
      return deserializeAgentImgHistory(raw, language);
    } catch {
      return [];
    }
  };

  const loadHistoryFromStorage = () => {
    history.value = readHistoryFromStorage();
  };

  const resolveRemoteUrl = (raw: string) => {
    const u = String(raw || '').trim();
    if (!u) return '';
    // Keep relative paths intact so same-origin requests can use the HttpOnly session cookie.
    if (u.startsWith('/')) return u;
    return u;
  };

  const extractUserTextFromPrompt = (prompt: string) => {
    const p = String(prompt || '').trim();
    if (!p) return '';
    const m1 = p.match(/(?:^|\n\n)\s*(?:用户需求|User Request)\s*:\s*\n([\s\S]+)$/i);
    if (m1 && typeof m1[1] === 'string' && m1[1].trim()) return m1[1].trim();
    const m2 = p.match(/(?:^|\n\n)\s*(?:用户需求|User Request)\s*:\s*([\s\S]+)$/i);
    if (m2 && typeof m2[1] === 'string' && m2[1].trim()) return m2[1].trim();
    const m3 = p.match(/(?:^|\n\n)\s*User input\s*:\s*([\s\S]+)$/i);
    if (m3 && typeof m3[1] === 'string' && m3[1].trim()) return m3[1].trim();
    return p;
  };

  const loadHistoryFromServer = async () => {
    try {
      syncAuth();
      const userId = String(authUserId.value || '').trim();
      if (!userId || userId.startsWith('guest_') || !isAuthed.value) return false;
      const url = buildApiUrl(`/api/images/history/${encodeURIComponent(userId)}?limit=200`);
      const json: any = await fetchJsonQuery({
        queryKey: ['history', userId],
        request: (signal) => authFetch(url, { signal })
      });
      const items: any[] = Array.isArray(json?.items) ? json.items : [];
      const mapped = items
        .map((it): HistoryItem | null => {
          const ts = typeof it?.ts === 'number' && Number.isFinite(it.ts) ? it.ts : 0;
          const prompt = typeof it?.prompt === 'string' ? it.prompt.trim() : '';
          const negativePrompt =
            typeof it?.negativePrompt === 'string' ? it.negativePrompt.trim() : '';
          const userText = (() => {
            const ut = typeof it?.userText === 'string' ? it.userText.trim() : '';
            if (ut) return ut;
            return extractUserTextFromPrompt(prompt);
          })();
          if (isHiddenHistoryItem(userText)) return null;
          const images = Array.isArray(it?.images) ? it.images : [];
          const inputImages = Array.isArray(it?.inputImages) ? it.inputImages : [];
          const firstUrl = (() => {
            for (const img of images) {
              const u = typeof img?.url === 'string' ? img.url.trim() : '';
              const resolved = resolveRemoteUrl(u);
              if (resolved) return resolved;
            }
            return '';
          })();
          const refs = inputImages
            .map((x: any) => (typeof x?.url === 'string' ? x.url.trim() : ''))
            .map((x: string) => resolveRemoteUrl(x))
            .filter((x: string) => !!x)
            .slice(0, 3);
          if (!ts || !prompt || !negativePrompt || !userText) return null;
          const idRaw = typeof it?.id === 'string' && it.id.trim() ? it.id.trim() : `h_${ts}`;
          return {
            id: idRaw,
            timestamp: ts,
            userText,
            result: { prompt, negativePrompt, params: it?.params },
            image: firstUrl || null,
            status: firstUrl ? 'success' : 'failed',
            ...(refs.length ? { refImages: refs } : {}),
            notice: null
          };
        })
        .filter((x): x is HistoryItem => x !== null);
      mapped.sort((a, b) => a.timestamp - b.timestamp);
      const finalList = mapped.slice(-MAX_HISTORY);
      if (finalList.length) {
        const seen = new Set(finalList.map((it) => String(it.id)));
        const localOnly = readHistoryFromStorage().filter((it) => {
          if (seen.has(String(it.id))) return false;
          const status = String(it.status || '').trim();
          return it.taskV2 === true || status === 'failed' || status === 'cancelled' || status === 'pending';
        });
        history.value = [...finalList, ...localOnly]
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-MAX_HISTORY);
      } else {
        loadHistoryFromStorage();
      }
      return true;
    } catch {
      return false;
    }
  };

  let historyPersistTimer: number | null = null;
  const persistHistoryNow = () => {
    try {
      window.localStorage.removeItem(legacyHistoryStorageKey.value);
      window.localStorage.setItem(
        historyStorageKey.value,
        serializeAgentImgHistory(history.value)
      );
    } catch {}
  };

  const persistHistoryThrottled = () => {
    if (historyPersistTimer) return;
    historyPersistTimer = window.setTimeout(() => {
      historyPersistTimer = null;
      persistHistoryNow();
    }, 250);
  };

  watch(
    () => history.value,
    () => persistHistoryThrottled()
  );

  const historyForSidebar = computed(() => [...history.value].slice().reverse());

  let historyScrollRevision = 0;
  let historyScrollCleanup: (() => void) | null = null;
  const positionGeneration = (id: string | number) => {
    const el = document.getElementById(`gen-${id}`);
    if (!el) return;
    const container = el.closest<HTMLElement>('.chat-scroll');
    if (!container) {
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }
    // Only move the chat scroller. scrollIntoView can also move outer layout
    // ancestors, and closing a dialog/sidebar may then restore their scroll
    // position over this semantic history jump.
    const containerRect = container.getBoundingClientRect();
    const targetRect = el.getBoundingClientRect();
    container.scrollTop += targetRect.top - containerRect.top - 24;
  };

  const scrollToGeneration = (id: string | number) => {
    const revision = ++historyScrollRevision;
    historyScrollCleanup?.();
    historyScrollCleanup = null;
    positionGeneration(id);
    // Overlay removal, responsive sidebar closure, and the chat history render
    // all settle asynchronously. Re-assert the target after Vue's DOM flush and
    // two paint boundaries; a newer history selection invalidates this work.
    void nextTick().then(() => {
      requestAnimationFrame(() => {
        if (revision !== historyScrollRevision) return;
        positionGeneration(id);
        const target = document.getElementById(`gen-${id}`);
        const container = target?.closest<HTMLElement>('.chat-scroll');
        if (target && container) {
          let resizeFrame = 0;
          let disposed = false;
          const repositionAfterLayout = () => {
            if (disposed || revision !== historyScrollRevision) return;
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
              if (!disposed && revision === historyScrollRevision) positionGeneration(id);
            });
          };
          const observer = typeof ResizeObserver === 'function'
            ? new ResizeObserver(repositionAfterLayout)
            : null;
          observer?.observe(target);
          observer?.observe(container);
          const content = container.querySelector<HTMLElement>('.messages');
          if (content) observer?.observe(content);
          container.addEventListener('load', repositionAfterLayout, true);
          const timeout = window.setTimeout(() => cleanup(), 1500);
          const cleanup = () => {
            if (disposed) return;
            disposed = true;
            window.clearTimeout(timeout);
            cancelAnimationFrame(resizeFrame);
            observer?.disconnect();
            container.removeEventListener('load', repositionAfterLayout, true);
            if (historyScrollCleanup === cleanup) historyScrollCleanup = null;
          };
          historyScrollCleanup = cleanup;
        }
        requestAnimationFrame(() => {
          if (revision === historyScrollRevision) positionGeneration(id);
        });
      });
    });
  };

  const onHistoryItemClick = (id: string | number, closeSidebar: () => void) => {
    closeSidebar();
    scrollToGeneration(id);
  };

  onBeforeUnmount(() => {
    historyScrollRevision += 1;
    historyScrollCleanup?.();
    historyScrollCleanup = null;
    if (historyPersistTimer) {
      window.clearTimeout(historyPersistTimer);
      historyPersistTimer = null;
      persistHistoryNow();
    }
  });

  const setCancelNoticeForHistory = (id: string | number, text: string) => {
    history.value = history.value.map((it) => {
      if (it.id === id)
        return {
          ...it,
          status: 'cancelled',
          errorCode: 'ABORTED',
          errorText: text,
          failedStage: 'generation',
          notice: { type: 'cancel', text }
        };
      return it;
    });
  };

  const setHistoryItemStatus = (
    id: string | number,
    next: Partial<Pick<
      HistoryItem,
      | 'status'
      | 'errorCode'
      | 'errorText'
      | 'failedStage'
      | 'image'
      | 'taskId'
      | 'assetId'
      | 'profileId'
      | 'aspectRatio'
    >>
  ) => {
    history.value = history.value.map((it) => {
      if (it.id !== id) return it;
      const status = next.status || it.status;
      return {
        ...it,
        ...(status ? { status } : {}),
        ...(Object.prototype.hasOwnProperty.call(next, 'image') ? { image: next.image ?? null } : {}),
        ...(next.taskId ? { taskId: next.taskId } : {}),
        ...(next.assetId ? { assetId: next.assetId } : {}),
        ...(next.profileId ? { profileId: next.profileId } : {}),
        ...(next.aspectRatio ? { aspectRatio: next.aspectRatio } : {}),
        errorCode: next.errorCode || '',
        errorText: next.errorText || '',
        failedStage: next.failedStage,
        notice: status === 'cancelled' ? it.notice : null
      };
    });
  };

  const removeHistoryItem = (id: string | number) => {
    history.value = history.value.filter((it) => it.id !== id);
  };

  return {
    history,
    loadHistoryFromStorage,
    loadHistoryFromServer,
    historyForSidebar,
    onHistoryItemClick,
    scrollToGeneration,
    setCancelNoticeForHistory,
    setHistoryItemStatus,
    removeHistoryItem
  };
}
