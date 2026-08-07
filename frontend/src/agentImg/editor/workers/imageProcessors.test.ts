import { describe, expect, test } from 'vitest';
import { applyPolygonCutout, enhanceClarity, removeUniformBackground } from './imageProcessors';

function pixels(width: number, height: number, fill: [number, number, number]): ArrayBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = fill[0];
    data[offset + 1] = fill[1];
    data[offset + 2] = fill[2];
    data[offset + 3] = 255;
  }
  return data.buffer;
}

describe('editor local image processors', () => {
  test('removes only edge-connected uniform background', () => {
    const data = new Uint8ClampedArray(pixels(5, 5, [255, 255, 255]));
    const center = (2 * 5 + 2) * 4;
    data[center] = 20;
    data[center + 1] = 20;
    data[center + 2] = 20;
    const output = new Uint8ClampedArray(
      removeUniformBackground({ width: 5, height: 5, data: data.buffer }, 30, 0).data
    );
    expect(output[3]).toBe(0);
    expect(output[center + 3]).toBe(255);
  });

  test('keeps polygon interior and clears exterior alpha', () => {
    const output = new Uint8ClampedArray(applyPolygonCutout(
      { width: 4, height: 4, data: pixels(4, 4, [100, 120, 140]) },
      [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }]
    ).data);
    expect(output[3]).toBe(0);
    expect(output[(1 * 4 + 1) * 4 + 3]).toBe(255);
  });

  test('clarity preserves alpha and flat colors', () => {
    const output = new Uint8ClampedArray(enhanceClarity(
      { width: 3, height: 3, data: pixels(3, 3, [120, 120, 120]) },
      1
    ).data);
    expect([...output]).toEqual([...new Uint8ClampedArray(pixels(3, 3, [120, 120, 120]))]);
  });
});
