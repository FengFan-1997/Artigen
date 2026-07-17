import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useLanguageStore } from '@/stores/language';
import { resourceFetch } from '@/login/authFetch';

export function useAgentImgUI() {
  const router = useRouter();
  const languageStore = useLanguageStore();
  const { currentLang } = storeToRefs(languageStore);
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
      // The sidebars become overlays at this CSS breakpoint regardless of the
      // input device. A narrow desktop window must therefore start closed too.
      return window.matchMedia('(max-width: 1400px)').matches;
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
  const downloadBusy = ref(false);
  const downloadBusyRes = ref<'1024' | '2k' | '4k' | ''>('');
  const downloadError = ref('');

  const showDownload = (url: string) => {
    const s = String(url || '').trim();
    if (!s) return;
    downloadTargetUrl.value = s;
    downloadError.value = '';
    showDownloadDialog.value = true;
  };

  const downloadFailureText = () =>
    currentLang.value === 'zh'
      ? '下载失败，图片可能已失效或暂时无法读取'
      : 'Download failed. The image may be unavailable.';

  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMAGE_LOAD_FAIL'));
      img.src = url;
    });

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 1000);
  };

  const exportImageBlob = async (rawUrl: string, maxEdge: number) => {
    const res = await resourceFetch(rawUrl);
    if (!res.ok) throw new Error('IMAGE_FETCH_FAIL');
    const sourceBlob = await res.blob();
    if (!sourceBlob.size || !String(sourceBlob.type || '').toLowerCase().startsWith('image/')) {
      throw new Error('IMAGE_FETCH_FAIL');
    }

    const objectUrl = URL.createObjectURL(sourceBlob);
    try {
      const img = await loadImage(objectUrl);
      const naturalW = Math.max(1, img.naturalWidth || img.width || 1);
      const naturalH = Math.max(1, img.naturalHeight || img.height || 1);
      const scale = Math.max(1, maxEdge) / Math.max(naturalW, naturalH);
      const outW = Math.max(1, Math.round(naturalW * scale));
      const outH = Math.max(1, Math.round(naturalH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
      ctx.drawImage(img, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob?.size) throw new Error('CANVAS_EXPORT_FAIL');
      return blob;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleDownloadOption = async (
    res: '1024' | '2k' | '4k',
    finalImageUrl: string,
    isProPlus: boolean
  ) => {
    if (downloadBusy.value) return;
    downloadError.value = '';
    if (res === '4k' && !isProPlus) {
      showTopTip(currentLang.value === 'zh' ? '需要 Pro 以上' : 'Requires Pro pack or higher');
      showDownloadDialog.value = false;
      router.push({ path: '/artigen/market', query: { proOnly: '1' } });
      return;
    }
    if (!finalImageUrl) return;
    const longestEdge = res === '1024' ? 1024 : res === '2k' ? 2048 : 4096;
    downloadBusy.value = true;
    downloadBusyRes.value = res;
    try {
      const blob = await exportImageBlob(finalImageUrl, longestEdge);
      downloadBlob(blob, `generated-${res}-${Date.now()}.png`);
      showDownloadDialog.value = false;
    } catch {
      const msg = downloadFailureText();
      downloadError.value = msg;
      showTopTip(msg);
    } finally {
      downloadBusy.value = false;
      downloadBusyRes.value = '';
    }
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
    downloadBusy,
    downloadBusyRes,
    downloadError,
    showDownload,
    handleDownloadOption
  };
}
