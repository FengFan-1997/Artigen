const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-privacy-'));
process.env.MEMORY_DIR = memoryDir;
process.env.NODE_ENV = 'test';

const {
  ANALYTICS_EVENTS_FILE,
  ensureDir,
  getUserMemoryFile,
  readJson,
  readUserMemory,
  writeJson,
  writeUserMemory
} = (() => {
  const storage = require('../utils/storage');
  return { ...storage, ensureDir: () => fs.mkdirSync(memoryDir, { recursive: true }) };
})();
const { ensureUserMemoryShape } = require('../lib/memory-utils');
const {
  appendUserAuditHistory,
  appendUserImageHistory
} = require('../lib/memory-manager');
const {
  classifyModel,
  sanitizeAuditHistoryEntry,
  sanitizeImageHistoryEntry
} = require('../lib/privacy-metadata');
const { createLedger } = require('../lib/usageLedger');
const { installImgagentRoutes } = require('../imgagent');
const { installAdminRoutes } = require('../routes/admin');
const { createAdminToken } = require('../lib/auth-utils');

test.after(() => {
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

const PRIVATE = {
  prompt: 'draw my private family standing beside account password hunter2',
  negativePrompt: 'private-negative-prompt',
  userText: 'my legal name and private request',
  output: 'private model response',
  pageContext: 'https://app.example/editor?image=https://cdn.example/private.png&token=bearer-secret',
  imageUrl: 'https://cdn.example/private-family-photo.png?signature=signed-secret',
  inputUrl: '/files/user/private-original.jpg',
  filename: 'private-family-photo.png',
  token: 'bearer-secret'
};

const assertNoPrivateContent = (value) => {
  const serialized = JSON.stringify(value);
  for (const secret of Object.values(PRIVATE)) {
    assert.equal(serialized.includes(secret), false, `leaked: ${secret}`);
  }
  for (const fragment of ['cdn.example', 'hunter2', 'signed-secret', 'private-family-photo.png']) {
    assert.equal(serialized.includes(fragment), false, `leaked fragment: ${fragment}`);
  }
};

const rawImageEntry = () => ({
  id: 'request-with-private-filename.png',
  ts: 1_700_000_000_000,
  type: 'img2img',
  status: 'success',
  provider: 'siliconflow',
  model: 'secret-model-name',
  prompt: PRIVATE.prompt,
  negativePrompt: PRIVATE.negativePrompt,
  userText: PRIVATE.userText,
  aiText: PRIVATE.output,
  pageContext: PRIVATE.pageContext,
  filename: PRIVATE.filename,
  token: PRIVATE.token,
  images: [{ url: PRIVATE.imageUrl, persisted: true }],
  inputImages: [{ url: PRIVATE.inputUrl, persisted: true }],
  params: { width: 1024, height: 768, privateText: PRIVATE.userText },
  ip: '203.0.113.9',
  ua: 'Mozilla/5.0 (iPhone) private-file.png'
});

const rawAuditEntry = () => ({
  ...rawImageEntry(),
  kind: 'image',
  biz: 'img2img',
  initialInput: PRIVATE.userText,
  input: { prompt: PRIVATE.prompt, password: 'hunter2' },
  sessionId: 'bearer-session-token',
  projectId: PRIVATE.filename,
  requestSource: 'site_analytics',
  usedUrl: PRIVATE.imageUrl
});

test('history metadata sanitizers are content-free and idempotent', () => {
  const image = sanitizeImageHistoryEntry(rawImageEntry());
  const audit = sanitizeAuditHistoryEntry(rawAuditEntry());

  assert.equal(image.promptLen, PRIVATE.prompt.length);
  assert.match(image.promptHash, /^[0-9a-f]{64}$/);
  assert.equal(image.outputAssetCount, 1);
  assert.equal(image.inputAssetCount, 1);
  assert.match(image.outputAssetIds[0], /^asset_[0-9a-f]{24}$/);
  assert.equal(audit.deviceCategory, 'mobile');
  assert.match(audit.ipHash, /^[0-9a-f]{64}$/);
  assert.match(audit.sessionRef, /^session_[0-9a-f]{24}$/);
  assertNoPrivateContent({ image, audit });

  assert.deepEqual(sanitizeImageHistoryEntry(image), image);
  assert.deepEqual(sanitizeAuditHistoryEntry(audit), audit);
});

test('privacy metadata keeps the Cloudflare GPT-OSS model family observable', () => {
  assert.equal(classifyModel('@cf/openai/gpt-oss-120b'), 'gpt-oss');
});

test('memory history append sanitizes both the new entry and legacy entries before persistence', () => {
  const userId = 'privacy_append_user';
  ensureDir();
  writeUserMemory(userId, ensureUserMemoryShape(userId, {
    image_history: [rawImageEntry()],
    audit_history: [rawAuditEntry()]
  }));

  assert.equal(appendUserImageHistory({ userId, entry: rawImageEntry() }), true);
  assert.equal(appendUserAuditHistory({ userId, entry: rawAuditEntry() }), true);

  const stored = readUserMemory(userId, {});
  assert.equal(stored.image_history.length, 2);
  assert.equal(stored.audit_history.length, 2);
  assertNoPrivateContent(stored);
  assert.equal('prompt' in stored.image_history[0], false);
  assert.equal('images' in stored.image_history[0], false);
  assert.equal('pageContext' in stored.audit_history[0], false);
  assert.equal('userText' in stored.audit_history[0], false);
});

const makeApp = () => {
  const routes = new Map();
  const add = (method) => (routePath, ...handlers) => {
    routes.set(`${method} ${routePath}`, handlers[handlers.length - 1]);
  };
  return {
    app: {
      use() {},
      get: add('GET'),
      post: add('POST'),
      delete: add('DELETE')
    },
    routes
  };
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return body;
  }
});

test('user and admin history routes redact legacy raw records on read', async () => {
  const userId = 'privacy_route_user';
  writeUserMemory(userId, ensureUserMemoryShape(userId, {
    image_history: [rawImageEntry()],
    audit_history: [rawAuditEntry()]
  }));
  writeJson(ANALYTICS_EVENTS_FILE, {
    v: 1,
    items: [{
      id: 'private-event-id',
      ts: 1_700_000_000_100,
      eventType: 'ui_click',
      userId,
      payload: {
        prompt: PRIVATE.prompt,
        fileName: PRIVATE.filename,
        imageUrl: PRIVATE.imageUrl,
        token: PRIVATE.token,
        toolId: 'image-batch'
      },
      path: `/editor?image=${encodeURIComponent(PRIVATE.imageUrl)}&token=${PRIVATE.token}&tool=crop`,
      ip: '203.0.113.9',
      ua: 'Mozilla/5.0 (iPhone)'
    }]
  });

  const userApp = makeApp();
  installImgagentRoutes(userApp.app, {
    assertAuthUserMatches: () => true,
    readUserMemory,
    writeUserMemory,
    ensureUserMemoryShape,
    isProd: false
  });
  const userRes = makeResponse();
  await userApp.routes.get('GET /api/images/history/:userId')({
    params: { userId }, query: { limit: '20', offset: '0' }, headers: {}
  }, userRes);
  assert.equal(userRes.statusCode, 200);
  assertNoPrivateContent(userRes.body);
  assert.equal(userRes.body.items[0].outputAssetCount, 1);
  assertNoPrivateContent(readUserMemory(userId, {}));

  const adminApp = makeApp();
  installAdminRoutes(adminApp.app, {
    usesOperationalRecordStore: () => false
  });
  const token = createAdminToken('privacy-test').token;
  const adminHeaders = { authorization: `Bearer ${token}` };
  for (const [routePath, query] of [
    ['/api/admin/images/history', { userId, limit: '20', offset: '0' }],
    ['/api/admin/audit/history', { userId, limit: '20', offset: '0' }],
    ['/api/admin/events', { limit: '20', offset: '0' }]
  ]) {
    if (routePath.includes('/history')) {
      writeUserMemory(userId, ensureUserMemoryShape(userId, {
        image_history: [rawImageEntry()],
        audit_history: [rawAuditEntry()]
      }));
    }
    const res = makeResponse();
    await adminApp.routes.get(`GET ${routePath}`)({ headers: adminHeaders, query }, res);
    assert.equal(res.statusCode, 200, routePath);
    assertNoPrivateContent(res.body);
    if (routePath.includes('/history')) assertNoPrivateContent(readUserMemory(userId, {}));
  }
  assertNoPrivateContent(readJson(ANALYTICS_EVENTS_FILE, {}));

  fs.rmSync(getUserMemoryFile(userId), { force: true });
});

test('usage ledger persists hashes and categories instead of raw plan, URLs or client environment', () => {
  let usageStore = { v: 1, items: [] };
  const ledger = createLedger({
    readJson: () => usageStore,
    writeJson: (_file, value) => { usageStore = value; },
    USAGE_LEDGER_FILE: 'usage.json',
    ANALYTICS_EVENTS_FILE: 'events.json',
    getClientIp: () => '203.0.113.9'
  });

  const result = ledger.upsertUsageLedgerItem({
    requestId: 'request-private-file.png',
    ts: 1_700_000_000_200,
    userId: 'known-user-id',
    trigger: 'img2img',
    provider: 'siliconflow',
    model: 'private-model-token',
    usedUrl: PRIVATE.imageUrl,
    plan: { userText: PRIVATE.userText, initialInput: PRIVATE.prompt, filename: PRIVATE.filename },
    sessionId: PRIVATE.token,
    projectId: PRIVATE.filename,
    requestSource: 'site_analytics',
    ip: '203.0.113.9',
    ua: 'Mozilla/5.0 (iPhone) private-file.png',
    creditsDelta: 4,
    tokensIn: 20,
    tokensOut: 30,
    status: 'ok'
  });

  assert.equal(result.ok, true);
  assert.match(result.item.requestId, /^request_[0-9a-f]{24}$/);
  assert.equal(result.item.model, 'other');
  assert.match(result.item.planHash, /^[0-9a-f]{64}$/);
  assert.match(result.item.endpointRef, /^endpoint_[0-9a-f]{24}$/);
  assertNoPrivateContent({ result, usageStore, read: ledger.readUsageLedgerStore() });
});
