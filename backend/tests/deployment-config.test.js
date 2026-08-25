const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
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
  const installer = readRepoFile('backend/scripts/install-agent-worker-launchagent.js');

  assert.match(runner, /\.\.\.\(subagentsEnabled \? \['subagents'\] : \[\]\)/);
  assert.match(runner, /AGENT_SUBAGENTS_ENABLED:\s*subagentsEnabled \? 'true' : 'false'/);
  assert.match(runner, /AGENT_IMAGE_CREDITS:[\s\S]*\|\| '8'/);
  assert.match(runner, /AGENT_IMAGE_REFERENCE_CREDITS:[\s\S]*\|\| '12'/);
  assert.match(runner, /AGENT_MODEL_NAME:\s*'Qwen\/Qwen3-8B'/);
  assert.match(runner, /AI_OUTPUT_ALLOWED_HOSTS:[\s\S]*\|\| 's3\.siliconflow\.cn'/);
  assert.match(installer, /ARTIGEN_AGENT_SUBAGENTS_ENABLED/);
  assert.match(installer, /<key>AGENT_SUBAGENTS_ENABLED<\/key>/);
  assert.match(installer, /<key>\$\{name\}<\/key>/);
  assert.match(installer, /AGENT_RUNTIME_V2_ENABLED/);
  assert.match(installer, /AGENT_RUNTIME_V2_ROLLOUT_PERCENT/);
  assert.match(installer, /DESIGN_PLANNER_V2_ENABLED/);
  assert.match(installer, /AGENT_ADAPTIVE_REASONING_ENABLED/);
  assert.match(installer, /AGENT_PROJECT_MEMORY_ENABLED/);
  assert.match(installer, /AGENT_PROVIDER_SCHEDULER_ENABLED/);
  assert.match(installer, /AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION/);
  assert.match(installer, /AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION/);
  assert.match(installer, /AGENT_RUNTIME_ACTOR_PROFILE/);
});

test('Mac Agent installer persists the reviewed V2 launch profile', () => {
  const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), 'artigen-launch-profile-'));
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'backend/scripts/install-agent-worker-launchagent.js'), 'dev'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: temporaryHome,
          ARTIGEN_AGENT_SUBAGENTS_ENABLED: 'true',
          AGENT_RUNTIME_V2_ENABLED: 'true',
          AGENT_RUNTIME_V2_ROLLOUT_PERCENT: '0',
          DESIGN_PLANNER_V2_ENABLED: 'true',
          AGENT_ADAPTIVE_REASONING_ENABLED: 'true',
          AGENT_PROJECT_MEMORY_ENABLED: 'false',
          AGENT_PROVIDER_SCHEDULER_ENABLED: 'true',
          AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: '20',
          AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION: '160',
          AGENT_RUNTIME_ACTOR_PROFILE: 'stable-v1'
        }
      }
    );
    assert.equal(result.status, 0, result.stderr);
    const plist = fs.readFileSync(path.join(
      temporaryHome,
      'Library/LaunchAgents/com.artigen.agent-worker-dev.plist'
    ), 'utf8');
    for (const [name, value] of Object.entries({
      AGENT_SUBAGENTS_ENABLED: 'true',
      AGENT_RUNTIME_V2_ENABLED: 'true',
      AGENT_RUNTIME_V2_ROLLOUT_PERCENT: '0',
      DESIGN_PLANNER_V2_ENABLED: 'true',
      AGENT_ADAPTIVE_REASONING_ENABLED: 'true',
      AGENT_PROJECT_MEMORY_ENABLED: 'false',
      AGENT_PROVIDER_SCHEDULER_ENABLED: 'true',
      AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: '20',
      AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION: '160',
      AGENT_RUNTIME_ACTOR_PROFILE: 'stable-v1'
    })) {
      assert.match(plist, new RegExp(`<key>${name}<\\/key><string>${value}<\\/string>`));
    }
  } finally {
    fs.rmSync(temporaryHome, { recursive: true, force: true });
  }
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
