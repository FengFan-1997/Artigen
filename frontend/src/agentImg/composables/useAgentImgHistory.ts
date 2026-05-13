import { computed, ref, watch, type Ref } from 'vue';
import { buildApiUrl } from '@/utils/api';
import { ensureGuestUserId } from '@/login/session';
import type { AgentImgPromptResult } from '../types';

export type HistoryItem = {
  id: string | number;
  timestamp: number;
  userText: string;
  result: AgentImgPromptResult;
  image: string | null;
  refImages?: string[];
  aiText?: string;
  notice?: { type: 'cancel'; text: string } | null;
};

const MAX_HISTORY = 200;

export function useAgentImgHistory(
  authUserId: Ref<string>,
  authToken: Ref<string>,
  isAuthed: Ref<boolean>,
  syncAuth: () => void,
  _scrollChatToBottom: () => void
) {
  const history = ref<HistoryItem[]>([]);

  const historyStorageKey = computed(() => {
    const uid = String(authUserId.value || '').trim() || ensureGuestUserId();
    return `artigen_history_v1_${uid}`;
  });

  const isHiddenHistoryItem = (userText: string) => {
    const t = String(userText || '')
      .trim()
      .toLowerCase();
    return t.startsWith('id_photo:') || t.startsWith('old_photo:');
  };

  const loadHistoryFromStorage = () => {
    try {
      const raw = window.localStorage.getItem(historyStorageKey.value);
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const normalized: HistoryItem[] = [];
      for (const it of list) {
        const id =
          typeof it?.id === 'string'
            ? it.id.trim()
            : typeof it?.id === 'number' && Number.isFinite(it.id)
              ? it.id
              : '';
        const timestamp =
          typeof it?.timestamp === 'number' && Number.isFinite(it.timestamp) ? it.timestamp : 0;
        const userText = typeof it?.userText === 'string' ? it.userText.trim() : '';
        const res = it?.result && typeof it.result === 'object' ? it.result : null;
        const prompt = typeof res?.prompt === 'string' ? res.prompt.trim() : '';
        const negativePrompt =
          typeof res?.negativePrompt === 'string' ? res.negativePrompt.trim() : '';
        if (!id || !timestamp || !prompt || !negativePrompt) continue;
        if (!userText || userText === prompt) continue;
        const params = res?.params && typeof res.params === 'object' ? res.params : undefined;
        const image = typeof it?.image === 'string' && it.image.trim() ? it.image.trim() : null;
        const aiText = typeof it?.aiText === 'string' && it.aiText.trim() ? it.aiText.trim() : '';
        const refImagesRaw = Array.isArray(it?.refImages) ? it.refImages : [];
        const refImages = refImagesRaw
          .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
          .filter((x: string) => !!x)
          .slice(0, 3);
        if (isHiddenHistoryItem(userText)) continue;
        normalized.push({
          id,
          timestamp,
          userText,
          result: { prompt, negativePrompt, params },
          image,
          ...(refImages.length ? { refImages } : {}),
          ...(aiText ? { aiText } : {})
        });
        if (normalized.length >= MAX_HISTORY) break;
      }
      history.value = normalized;
    } catch {
      history.value = [];
    }
  };

  const resolveRemoteUrl = (raw: string) => {
    const u = String(raw || '').trim();
    if (!u) return '';
    // Keep relative paths (e.g. /files/...) intact so the caller's URL
    // resolver can attach auth tokens and pick the correct origin.
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
      const token = String(authToken.value || '').trim();
      if (!userId || !token || !isAuthed.value) return false;
      const url = buildApiUrl(`/api/images/history/${encodeURIComponent(userId)}?limit=200`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return false;
      const json: any = await res.json().catch(() => null);
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
            ...(refs.length ? { refImages: refs } : {}),
            notice: null
          };
        })
        .filter((x): x is HistoryItem => x !== null);
      mapped.sort((a, b) => a.timestamp - b.timestamp);
      const finalList = mapped.slice(-MAX_HISTORY);
      if (finalList.length) {
        history.value = finalList;
      } else {
        loadHistoryFromStorage();
      }
      return true;
    } catch {
      return false;
    }
  };

  let historyPersistTimer: number | null = null;
  const persistHistoryThrottled = () => {
    if (historyPersistTimer) return;
    historyPersistTimer = window.setTimeout(() => {
      historyPersistTimer = null;
      try {
        window.localStorage.setItem(
          historyStorageKey.value,
          JSON.stringify(history.value.slice(0, MAX_HISTORY))
        );
      } catch {}
    }, 250);
  };

  watch(
    () => history.value,
    () => persistHistoryThrottled()
  );

  const historyForSidebar = computed(() => [...history.value].slice().reverse());

  const scrollToGeneration = (id: string | number) => {
    const el = document.getElementById(`gen-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onHistoryItemClick = (id: string | number, closeSidebar: () => void) => {
    scrollToGeneration(id);
    closeSidebar();
  };

  const setCancelNoticeForHistory = (id: string | number, text: string) => {
    history.value = history.value.map((it) => {
      if (it.id === id) return { ...it, notice: { type: 'cancel', text } };
      return it;
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
    removeHistoryItem
  };
}
