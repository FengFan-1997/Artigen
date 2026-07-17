const encoder = new TextEncoder();

const pushText = (parts: Uint8Array[], cursor: { value: number }, text: string) => {
  const bytes = encoder.encode(text);
  parts.push(bytes);
  cursor.value += bytes.byteLength;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAIL'));
    img.src = src;
  });

const canvasToJpegBytes = async (img: HTMLImageElement) => {
  const maxW = 1800;
  const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_CONTEXT_FAIL');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
  );
  if (!blob?.size) throw new Error('CANVAS_EXPORT_FAIL');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
};

const buildPdf = (image: { bytes: Uint8Array; width: number; height: number }) => {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  const cursor = { value: 0 };
  const push = (text: string) => pushText(parts, cursor, text);
  const pushBytes = (bytes: Uint8Array) => {
    parts.push(bytes);
    cursor.value += bytes.byteLength;
  };
  const addObject = (id: number, body: Array<string | Uint8Array>) => {
    offsets[id] = cursor.value;
    push(`${id} 0 obj\n`);
    for (const item of body) {
      if (typeof item === 'string') push(item);
      else pushBytes(item);
    }
    push('\nendobj\n');
  };

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 36;
  const fit = Math.min((pageW - margin * 2) / image.width, (pageH - margin * 2) / image.height);
  const drawW = Math.max(1, image.width * fit);
  const drawH = Math.max(1, image.height * fit);
  const drawX = (pageW - drawW) / 2;
  const drawY = (pageH - drawH) / 2;
  const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ`;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  addObject(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  addObject(3, [
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  ]);
  addObject(4, [
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.byteLength} >>\nstream\n`,
    image.bytes,
    '\nendstream'
  ]);
  addObject(5, [`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`]);

  const xrefOffset = cursor.value;
  push('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i += 1) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  const blobParts = parts.map((part) => {
    const copy = new Uint8Array(part.byteLength);
    copy.set(part);
    return copy.buffer;
  });
  return new Blob(blobParts, { type: 'application/pdf' });
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportPdf = async (content: string | HTMLElement, _type?: number) => {
  const raw =
    typeof content === 'string' ? content : String(content?.outerHTML || content?.textContent || '');
  const svg = raw.trim().startsWith('<svg') ? raw.trim() : `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><text x="40" y="80" font-family="Arial" font-size="28">${raw.replace(/[<>&]/g, '')}</text></svg>`;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await loadImage(src);
  const jpeg = await canvasToJpegBytes(img);
  downloadBlob(buildPdf(jpeg), 'ingredients.pdf');
  return true;
};
