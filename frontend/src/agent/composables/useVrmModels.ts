import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { vrmRelativePaths } from 'virtual:vrm-models';
import { buildApiUrl } from '../utils/user';

type AgentType = 'cubism3' | 'cubism2' | 'vrm';

const VRM_HF_OWNER = 'Feng1997';
const VRM_HF_REPO = 'ModelDoc';
const VRM_HF_REF = 'main';
const VRM_HF_PREFIX = 'model/Genshin/all';
const VRM_MODEL_PATH_KEY = 'agent_vrm_model_path_v1';
const VRM_MODEL_INDEX_KEY = 'agent_vrm_model_index_v1';
const DEFAULT_REMOTE_VRM_PATH = `${VRM_HF_PREFIX}/YaeMiko.vrm`;

type VrmItem = { name: string; path: string };

const guessVrmNameFromPath = (p: string) => {
  const base = (p.split('/').pop() || p).replace(/\.vrm$/i, '');
  return base || 'Yae Miko';
};

const hashString = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const makeModelBadge = (rawName: string) => {
  const name = String(rawName || '').trim() || 'VRM';
  const hasCjk = /[\u4e00-\u9fff]/.test(name);
  const text = hasCjk
    ? name.replace(/\s+/g, '').slice(0, 2)
    : name
        .split(/[\s_-]+/g)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p.slice(0, 1).toUpperCase())
        .join('')
        .slice(0, 2) || name.slice(0, 2).toUpperCase();

  const hue = hashString(name) % 360;
  const bg = `hsl(${hue} 72% 42% / 0.95)`;
  const border = `hsl(${hue} 72% 58% / 0.55)`;
  return {
    badgeText: text,
    badgeStyle: {
      background: bg,
      borderColor: border
    } as Record<string, string>
  };
};

const buildProxyUrl = (path: string) => {
  const url = buildApiUrl(`/api/hf/${VRM_HF_OWNER}/${VRM_HF_REPO}/resolve/${VRM_HF_REF}/${path}`);
  return encodeURI(url);
};

const loadVrmModelPath = () => {
  try {
    const raw = localStorage.getItem(VRM_MODEL_PATH_KEY);
    const v = typeof raw === 'string' ? raw.trim() : '';
    return v || null;
  } catch {
    return null;
  }
};

const loadVrmModelIndex = (max: number) => {
  try {
    const raw = localStorage.getItem(VRM_MODEL_INDEX_KEY);
    const v = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(v)) return null;
    if (v < 0 || v >= max) return null;
    return v;
  } catch {
    return null;
  }
};

const getInitialRemoteVrmItems = () => {
  if (import.meta.env.DEV) return [];
  try {
    const storedPathRaw = localStorage.getItem(VRM_MODEL_PATH_KEY);
    const storedPath =
      typeof storedPathRaw === 'string' && storedPathRaw.trim() ? storedPathRaw : '';
    const path = storedPath || DEFAULT_REMOTE_VRM_PATH;
    return [{ name: guessVrmNameFromPath(path), path }];
  } catch {
    return [{ name: guessVrmNameFromPath(DEFAULT_REMOTE_VRM_PATH), path: DEFAULT_REMOTE_VRM_PATH }];
  }
};

export function useVrmModels(input: { agentType: Ref<AgentType> }) {
  const vrmModelIndex = ref(0);
  const vrmListLoading = ref(false);
  const vrmListError = ref('');
  const remoteVrmItems = ref<VrmItem[]>(getInitialRemoteVrmItems());
  const remoteVrmListLoaded = ref(false);

  const vrmPickerOpen = ref(false);
  const vrmPickerQuery = ref('');
  const vrmPickerEl = ref<HTMLElement | null>(null);
  const vrmPickerButtonEl = ref<HTMLElement | null>(null);
  const vrmPickerSearchEl = ref<HTMLInputElement | null>(null);

  const devVrmItems = computed<VrmItem[]>(() => {
    const list = Array.isArray(vrmRelativePaths) ? vrmRelativePaths : [];
    return list.map((relative) => {
      const base = (relative.split('/').pop() || relative).replace(/\.vrm$/i, '');
      return { name: base, path: relative };
    });
  });

  const vrmModels = computed<VrmItem[]>(() => {
    if (import.meta.env.DEV) return devVrmItems.value;
    return remoteVrmItems.value;
  });

  const hasVrmSupport = computed(() => vrmModels.value.length > 0);

  const canCycleVrmModel = computed(() => {
    if (vrmListLoading.value) return false;
    if (import.meta.env.DEV) return vrmModels.value.length > 1;
    if (!remoteVrmListLoaded.value) return true;
    return vrmModels.value.length > 1;
  });

  watch(
    () => hasVrmSupport.value,
    (next) => {
      if (!next && input.agentType.value === 'vrm') input.agentType.value = 'cubism3';
    },
    { immediate: true }
  );

  const currentVrmName = computed(() => {
    const item = vrmModels.value[vrmModelIndex.value];
    return item?.name || 'Yae Miko';
  });

  const currentVrmBadgeText = computed(() => makeModelBadge(currentVrmName.value).badgeText);
  const currentVrmBadgeStyle = computed(() => makeModelBadge(currentVrmName.value).badgeStyle);

  const vrmModelCounter = computed(() => {
    if (!import.meta.env.DEV && !remoteVrmListLoaded.value) return '1/…';
    const total = vrmModels.value.length;
    if (total <= 0) return '';
    const idx = Math.min(total, Math.max(1, vrmModelIndex.value + 1));
    return `${idx}/${total}`;
  });

  const filteredVrmModels = computed(() => {
    const q = vrmPickerQuery.value.trim().toLowerCase();
    const items = vrmModels.value.map((m, index) => {
      const badge = makeModelBadge(m?.name || '');
      return { ...m, index, ...badge };
    });
    if (!q) return items;
    return items.filter((m) =>
      String(m?.name || '')
        .toLowerCase()
        .includes(q)
    );
  });

  const currentVrmSrc = computed(() => {
    const item = vrmModels.value[vrmModelIndex.value];
    if (!item) return '';
    if (import.meta.env.DEV) {
      const abs = `${__DEV_VRM_BASE__}/${item.path}`;
      return encodeURI(`/@fs${abs}`);
    }
    return buildProxyUrl(item.path);
  });

  const persistVrmSelection = () => {
    try {
      localStorage.setItem(VRM_MODEL_INDEX_KEY, String(vrmModelIndex.value));
      const item = vrmModels.value[vrmModelIndex.value];
      if (item?.path) localStorage.setItem(VRM_MODEL_PATH_KEY, item.path);
    } catch {}
  };

  const selectVrmModel = (idx: number, closePicker = true) => {
    const list = vrmModels.value;
    if (idx < 0 || idx >= list.length) return;
    vrmModelIndex.value = idx;
    persistVrmSelection();
    if (closePicker) vrmPickerOpen.value = false;
  };

  const pickDefaultVrmModelIndex = () => {
    const list = vrmModels.value;
    if (list.length === 0) return 0;
    const preferred = list.findIndex((m) => /keqing|刻晴/i.test(m.name));
    if (preferred >= 0) return preferred;
    const fallback = list.findIndex((m) => /yae|miko|八重|神子/i.test(m.name));
    return fallback >= 0 ? fallback : 0;
  };

  const loadRemoteVrmModels = async () => {
    if (import.meta.env.DEV) return;
    if (vrmListLoading.value) return;
    vrmListLoading.value = true;
    vrmListError.value = '';
    try {
      const currentPath = vrmModels.value[vrmModelIndex.value]?.path || loadVrmModelPath() || '';
      const params = new URLSearchParams({
        ref: VRM_HF_REF,
        prefix: VRM_HF_PREFIX,
        ext: 'vrm'
      });
      const listUrl = buildApiUrl(
        `/api/hf-list/${VRM_HF_OWNER}/${VRM_HF_REPO}?${params.toString()}`
      );
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();

      const items = Array.isArray(json?.items) ? json.items : [];
      remoteVrmItems.value = items
        .filter((p: any) => typeof p === 'string' && p.toLowerCase().endsWith('.vrm'))
        .map((p: string) => {
          const base = (p.split('/').pop() || p).replace(/\.vrm$/i, '');
          return { name: base, path: p };
        });
      remoteVrmListLoaded.value = true;

      if (currentPath) {
        const idx = remoteVrmItems.value.findIndex((m) => m.path === currentPath);
        if (idx >= 0) vrmModelIndex.value = idx;
      }
    } catch (e: any) {
      vrmListError.value = typeof e?.message === 'string' ? e.message : String(e);
      remoteVrmListLoaded.value = false;
    } finally {
      vrmListLoading.value = false;
    }
  };

  const ensureRemoteVrmListLoaded = async () => {
    if (import.meta.env.DEV) return;
    if (remoteVrmListLoaded.value) return;
    await loadRemoteVrmModels();
  };

  const prevVrmModel = async (closePicker = true) => {
    await ensureRemoteVrmListLoaded();
    const list = vrmModels.value;
    if (list.length <= 1) return;
    vrmModelIndex.value = (vrmModelIndex.value - 1 + list.length) % list.length;
    persistVrmSelection();
    if (closePicker) vrmPickerOpen.value = false;
  };

  const nextVrmModel = async (closePicker = true) => {
    await ensureRemoteVrmListLoaded();
    const list = vrmModels.value;
    if (list.length <= 1) return;
    vrmModelIndex.value = (vrmModelIndex.value + 1) % list.length;
    persistVrmSelection();
    if (closePicker) vrmPickerOpen.value = false;
  };

  watch(
    () => vrmPickerOpen.value,
    async (open) => {
      if (!open) return;
      await ensureRemoteVrmListLoaded();
      await nextTick();
      try {
        vrmPickerSearchEl.value?.focus();
        const active = vrmPickerEl.value?.querySelector(
          '.agent-menu-item.active'
        ) as HTMLElement | null;
        active?.scrollIntoView({ block: 'nearest' });
      } catch {}
    }
  );

  watch(
    () => vrmModels.value.length,
    () => {
      if (vrmModels.value.length === 0) return;
      const storedPath = loadVrmModelPath();
      if (storedPath) {
        const idx = vrmModels.value.findIndex((m) => m.path === storedPath);
        if (idx >= 0) {
          vrmModelIndex.value = idx;
          return;
        }
      }
      const stored = loadVrmModelIndex(vrmModels.value.length);
      vrmModelIndex.value = stored ?? pickDefaultVrmModelIndex();
    },
    { immediate: true }
  );

  return {
    vrmModelIndex,
    vrmListLoading,
    vrmListError,
    vrmPickerOpen,
    vrmPickerQuery,
    vrmPickerEl,
    vrmPickerButtonEl,
    vrmPickerSearchEl,
    hasVrmSupport,
    canCycleVrmModel,
    currentVrmSrc,
    currentVrmName,
    currentVrmBadgeText,
    currentVrmBadgeStyle,
    vrmModelCounter,
    filteredVrmModels,
    selectVrmModel,
    prevVrmModel,
    nextVrmModel,
    ensureRemoteVrmListLoaded
  };
}
