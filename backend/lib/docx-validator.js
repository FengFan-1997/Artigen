const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP64_EXTRA_ID = 0x0001;
const UNICODE_PATH_EXTRA_ID = 0x7075;
const SUPPORTED_GENERAL_PURPOSE_FLAGS = 0x080e;
const LOCAL_HEADER_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 2048,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxXmlCompressionRatio: 2000,
  compressionRatioGraceBytes: 1024 * 1024,
});

const REQUIRED_PART_LIMITS = Object.freeze({
  "[Content_Types].xml": 2 * 1024 * 1024,
  "_rels/.rels": 1024 * 1024,
  "word/document.xml": 16 * 1024 * 1024,
});

let crcTable = null;

const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    crcTable[value] = current >>> 0;
  }
  return crcTable;
};

const crc32 = (buffer) => {
  const table = getCrcTable();
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const invalidDocx = (reason) =>
  Object.assign(new Error("INVALID_DOCX"), {
    code: "INVALID_DOCX",
    reason,
    status: 415,
  });

const assertRange = (buffer, offset, length, reason) => {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > buffer.length ||
    length > buffer.length - offset
  ) {
    throw invalidDocx(reason);
  }
};

const parseExtraFields = (buffer, offset, length, rawName) => {
  assertRange(buffer, offset, length, "ZIP_EXTRA_FIELD_OUT_OF_BOUNDS");
  const end = offset + length;
  let cursor = offset;
  let unicodePath = null;
  while (cursor < end) {
    if (end - cursor < 4) throw invalidDocx("ZIP_EXTRA_FIELD_TRUNCATED");
    const fieldId = buffer.readUInt16LE(cursor);
    const fieldLength = buffer.readUInt16LE(cursor + 2);
    cursor += 4;
    if (fieldLength > end - cursor) throw invalidDocx("ZIP_EXTRA_FIELD_TRUNCATED");
    if (fieldId === ZIP64_EXTRA_ID) throw invalidDocx("ZIP64_NOT_SUPPORTED");
    if (fieldId === UNICODE_PATH_EXTRA_ID) {
      if (unicodePath !== null) throw invalidDocx("ZIP_UNICODE_PATH_DUPLICATE");
      if (!rawName || fieldLength < 6) throw invalidDocx("ZIP_UNICODE_PATH_INVALID");
      const fieldEnd = cursor + fieldLength;
      if (
        buffer[cursor] !== 1 ||
        buffer.readUInt32LE(cursor + 1) !== crc32(rawName)
      ) {
        throw invalidDocx("ZIP_UNICODE_PATH_INVALID");
      }
      unicodePath = decodeEntryName(buffer.subarray(cursor + 5, fieldEnd), 0x0800);
    }
    cursor += fieldLength;
  }
  return { unicodePath };
};

const findEocdOffset = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw invalidDocx("ZIP_EOCD_MISSING");
  }
  const firstCandidate = buffer.length - 22;
  const minimum = Math.max(0, firstCandidate - 0xffff);
  for (let offset = firstCandidate; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw invalidDocx("ZIP_EOCD_MISSING");
};

const validateEntryPath = (name) => {
  if (
    !name ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    name.includes("\\") ||
    name.startsWith("/")
  ) {
    throw invalidDocx("ZIP_ENTRY_PATH_INVALID");
  }
  const isDirectory = name.endsWith("/");
  const parts = name.split("/");
  if (isDirectory) parts.pop();
  if (
    !parts.length ||
    parts.some((part) => !part || part === "." || part === "..") ||
    /^[A-Za-z]:$/.test(parts[0])
  ) {
    throw invalidDocx("ZIP_ENTRY_PATH_INVALID");
  }
  if (/%(?:00|2f|5c)/i.test(name)) {
    throw invalidDocx("ZIP_ENTRY_PATH_INVALID");
  }
  const dotDecodedParts = name
    .replace(/%2e/gi, ".")
    .split("/")
    .filter((part, index, all) => !(isDirectory && index === all.length - 1));
  if (dotDecodedParts.some((part) => part === "." || part === "..")) {
    throw invalidDocx("ZIP_ENTRY_PATH_INVALID");
  }
  return name;
};

const decodeEntryName = (rawName, flags) => {
  if (!rawName.length || rawName.includes(0)) throw invalidDocx("ZIP_ENTRY_NAME_INVALID");
  const isUtf8 = (flags & 0x0800) !== 0;
  const name = rawName.toString(isUtf8 ? "utf8" : "latin1");
  if (isUtf8 && !Buffer.from(name, "utf8").equals(rawName)) {
    throw invalidDocx("ZIP_ENTRY_NAME_INVALID");
  }
  return validateEntryPath(name);
};

const validateCentralDirectory = (buffer, limits) => {
  const eocdOffset = findEocdOffset(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw invalidDocx("ZIP_MULTIDISK_NOT_SUPPORTED");
  }
  if (
    entryCount === 0 ||
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw invalidDocx("ZIP64_NOT_SUPPORTED");
  }
  if (entryCount > limits.maxEntries) throw invalidDocx("ZIP_ENTRY_LIMIT_EXCEEDED");
  if (centralOffset + centralSize !== eocdOffset) {
    throw invalidDocx("ZIP_CENTRAL_DIRECTORY_OUT_OF_BOUNDS");
  }
  assertRange(buffer, centralOffset, centralSize, "ZIP_CENTRAL_DIRECTORY_OUT_OF_BOUNDS");

  const entries = [];
  const names = new Set();
  let totalUncompressedBytes = 0;
  let cursor = centralOffset;
  const centralEnd = centralOffset + centralSize;
  for (let index = 0; index < entryCount; index += 1) {
    assertRange(buffer, cursor, 46, "ZIP_CENTRAL_HEADER_TRUNCATED");
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
      throw invalidDocx("ZIP_CENTRAL_HEADER_INVALID");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc32 = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const versionMadeBy = buffer.readUInt16LE(cursor + 4);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const variableLength = nameLength + extraLength + commentLength;
    assertRange(buffer, cursor + 46, variableLength, "ZIP_CENTRAL_HEADER_TRUNCATED");

    if ((flags & 0x2041) !== 0) throw invalidDocx("ZIP_ENCRYPTION_NOT_SUPPORTED");
    if ((flags & ~SUPPORTED_GENERAL_PURPOSE_FLAGS) !== 0) {
      throw invalidDocx("ZIP_FLAGS_NOT_SUPPORTED");
    }
    if (method !== 0 && method !== 8) throw invalidDocx("ZIP_COMPRESSION_NOT_SUPPORTED");
    if (method === 0 && (flags & 0x0006) !== 0) {
      throw invalidDocx("ZIP_FLAGS_NOT_SUPPORTED");
    }
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw invalidDocx("ZIP64_NOT_SUPPORTED");
    }
    if (diskStart !== 0) throw invalidDocx("ZIP_MULTIDISK_NOT_SUPPORTED");
    if (nameLength > 1024) throw invalidDocx("ZIP_ENTRY_NAME_TOO_LONG");

    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const headerName = decodeEntryName(rawName, flags);
    const centralExtra = parseExtraFields(
      buffer,
      cursor + 46 + nameLength,
      extraLength,
      rawName,
    );
    const name = centralExtra.unicodePath || headerName;
    if (
      centralExtra.unicodePath &&
      centralExtra.unicodePath !== headerName &&
      Object.prototype.hasOwnProperty.call(REQUIRED_PART_LIMITS, name)
    ) {
      throw invalidDocx("ZIP_CRITICAL_UNICODE_PATH_AMBIGUOUS");
    }
    const canonicalName = name.normalize("NFC");
    if (names.has(canonicalName)) {
      throw invalidDocx(
        Object.prototype.hasOwnProperty.call(REQUIRED_PART_LIMITS, name)
          ? "ZIP_DUPLICATE_CRITICAL_ENTRY"
          : "ZIP_DUPLICATE_ENTRY",
      );
    }
    names.add(canonicalName);

    const madeByHost = versionMadeBy >>> 8;
    const unixFileType = madeByHost === 3 ? ((externalAttributes >>> 16) & 0xf000) : 0;
    if (unixFileType && unixFileType !== 0x8000 && unixFileType !== 0x4000) {
      throw invalidDocx("ZIP_SPECIAL_FILE_NOT_SUPPORTED");
    }

    if (method === 0 && compressedSize !== uncompressedSize) {
      throw invalidDocx("ZIP_STORED_SIZE_MISMATCH");
    }
    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw invalidDocx("ZIP_ENTRY_UNCOMPRESSED_LIMIT_EXCEEDED");
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw invalidDocx("ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED");
    }
    const compressionRatioLimit = /\.(?:xml|rels)$/i.test(name)
      ? limits.maxXmlCompressionRatio
      : limits.maxCompressionRatio;
    if (
      uncompressedSize > 0 &&
      (
        compressedSize === 0 ||
        uncompressedSize >
          Math.max(
            limits.compressionRatioGraceBytes,
            compressedSize * compressionRatioLimit,
          )
      )
    ) {
      throw invalidDocx("ZIP_COMPRESSION_RATIO_EXCEEDED");
    }
    const criticalLimit = REQUIRED_PART_LIMITS[name];
    if (criticalLimit && uncompressedSize > criticalLimit) {
      throw invalidDocx("DOCX_CRITICAL_PART_TOO_LARGE");
    }

    entries.push({
      name,
      rawName,
      headerName,
      unicodePath: centralExtra.unicodePath,
      flags,
      method,
      expectedCrc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataStart: 0,
      dataEnd: 0,
      occupiedEnd: 0,
    });
    cursor += 46 + variableLength;
  }
  if (cursor !== centralEnd) throw invalidDocx("ZIP_CENTRAL_SIZE_MISMATCH");
  return { entries, centralOffset, entryCount, totalUncompressedBytes };
};

const validateLocalHeaders = (buffer, archive) => {
  const regions = [];
  for (const entry of archive.entries) {
    const offset = entry.localHeaderOffset;
    assertRange(buffer, offset, 30, "ZIP_LOCAL_HEADER_TRUNCATED");
    if (offset >= archive.centralOffset || buffer.readUInt32LE(offset) !== LOCAL_HEADER_SIGNATURE) {
      throw invalidDocx("ZIP_LOCAL_HEADER_INVALID");
    }
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const localCrc32 = buffer.readUInt32LE(offset + 14);
    const localCompressedSize = buffer.readUInt32LE(offset + 18);
    const localUncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assertRange(buffer, offset + 30, nameLength + extraLength, "ZIP_LOCAL_HEADER_TRUNCATED");
    const localName = buffer.subarray(offset + 30, offset + 30 + nameLength);
    if (
      flags !== entry.flags ||
      method !== entry.method ||
      !localName.equals(entry.rawName)
    ) {
      throw invalidDocx("ZIP_LOCAL_CENTRAL_MISMATCH");
    }
    const localExtra = parseExtraFields(
      buffer,
      offset + 30 + nameLength,
      extraLength,
      localName,
    );
    if (localExtra.unicodePath && localExtra.unicodePath !== entry.name) {
      throw invalidDocx("ZIP_LOCAL_CENTRAL_MISMATCH");
    }

    const usesDescriptor = (flags & 0x0008) !== 0;
    if (!usesDescriptor) {
      if (
        localCrc32 !== entry.expectedCrc32 ||
        localCompressedSize !== entry.compressedSize ||
        localUncompressedSize !== entry.uncompressedSize
      ) {
        throw invalidDocx("ZIP_LOCAL_CENTRAL_MISMATCH");
      }
    } else if (
      (localCrc32 !== 0 && localCrc32 !== entry.expectedCrc32) ||
      (localCompressedSize !== 0 && localCompressedSize !== entry.compressedSize) ||
      (localUncompressedSize !== 0 && localUncompressedSize !== entry.uncompressedSize)
    ) {
      throw invalidDocx("ZIP_LOCAL_CENTRAL_MISMATCH");
    }

    entry.dataStart = offset + 30 + nameLength + extraLength;
    entry.dataEnd = entry.dataStart + entry.compressedSize;
    assertRange(buffer, entry.dataStart, entry.compressedSize, "ZIP_ENTRY_DATA_OUT_OF_BOUNDS");
    if (entry.dataEnd > archive.centralOffset) {
      throw invalidDocx("ZIP_ENTRY_DATA_OUT_OF_BOUNDS");
    }
    entry.occupiedEnd = entry.dataEnd;

    if (usesDescriptor) {
      const descriptorStart = entry.dataEnd;
      const descriptorMatchesAt = (offset) => {
        try {
          assertRange(buffer, offset, 12, "ZIP_DATA_DESCRIPTOR_TRUNCATED");
          return (
            buffer.readUInt32LE(offset) === entry.expectedCrc32 &&
            buffer.readUInt32LE(offset + 4) === entry.compressedSize &&
            buffer.readUInt32LE(offset + 8) === entry.uncompressedSize
          );
        } catch {
          return false;
        }
      };
      const signedDescriptor =
        buffer.length - descriptorStart >= 16 &&
        buffer.readUInt32LE(descriptorStart) === DATA_DESCRIPTOR_SIGNATURE &&
        descriptorMatchesAt(descriptorStart + 4);
      const unsignedDescriptor = descriptorMatchesAt(descriptorStart);
      if (!signedDescriptor && !unsignedDescriptor) {
        throw invalidDocx("ZIP_DATA_DESCRIPTOR_MISMATCH");
      }
      entry.occupiedEnd = descriptorStart + (signedDescriptor ? 16 : 12);
      if (entry.occupiedEnd > archive.centralOffset) {
        throw invalidDocx("ZIP_DATA_DESCRIPTOR_OUT_OF_BOUNDS");
      }
    }
    regions.push({ start: offset, end: entry.occupiedEnd });
  }

  regions.sort((a, b) => a.start - b.start);
  for (let index = 1; index < regions.length; index += 1) {
    if (regions[index - 1].end > regions[index].start) {
      throw invalidDocx("ZIP_LOCAL_ENTRY_OVERLAP");
    }
  }
  return regions;
};

const validateNoShadowLocalHeaders = (buffer, regions, centralOffset) => {
  let gapStart = 0;
  for (const region of regions) {
    const shadowOffset = buffer.indexOf(LOCAL_HEADER_BYTES, gapStart);
    if (shadowOffset >= 0 && shadowOffset < region.start) {
      throw invalidDocx("ZIP_UNREFERENCED_LOCAL_HEADER");
    }
    gapStart = Math.max(gapStart, region.end);
  }
  const shadowOffset = buffer.indexOf(LOCAL_HEADER_BYTES, gapStart);
  if (shadowOffset >= 0 && shadowOffset < centralOffset) {
    throw invalidDocx("ZIP_UNREFERENCED_LOCAL_HEADER");
  }
};

const validateEntryPayload = (buffer, entry) => {
  const compressed = buffer.subarray(entry.dataStart, entry.dataEnd);
  let output;
  if (entry.method === 0) {
    output = compressed;
  } else {
    try {
      output = zlib.inflateRawSync(compressed, {
        // The central-directory size is untrusted. Capping at declared+1
        // detects a stream that lies about its expansion before it can allocate
        // beyond the per-entry budget validated above.
        maxOutputLength: entry.uncompressedSize + 1,
      });
    } catch {
      throw invalidDocx("ZIP_ENTRY_DECOMPRESSION_FAILED");
    }
  }
  if (output.length !== entry.uncompressedSize) {
    throw invalidDocx("ZIP_ENTRY_SIZE_MISMATCH");
  }
  if (crc32(output) !== entry.expectedCrc32) {
    throw invalidDocx("ZIP_ENTRY_CRC_MISMATCH");
  }
  return output;
};

const decodeXml = (buffer) => {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    if ((buffer.length - 2) % 2 !== 0) throw invalidDocx("DOCX_XML_ENCODING_INVALID");
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    if ((buffer.length - 2) % 2 !== 0) throw invalidDocx("DOCX_XML_ENCODING_INVALID");
    const littleEndian = Buffer.from(buffer.subarray(2));
    littleEndian.swap16();
    return littleEndian.toString("utf16le");
  }
  return buffer.toString("utf8");
};

const validateEntryPayloads = (buffer, archive) => {
  const criticalParts = new Map();
  for (const entry of archive.entries) {
    const output = validateEntryPayload(buffer, entry);
    if (Object.prototype.hasOwnProperty.call(REQUIRED_PART_LIMITS, entry.name)) {
      criticalParts.set(entry.name, output);
    }
  }
  return criticalParts;
};

const validateRequiredOoxmlParts = (archive, criticalParts) => {
  const byName = new Map(archive.entries.map((entry) => [entry.name, entry]));
  const parts = {};
  for (const [name, maxBytes] of Object.entries(REQUIRED_PART_LIMITS)) {
    const entry = byName.get(name);
    if (!entry || entry.name.endsWith("/")) throw invalidDocx("DOCX_REQUIRED_PART_MISSING");
    if (entry.uncompressedSize > maxBytes) throw invalidDocx("DOCX_CRITICAL_PART_TOO_LARGE");
    const output = criticalParts.get(name);
    if (!output) throw invalidDocx("DOCX_REQUIRED_PART_MISSING");
    parts[name] = decodeXml(output);
  }

  if (
    !parts["[Content_Types].xml"].includes("/word/document.xml") ||
    !parts["[Content_Types].xml"].includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    )
  ) {
    throw invalidDocx("DOCX_CONTENT_TYPES_INVALID");
  }
  if (
    !parts["_rels/.rels"].includes("officeDocument") ||
    !parts["_rels/.rels"].includes("word/document.xml")
  ) {
    throw invalidDocx("DOCX_ROOT_RELATIONSHIP_INVALID");
  }
  const documentXml = parts["word/document.xml"];
  const hasWordNamespace =
    documentXml.includes("http://schemas.openxmlformats.org/wordprocessingml/2006/main") ||
    documentXml.includes("http://purl.oclc.org/ooxml/wordprocessingml/main");
  const hasDocumentElement = /<(?:[A-Za-z_][\w.-]*:)?document(?:\s|>)/.test(documentXml);
  const hasBodyElement = /<(?:[A-Za-z_][\w.-]*:)?body(?:\s|>)/.test(documentXml);
  if (!hasWordNamespace || !hasDocumentElement || !hasBodyElement) {
    throw invalidDocx("DOCX_DOCUMENT_XML_INVALID");
  }
};

const validateDocxBuffer = (buffer, overrides = {}) => {
  if (!Buffer.isBuffer(buffer)) throw invalidDocx("DOCX_BUFFER_REQUIRED");
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  const archive = validateCentralDirectory(buffer, limits);
  const localRegions = validateLocalHeaders(buffer, archive);
  validateNoShadowLocalHeaders(buffer, localRegions, archive.centralOffset);
  const criticalParts = validateEntryPayloads(buffer, archive);
  validateRequiredOoxmlParts(archive, criticalParts);
  return {
    entryCount: archive.entryCount,
    totalUncompressedBytes: archive.totalUncompressedBytes,
  };
};

const isDocxBuffer = (buffer) => {
  try {
    validateDocxBuffer(buffer);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  DEFAULT_LIMITS,
  crc32,
  isDocxBuffer,
  validateDocxBuffer,
};
