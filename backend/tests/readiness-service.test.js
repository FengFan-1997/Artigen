const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { Readable } = require('stream');

const {
  LATEST_REPOSITORY_MIGRATION,
  checkAfdian,
  checkAuthSecrets,
  checkBrevo,
  checkMailProvider,
  checkMailRelay,
  checkDatabase,
  checkGenerationProvider,
  probeGenerationProvider,
  checkOutputAllowlist,
  checkStorage,
  checkTurnstile,
  getReadinessReport
} = require('../services/readiness-service');
const billing = require('../services/billing-service');
const { installSystemRoutes } = require('../routes/system');
const { installToolTaskRoutes } = require('../routes/tool-tasks');

const migratedRow = Object.freeze({
  has_tasks: true,
  has_payloads: true,
  has_events: true,
  has_behavior_events: true,
  has_operational_records: true,
  has_creative_projects: true,
  has_project_payloads: true,
  has_project_asset_links: true,
  has_project_versions: true,
  has_assets: true,
  has_upload_sessions: true,
  has_otp_delivery_attempts: true,
  has_agent_runs: true,
  has_agent_payloads: true,
  has_agent_model_checkpoints: true,
  has_agent_events: true,
  has_agent_artifacts: true,
  has_agent_budget_holds: true,
  has_agent_trial_usage: true,
  has_agent_worker_heartbeats: true,
  has_agent_desktop_tickets: true,
  has_latest_migration: true,
  has_task_columns: true,
  has_payload_columns: true,
  has_asset_columns: true,
  has_upload_session_columns: true,
  has_event_columns: true,
  has_behavior_columns: true,
  has_operational_columns: true,
  has_project_columns: true,
  has_project_payload_columns: true,
  has_project_version_columns: true,
  has_otp_delivery_columns: true,
  has_agent_run_columns: true,
  has_agent_relay_run_columns: true,
  has_agent_worker_readiness_columns: true,
  has_agent_budget_split_columns: true,
  has_ai_skus: true,
  has_workshop_skus: true
});

const migratedPool = {
  query: async () => ({ rows: [{ ...migratedRow }] })
};

const provider = (kind = 'siliconflow') => ({
  kind,
  available: true,
  generateDirections: async () => [],
  generateImage: async () => ({}),
  organizeIngredientSource: async () => ({}),
  checkAvailability: async () => ({ ok: true, kind, profile: 'standard-v1' })
});

const sharedAdapter = () => ({
  driver: 's3',
  bucket: 'test-assets',
  commands: {
    HeadBucketCommand: class HeadBucketCommand {
      constructor(input) { this.input = input; }
    }
  },
  client: { send: async () => ({}) },
  open: async () => ({}),
  putBuffer: async () => ({}),
  putFile: async () => ({}),
  delete: async () => {}
});

const baseGenerationEnv = Object.freeze({
  PAID_FEATURES_ENABLED: '1',
  AI_DESIGN_TASK_V2_ENABLED: '1',
  TASK_PAYLOAD_ENCRYPTION_KEY: '12345678901234567890123456789012',
  AFDIAN_API_USER_ID: 'creator_1234567890abcdef',
  AFDIAN_API_TOKEN: 'afdian_7Qm2Vx9Lp4Zr8Kc5Nw1Hs6',
  AFDIAN_ORDER_CREATE_URL: 'https://afdian.com/order/create',
  AFDIAN_WEBHOOK_REQUIRE_SIGN: '0',
  AFDIAN_PACKAGE_PLAN_ID_MAP: JSON.stringify({
    starter: '11111111111111111111111111111111',
    standard: '22222222222222222222222222222222',
    pro: '33333333333333333333333333333333',
    ultimate: '44444444444444444444444444444444'
  })
});

const routeApp = () => {
  const routes = new Map();
  const register = (method) => (routePath, ...handlers) => {
    routes.set(`${method} ${routePath}`, handlers.at(-1));
  };
  return {
    routes,
    app: {
      get: register('GET'),
      post: register('POST'),
      delete: register('DELETE')
    }
  };
};

const routeResponse = () => ({
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

const multipartRequest = ({ fields, authResolution, idempotencyKey }) => {
  const boundary = '----artigen-storage-readiness-test';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
    );
  }
  chunks.push(`--${boundary}--\r\n`);
  const body = Buffer.from(chunks.join(''), 'utf8');
  const req = Readable.from([body]);
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length),
    'idempotency-key': idempotencyKey
  };
  req.authResolution = authResolution;
  req.aborted = false;
  return req;
};

test('readiness verifies queue, payload, asset, event, inputs_ready and AI SKU migration shape', async () => {
  let migrationQueryParam = '';
  assert.deepEqual(await checkDatabase({
    query: async (_sql, params) => {
      migrationQueryParam = params?.[0] || '';
      return { rows: [{ ...migratedRow }] };
    }
  }), {
    ok: true,
    code: null,
    migration: LATEST_REPOSITORY_MIGRATION
  });
  assert.equal(LATEST_REPOSITORY_MIGRATION, '020_agent_secure_browser_relay');
  assert.equal(migrationQueryParam, LATEST_REPOSITORY_MIGRATION);
  assert.deepEqual(await checkDatabase({
    query: async () => ({ rows: [{ ...migratedRow, has_task_columns: false }] })
  }), {
    ok: false,
    code: 'DATABASE_MIGRATION_REQUIRED',
    expectedMigration: LATEST_REPOSITORY_MIGRATION
  });
  assert.deepEqual(await checkDatabase({
    query: async () => ({
      rows: [{
        ...migratedRow,
        has_behavior_events: false,
        has_behavior_columns: false
      }]
    })
  }), {
    ok: false,
    code: 'DATABASE_MIGRATION_REQUIRED',
    expectedMigration: LATEST_REPOSITORY_MIGRATION
  });
  assert.deepEqual(await checkDatabase({
    query: async () => ({
      rows: [{
        ...migratedRow,
        has_operational_records: false,
        has_operational_columns: false
      }]
    })
  }), {
    ok: false,
    code: 'DATABASE_MIGRATION_REQUIRED',
    expectedMigration: LATEST_REPOSITORY_MIGRATION
  });
  assert.deepEqual(await checkDatabase({
    query: async () => ({
      rows: [{
        ...migratedRow,
        has_otp_delivery_attempts: false,
        has_otp_delivery_columns: false
      }]
    })
  }), {
    ok: false,
    code: 'DATABASE_MIGRATION_REQUIRED',
    expectedMigration: LATEST_REPOSITORY_MIGRATION
  });
  assert.deepEqual(await checkDatabase({
    query: async () => ({
      rows: [{
        ...migratedRow,
        has_latest_migration: false
      }]
    })
  }), {
    ok: false,
    code: 'DATABASE_MIGRATION_REQUIRED',
    expectedMigration: LATEST_REPOSITORY_MIGRATION
  });
  assert.deepEqual(await checkDatabase({
    query: async () => ({ rows: [{ ...migratedRow, has_ai_skus: false }] })
  }), { ok: false, code: 'AI_DESIGN_SKU_NOT_READY' });
  assert.deepEqual(await checkDatabase({
    query: async () => ({ rows: [{ ...migratedRow, has_workshop_skus: false }] })
  }), { ok: false, code: 'WORKSHOP_AI_SKU_NOT_READY' });
  assert.deepEqual(await checkDatabase({
    query: async () => {
      const error = new Error('missing table');
      error.code = '42P01';
      throw error;
    }
  }), {
    ok: false,
    code: 'DATABASE_MIGRATION_REQUIRED',
    expectedMigration: LATEST_REPOSITORY_MIGRATION
  });
  assert.deepEqual(await checkDatabase({
    query: async () => { throw new Error('offline'); }
  }), { ok: false, code: 'DATABASE_UNAVAILABLE' });
});

test('provider readiness validates a callable adapter and stable internal profile', () => {
  assert.equal(checkGenerationProvider({
    provider: provider('contract-mock'),
    env: { NODE_ENV: 'test' }
  }).ok, true);
  assert.deepEqual(checkGenerationProvider({
    provider: provider('contract-mock'),
    env: { NODE_ENV: 'production' }
  }), { ok: false, code: 'MODEL_PROFILE_UNAVAILABLE' });
  assert.deepEqual(checkGenerationProvider({
    provider: { kind: 'siliconflow', available: true },
    env: { NODE_ENV: 'production' }
  }), { ok: false, code: 'MODEL_PROFILE_UNAVAILABLE' });
});

test('production readiness fails closed for revoked provider credentials', async () => {
  const invalid = provider('siliconflow');
  invalid.checkAvailability = async () => ({
    ok: false,
    code: 'PROVIDER_CREDENTIAL_INVALID'
  });
  assert.deepEqual(await probeGenerationProvider({
    provider: invalid,
    env: { NODE_ENV: 'production' }
  }), { ok: false, code: 'PROVIDER_CREDENTIAL_INVALID' });
  assert.deepEqual(await probeGenerationProvider({
    provider: {
      kind: 'siliconflow',
      available: true,
      generateDirections: async () => [],
      generateImage: async () => ({}),
      organizeIngredientSource: async () => ({})
    },
    env: { NODE_ENV: 'production' }
  }), { ok: false, code: 'PROVIDER_HEALTHCHECK_UNAVAILABLE' });
});

test('production output allowlist requires valid public DNS hostnames', () => {
  assert.deepEqual(checkOutputAllowlist({ NODE_ENV: 'production' }), {
    ok: false,
    code: 'AI_OUTPUT_ALLOWLIST_REQUIRED',
    hostCount: 0
  });
  assert.deepEqual(checkOutputAllowlist({
    NODE_ENV: 'production',
    AI_OUTPUT_ALLOWED_HOSTS: 'cdn.example.com,localhost'
  }), {
    ok: false,
    code: 'AI_OUTPUT_ALLOWLIST_INVALID',
    hostCount: 1
  });
  assert.deepEqual(checkOutputAllowlist({
    NODE_ENV: 'production',
    AI_OUTPUT_ALLOWED_HOSTS: '*.cdn.example.com,images.example.org'
  }), { ok: true, required: true, hostCount: 2 });
});

test('paid readiness requires provider-verified Afdian reconciliation configuration', () => {
  assert.deepEqual(checkAfdian({ ...baseGenerationEnv, NODE_ENV: 'production' }), {
    ok: true,
    provider: 'afdian',
    packageCount: 4,
    webhookVerification: 'provider-query'
  });
  assert.equal(checkAfdian({
    ...baseGenerationEnv,
    AFDIAN_API_TOKEN: ''
  }).code, 'AFDIAN_API_TOKEN_MISSING');
  assert.equal(checkAfdian({
    ...baseGenerationEnv,
    AFDIAN_PACKAGE_PLAN_ID_MAP: JSON.stringify({ starter: '1'.repeat(32) })
  }).code, 'AFDIAN_PACKAGE_MAP_INVALID');
  assert.equal(checkAfdian({
    ...baseGenerationEnv,
    NODE_ENV: 'production',
    AFDIAN_QUERY_ORDER_URL: 'https://attacker.example/query-order'
  }).code, 'AFDIAN_QUERY_URL_INVALID');
  assert.equal(checkAfdian({
    ...baseGenerationEnv,
    AFDIAN_WEBHOOK_REQUIRE_SIGN: '1',
    AFDIAN_WEBHOOK_PUBLIC_KEY: ''
  }).code, 'AFDIAN_WEBHOOK_PUBLIC_KEY_INVALID');
});

test('paid generation can be enabled while payment checkout remains explicitly disabled', async () => {
  const report = await getReadinessReport({
    env: {
      ...baseGenerationEnv,
      NODE_ENV: 'test',
      PAYMENTS_ENABLED: 'false',
      AFDIAN_API_USER_ID: '',
      AFDIAN_API_TOKEN: ''
    },
    pool: migratedPool,
    adapter: { driver: 'file', rootDir: process.cwd() },
    generationProvider: provider('contract-mock')
  });
  assert.equal(report.ok, true);
  assert.equal(report.paidEnabled, true);
  assert.equal(report.paymentEnabled, false);
  assert.equal(report.checks.payment.skipped, true);
  assert.equal(report.checks.provider.ok, true);
});

test('production generation refuses process-local file storage', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-ready-'));
  try {
    assert.deepEqual(await checkStorage({ driver: 'file', rootDir }, { requireShared: true }), {
      ok: false,
      driver: 'file',
      code: 'SHARED_ASSET_STORAGE_REQUIRED'
    });
    assert.deepEqual(await checkStorage(sharedAdapter(), { requireShared: true }), {
      ok: true,
      driver: 's3',
      shared: true
    });
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('paid ai generation fails readiness closed without payload key and provider', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-ready-'));
  const report = await getReadinessReport({
    env: {
      PAID_FEATURES_ENABLED: 'true',
      AI_DESIGN_TASK_V2_ENABLED: 'true',
      TASK_PAYLOAD_ENCRYPTION_KEY: '',
      NODE_ENV: 'test'
    },
    pool: migratedPool,
    adapter: { driver: 'file', rootDir },
    generationProvider: { kind: 'siliconflow', available: false }
  });
  assert.equal(report.ok, false);
  assert.equal(report.checks.payload.code, 'TASK_PAYLOAD_KEY_MISSING');
  assert.equal(report.checks.provider.code, 'MODEL_PROFILE_UNAVAILABLE');
  await fs.promises.rm(rootDir, { recursive: true, force: true });
});

test('paid workshop AI alone requires its payload key and complete provider adapter', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-ready-workshop-'));
  try {
    const report = await getReadinessReport({
      env: {
        PAID_FEATURES_ENABLED: 'true',
        AI_DESIGN_TASK_V2_ENABLED: 'false',
        WORKSHOP_AI_TASK_V2_ENABLED: 'true',
        TASK_PAYLOAD_ENCRYPTION_KEY: '',
        NODE_ENV: 'test'
      },
      pool: migratedPool,
      adapter: { driver: 'file', rootDir },
      generationProvider: {
        kind: 'siliconflow',
        available: true,
        generateImage: async () => ({})
      }
    });
    assert.equal(report.ok, false);
    assert.equal(report.workshopAiEnabled, true);
    assert.equal(report.generationRequired, true);
    assert.equal(report.checks.payload.code, 'TASK_PAYLOAD_KEY_MISSING');
    assert.equal(report.checks.provider.code, 'MODEL_PROFILE_UNAVAILABLE');
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('development contract mock is ready with file storage and no output allowlist', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-ready-'));
  const report = await getReadinessReport({
    env: { ...baseGenerationEnv, NODE_ENV: 'test' },
    pool: migratedPool,
    adapter: { driver: 'file', rootDir },
    generationProvider: provider('contract-mock')
  });
  assert.equal(report.ok, true);
  assert.equal(report.checks.storage.shared, false);
  assert.equal(report.checks.provider.kind, 'contract-mock');
  assert.equal(report.checks.outputAllowlist.required, false);
  await fs.promises.rm(rootDir, { recursive: true, force: true });
});

test('production paid generation is ready only with real provider, shared storage and allowlist', async () => {
  const report = await getReadinessReport({
    env: {
      ...baseGenerationEnv,
      NODE_ENV: 'production',
      AI_OUTPUT_ALLOWED_HOSTS: 'cdn.example.com'
    },
    pool: migratedPool,
    adapter: sharedAdapter(),
    generationProvider: provider('siliconflow')
  });
  assert.equal(report.ok, true);
  assert.equal(report.checks.database.ok, true);
  assert.equal(report.checks.storage.shared, true);
  assert.equal(report.checks.payload.ok, true);
  assert.equal(report.checks.provider.profile, 'standard-v1');
  assert.equal(report.checks.outputAllowlist.ok, true);
});

test('production Agent readiness requires the owner-only Beta gate', async () => {
  const base = {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    AGENT_FEATURE_ENABLED: '1',
    AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}`,
    AGENT_MODEL_PROVIDER: 'siliconflow',
    SILICONFLOW_API_KEY: 'test-key',
    AGENT_SANDBOX_PROVIDER: 'cua',
    AGENT_SANDBOX_MODE: 'local',
    AGENT_CUA_IMAGE_REF: 'artigen/cua-xfce:0.1.15-tools-v2',
    AGENT_CUA_IMAGE_HAS_TOOLCHAIN: 'true',
    AGENT_PUBLIC_CAPABILITIES: 'files,shell'
  };
  const denied = await getReadinessReport({
    env: base,
    pool: migratedPool,
    adapter: sharedAdapter(),
    generationProvider: provider('siliconflow')
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.checks.agent.code, 'AGENT_RUNTIME_NOT_CONFIGURED');
  assert.deepEqual(denied.checks.agent.missing, [
    'AGENT_BETA_MODE',
    'AGENT_BETA_USER_IDS'
  ]);

  const ready = await getReadinessReport({
    env: {
      ...base,
      AGENT_BETA_MODE: 'owner-only-v1',
      AGENT_BETA_USER_IDS: '11111111-1111-4111-8111-111111111111'
    },
    pool: migratedPool,
    adapter: sharedAdapter(),
    generationProvider: provider('siliconflow')
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.agent.betaMode, 'owner-only-v1');
});

test('production Agent image generation requires the real image provider and output allowlist', async () => {
  const report = await getReadinessReport({
    env: {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      AGENT_FEATURE_ENABLED: '1',
      AGENT_PAYLOAD_ENCRYPTION_KEY: `hex:${'42'.repeat(32)}`,
      AGENT_MODEL_PROVIDER: 'siliconflow',
      SILICONFLOW_API_KEY: 'test-key',
      AGENT_SANDBOX_PROVIDER: 'cua',
      AGENT_SANDBOX_MODE: 'local',
      AGENT_CUA_IMAGE_REF: 'artigen/cua-xfce:0.1.15-tools-v2',
      AGENT_CUA_IMAGE_HAS_TOOLCHAIN: 'true',
      AGENT_PUBLIC_CAPABILITIES: 'files,shell,generate_images',
      AGENT_BETA_MODE: 'owner-only-v1',
      AGENT_BETA_USER_IDS: '11111111-1111-4111-8111-111111111111',
      AI_OUTPUT_ALLOWED_HOSTS: 'cdn.example.com'
    },
    pool: migratedPool,
    adapter: sharedAdapter(),
    generationProvider: provider('siliconflow')
  });
  assert.equal(report.ok, true);
  assert.equal(report.agentImageGenerationRequired, true);
  assert.equal(report.generationRequired, true);
  assert.equal(report.checks.payload.skipped, true);
  assert.equal(report.checks.provider.ok, true);
  assert.equal(report.checks.outputAllowlist.ok, true);
  assert.equal(report.checks.agent.imageGenerationPublicEnabled, true);
});

test('production ai-design quote and create share the readiness storage failure without billing side effects', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-paid-storage-gate-'));
  const env = {
    ...baseGenerationEnv,
    NODE_ENV: 'production',
    AI_OUTPUT_ALLOWED_HOSTS: 'cdn.example.com'
  };
  const fileAdapter = { driver: 'file', rootDir };
  const readiness = await getReadinessReport({
    env,
    pool: migratedPool,
    adapter: fileAdapter,
    generationProvider: provider('siliconflow')
  });
  assert.equal(readiness.ok, false);
  assert.equal(readiness.checks.storage.code, 'SHARED_ASSET_STORAGE_REQUIRED');

  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    PAID_FEATURES_ENABLED: process.env.PAID_FEATURES_ENABLED
  };
  const originalCreateQuote = billing.createQuote;
  const originalCreateTaskWithHold = billing.createTaskWithHold;
  let quoteCalls = 0;
  let holdCalls = 0;
  billing.createQuote = async () => {
    quoteCalls += 1;
    throw new Error('createQuote must not run when storage readiness fails');
  };
  billing.createTaskWithHold = async () => {
    holdCalls += 1;
    throw new Error('createTaskWithHold must not run when storage readiness fails');
  };
  process.env.DATABASE_URL = 'postgresql://test.invalid/artigen';
  process.env.NODE_ENV = 'production';
  process.env.PAID_FEATURES_ENABLED = '1';

  const authResolution = {
    ok: true,
    userId: '11111111-1111-4111-8111-111111111111',
    dbUserId: '11111111-1111-4111-8111-111111111111'
  };
  const { app, routes } = routeApp();
  installToolTaskRoutes(app, {
    env,
    assetAdapter: fileAdapter,
    generationProvider: provider('siliconflow'),
    taskQueue: { register() {} },
    enableTaskQueue: false,
    enableHoldSweeper: false,
    enableAssetSweeper: false,
    rateLimit: () => (_req, _res, next) => next()
  });

  try {
    const quoteRes = routeResponse();
    await routes.get('POST /api/tool-tasks/quote')({
      body: { toolId: 'ai-design', operation: 'generate' },
      authResolution
    }, quoteRes);
    assert.equal(quoteRes.statusCode, 503);
    assert.equal(quoteRes.payload.error.code, 'SHARED_ASSET_STORAGE_REQUIRED');
    assert.equal(quoteRes.payload.error.retryable, true);

    const createRes = routeResponse();
    await routes.get('POST /api/tool-tasks')(multipartRequest({
      fields: {
        toolId: 'ai-design',
        operation: 'generate',
        options: JSON.stringify({
          prompt: 'A clean product image',
          profileId: 'standard-v1',
          aspectRatio: '1:1'
        }),
        inputAssets: '[]'
      },
      authResolution,
      idempotencyKey: 'task:storage-readiness-gate'
    }), createRes);
    assert.equal(createRes.statusCode, 503);
    assert.equal(createRes.payload.error.code, 'SHARED_ASSET_STORAGE_REQUIRED');
    assert.equal(createRes.payload.error.retryable, true);
    assert.equal(quoteCalls, 0);
    assert.equal(holdCalls, 0);
  } finally {
    billing.createQuote = originalCreateQuote;
    billing.createTaskWithHold = originalCreateTaskWithHold;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('disabled paid and email OTP features skip database, storage and provider I/O', async () => {
  let databaseQueries = 0;
  let adapterReads = 0;
  let providerReads = 0;
  const report = await getReadinessReport({
    env: { PAID_FEATURES_ENABLED: 'false', AI_DESIGN_TASK_V2_ENABLED: 'true' },
    pool: {
      query: async () => {
        databaseQueries += 1;
        throw new Error('database must not be queried');
      }
    },
    adapter: new Proxy({}, {
      get() {
        adapterReads += 1;
        throw new Error('storage adapter must not be inspected');
      }
    }),
    generationProvider: new Proxy({}, {
      get() {
        providerReads += 1;
        throw new Error('provider must not be inspected');
      }
    })
  });
  assert.equal(report.ok, true);
  assert.equal(report.generationRequired, false);
  assert.equal(report.databaseRequired, false);
  assert.equal(databaseQueries, 0);
  assert.equal(adapterReads, 0);
  assert.equal(providerReads, 0);
  for (const name of [
    'database',
    'storage',
    'payload',
    'provider',
    'outputAllowlist',
    'payment',
    'authSecrets',
    'mail',
    'turnstile'
  ]) {
    assert.deepEqual(report.checks[name], {
      ok: true,
      skipped: true,
      code: 'NOT_REQUIRED',
      reason: 'FEATURE_DISABLED'
    });
  }
});

test('enabled behavior analytics makes PostgreSQL part of the readiness gate', async () => {
  const missingDatabase = await getReadinessReport({
    env: {
      PAID_FEATURES_ENABLED: 'false',
      AUTH_EMAIL_OTP_ENABLED: 'false',
      BEHAVIOR_ANALYTICS_ENABLED: 'true'
    },
    pool: null,
    adapter: null,
    generationProvider: null
  });
  assert.equal(missingDatabase.ok, false);
  assert.equal(missingDatabase.behaviorAnalyticsEnabled, true);
  assert.equal(missingDatabase.databaseRequired, true);
  assert.equal(missingDatabase.checks.database.code, 'DATABASE_NOT_CONFIGURED');

  const ready = await getReadinessReport({
    env: {
      PAID_FEATURES_ENABLED: 'false',
      AUTH_EMAIL_OTP_ENABLED: 'false',
      BEHAVIOR_ANALYTICS_ENABLED: 'true'
    },
    pool: migratedPool,
    adapter: null,
    generationProvider: null
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.database.migration, LATEST_REPOSITORY_MIGRATION);
});

test('email OTP readiness requires migrated PostgreSQL, independent strong secrets, Brevo and Turnstile', async () => {
  const validEnv = {
    NODE_ENV: 'production',
    AUTH_EMAIL_OTP_ENABLED: 'true',
    PAID_FEATURES_ENABLED: 'false',
    OTP_HMAC_SECRET: 'otp_E7v!4LMx1@Qp9#Za6$Nr2%Ws8&Tu5*Ky',
    CSRF_SECRET: 'csrf_R8m@2Kz7!Va4#Jn9$Wp6%Tx1&Ls5*Qe',
    SESSION_TOKEN_HASH_SECRET: 'session_T9q#5Lc2@Wr8!Zm4$Nv7%Kx1&Ps6*Hd',
    MAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'xkeysib-prod-9Xv2Lm8Qp4Rz7Nc5Wt1Ks6Hd3Fa0',
    MAIL_FROM_EMAIL: 'auth@example.com',
    MAIL_FROM_NAME: 'Artigen',
    TURNSTILE_SECRET_KEY: 'turnstile_7Qm2Vx9Lp4Zr8Kc5Nw1Hs6',
    VITE_TURNSTILE_SITE_KEY: 'site_4Zn8Qp2Lm7Vr5Kx1Tw9Hs6',
    TURNSTILE_HOSTNAMES: 'artigen.example',
    APP_ORIGIN: 'https://artigen.example'
  };
  assert.deepEqual(checkAuthSecrets(validEnv), { ok: true });
  assert.equal(checkBrevo(validEnv).ok, true);
  assert.deepEqual(checkTurnstile(validEnv), { ok: true });

  const missingDatabase = await getReadinessReport({
    env: validEnv,
    pool: null,
    adapter: null,
    generationProvider: null
  });
  assert.equal(missingDatabase.ok, false);
  assert.equal(missingDatabase.authEmailOtpEnabled, true);
  assert.equal(missingDatabase.checks.database.code, 'DATABASE_NOT_CONFIGURED');

  const ready = await getReadinessReport({
    env: validEnv,
    pool: migratedPool,
    adapter: null,
    generationProvider: null
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.authSecrets.ok, true);
  assert.equal(ready.checks.mail.provider, 'brevo');
  assert.equal(ready.checks.turnstile.ok, true);
  assert.equal(ready.checks.storage.skipped, true);
  assert.equal(ready.checks.provider.skipped, true);
});

test('email OTP readiness accepts the signed HTTPS mail relay without Brevo', async () => {
  const env = {
    NODE_ENV: 'production',
    AUTH_EMAIL_OTP_ENABLED: 'true',
    PAID_FEATURES_ENABLED: 'false',
    OTP_HMAC_SECRET: 'otp_E7v!4LMx1@Qp9#Za6$Nr2%Ws8&Tu5*Ky',
    CSRF_SECRET: 'csrf_R8m@2Kz7!Va4#Jn9$Wp6%Tx1&Ls5*Qe',
    SESSION_TOKEN_HASH_SECRET: 'session_T9q#5Lc2@Wr8!Zm4$Nv7%Kx1&Ps6*Hd',
    MAIL_PROVIDER: 'relay',
    MAIL_RELAY_URL: 'https://artigen-mail-relay.vercel.app/api/send-otp',
    MAIL_RELAY_SHARED_SECRET: 'relay_9Xv2Lm8Qp4Rz7Nc5Wt1Ks6Hd3Fa0Bq7Z',
    TURNSTILE_SECRET_KEY: 'turnstile_7Qm2Vx9Lp4Zr8Kc5Nw1Hs6',
    VITE_TURNSTILE_SITE_KEY: 'site_4Zn8Qp2Lm7Vr5Kx1Tw9Hs6',
    TURNSTILE_HOSTNAMES: 'artigen.example',
    APP_ORIGIN: 'https://artigen.example'
  };
  assert.deepEqual(checkMailRelay(env), {
    ok: true,
    provider: 'relay',
    signedTransport: true
  });
  assert.equal(checkMailProvider(env).ok, true);
  const ready = await getReadinessReport({
    env,
    pool: migratedPool,
    adapter: null,
    generationProvider: null
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.mail.provider, 'relay');
});

test('email OTP readiness rejects weak, reused or incomplete runtime credentials', async () => {
  const shared = 'shared_A7m!2Qx9@Lp4#Vr8$Nz5%Kw1&Ts6*Hd';
  assert.equal(checkAuthSecrets({
    OTP_HMAC_SECRET: shared,
    CSRF_SECRET: shared,
    SESSION_TOKEN_HASH_SECRET: shared
  }).code, 'AUTH_SECRETS_REUSED');
  assert.equal(checkAuthSecrets({
    OTP_HMAC_SECRET: 'too-short',
    CSRF_SECRET: 'csrf_R8m@2Kz7!Va4#Jn9$Wp6%Tx1&Ls5*Qe',
    SESSION_TOKEN_HASH_SECRET: 'session_T9q#5Lc2@Wr8!Zm4$Nv7%Kx1&Ps6*Hd'
  }).code, 'AUTH_SECRETS_WEAK');
  assert.equal(checkBrevo({
    MAIL_PROVIDER: 'smtp',
    BREVO_API_KEY: 'xkeysib-real-looking-api-key-123456789',
    MAIL_FROM_EMAIL: 'auth@example.com',
    MAIL_FROM_NAME: 'Artigen'
  }).code, 'BREVO_PROVIDER_REQUIRED');
  assert.equal(checkTurnstile({ TURNSTILE_SECRET_KEY: '' }).code, 'TURNSTILE_NOT_CONFIGURED');
  assert.equal(checkTurnstile({
    TURNSTILE_SECRET_KEY: 'turnstile_7Qm2Vx9Lp4Zr8Kc5Nw1Hs6',
    VITE_TURNSTILE_SITE_KEY: ''
  }).code, 'TURNSTILE_SITE_KEY_NOT_CONFIGURED');
  assert.equal(checkTurnstile({
    NODE_ENV: 'production',
    AUTH_EMAIL_OTP_ENABLED: 'true',
    TURNSTILE_SECRET_KEY: 'turnstile_7Qm2Vx9Lp4Zr8Kc5Nw1Hs6',
    VITE_TURNSTILE_SITE_KEY: 'site_4Zn8Qp2Lm7Vr5Kx1Tw9Hs6',
    APP_ORIGIN: 'https://artigen.example'
  }).code, 'TURNSTILE_HOSTNAMES_NOT_CONFIGURED');
  assert.equal(checkTurnstile({
    NODE_ENV: 'production',
    AUTH_EMAIL_OTP_ENABLED: 'true',
    TURNSTILE_SECRET_KEY: 'turnstile_7Qm2Vx9Lp4Zr8Kc5Nw1Hs6',
    VITE_TURNSTILE_SITE_KEY: 'site_4Zn8Qp2Lm7Vr5Kx1Tw9Hs6',
    TURNSTILE_HOSTNAMES: 'artigen.example',
    APP_ORIGIN: 'http://artigen.example'
  }).code, 'TURNSTILE_APP_ORIGIN_MISMATCH');
});

test('system healthz stays shallow and does not inspect readiness dependencies', () => {
  let dependencyReads = 0;
  const unreadableDependency = new Proxy({}, {
    get() {
      dependencyReads += 1;
      throw new Error('healthz must not inspect deep readiness dependencies');
    }
  });
  const { app, routes } = routeApp();
  installSystemRoutes(app, {
    NODE_ENV: 'production',
    isProd: true,
    env: {
      NODE_ENV: 'production',
      PAID_FEATURES_ENABLED: 'true',
      AUTH_EMAIL_OTP_ENABLED: 'true'
    },
    generationProvider: unreadableDependency,
    readinessPool: unreadableDependency,
    assetAdapter: unreadableDependency,
    fs,
    path,
    rateLimit: () => (_req, _res, next) => next(),
    assertAuthUserMatches: () => true
  });
  const res = routeResponse();
  res.locals = { requestId: 'health-route-test' };

  routes.get('GET /healthz')({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(dependencyReads, 0);
});

test('system meta exposes the deployment environment and Render commit', () => {
  const { app, routes } = routeApp();
  installSystemRoutes(app, {
    NODE_ENV: 'production',
    isProd: true,
    env: {
      NODE_ENV: 'production',
      APP_ENV: 'dev',
      RENDER_GIT_COMMIT: 'render-commit-sha'
    },
    fs,
    path,
    rateLimit: () => (_req, _res, next) => next(),
    assertAuthUserMatches: () => true
  });
  const res = routeResponse();
  res.locals = { requestId: 'meta-route-test' };

  routes.get('GET /api/meta')({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.nodeEnv, 'production');
  assert.equal(res.payload.appEnv, 'dev');
  assert.equal(res.payload.gitSha, 'render-commit-sha');
});

test('system readyz uses the injected generation adapter and readiness dependencies', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artigen-ready-route-'));
  const routes = new Map();
  const register = (method) => (routePath, ...handlers) => {
    routes.set(`${method} ${routePath}`, handlers.at(-1));
  };
  const app = {
    get: register('GET'),
    post: register('POST')
  };
  installSystemRoutes(app, {
    NODE_ENV: 'test',
    isProd: false,
    env: { ...baseGenerationEnv, NODE_ENV: 'test' },
    generationProvider: provider('contract-mock'),
    readinessPool: migratedPool,
    assetAdapter: { driver: 'file', rootDir },
    fs,
    path,
    rateLimit: () => (_req, _res, next) => next(),
    assertAuthUserMatches: () => true
  });
  const res = {
    locals: { requestId: 'ready-route-test' },
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  try {
    await routes.get('GET /readyz')({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.checks.provider.kind, 'contract-mock');
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});
