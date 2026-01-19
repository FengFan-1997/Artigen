import { computed, ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  getCreditsBalance,
  type CreditsBalance,
  getCreditsCosts,
  type CreditsCosts
} from '@/points';

export function useAgentImgCredits(isAuthed: Ref<boolean>) {
  const router = useRouter();
  const creditsBalance = ref<CreditsBalance | null>(null);
  const creditsLoading = ref(false);
  const creditsCosts = ref<CreditsCosts | null>(null);
  const creditsPopoverOpen = ref(false);
  const creditsContainerRef = ref<HTMLElement | null>(null);

  const refreshCredits = async () => {
    if (!isAuthed.value) {
      creditsBalance.value = null;
      creditsLoading.value = false;
      return;
    }
    if (creditsLoading.value) return;
    creditsLoading.value = true;
    creditsBalance.value = await getCreditsBalance();
    creditsLoading.value = false;
  };

  const refreshCosts = async () => {
    if (creditsCosts.value) return;
    creditsCosts.value = await getCreditsCosts();
  };

  const creditsText = computed(() => {
    const bal = creditsBalance.value;
    if (!bal) return '--';
    return String(Number(bal.available ?? 0));
  });

  const totalCreditsText = computed(() => {
    const bal = creditsBalance.value;
    if (!bal) return '--';
    const a = Number(bal.available ?? 0) || 0;
    const f = Number(bal.frozen ?? 0) || 0;
    return String(a + f);
  });

  const goMarket = () => {
    creditsPopoverOpen.value = false;
    router.push('/artigen/market');
  };

  const toggleCreditsPopover = () => {
    creditsPopoverOpen.value = !creditsPopoverOpen.value;
    if (creditsPopoverOpen.value) void refreshCredits();
  };

  return {
    creditsBalance,
    creditsLoading,
    creditsCosts,
    creditsPopoverOpen,
    creditsContainerRef,
    refreshCredits,
    refreshCosts,
    creditsText,
    totalCreditsText,
    goMarket,
    toggleCreditsPopover
  };
}
