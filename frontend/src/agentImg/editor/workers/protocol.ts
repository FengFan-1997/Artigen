import type { ImageAdjustments } from '../domain/types';

export interface PixelJobIdentity {
  jobId: string;
  projectId: string;
  layerId: string;
  sourceAssetId: string;
  revision: number;
}

export interface PixelBuffer {
  width: number;
  height: number;
  data: ArrayBuffer;
}

export type PixelOperation =
  | { type: 'adjustments'; adjustments: ImageAdjustments }
  | { type: 'upscale'; scale: 2 }
  | { type: 'remove-background'; tolerance: number; feather: number }
  | { type: 'clarity'; amount: number }
  | { type: 'polygon-cutout'; points: NormalizedPixelPoint[] };

export interface NormalizedPixelPoint {
  x: number;
  y: number;
}

export interface PixelJob extends PixelJobIdentity {
  input: PixelBuffer;
  operation: PixelOperation;
}

export type PixelWorkerRequest =
  | { type: 'run'; job: PixelJob }
  | { type: 'cancel'; jobId: string };

export interface PixelJobSuccess extends PixelJobIdentity {
  type: 'success';
  output: PixelBuffer;
}

export interface PixelJobCancelled extends PixelJobIdentity {
  type: 'cancelled';
}

export interface PixelJobFailure extends PixelJobIdentity {
  type: 'failed';
  code: 'INVALID_INPUT' | 'PROCESSING_FAILED';
  message: string;
}

export type PixelWorkerResult = PixelJobSuccess | PixelJobCancelled | PixelJobFailure;

export function createPixelJobId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `pixel_${random}`;
}
