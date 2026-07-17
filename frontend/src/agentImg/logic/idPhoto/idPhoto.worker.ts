/// <reference lib="webworker" />

import { replaceUniformEdgeBackground } from './idPhotoProcessing';

export interface IdPhotoWorkerRequest {
  type: 'process';
  jobId: string;
  revision: number;
  width: number;
  height: number;
  data: ArrayBuffer;
  target: [number, number, number];
  tolerance: number;
}

export interface IdPhotoWorkerSuccess {
  type: 'success';
  jobId: string;
  revision: number;
  width: number;
  height: number;
  data: ArrayBuffer;
}

export interface IdPhotoWorkerFailure {
  type: 'failed';
  jobId: string;
  revision: number;
  message: string;
}

export type IdPhotoWorkerResult = IdPhotoWorkerSuccess | IdPhotoWorkerFailure;

self.onmessage = (event: MessageEvent<IdPhotoWorkerRequest>) => {
  const request = event.data;
  if (request.type !== 'process') return;
  try {
    const output = replaceUniformEdgeBackground(
      { width: request.width, height: request.height, data: request.data },
      { target: request.target, tolerance: request.tolerance }
    );
    const result: IdPhotoWorkerSuccess = {
      type: 'success',
      jobId: request.jobId,
      revision: request.revision,
      width: output.width,
      height: output.height,
      data: output.data
    };
    self.postMessage(result, { transfer: [result.data] });
  } catch (value) {
    const result: IdPhotoWorkerFailure = {
      type: 'failed',
      jobId: request.jobId,
      revision: request.revision,
      message: value instanceof Error ? value.message : 'ID_PHOTO_PROCESSING_FAILED'
    };
    self.postMessage(result);
  }
};

export {};
