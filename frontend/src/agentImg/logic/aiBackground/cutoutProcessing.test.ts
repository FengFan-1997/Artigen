import { describe, expect, test } from 'vitest';
import {
  createCutoutPixels,
  retainMeaningfulForegroundComponents
} from './cutoutProcessing';

const solidPixels = (width: number, height: number, rgba: [number, number, number, number]) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    pixels.set(rgba, pixel * 4);
  }
  return pixels;
};

const paintRect = (
  pixels: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: [number, number, number, number]
) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) pixels.set(rgba, (y * width + x) * 4);
  }
};

describe('background cutout pixels', () => {
  test('never recreates opacity in transparent or semi-transparent source pixels', () => {
    const width = 16;
    const height = 12;
    const source = solidPixels(width, height, [245, 245, 245, 255]);
    paintRect(source, width, 4, 2, 12, 10, [30, 40, 50, 255]);
    source[(6 * width + 7) * 4 + 3] = 0;
    source[(6 * width + 8) * 4 + 3] = 96;

    const output = createCutoutPixels({
      width,
      height,
      pixels: source,
      maskWidth: width,
      maskHeight: height,
      maskPixels: source.slice()
    });

    expect(output[(6 * width + 7) * 4 + 3]).toBe(0);
    expect(output[(6 * width + 8) * 4 + 3]).toBeLessThanOrEqual(96);
    for (let offset = 3; offset < output.length; offset += 4) {
      expect(output[offset]).toBeLessThanOrEqual(source[offset]);
    }
  });

  test('keeps an entirely transparent input transparent', () => {
    const width = 5;
    const height = 4;
    const source = solidPixels(width, height, [80, 120, 160, 0]);
    const output = createCutoutPixels({
      width,
      height,
      pixels: source,
      maskWidth: width,
      maskHeight: height,
      maskPixels: source.slice()
    });

    expect(Array.from(output).filter((_, index) => index % 4 === 3)).toEqual(
      new Array(width * height).fill(0)
    );
  });

  test('preserves multiple substantial subjects, including one on the frame boundary', () => {
    const width = 14;
    const height = 10;
    const background = new Uint8Array(width * height);
    background.fill(1);
    const markForeground = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) background[y * width + x] = 0;
      }
    };
    markForeground(0, 2, 3, 8);
    markForeground(9, 1, 13, 9);
    background[width + 6] = 0;

    const retained = retainMeaningfulForegroundComponents(background, width, height);

    expect(retained[4 * width]).toBe(0);
    expect(retained[5 * width + 11]).toBe(0);
    expect(retained[width + 6]).toBe(1);
  });

  test('keeps both people in a simple disconnected two-subject image', () => {
    const width = 48;
    const height = 32;
    const source = solidPixels(width, height, [250, 250, 250, 255]);
    paintRect(source, width, 6, 4, 18, 29, [35, 45, 55, 255]);
    paintRect(source, width, 29, 3, 42, 29, [55, 40, 35, 255]);

    const output = createCutoutPixels({
      width,
      height,
      pixels: source,
      maskWidth: width,
      maskHeight: height,
      maskPixels: source.slice()
    });

    expect(output[(16 * width + 12) * 4 + 3]).toBeGreaterThan(180);
    expect(output[(16 * width + 35) * 4 + 3]).toBeGreaterThan(180);
    expect(output[3]).toBeLessThan(40);
  });
});
