const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const {
  buildOldPhotoPrompt,
  assertPublicOutputUrl,
  createPinnedLookup,
  createOldPhotoExecutor,
  createTaskRunnerRegistry,
  isPrivateIp,
  validateProviderOutputMime
} = require('../services/old-photo-service');
const { createRequestAbortController, validateOldPhotoOptions } = require('../routes/tool-tasks');
const { createSemaphore } = require('../lib/ai-providers');

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ASSET_ID = '22222222-2222-4222-8222-222222222222';

const source = {
  image: { mimeType: 'image/jpeg', dataBase64: 'fixture' },
  mimeType: 'image/jpeg',
  width: 1200,
  height: 800
};

const createHarness = ({ provider, persistOutput } = {}) => {
  const events = [];
  const releases = [];
  let settleCalls = 0;
  const executor = createOldPhotoExecutor({
    provider: provider || (async (request) => {
      events.push(['provider', request]);
      return { data: { images: ['data:image/png;base64,fixture'] } };
    }),
    loadSource: async () => {
      events.push(['load']);
      return source;
    },
    persistOutput: persistOutput || (async (request) => {
      events.push(['persist', request]);
      return {
        assetId: '33333333-3333-4333-8333-333333333333',
        mimeType: 'image/png',
        width: 1500,
        height: 1000,
        persisted: true,
        verified: true
      };
    }),
    markRunning: async () => {
      events.push(['running']);
      return { status: 'running' };
    },
    settleTask: async (request) => {
      events.push(['settle', request]);
      settleCalls += 1;
      return { status: 'success' };
    },
    releaseTask: async (request) => {
      events.push(['release', request]);
      releases.push(request);
      return { status: request.terminalStatus };
    }
  });
  const run = (input = {}) => executor({
    taskId: TASK_ID,
    ownerUserId: 'user-db-id',
    sourceAssetId: SOURCE_ASSET_ID,
    operation: 'enhance',
    options: {},
    ...input
  });
  return { events, executor, releases, run, settleCalls: () => settleCalls };
};

test('old-photo prompt explicitly forbids invented identity, text, objects and composition', () => {
  const plain = buildOldPhotoPrompt('enhance');
  const colorized = buildOldPhotoPrompt('enhance-colorize');
  for (const required of [
    'Do not add, remove, replace',
    'person, face',
    'object',
    'composition',
    'Preserve every visible character',
    'Never guess or reconstruct unreadable text',
    'not a factual reconstruction'
  ]) {
    assert.match(plain.prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(plain.prompt, /do not colorize/i);
  assert.equal(plain.colorize, false);
  assert.match(colorized.prompt, /uncertain colors must remain neutral/i);
  assert.equal(colorized.colorize, true);

  assert.deepEqual(validateOldPhotoOptions({ seed: 42 }), { seed: 42 });
  assert.throws(() => validateOldPhotoOptions({ prompt: 'invent a smiling face' }), {
    code: 'INVALID_OPTIONS'
  });
  assert.throws(() => validateOldPhotoOptions({ seed: -1 }), { code: 'INVALID_OPTIONS' });
});

test('old-photo denoise option changes only the conservative processing instruction', () => {
  const preserved = buildOldPhotoPrompt('enhance', { denoise: false });
  const denoised = buildOldPhotoPrompt('enhance', { denoise: true });
  assert.match(preserved.prompt, /Preserve the original photographic grain/);
  assert.match(denoised.prompt, /Conservatively reduce noise and blur/);
  assert.match(preserved.prompt, /Do not add, remove, replace/);
  assert.match(denoised.prompt, /Do not add, remove, replace/);
});

test('old-photo cancellation aborts the provider and releases without settling', async () => {
  let providerStarted;
  const started = new Promise((resolve) => { providerStarted = resolve; });
  let observedSignal;
  const harness = createHarness({
    provider: ({ signal }) => new Promise((_resolve, reject) => {
      observedSignal = signal;
      providerStarted();
      signal.addEventListener('abort', () => {
        const error = new Error('aborted upstream');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    })
  });
  const controller = new AbortController();
  const pending = harness.run({ signal: controller.signal });
  await started;
  controller.abort();
  const outcome = await pending;

  assert.equal(observedSignal, controller.signal);
  assert.equal(observedSignal.aborted, true);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.error, 'TASK_CANCELLED');
  assert.equal(harness.settleCalls(), 0);
  assert.deepEqual(harness.releases, [{
    taskId: TASK_ID,
    terminalStatus: 'cancelled',
    errorCode: 'TASK_CANCELLED'
  }]);
});

test('old-photo empty provider output releases the full hold', async () => {
  const harness = createHarness({
    provider: async () => ({ data: { images: [] } })
  });
  const outcome = await harness.run();
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'EMPTY_IMAGE_RESULT');
  assert.equal(harness.settleCalls(), 0);
  assert.equal(harness.releases.length, 1);
  assert.equal(harness.releases[0].terminalStatus, 'failed');
  assert.equal(harness.releases[0].errorCode, 'EMPTY_IMAGE_RESULT');
  assert.equal(harness.events.some(([name]) => name === 'persist'), false);
});

test('old-photo persistence failure releases the hold and never settles', async () => {
  const harness = createHarness({
    persistOutput: async () => {
      const error = new Error('cannot save output');
      error.code = 'OUTPUT_PERSIST_FAILED';
      throw error;
    }
  });
  const outcome = await harness.run();
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'OUTPUT_PERSIST_FAILED');
  assert.equal(harness.settleCalls(), 0);
  assert.equal(harness.releases.length, 1);
  assert.equal(harness.releases[0].errorCode, 'OUTPUT_PERSIST_FAILED');
});

test('old-photo settles only after verified persistence and geometry validation', async () => {
  const harness = createHarness();
  const outcome = await harness.run({
    operation: 'enhance-colorize',
    options: { seed: 7 }
  });
  assert.equal(outcome.ok, true);
  assert.equal(harness.releases.length, 0);
  assert.equal(harness.settleCalls(), 1);
  assert.deepEqual(
    harness.events.map(([name]) => name),
    ['running', 'load', 'provider', 'persist', 'settle']
  );
  const providerRequest = harness.events.find(([name]) => name === 'provider')[1];
  assert.match(providerRequest.prompt, /Never guess or reconstruct unreadable text/i);
  assert.equal(providerRequest.params.seed, 7);
  const settlement = harness.events.find(([name]) => name === 'settle')[1];
  assert.deepEqual(settlement.outputAssetIds, ['33333333-3333-4333-8333-333333333333']);
  assert.deepEqual(settlement.result.warnings, [{
    code: 'AI_RESTORATION_NOT_FACTUAL_RECONSTRUCTION',
    messageKey: 'warnings.ai_restoration_not_factual_reconstruction'
  }]);
  assert.equal(settlement.result.restoration.colorized, true);
});

test('old-photo changed aspect ratio is rejected and released before settlement', async () => {
  const harness = createHarness({
    persistOutput: async () => ({
      assetId: '33333333-3333-4333-8333-333333333333',
      mimeType: 'image/png',
      width: 1000,
      height: 1000,
      persisted: true,
      verified: true
    })
  });
  const outcome = await harness.run();
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'OUTPUT_COMPOSITION_CHANGED');
  assert.equal(harness.settleCalls(), 0);
  assert.equal(harness.releases[0].errorCode, 'OUTPUT_COMPOSITION_CHANGED');
});

test('task runner registry maps DELETE-style cancellation to its active signal', async () => {
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const registry = createTaskRunnerRegistry(async ({ signal }) => {
    started();
    return new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve({ cancelled: true }), { once: true });
    });
  });
  const pending = registry.start({ taskId: TASK_ID });
  await ready;
  assert.equal(registry.has(TASK_ID), true);
  assert.equal(registry.cancel(TASK_ID), true);
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(registry.activeCount(), 0);
});

test('provider concurrency queue removes an aborted old-photo request immediately', async () => {
  const semaphore = createSemaphore(1, 4);
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = semaphore.run(async () => firstGate);
  await Promise.resolve();

  const controller = new AbortController();
  const queued = semaphore.run(async () => 'must-not-run', controller.signal);
  assert.equal(semaphore.stats().queued, 1);
  controller.abort();
  await assert.rejects(queued, { name: 'AbortError', code: 'ABORT_ERR' });
  assert.equal(semaphore.stats().queued, 0);
  releaseFirst('done');
  assert.equal(await first, 'done');
});

test('request disconnect aborts work while a normally finished 202 response does not', () => {
  const abortedRequest = new EventEmitter();
  abortedRequest.aborted = false;
  const abortedResponse = new EventEmitter();
  abortedResponse.writableFinished = false;
  const disconnected = createRequestAbortController(abortedRequest, abortedResponse);
  abortedRequest.emit('aborted');
  assert.equal(disconnected.signal.aborted, true);

  const completedRequest = new EventEmitter();
  completedRequest.aborted = false;
  const completedResponse = new EventEmitter();
  completedResponse.writableFinished = true;
  const accepted = createRequestAbortController(completedRequest, completedResponse);
  completedResponse.emit('finish');
  completedResponse.emit('close');
  assert.equal(accepted.signal.aborted, false);
});

test('old-photo remote output guard blocks loopback and private networks', () => {
  for (const address of [
    '127.0.0.1', '10.0.0.1', '169.254.1.1', '172.16.0.1',
    '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1'
  ]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  assert.equal(isPrivateIp('1.1.1.1'), false);
});

test('provider octet-stream outputs require a fully valid PNG or JPEG', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av9Z5AAAAABJRU5ErkJggg==',
    'base64'
  );
  assert.equal(await validateProviderOutputMime(png, 'application/octet-stream'), 'image/png');
  await assert.rejects(
    validateProviderOutputMime(Buffer.from('not an image'), 'application/octet-stream'),
    { code: 'INVALID_PROVIDER_OUTPUT_TYPE' }
  );
  await assert.rejects(
    validateProviderOutputMime(png, 'text/html'),
    { code: 'INVALID_PROVIDER_OUTPUT_TYPE' }
  );
});

test('old-photo production output requires an allowlisted host and pins verified DNS', async () => {
  let lookups = 0;
  const resolver = async () => {
    lookups += 1;
    return [{ address: '1.1.1.1', family: 4 }];
  };
  await assert.rejects(
    assertPublicOutputUrl(
      'https://cdn.provider.example/result.png',
      { NODE_ENV: 'production' },
      resolver
    ),
    { code: 'PROVIDER_OUTPUT_HOST_NOT_ALLOWED' }
  );
  assert.equal(lookups, 0);

  const checked = await assertPublicOutputUrl(
    'https://images.provider.example/result.png',
    { NODE_ENV: 'production', OLD_PHOTO_OUTPUT_HOSTS: 'provider.example' },
    resolver
  );
  assert.equal(checked.resolvedAddress, '1.1.1.1');
  assert.equal(checked.resolvedFamily, 4);

  const lookup = createPinnedLookup(checked.resolvedAddress, checked.resolvedFamily);
  const pinned = await new Promise((resolve, reject) => {
    lookup('images.provider.example', {}, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
  assert.deepEqual(pinned, { address: '1.1.1.1', family: 4 });

  const pinnedAll = await new Promise((resolve, reject) => {
    lookup('images.provider.example', { all: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });
  assert.deepEqual(pinnedAll, [{ address: '1.1.1.1', family: 4 }]);

  const pinnedWithoutOptions = await new Promise((resolve, reject) => {
    lookup('images.provider.example', (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
  assert.deepEqual(pinnedWithoutOptions, { address: '1.1.1.1', family: 4 });
});
