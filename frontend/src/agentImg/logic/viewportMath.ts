const safeNumber = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);

export const clamp = (v: number, min: number, max: number) => {
  const lo = safeNumber(min, 0);
  const hi = safeNumber(max, lo);
  const n = safeNumber(v, lo);
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return Math.max(a, Math.min(b, n));
};

export const canvasPointFromScreen = (
  point: { x: number; y: number },
  viewport: { scale: number; offset: { x: number; y: number } }
) => {
  const px = safeNumber(point.x, 0);
  const py = safeNumber(point.y, 0);
  const ox = safeNumber(viewport.offset.x, 0);
  const oy = safeNumber(viewport.offset.y, 0);
  const s = Math.max(0.000001, safeNumber(viewport.scale, 1));
  return {
    x: (px - ox) / s,
    y: (py - oy) / s
  };
};

export const scaleAroundScreenPoint = (
  viewport: { scale: number; offset: { x: number; y: number } },
  nextScaleRaw: number,
  point: { x: number; y: number },
  limits: { min: number; max: number } = { min: 0.1, max: 6 }
) => {
  const ox = safeNumber(viewport.offset.x, 0);
  const oy = safeNumber(viewport.offset.y, 0);
  const px = safeNumber(point.x, 0);
  const py = safeNumber(point.y, 0);
  const prev = Math.max(0.000001, safeNumber(viewport.scale, 1));
  const next = clamp(nextScaleRaw, limits.min, limits.max);
  if (next === prev) return { scale: prev, offset: { x: ox, y: oy } };
  const ratio = next / prev;
  return {
    scale: next,
    offset: {
      x: ox + (px - ox) * (1 - ratio),
      y: oy + (py - oy) * (1 - ratio)
    }
  };
};
