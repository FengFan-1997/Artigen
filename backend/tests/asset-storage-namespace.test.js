const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const test = require('node:test');
const { S3AssetAdapter, storeAsset } = require('../services/asset-storage');

const makeAdapter = (prefix = '') => new S3AssetAdapter({
  S3_BUCKET: 'namespace-test',
  S3_REGION: 'us-east-1',
  S3_ENDPOINT: 'https://storage.invalid',
  S3_ACCESS_KEY_ID: 'synthetic',
  S3_SECRET_ACCESS_KEY: 'synthetic',
  S3_FORCE_PATH_STYLE: '1',
  S3_KEY_PREFIX: prefix
});

test('new writes use a normalized prefix; default and saved URIs remain unchanged', () => {
  const legacy = makeAdapter();
  const dev = makeAdapter('dev/assets/');
  assert.equal(legacy.namespaceKey('owner/image.png'), 'owner/image.png');
  assert.equal(dev.namespaceKey('owner/image.png'), 'dev/assets/owner/image.png');
  assert.equal(dev.keyFromUri('s3://namespace-test/owner/image.png'), 'owner/image.png');
  assert.equal(dev.keyFromUri('s3://namespace-test/dev/assets/owner/image.png'), 'dev/assets/owner/image.png');
  for (const prefix of ['/', '../dev', 'dev//assets', 'dev/./assets', 'dev?x', 'dev\\assets', 'x'.repeat(129)]) {
    assert.throws(() => makeAdapter(prefix), { code: 'S3_KEY_PREFIX_INVALID' });
  }
});

test('legacy reads succeed but every out-of-namespace mutation fails before the SDK', async () => {
  const dev = makeAdapter('dev/assets');
  let sends = 0;
  dev.client.send = async (command) => {
    sends += 1;
    assert.equal(command.constructor.name, 'GetObjectCommand');
    assert.equal(command.input.Key, 'owner/legacy.png');
    return { Body: Readable.from([Buffer.from('legacy')]), ContentLength: 6 };
  };
  const opened = await dev.open('s3://namespace-test/owner/legacy.png');
  assert.equal(opened.contentLength, 6);
  for (const key of ['owner/legacy.png', 'production/image.png', 'dev/assets-other/image.png']) {
    const mutations = [
      () => dev.putBuffer({ key, buffer: Buffer.from('x') }),
      () => dev.putFile({ key, filePath: '/nonexistent-namespace-fixture' }),
      () => dev.replaceBuffer({ key, buffer: Buffer.from('x') }),
      () => dev.replaceFile({ key, filePath: '/nonexistent-namespace-fixture' }),
      () => dev.signPut({ key, byteSize: 1 }),
      () => dev.createMultipart({ key }),
      () => dev.signPart({ key, uploadId: 'synthetic', partNumber: 1 }),
      () => dev.listParts({ key, uploadId: 'synthetic' }),
      () => dev.completeMultipart({ key, uploadId: 'synthetic', parts: [] }),
      () => dev.abortMultipart({ key, uploadId: 'synthetic' }),
      () => dev.copyKey({ key, sourceKey: 'dev/assets/source.png' }),
      () => dev.deleteKey(key),
      () => dev.delete(`s3://namespace-test/${key}`)
    ];
    for (const mutation of mutations) {
      await assert.rejects(mutation(), { code: 'ASSET_NAMESPACE_WRITE_FORBIDDEN' });
    }
  }
  assert.equal(sends, 1);
  await assert.rejects(dev.delete('s3://other-bucket/dev/assets/file'), { code: 'INVALID_ASSET_URI' });
  await assert.rejects(dev.putBuffer({ key: 'dev/assets/../outside', buffer: Buffer.from('x') }), {
    code: 'INVALID_ASSET_KEY'
  });
});

test('presigned single and multipart uploads target the exact namespace once', async () => {
  const dev = makeAdapter('dev/assets');
  const key = dev.namespaceKey('staging/owner/session');
  const put = new URL(await dev.signPut({ key, mimeType: 'image/png', byteSize: 1 }));
  const part = new URL(await dev.signPart({ key, uploadId: 'synthetic', partNumber: 1 }));
  assert.equal(put.pathname, '/namespace-test/dev/assets/staging/owner/session');
  assert.equal(part.pathname, put.pathname);
  assert.equal(part.searchParams.get('partNumber'), '1');
});

test('same owner and bytes in shared storage produce distinct persisted DEV and legacy assets', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av9Z5AAAAABJRU5ErkJggg==', 'base64');
  const objects = new Map();
  const storedUris = [];
  for (const prefix of ['', 'dev/assets']) {
    const adapter = makeAdapter(prefix);
    adapter.client.send = async (command) => {
      const { Key, Body } = command.input;
      if (command.constructor.name === 'PutObjectCommand') objects.set(Key, Body);
      if (command.constructor.name === 'GetObjectCommand') {
        const buffer = objects.get(Key);
        return { Body: Readable.from([buffer]), ContentLength: buffer.length };
      }
      return {};
    };
    let row;
    const pool = { async query(sql, params = []) {
      sql = String(sql).replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO assets')) {
        // The real query persists the URI returned by the adapter.
        storedUris.push(params.find((value) => typeof value === 'string' && value.startsWith('s3://')));
        row = { id: '10000000-0000-4000-8000-000000000001', uri: storedUris.at(-1), mime_type: 'image/png', byte_size: bytes.length };
      }
      if (sql.includes("UPDATE assets SET gc_state='active'")) return { rowCount: 1, rows: [row] };
      return { rowCount: 0, rows: [] };
    } };
    await storeAsset({ adapter, pool, ownerUserId: '00000000-0000-4000-8000-000000000001', buffer: bytes, declaredMime: 'image/png', retentionClass: 'generated-output' });
  }
  assert.equal(objects.size, 2);
  assert.equal(storedUris.length, 2);
  assert.equal(storedUris[1], storedUris[0].replace('s3://namespace-test/', 's3://namespace-test/dev/assets/'));
  const dev = makeAdapter('dev/assets');
  dev.client.send = async (command) => { objects.delete(command.input.Key); return {}; };
  await dev.delete(storedUris[1]);
  assert.equal(objects.size, 1);
  assert.ok(objects.has(dev.keyFromUri(storedUris[0])));
});
