const fs = require('fs');
const path = require('path');
const { ApiError } = require('../lib/api-error');
const {
  assertAllowedOrigins
} = require('./agent-sandbox-provider');
const {
  inspectUntrustedContent,
  sanitizeText
} = require('./agent-policy-service');
const { getAgentConfig } = require('./agent-config');

const DOM_SCRIPT_PATH = path.resolve(__dirname, '../agent_runtime/browser_dom.js');
const SANDBOX_SCRIPT_PATH = '/tmp/artigen-workspace/.artigen/browser_dom.js';
const ALLOWED_ACTIONS = new Set(['navigate', 'snapshot', 'click', 'fill', 'describe']);
const BROWSER_RISK_PATTERNS = Object.freeze([
  [/(?:captcha|验证码)/i, 'captcha'],
  [/(?:otp|one.?time|一次性密码)/i, 'enter_otp'],
  [/(?:password|密码)/i, 'enter_password'],
  [/(?:purchase|buy now|立即购买|下单)/i, 'purchase'],
  [/(?:payment|pay now|付款|支付)/i, 'payment'],
  [/(?:delete|remove|删除)/i, 'delete'],
  [/(?:publish|发布)/i, 'publish'],
  [/(?:permission|access control|权限)/i, 'change_permissions'],
  [/(?:send|发送)/i, 'send'],
  [/(?:submit|提交)/i, 'submit']
]);

const normalizeRequest = (input = {}) => {
  const action = String(input.action || '').trim();
  if (!ALLOWED_ACTIONS.has(action)) throw new ApiError(400, 'AGENT_BROWSER_ACTION_INVALID');
  const selector = String(input.selector || '').trim();
  const url = String(input.url || '').trim();
  const text = String(input.text || '');
  if (['click', 'fill', 'describe'].includes(action) && (!selector || selector.length > 1000)) {
    throw new ApiError(400, 'AGENT_BROWSER_SELECTOR_INVALID');
  }
  if (action === 'navigate') {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new ApiError(400, 'AGENT_BROWSER_URL_INVALID');
    }
    if (parsed.protocol !== 'https:') throw new ApiError(403, 'AGENT_BROWSER_URL_FORBIDDEN');
  }
  if (text.length > 20_000) throw new ApiError(413, 'AGENT_BROWSER_TEXT_TOO_LARGE');
  return { action, selector, url, text };
};

const browserActionType = (input = {}) => {
  if (!['click', 'fill'].includes(String(input.action || ''))) return 'browser_read';
  const semantic = [
    input.purpose,
    input.selector,
    input.text
  ].map((value) => String(value || '')).join(' ');
  const risky = BROWSER_RISK_PATTERNS.find(([pattern]) => pattern.test(semantic))?.[1];
  if (risky) return risky;
  if (
    input.inputType === 'password' ||
    input.autocomplete === 'one-time-code' ||
    input.sensitive === true
  ) return input.autocomplete === 'one-time-code' ? 'enter_otp' : 'enter_password';
  if (input.action === 'fill') return 'browser_fill';
  if (
    input.injectionSuspected === false &&
    input.tagName === 'a' &&
    input.href &&
    input.isSubmit !== true
  ) return 'browser_navigation';
  return 'browser_interaction';
};

const createAgentBrowserService = ({ sandbox, env = process.env } = {}) => {
  if (!sandbox) throw new TypeError('AGENT_BROWSER_SANDBOX_REQUIRED');
  const config = getAgentConfig(env);
  const script = fs.readFileSync(DOM_SCRIPT_PATH);

  const initialize = async ({ sandboxName }) => {
    if (config.sandboxEgressPolicy !== 'restricted-v1') {
      throw new ApiError(503, 'AGENT_SANDBOX_EGRESS_POLICY_UNATTESTED');
    }
    await sandbox.writeFile(sandboxName, SANDBOX_SCRIPT_PATH, script);
    const started = await sandbox.systemShell(
      sandboxName,
      [
        'set -eu',
        'mkdir -p /tmp/artigen-chromium',
        'mkdir -p /tmp/artigen-browser-downloads /tmp/artigen-workspace/downloads',
        'if ! curl --noproxy "*" -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1; then',
        '  browser="$(command -v chromium || command -v chromium-browser)"',
        `  start-stop-daemon --start --background --make-pidfile --pidfile /tmp/artigen-chromium/browser.pid --exec "$browser" -- --disable-dev-shm-usage --disable-background-networking --disable-component-update --disable-default-apps --disable-sync --disable-quic --disable-features=WebRtcHideLocalIpsWithMdns --force-webrtc-ip-handling-policy=disable_non_proxied_udp --metrics-recording-only --no-first-run --no-default-browser-check --no-pings --proxy-server=http://artigen-egress:8080 --proxy-bypass-list="<-loopback>" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir=/tmp/artigen-chromium about:blank`,
        '  for attempt in 1 2 3 4 5 6 7 8 9 10; do',
        '    curl --noproxy "*" -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1 && break',
        '    sleep 1',
        '  done',
        'fi',
        'curl --noproxy "*" -fsS http://127.0.0.1:9222/json/version >/dev/null',
        "NODE_PATH=\"$(npm root -g)\" node -e \"require('playwright-core')\""
      ].join('\n'),
      30
    );
    if (!started.success) {
      throw new ApiError(503, 'AGENT_BROWSER_INITIALIZATION_FAILED', {
        details: { detail: sanitizeText(started.stderr, 300) }
      });
    }
    return true;
  };

  const execute = async ({ sandboxName, request, allowedOrigins = [] }) => {
    const normalized = normalizeRequest(request);
    if (normalized.action === 'navigate') {
      assertAllowedOrigins(normalized.url, allowedOrigins);
    }
    const encoded = Buffer.from(JSON.stringify({
      ...normalized,
      allowedOrigins
    })).toString('base64url');
    const result = await sandbox.systemShell(
      sandboxName,
      `NODE_PATH="$(npm root -g)" node '${SANDBOX_SCRIPT_PATH}' '${encoded}'`,
      45
    );
    if (!result.success) {
      throw new ApiError(422, 'AGENT_BROWSER_ACTION_FAILED', {
        details: { detail: sanitizeText(result.stderr, 300) }
      });
    }
    let output;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      throw new ApiError(502, 'AGENT_BROWSER_OUTPUT_INVALID');
    }
    assertAllowedOrigins(output.url, allowedOrigins);
    const inspected = inspectUntrustedContent(output.text);
    return {
      ok: true,
      url: sanitizeText(output.url, 2000),
      title: sanitizeText(output.title, 500),
      text: inspected.excerpt,
      elementText: sanitizeText(output.elementText, 1000),
      href: sanitizeText(output.href, 2000) || null,
      tagName: sanitizeText(output.tagName, 40).toLowerCase() || null,
      inputType: sanitizeText(output.inputType, 80).toLowerCase() || null,
      autocomplete: sanitizeText(output.autocomplete, 80).toLowerCase() || null,
      formAction: sanitizeText(output.formAction, 2000) || null,
      formMethod: sanitizeText(output.formMethod, 20).toUpperCase() || null,
      isSubmit: output.isSubmit === true,
      sensitive: output.sensitive === true,
      download: output.download && typeof output.download === 'object'
        ? {
            filename: sanitizeText(output.download.filename, 255),
            path: sanitizeText(output.download.path, 1000),
            byteSize: Math.max(0, Number(output.download.byteSize || 0))
          }
        : null,
      untrusted: true,
      injectionSuspected: inspected.injectionSuspected,
      injectionSignals: inspected.injectionSignals,
      contentHash: inspected.contentHash
    };
  };

  const describe = ({ sandboxName, selector, allowedOrigins = [] }) => execute({
    sandboxName,
    request: { action: 'describe', selector, url: '', text: '' },
    allowedOrigins
  });

  return { describe, execute, initialize };
};

module.exports = {
  ALLOWED_ACTIONS,
  BROWSER_RISK_PATTERNS,
  DOM_SCRIPT_PATH,
  SANDBOX_SCRIPT_PATH,
  browserActionType,
  createAgentBrowserService,
  normalizeRequest
};
