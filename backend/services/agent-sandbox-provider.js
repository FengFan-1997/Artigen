const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
const { ApiError } = require('../lib/api-error');
const { getAgentConfig } = require('./agent-config');

const BRIDGE_PATH = path.resolve(__dirname, '../agent_runtime/cua_bridge.py');
const dockerDesktopBin = '/Applications/Docker.app/Contents/Resources/bin';
const dockerWrapperBin = path.resolve(__dirname, '../agent_runtime/docker-bin');
const realDockerBin = process.platform === 'darwin'
  ? path.join(dockerDesktopBin, 'docker')
  : '/usr/bin/docker';
const FORBIDDEN_SHELL = [
  /169\.254\.169\.254/i,
  /100\.100\.100\.200/i,
  /metadata\.google\.internal/i,
  /\/proc\/(?:1|self)\/root/i,
  /\/(?:host|run\/docker\.sock)(?:\/|\s|$)/i,
  /(?:^|\s)(?:sudo|su)(?:\s|$)/i,
  /(?:iptables|nft|ufw)\s/i,
  /(?:curl|wget).*(?:\|\s*(?:sh|bash)|--output\s+\/usr)/i,
  // Model-authored shell work is intentionally offline. Research belongs in the
  // allowlisted browser or server-side connectors, where destinations are observable.
  /(?:^|[;&|(\n]\s*)(?:curl|wget|fetch|aria2c|nc|ncat|netcat|socat|ssh|scp|sftp|ftp|telnet)\b/i,
  /(?:^|[;&|(\n]\s*)git\s+(?:clone|fetch|pull|push|ls-remote)\b/i,
  /(?:^|[;&|(\n]\s*)(?:pip3?|uv)\s+install\b/i,
  /(?:^|[;&|(\n]\s*)(?:npm|pnpm|yarn|bun)\s+(?:add|install|i)\b/i
];

const assertSafeShell = (script) => {
  const text = String(script || '').trim();
  if (!text || text.length > 30_000) {
    throw new ApiError(400, 'AGENT_SHELL_COMMAND_INVALID');
  }
  if (FORBIDDEN_SHELL.some((pattern) => pattern.test(text))) {
    throw new ApiError(403, 'AGENT_SHELL_COMMAND_FORBIDDEN');
  }
  return text;
};

const extractHttpsOrigins = (value) => {
  const matches = String(value || '').match(/https:\/\/[^\s"'<>|)]+/gi) || [];
  return matches.flatMap((entry) => {
    try {
      return [new URL(entry).origin];
    } catch {
      return [];
    }
  });
};

const assertAllowedOrigins = (value, allowedOrigins = []) => {
  const allowlist = new Set(Array.isArray(allowedOrigins) ? allowedOrigins : []);
  if (!allowlist.size) return true;
  const denied = extractHttpsOrigins(value).find((origin) => !allowlist.has(origin));
  if (denied) {
    throw new ApiError(403, 'AGENT_BROWSER_ORIGIN_FORBIDDEN', { origin: denied });
  }
  return true;
};

const assertComputerOrigins = (actions, allowedOrigins = []) => {
  for (const action of actions || []) {
    if (action?.type === 'type') assertAllowedOrigins(action.text, allowedOrigins);
  }
  return true;
};

const offlineShellScript = (script) => {
  const encoded = Buffer.from(assertSafeShell(script), 'utf8').toString('base64');
  return [
    `printf '%s' '${encoded}'`,
    'base64 -d',
    'bwrap --unshare-net --die-with-parent --new-session --bind / / /bin/bash -se'
  ].join(' | ');
};

const shellReceiptDirectory = (operationId) => {
  const digest = crypto.createHash('sha256')
    .update(String(operationId || ''))
    .digest('hex');
  return `/tmp/artigen-workspace/.artigen/shell-receipts/${digest}`;
};

const shellWithReceiptScript = (script, operationId) => {
  const receiptDir = shellReceiptDirectory(operationId);
  const offlineCommand = offlineShellScript(script);
  return [
    'set -u',
    `receipt_dir='${receiptDir}'`,
    'install -d -m 700 "$receipt_dir"',
    'if test -f "$receipt_dir/done"; then',
    '  base64 -d < "$receipt_dir/stdout.b64"',
    '  base64 -d < "$receipt_dir/stderr.b64" >&2',
    '  exit "$(cat "$receipt_dir/return-code")"',
    'fi',
    'if test -f "$receipt_dir/started"; then',
    '  printf "%s\\n" "AGENT_SHELL_OPERATION_IN_PROGRESS" >&2',
    '  exit 75',
    'fi',
    'printf "%s\\n" "started" > "$receipt_dir/started.tmp"',
    'mv "$receipt_dir/started.tmp" "$receipt_dir/started"',
    'started_epoch="$(date +%s)"',
    'stdout_tmp="$receipt_dir/stdout.$$"',
    'stderr_tmp="$receipt_dir/stderr.$$"',
    'set +e',
    `( ${offlineCommand} ) >"$stdout_tmp" 2>"$stderr_tmp"`,
    'return_code=$?',
    'set -e',
    'finished_epoch="$(date +%s)"',
    'duration_ms=$(( (finished_epoch - started_epoch) * 1000 ))',
    'test "$duration_ms" -ge 0 || duration_ms=0',
    'head -c 12000 "$stdout_tmp" | base64 | tr -d "\\n" > "$receipt_dir/stdout.b64.tmp"',
    'head -c 4000 "$stderr_tmp" | base64 | tr -d "\\n" > "$receipt_dir/stderr.b64.tmp"',
    'printf "%s\\n" "$return_code" > "$receipt_dir/return-code.tmp"',
    'printf "%s\\n" "$duration_ms" > "$receipt_dir/duration-ms.tmp"',
    'mv "$receipt_dir/stdout.b64.tmp" "$receipt_dir/stdout.b64"',
    'mv "$receipt_dir/stderr.b64.tmp" "$receipt_dir/stderr.b64"',
    'mv "$receipt_dir/return-code.tmp" "$receipt_dir/return-code"',
    'mv "$receipt_dir/duration-ms.tmp" "$receipt_dir/duration-ms"',
    'printf "%s\\n" "done" > "$receipt_dir/done.tmp"',
    'mv "$receipt_dir/done.tmp" "$receipt_dir/done"',
    'rm -f "$stdout_tmp" "$stderr_tmp"',
    'base64 -d < "$receipt_dir/stdout.b64"',
    'base64 -d < "$receipt_dir/stderr.b64" >&2',
    'exit "$return_code"'
  ].join('\n');
};

const shellReceiptProbeScript = (operationId) => {
  const receiptDir = shellReceiptDirectory(operationId);
  return [
    'set -eu',
    `receipt_dir='${receiptDir}'`,
    'if test -f "$receipt_dir/done"; then',
    '  printf "%s\\n" "consumed"',
    '  cat "$receipt_dir/return-code"',
    '  cat "$receipt_dir/duration-ms"',
    '  cat "$receipt_dir/stdout.b64"; printf "\\n"',
    '  cat "$receipt_dir/stderr.b64"; printf "\\n"',
    'elif test -f "$receipt_dir/started"; then',
    '  printf "%s\\n" "started"',
    'else',
    '  printf "%s\\n" "missing"',
    'fi'
  ].join('\n');
};

const subagentOfflineShellScript = ({ script, workspacePath, inputPaths = [] }) => {
  const workspace = String(workspacePath || '').trim();
  if (!/^\/tmp\/artigen-workspace\/subagents\/[0-9a-fA-F-]{36}$/.test(workspace)) {
    throw new ApiError(403, 'AGENT_SUBAGENT_WORKSPACE_FORBIDDEN');
  }
  const inputs = [...new Set((Array.isArray(inputPaths) ? inputPaths : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean))];
  if (
    inputs.length > 40 ||
    inputs.some((entry) => !/^\/tmp\/artigen-workspace\/inputs\/[0-9a-fA-F-]{36}\.[A-Za-z0-9]{1,8}$/.test(entry))
  ) {
    throw new ApiError(403, 'AGENT_SUBAGENT_INPUT_PATH_FORBIDDEN');
  }
  const encoded = Buffer.from(assertSafeShell(script), 'utf8').toString('base64');
  const inputMounts = inputs.map((entry) => (
    `--ro-bind '${entry}' '/inputs/${path.posix.basename(entry)}'`
  )).join(' ');
  return [
    'set -eu',
    'umask 077',
    `install -d -o cua -g cua -m 700 '${workspace}'`,
    'mounts=""',
    'test ! -d /lib || mounts="$mounts --ro-bind /lib /lib"',
    'test ! -d /lib64 || mounts="$mounts --ro-bind /lib64 /lib64"',
    'test ! -d /opt || mounts="$mounts --ro-bind /opt /opt"',
    [
      'bwrap --unshare-user --uid 0 --gid 0',
      '--unshare-net --unshare-pid --unshare-ipc --unshare-uts --die-with-parent --new-session',
      '--ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /etc /etc',
      '$mounts --dir /proc --dev /dev --tmpfs /tmp --dir /inputs',
      `--bind '${workspace}' /workspace`,
      inputMounts,
      '--setenv HOME /workspace --setenv TMPDIR /tmp --chdir /workspace',
      `/bin/bash -c "printf '%s' '${encoded}' | base64 -d | /bin/bash -se"`
    ].filter(Boolean).join(' ')
  ].join('\n');
};

const runBridge = ({
  payload,
  config,
  timeoutMs = 120_000,
  spawnImpl = spawn
}) => new Promise((resolve, reject) => {
  const child = spawnImpl(config.cuaPython, [BRIDGE_PATH], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      PATH: [
        dockerWrapperBin,
        process.env.PATH || '',
        process.platform === 'darwin' ? dockerDesktopBin : ''
      ].filter(Boolean).join(path.delimiter),
      ARTIGEN_REAL_DOCKER: process.env.ARTIGEN_REAL_DOCKER || realDockerBin,
      PYTHONPATH: process.env.PYTHONPATH || '',
      CUA_API_KEY: config.cuaApiKey,
      CUA_TELEMETRY_ENABLED: 'false'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const stdout = [];
  const stderr = [];
  let bytes = 0;
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    child.kill('SIGKILL');
    settled = true;
    reject(new ApiError(504, 'AGENT_SANDBOX_TIMEOUT', {
      retryable: true,
      details: {
        command: String(payload?.command || 'unknown').slice(0, 80),
        timeoutMs
      }
    }));
  }, timeoutMs);
  timer.unref?.();
  child.stdout.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > 30 * 1024 * 1024) {
      child.kill('SIGKILL');
      return;
    }
    stdout.push(chunk);
  });
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  child.once('error', (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    reject(new ApiError(503, 'AGENT_SANDBOX_BRIDGE_UNAVAILABLE', {
      retryable: false,
      cause: String(error?.code || '')
    }));
  });
  child.once('close', (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(stdout).toString('utf8'));
    } catch {
      parsed = null;
    }
    if (code !== 0 || parsed?.ok !== true) {
      reject(new ApiError(502, 'AGENT_SANDBOX_PROVIDER_FAILED', {
        retryable: true,
        details: {
          providerCode: String(parsed?.code || ''),
          detail: String(parsed?.error || Buffer.concat(stderr).toString('utf8')).slice(0, 300)
        }
      }));
      return;
    }
    resolve(parsed);
  });
  child.stdin.end(JSON.stringify(payload));
});

class CuaSandboxProvider {
  constructor({ env = process.env, bridge = runBridge } = {}) {
    this.config = getAgentConfig(env);
    this.bridge = bridge;
  }

  probe() {
    return this.bridge({
      config: this.config,
      payload: {
        command: 'doctor',
        local: this.config.sandboxMode === 'local',
        imageRef: this.config.sandboxImageRef,
        dockerPlatform: this.config.sandboxDockerPlatform,
        egressPolicy: this.config.sandboxEgressPolicy
      },
      timeoutMs: 60_000
    });
  }

  async provision({ runId, browserEnabled = false }) {
    const local = this.config.sandboxMode === 'local';
    if (!local && !this.config.cuaApiKey) {
      throw new ApiError(503, 'AGENT_SANDBOX_NOT_CONFIGURED', { retryable: false });
    }
    if (local && (!this.config.sandboxImageRef || !this.config.sandboxImageHasToolchain)) {
      throw new ApiError(503, 'AGENT_SANDBOX_IMAGE_NOT_READY', { retryable: false });
    }
    const sandboxRef = this.referenceForRun(runId);
    return this.bridge({
      config: this.config,
      payload: {
        command: 'create',
        local,
        name: sandboxRef,
        imageRef: this.config.sandboxImageRef,
        distro: 'ubuntu',
        version: '24.04',
        kind: local ? 'container' : 'vm',
        dockerPlatform: local ? this.config.sandboxDockerPlatform : '',
        browserEnabled: browserEnabled === true,
        egressPolicy: this.config.sandboxEgressPolicy,
        // Local runs require the versioned, prebuilt Artigen toolchain image.
        // Installing packages inside every task is slow, network-dependent and
        // makes otherwise identical runs non-reproducible.
        aptPackages: [],
        installPlaywright: false,
        cpu: this.config.cpuCount,
        memoryMb: this.config.memoryMb,
        diskGb: this.config.diskGb,
        region: this.config.sandboxRegion
      },
      // The image is already built, but first startup can still spend time on
      // Docker unpacking and the desktop health check.
      timeoutMs: local ? 15 * 60_000 : 5 * 60_000
    });
  }

  referenceForRun(runId) {
    const suffix = crypto.createHash('sha256').update(String(runId)).digest('hex').slice(0, 18);
    return `artigen-${suffix}`;
  }

  desktopEndpoint(name) {
    return this.bridge({
      config: this.config,
      payload: {
        command: 'desktop_endpoint',
        name,
        local: this.config.sandboxMode === 'local'
      },
      timeoutMs: 30_000
    });
  }

  screenshot(name) {
    return this.bridge({
      config: this.config,
      payload: { command: 'screenshot', name, local: this.config.sandboxMode === 'local' },
      timeoutMs: 60_000
    });
  }

  actions(name, actions) {
    return this.bridge({
      config: this.config,
      payload: {
        command: 'actions',
        name,
        actions,
        local: this.config.sandboxMode === 'local'
      },
      timeoutMs: 60_000
    });
  }

  shell(name, script, timeoutSeconds = 30, { operationId = null } = {}) {
    return this.systemShell(
      name,
      operationId
        ? shellWithReceiptScript(script, operationId)
        : offlineShellScript(script),
      timeoutSeconds
    );
  }

  async readShellReceipt(name, operationId) {
    const result = await this.systemShell(name, shellReceiptProbeScript(operationId), 30);
    if (!result?.success) {
      throw new ApiError(502, 'AGENT_SHELL_RECEIPT_PROBE_FAILED', {
        retryable: true
      });
    }
    const lines = String(result.stdout || '').split(/\r?\n/);
    const state = lines[0];
    if (state === 'missing') return null;
    if (state === 'started') return { state };
    if (state !== 'consumed') {
      throw new ApiError(502, 'AGENT_SHELL_RECEIPT_INVALID', { retryable: false });
    }
    const returnCode = Number(lines[1]);
    const durationMs = Number(lines[2]);
    if (!Number.isInteger(returnCode) || !Number.isFinite(durationMs) || durationMs < 0) {
      throw new ApiError(502, 'AGENT_SHELL_RECEIPT_INVALID', { retryable: false });
    }
    return {
      state,
      durationMs: Math.min(120_000, durationMs),
      result: {
        success: returnCode === 0,
        returnCode,
        stdout: Buffer.from(String(lines[3] || ''), 'base64').toString('utf8').slice(0, 12_000),
        stderr: Buffer.from(String(lines[4] || ''), 'base64').toString('utf8').slice(0, 4_000)
      }
    };
  }

  subagentShell(name, script, {
    workspacePath,
    inputPaths = [],
    timeoutSeconds = 120
  } = {}) {
    return this.systemShell(
      name,
      subagentOfflineShellScript({ script, workspacePath, inputPaths }),
      Math.max(1, Math.min(120, Number(timeoutSeconds) || 120))
    );
  }

  systemShell(name, script, timeoutSeconds = 30) {
    return this.bridge({
      config: this.config,
      payload: {
        command: 'shell',
        name,
        local: this.config.sandboxMode === 'local',
        script: String(script || ''),
        timeout: Math.max(1, Math.min(120, Number(timeoutSeconds) || 30))
      },
      timeoutMs: 130_000
    });
  }

  readFile(name, filePath) {
    const normalized = String(filePath || '').trim();
    if (!/^\/tmp\/artigen-workspace\/[A-Za-z0-9._@+ -]+(?:\/[A-Za-z0-9._@+ -]+)*$/.test(normalized)) {
      throw new ApiError(403, 'AGENT_ARTIFACT_PATH_FORBIDDEN');
    }
    return this.bridge({
      config: this.config,
      payload: {
        command: 'read_file',
        name,
        path: normalized,
        timeout: 60,
        local: this.config.sandboxMode === 'local'
      },
      timeoutMs: 90_000
    });
  }

  writeFile(name, filePath, buffer) {
    const normalized = String(filePath || '').trim();
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
    if (!/^\/tmp\/artigen-workspace\/[A-Za-z0-9._@+ -]+(?:\/[A-Za-z0-9._@+ -]+)*$/.test(normalized)) {
      throw new ApiError(403, 'AGENT_ARTIFACT_PATH_FORBIDDEN');
    }
    if (!bytes.length || bytes.length > 100 * 1024 * 1024) {
      throw new ApiError(bytes.length ? 413 : 400, 'AGENT_INPUT_ASSET_SIZE_INVALID');
    }
    return this.bridge({
      config: this.config,
      payload: {
        command: 'write_file',
        name,
        local: this.config.sandboxMode === 'local',
        path: normalized,
        base64: bytes.toString('base64'),
        timeout: 120
      },
      timeoutMs: 130_000
    });
  }

  suspend(name) {
    return this.bridge({
      config: this.config,
      payload: { command: 'suspend', name, local: this.config.sandboxMode === 'local' },
      timeoutMs: 60_000
    });
  }

  resume(name) {
    return this.bridge({
      config: this.config,
      payload: { command: 'resume', name, local: this.config.sandboxMode === 'local' },
      timeoutMs: 120_000
    });
  }

  async ensureRunning(name) {
    try {
      return await this.resume(name);
    } catch (resumeError) {
      try {
        await this.screenshot(name);
        return { ok: true, name, alreadyRunning: true };
      } catch {
        throw resumeError;
      }
    }
  }

  destroy(name) {
    if (!name) return Promise.resolve({ ok: true });
    return this.bridge({
      config: this.config,
      payload: { command: 'destroy', name, local: this.config.sandboxMode === 'local' },
      timeoutMs: 120_000
    });
  }
}

class FixtureSandboxProvider {
  constructor() {
    this.files = new Map();
  }

  async provision({ runId }) {
    return {
      ok: true,
      name: this.referenceForRun(runId),
      displayUrl: null,
      width: 1440,
      height: 900,
      environment: 'linux'
    };
  }

  referenceForRun(runId) {
    return `fixture-${String(runId)}`;
  }

  async probe() {
    return { ok: true, provider: 'fixture' };
  }

  async screenshot() {
    return {
      ok: true,
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    };
  }

  async actions() {
    return { ok: true };
  }

  async shell(_name, script) {
    return { ok: true, stdout: '', stderr: '', returnCode: 0, success: true, script };
  }

  async subagentShell(_name, script, options = {}) {
    return {
      ok: true,
      stdout: '',
      stderr: '',
      returnCode: 0,
      success: true,
      script,
      options
    };
  }

  async systemShell(_name, script) {
    return { ok: true, stdout: '', stderr: '', returnCode: 0, success: true, script };
  }

  async readFile(_name, filePath) {
    const buffer = this.files.get(filePath);
    if (!buffer) throw new ApiError(404, 'AGENT_ARTIFACT_FILE_NOT_FOUND');
    return { ok: true, base64: buffer.toString('base64') };
  }

  async writeFile(_name, filePath, buffer) {
    this.files.set(filePath, Buffer.from(buffer));
    return { ok: true, bytes: buffer.length };
  }

  async suspend() {
    return { ok: true };
  }

  async resume() {
    return { ok: true };
  }

  async ensureRunning() {
    return { ok: true };
  }

  async desktopEndpoint() {
    throw new ApiError(503, 'AGENT_DESKTOP_RELAY_UNAVAILABLE');
  }

  async destroy() {
    return { ok: true };
  }
}

const createAgentSandboxProvider = ({ env = process.env, ...options } = {}) => {
  const config = getAgentConfig(env);
  if (config.runtimeDriver === 'fixture' || config.sandboxProvider === 'fixture') {
    return new FixtureSandboxProvider();
  }
  return new CuaSandboxProvider({ env, ...options });
};

module.exports = {
  BRIDGE_PATH,
  CuaSandboxProvider,
  FixtureSandboxProvider,
  assertSafeShell,
  assertAllowedOrigins,
  assertComputerOrigins,
  offlineShellScript,
  shellReceiptDirectory,
  shellReceiptProbeScript,
  shellWithReceiptScript,
  subagentOfflineShellScript,
  createAgentSandboxProvider,
  runBridge
};
