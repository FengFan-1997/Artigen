import { describe, expect, test } from 'vitest';
import { createEditorDocument, createRectLayer } from './factory';
import {
  alignLayerTransforms,
  distributeLayerTransforms,
  getLayerVisualBounds,
  snapBoundsToGuides
} from './layout';

function rectangle(id: string, x: number, width: number) {
  const layer = createRectLayer(createEditorDocument().artboard);
  layer.id = id;
  layer.width = width;
  layer.height = 100;
  layer.transform.x = x;
  layer.transform.y = 200;
  return layer;
}

describe('editor layer layout', () => {
  test('aligns visual edges rather than center coordinates', () => {
    const narrow = rectangle('narrow', 100, 100);
    const wide = rectangle('wide', 300, 300);
    const aligned = alignLayerTransforms([narrow, wide], 'left');

    narrow.transform = aligned.narrow;
    wide.transform = aligned.wide;
    expect(getLayerVisualBounds(narrow).left).toBeCloseTo(getLayerVisualBounds(wide).left);
    expect(narrow.transform.x).not.toBe(wide.transform.x);
  });

  test('distributes mixed-size layers with equal visual gaps and fixed outer edges', () => {
    const left = rectangle('left', 100, 100);
    const middle = rectangle('middle', 410, 200);
    const right = rectangle('right', 800, 300);
    const beforeLeft = getLayerVisualBounds(left).left;
    const beforeRight = getLayerVisualBounds(right).right;
    const distributed = distributeLayerTransforms([right, left, middle], 'horizontal');

    for (const layer of [left, middle, right]) layer.transform = distributed[layer.id];
    const leftBounds = getLayerVisualBounds(left);
    const middleBounds = getLayerVisualBounds(middle);
    const rightBounds = getLayerVisualBounds(right);
    expect(leftBounds.left).toBeCloseTo(beforeLeft);
    expect(rightBounds.right).toBeCloseTo(beforeRight);
    expect(middleBounds.left - leftBounds.right).toBeCloseTo(rightBounds.left - middleBounds.right);
  });

  test('snaps the closest edge or center within a screen-derived threshold', () => {
    expect(snapBoundsToGuides({
      left: 94,
      right: 194,
      top: 202,
      bottom: 302,
      centerX: 144,
      centerY: 252
    }, [0, 100, 600], [0, 200, 600], 8)).toEqual({
      x: 6,
      y: -2,
      snappedX: true,
      snappedY: true
    });
  });
});
