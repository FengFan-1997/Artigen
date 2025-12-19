export type RectLike = { left: number; top: number; width: number; height: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const hitTestByRect = (rect: RectLike, clientX: number, clientY: number): string[] => {
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const rx = (clientX - rect.left) / w;
  const ry = (clientY - rect.top) / h;
  if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return [];

  const x01 = clamp01(rx);
  const y01 = clamp01(ry);

  const areas: string[] = [];
  if (y01 <= 0.22) {
    areas.push('head');
    if (x01 <= 0.32 || x01 >= 0.68) areas.push('hair');
    if (y01 <= 0.14 && (x01 <= 0.22 || x01 >= 0.78)) areas.push('accessory');
  } else if (y01 <= 0.48) {
    areas.push('face');
  } else if (y01 <= 0.84) {
    areas.push('body');
  } else {
    areas.push('legs');
  }

  return Array.from(new Set(areas));
};
