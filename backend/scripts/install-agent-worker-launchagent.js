#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveAgentWorkerPoolProfile } = require('./lib/agent-worker-pool-profile');

const profile = String(process.argv[2] || '').trim().toLowerCase();
if (!['dev', 'production'].includes(profile)) {
  console.error('Usage: node backend/scripts/install-agent-worker-launchagent.js dev|production');
  process.exit(64);
}
const production = profile === 'production';
if (process.platform !== 'darwin') {
  console.error('AGENT_LAUNCHAGENT_MACOS_ONLY');
  process.exit(64);
}

const root = path.resolve(__dirname, '../..');
const label = `com.artigen.agent-worker-${profile}`;
const launchAgents = path.join(os.homedir(), 'Library/LaunchAgents');
const logDir = path.join(os.homedir(), 'Library/Logs/Artigen');
const plistPath = path.join(launchAgents, `${label}.plist`);
const runner = path.join(root, 'backend/scripts/run-agent-worker-macos.js');
const subagentsEnabled = /^(1|true|yes|on)$/i.test(
  String(process.env.ARTIGEN_AGENT_SUBAGENTS_ENABLED || '').trim()
);
const modelProvider = String(
  process.env.AGENT_MODEL_PROVIDER || 'cloudflare'
)
  .trim()
  .toLowerCase();
if (!['siliconflow', 'cloudflare'].includes(modelProvider)) {
  throw new TypeError('AGENT_LAUNCHAGENT_MODEL_PROVIDER_INVALID');
}
if (modelProvider !== 'cloudflare') {
  throw new TypeError('AGENT_CLOUDFLARE_TEXT_MODEL_REQUIRED');
}
const modelName = '@cf/openai/gpt-oss-120b';
const normalizeBoolean = (name, fallback = false) => {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw) return fallback ? 'true' : 'false';
  if (/^(1|true|yes|on)$/i.test(raw)) return 'true';
  if (/^(0|false|no|off)$/i.test(raw)) return 'false';
  throw new TypeError(`${name}_INVALID`);
};
const normalizePercent = (name, fallback = 0) => {
  const raw = String(process.env[name] ?? fallback).trim();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new TypeError(`${name}_INVALID`);
  }
  return String(value);
};
const normalizePositiveNumber = (name, fallback) => {
  const raw = String(process.env[name] ?? fallback).trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name}_INVALID`);
  return String(value);
};
const normalizeCloudflareAccountId = () => {
  const value = String(process.env.AGENT_CLOUDFLARE_FREE_ACCOUNT_ID || '').trim();
  if (modelProvider === 'cloudflare' && !/^[0-9a-f]{32}$/i.test(value)) {
    throw new TypeError('AGENT_CLOUDFLARE_FREE_ACCOUNT_ID_INVALID');
  }
  return value;
};
const actorProfile = String(
  process.env.AGENT_RUNTIME_ACTOR_PROFILE || 'stable-v1'
).trim();
if (!['stable-v1', 'exploratory-v1'].includes(actorProfile)) {
  throw new TypeError('AGENT_RUNTIME_ACTOR_PROFILE_INVALID');
}
const workerRuntimeSettings = Object.freeze({
  ...(!production ? { DEV_DATABASE_EXPECTED_MAJOR: '18' } : {}),
  AGENT_MODEL_PROVIDER: modelProvider,
  AGENT_MODEL_NAME: modelName,
  AGENT_TEXT_MODEL_HARD_LOCK: 'true',
  AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED: modelProvider === 'cloudflare'
    ? normalizeBoolean('AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED')
    : 'false',
  AGENT_CLOUDFLARE_FREE_ACCOUNT_ID: normalizeCloudflareAccountId(),
  AGENT_RUNTIME_V2_ENABLED: production
    ? normalizeBoolean('AGENT_RUNTIME_V2_ENABLED')
    : 'false',
  AGENT_RUNTIME_V2_ROLLOUT_PERCENT: production
    ? normalizePercent('AGENT_RUNTIME_V2_ROLLOUT_PERCENT')
    : '0',
  AGENT_RUNTIME_V2_CANARY_USER_IDS: production
    ? String(process.env.AGENT_RUNTIME_V2_CANARY_USER_IDS || '').trim()
    : '',
  DESIGN_PLANNER_V2_ENABLED: normalizeBoolean('DESIGN_PLANNER_V2_ENABLED'),
  AGENT_ADAPTIVE_REASONING_ENABLED: normalizeBoolean('AGENT_ADAPTIVE_REASONING_ENABLED'),
  AGENT_PROJECT_MEMORY_ENABLED: normalizeBoolean('AGENT_PROJECT_MEMORY_ENABLED'),
  AGENT_PROVIDER_SCHEDULER_ENABLED: normalizeBoolean('AGENT_PROVIDER_SCHEDULER_ENABLED'),
  AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: normalizePositiveNumber(
    'AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION',
    20
  ),
  AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION: normalizePositiveNumber(
    'AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION',
    160
  ),
  AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION: normalizePositiveNumber(
    'AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION',
    0.35
  ),
  AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION: normalizePositiveNumber(
    'AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION',
    0.75
  ),
  AGENT_RUNTIME_ACTOR_PROFILE: actorProfile,
  ...resolveAgentWorkerPoolProfile({ profile, env: process.env })
});
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

fs.mkdirSync(launchAgents, { recursive: true, mode: 0o700 });
fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
const keychainService = production
  ? 'artigen-agent-production-worker'
  : 'artigen-agent-dev-worker';
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(runner)}</string>
    <string>${profile}</string>
  </array>
  <key>WorkingDirectory</key><string>${escapeXml(root)}</string>
  <key>RunAtLoad</key><${production ? 'true' : 'false'}/>
  <key>KeepAlive</key>
  ${production ? '<dict><key>SuccessfulExit</key><false/></dict>' : '<false/>'}
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>Umask</key><integer>63</integer>
  <key>StandardOutPath</key><string>${escapeXml(path.join(logDir, `${label}.log`))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(logDir, `${label}.error.log`))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>ARTIGEN_AGENT_KEYCHAIN_SERVICE</key><string>${keychainService}</string>
    <key>AGENT_SUBAGENTS_ENABLED</key><string>${subagentsEnabled ? 'true' : 'false'}</string>
${Object.entries(workerRuntimeSettings)
  .map(([name, value]) => `    <key>${name}</key><string>${escapeXml(value)}</string>`)
  .join('\n')}
  </dict>
</dict>
</plist>
`;
fs.writeFileSync(plistPath, plist, { mode: 0o600 });
console.log(plistPath);
console.log(`Subagents: ${subagentsEnabled ? 'enabled' : 'disabled'}`);
console.log(`Runtime V2: ${workerRuntimeSettings.AGENT_RUNTIME_V2_ENABLED}`);
console.log(`Runtime V2 rollout: ${workerRuntimeSettings.AGENT_RUNTIME_V2_ROLLOUT_PERCENT}%`);
console.log(production
  ? `Install after Keychain setup: launchctl bootstrap gui/${process.getuid()} ${plistPath}`
  : `Start on demand: launchctl bootstrap gui/${process.getuid()} ${plistPath}; launchctl kickstart -k gui/${process.getuid()}/${label}`);
