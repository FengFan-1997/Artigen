import { ref, type Ref } from 'vue';
import { canvasToBlob } from '../logic/formatFactory/canvas';
import { safeBaseName } from '../logic/formatFactory/format';

export const useFormatFactoryLive = (input: { sourceFile: Ref<File | null> }) => {
  const liveVideoRef = ref<HTMLVideoElement | null>(null);
  const liveDuration = ref(0);
  const liveTime = ref(0);
  const liveOutFormat = ref<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const liveOutQuality = ref(0.92);

  const reset = () => {
    liveDuration.value = 0;
    liveTime.value = 0;
  };

  const onLiveLoadedMeta = () => {
    const v = liveVideoRef.value;
    const f = input.sourceFile.value;
    if (!v || !f) return null;
    liveDuration.value = Number.isFinite(v.duration) ? v.duration : 0;
    liveTime.value = Number.isFinite(v.currentTime) ? v.currentTime : 0;
    const dimensions =
      v.videoWidth && v.videoHeight ? `${v.videoWidth}×${v.videoHeight}` : undefined;
    return { name: f.name, size: f.size, dimensions };
  };

  const onLiveTimeUpdate = () => {
    const v = liveVideoRef.value;
    if (!v) return;
    liveTime.value = Number.isFinite(v.currentTime) ? v.currentTime : 0;
  };

  const onLiveSeekInput = (e: Event) => {
    const v = liveVideoRef.value;
    if (!v) return;
    const el = e.target as HTMLInputElement | null;
    const next = Number(el?.value || 0);
    if (!Number.isFinite(next)) return;
    v.currentTime = next;
    liveTime.value = next;
  };

  const captureVideoFrame = async () => {
    const v = liveVideoRef.value;
    const f = input.sourceFile.value;
    if (!v || !f) throw new Error('VIDEO_NOT_SELECTED');
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) throw new Error('VIDEO_DIM_FAIL');
    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
    ctx.drawImage(v, 0, 0, vw, vh);
    const type = liveOutFormat.value;
    const quality = type === 'image/png' ? undefined : liveOutQuality.value;
    const blob = await canvasToBlob(canvas, type, quality);
    const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
    const filename = `${safeBaseName(f.name)}_${Math.floor(liveTime.value * 1000)}ms.${ext}`;
    return { blob, filename };
  };

  return {
    liveVideoRef,
    liveDuration,
    liveTime,
    liveOutFormat,
    liveOutQuality,
    reset,
    onLiveLoadedMeta,
    onLiveTimeUpdate,
    onLiveSeekInput,
    captureVideoFrame
  };
};
