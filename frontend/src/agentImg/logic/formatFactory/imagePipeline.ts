import { safeBaseName } from './format';
import {
  convertImage,
  filterImage,
  resizeImage,
  rotateFlipImage
} from './processors';
import type { FormatFactoryRunOpts } from './processors';

export const IMAGE_PIPELINE_STEP_TYPES = ['resize', 'rotate', 'filter', 'convert'] as const;

export type ImagePipelineStepType = (typeof IMAGE_PIPELINE_STEP_TYPES)[number];

type PipelineStepBase = {
  id: string;
  enabled: boolean;
};

export type ImagePipelineStep =
  | (PipelineStepBase & {
      type: 'resize';
      width: number | null;
      height: number | null;
      maxSide: number | null;
    })
  | (PipelineStepBase & {
      type: 'rotate';
      rotate: 0 | 90 | 180 | 270;
      flipH: boolean;
      flipV: boolean;
    })
  | (PipelineStepBase & {
      type: 'filter';
      preset: 'grayscale' | 'sepia' | 'invert';
      intensity: number;
    })
  | (PipelineStepBase & {
      type: 'convert';
      outType: 'image/png' | 'image/jpeg' | 'image/webp';
      quality: number;
    });

export type ImagePipelineResult = {
  blob: Blob;
  filename: string;
  executedSteps: ImagePipelineStepType[];
};

export function normalizeImagePipelineOrder(
  order: readonly ImagePipelineStepType[]
): ImagePipelineStepType[] {
  const seen = new Set<ImagePipelineStepType>();
  const normalized: ImagePipelineStepType[] = [];
  for (const entry of order) {
    if (!IMAGE_PIPELINE_STEP_TYPES.includes(entry) || seen.has(entry)) continue;
    seen.add(entry);
    normalized.push(entry);
  }
  for (const entry of IMAGE_PIPELINE_STEP_TYPES) {
    if (!seen.has(entry)) normalized.push(entry);
  }
  return normalized;
}

export function validateImagePipeline(steps: readonly ImagePipelineStep[]): void {
  const enabled = steps.filter((step) => step.enabled);
  if (enabled.length === 0) throw new Error('PIPELINE_EMPTY');
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id || ids.has(step.id)) throw new Error('PIPELINE_INVALID');
    ids.add(step.id);
    if (step.type === 'resize' && step.enabled) {
      if (!step.width && !step.height && !step.maxSide) throw new Error('PIPELINE_RESIZE_MISSING_SIZE');
    }
  }
}

export async function runOrderedImagePipeline(
  input: File,
  steps: readonly ImagePipelineStep[],
  opts?: FormatFactoryRunOpts
): Promise<ImagePipelineResult> {
  validateImagePipeline(steps);
  const enabled = steps.filter((step) => step.enabled);
  let current = input;
  const executedSteps: ImagePipelineStepType[] = [];

  for (let index = 0; index < enabled.length; index += 1) {
    if (opts?.signal?.aborted) throw new Error('ABORTED');
    const step = enabled[index];
    const onProgress = (progress: { done: number; total: number; label?: string }) => {
      const ratio = progress.total > 0 ? Math.max(0, Math.min(1, progress.done / progress.total)) : 0;
      opts?.onProgress?.({
        done: index + ratio,
        total: enabled.length,
        label: `${index + 1}/${enabled.length} ${progress.label || step.type}`
      });
    };
    const childOptions = { ...opts, onProgress };
    let result: { blob: Blob; filename: string };

    if (step.type === 'resize') {
      result = await resizeImage(
        current,
        {
          width: step.width,
          height: step.height,
          maxSide: step.maxSide,
          outType: mimeForIntermediate(current.type),
          quality: current.type === 'image/png' ? undefined : 0.96
        },
        childOptions
      );
    } else if (step.type === 'rotate') {
      result = await rotateFlipImage(
        current,
        {
          rotate: step.rotate,
          flipH: step.flipH,
          flipV: step.flipV,
          outType: mimeForIntermediate(current.type),
          quality: current.type === 'image/png' ? undefined : 0.96
        },
        childOptions
      );
    } else if (step.type === 'filter') {
      result = await filterImage(
        current,
        {
          preset: step.preset,
          intensity: step.intensity,
          outType: mimeForIntermediate(current.type),
          quality: current.type === 'image/png' ? undefined : 0.96
        },
        childOptions
      );
    } else {
      result = await convertImage(
        current,
        step.outType,
        step.outType === 'image/png' ? undefined : step.quality,
        childOptions
      );
    }

    current = new File([result.blob], result.filename, {
      type: result.blob.type || current.type,
      lastModified: input.lastModified
    });
    executedSteps.push(step.type);
    opts?.onProgress?.({
      done: index + 1,
      total: enabled.length,
      label: `${index + 1}/${enabled.length}`
    });
  }

  const blob = current.slice(0, current.size, current.type);
  const extension = extensionForMime(blob.type);
  return {
    blob,
    filename: `${safeBaseName(input.name)}_pipeline.${extension}`,
    executedSteps
  };
}

function mimeForIntermediate(type: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (type === 'image/jpeg' || type === 'image/webp') return type;
  return 'image/png';
}

function extensionForMime(type: string): 'png' | 'jpg' | 'webp' {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}
