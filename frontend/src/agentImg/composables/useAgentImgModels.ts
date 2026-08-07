import { computed, onMounted, ref, watch } from 'vue';
import { useLanguageStore } from '@/stores/language';
import { storeToRefs } from 'pinia';
import { getCreditsOrders, type PayPackageId } from '@/points';
import { getGenerationModels, type GenerationModelProfile } from '../services/toolTasks';
import {
  DEFAULT_GENERATION_ASPECT_RATIOS,
  DEFAULT_GENERATION_PROFILE_ID
} from '../domain/generationWorkspace';

const rankOfTier = (t: string) => {
  if (t === 'pro_plus') return 3;
  if (t === 'pro') return 2;
  return 1;
};

const generationV2DevOverride = () => {
  if (!import.meta.env.DEV) return '';
  try {
    const value = String(window.localStorage.getItem('artigen:ai-design-task-v2-dev') || '')
      .trim()
      .toLowerCase();
    return value === 'legacy' || value === 'v2' ? value : '';
  } catch {
    return '';
  }
};

export function useAgentImgModels(
  ensureAuthed: () => boolean,
  ui: any,
  isAuthed?: { value: boolean }
) {
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);

  const selectedModelId = ref('');
  const selectedProfileId = ref(DEFAULT_GENERATION_PROFILE_ID);
  const selectedAspectRatio = ref('1:1');
  const modelMenuOpen = ref(false);
  const userTier = ref<PayPackageId | ''>('');
  const userTierLoading = ref(false);
  const generationModelsLoading = ref(false);
  const generationModelsError = ref('');
  const generationModels = ref<GenerationModelProfile[]>([
    {
      id: DEFAULT_GENERATION_PROFILE_ID,
      name: { zh: '标准生成', en: 'Standard generation' },
      available: true,
      capabilities: ['text-to-image'],
      maxReferences: 0,
      aspectRatios: DEFAULT_GENERATION_ASPECT_RATIOS,
      supportsSeed: true
    }
  ]);
  const generationV2Enabled = ref(
    generationV2DevOverride() === 'legacy'
      ? false
      : String(import.meta.env.VITE_AI_DESIGN_TASK_V2_ENABLED ?? 'true').toLowerCase() !== 'false'
  );

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
    return generationModels.value.map((profile) => {
      const label = typeof profile.name === 'string'
        ? profile.name
        : String(profile.name?.[currentLang.value === 'zh' ? 'zh' : 'en'] || profile.id);
      const reference = profile.maxReferences > 0;
      return {
        id: profile.id,
        label,
        badge: reference ? 'REFERENCE · 60' : 'STANDARD · 10',
        hint: currentLang.value === 'zh'
          ? reference
            ? '使用 1–3 张商品、风格或场景参考图'
            : '纯文生图，不上传参考图'
          : reference
            ? 'Use 1–3 product, style, or scene references'
            : 'Text-to-image without references',
        requiresPro: false,
        available: profile.available
      };
    });
  });

  const currentModelLabel = computed(() => {
    const found = modelOptions.value.find((x) => x.id === selectedProfileId.value);
    return found?.label || ui.value.modelStandard;
  });

  const currentModelTip = computed(() => {
    const label = currentModelLabel.value;
    return currentLang.value === 'zh' ? `当前：${label}` : `Current: ${label}`;
  });

  const toggleModelMenu = () => {
    modelMenuOpen.value = !modelMenuOpen.value;
  };

  const selectModel = async (
    m: { id: string; requiresPro?: boolean; available?: boolean },
    showTopTip: (msg: string) => void
  ) => {
    const id = String(m?.id || '').trim();
    if (m.available === false) {
      showTopTip(currentLang.value === 'zh' ? '该生成模式暂不可用' : 'This generation mode is unavailable.');
      return;
    }
    selectedModelId.value = id;
    if (generationModels.value.some((profile) => profile.id === id)) {
      selectedProfileId.value = id;
    }
    modelMenuOpen.value = false;
  };

  const activeGenerationProfile = computed(() => {
    return (
      generationModels.value.find((profile) => profile.id === selectedProfileId.value) ||
      generationModels.value[0] ||
      null
    );
  });

  const generationAspectRatios = computed(() => {
    const values = activeGenerationProfile.value?.aspectRatios || [];
    return values.length ? values : DEFAULT_GENERATION_ASPECT_RATIOS;
  });

  const generationProfileAvailable = computed(() => Boolean(activeGenerationProfile.value?.available));

  const refreshGenerationModels = async () => {
    if (!generationV2Enabled.value || generationModelsLoading.value) return;
    generationModelsLoading.value = true;
    generationModelsError.value = '';
    try {
      const models = await getGenerationModels();
      if (!models.length) throw new Error('MODEL_PROFILE_UNAVAILABLE');
      generationModels.value = models;
      if (!models.some((profile) => profile.id === selectedProfileId.value && profile.available)) {
        selectedProfileId.value = models.find((profile) => profile.available)?.id || models[0].id;
      }
      selectedModelId.value = selectedProfileId.value;
      if (!generationAspectRatios.value.includes(selectedAspectRatio.value)) {
        selectedAspectRatio.value = generationAspectRatios.value[0] || '1:1';
      }
    } catch (error: any) {
      generationModelsError.value = String(error?.code || error?.message || 'MODEL_PROFILE_UNAVAILABLE');
      generationModels.value = generationModels.value.map((profile) => ({ ...profile, available: false }));
    } finally {
      generationModelsLoading.value = false;
    }
  };

  onMounted(() => {
    void refreshGenerationModels();
  });
  if (isAuthed) {
    watch(
      () => isAuthed.value,
      () => {
        if (generationV2Enabled.value) void refreshGenerationModels();
      }
    );
  }

  return {
    selectedModelId,
    selectedProfileId,
    selectedAspectRatio,
    modelMenuOpen,
    userTier,
    isProPlus,
    refreshUserTier,
    modelOptions,
    currentModelLabel,
    currentModelTip,
    generationV2Enabled,
    generationModels,
    generationModelsLoading,
    generationModelsError,
    activeGenerationProfile,
    generationAspectRatios,
    generationProfileAvailable,
    refreshGenerationModels,
    toggleModelMenu,
    selectModel
  };
}
