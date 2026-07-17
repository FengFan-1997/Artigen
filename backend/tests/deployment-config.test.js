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
