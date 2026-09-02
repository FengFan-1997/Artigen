const assert = require('node:assert/strict');
const test = require('node:test');
const {
  callCloudflareChat,
  callSiliconFlowChat,
  callSiliconFlowImageGenerate,
  callTextGenerate
} = require('../lib/ai-providers');
const {
  GENERATION_DIRECTIONS_MODEL,
  GENERATION_IMAGE_MODEL
} = require('../services/generation-profiles');

test('Cloudflare chat is pinned to the account API and omits SiliconFlow thinking fields', async () => {
  let request;
  const result = await callCloudflareChat({
    accountId: 'e'.repeat(32),
    freeAccountAttested: true,
    freeAccountId: 'e'.repeat(32),
    credential: 'cloudflare-test-token',
    messages: [{ role: 'user', content: 'Return JSON only.' }],
    maxTokens: 1200,
    model: '@cf/openai/gpt-oss-120b',
    enableThinking: true,
    minP: 0,
    responseFormat: 'json_object',
    skipRateGate: true,
    fetcher: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' } }]
        })
      };
    }
  });
  assert.equal(
    request.url,
    `https://api.cloudflare.com/client/v4/accounts/${'e'.repeat(32)}/ai/v1/chat/completions`
  );
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, '@cf/openai/gpt-oss-120b');
  assert.equal(payload.enable_thinking, undefined);
  assert.equal(payload.min_p, undefined);
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(result.text, '{"ok":true}');
  await assert.rejects(callCloudflareChat({
    accountId: 'e'.repeat(32),
    credential: 'cloudflare-test-token'
  }), { code: 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED' });
});

test('Cloudflare free quota and paid-only failures are terminal while capacity failures remain observable', async () => {
  const accountId = 'e'.repeat(32);
  const invoke = async ({ status, code }) => {
    let requests = 0;
    const promise = callCloudflareChat({
      accountId,
      freeAccountAttested: true,
      freeAccountId: accountId,
      credential: 'cloudflare-test-token',
      messages: [{ role: 'user', content: 'Return JSON only.' }],
      model: '@cf/openai/gpt-oss-120b',
      skipRateGate: true,
      fetcher: async () => {
        requests += 1;
        return {
          ok: false,
          status,
          statusText: 'Provider failure',
          headers: { get: () => null },
          text: async () => JSON.stringify({ errors: [{ code }] })
        };
      }
    });
    return { promise, requests: () => requests };
  };

  const quota = await invoke({ status: 429, code: 3036 });
  await assert.rejects(quota.promise, (error) => {
    assert.equal(error.code, 'AGENT_CLOUDFLARE_FREE_QUOTA_EXHAUSTED');
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(quota.requests(), 1);

  const paid = await invoke({ status: 403, code: 5035 });
  await assert.rejects(paid.promise, (error) => {
    assert.equal(error.code, 'AGENT_CLOUDFLARE_PAID_MODEL_FORBIDDEN');
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(paid.requests(), 1);

  const capacity = await invoke({ status: 429, code: 3040 });
  await assert.rejects(capacity.promise, (error) => {
    assert.equal(error.code, undefined);
    assert.equal(error.failures[0].status, 429);
    return true;
  });
  assert.equal(capacity.requests(), 1);
});

test('generic text generation dispatches Cloudflare when SiliconFlow is absent', async () => {
  const previous = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = 'cloudflare-test-token';
  const calls = [];
  try {
    const result = await callTextGenerate({
      providerName: 'cloudflare',
      model: '@cf/openai/gpt-oss-120b',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      chatGenerate: async (input) => {
        calls.push(input);
        return { text: 'ok', model: input.model, usage: { promptTokens: 1, completionTokens: 1 } };
      }
    });
    assert.equal(result.provider, 'cloudflare');
    assert.equal(result.model, '@cf/openai/gpt-oss-120b');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, '@cf/openai/gpt-oss-120b');
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previous;
  }
});

test('generic text generation honors a Keychain-resolved provider readiness attestation', async () => {
  const calls = [];
  const result = await callTextGenerate({
    providerName: 'cloudflare',
    model: '@cf/openai/gpt-oss-120b',
    providerReady: true,
    contents: [{ role: 'user', parts: [{ text: 'keychain-backed request' }] }],
    chatGenerate: async (input) => {
      calls.push(input);
      return { text: 'ok', model: input.model, usage: { promptTokens: 2, completionTokens: 1 } };
    }
  });
  assert.equal(result.provider, 'cloudflare');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, '@cf/openai/gpt-oss-120b');
});

test('generic Cloudflare text generation fails closed when readiness is explicitly false', async () => {
  await assert.rejects(callTextGenerate({
    providerName: 'cloudflare',
    model: '@cf/openai/gpt-oss-120b',
    providerReady: false,
    contents: [{ role: 'user', parts: [{ text: 'should not dispatch' }] }],
    chatGenerate: async () => { throw new Error('must not dispatch'); }
  }), { code: 'AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED', status: 503 });
});

test('SiliconFlow chat uses the supported endpoint and serializes non-thinking mode', async () => {
  let request;
  const result = await callSiliconFlowChat({
    messages: [{ role: 'user', content: 'Return JSON only.' }],
    timeoutMs: 120_000,
    maxTokens: 1800,
    // Legacy transport contract is retained only for historical fixtures;
    // deployed text calls use Cloudflare GPT-OSS.
    model: 'Qwen/Qwen3-8B',
    enableThinking: false,
    credential: 'test-key',
    fetcher: async (url, options, timeoutMs) => {
      request = { url, options, timeoutMs };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' } }]
        })
      };
    }
  });

  assert.equal(request.url, 'https://api.siliconflow.cn/v1/chat/completions');
  assert.equal(request.timeoutMs, 120_000);
  assert.deepEqual(JSON.parse(request.options.body), {
    model: 'Qwen/Qwen3-8B',
    messages: [{ role: 'user', content: 'Return JSON only.' }],
    max_tokens: 1800,
    enable_thinking: false
  });
  assert.equal(result.text, '{"ok":true}');
});

test('SiliconFlow chat preserves Retry-After for the shared scheduler', async () => {
  await assert.rejects(callSiliconFlowChat({
    messages: [{ role: 'user', content: 'Return JSON only.' }],
    timeoutMs: 120_000,
    maxTokens: 1800,
    model: 'Qwen/Qwen3-8B',
    enableThinking: false,
    skipRateGate: true,
    credential: 'test-key',
    fetcher: async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: { get: (name) => name.toLowerCase() === 'retry-after' ? '12' : null },
      text: async () => '{"message":"rate limited"}'
    })
  }), (error) => {
    assert.equal(error.retryAfter, '12');
    assert.equal(error.failures[0].retryAfter, '12');
    return true;
  });
});

test('Kolors handles text-to-image and exactly one generic image input', async () => {
  const requests = [];
  const fetcher = async (url, options, timeoutMs) => {
    requests.push({ url, options, timeoutMs });
    return {
      ok: true,
      text: async () => JSON.stringify({ images: [{ url: 'https://assets.example/output.png' }] })
    };
  };
  const common = {
    prompt: 'A controlled product scene',
    params: { imageSize: '960x1200', seed: 7 },
    timeoutMs: 120_000,
    model: GENERATION_IMAGE_MODEL,
    credential: 'test-key',
    fetcher
  };

  await callSiliconFlowImageGenerate({ ...common, images: [] });
  await callSiliconFlowImageGenerate({
    ...common,
    images: [{ mimeType: 'image/png', dataBase64: 'YWJj' }]
  });

  const textBody = JSON.parse(requests[0].options.body);
  const imageBody = JSON.parse(requests[1].options.body);
  assert.equal(textBody.model, GENERATION_IMAGE_MODEL);
  assert.equal(textBody.image, undefined);
  assert.equal(imageBody.model, GENERATION_IMAGE_MODEL);
  assert.equal(imageBody.image, 'data:image/png;base64,YWJj');
  assert.equal(imageBody.image2, undefined);
  assert.equal(imageBody.image3, undefined);
  await assert.rejects(callSiliconFlowImageGenerate({
    ...common,
    images: [
      { mimeType: 'image/png', dataBase64: 'YWJj' },
      { mimeType: 'image/png', dataBase64: 'ZGVm' }
    ]
  }), { code: 'REFERENCE_IMAGES_NOT_SUPPORTED' });
  await assert.rejects(callSiliconFlowImageGenerate({
    ...common,
    images: ['not-a-valid-image']
  }), { code: 'INVALID_REFERENCE_IMAGE' });
  assert.equal(requests.length, 2);
});
