import { describe, expect, it } from 'vitest';

import { canvasPointFromScreen, scaleAroundScreenPoint } from './viewportMath';

describe('viewportMath', () => {
  it('canvasPointFromScreen reverses screen = canvas*scale + offset', () => {
    const viewport = { scale: 2, offset: { x: 10, y: -6 } };
    const canvas = { x: 12.5, y: -3.25 };
    const screen = {
      x: canvas.x * viewport.scale + viewport.offset.x,
      y: canvas.y * viewport.scale + viewport.offset.y
    };
    const back = canvasPointFromScreen(screen, viewport);
    expect(back.x).toBeCloseTo(canvas.x, 10);
    expect(back.y).toBeCloseTo(canvas.y, 10);
  });

  it('scaleAroundScreenPoint keeps anchor canvas point invariant', () => {
    const viewport = { scale: 1.5, offset: { x: 120, y: -40 } };
    const anchor = { x: 260, y: 310 };
    const before = canvasPointFromScreen(anchor, viewport);
    const next = scaleAroundScreenPoint(viewport, 3.2, anchor);
    const after = canvasPointFromScreen(anchor, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('scaleAroundScreenPoint clamps scale to limits', () => {
    const viewport = { scale: 1, offset: { x: 0, y: 0 } };
    const anchor = { x: 50, y: 50 };
    expect(scaleAroundScreenPoint(viewport, 999, anchor).scale).toBe(6);
    expect(scaleAroundScreenPoint(viewport, 0.00001, anchor).scale).toBe(0.1);
    expect(scaleAroundScreenPoint(viewport, 2, anchor, { min: 0.5, max: 2.5 }).scale).toBe(2);
    expect(scaleAroundScreenPoint(viewport, 0.2, anchor, { min: 0.5, max: 2.5 }).scale).toBe(0.5);
  });

  it('scaleAroundScreenPoint handles non-finite viewport/inputs', () => {
    const viewport = { scale: Number.NaN, offset: { x: Number.POSITIVE_INFINITY, y: Number.NaN } };
    const anchor = { x: Number.NaN, y: Number.POSITIVE_INFINITY };
    const next = scaleAroundScreenPoint(viewport, Number.NaN, anchor);
    expect(Number.isFinite(next.scale)).toBe(true);
    expect(next.scale).toBe(0.1);
    expect(Number.isFinite(next.offset.x)).toBe(true);
    expect(Number.isFinite(next.offset.y)).toBe(true);
    const back = canvasPointFromScreen({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, next);
    expect(Number.isFinite(back.x)).toBe(true);
    expect(Number.isFinite(back.y)).toBe(true);
  });

  it('scaleAroundScreenPoint keeps anchor invariant even if prev scale is invalid', () => {
    const viewport = { scale: -2, offset: { x: 10, y: 20 } };
    const anchor = { x: 60, y: 80 };
    const before = canvasPointFromScreen(anchor, viewport);
    const next = scaleAroundScreenPoint(viewport, 3, anchor);
    const after = canvasPointFromScreen(anchor, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });
});
