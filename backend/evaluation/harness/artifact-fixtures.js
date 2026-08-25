const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av9Z5AAAAABJRU5ErkJggg==',
  'base64'
);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const zipStored = (inputEntries) => {
  const entries = Object.entries(inputEntries).map(([name, content]) => ({
    name: Buffer.from(name.replace(/^\/+/, ''), 'utf8'),
    content: Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
  }));
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const checksum = crc32(entry.content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(entry.content.length, 18);
    header.writeUInt32LE(entry.content.length, 22);
    header.writeUInt16LE(entry.name.length, 26);
    local.push(header, entry.name, entry.content);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(entry.content.length, 20);
    directory.writeUInt32LE(entry.content.length, 24);
    directory.writeUInt16LE(entry.name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, entry.name);
    offset += header.length + entry.name.length + entry.content.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
};

const zipEntryNames = (buffer) => {
  const names = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(buffer.subarray(nameStart, nameStart + nameLength).toString('utf8'));
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return names;
};

const zipEntryContents = (buffer) => {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (method !== 0) throw new TypeError('AGENT_HARNESS_ZIP_COMPRESSION_UNSUPPORTED');
    entries.set(name, buffer.subarray(contentStart, contentStart + compressedSize));
    offset = contentStart + compressedSize;
  }
  return entries;
};

const xmlText = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const minimalPdf = (text = 'Artigen Harness V3') => Buffer.from([
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj',
  `4 0 obj << /Length ${text.length + 24} >> stream`,
  `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`,
  'endstream endobj',
  'trailer << /Root 1 0 R >>',
  '%%EOF'
].join('\n'), 'utf8');

const minimalXlsx = (text = 'Verified deterministic workbook') => zipStored({
  '[Content_Types].xml': [
    '<?xml version="1.0"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    '</Types>'
  ].join(''),
  '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Summary" sheetId="1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><f>SUM(A1:A2)</f><v>3</v></c></row><row r="2"><c r="A2"><v>2</v></c></row></sheetData></worksheet>',
  'xl/sharedStrings.xml': `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>${xmlText(text)}</t></si></sst>`,
  'xl/charts/chart1.xml': '<?xml version="1.0"?><chartSpace xmlns="http://schemas.openxmlformats.org/drawingml/2006/chart"/>'
});

const minimalPptx = (text = 'Verified deterministic presentation') => zipStored({
  '[Content_Types].xml': [
    '<?xml version="1.0"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>',
    '</Types>'
  ].join(''),
  '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  'ppt/presentation.xml': '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>',
  'ppt/slides/slide1.xml': `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld name="Harness V3"><a:t>${xmlText(text)}</a:t></p:cSld></p:sld>`
});

const minimalWebsiteZip = (text = 'Verified offline prototype') => zipStored({
  'index.html': `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artigen Harness</title><main><h1>${xmlText(text)}</h1></main></html>`,
  'styles.css': 'html{font-family:system-ui;background:#0e100f;color:#f2f4ee}main{max-width:48rem;margin:auto;padding:3rem}'
});

const fixtureForKind = (kind) => {
  if (kind === 'png' || kind === 'image') return PNG_1X1;
  if (kind === 'pdf') return minimalPdf();
  if (kind === 'xlsx' || kind === 'spreadsheet') return minimalXlsx();
  if (kind === 'pptx' || kind === 'presentation') return minimalPptx();
  if (kind === 'website' || kind === 'zip') return minimalWebsiteZip();
  if (kind === 'markdown' || kind === 'text') return Buffer.from('# Artigen Harness V3\n\nVerified deterministic output.\n');
  throw new TypeError(`AGENT_HARNESS_FIXTURE_KIND_INVALID:${String(kind || '')}`);
};

module.exports = {
  PNG_1X1,
  crc32,
  fixtureForKind,
  minimalPdf,
  minimalPptx,
  minimalWebsiteZip,
  minimalXlsx,
  zipEntryNames,
  zipEntryContents,
  zipStored
};
