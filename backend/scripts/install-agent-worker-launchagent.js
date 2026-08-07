#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profile = String(process.argv[2] || '').trim().toLowerCase();
if (!['dev', 'production'].includes(profile)) {
  console.error('Usage: node backend/scripts/install-agent-worker-launchagent.js dev|production');
  process.exit(64);
}
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
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

fs.mkdirSync(launchAgents, { recursive: true, mode: 0o700 });
fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
const production = profile === 'production';
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
  <key>StandardOutPath</key><string>${escapeXml(path.join(logDir, `${label}.log`))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(logDir, `${label}.error.log`))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>ARTIGEN_AGENT_KEYCHAIN_SERVICE</key><string>artigen-agent-production-worker</string>
  </dict>
</dict>
</plist>
`;
fs.writeFileSync(plistPath, plist, { mode: 0o600 });
console.log(plistPath);
console.log(production
  ? `Install after Keychain setup: launchctl bootstrap gui/${process.getuid()} ${plistPath}`
  : `Start on demand: launchctl bootstrap gui/${process.getuid()} ${plistPath}; launchctl kickstart -k gui/${process.getuid()}/${label}`);
