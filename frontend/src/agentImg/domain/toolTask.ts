export type ToolTaskStatus =
  | 'idle'
  | 'validating'
  | 'awaiting_confirmation'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface ToolTaskRequest {
  toolId: string;
  operation: string;
  options: Record<string, unknown>;
  inputAssets: string[];
  quoteId?: string;
}

export interface ToolTaskAsset {
  assetId: string;
  url: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
}

export interface ToolTaskReceipt {
  sku: string | null;
  quotedCredits: number;
  chargedCredits: number;
  refundedCredits: number;
  balanceCredits?: number;
}

export interface ToolTaskResult {
  assets: ToolTaskAsset[];
  receipt: ToolTaskReceipt;
  warnings: Array<{ code: string; messageKey: string }>;
  data?: Record<string, unknown>;
  restoration?: { colorized: boolean; sourceAssetId?: string };
}

export interface ToolApiError {
  code: string;
  field?: string;
  messageKey: string;
  retryable: boolean;
}
