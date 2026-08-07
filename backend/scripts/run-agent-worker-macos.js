#!/usr/bin/env node

const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { readMacOsKeychainSecret } = require('../lib/local-keychain');

const root = path.resolve(__dirname, '../..');
const backendRoot = path.resolve(__dirname, '..');
const profile = String(process.argv[2] || 'dev').trim().toLowerCase();
if (!['dev', 'production'].includes(profile)) {
  console.error('AGENT_WORKER_PROFILE_INVALID');
  process.exit(64);
}

const docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const dockerCheck = spawnSync(docker, ['info', '--format', '{{.ServerVersion}}'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
  timeout: 10_000
});
if (dockerCheck.status !== 0) {
  console.error('AGENT_DOCKER_UNAVAILABLE');
  process.exit(75);
}

const workerEnv = { ...process.env };
{
  const defaultService = profile === 'production'
    ? 'artigen-agent-production-worker'
    : 'artigen-agent-dev-worker';
  const service = String(
    process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || defaultService
  ).trim();
  const secretNames = [
    'DATABASE_URL',
    'AGENT_PAYLOAD_ENCRYPTION_KEY',
    'SILICONFLOW_API_KEY',
    'AGENT_WORKER_RELAY_SECRET',
    'AGENT_WORKER_RELAY_URL',
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY'
  ];
  const missing = [];
  for (const name of secretNames) {
    const value = readMacOsKeychainSecret({ service, account: name });
    if (!value) missing.push(name);
    else workerEnv[name] = value;
  }
  if (missing.length) {
    console.error(`AGENT_${profile.toUpperCase()}_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
    process.exit(78);
  }
  Object.assign(workerEnv, {
    NODE_ENV: 'production',
    AGENT_FEATURE_ENABLED: 'true',
    AGENT_WORKER_ENABLED: '1',
    AGENT_RUNTIME_DRIVER: 'live',
    AGENT_MODEL_PROVIDER: 'siliconflow',
    AGENT_MODEL_NAME: 'Qwen/Qwen3-8B',
    AGENT_SILICONFLOW_BASE_URL: 'https://api.siliconflow.cn/v1',
    AGENT_SILICONFLOW_ENABLE_THINKING: 'false',
    AGENT_SANDBOX_PROVIDER: 'cua',
    AGENT_SANDBOX_MODE: 'local',
    AGENT_CUA_IMAGE_REF: 'artigen/cua-xfce:0.1.15-tools-v2',
    AGENT_CUA_IMAGE_HAS_TOOLCHAIN: 'true',
    AGENT_SANDBOX_EGRESS_POLICY: 'restricted-v1',
    AGENT_BROWSER_MODE: 'full-approval-v1',
    AGENT_WORKER_ID: process.env.AGENT_WORKER_ID || (
      profile === 'production' ? 'artigen-production-mac-1' : 'artigen-dev-mac-1'
    ),
    AGENT_PUBLIC_CAPABILITIES: 'files,shell,browser',
    AGENT_MAX_MINUTES: '45',
    AGENT_MAX_STEPS: '120',
    AGENT_MEMORY_MB: '4096',
    AGENT_DISK_GB: '10',
    AGENT_WORKER_CONCURRENCY: '1',
    ASSET_STORAGE_DRIVER: 's3',
    S3_FORCE_PATH_STYLE: '1',
    CUA_PYTHON: path.join(backendRoot, '.venv-agent/bin/python'),
    ARTIGEN_AGENT_PROFILE: profile
  });
}

const child = spawn('/usr/bin/caffeinate', [
  '-i',
  '-s',
  process.execPath,
  path.join(backendRoot, 'scripts/start-agent-worker.js')
], {
  cwd: root,
  env: workerEnv,
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.once('error', (error) => {
  console.error(`AGENT_WORKER_LAUNCH_FAILED:${error.code || error.message}`);
  process.exitCode = 70;
});
child.once('exit', (code, signal) => {
  if (signal) console.error(`AGENT_WORKER_EXITED:${signal}`);
  process.exitCode = Number.isInteger(code) ? code : 1;
});
