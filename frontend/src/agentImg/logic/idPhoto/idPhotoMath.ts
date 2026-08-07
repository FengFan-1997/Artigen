export type IdPhotoPresetId = 'one-inch' | 'two-inch' | 'passport';

export interface IdPhotoPreset {
  id: IdPhotoPresetId;
  label: string;
  width: number;
  height: number;
}

export const ID_PHOTO_PRESETS: readonly IdPhotoPreset[] = [
  { id: 'one-inch', label: '一寸', width: 295, height: 413 },
  { id: 'two-inch', label: '二寸', width: 413, height: 579 },
  { id: 'passport', label: '护照', width: 390, height: 567 }
] as const;

export interface IdPhotoPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

export interface IdPhotoSheetLayout {
  sheetWidth: number;
  sheetHeight: number;
  dpi: number;
  margin: number;
  gap: number;
  columns: number;
  rows: number;
  rotated: boolean;
  placements: IdPhotoPlacement[];
}

export function millimetersToPixels(millimeters: number, dpi: number): number {
  if (!Number.isFinite(millimeters) || millimeters <= 0) {
    throw new RangeError('Millimeters must be a positive finite number');
  }
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new RangeError('DPI must be a positive finite number');
  }
  return Math.max(1, Math.round((millimeters / 25.4) * dpi));
}

export function sixInchSheetPixels(dpi = 300): { width: number; height: number } {
  if (!Number.isFinite(dpi) || dpi <= 0) throw new RangeError('DPI must be positive');
  return {
    width: Math.round(6 * dpi),
    height: Math.round(4 * dpi)
  };
}

export function fitDimensionsWithin(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const normalizedWidth = positiveInteger(width, 'Width');
  const normalizedHeight = positiveInteger(height, 'Height');
  const normalizedMaxSide = positiveInteger(maxSide, 'Maximum side');
  const scale = Math.min(1, normalizedMaxSide / Math.max(normalizedWidth, normalizedHeight));
  return {
    width: Math.max(1, Math.round(normalizedWidth * scale)),
    height: Math.max(1, Math.round(normalizedHeight * scale))
  };
}

export function calculateSixInchLayout(
  photoWidth: number,
  photoHeight: number,
  dpi = 300
): IdPhotoSheetLayout {
  const normalizedWidth = positiveInteger(photoWidth, 'Photo width');
  const normalizedHeight = positiveInteger(photoHeight, 'Photo height');
  const { width: sheetWidth, height: sheetHeight } = sixInchSheetPixels(dpi);
  const margin = Math.max(1, Math.round(dpi * 0.1));
  const gap = Math.max(1, Math.round(dpi * 0.04));
  const normal = evaluateGrid(
    sheetWidth,
    sheetHeight,
    normalizedWidth,
    normalizedHeight,
    margin,
    gap,
    false
  );
  const rotated = evaluateGrid(
    sheetWidth,
    sheetHeight,
    normalizedHeight,
    normalizedWidth,
    margin,
    gap,
    true
  );
  const choice = rotated.count > normal.count ? rotated : normal;
  const gridWidth = choice.columns * choice.cellWidth + Math.max(0, choice.columns - 1) * gap;
  const gridHeight = choice.rows * choice.cellHeight + Math.max(0, choice.rows - 1) * gap;
  const startX = Math.round((sheetWidth - gridWidth) / 2);
  const startY = Math.round((sheetHeight - gridHeight) / 2);
  const placements: IdPhotoPlacement[] = [];
  for (let row = 0; row < choice.rows; row += 1) {
    for (let column = 0; column < choice.columns; column += 1) {
      placements.push({
        x: startX + column * (choice.cellWidth + gap),
        y: startY + row * (choice.cellHeight + gap),
        width: choice.cellWidth,
        height: choice.cellHeight,
        rotated: choice.rotated
      });
    }
  }
  return {
    sheetWidth,
    sheetHeight,
    dpi: Math.round(dpi),
    margin,
    gap,
    columns: choice.columns,
    rows: choice.rows,
    rotated: choice.rotated,
    placements
  };
}

interface EvaluatedGrid {
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  count: number;
  rotated: boolean;
}

function evaluateGrid(
  sheetWidth: number,
  sheetHeight: number,
  cellWidth: number,
  cellHeight: number,
  margin: number,
  gap: number,
  rotated: boolean
): EvaluatedGrid {
  const usableWidth = Math.max(0, sheetWidth - margin * 2);
  const usableHeight = Math.max(0, sheetHeight - margin * 2);
  const columns = Math.max(0, Math.floor((usableWidth + gap) / (cellWidth + gap)));
  const rows = Math.max(0, Math.floor((usableHeight + gap) / (cellHeight + gap)));
  return { cellWidth, cellHeight, columns, rows, count: columns * rows, rotated };
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive`);
  return Math.max(1, Math.round(value));
}

export interface IdPhotoJobIdentity {
  jobId: string;
  revision: number;
}

export class IdPhotoJobGuard {
  private current: IdPhotoJobIdentity | null = null;
  private sequence = 0;

  start(revision: number): IdPhotoJobIdentity {
    this.sequence += 1;
    const identity = {
      jobId: `id-photo-${this.sequence}-${createRandomSuffix()}`,
      revision
    };
    this.current = identity;
    return identity;
  }

  isCurrent(identity: IdPhotoJobIdentity): boolean {
    return Boolean(
      this.current &&
      this.current.jobId === identity.jobId &&
      this.current.revision === identity.revision
    );
  }

  complete(identity: IdPhotoJobIdentity): boolean {
    if (!this.isCurrent(identity)) return false;
    this.current = null;
    return true;
  }

  invalidate(): string | null {
    const jobId = this.current?.jobId ?? null;
    this.current = null;
    return jobId;
  }
}

function createRandomSuffix(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
