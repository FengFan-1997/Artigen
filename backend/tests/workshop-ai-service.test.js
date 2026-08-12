const assert = require('node:assert/strict');
const test = require('node:test');
const { getTool, resolveOperationSku } = require('../lib/tool-catalog');
const {
  BACKGROUND_PRESETS,
  assertWorkshopAiAvailable,
  buildBackgroundPrompt,
  buildPortraitPrompt,
  createWorkshopAiExecutor,
  normalizeIngredientOutput,
  validateWorkshopAiTask
} = require('../services/workshop-ai-service');
const {
  PRODUCT_REFERENCE_PROFILE_ID
} = require('../services/generation-profiles');

const enabledEnv = {
  NODE_ENV: 'test',
  WORKSHOP_AI_TASK_V2_ENABLED: '1'
};

test('workshop AI catalog operations use only server-owned SKUs', () => {
  assert.equal(
    resolveOperationSku(getTool('id-photo'), 'professional-portrait'),
    'workshop.professional-portrait.v1'
  );
  assert.equal(
    resolveOperationSku(getTool('background'), 'ai-scene'),
    'workshop.background-scene.v1'
  );
  assert.equal(
    resolveOperationSku(getTool('ingredient-label'), 'ai-organize-source-text'),
    'workshop.ingredient-layout-ai.v1'
  );
});

test('workshop validators accept server enums and reject client prompt, model and price authority', () => {
  assert.deepEqual(validateWorkshopAiTask({
    toolId: 'id-photo',
    operation: 'professional-portrait',
    inputCount: 1,
    options: { style: 'finance' }
  }), { style: 'finance' });
  assert.equal(validateWorkshopAiTask({
    toolId: 'background',
    operation: 'ai-scene',
    inputCount: 1,
    options: {
      mode: 'add',
      presetId: 'forest',
      subjectScale: 1.2,
      subjectOffset: { x: -0.1, y: 0.2 }
    }
  }).presetId, 'forest');
  assert.throws(() => validateWorkshopAiTask({
    toolId: 'id-photo',
    operation: 'professional-portrait',
    inputCount: 1,
    options: { style: 'finance', prompt: 'attacker prompt', model: 'attacker/model', price: 0 }
  }), { code: 'INVALID_OPTIONS' });
  assert.throws(() => validateWorkshopAiTask({
    toolId: 'background',
    operation: 'ai-scene',
    inputCount: 1,
    options: { mode: 'replace', presetId: 'custom', background: 'attacker prompt' }
  }), { code: 'INVALID_OPTIONS' });
  assert.throws(() => validateWorkshopAiTask({
    toolId: 'ingredient-label',
    operation: 'ai-organize-source-text',
    inputCount: 1,
    options: { sourceText: 'water', productType: 'Food' }
  }), { code: 'FILES_NOT_ALLOWED' });
});

test('portrait and background prompts are constructed exclusively from server enums', () => {
  assert.match(buildPortraitPrompt('finance'), /finance or legal professional/i);
  assert.match(buildPortraitPrompt('finance'), /Preserve identity/i);
  assert.match(buildBackgroundPrompt({
    mode: 'add',
    presetId: 'forest',
    subjectScale: 1.2,
    subjectOffset: { x: -0.2, y: 0.1 }
  }), new RegExp(BACKGROUND_PRESETS.forest.prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(buildBackgroundPrompt({
    mode: 'add',
    presetId: 'forest'
  }), /custom|client|provider model/i);
});

test('ingredient output must remain fully traceable to source text', () => {
  assert.deepEqual(normalizeIngredientOutput({
    layoutType: 'standard',
    sections: [{ title: 'INGREDIENTS', content: ['water, cocoa'] }]
  }, 'Ingredients: water, cocoa'), {
    layoutType: 'standard',
    sections: [{ title: 'INGREDIENTS', content: ['water, cocoa'] }]
  });
  assert.throws(() => normalizeIngredientOutput({
    layoutType: 'standard',
    sections: [{ title: 'INGREDIENTS', content: ['water, cocoa, invented sugar'] }]
  }, 'Ingredients: water, cocoa'), { code: 'INGREDIENT_SOURCE_MISMATCH' });
});

test('workshop provider availability is explicitly flagged and fail-closed', () => {
  assert.equal(assertWorkshopAiAvailable({
    provider: { available: true },
    env: enabledEnv
  }), true);
  assert.throws(() => assertWorkshopAiAvailable({
    provider: { available: true },
    env: { WORKSHOP_AI_TASK_V2_ENABLED: '0' }
  }), { code: 'TOOL_OPERATION_UNAVAILABLE' });
  assert.throws(() => assertWorkshopAiAvailable({
    provider: { available: false },
    env: enabledEnv
  }), { code: 'TOOL_OPERATION_UNAVAILABLE' });
});

test('ingredient executor dispatches, source-validates and settles a data-only result', async () => {
  const calls = [];
  let settled = null;
  const executor = createWorkshopAiExecutor({
    env: enabledEnv,
    provider: {
      available: true,
      organizeIngredientSource: async ({ sourceText }) => ({
        layoutType: 'standard',
        sections: [{ title: 'SOURCE TEXT', content: [sourceText] }]
      })
    },
    markRunning: async () => calls.push('running'),
    markProviderDispatched: async () => calls.push('dispatched'),
    settleTask: async (input) => {
      settled = input;
      calls.push('settled');
      return { status: 'success' };
    },
    releaseTask: async () => {
      calls.push('released');
      return { status: 'failed' };
    }
  });
  const outcome = await executor({
    taskId: 'task-ingredient',
    ownerUserId: 'user-1',
    operation: 'ai-organize-source-text',
    options: { sourceText: 'water, cocoa', productType: 'Food', locale: 'en' },
    inputAssetIds: [],
    leaseOwner: 'worker-1'
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, ['running', 'dispatched', 'settled']);
  assert.equal(settled.allowEmptyAssets, true);
  assert.equal(settled.result.data.sourceTrace.verified, true);
  assert.deepEqual(settled.outputAssetIds, []);
});

test('image executor uses the single-reference Kolors profile and settles a verified asset', async () => {
  const calls = [];
  let settled = null;
  const executor = createWorkshopAiExecutor({
    env: enabledEnv,
    provider: {
      available: true,
      generateImage: async ({ prompt, profile, aspectRatio, images }) => {
        calls.push('provider');
        assert.match(prompt, /professional portrait/i);
        assert.equal(profile.id, PRODUCT_REFERENCE_PROFILE_ID);
        assert.equal(profile.maxReferences, 1);
        assert.equal(profile.internalEditModel, 'Kwai-Kolors/Kolors');
        assert.equal(aspectRatio, '3:4');
        assert.equal(images.length, 1);
        return { data: { images: [{ url: 'https://assets.example/output.png' }] } };
      }
    },
    loadInputAsset: async () => {
      calls.push('loaded');
      return { image: { mimeType: 'image/png', dataBase64: 'abc' } };
    },
    persistOutput: async () => {
      calls.push('persisted');
      return {
        assetId: 'asset-1',
        mimeType: 'image/png',
        byteSize: 100,
        width: 960,
        height: 1280,
        persisted: true,
        verified: true
      };
    },
    markRunning: async () => calls.push('running'),
    markProviderDispatched: async () => calls.push('dispatched'),
    settleTask: async (input) => {
      settled = input;
      calls.push('settled');
      return { status: 'success' };
    },
    releaseTask: async () => {
      calls.push('released');
      return { status: 'failed' };
    }
  });
  const outcome = await executor({
    taskId: 'task-portrait',
    ownerUserId: 'user-1',
    operation: 'professional-portrait',
    options: { style: 'finance' },
    inputAssetIds: ['asset-input'],
    leaseOwner: 'worker-1'
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, ['running', 'loaded', 'dispatched', 'provider', 'persisted', 'settled']);
  assert.deepEqual(settled.outputAssetIds, ['asset-1']);
  assert.equal(settled.result.data.style, 'finance');
});

test('invented ingredient facts fail before settlement and release the hold', async () => {
  let settled = false;
  let released = null;
  const executor = createWorkshopAiExecutor({
    env: enabledEnv,
    provider: {
      available: true,
      organizeIngredientSource: async () => ({
        layoutType: 'standard',
        sections: [{ title: 'INGREDIENTS', content: ['water, invented sugar'] }]
      })
    },
    markRunning: async () => {},
    markProviderDispatched: async () => {},
    settleTask: async () => {
      settled = true;
    },
    releaseTask: async (input) => {
      released = input;
      return { status: 'failed' };
    }
  });
  const outcome = await executor({
    taskId: 'task-invalid',
    ownerUserId: 'user-1',
    operation: 'ai-organize-source-text',
    options: { sourceText: 'water', productType: 'Food' },
    inputAssetIds: [],
    leaseOwner: 'worker-1'
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'INGREDIENT_SOURCE_MISMATCH');
  assert.equal(settled, false);
  assert.equal(released.errorCode, 'INGREDIENT_SOURCE_MISMATCH');
});
