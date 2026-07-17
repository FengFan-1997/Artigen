const zlib = require("zlib");

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    table[value] = current >>> 0;
  }
  return table;
})();

const fixtureCrc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const MINIMAL_DOCX_ENTRIES = Object.freeze([
  {
    name: "[Content_Types].xml",
    content:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ' +
      'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
  },
  {
    name: "_rels/.rels",
    content:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
      'Target="word/document.xml"/>' +
      "</Relationships>",
  },
  {
    name: "word/document.xml",
    content:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:body><w:p><w:r><w:t>Artigen conversion fixture</w:t></w:r></w:p></w:body>" +
      "</w:document>",
  },
]);

const buildZipFixture = (inputEntries = MINIMAL_DOCX_ENTRIES) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const input of inputEntries) {
    const name = Buffer.from(input.name, "utf8");
    const localName = Buffer.from(input.localName || input.name, "utf8");
    const content = Buffer.isBuffer(input.content)
      ? input.content
      : Buffer.from(String(input.content || ""), "utf8");
    const method = input.method ?? 8;
    const usesDescriptor = input.dataDescriptor === true;
    const flags = input.flags ?? (0x0800 | (usesDescriptor ? 0x0008 : 0));
    const compressed = method === 0 ? content : zlib.deflateRawSync(content);
    const checksum = input.crc32 ?? fixtureCrc32(content);
    const declaredCompressedSize = input.compressedSize ?? compressed.length;
    const declaredUncompressedSize = input.uncompressedSize ?? content.length;
    const localExtra = Buffer.from(input.localExtra || input.extra || []);
    const centralExtra = Buffer.from(input.centralExtra || input.extra || []);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE((usesDescriptor ? 0 : checksum) >>> 0, 14);
    localHeader.writeUInt32LE((usesDescriptor ? 0 : declaredCompressedSize) >>> 0, 18);
    localHeader.writeUInt32LE((usesDescriptor ? 0 : declaredUncompressedSize) >>> 0, 22);
    localHeader.writeUInt16LE(localName.length, 26);
    localHeader.writeUInt16LE(localExtra.length, 28);
    let descriptor = Buffer.alloc(0);
    if (usesDescriptor) {
      descriptor = Buffer.alloc(input.descriptorSignature === false ? 12 : 16);
      let descriptorOffset = 0;
      if (input.descriptorSignature !== false) {
        descriptor.writeUInt32LE(0x08074b50, 0);
        descriptorOffset = 4;
      }
      descriptor.writeUInt32LE(checksum >>> 0, descriptorOffset);
      descriptor.writeUInt32LE(declaredCompressedSize >>> 0, descriptorOffset + 4);
      descriptor.writeUInt32LE(declaredUncompressedSize >>> 0, descriptorOffset + 8);
    }
    const localRecord = Buffer.concat([
      localHeader,
      localName,
      localExtra,
      compressed,
      descriptor,
    ]);
    localParts.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(input.versionMadeBy ?? 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(checksum >>> 0, 16);
    centralHeader.writeUInt32LE(declaredCompressedSize >>> 0, 20);
    centralHeader.writeUInt32LE(declaredUncompressedSize >>> 0, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(centralExtra.length, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt32LE(input.externalAttributes ?? 0, 38);
    centralHeader.writeUInt32LE(localOffset >>> 0, 42);
    centralParts.push(Buffer.concat([centralHeader, name, centralExtra]));
    localOffset += localRecord.length;
  }

  const localData = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(inputEntries.length, 8);
  eocd.writeUInt16LE(inputEntries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralDirectory, eocd]);
};

const makeMinimalDocxFixture = () => buildZipFixture(MINIMAL_DOCX_ENTRIES);

module.exports = {
  MINIMAL_DOCX_ENTRIES,
  buildZipFixture,
  makeMinimalDocxFixture,
};
