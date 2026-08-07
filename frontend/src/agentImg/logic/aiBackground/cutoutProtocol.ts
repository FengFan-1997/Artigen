export interface CutoutJobIdentity {
  jobId: string;
  sourceRevision: number;
}

export interface CutoutProcessRequest extends CutoutJobIdentity {
  type: 'process';
  source: Blob;
}

export interface CutoutCancelRequest extends CutoutJobIdentity {
  type: 'cancel';
}

export type CutoutWorkerRequest = CutoutProcessRequest | CutoutCancelRequest;

export interface CutoutWorkerSuccess extends CutoutJobIdentity {
  type: 'success';
  output: Blob;
}

export interface CutoutWorkerFailure extends CutoutJobIdentity {
  type: 'failed';
  message: string;
}

export type CutoutWorkerResult = CutoutWorkerSuccess | CutoutWorkerFailure;
