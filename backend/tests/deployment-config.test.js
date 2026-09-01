const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const {
  resolveAgentWorkerPoolProfile
} = require('../scripts/lib/agent-worker-pool-profile');

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

test('Render DEV blueprint preserves Aiven free-tier connection and TLS boundaries', () => {
  const blueprint = readRepoFile('render.dev.yaml');

  for (const [name, value] of Object.entries({
    PG_POOL_MAX: '3',
    DEV_DATABASE_EXPECTED_MAJOR: '18',
    PG_SSL_REQUIRED: '1',
    PG_SSL_REJECT_UNAUTHORIZED: '1',
    PGBOSS_SCHEMA: 'pgboss',
    PGBOSS_POOL_MAX: '2',
    AGENT_PGBOSS_POOL_MAX: '2',
    ASSET_STORAGE_DRIVER: 's3',
    S3_FORCE_PATH_STYLE: '1'
  })) {
    assert.match(
      blueprint,
      new RegExp(`^\\s+- key: ${name}\\s*\\n\\s+value: ["']?${value}["']?\\s*$`, 'm')
    );
  }
  for (const name of [
    'DATABASE_URL',
    'DATABASE_MIGRATION_URL',
    'DEV_DATABASE_EXPECTED_HOST',
    'PG_SSL_CA_BASE64',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY'
  ]) {
    assert.match(
      blueprint,
      new RegExp(`^\\s+- key: ${name}\\s*\\n\\s+sync: false\\s*$`, 'm')
    );
  }
  assert.match(
    blueprint,
    /^\s+- key: AGENT_RUNTIME_V2_ENABLED\s*\n\s+value: "false"\s*$/m
  );
  assert.match(
    blueprint,
    /^\s+- key: AGENT_RUNTIME_V2_ROLLOUT_PERCENT\s*\n\s+value: "0"\s*$/m
  );
  assert.match(
    blueprint,
    /^\s+- key: AGENT_RUNTIME_V2_CANARY_USER_IDS\s*\n\s+value: ""\s*$/m
  );
});

test('Mac DEV worker connection caps are fixed and cannot be overridden', () => {
  assert.deepEqual(resolveAgentWorkerPoolProfile({ profile: 'dev', env: {} }), {
    PG_POOL_MAX: '3',
    PGBOSS_POOL_MAX: '2',
    AGENT_PGBOSS_POOL_MAX: '2'
  });
  for (const [name, value] of [
    ['PG_POOL_MAX', '4'],
    ['PGBOSS_POOL_MAX', '3'],
    ['AGENT_PGBOSS_POOL_MAX', '3']
  ]) {
    assert.throws(
      () => resolveAgentWorkerPoolProfile({ profile: 'dev', env: { [name]: value } }),
      new RegExp(`${name}_DEV_FIXED`)
    );
  }
  assert.deepEqual(resolveAgentWorkerPoolProfile({ profile: 'production', env: {} }), {
    PG_POOL_MAX: '10',
    PGBOSS_POOL_MAX: '5',
    AGENT_PGBOSS_POOL_MAX: '3'
  });
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

test('Mac Agent worker pins free text models, image pricing and the SiliconFlow output host', () => {
  const runner = readRepoFile('backend/scripts/run-agent-worker-macos.js');
  const installer = readRepoFile('backend/scripts/install-agent-worker-launchagent.js');

  assert.match(runner, /\.\.\.\(subagentsEnabled \? \['subagents'\] : \[\]\)/);
  assert.match(runner, /AGENT_SUBAGENTS_ENABLED:\s*subagentsEnabled \? 'true' : 'false'/);
  assert.match(runner, /AGENT_IMAGE_CREDITS:[\s\S]*\|\| '8'/);
  assert.match(runner, /AGENT_IMAGE_REFERENCE_CREDITS:[\s\S]*\|\| '12'/);
  assert.match(runner, /AGENT_MODEL_PROVIDER:\s*modelProvider/);
  assert.match(runner, /profile === 'production' \? 'siliconflow' : 'cloudflare'/);
  assert.match(runner, /\? '@cf\/openai\/gpt-oss-120b'[\s\S]*: 'Qwen\/Qwen3-8B'/);
  assert.match(runner, /secretNames\.push\('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'\)/);
  assert.match(runner, /AI_OUTPUT_ALLOWED_HOSTS:[\s\S]*\|\| 's3\.siliconflow\.cn'/);
  assert.match(runner, /optionalSecretNames = \['PG_SSL_CA_BASE64'\]/);
  assert.match(runner, /delete workerEnv\.PG_SSL_CA;/);
  assert.match(runner, /delete workerEnv\.PG_SSL_CA_BASE64;/);
  assert.match(runner, /secretNames\.push\('DEV_DATABASE_EXPECTED_HOST'\)/);
  assert.match(runner, /resolveAgentWorkerPoolProfile/);
  assert.match(runner, /PG_SSL_REQUIRED:\s*'1'/);
  assert.match(runner, /DEV_DATABASE_EXPECTED_MAJOR:\s*'18'/);
  assert.match(readRepoFile('backend/scripts/run-agent-dev-smoke.js'), /026_agent_live_eval_capacity_counter/);
  assert.match(runner, /PG_SSL_REJECT_UNAUTHORIZED:\s*'1'/);
  assert.match(runner, /AGENT_RUNTIME_V2_ENABLED: profile === 'dev'[\s\S]*\? 'false'/);
  assert.match(runner, /AGENT_RUNTIME_V2_ROLLOUT_PERCENT: profile === 'dev'[\s\S]*\? '0'/);
  assert.match(runner, /AGENT_RUNTIME_V2_CANARY_USER_IDS: profile === 'dev'[\s\S]*\? ''/);
  assert.match(installer, /ARTIGEN_AGENT_SUBAGENTS_ENABLED/);
  assert.match(installer, /<key>AGENT_SUBAGENTS_ENABLED<\/key>/);
  assert.match(installer, /<key>\$\{name\}<\/key>/);
  assert.match(installer, /AGENT_RUNTIME_V2_ENABLED/);
  assert.match(installer, /production \? 'siliconflow' : 'cloudflare'/);
  assert.match(installer, /DEV_DATABASE_EXPECTED_MAJOR/);
  assert.match(readRepoFile('backend/scripts/start-agent-worker.js'), /assertDevRuntimeDatabaseBoundary/);
  assert.match(installer, /AGENT_RUNTIME_V2_ROLLOUT_PERCENT/);
  assert.match(installer, /AGENT_RUNTIME_V2_CANARY_USER_IDS/);
  assert.match(installer, /DESIGN_PLANNER_V2_ENABLED/);
  assert.match(installer, /AGENT_ADAPTIVE_REASONING_ENABLED/);
  assert.match(installer, /AGENT_PROJECT_MEMORY_ENABLED/);
  assert.match(installer, /AGENT_PROVIDER_SCHEDULER_ENABLED/);
  assert.match(installer, /AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION/);
  assert.match(installer, /AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION/);
  assert.match(installer, /AGENT_RUNTIME_ACTOR_PROFILE/);
});

test('Mac Agent installer persists the reviewed V2 launch profile', {
  skip: process.platform === 'darwin' ? false : 'macOS-only LaunchAgent integration'
}, () => {
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
          AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED: 'true',
          AGENT_CLOUDFLARE_FREE_ACCOUNT_ID: 'a'.repeat(32),
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
      AGENT_MODEL_PROVIDER: 'cloudflare',
      AGENT_MODEL_NAME: '@cf/openai/gpt-oss-120b',
      AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED: 'true',
      AGENT_CLOUDFLARE_FREE_ACCOUNT_ID: 'a'.repeat(32),
      AGENT_RUNTIME_V2_ENABLED: 'false',
      AGENT_RUNTIME_V2_ROLLOUT_PERCENT: '0',
      AGENT_RUNTIME_V2_CANARY_USER_IDS: '',
      DESIGN_PLANNER_V2_ENABLED: 'true',
      AGENT_ADAPTIVE_REASONING_ENABLED: 'true',
      AGENT_PROJECT_MEMORY_ENABLED: 'false',
      AGENT_PROVIDER_SCHEDULER_ENABLED: 'true',
      AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: '20',
      AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION: '160',
      AGENT_RUNTIME_ACTOR_PROFILE: 'stable-v1',
      PG_POOL_MAX: '3',
      PGBOSS_POOL_MAX: '2',
      AGENT_PGBOSS_POOL_MAX: '2'
    })) {
      assert.match(plist, new RegExp(`<key>${name}<\\/key><string>${value}<\\/string>`));
    }
  } finally {
    fs.rmSync(temporaryHome, { recursive: true, force: true });
  }
});

test('runtime model allowlist contains only the reviewed text models and Kolors', () => {
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
  assert.match(runtime, /@cf\/openai\/gpt-oss-120b/);
  assert.match(runtime, /Kwai-Kolors\/Kolors/);
  assert.doesNotMatch(runtime, /Qwen\/Qwen-Image-Edit-2509/);
  assert.doesNotMatch(runtime, /Qwen\/Qwen2\.5/);
  assert.doesNotMatch(runtime, /FIXED_SILICONFLOW_EDIT_MODEL|GENERATION_EDIT_MODEL/);
  assert.doesNotMatch(runtime, /callGeminiGenerate|generativelanguage\.googleapis\.com/);
});

test('CUA image downloads the pinned Node archive with bounded retries and checksum verification', () => {
  const dockerfile = readRepoFile('backend/agent_runtime/Dockerfile.cua-local');

  assert.match(dockerfile, /ARG NODE_VERSION=20\.20\.2/);
  assert.match(
    dockerfile,
    /curl --fail --show-error --silent --location \\\n\s+--retry 5 --retry-all-errors --retry-delay 2 --retry-max-time 900 \\\n\s+"https:\/\/nodejs\.org\/dist\/v\$\{NODE_VERSION\}\/node-v\$\{NODE_VERSION\}-linux-\$\{node_arch\}\.tar\.xz"/
  );
  assert.match(
    dockerfile,
    /echo "\$\{node_sha\}  \/tmp\/node\.tar\.xz" \| sha256sum --check --strict/
  );
});
