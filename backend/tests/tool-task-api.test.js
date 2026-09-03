const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { once } = require('events');

const {
  assertToolOperation,
  catalogVersion,
  getTool,
  isPaidOperation,
  resolveOperationExecution,
  tools
} = require('../lib/tool-catalog');
const {
  FileAssetAdapter,
  consumeEditorTransfer,
  detectMagicMime,
  readImageDimensions,
  validateMagicBytes
} = require('../services/asset-storage');
const {
  inspectBuffer: inspectAssetBuffer
} = require('../services/file-inspection-service');
const {
  canonicalize,
  publicTask,
  requestHash,
  requireIdempotencyKey,
  resolveUserId
} = require('../services/billing-service');
const {
  assertPaidFeatureAvailable,
  assertProductionAiDesignStorageReady,
  assertServerTaskImplemented,
  buildStoredTaskOptions,
  containsClientAuthority,
  inspectUploadedFile,
  installToolTaskRoutes,
  taskWorkersEnabled,
  validateTaskFields
} = require('../routes/tool-tasks');
const { csrfProtection, deriveCsrfToken, timingSafeTextEqual } = require('../lib/csrf-protection');
const { hashPassword, verifyPassword } = require('../lib/auth-utils');
const { isSessionCurrent, parseSessionNotBefore } = require('../lib/auth-utils');
const { isPaidAiUserId } = require('../lib/credit-pricing');
const { getOtpHmacSecret, hashOtpCode, verifyOtpCode } = require('../lib/otp-security');
const {
  assertCreditFeaturesAvailable,
  assertPaymentsAvailable,
  publicOrder,
  publicPackage
} = require('../routes/payments');
const { legacyJsonBillingEnabled: paymentLegacyJsonBillingEnabled } = require('../routes/payments');
const { canUseLegacyJsonBilling } = require('../lib/legacy-finance-policy');
const { canUseLegacyFileQueryToken } = require('../lib/auth-utils');

test('tool catalog resolves legacy IDs and hybrid operation execution from the server registry', () => {
  assert.equal(catalogVersion, 5);
  assert.ok(tools.length >= 13);
  assert.equal(getTool('old_photo').id, 'old-photo');
  const editor = getTool('image-editor');
  assert.equal(resolveOperationExecution(editor, 'edit'), 'local');
  const idPhoto = getTool('id-photo');
  assert.equal(resolveOperationExecution(idPhoto, 'standard-photo'), 'local');
  assert.equal(resolveOperationExecution(idPhoto, 'professional-portrait'), 'server');
  assert.equal(isPaidOperation(idPhoto, 'professional-portrait'), true);
  assert.deepEqual(assertToolOperation('image-batch', 'pipeline').ok, true);
  assert.equal(assertToolOperation('image-batch', 'not-real').code, 'OPERATION_NOT_SUPPORTED');
  assert.deepEqual(getTool('video-frame').limits, {
    maxFiles: 1,
    maxFileBytes: 200 * 1024 * 1024,
    maxPixels: 32_000_000,
    maxDurationSeconds: 600
  });
  assert.equal(getTool('privacy-redaction').limits.maxFiles, 1);
  assert.equal(getTool('privacy-redaction').capabilities.includes('batch'), false);
  assert.equal(getTool('favicon').limits.maxFiles, 1);
  assert.equal(getTool('pdf-image').limits.maxFileBytes, 80 * 1024 * 1024);
  assert.equal(getTool('pdf-image').operationLimits['pdf-page'].maxFiles, 1);
  assert.equal(getTool('pdf-image').operationLimits['images-to-pdf'].maxFiles, 50);
  assert.equal(getTool('pdf-image').outputFormats.includes('image/webp'), true);
  assert.equal(getTool('pdf-text-word').limits.maxFileBytes, 80 * 1024 * 1024);
  assert.equal(getTool('document-pdf').limits.maxFileBytes, 40 * 1024 * 1024);
  assert.equal(getTool('document-pdf').limits.maxFiles, 1);
  assert.equal(getTool('document-pdf').capabilities.includes('cancel'), true);
  assert.equal(getTool('favicon').outputFormats.includes('application/zip'), false);
});

test('idempotency keys are mandatory, bounded and request hashes are canonical', () => {
  assert.equal(requireIdempotencyKey('task:abc12345'), 'task:abc12345');
  for (const invalid of ['', 'short', 'spaces are forbidden', 'x'.repeat(201)]) {
    assert.throws(() => requireIdempotencyKey(invalid), { code: 'INVALID_IDEMPOTENCY_KEY' });
  }
  assert.deepEqual(canonicalize({ b: 1, a: { d: 2, c: 3 } }), { a: { c: 3, d: 2 }, b: 1 });
  assert.deepEqual(
    requestHash({ options: { height: 2, width: 1 }, toolId: 'x' }),
    requestHash({ toolId: 'x', options: { width: 1, height: 2 } })
  );
});

test('public task results expose opaque asset URLs and one structured result contract', () => {
  const task = publicTask({
    id: '11111111-1111-4111-8111-111111111111',
    tool_id: 'old-photo',
    operation: 'enhance',
    status: 'success',
    sku: 'workshop.old-photo.v1',
    quoted_credits: 5,
    charged_credits: 5,
    refunded_credits: 0,
    result: {
      assets: [{
        assetId: '22222222-2222-4222-8222-222222222222',
        uri: 's3://secret-bucket/private-key',
        mimeType: 'image/png',
        byteSize: 123,
        width: 10,
        height: 20
      }],
      warnings: ['AI_RESTORATION_NOT_FACTUAL_RECONSTRUCTION']
    }
  });
  assert.deepEqual(task.assets, [{
    assetId: '22222222-2222-4222-8222-222222222222',
    url: '/api/assets/22222222-2222-4222-8222-222222222222',
    mimeType: 'image/png',
    byteSize: 123,
    width: 10,
    height: 20
  }]);
  assert.equal(JSON.stringify(task).includes('secret-bucket'), false);
  assert.deepEqual(task.result.receipt, task.receipt);
  assert.deepEqual(task.warnings, [{
    code: 'AI_RESTORATION_NOT_FACTUAL_RECONSTRUCTION',
    messageKey: 'warnings.ai_restoration_not_factual_reconstruction'
  }]);
});

test('wallet identity resolution never mixes database UUID and legacy namespaces', async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [{ id: 'resolved-id' }] };
    }
  };
  await resolveUserId(client, '11111111-1111-4111-8111-111111111111');
  await resolveUserId(client, 'user_legacy_123');
  assert.match(queries[0].sql, /WHERE id=\$1::uuid/);
  assert.doesNotMatch(queries[0].sql, /legacy_user_id/);
  assert.match(queries[1].sql, /WHERE legacy_user_id=\$1/);
  assert.doesNotMatch(queries[1].sql, /id::text\s*=.*OR/i);
});

test('magic-byte validation rejects MIME spoofing and reads image dimensions', () => {
  const png = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.equal(detectMagicMime(png, 'image/png'), 'image/png');
  assert.equal(validateMagicBytes(png, 'image/png'), 'image/png');
  assert.deepEqual(readImageDimensions(png, 'image/png'), { width: 640, height: 480 });
  assert.throws(() => validateMagicBytes(png, 'image/jpeg'), { code: 'FILE_TYPE_MISMATCH' });
  assert.equal(validateMagicBytes(Buffer.from('%PDF-1.7\n'), 'application/pdf'), 'application/pdf');
  assert.equal(
    validateMagicBytes(
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  assert.throws(() => validateMagicBytes(Buffer.from('not a file'), 'image/png'), {
    code: 'UNSUPPORTED_FILE_TYPE'
  });
});

test('Markdown is preserved as text/markdown during asset inspection', async () => {
  const inspected = await inspectAssetBuffer({
    buffer: Buffer.from('# Browser smoke\n\nVerified.\n', 'utf8'),
    declaredMime: 'text/markdown',
    allowedMimeTypes: ['text/markdown'],
    maxBytes: 1024
  });
  assert.equal(inspected.mimeType, 'text/markdown');
  assert.equal(inspected.byteSize, 27);
});

test('uploaded task inputs are fully inspected and fingerprinted before durable storage', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-upload-inspect-'));
  const filePath = path.join(root, 'input.bin');
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av9Z5AAAAABJRU5ErkJggg==',
      'base64'
    );
    await fs.promises.writeFile(filePath, png);
    const inspected = await inspectUploadedFile({
      tempPath: filePath,
      declaredMime: 'image/png',
      maxBytes: 1024,
      maxPixels: 1,
      allowedMimeTypes: ['image/png']
    });
    assert.deepEqual(inspected, {
      byteSize: png.length,
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sha256Hex: require('node:crypto').createHash('sha256').update(png).digest('hex')
    });
    await assert.rejects(() => inspectUploadedFile({
      tempPath: filePath,
      declaredMime: 'image/jpeg',
      maxBytes: 1024,
      maxPixels: 1,
      allowedMimeTypes: ['image/jpeg']
    }), { code: 'FILE_TYPE_MISMATCH' });
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('file asset adapter stores opaque keys and returns the original bytes', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-assets-test-'));
  try {
    const adapter = new FileAssetAdapter(root);
    const payload = Buffer.from('asset-content');
    const stored = await adapter.putBuffer({
      key: 'user/ab/abcdef.bin',
      buffer: payload,
      mimeType: 'application/octet-stream'
    });
    assert.equal(stored.uri, 'file://assets/user/ab/abcdef.bin');
    assert.equal(stored.created, true);
    const replayed = await adapter.putBuffer({
      key: 'user/ab/abcdef.bin',
      buffer: Buffer.from('must-not-replace-content-addressed-object'),
      mimeType: 'application/octet-stream'
    });
    assert.equal(replayed.created, false);
    const opened = await adapter.open(stored.uri);
    const chunks = [];
    opened.body.on('data', (chunk) => chunks.push(chunk));
    await once(opened.body, 'end');
    assert.deepEqual(Buffer.concat(chunks), payload);
    await adapter.delete(stored.uri);
    await assert.rejects(() => adapter.open(stored.uri), { code: 'ASSET_NOT_FOUND' });
    assert.throws(() => adapter.resolveKey('../escape'), { code: 'INVALID_ASSET_KEY' });
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('editor transfers are atomically consumed once and expose only a scoped asset URL', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{
          transfer_id: '11111111-1111-4111-8111-111111111111',
          asset_id: '22222222-2222-4222-8222-222222222222',
          expires_at: new Date('2030-01-01T00:00:00.000Z'),
          mime_type: 'image/png',
          byte_size: '1234',
          width: 640,
          height: 480
        }]
      };
    }
  };

  const transfer = await consumeEditorTransfer({
    transferId: '11111111-1111-4111-8111-111111111111',
    ownerUserId: '33333333-3333-4333-8333-333333333333',
    pool
  });

  assert.match(queries[0].sql, /consumed_at IS NULL/);
  assert.match(queries[0].sql, /transfer\.owner_user_id=\$2/);
  assert.deepEqual(transfer, {
    transferId: '11111111-1111-4111-8111-111111111111',
    assetId: '22222222-2222-4222-8222-222222222222',
    assetUrl: '/api/assets/22222222-2222-4222-8222-222222222222',
    mimeType: 'image/png',
    byteSize: 1234,
    width: 640,
    height: 480,
    expiresAt: new Date('2030-01-01T00:00:00.000Z')
  });
});

test('expired, replayed, foreign or missing editor transfers fail closed', async () => {
  await assert.rejects(
    consumeEditorTransfer({
      transferId: '11111111-1111-4111-8111-111111111111',
      ownerUserId: '33333333-3333-4333-8333-333333333333',
      pool: { query: async () => ({ rowCount: 0, rows: [] }) }
    }),
    { code: 'EDITOR_TRANSFER_NOT_AVAILABLE', status: 404 }
  );
});

test('paid task gates fail closed without feature flag, database or login', () => {
  assert.throws(
    () => assertPaidFeatureAvailable({ paid: true, enabled: false, databaseConfigured: true, authenticated: true }),
    { code: 'PAID_FEATURES_DISABLED' }
  );
  assert.throws(
    () => assertPaidFeatureAvailable({ paid: true, enabled: true, databaseConfigured: false, authenticated: true }),
    { code: 'DATABASE_NOT_CONFIGURED' }
  );
  assert.throws(
    () => assertPaidFeatureAvailable({ paid: true, enabled: true, databaseConfigured: true, authenticated: false }),
    { code: 'LOGIN_REQUIRED' }
  );
  assert.equal(
    assertPaidFeatureAvailable({ paid: true, enabled: true, databaseConfigured: true, authenticated: true }),
    true
  );
  assert.equal(
    assertPaidFeatureAvailable({ paid: false, enabled: false, databaseConfigured: false, authenticated: false }),
    true
  );
});

test('free/local backend routes can boot without PostgreSQL or constructing a lease queue', () => {
  const registered = [];
  const app = {
    get: (path) => registered.push(['GET', path]),
    post: (path) => registered.push(['POST', path]),
    delete: (path) => registered.push(['DELETE', path])
  };
  assert.doesNotThrow(() => installToolTaskRoutes(app, {
    enableTaskQueue: false,
    enableHoldSweeper: false,
    enableAssetSweeper: false,
    env: {
      AI_DESIGN_TASK_V2_ENABLED: 'false'
    }
  }));
  assert.ok(registered.some(([method, path]) => method === 'GET' && path === '/api/tools/catalog'));
  assert.ok(registered.some(([method, path]) => method === 'POST' && path === '/api/tool-tasks'));
});

test('AI design storage gate honors APP_ENV production intent', async () => {
  const tool = getTool('ai-design');
  await assert.rejects(
    assertProductionAiDesignStorageReady({
      tool,
      operation: 'generate',
      env: { NODE_ENV: 'test', APP_ENV: 'production' },
      adapter: { driver: 'file', rootDir: os.tmpdir() }
    }),
    { code: 'SHARED_ASSET_STORAGE_REQUIRED' }
  );
  assert.equal(
    await assertProductionAiDesignStorageReady({
      tool,
      operation: 'generate',
      env: { NODE_ENV: 'test', APP_ENV: 'dev' },
      adapter: { driver: 'file', rootDir: os.tmpdir() }
    }),
    true
  );
});

test('task workers and financial sweepers require both paid features and the worker gate', () => {
  assert.equal(taskWorkersEnabled({ PAID_FEATURES_ENABLED: 'false' }), false);
  assert.equal(taskWorkersEnabled({
    PAID_FEATURES_ENABLED: 'true',
    TASK_WORKER_ENABLED: '0'
  }), false);
  assert.equal(taskWorkersEnabled({
    PAID_FEATURES_ENABLED: 'true',
    TASK_WORKER_ENABLED: '1'
  }), true);

  const app = {
    get() {},
    post() {},
    delete() {}
  };
  const forbiddenQueue = {
    register() {
      throw new Error('disabled worker must not register handlers');
    },
    start() {
      throw new Error('disabled worker must not start');
    }
  };
  assert.doesNotThrow(() => installToolTaskRoutes(app, {
    pool: {},
    taskQueue: forbiddenQueue,
    env: {
      PAID_FEATURES_ENABLED: 'false',
      TASK_WORKER_ENABLED: '1'
    }
  }));
  assert.doesNotThrow(() => installToolTaskRoutes(app, {
    pool: {},
    taskQueue: forbiddenQueue,
    env: {
      PAID_FEATURES_ENABLED: 'true',
      TASK_WORKER_ENABLED: '0'
    }
  }));
});

test('implemented server operations are registered while unavailable converters fail before billing', () => {
  assert.equal(assertServerTaskImplemented(getTool('old-photo'), 'enhance'), true);
  assert.equal(assertServerTaskImplemented(getTool('old-photo'), 'enhance-colorize'), true);
  assert.equal(assertServerTaskImplemented(getTool('id-photo'), 'professional-portrait'), true);
  assert.equal(assertServerTaskImplemented(getTool('background'), 'ai-scene'), true);
  assert.equal(
    assertServerTaskImplemented(getTool('ingredient-label'), 'ai-organize-source-text'),
    true
  );
  assert.throws(
    () => assertServerTaskImplemented(getTool('document-pdf'), 'word-server-faithful'),
    { code: 'TOOL_OPERATION_UNAVAILABLE', status: 503, retryable: false }
  );
});

test('legacy paid AI rejects blank and guest identities before wallet work', () => {
  assert.equal(isPaidAiUserId(''), false);
  assert.equal(isPaidAiUserId('guest_abc123'), false);
  assert.equal(isPaidAiUserId('user_abc123'), true);
});

test('legacy JSON finance and file query tokens are explicit development-only adapters', () => {
  assert.equal(canUseLegacyJsonBilling({
    isProd: true,
    env: { ENABLE_LEGACY_JSON_BILLING: '1' }
  }), false);
  assert.equal(canUseLegacyJsonBilling({
    env: { DATABASE_URL: 'postgresql://db', ENABLE_LEGACY_JSON_BILLING: '1' }
  }), false);
  assert.equal(canUseLegacyJsonBilling({
    env: { NODE_ENV: 'development', ENABLE_LEGACY_JSON_BILLING: '1' }
  }), true);
  assert.equal(paymentLegacyJsonBillingEnabled({
    DATABASE_URL: 'postgresql://db', ENABLE_LEGACY_JSON_BILLING: '1'
  }), false);
  assert.equal(canUseLegacyFileQueryToken({
    NODE_ENV: 'production', ALLOW_LEGACY_FILE_QUERY_TOKEN: '1'
  }), false);
  assert.equal(canUseLegacyFileQueryToken({
    DATABASE_URL: 'postgresql://db', ALLOW_LEGACY_FILE_QUERY_TOKEN: '1'
  }), false);
  assert.equal(canUseLegacyFileQueryToken({
    NODE_ENV: 'development', ALLOW_LEGACY_FILE_QUERY_TOKEN: '1'
  }), true);
});

test('payment reads fail closed and public shapes omit provider order identifiers', () => {
  assert.throws(
    () => assertPaymentsAvailable({ enabled: false, databaseConfigured: true }),
    { code: 'PAID_FEATURES_DISABLED' }
  );
  assert.throws(
    () => assertPaymentsAvailable({ enabled: true, databaseConfigured: false }),
    { code: 'DATABASE_NOT_CONFIGURED' }
  );
  const pkg = publicPackage({
    id: 'package-id', sku: 'credits.starter', title: 'Starter',
    amount_minor: 990, currency: 'CNY', credits: 400
  });
  assert.equal(pkg.amountMinor, 990);
  const order = publicOrder({
    id: 'order-id', package_id: 'package-id', package_sku: 'credits.starter',
    package_title: 'Starter', provider: 'afdian', provider_order_id: 'private-provider-id',
    expected_amount_minor: 990, currency: 'CNY', expected_credits: 400,
    status: 'pending', created_at: 'now', updated_at: 'now'
  });
  assert.equal(order.orderId, 'order-id');
  assert.equal('providerOrderId' in order, false);
});

test('wallet reads remain available while checkout is independently disabled', () => {
  assert.equal(
    assertCreditFeaturesAvailable({ enabled: true, databaseConfigured: true }),
    true
  );
  assert.throws(
    () => assertPaymentsAvailable({ enabled: false, databaseConfigured: true }),
    { code: 'PAID_FEATURES_DISABLED' }
  );
});

test('task fields reject all client-owned price and SKU authority', () => {
  assert.equal(containsClientAuthority({ options: { rendering: { cost: 0 } } }), true);
  assert.throws(
    () => validateTaskFields({
      toolId: 'old-photo',
      operation: 'enhance',
      options: JSON.stringify({ nested: { credits: 0 } })
    }),
    { code: 'CLIENT_PRICE_NOT_ALLOWED' }
  );
});

test('ingredient task route stores only source metadata outside the encrypted payload', () => {
  const sourceText = 'Water, Glycerin, Sodium Hyaluronate';
  const stored = buildStoredTaskOptions({
    tool: getTool('ingredient-label'),
    operation: 'ai-organize-source-text',
    normalizedOptions: {
      sourceText,
      productType: 'Cosmetic',
      locale: 'en'
    }
  });
  assert.deepEqual(stored, {
    productType: 'Cosmetic',
    locale: 'en',
    sourceLength: sourceText.length,
    sourceSha256: require('node:crypto').createHash('sha256').update(sourceText).digest('hex')
  });
  assert.equal(JSON.stringify(stored).includes(sourceText), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'sourceText'), false);
});

test('OTP values are HMACed by target and purpose and production lacks no secret fallback', () => {
  const env = { NODE_ENV: 'production', OTP_HMAC_SECRET: 'test-secret-at-least-local' };
  const input = { target: 'User@Example.com', purpose: 'login', code: '123456' };
  const digest = hashOtpCode(input, env);
  assert.equal(digest.includes('123456'), false);
  assert.equal(verifyOtpCode(input, digest, env), true);
  assert.equal(verifyOtpCode({ ...input, code: '123457' }, digest, env), false);
  assert.equal(verifyOtpCode({ ...input, purpose: 'password-reset' }, digest, env), false);
  assert.throws(
    () => getOtpHmacSecret({ NODE_ENV: 'production' }),
    { code: 'OTP_HMAC_NOT_CONFIGURED' }
  );
});

test('password hashing uses asynchronous scrypt and legacy passwords upgrade', async () => {
  const salt = '00112233445566778899aabbccddeeff';
  const passwordHash = await hashPassword('StrongPassword123', salt);
  assert.equal(typeof passwordHash, 'string');
  assert.equal((await verifyPassword({ passwordAlgo: 'scrypt', passwordSalt: salt, passwordHash }, 'StrongPassword123')).ok, true);
  assert.equal((await verifyPassword({ passwordAlgo: 'scrypt', passwordSalt: salt, passwordHash }, 'wrong')).ok, false);
  assert.deepEqual(await verifyPassword({ password: 'LegacyPassword123' }, 'LegacyPassword123'), {
    ok: true,
    upgraded: true
  });
});

test('CSRF tokens are session-bound and compared in constant time', () => {
  const env = { NODE_ENV: 'production', CSRF_SECRET: 'csrf-test-secret' };
  const token = deriveCsrfToken('session-a', env);
  assert.ok(token.length >= 32);
  assert.equal(token, deriveCsrfToken('session-a', env));
  assert.notEqual(token, deriveCsrfToken('session-b', env));
  assert.equal(timingSafeTextEqual(token, deriveCsrfToken('session-a', env)), true);
  assert.equal(timingSafeTextEqual(token, 'bad'), false);
  assert.equal(deriveCsrfToken('session-a', { NODE_ENV: 'production' }), '');
});

test('session-not-before accepts ISO and Unix values and invalidates old sessions', () => {
  const iso = '2026-07-15T00:00:00.000Z';
  const cutoff = Date.parse(iso);
  assert.equal(parseSessionNotBefore({ SESSION_NOT_BEFORE: iso }), cutoff);
  assert.equal(parseSessionNotBefore({ SESSION_NOT_BEFORE: String(Math.floor(cutoff / 1000)) }), cutoff);
  assert.equal(parseSessionNotBefore({ SESSION_NOT_BEFORE: String(cutoff) }), cutoff);
  assert.equal(parseSessionNotBefore({ SESSION_NOT_BEFORE: 'invalid-date' }), Number.MAX_SAFE_INTEGER);
  assert.equal(
    isSessionCurrent({ sessionTokenIssuedAt: cutoff - 1 }, { SESSION_NOT_BEFORE: iso }),
    false
  );
  assert.equal(
    isSessionCurrent({ sessionTokenIssuedAt: cutoff }, { SESSION_NOT_BEFORE: iso }),
    true
  );
  assert.equal(isSessionCurrent({}, { SESSION_NOT_BEFORE: iso }), false);
});

test('CSRF middleware origin-checks guests, protects cookie writes and exempts only non-ambient auth', () => {
  const env = {
    NODE_ENV: 'production',
    CSRF_SECRET: 'csrf-test-secret',
    APP_ORIGIN: 'https://artigen.example'
  };
  const middleware = csrfProtection({ env });
  let nextCalls = 0;
  const makeRes = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });

  const anonymousWithoutOrigin = makeRes();
  middleware(
    { method: 'POST', path: '/api/tool-tasks', headers: {} },
    anonymousWithoutOrigin,
    () => { nextCalls += 1; }
  );
  assert.equal(nextCalls, 0);
  assert.equal(anonymousWithoutOrigin.statusCode, 403);
  assert.equal(anonymousWithoutOrigin.body.error.code, 'ORIGIN_REQUIRED');

  middleware(
    {
      method: 'POST',
      path: '/api/tools/convert',
      protocol: 'https',
      headers: { host: 'artigen.example', origin: 'https://artigen.example' }
    },
    makeRes(),
    () => { nextCalls += 1; }
  );
  assert.equal(nextCalls, 1);

  const protectedRes = makeRes();
  middleware(
    {
      method: 'POST',
      path: '/api/tool-tasks',
      protocol: 'https',
      headers: {
        host: 'artigen.example',
        origin: 'https://artigen.example',
        cookie: 'auth_token=session-a'
      }
    },
    protectedRes,
    () => { nextCalls += 1; }
  );
  assert.equal(protectedRes.statusCode, 403);
  assert.equal(protectedRes.body.error.code, 'CSRF_INVALID');

  middleware(
    {
      method: 'POST',
      path: '/api/tool-tasks',
      protocol: 'https',
      headers: {
        host: 'artigen.example',
        origin: 'https://artigen.example',
        cookie: 'auth_token=session-a',
        'x-csrf-token': deriveCsrfToken('session-a', env)
      }
    },
    makeRes(),
    () => { nextCalls += 1; }
  );
  assert.equal(nextCalls, 2);

  const publicRes = makeRes();
  middleware(
    {
      method: 'POST',
      path: '/api/auth/login',
      protocol: 'https',
      headers: { host: 'artigen.example', origin: 'https://evil.example' }
    },
    publicRes,
    () => { nextCalls += 1; }
  );
  assert.equal(publicRes.statusCode, 403);
  assert.equal(publicRes.body.error.code, 'ORIGIN_FORBIDDEN');
});
