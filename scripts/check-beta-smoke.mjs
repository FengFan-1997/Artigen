import { pathToFileURL } from 'node:url';

export async function checkBetaSmoke({ origin, sha, environment, devAuth, fetchImpl = fetch }) {
  const url = new URL(origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' ||
      (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Use an HTTPS origin without credentials (HTTP is allowed only on loopback).');
  }
  if (!/^[a-f0-9]{40}$/i.test(sha || '')) throw new Error('Expected full Git SHA is required.');
  if (!['dev', 'production'].includes(environment)) throw new Error('Expected environment must be dev or production.');
  const headers = {};
  if (devAuth) {
    if (environment !== 'dev' || !devAuth.username || !devAuth.password || devAuth.username.includes(':')) {
      throw new Error('DEV Basic authentication requires both username and password for the dev environment.');
    }
    headers.Authorization = `Basic ${Buffer.from(`${devAuth.username}:${devAuth.password}`).toString('base64')}`;
  }
  const failures = [];
  const reports = {};
  for (const endpoint of ['/healthz', '/readyz', '/api/meta']) {
    try {
      const response = await fetchImpl(new URL(endpoint, url), { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) { failures.push(`${endpoint}: HTTP ${response.status}`); continue; }
      const body = await response.json();
      if (body?.ok !== true) failures.push(`${endpoint}: not healthy`);
      reports[endpoint] = body;
    } catch {
      // Never echo remote bodies, headers, credentials or internal exception text.
      failures.push(`${endpoint}: unavailable or invalid response`);
    }
  }
  const meta = reports['/api/meta'];
  if (meta) {
    if (meta.gitSha !== sha) failures.push('/api/meta: SHA mismatch');
    if (meta.environment !== environment) failures.push('/api/meta: environment mismatch');
    if (!meta.version) failures.push('/api/meta: missing version');
    if (meta.capabilitySemantics !== 'configured-not-readiness') failures.push('/api/meta: unsupported capability contract');
    for (const flag of ['publicSignup', 'selfServePayments', 'agentRuntimeV2', 'agentSubagents', 'providerScheduler']) {
      if (meta.capabilities?.[flag] !== false) failures.push(`/api/meta: ${flag} must be closed`);
    }
    for (const flag of ['auth', 'projects', 'generation', 'fileUpload', 'artifactDownload']) {
      if (meta.capabilities?.[flag] !== true) failures.push(`/api/meta: ${flag} is not configured`);
    }
    if (!Array.isArray(meta.releasePolicy?.violations) || meta.releasePolicy.violations.length) {
      failures.push('/api/meta: release policy not satisfied');
    }
  }
  const ready = reports['/readyz'];
  if (ready) {
    // A disabled dependency returning skipped=true is not a successful Beta check.
    for (const name of ['database', 'storage', 'provider', 'mail', 'authSecrets', 'turnstile']) {
      const check = ready.checks?.[name];
      if (check?.ok !== true || check.skipped === true) failures.push(`/readyz: ${name} not verified`);
    }
    if (ready.agentEnabled === true) {
      if (ready.checks?.agent?.ok !== true || ready.checks.agent.skipped === true) failures.push('/readyz: agent not verified');
    }
  }
  return { ok: failures.length === 0, expectedSha: sha, environment, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [origin, sha, environment] = process.argv.slice(2);
    const devAuth = process.env.BETA_SMOKE_DEV_USER || process.env.BETA_SMOKE_DEV_PASSWORD
      ? { username: process.env.BETA_SMOKE_DEV_USER, password: process.env.BETA_SMOKE_DEV_PASSWORD }
      : undefined;
    const report = await checkBetaSmoke({ origin, sha, environment, devAuth });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch {
    console.error('Usage: pnpm smoke:beta <https-origin> <full-git-sha> <dev|production>');
    process.exitCode = 1;
  }
}
