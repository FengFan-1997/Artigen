const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const {
  getTool,
  isPaidOperation,
  resolveOperationSku
} = require('../lib/tool-catalog');
const {
  GENERATION_DIRECTIONS_MODEL,
  GENERATION_EDIT_MODEL,
  GENERATION_IMAGE_MODEL,
  PRODUCT_REFERENCE_PROFILE_ID,
  STANDARD_PROFILE_ID,
  assertGenerationProfile,
  generationRolloutBucket,
  getInternalGenerationProfile,
  isAiDesignTaskV2Enabled,
  listPublicGenerationProfiles
} = require('../services/generation-profiles');
const {
  createConfiguredGenerationProvider,
  createContractMockGenerationProvider,
  createSiliconFlowGenerationProvider,
  mapProviderError,
  parseDirectionsResponse
} = require('../services/generation-provider');
const {
  assertAiDesignAvailable,
  assertOutputAspectRatio,
  createAiDesignExecutor,
  deriveTaskSeed,
  normalizeAiDesignFailure,
  normalizeGeneratedImageAspectRatio,
  persistAiDesignOutput,
  validateAiDesignTask
} = require('../services/ai-design-service');

const enabledEnv = {
  NODE_ENV: 'test',
  AI_DESIGN_TASK_V2_ENABLED: '1'
};

test('ai-design catalog uses operation-level SKUs without exposing client price authority', () => {
  const tool = getTool('ai-design');
  assert.equal(tool.kind, 'generator');
  assert.equal(resolveOperationSku(tool, 'generate'), 'ai-design.generate.v1');
  assert.equal(
    resolveOperationSku(tool, 'generate', { profileId: PRODUCT_REFERENCE_PROFILE_ID }),
    'ai-design.product-reference.v1'
  );
  assert.equal(resolveOperationSku(tool, 'directions'), 'ai-design.directions.v1');
  assert.equal(isPaidOperation(tool, 'generate'), true);
  assert.equal(isPaidOperation(tool, 'directions'), true);
  assert.equal(resolveOperationSku(getTool('old-photo'), 'enhance'), 'workshop.old-photo.v1');
});

test('public generation profiles expose stable capabilities but no provider or internal model IDs', () => {
  const profiles = listPublicGenerationProfiles({
    env: enabledEnv,
    providerAvailable: true
  });
  assert.deepEqual(profiles, [
    {
      id: STANDARD_PROFILE_ID,
      name: { zh: '标准生成', en: 'Standard generation' },
      available: true,
      capabilities: ['text-to-image'],
      maxReferences: 0,
      aspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
      supportsSeed: true
    },
    {
      id: PRODUCT_REFERENCE_PROFILE_ID,
      name: { zh: '商品参考生成', en: 'Product reference generation' },
      available: true,
      capabilities: [
        'reference-guided-generation',
        'product-reference',
        'style-reference',
        'scene-reference'
      ],
      maxReferences: 3,
      aspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
      supportsSeed: true
    }
  ]);
  assert.equal(JSON.stringify(profiles).includes('SiliconFlow'), false);
  assert.equal(JSON.stringify(profiles).includes('Kwai-Kolors'), false);
  assert.equal(JSON.stringify(profiles).includes('Qwen-Image-Edit'), false);
  assert.equal(
    listPublicGenerationProfiles({ env: enabledEnv, providerAvailable: false })[0].available,
    false
  );
  assert.equal(
    listPublicGenerationProfiles({
      env: { ...enabledEnv, AI_DESIGN_TASK_V2_ENABLED: '0' },
      providerAvailable: true
    })[0].available,
    false
  );
});

test('generation rollout uses a stable user bucket with an internal-user override', () => {
  const subject = '00000000-0000-4000-8000-000000000123';
  const bucket = generationRolloutBucket(subject);
  assert.equal(bucket, generationRolloutBucket(subject));
  assert.ok(Number.isInteger(bucket) && bucket >= 0 && bucket < 100);
  assert.equal(isAiDesignTaskV2Enabled({
    AI_DESIGN_TASK_V2_ENABLED: '1',
    AI_DESIGN_TASK_V2_ROLLOUT_PERCENT: String(bucket)
  }, subject), false);
  assert.equal(isAiDesignTaskV2Enabled({
    AI_DESIGN_TASK_V2_ENABLED: '1',
    AI_DESIGN_TASK_V2_ROLLOUT_PERCENT: String(bucket + 1)
  }, subject), true);
  assert.equal(isAiDesignTaskV2Enabled({
    AI_DESIGN_TASK_V2_ENABLED: '1',
    AI_DESIGN_TASK_V2_ROLLOUT_PERCENT: '0',
    AI_DESIGN_TASK_V2_INTERNAL_USERS: `other,${subject}`
  }, subject), true);
  assert.equal(isAiDesignTaskV2Enabled({
    AI_DESIGN_TASK_V2_ENABLED: '0',
    AI_DESIGN_TASK_V2_ROLLOUT_PERCENT: '100',
    AI_DESIGN_TASK_V2_INTERNAL_USERS: subject
  }, subject), false);
  assert.throws(() => assertAiDesignAvailable({
    provider: { available: true },
    env: {
      AI_DESIGN_TASK_V2_ENABLED: '1',
      AI_DESIGN_TASK_V2_ROLLOUT_PERCENT: '0'
    },
    subject
  }), { code: 'MODEL_PROFILE_UNAVAILABLE' });
  assert.equal(assertAiDesignAvailable({
    provider: { available: true },
    env: {
      AI_DESIGN_TASK_V2_ENABLED: '1',
      AI_DESIGN_TASK_V2_ROLLOUT_PERCENT: '0',
      AI_DESIGN_TASK_V2_INTERNAL_USERS: subject
    },
    subject
  }), true);
});

test('ai-design validators allow only the stable contract and enforce operation image counts', () => {
  const directions = validateAiDesignTask({
    operation: 'directions',
    inputCount: 0,
    options: {
      prompt: '为一只陶瓷杯设计商品图',
      locale: 'zh',
      productProfile: {
        productName: '手工陶瓷杯',
        material: '陶瓷',
        styles: ['自然']
      }
    }
  });
  assert.equal(directions.locale, 'zh');
  const generate = validateAiDesignTask({
    operation: 'generate',
    inputCount: 0,
    options: {
      prompt: 'Create a clean product hero image',
      profileId: STANDARD_PROFILE_ID,
      aspectRatio: '4:5',
      seed: 42
    }
  });
  assert.equal(generate.seed, 42);
  const referenceGenerate = validateAiDesignTask({
    operation: 'generate',
    inputCount: 3,
    options: {
      prompt: 'Preserve the bottle and place it in the supplied scene',
      profileId: PRODUCT_REFERENCE_PROFILE_ID,
      aspectRatio: '4:5'
    }
  });
  assert.equal(referenceGenerate.profileId, PRODUCT_REFERENCE_PROFILE_ID);
  assert.deepEqual(referenceGenerate.referenceRoles, ['product', 'style', 'scene']);
  const productAndScene = validateAiDesignTask({
    operation: 'generate',
    inputCount: 2,
    options: {
      prompt: 'Preserve the product in the scene',
      profileId: PRODUCT_REFERENCE_PROFILE_ID,
      aspectRatio: '1:1',
      referenceRoles: ['product', 'scene']
    }
  });
  assert.deepEqual(productAndScene.referenceRoles, ['product', 'scene']);
  assert.throws(
    () => validateAiDesignTask({
      operation: 'generate',
      inputCount: 1,
      options: {
        prompt: 'x',
        profileId: PRODUCT_REFERENCE_PROFILE_ID,
        aspectRatio: '1:1',
        referenceRoles: ['style']
      }
    }),
    { code: 'INVALID_REFERENCE_ROLES', field: 'options.referenceRoles' }
  );
  assert.throws(
    () => validateAiDesignTask({
      operation: 'generate',
      inputCount: 0,
      options: { prompt: 'x', profileId: PRODUCT_REFERENCE_PROFILE_ID, aspectRatio: '1:1' }
    }),
    { code: 'REFERENCE_IMAGE_REQUIRED' }
  );
  assert.throws(
    () => validateAiDesignTask({
      operation: 'generate',
      inputCount: 1,
      options: { prompt: 'x', profileId: STANDARD_PROFILE_ID, aspectRatio: '1:1' }
    }),
    { code: 'REFERENCE_IMAGES_NOT_SUPPORTED' }
  );
  assert.throws(
    () => validateAiDesignTask({
      operation: 'generate',
      inputCount: 0,
      options: {
        prompt: 'x',
        profileId: STANDARD_PROFILE_ID,
        aspectRatio: '1:1',
        model: 'attacker/model',
        guidance: 999,
        price: 0
      }
    }),
    { code: 'INVALID_OPTIONS' }
  );
  assert.throws(
    () => validateAiDesignTask({
      operation: 'generate',
      inputCount: 0,
      options: { prompt: 'x', profileId: STANDARD_PROFILE_ID, aspectRatio: '2:1' }
    }),
    { code: 'INVALID_ASPECT_RATIO', field: 'options.aspectRatio' }
  );
  assert.throws(
    () => validateAiDesignTask({
      operation: 'directions',
      inputCount: 1,
      options: { prompt: 'x', locale: 'en' }
    }),
    { code: 'DIRECTIONS_DOES_NOT_ACCEPT_IMAGES' }
  );
  assert.throws(
    () => validateAiDesignTask({
      operation: 'generate',
      inputCount: 4,
      options: { prompt: 'x', profileId: STANDARD_PROFILE_ID, aspectRatio: '1:1' }
    }),
    { code: 'TOO_MANY_FILES' }
  );
});

test('SiliconFlow adapter owns model and image parameters and parses exactly four directions', async () => {
  const calls = { image: null, chat: [] };
  const provider = createSiliconFlowGenerationProvider({
    configured: true,
    env: enabledEnv,
    imageGenerate: async (input) => {
      calls.image = input;
      return { data: { images: [{ url: 'https://assets.example/result.png' }] } };
    },
    chatGenerate: async (input) => {
      calls.chat.push(input);
      return {
        text: JSON.stringify({
          directions: Array.from({ length: 4 }, (_, index) => ({
            title: `Direction ${index + 1}`,
            summary: `Summary ${index + 1}`,
            prompt: `Prompt ${index + 1}`
          }))
        })
      };
    }
  });
  const profile = getInternalGenerationProfile(STANDARD_PROFILE_ID, enabledEnv);
  const directions = await provider.generateDirections({
    prompt: 'A bottle hero shot',
    locale: 'en',
    profile
  });
  assert.equal(directions.length, 4);
  assert.equal(calls.chat[0].model, GENERATION_DIRECTIONS_MODEL);
  assert.equal(calls.chat[0].timeoutMs, 120_000);
  assert.equal(calls.chat[0].enableThinking, false);
  assert.match(calls.chat[0].messages[0].content, /Never invent ingredients/);
  await provider.organizeIngredientSource({
    messages: [{ role: 'user', content: 'water, salt' }],
    profile
  });
  assert.equal(calls.chat[1].model, GENERATION_DIRECTIONS_MODEL);
  assert.equal(calls.chat[1].timeoutMs, 120_000);
  assert.equal(calls.chat[1].enableThinking, false);
  await provider.generateImage({
    prompt: 'controlled prompt',
    profile,
    aspectRatio: '9:16',
    seed: 7,
    images: []
  });
  assert.equal(calls.image.model, GENERATION_IMAGE_MODEL);
  assert.equal(calls.image.allowModelFallback, false);
  assert.deepEqual(calls.image.params, { imageSize: '720x1280', seed: 7 });
  assert.equal('steps' in calls.image.params, false);
  assert.equal('guidanceScale' in calls.image.params, false);
  const referenceProfile = getInternalGenerationProfile(PRODUCT_REFERENCE_PROFILE_ID, enabledEnv);
  await provider.generateImage({
    prompt: 'preserve the product identity',
    profile: referenceProfile,
    aspectRatio: '1:1',
    seed: 9,
    images: ['data:image/png;base64,AAAA']
  });
  assert.equal(calls.image.model, GENERATION_EDIT_MODEL);
  assert.equal(calls.image.images.length, 1);
});

test('generation provider rejects every model outside the fixed production allowlist', async () => {
  const provider = createSiliconFlowGenerationProvider({
    configured: true,
    env: enabledEnv,
    imageGenerate: async () => {
      throw new Error('must not dispatch');
    },
    chatGenerate: async () => {
      throw new Error('must not dispatch');
    }
  });
  const profile = getInternalGenerationProfile(STANDARD_PROFILE_ID);
  await assert.rejects(
    provider.generateDirections({
      prompt: 'x',
      locale: 'zh',
      profile: { ...profile, internalDirectionsModel: 'paid/third-model' }
    }),
    { code: 'MODEL_PROFILE_UNAVAILABLE' }
  );
  await assert.rejects(
    provider.generateImage({
      prompt: 'x',
      profile: { ...profile, internalTextModel: 'paid/third-model' },
      aspectRatio: '1:1',
      images: []
    }),
    { code: 'MODEL_PROFILE_UNAVAILABLE' }
  );
});

test('SiliconFlow readiness probe validates credentials, endpoint and every internal model', async () => {
  const env = {
    NODE_ENV: 'production',
    SILICONFLOW_API_KEY: 'sk-production-key'
  };
  const profile = getInternalGenerationProfile(STANDARD_PROFILE_ID, env);
  let request;
  const provider = createSiliconFlowGenerationProvider({
    env,
    imageGenerate: async () => ({}),
    chatGenerate: async () => ({}),
    fetcher: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: GENERATION_IMAGE_MODEL },
            { id: GENERATION_EDIT_MODEL },
            { id: GENERATION_DIRECTIONS_MODEL }
          ]
        })
      };
    }
  });
  assert.deepEqual(await provider.checkAvailability({ profile }), {
    ok: true,
    kind: 'siliconflow',
    profile: STANDARD_PROFILE_ID
  });
  assert.equal(request.url, 'https://api.siliconflow.cn/v1/models');
  assert.equal(request.options.headers.authorization, 'Bearer sk-production-key');

  const rejected = createSiliconFlowGenerationProvider({
    env,
    imageGenerate: async () => ({}),
    chatGenerate: async () => ({}),
    fetcher: async () => ({ ok: false, status: 401 })
  });
  assert.deepEqual(await rejected.checkAvailability({ profile }), {
    ok: false,
    code: 'PROVIDER_CREDENTIAL_INVALID'
  });

  const missingModel = createSiliconFlowGenerationProvider({
    env,
    imageGenerate: async () => ({}),
    chatGenerate: async () => ({}),
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: GENERATION_IMAGE_MODEL }] })
    })
  });
  assert.deepEqual(await missingModel.checkAvailability({ profile }), {
    ok: false,
    code: 'MODEL_PROFILE_UNAVAILABLE'
  });

  const unsafeEndpoint = createSiliconFlowGenerationProvider({
    env: { ...env, SILICONFLOW_API_BASE: 'https://attacker.example/v1' },
    imageGenerate: async () => ({}),
    chatGenerate: async () => ({}),
    fetcher: async () => { throw new Error('must not send credentials'); }
  });
  assert.deepEqual(await unsafeEndpoint.checkAvailability({ profile }), {
    ok: false,
    code: 'PROVIDER_ENDPOINT_INVALID'
  });
});

test('direction parser rejects prose, partial arrays and malformed direction fields', () => {
  assert.equal(parseDirectionsResponse(JSON.stringify({
    directions: Array.from({ length: 4 }, (_, index) => ({
      title: `T${index}`,
      summary: `S${index}`,
      prompt: `P${index}`
    }))
  })).length, 4);
  assert.throws(() => parseDirectionsResponse('Here are some ideas'), { code: 'OUTPUT_INVALID' });
  assert.throws(
    () => parseDirectionsResponse(JSON.stringify({ directions: [{ title: 'x', summary: 'y', prompt: 'z' }] })),
    { code: 'OUTPUT_INVALID' }
  );
  assert.equal(parseDirectionsResponse(JSON.stringify(Array.from({ length: 4 }, (_, index) => ({
    title: `T${index}`,
    summary: `S${index}`,
    prompt: `P${index}`
  })))).length, 4);
});

test('provider timeout and user cancellation remain distinct task outcomes', () => {
  const timeout = mapProviderError(Object.assign(new Error('aborted by timeout'), {
    name: 'AbortError',
    code: 'ABORT_ERR'
  }));
  assert.equal(timeout.code, 'PROVIDER_TIMEOUT');
  const controller = new AbortController();
  controller.abort();
  const cancelled = mapProviderError(Object.assign(new Error('cancelled'), {
    name: 'AbortError',
    code: 'ABORT_ERR'
  }), controller.signal);
  assert.equal(cancelled.code, 'TASK_CANCELLED');
  assert.equal(normalizeAiDesignFailure(Object.assign(new Error('download timeout'), {
    name: 'AbortError',
    code: 'ABORT_ERR'
  })), 'PROVIDER_TIMEOUT');
  assert.equal(normalizeAiDesignFailure(Object.assign(new Error('cancelled'), {
    name: 'AbortError',
    code: 'ABORT_ERR'
  }), controller.signal), 'TASK_CANCELLED');
});

test('contract mock is development-only and returns valid aspect-aware PNG payloads', async () => {
  const mock = createConfiguredGenerationProvider({
    env: { NODE_ENV: 'test', AI_GENERATION_CONTRACT_MOCK: '1' }
  });
  assert.equal(mock.kind, 'contract-mock');
  const generated = await mock.generateImage({ aspectRatio: '16:9', seed: 9 });
  assert.match(generated.data.images[0].url, /^data:image\/png;base64,/);
  const production = createConfiguredGenerationProvider({
    env: {
      NODE_ENV: 'production',
      AI_GENERATION_CONTRACT_MOCK: '1',
      SILICONFLOW_API_KEY: ''
    }
  });
  assert.equal(production.kind, 'siliconflow');
  assert.equal(production.available, false);
  assert.equal(createContractMockGenerationProvider().available, true);
});

test('directions executor settles a deliberate data-only result after running', async () => {
  const calls = [];
  const executor = createAiDesignExecutor({
    env: enabledEnv,
    provider: createContractMockGenerationProvider(),
    markRunning: async ({ taskId }) => calls.push(['running', taskId]),
    markProviderDispatched: async ({ taskId }) => calls.push(['dispatched', taskId]),
    settleTask: async (input) => {
      calls.push(['settle', input]);
      return { status: 'success' };
    },
    releaseTask: async () => {
      throw new Error('must not release a successful task');
    }
  });
  const result = await executor({
    taskId: 'task-directions',
    ownerUserId: 'owner',
    operation: 'directions',
    options: { prompt: 'Create four visual directions', locale: 'en' },
    inputAssetIds: []
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.directions.length, 4);
  assert.equal(calls[0][0], 'running');
  assert.equal(calls[1][0], 'dispatched');
  assert.equal(calls[2][1].allowEmptyAssets, true);
  assert.deepEqual(calls[2][1].outputAssetIds, []);
  assert.equal(calls[2][1].result.assets.length, 0);
});

test('generate executor persists and verifies an opaque asset before settlement', async () => {
  const calls = [];
  const executor = createAiDesignExecutor({
    env: enabledEnv,
    provider: createContractMockGenerationProvider(),
    loadInputAsset: async ({ assetId }) => ({
      image: { mimeType: 'image/png', dataBase64: assetId }
    }),
    persistOutput: async ({ reference }) => {
      calls.push(['persist', reference]);
      return {
        assetId: '22222222-2222-4222-8222-222222222222',
        mimeType: 'image/png',
        byteSize: 100,
        width: 16,
        height: 20,
        persisted: true,
        verified: true
      };
    },
    markRunning: async () => calls.push(['running']),
    markProviderDispatched: async () => calls.push(['dispatched']),
    settleTask: async (input) => {
      calls.push(['settle', input]);
      return { status: 'success' };
    },
    releaseTask: async () => {
      throw new Error('must not release a successful task');
    }
  });
  const result = await executor({
    taskId: 'task-generate',
    ownerUserId: 'owner',
    operation: 'generate',
    options: {
      prompt: 'Product on a clean studio set',
      profileId: STANDARD_PROFILE_ID,
      aspectRatio: '4:5'
    },
    inputAssetIds: []
  });
  assert.equal(result.ok, true);
  assert.equal(calls.findIndex(([kind]) => kind === 'persist') < calls.findIndex(([kind]) => kind === 'settle'), true);
  const settlement = calls.find(([kind]) => kind === 'settle')[1];
  assert.deepEqual(settlement.outputAssetIds, ['22222222-2222-4222-8222-222222222222']);
  assert.equal(settlement.result.data.profileId, STANDARD_PROFILE_ID);
  assert.equal(settlement.result.data.aspectRatio, '4:5');
  assert.equal(settlement.result.data.seed, deriveTaskSeed('task-generate'));
});

test('invalid or unpersisted generation output releases the hold and never settles', async () => {
  let settled = false;
  let releaseInput = null;
  const executor = createAiDesignExecutor({
    env: enabledEnv,
    provider: createContractMockGenerationProvider(),
    persistOutput: async () => ({ persisted: false, verified: false }),
    markRunning: async () => {},
    markProviderDispatched: async () => {},
    settleTask: async () => {
      settled = true;
    },
    releaseTask: async (input) => {
      releaseInput = input;
      return { status: 'failed' };
    }
  });
  const result = await executor({
    taskId: 'task-invalid-output',
    ownerUserId: 'owner',
    operation: 'generate',
    options: {
      prompt: 'Product image',
      profileId: STANDARD_PROFILE_ID,
      aspectRatio: '1:1'
    },
    inputAssetIds: []
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'OUTPUT_PERSIST_FAILED');
  assert.equal(settled, false);
  assert.equal(releaseInput.errorCode, 'OUTPUT_PERSIST_FAILED');
});

test('a persisted output is deleted after confirmed failed settlement but never after ambiguous success', async () => {
  const deleted = [];
  let latestStatus = 'failed';
  const executor = createAiDesignExecutor({
    env: enabledEnv,
    provider: createContractMockGenerationProvider(),
    persistOutput: async () => ({
      assetId: '22222222-2222-4222-8222-222222222222',
      mimeType: 'image/png',
      byteSize: 100,
      width: 16,
      height: 16,
      persisted: true,
      verified: true
    }),
    markRunning: async () => {},
    markProviderDispatched: async () => {},
    settleTask: async () => {
      throw Object.assign(new Error('late cancellation'), { code: 'TASK_CANCELLED' });
    },
    releaseTask: async () => ({ status: 'failed' }),
    getTask: async () => ({ status: latestStatus }),
    deleteOutputAsset: async (input) => deleted.push(input)
  });
  const input = {
    taskId: 'task-cleanup-output',
    ownerUserId: 'owner',
    operation: 'generate',
    options: {
      prompt: 'Product image',
      profileId: STANDARD_PROFILE_ID,
      aspectRatio: '1:1'
    },
    inputAssetIds: []
  };
  const failed = await executor(input);
  assert.equal(failed.ok, false);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].assetId, '22222222-2222-4222-8222-222222222222');

  latestStatus = 'success';
  deleted.length = 0;
  await executor({ ...input, taskId: 'task-ambiguous-success' });
  assert.equal(deleted.length, 0);
});

test('generated output persistence applies the 30-day asset retention class', async () => {
  let storedInput = null;
  const output = await persistAiDesignOutput({
    reference: 'data:image/png;base64,ignored-by-test-download',
    ownerUserId: 'owner',
    taskId: 'task-retention',
    expiresAt: new Date('2030-01-31T00:00:00.000Z'),
    download: async () => ({ buffer: Buffer.from('test-image'), mimeType: 'image/png' }),
    assetService: {
      storeAsset: async (input) => {
        storedInput = input;
        return {
          assetId: '22222222-2222-4222-8222-222222222222',
          mimeType: 'image/png',
          byteSize: input.buffer.length,
          width: 16,
          height: 16
        };
      }
    }
  });
  assert.equal(storedInput.retentionClass, 'generated-output');
  assert.equal(storedInput.expiresAt.toISOString(), '2030-01-31T00:00:00.000Z');
  assert.equal(output.persisted, true);
  assert.equal(output.verified, true);
});

test('output aspect verification rejects provider geometry that violates the selected ratio', () => {
  assert.equal(assertOutputAspectRatio({ width: 1080, height: 1350 }, '4:5'), true);
  assert.throws(
    () => assertOutputAspectRatio({ width: 1024, height: 1024 }, '9:16'),
    { code: 'OUTPUT_INVALID' }
  );
  assert.throws(
    () => assertGenerationProfile({ profileId: STANDARD_PROFILE_ID, aspectRatio: '7:5' }),
    { code: 'INVALID_ASPECT_RATIO' }
  );
});

test('Qwen edit outputs are normalized to the requested aspect ratio before persistence', async () => {
  const square = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 30, g: 60, b: 90, alpha: 1 }
    }
  }).png().toBuffer();
  const normalized = await normalizeGeneratedImageAspectRatio({
    buffer: square,
    mimeType: 'image/png',
    aspectRatio: '4:5'
  });
  const metadata = await sharp(normalized.buffer).metadata();
  assert.equal(normalized.transformed, true);
  assert.equal(metadata.width, 960);
  assert.equal(metadata.height, 1200);
  assert.equal(assertOutputAspectRatio(metadata, '4:5'), true);
});
