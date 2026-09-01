const assert = require('node:assert/strict');
const test = require('node:test');
const {
  callCloudflareChat,
  callSiliconFlowChat,
  callSiliconFlowImageGenerate
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

test('SiliconFlow chat uses the supported endpoint and serializes non-thinking mode', async () => {
  let request;
  const result = await callSiliconFlowChat({
    messages: [{ role: 'user', content: 'Return JSON only.' }],
    timeoutMs: 120_000,
    maxTokens: 1800,
    model: GENERATION_DIRECTIONS_MODEL,
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
    model: GENERATION_DIRECTIONS_MODEL,
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
    model: GENERATION_DIRECTIONS_MODEL,
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
