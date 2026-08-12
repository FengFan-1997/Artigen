const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');

const readRepoFile = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const workflowEnvValue = (workflow, name) => {
  const match = workflow.match(
    new RegExp(`^\\s+${name}:\\s*(?:"([^"]*)"|'([^']*)'|([^\\s#]+))`, 'm')
  );
  return String(match?.[1] || match?.[2] || match?.[3] || '');
};

test('Render keeps same-origin frontend bases and uses shallow liveness', () => {
  const blueprint = readRepoFile('render.yaml');

  assert.match(
    blueprint,
    /buildCommand:.*VITE_API_BASE='' VITE_AGENT_API_BASE='' pnpm build/
  );
  assert.match(blueprint, /^\s+healthCheckPath:\s*\/healthz\s*$/m);
  assert.doesNotMatch(blueprint, /^\s+healthCheckPath:\s*\/readyz\s*$/m);
  assert.match(blueprint, /^\s+- key: APP_ORIGIN\s*\n\s+sync: false\s*$/m);
  assert.match(blueprint, /^\s+- key: GOOGLE_OAUTH_CLIENT_ID\s*\n\s+sync: false\s*$/m);
  assert.match(blueprint, /^\s+- key: TURNSTILE_HOSTNAMES\s*\n\s+sync: false\s*$/m);
});

test('CI configures a distinct session-token hashing secret', () => {
  const workflow = readRepoFile('.github/workflows/ci.yml');
  const csrfSecret = workflowEnvValue(workflow, 'CSRF_SECRET');
  const otpSecret = workflowEnvValue(workflow, 'OTP_HMAC_SECRET');
  const sessionSecret = workflowEnvValue(workflow, 'SESSION_TOKEN_HASH_SECRET');

  assert.ok(sessionSecret);
  assert.notEqual(sessionSecret, csrfSecret);
  assert.notEqual(sessionSecret, otpSecret);
});

test('Mac Agent worker pins image pricing and the SiliconFlow output host', () => {
  const runner = readRepoFile('backend/scripts/run-agent-worker-macos.js');

  assert.match(runner, /AGENT_PUBLIC_CAPABILITIES:\s*'files,shell,browser,generate_images'/);
  assert.match(runner, /AGENT_IMAGE_CREDITS:[\s\S]*\|\| '8'/);
  assert.match(runner, /AGENT_IMAGE_REFERENCE_CREDITS:[\s\S]*\|\| '12'/);
  assert.match(runner, /AGENT_MODEL_NAME:\s*'Qwen\/Qwen3-8B'/);
  assert.match(runner, /AI_OUTPUT_ALLOWED_HOSTS:[\s\S]*\|\| 's3\.siliconflow\.cn'/);
});

test('runtime model allowlist contains only Qwen3-8B and Kolors', () => {
  const runtime = [
    'backend/lib/config.js',
    'backend/lib/ai-providers.js',
    'backend/lib/memory-manager.js',
    'backend/routes/system.js',
    'backend/services/agent-config.js',
    'backend/services/generation-profiles.js',
    'backend/services/generation-provider.js',
    'backend/scripts/run-agent-worker-macos.js',
    'frontend/src/agentImg/services/text.ts',
    'render.yaml'
  ].map(readRepoFile).join('\n');

  assert.match(runtime, /Qwen\/Qwen3-8B/);
  assert.match(runtime, /Kwai-Kolors\/Kolors/);
  assert.doesNotMatch(runtime, /Qwen\/Qwen-Image-Edit-2509/);
  assert.doesNotMatch(runtime, /Qwen\/Qwen2\.5/);
  assert.doesNotMatch(runtime, /FIXED_SILICONFLOW_EDIT_MODEL|GENERATION_EDIT_MODEL/);
  assert.doesNotMatch(runtime, /callGeminiGenerate|generativelanguage\.googleapis\.com/);
});
