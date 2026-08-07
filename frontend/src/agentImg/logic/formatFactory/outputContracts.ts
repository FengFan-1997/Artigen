export const GIF_LIMITS = Object.freeze({
  maxDurationSeconds: 30,
  maxSourcePixels: 12_000_000,
  maxOutputPixels: 1_500_000,
  maxFrames: 720,
  maxEstimatedBytes: 192 * 1024 * 1024
});

type GifPlanInput = {
  sourceWidth: number;
  sourceHeight: number;
  videoDurationSeconds: number;
  startSeconds: number;
  durationSeconds: number;
  fps: number;
  outputWidth: number;
};

export const createGifPlan = (input: GifPlanInput) => {
  const sourceWidth = Math.floor(Number(input.sourceWidth));
  const sourceHeight = Math.floor(Number(input.sourceHeight));
  const sourcePixels = sourceWidth * sourceHeight;
  if (
    !Number.isFinite(sourcePixels) ||
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    sourcePixels > GIF_LIMITS.maxSourcePixels
  ) {
    throw new Error('GIF_SOURCE_PIXEL_LIMIT');
  }

  const videoDuration = Number(input.videoDurationSeconds);
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) throw new Error('VIDEO_META_FAIL');
  const startSeconds = Math.max(0, Math.min(Number(input.startSeconds) || 0, videoDuration - 0.05));
  const availableDuration = Math.max(0.2, videoDuration - startSeconds);
  const durationSeconds = Math.max(
    0.2,
    Math.min(
      Number(input.durationSeconds) || 0.2,
      GIF_LIMITS.maxDurationSeconds,
      availableDuration
    )
  );
  const fps = Math.max(2, Math.min(24, Math.floor(Number(input.fps) || 10)));
  const frameCount = Math.max(1, Math.floor(durationSeconds * fps));
  if (frameCount > GIF_LIMITS.maxFrames) throw new Error('GIF_FRAME_LIMIT');

  const outputWidth = Math.max(120, Math.min(960, Math.floor(Number(input.outputWidth) || 480)));
  const outputHeight = Math.max(1, Math.round((outputWidth * sourceHeight) / sourceWidth));
  const outputPixels = outputWidth * outputHeight;
  if (!Number.isFinite(outputPixels) || outputPixels > GIF_LIMITS.maxOutputPixels) {
    throw new Error('GIF_OUTPUT_PIXEL_LIMIT');
  }

  // gifenc retains compressed/indexed frame data. Budget the indexed frame payload plus two RGBA
  // working buffers so long clips fail predictably before allocating hundreds of megabytes.
  const estimatedBytes = outputPixels * frameCount + outputPixels * 8 + frameCount * 4096;
  if (estimatedBytes > GIF_LIMITS.maxEstimatedBytes) {
    throw new Error('GIF_MEMORY_BUDGET_EXCEEDED');
  }

  return {
    sourceWidth,
    sourceHeight,
    startSeconds,
    durationSeconds,
    fps,
    frameCount,
    delayMilliseconds: Math.max(20, Math.round(1000 / fps)),
    outputWidth,
    outputHeight,
    outputPixels,
    estimatedBytes
  };
};

export const hasGifMagic = (bytes: Uint8Array) => {
  if (bytes.byteLength < 6) return false;
  const header = String.fromCharCode(...bytes.slice(0, 6));
  return header === 'GIF87a' || header === 'GIF89a';
};

export const hasImageMagic = (
  bytes: Uint8Array,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
) => {
  if (mimeType === 'image/png') {
    return (
      bytes.byteLength >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value
      )
    );
  }
  if (mimeType === 'image/jpeg') {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
};

export const normalizePdfTextParagraphs = (parts: string[]) => {
  const paragraphs = parts
    .flatMap((part) => String(part || '').split(/\n{2,}/))
    .map((part) => part.trim())
    .filter(Boolean);
  if (!paragraphs.length) throw new Error('OCR_NOT_SUPPORTED');
  return paragraphs;
};

export const countPdfPages = (bytes: Uint8Array) => {
  const prefix = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 8)));
  if (!prefix.startsWith('%PDF-')) return 0;
  const text = new TextDecoder('latin1').decode(bytes);
  return (text.match(/\d+\s+\d+\s+obj\s*<<\s*\/Type\s*\/Page(?!s)\b/g) || []).length;
};

export const assertPdfPageCount = (bytes: Uint8Array, expectedPages: number) => {
  if (countPdfPages(bytes) !== expectedPages) throw new Error('PDF_OUTPUT_INVALID');
};

const unicodeCharacterHex = (character: string) => {
  let hex = '';
  for (let index = 0; index < character.length; index += 1) {
    hex += character.charCodeAt(index).toString(16).padStart(4, '0').toUpperCase();
  }
  return hex;
};

export const createPdfSearchTextLayer = (
  pages: string[],
  refs: { font: number; cidFont: number; descriptor: number; toUnicode: number }
) => {
  const characters = new Map<string, number>();
  for (const page of pages) {
    for (const character of Array.from(String(page || ''))) {
      if (!characters.has(character)) characters.set(character, characters.size + 1);
    }
  }
  if (characters.size > 65_534) throw new Error('TEXT_TOO_LARGE');

  const mappings = Array.from(characters.entries()).map(([character, cid]) => {
    const source = cid.toString(16).padStart(4, '0').toUpperCase();
    return `<${source}><${unicodeCharacterHex(character)}>`;
  });
  const mappingBlocks: string[] = [];
  for (let index = 0; index < mappings.length; index += 100) {
    const block = mappings.slice(index, index + 100);
    mappingBlocks.push(`${block.length} beginbfchar\n${block.join('\n')}\nendbfchar`);
  }
  const toUnicodeCMap =
    '/CIDInit /ProcSet findresource begin\n' +
    '12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /ArtigenSearch-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000><FFFF>\nendcodespacerange\n' +
    `${mappingBlocks.join('\n')}\n` +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';

  const pageContent = pages.map((page) => {
    const codes = Array.from(String(page || ''))
      .map((character) => characters.get(character)?.toString(16).padStart(4, '0').toUpperCase())
      .filter((value): value is string => Boolean(value))
      .join('');
    if (!codes) return '';
    return `BT\n/FSearch 1 Tf\n3 Tr\n1 0 0 1 0 0 Tm\n<${codes}> Tj\nET\n`;
  });

  return {
    fontDictionary: `<< /Type /Font /Subtype /Type0 /BaseFont /ArtigenSearch /Encoding /Identity-H /DescendantFonts [${refs.cidFont} 0 R] /ToUnicode ${refs.toUnicode} 0 R >>`,
    cidFontDictionary: `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ArtigenSearch /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${refs.descriptor} 0 R /DW 1000 /CIDToGIDMap /Identity >>`,
    descriptorDictionary:
      '<< /Type /FontDescriptor /FontName /ArtigenSearch /Flags 32 /FontBBox [0 -200 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>',
    toUnicodeCMap,
    pageContent
  };
};
