import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLanguageStore } from '@/stores/language';
import { storeToRefs } from 'pinia';
import { getCreditsOrders, type PayPackageId } from '@/points';
import { getAuthToken, getCurrentUserId, isLocalLoggedIn } from '@/login/session';

const rankOfTier = (t: string) => {
  if (t === 'pro_plus') return 3;
  if (t === 'pro') return 2;
  return 1;
};

export function useAgentImgModels(ensureAuthed: () => boolean, ui: any) {
  const router = useRouter();
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);

  const selectedModelId = ref('');
  const modelMenuOpen = ref(false);
  const userTier = ref<PayPackageId | ''>('');
  const userTierLoading = ref(false);

  const isProPlus = computed(() => {
    const t = userTier.value as string;
    return t === 'pro' || t === 'pro_plus';
  });

  const refreshUserTier = async () => {
    if (userTierLoading.value) return;
    userTierLoading.value = true;
    try {
      const orders = await getCreditsOrders();
      if (!orders || !orders.length) {
        userTier.value = '';
        return;
      }
      const max = orders.reduce<PayPackageId | ''>((acc, o) => {
        const next = o.packageId || '';
        return rankOfTier(next) > rankOfTier(acc) ? next : acc;
      }, '');
      userTier.value = max;
    } finally {
      userTierLoading.value = false;
    }
  };

  const modelOptions = computed(() => {
    const autoHint =
      currentLang.value === 'zh'
        ? '自动：按图生图/文生图自动选择'
        : 'Auto: picks based on img2img/txt2img';
    const txtHint = currentLang.value === 'zh' ? '高级模型' : 'Advanced Model';
    const editHint = currentLang.value === 'zh' ? '超级模型' : 'Super Model';
    return [
      { id: '', label: ui.value.modelStandard, badge: 'AUTO', hint: autoHint, requiresPro: false },
      {
        id: 'Qwen/Qwen-Image',
        label: ui.value.modelNanobanana,
        badge: 'PRO',
        hint: txtHint,
        requiresPro: true
      },
      {
        id: 'Qwen/Qwen-Image-Edit-2509',
        label: ui.value.modelNanobananaPro,
        badge: 'PRO',
        hint: editHint,
        requiresPro: true
      }
    ];
  });

  const currentModelLabel = computed(() => {
    const found = modelOptions.value.find((x) => x.id === selectedModelId.value);
    return found?.label || ui.value.modelStandard;
  });

  const currentModelTip = computed(() => {
    const label = currentModelLabel.value;
    return currentLang.value === 'zh' ? `当前：${label}` : `Current: ${label}`;
  });

  const toggleModelMenu = () => {
    modelMenuOpen.value = !modelMenuOpen.value;
  };

  const ensureProAccessOrRedirect = async (showTopTip: (msg: string) => void) => {
    const uid = String(getCurrentUserId() || '').trim();
    const token = String(getAuthToken() || '').trim();
    const authed = !!uid && !uid.startsWith('guest_') && !!token && isLocalLoggedIn();
    if (!authed) {
      modelMenuOpen.value = false;
      showTopTip(ui.value.modelLocked);
      router.push({ path: '/artigen/market', query: { proOnly: '1' } });
      return false;
    }
    void ensureAuthed();
    if (!userTier.value) await refreshUserTier();
    if (isProPlus.value) return true;
    modelMenuOpen.value = false;
    showTopTip(ui.value.modelLocked);
    router.push({ path: '/artigen/market', query: { proOnly: '1' } });
    return false;
  };

  const selectModel = async (
    m: { id: string; requiresPro?: boolean },
    showTopTip: (msg: string) => void
  ) => {
    const id = String(m?.id || '').trim();
    if (m?.requiresPro) {
      const ok = await ensureProAccessOrRedirect(showTopTip);
      if (!ok) return;
    }
    selectedModelId.value = id;
    modelMenuOpen.value = false;
  };

  return {
    selectedModelId,
    modelMenuOpen,
    userTier,
    isProPlus,
    refreshUserTier,
    modelOptions,
    currentModelLabel,
    currentModelTip,
    toggleModelMenu,
    selectModel
  };
}
