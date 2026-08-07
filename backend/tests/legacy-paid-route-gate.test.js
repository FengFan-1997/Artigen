const assert = require('node:assert/strict');
const test = require('node:test');

const { installImgagentRoutes } = require('../imgagent');
const { installSystemRoutes } = require('../routes/system');

const createRouteHarness = () => {
  const routes = new Map();
  const register = (method) => (path, ...handlers) => {
    const paths = Array.isArray(path) ? path : [path];
    for (const item of paths) routes.set(`${method} ${item}`, handlers.at(-1));
  };
  return {
    app: {
      get: register('GET'),
      post: register('POST'),
      delete: register('DELETE')
    },
    routes
  };
};

const createResponse = () => ({
  locals: { requestId: 'server-request-id' },
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  }
});

test('production generate fails before provider or JSON wallet access', async () => {
  const { app, routes } = createRouteHarness();
  let providerCalls = 0;
  installSystemRoutes(app, {
    NODE_ENV: 'production',
    isProd: true,
    rateLimit: () => (_req, _res, next) => next(),
    assertAuthUserMatches: () => true,
    callTextGenerate: async () => {
      providerCalls += 1;
      return { text: 'unexpected' };
    },
    imgCredits: {
      freezeCredits() {
        throw new Error('JSON_WALLET_MUST_NOT_BE_TOUCHED');
      }
    },
    fs: require('fs'),
    path: require('path')
  });
  const handler = routes.get('POST /api/generate');
  const res = createResponse();
  await handler({
    body: {
      requestId: 'request-12345678',
      prompt: 'test prompt',
      userId: 'user_test',
      purpose: 'generate',
      cost: 0
    }
  }, res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.payload.error, 'LEGACY_BILLING_DISABLED');
  assert.equal(providerCalls, 0);
});

test('production img2img fails before provider or JSON wallet access', async () => {
  const { app, routes } = createRouteHarness();
  let providerCalls = 0;
  installImgagentRoutes(app, {
    isProd: true,
    rateLimit: () => (_req, _res, next) => next(),
    assertAuthUserMatches: () => true,
    callSiliconFlowImageGenerate: async () => {
      providerCalls += 1;
      return { data: { images: [] } };
    },
    imgCredits: {
      freezeCredits() {
        throw new Error('JSON_WALLET_MUST_NOT_BE_TOUCHED');
      }
    }
  });
  const handler = routes.get('POST /api/img2img');
  const res = createResponse();
  await handler({
    body: {
      requestId: 'request-12345678',
      prompt: 'test prompt',
      userId: 'user_test',
      reason: 'ai_background',
      cost: 0
    }
  }, res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.payload.error, 'LEGACY_BILLING_DISABLED');
  assert.equal(providerCalls, 0);
});
