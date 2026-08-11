const assert = require('node:assert/strict');
const test = require('node:test');
const { callSiliconFlowChat } = require('../lib/ai-providers');
const { GENERATION_DIRECTIONS_MODEL } = require('../services/generation-profiles');

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
