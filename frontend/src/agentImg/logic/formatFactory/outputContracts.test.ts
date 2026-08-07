import { describe, expect, it } from 'vitest';
import {
  countPdfPages,
  createPdfSearchTextLayer,
  createGifPlan,
  hasGifMagic,
  hasImageMagic,
  normalizePdfTextParagraphs
} from './outputContracts';

const buildSearchablePdfFixture = (text: string) => {
  const encoder = new TextEncoder();
  const layer = createPdfSearchTextLayer([text], {
    font: 3,
    cidFont: 4,
    descriptor: 5,
    toUnicode: 6
  });
  let output = '%PDF-1.4\n';
  const offsets = [0];
  const addObject = (number: number, body: string) => {
    offsets[number] = encoder.encode(output).byteLength;
    output += `${number} 0 obj\n${body}\nendobj\n`;
  };
  const stream = layer.pageContent[0];
  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, '<< /Type /Pages /Count 1 /Kids [7 0 R] >>');
  addObject(3, layer.fontDictionary);
  addObject(4, layer.cidFontDictionary);
  addObject(5, layer.descriptorDictionary);
  addObject(
    6,
    `<< /Length ${encoder.encode(layer.toUnicodeCMap).byteLength} >>\nstream\n${layer.toUnicodeCMap}endstream`
  );
  addObject(
    7,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /FSearch 3 0 R >> >> /Contents 8 0 R >>'
  );
  addObject(8, `<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n${stream}endstream`);
  const xrefOffset = encoder.encode(output).byteLength;
  output += 'xref\n0 9\n0000000000 65535 f \n';
  for (let object = 1; object <= 8; object += 1) {
    output += `${String(offsets[object]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(output);
};

describe('format factory output contracts', () => {
  it('validates GIF headers and builds a bounded 30-second worker plan', () => {
    expect(hasGifMagic(new TextEncoder().encode('GIF89a_payload'))).toBe(true);
    expect(hasGifMagic(new TextEncoder().encode('GIF87a_payload'))).toBe(true);
    expect(hasGifMagic(new TextEncoder().encode('NOTGIF'))).toBe(false);

    const plan = createGifPlan({
      sourceWidth: 1920,
      sourceHeight: 1080,
      videoDurationSeconds: 90,
      startSeconds: 5,
      durationSeconds: 30,
      fps: 10,
      outputWidth: 480
    });
    expect(plan.durationSeconds).toBe(30);
    expect(plan.frameCount).toBe(300);
    expect(plan.outputHeight).toBe(270);
    expect(plan.estimatedBytes).toBeLessThanOrEqual(192 * 1024 * 1024);
  });

  it('validates PNG, JPEG, and WebP magic bytes independently of file extensions', () => {
    expect(
      hasImageMagic(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png'
      )
    ).toBe(true);
    expect(hasImageMagic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true);
    expect(
      hasImageMagic(new TextEncoder().encode('RIFF\0\0\0\0WEBP'), 'image/webp')
    ).toBe(true);
    expect(hasImageMagic(new TextEncoder().encode('fake png'), 'image/png')).toBe(false);
  });

  it('uses the explicit OCR_NOT_SUPPORTED contract when a PDF has no embedded text', () => {
    expect(() => normalizePdfTextParagraphs(['', '   ', '\n\n'])).toThrowError(
      'OCR_NOT_SUPPORTED'
    );
    expect(normalizePdfTextParagraphs(['First paragraph\n\nSecond paragraph'])).toEqual([
      'First paragraph',
      'Second paragraph'
    ]);
  });

  it('rejects source videos above 12 MP and GIF plans over the memory budget', () => {
    expect(() =>
      createGifPlan({
        sourceWidth: 5000,
        sourceHeight: 3000,
        videoDurationSeconds: 10,
        startSeconds: 0,
        durationSeconds: 3,
        fps: 10,
        outputWidth: 480
      })
    ).toThrowError('GIF_SOURCE_PIXEL_LIMIT');
    expect(() =>
      createGifPlan({
        sourceWidth: 1000,
        sourceHeight: 1000,
        videoDurationSeconds: 40,
        startSeconds: 0,
        durationSeconds: 30,
        fps: 24,
        outputWidth: 600
      })
    ).toThrowError('GIF_MEMORY_BUDGET_EXCEEDED');
  });

  it('validates a PDF header and counts actual page objects, not the pages tree', () => {
    const pdf = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj << /Type /Pages /Count 2 >> endobj\n' +
        '2 0 obj << /Type /Page /Parent 1 0 R >> endobj\n' +
        '3 0 obj << /Type/Page /Parent 1 0 R >> endobj\n%%EOF'
    );
    expect(countPdfPages(pdf)).toBe(2);
    expect(countPdfPages(new TextEncoder().encode('not a pdf /Type /Page'))).toBe(0);
  });

  it('adds a searchable Unicode text layer that an independent PDF parser can extract', async () => {
    const source = 'Local TXT 中文内容\nSecond line';
    const bytes = buildSearchablePdfFixture(source);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: bytes }).promise;
    try {
      const page = await document.getPage(1);
      const content = await page.getTextContent();
      const extracted = content.items
        .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
        .join('');
      expect(extracted.replace(/\s+/g, ' ').trim()).toContain(
        source.replace(/\s+/g, ' ').trim()
      );
    } finally {
      await document.destroy();
    }
  });
});
