import type { EditorLayer, LayerTransform } from './types';
import { layerLocalSize } from '../export/renderDescription';

export type LayerAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type LayerDistribution = 'horizontal' | 'vertical';

export interface VisualBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface SnapDelta {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
}

export function getLayerVisualBounds(layer: EditorLayer): VisualBounds {
  const local = layerLocalSize(layer);
  const width = local.width * Math.abs(layer.transform.scaleX);
  const height = local.height * Math.abs(layer.transform.scaleY);
  const radians = (layer.transform.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const rotatedWidth = width * cosine + height * sine;
  const rotatedHeight = width * sine + height * cosine;
  return boundsFromRect(
    layer.transform.x - rotatedWidth / 2,
    layer.transform.y - rotatedHeight / 2,
    rotatedWidth,
    rotatedHeight
  );
}

export function alignLayerTransforms(
  layers: EditorLayer[],
  alignment: LayerAlignment
): Record<string, LayerTransform> {
  if (layers.length < 2) return {};
  const entries = layers.map((layer) => ({ layer, bounds: getLayerVisualBounds(layer) }));
  const groupLeft = Math.min(...entries.map(({ bounds }) => bounds.left));
  const groupRight = Math.max(...entries.map(({ bounds }) => bounds.right));
  const groupTop = Math.min(...entries.map(({ bounds }) => bounds.top));
  const groupBottom = Math.max(...entries.map(({ bounds }) => bounds.bottom));
  const targetX = alignment === 'left'
    ? groupLeft
    : alignment === 'right'
      ? groupRight
      : (groupLeft + groupRight) / 2;
  const targetY = alignment === 'top'
    ? groupTop
    : alignment === 'bottom'
      ? groupBottom
      : (groupTop + groupBottom) / 2;

  return Object.fromEntries(entries.map(({ layer, bounds }) => {
    let x = layer.transform.x;
    let y = layer.transform.y;
    if (alignment === 'left') x += targetX - bounds.left;
    else if (alignment === 'right') x += targetX - bounds.right;
    else if (alignment === 'center') x += targetX - bounds.centerX;
    else if (alignment === 'top') y += targetY - bounds.top;
    else if (alignment === 'bottom') y += targetY - bounds.bottom;
    else y += targetY - bounds.centerY;
    return [layer.id, { ...layer.transform, x, y }];
  }));
}

export function distributeLayerTransforms(
  layers: EditorLayer[],
  distribution: LayerDistribution
): Record<string, LayerTransform> {
  if (layers.length < 3) return {};
  const horizontal = distribution === 'horizontal';
  const entries = layers
    .map((layer) => ({ layer, bounds: getLayerVisualBounds(layer) }))
    .sort((left, right) => {
      const primary = horizontal
        ? left.bounds.left - right.bounds.left
        : left.bounds.top - right.bounds.top;
      return primary || left.layer.id.localeCompare(right.layer.id);
    });
  const first = entries[0].bounds;
  const last = entries[entries.length - 1].bounds;
  const spanStart = horizontal ? first.left : first.top;
  const spanEnd = horizontal ? last.right : last.bottom;
  const occupied = entries.reduce(
    (total, entry) => total + (horizontal ? entry.bounds.width : entry.bounds.height),
    0
  );
  const gap = (spanEnd - spanStart - occupied) / (entries.length - 1);
  let cursor = spanStart;

  return Object.fromEntries(entries.map(({ layer, bounds }) => {
    const transform = { ...layer.transform };
    if (horizontal) transform.x += cursor - bounds.left;
    else transform.y += cursor - bounds.top;
    cursor += (horizontal ? bounds.width : bounds.height) + gap;
    return [layer.id, transform];
  }));
}

export function snapBoundsToGuides(
  bounds: Pick<VisualBounds, 'left' | 'top' | 'right' | 'bottom' | 'centerX' | 'centerY'>,
  xGuides: number[],
  yGuides: number[],
  threshold: number
): SnapDelta {
  const x = closestGuideDelta([bounds.left, bounds.centerX, bounds.right], xGuides, threshold);
  const y = closestGuideDelta([bounds.top, bounds.centerY, bounds.bottom], yGuides, threshold);
  return {
    x: x ?? 0,
    y: y ?? 0,
    snappedX: x !== null,
    snappedY: y !== null
  };
}

export function boundsFromRect(left: number, top: number, width: number, height: number): VisualBounds {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2
  };
}

function closestGuideDelta(anchors: number[], guides: number[], threshold: number): number | null {
  let closest: number | null = null;
  for (const anchor of anchors) {
    for (const guide of guides) {
      const delta = guide - anchor;
      if (Math.abs(delta) > threshold) continue;
      if (closest === null || Math.abs(delta) < Math.abs(closest)) closest = delta;
    }
  }
  return closest;
}
