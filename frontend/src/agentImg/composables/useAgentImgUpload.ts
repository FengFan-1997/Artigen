import { computed, ref } from 'vue';
import type { GenerateImageInput } from '../services/text';

export function useAgentImgUpload(
  deepMode: { value: boolean },
  cancel: () => void,
  abortImg2Img: () => void,
  reset: () => void
) {
  const previewUrls = ref<string[]>(['', '']);
  const previewFiles = ref<(File | null)[]>([null, null]);
  const fileInputs = ref<HTMLInputElement[]>([]);
  const hasPreviews = computed(() => previewUrls.value.some((u) => !!u));

  const triggerUpload = () => {
    let idx = previewUrls.value.findIndex((u) => !u);
    if (idx === -1) idx = 0;
    if (fileInputs.value[idx]) {
      fileInputs.value[idx].click();
    }
  };

  const setPreviewUrl = (idx: number, nextUrl: string) => {
    const cur = previewUrls.value[idx];
    if (cur && cur.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(cur);
      } catch {}
    }
    previewUrls.value[idx] = nextUrl;
  };

  const setPreviewFileAt = (idx: number, f: File) => {
    const url = URL.createObjectURL(f);
    previewFiles.value[idx] = f;
    setPreviewUrl(idx, url);
  };

  const afterPreviewsChanged = (keepDeep: boolean) => {
    if (!keepDeep) deepMode.value = false;
    cancel();
    abortImg2Img();
    if (!keepDeep) reset();
  };

  const onPreviewChange = (idx: number, e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      setPreviewFileAt(idx, input.files[0]);
      afterPreviewsChanged(false);
    }
    input.value = '';
  };

  const clearPreview = (idx: number) => {
    setPreviewUrl(idx, '');
    previewFiles.value[idx] = null;
    afterPreviewsChanged(true);
  };

  const fileToGenerateInput = (f: File): Promise<GenerateImageInput | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const raw = String(reader.result || '');
        const toInput = (dataUrl: string): GenerateImageInput => {
          const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          return {
            mimeType: (m?.[1] || f.type || 'image/png').trim(),
            dataBase64: String(m?.[2] || '').trim()
          };
        };

        const shouldCompress = f.size > 2.5 * 1024 * 1024;
        if (!shouldCompress) return resolve(toInput(raw));

        const img = new Image();
        img.onload = () => {
          const maxDim = 1536;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          if (scale >= 1) return resolve(toInput(raw));

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(toInput(raw));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(toInput(raw));
              const r2 = new FileReader();
              r2.onerror = () => resolve(toInput(raw));
              r2.onload = () => resolve(toInput(String(r2.result || raw)));
              r2.readAsDataURL(blob);
            },
            'image/jpeg',
            0.92
          );
        };
        img.onerror = () => resolve(toInput(raw));
        img.src = raw;
      };
      reader.readAsDataURL(f);
    });
  };

  const fileToThumbDataUrl = (f: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const srcUrl = URL.createObjectURL(f);
      const done = (v: string | null) => {
        try {
          URL.revokeObjectURL(srcUrl);
        } catch {}
        resolve(v);
      };

      const fallbackRead = () => {
        const reader = new FileReader();
        reader.onerror = () => done(null);
        reader.onload = () => {
          const raw = String(reader.result || '');
          if (!raw.startsWith('data:image/')) return done(null);
          done(raw);
        };
        reader.readAsDataURL(f);
      };

      const drawThumb = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
        const maxDim = 360;
        const scale = Math.min(1, maxDim / Math.max(w || 1, h || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((w || 1) * scale));
        canvas.height = Math.max(1, Math.round((h || 1) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return fallbackRead();
        try {
          draw(ctx);
        } catch {
          return fallbackRead();
        }
        try {
          done(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          fallbackRead();
        }
      };

      const img = new Image();
      img.onload = () => {
        drawThumb(img.width || 1, img.height || 1, (ctx) => {
          const canvas = ctx.canvas as HTMLCanvasElement;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        });
      };
      img.onerror = () => fallbackRead();
      img.src = srcUrl;
    });
  };

  const cleanup = () => {
    for (let i = 0; i < previewUrls.value.length; i++) {
      setPreviewUrl(i, '');
    }
  };

  return {
    previewUrls,
    previewFiles,
    fileInputs,
    hasPreviews,
    triggerUpload,
    onPreviewChange,
    clearPreview,
    setPreviewFileAt,
    fileToGenerateInput,
    fileToThumbDataUrl,
    cleanup
  };
}
