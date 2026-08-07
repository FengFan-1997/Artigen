const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const {
  createConcurrencyGate,
  createRequestAbortController,
  decodeBase64File,
  installConvertRoutes,
  isConvertJsonRequest,
  isDocxBuffer,
  runCommand,
  signalProcessTree
} = require('../routes/convert');
const { crc32, validateDocxBuffer } = require('../lib/docx-validator');
const {
  MINIMAL_DOCX_ENTRIES,
  buildZipFixture,
  makeMinimalDocxFixture
} = require('./fixtures/minimal-docx');

const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for condition');
};

const makeUnicodePathExtra = (rawName, unicodeName) => {
  const rawNameBuffer = Buffer.from(rawName, 'utf8');
  const unicodeNameBuffer = Buffer.from(unicodeName, 'utf8');
  const payload = Buffer.alloc(5 + unicodeNameBuffer.length);
  payload[0] = 1;
  payload.writeUInt32LE(crc32(rawNameBuffer), 1);
  unicodeNameBuffer.copy(payload, 5);
  const extra = Buffer.alloc(4 + payload.length);
  extra.writeUInt16LE(0x7075, 0);
  extra.writeUInt16LE(payload.length, 2);
  payload.copy(extra, 4);
  return extra;
};

const prependShadowLocalHeader = (archive) => {
  const shadow = Buffer.alloc(30);
  shadow.writeUInt32LE(0x04034b50, 0);
  shadow.writeUInt16LE(20, 4);
  const result = Buffer.concat([shadow, Buffer.from(archive)]);
  const eocdOffset = result.length - 22;
  const entryCount = result.readUInt16LE(eocdOffset + 10);
  let centralOffset = result.readUInt32LE(eocdOffset + 16) + shadow.length;
  result.writeUInt32LE(centralOffset, eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(result.readUInt32LE(centralOffset), 0x02014b50);
    result.writeUInt32LE(
      result.readUInt32LE(centralOffset + 42) + shadow.length,
      centralOffset + 42
    );
    centralOffset +=
      46 +
      result.readUInt16LE(centralOffset + 28) +
      result.readUInt16LE(centralOffset + 30) +
      result.readUInt16LE(centralOffset + 32);
  }
  return result;
};

class FakeRequest extends EventEmitter {
  constructor(body) {
    super();
    this.body = body;
    this.aborted = false;
  }
}

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.body = null;
    this.destroyed = false;
    this.writableEnded = false;
    this.writableFinished = false;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(body) {
    this.body = body;
    this.writableEnded = true;
    this.writableFinished = true;
    this.emit('finish');
    return this;
  }
}

test('only the exact Word conversion POST bypasses the global small JSON parser', () => {
  assert.equal(isConvertJsonRequest({ method: 'POST', path: '/api/tools/convert' }), true);
  assert.equal(isConvertJsonRequest({ method: 'POST', url: '/api/tools/convert?x=1' }), true);
  assert.equal(isConvertJsonRequest({ method: 'GET', path: '/api/tools/convert' }), false);
  assert.equal(isConvertJsonRequest({ method: 'POST', path: '/api/tools/convert/other' }), false);
});

test('Word conversion accepts a real minimal OOXML ZIP and rejects renamed archives', () => {
  const docxFixture = makeMinimalDocxFixture();
  const arbitraryZip = buildZipFixture([{ name: 'unrelated.txt', content: 'not OOXML' }]);
  assert.equal(isDocxBuffer(docxFixture), true);
  assert.equal(isDocxBuffer(arbitraryZip), false);
  assert.equal(isDocxBuffer(Buffer.from('not-a-zip')), false);
  assert.deepEqual(validateDocxBuffer(docxFixture), {
    entryCount: 3,
    totalUncompressedBytes: MINIMAL_DOCX_ENTRIES.reduce(
      (total, entry) => total + Buffer.byteLength(entry.content),
      0
    )
  });
  assert.deepEqual(decodeBase64File(docxFixture.toString('base64'), 4096), docxFixture);
  assert.throws(() => decodeBase64File(docxFixture.toString('base64'), 4), /FILE_TOO_LARGE/);
});

test('DOCX preflight rejects the old 117-byte pseudo ZIP and truncated central directory', () => {
  const pseudoZip = Buffer.alloc(117);
  pseudoZip.writeUInt32LE(0x04034b50, 0);
  Buffer.from('[Content_Types].xml\0word/document.xml').copy(pseudoZip, 30);
  assert.equal(isDocxBuffer(pseudoZip), false);
  assert.throws(
    () => validateDocxBuffer(pseudoZip),
    (error) => error?.reason === 'ZIP_EOCD_MISSING'
  );

  const truncated = makeMinimalDocxFixture().subarray(0, -10);
  assert.equal(isDocxBuffer(truncated), false);
  assert.throws(
    () => validateDocxBuffer(truncated),
    (error) => error?.reason === 'ZIP_EOCD_MISSING'
  );
});

test('DOCX preflight rejects duplicate critical entries, local-header mismatch and encryption', () => {
  const duplicate = buildZipFixture([
    ...MINIMAL_DOCX_ENTRIES,
    { ...MINIMAL_DOCX_ENTRIES[0] }
  ]);
  assert.throws(
    () => validateDocxBuffer(duplicate),
    (error) => error?.reason === 'ZIP_DUPLICATE_CRITICAL_ENTRY'
  );

  const localMismatch = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry, index) => (
      index === 0 ? { ...entry, localName: '[Content_Types].xmX' } : entry
    ))
  );
  assert.throws(
    () => validateDocxBuffer(localMismatch),
    (error) => error?.reason === 'ZIP_LOCAL_CENTRAL_MISMATCH'
  );

  const encrypted = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry, index) => (
      index === 0 ? { ...entry, flags: 0x0801 } : entry
    ))
  );
  assert.throws(
    () => validateDocxBuffer(encrypted),
    (error) => error?.reason === 'ZIP_ENCRYPTION_NOT_SUPPORTED'
  );

  const corruptCrc = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry, index) => (
      index === 0 ? { ...entry, crc32: 0 } : entry
    ))
  );
  assert.throws(
    () => validateDocxBuffer(corruptCrc),
    (error) => error?.reason === 'ZIP_ENTRY_CRC_MISMATCH'
  );
});

test('DOCX preflight rejects ambiguous paths, shadow headers and special ZIP entries', () => {
  const dotAlias = buildZipFixture([
    ...MINIMAL_DOCX_ENTRIES,
    { name: 'word/./document.xml', content: '<alias />' }
  ]);
  assert.throws(
    () => validateDocxBuffer(dotAlias),
    (error) => error?.reason === 'ZIP_ENTRY_PATH_INVALID'
  );

  const unicodeCriticalAlias = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry) => (
      entry.name === 'word/document.xml'
        ? {
            ...entry,
            name: 'word/alias.xml',
            extra: makeUnicodePathExtra('word/alias.xml', 'word/document.xml')
          }
        : entry
    ))
  );
  assert.throws(
    () => validateDocxBuffer(unicodeCriticalAlias),
    (error) => error?.reason === 'ZIP_CRITICAL_UNICODE_PATH_AMBIGUOUS'
  );

  assert.throws(
    () => validateDocxBuffer(prependShadowLocalHeader(makeMinimalDocxFixture())),
    (error) => error?.reason === 'ZIP_UNREFERENCED_LOCAL_HEADER'
  );

  const symlink = buildZipFixture([
    ...MINIMAL_DOCX_ENTRIES,
    {
      name: 'word/media/link.bin',
      content: 'target',
      versionMadeBy: (3 << 8) | 20,
      externalAttributes: 0xa0000000
    }
  ]);
  assert.throws(
    () => validateDocxBuffer(symlink),
    (error) => error?.reason === 'ZIP_SPECIAL_FILE_NOT_SUPPORTED'
  );
});

test('DOCX preflight accepts signed and unsigned descriptors plus realistic high-ratio XML', () => {
  const signedDescriptor = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry) => ({ ...entry, dataDescriptor: true }))
  );
  const unsignedDescriptor = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry) => ({
      ...entry,
      dataDescriptor: true,
      descriptorSignature: false
    }))
  );
  assert.equal(isDocxBuffer(signedDescriptor), true);
  assert.equal(isDocxBuffer(unsignedDescriptor), true);

  const repeatedParagraph =
    '<w:p><w:r><w:t>Artigen repeated document content</w:t></w:r></w:p>';
  const largeDocument =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${repeatedParagraph.repeat(20000)}</w:body></w:document>`;
  assert.ok(Buffer.byteLength(largeDocument) > 1024 * 1024);
  const highRatioDocx = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry) => (
      entry.name === 'word/document.xml' ? { ...entry, content: largeDocument } : entry
    ))
  );
  assert.equal(isDocxBuffer(highRatioDocx), true);
});

test('DOCX preflight rejects compression-ratio, single-entry and cumulative ZIP bombs', () => {
  const tooManyEntries = buildZipFixture(
    Array.from({ length: 2049 }, (_value, index) => ({
      name: `word/media/empty-${index}.bin`,
      content: '',
      method: 0
    }))
  );
  assert.throws(
    () => validateDocxBuffer(tooManyEntries),
    (error) => error?.reason === 'ZIP_ENTRY_LIMIT_EXCEEDED'
  );

  const ratioBomb = buildZipFixture(
    MINIMAL_DOCX_ENTRIES.map((entry) => (
      entry.name === 'word/document.xml'
        ? { ...entry, uncompressedSize: 12 * 1024 * 1024 }
        : entry
    ))
  );
  assert.throws(
    () => validateDocxBuffer(ratioBomb),
    (error) => error?.reason === 'ZIP_COMPRESSION_RATIO_EXCEEDED'
  );

  const singleEntryBomb = buildZipFixture([
    ...MINIMAL_DOCX_ENTRIES,
    {
      name: 'word/media/bomb.bin',
      content: 'x',
      uncompressedSize: 65 * 1024 * 1024
    }
  ]);
  assert.throws(
    () => validateDocxBuffer(singleEntryBomb),
    (error) => error?.reason === 'ZIP_ENTRY_UNCOMPRESSED_LIMIT_EXCEEDED'
  );

  const cumulativeEntries = Array.from({ length: 5 }, (_value, index) => ({
    name: `word/media/large-${index}.bin`,
    content: 'x',
    compressedSize: 1024 * 1024,
    uncompressedSize: 60 * 1024 * 1024
  }));
  const cumulativeBomb = buildZipFixture([...MINIMAL_DOCX_ENTRIES, ...cumulativeEntries]);
  assert.throws(
    () => validateDocxBuffer(cumulativeBomb),
    (error) => error?.reason === 'ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED'
  );

  const lyingStream = buildZipFixture([
    ...MINIMAL_DOCX_ENTRIES,
    {
      name: 'word/media/lying-stream.bin',
      content: Buffer.alloc(2 * 1024 * 1024, 0x41),
      uncompressedSize: 1024
    }
  ]);
  assert.throws(
    () => validateDocxBuffer(lyingStream),
    (error) => error?.reason === 'ZIP_ENTRY_DECOMPRESSION_FAILED'
  );
});

test('server requires explicit upload consent before checking or running LibreOffice', async () => {
  const registered = {};
  const app = {
    get: () => {},
    post: (route, ...handlers) => { registered[route] = handlers; }
  };
  installConvertRoutes(app, { rateLimit: () => (_req, _res, next) => next() });
  const handler = registered['/api/tools/convert'].at(-1);
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler({ body: { toolId: 'word2pdf', uploadConsent: false } }, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { ok: false, error: 'UPLOAD_CONSENT_REQUIRED' });
});

test('request abort wiring treats an unfinished response close as cancellation', () => {
  const request = new FakeRequest({});
  const response = new FakeResponse();
  const requestAbort = createRequestAbortController(request, response);
  response.emit('close');
  assert.equal(requestAbort.signal.aborted, true);
  requestAbort.dispose();

  const completedRequest = new FakeRequest({});
  const completedResponse = new FakeResponse();
  completedResponse.writableFinished = true;
  const completedAbort = createRequestAbortController(completedRequest, completedResponse);
  completedResponse.emit('close');
  assert.equal(completedAbort.signal.aborted, false);
  completedAbort.dispose();
});

test('runCommand never reports success after cancellation and terminates the POSIX group', async () => {
  const child = new EventEmitter();
  child.pid = 4312;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    throw new Error('group kill should be preferred');
  };
  const groupSignals = [];
  let spawnOptions = null;
  const controller = new AbortController();
  const pending = runCommand('soffice', ['--headless'], {
    signal: controller.signal,
    platform: 'linux',
    spawn: (_cmd, _args, options) => {
      spawnOptions = options;
      return child;
    },
    killProcess: (pid, signal) => {
      groupSignals.push([pid, signal]);
      if (signal === 'SIGTERM') queueMicrotask(() => child.emit('close', 0));
    },
    killGraceMs: 20
  });

  controller.abort();
  await assert.rejects(pending, (error) => error?.code === 'CONVERT_CANCELLED');
  assert.equal(spawnOptions.detached, true);
  assert.deepEqual(groupSignals, [[-4312, 'SIGTERM']]);
});

test('runCommand escalates a stuck process group from SIGTERM to SIGKILL', async () => {
  const child = new EventEmitter();
  child.pid = 9876;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  const groupSignals = [];
  const controller = new AbortController();
  const pending = runCommand('soffice', [], {
    signal: controller.signal,
    platform: 'linux',
    spawn: () => child,
    killProcess: (pid, signal) => {
      groupSignals.push([pid, signal]);
      if (signal === 'SIGKILL') queueMicrotask(() => child.emit('close', null));
    },
    killGraceMs: 10,
    postKillWaitMs: 100
  });

  controller.abort();
  await assert.rejects(pending, (error) => error?.code === 'CONVERT_CANCELLED');
  assert.deepEqual(groupSignals, [
    [-9876, 'SIGTERM'],
    [-9876, 'SIGKILL']
  ]);
});

test('Windows hard-stop uses taskkill tree mode with child.kill as fallback', () => {
  const child = new EventEmitter();
  child.pid = 2468;
  child.kill = () => true;
  const calls = [];
  const killer = new EventEmitter();
  killer.unref = () => {};
  const signalled = signalProcessTree(child, 'SIGKILL', {
    platform: 'win32',
    spawnTreeKill: (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return killer;
    }
  });
  assert.equal(signalled, true);
  assert.equal(calls[0].cmd, 'taskkill');
  assert.deepEqual(calls[0].args, ['/pid', '2468', '/T', '/F']);

  signalProcessTree(child, 'SIGTERM', {
    platform: 'win32',
    spawnTreeKill: (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return killer;
    }
  });
  assert.deepEqual(calls[1].args, ['/pid', '2468', '/T']);
});

test('real Express order admits before JSON parsing and releases on parse error, close and handler end', async (t) => {
  const app = express();
  const gate = createConcurrencyGate(1);
  const events = [];
  let started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  let commandRuns = 0;
  let firstTmpDir = '';
  let firstCommandArgs = [];
  installConvertRoutes(app, {
    rateLimit: () => (_req, _res, next) => next(),
    getCapabilities: () => ({
      officeBin: 'mock-soffice',
      officeToPdf: true,
      pdfToDocx: false,
      maxFileBytes: 4096
    }),
    concurrencyGate: gate,
    bodyTimeoutMs: 80,
    logger: {
      info: (_label, detail) => events.push(detail),
      warn: (_label, detail) => events.push(detail)
    },
    runCommand: (_cmd, args, options) => {
      commandRuns += 1;
      firstTmpDir = options.cwd;
      firstCommandArgs = args;
      started();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('CONVERT_CANCELLED'), { code: 'CONVERT_CANCELLED' }));
        }, { once: true });
      });
    }
  });
  app.use((error, _req, res, _next) => {
    if (res.destroyed || res.headersSent) return;
    res.status(500).json({ ok: false, error: error?.type || 'TEST_ERROR' });
  });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const body = {
    toolId: 'word2pdf',
    uploadConsent: true,
    filename: 'document.docx',
    dataBase64: makeMinimalDocxFixture().toString('base64')
  };

  const firstController = new AbortController();
  const firstPending = fetch(`${baseUrl}/api/tools/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: firstController.signal,
    body: JSON.stringify(body)
  }).catch((error) => error);
  await startedPromise;
  assert.equal(fs.existsSync(firstTmpDir), true);
  assert.match(firstCommandArgs[0], /^-env:UserInstallation=file:/);
  assert.equal(firstCommandArgs.includes('--headless'), true);
  assert.deepEqual(gate.stats(), { active: 1, limit: 1 });

  const busyResponse = await fetch(`${baseUrl}/api/tools/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Deliberately malformed and large enough to prove the body parser did not
    // run before the busy admission response.
    body: `{"dataBase64":"${'A'.repeat(128 * 1024)}`
  });
  assert.equal(busyResponse.status, 503);
  assert.deepEqual(await busyResponse.json(), {
    ok: false,
    error: 'CONVERTER_BUSY',
    retryable: true
  });
  assert.equal(commandRuns, 1);

  firstController.abort();
  await firstPending;
  await waitFor(() => !fs.existsSync(firstTmpDir));
  await waitFor(() => gate.stats().active === 0);
  assert.deepEqual(gate.stats(), { active: 0, limit: 1 });

  const malformedResponse = await fetch(`${baseUrl}/api/tools/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{'
  });
  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), { ok: false, error: 'INVALID_JSON' });
  await waitFor(() => gate.stats().active === 0);

  const slowRequest = http.request(`${baseUrl}/api/tools/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  slowRequest.on('error', () => {});
  slowRequest.write('{"toolId":"word2pdf","dataBase64":"');
  await waitFor(() => gate.stats().active === 1);
  await waitFor(() => gate.stats().active === 0);
  assert.ok(events.some((event) => event.event === 'upload_timeout'));

  const partialRequest = http.request(`${baseUrl}/api/tools/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  partialRequest.on('error', () => {});
  partialRequest.write('{"toolId":"word2pdf","dataBase64":"');
  await waitFor(() => gate.stats().active === 1);
  partialRequest.destroy();
  await waitFor(() => gate.stats().active === 0);

  const handlerResponse = await fetch(`${baseUrl}/api/tools/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolId: 'word2pdf', uploadConsent: false })
  });
  assert.equal(handlerResponse.status, 400);
  assert.deepEqual(await handlerResponse.json(), {
    ok: false,
    error: 'UPLOAD_CONSENT_REQUIRED'
  });
  await waitFor(() => gate.stats().active === 0);
  assert.ok(events.some((event) => event.event === 'busy'));
  assert.ok(events.some((event) => event.event === 'cancelled'));
});
