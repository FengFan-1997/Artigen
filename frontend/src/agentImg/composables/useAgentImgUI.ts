import { ref } from 'vue';

export function useAgentImgUI() {
  const topTipText = ref('');
  const topTipOpen = ref(false);
  let topTipTimer: number | null = null;

  const showTopTip = (msg: string) => {
    const m = String(msg || '').trim();
    if (!m) return;
    topTipText.value = m;
    topTipOpen.value = true;
    if (topTipTimer) window.clearTimeout(topTipTimer);
    topTipTimer = window.setTimeout(() => {
      topTipTimer = null;
      topTipOpen.value = false;
    }, 3200);
  };

  const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    try {
      if (!window.matchMedia('(max-width: 1280px)').matches) return false;
      return (
        window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches
      );
    } catch {
      return false;
    }
  };

  const productSidebarOpen = ref(false);
  const historySidebarOpen = ref(!isMobileViewport());

  const closeMobileOverlays = () => {
    productSidebarOpen.value = false;
    historySidebarOpen.value = false;
  };

  const toggleProductSidebar = () => {
    const next = !productSidebarOpen.value;
    productSidebarOpen.value = next;
    if (next && isMobileViewport()) historySidebarOpen.value = false;
  };

  const toggleHistorySidebar = () => {
    const next = !historySidebarOpen.value;
    historySidebarOpen.value = next;
    if (next && isMobileViewport()) productSidebarOpen.value = false;
  };

  const showDownloadDialog = ref(false);
  const downloadTargetUrl = ref('');

  const showDownload = (url: string) => {
    const s = String(url || '').trim();
    if (!s) return;
    downloadTargetUrl.value = s;
    showDownloadDialog.value = true;
  };

  const handleDownloadOption = (
    res: '1024' | '2k' | '4k',
    finalImageUrl: string,
    isProPlus: boolean
  ) => {
    if (!finalImageUrl) return;
    // Mock download logic
    const link = document.createElement('a');
    link.href = finalImageUrl;
    link.download = `generated-${res}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showDownloadDialog.value = false;
  };

  return {
    topTipText,
    topTipOpen,
    showTopTip,
    productSidebarOpen,
    historySidebarOpen,
    isMobileViewport,
    closeMobileOverlays,
    toggleProductSidebar,
    toggleHistorySidebar,
    showDownloadDialog,
    downloadTargetUrl,
    showDownload,
    handleDownloadOption
  };
}
