#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
const normalizePoolSize = (name, fallback, maximum) => {
  const raw = String(process.env[name] ?? fallback).trim();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 2 || value > maximum) {
    throw new TypeError(`${name}_INVALID`);
  }
  return String(value);
};
const actorProfile = String(
  process.env.AGENT_RUNTIME_ACTOR_PROFILE || 'stable-v1'
).trim();
if (!['stable-v1', 'exploratory-v1'].includes(actorProfile)) {
  throw new TypeError('AGENT_RUNTIME_ACTOR_PROFILE_INVALID');
}
const workerRuntimeSettings = Object.freeze({
  AGENT_RUNTIME_V2_ENABLED: normalizeBoolean('AGENT_RUNTIME_V2_ENABLED'),
  AGENT_RUNTIME_V2_ROLLOUT_PERCENT: normalizePercent('AGENT_RUNTIME_V2_ROLLOUT_PERCENT'),
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
  AGENT_RUNTIME_ACTOR_PROFILE: actorProfile,
  PG_POOL_MAX: normalizePoolSize('PG_POOL_MAX', production ? 10 : 3, 30),
  PGBOSS_POOL_MAX: normalizePoolSize('PGBOSS_POOL_MAX', production ? 5 : 2, 20),
  AGENT_PGBOSS_POOL_MAX: normalizePoolSize(
    'AGENT_PGBOSS_POOL_MAX',
    production ? 3 : 2,
    10
  )
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
