import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const failures = [];

const requireMatch = (name, pattern, message) => {
  if (!pattern.test(read(name))) failures.push(`${name}: ${message}`);
};

// Keep the platform liveness probe shallow. Deep readiness is checked after a
// deploy by /readyz and must never be used as Render's restart signal.
requireMatch('render.yaml', /^\s+healthCheckPath:\s*\/healthz\s*$/m, 'healthCheckPath must be /healthz');
requireMatch('render.yaml', /^\s+autoDeployTrigger:\s*off\s*$/m, 'production deploys must remain manually promoted');
requireMatch('render.yaml', /^\s+plan:\s*starter\s*$/m, 'production must use a non-sleeping starter instance');
requireMatch('render.yaml', /^\s+- key: APP_ENV\s*\n\s+value:\s*production\s*$/m, 'production APP_ENV must be explicit');
requireMatch('render.yaml', /^\s+- key: AGENT_RUNTIME_V2_ENABLED\s*\n\s+value:\s*["']?false["']?\s*$/m, 'Runtime V2 must remain closed for beta');
requireMatch('render.yaml', /^\s+- key: AGENT_PROVIDER_SCHEDULER_ENABLED\s*\n\s+value:\s*["']?false["']?\s*$/m, 'provider scheduler must remain closed for beta');
requireMatch('render.yaml', /^\s+- key: ARTIGEN_PUBLIC_SIGNUP_ENABLED\s*\n\s+value:\s*["']?false["']?\s*$/m, 'public signup must remain closed for beta');
requireMatch('render.yaml', /^\s+- key: PAYMENTS_ENABLED\s*\n\s+value:\s*["']?false["']?\s*$/m, 'self-serve payments must remain closed for beta');
requireMatch('render.dev.yaml', /^\s+healthCheckPath:\s*\/healthz\s*$/m, 'DEV healthCheckPath must be /healthz');
requireMatch('render.dev.yaml', /^\s+- key: APP_ENV\s*\n\s+value:\s*dev\s*$/m, 'DEV APP_ENV must be explicit');
requireMatch('render.dev.yaml', /^\s+- key: AGENT_RUNTIME_V2_ROLLOUT_PERCENT\s*\n\s+value:\s*["']?0["']?\s*$/m, 'DEV Runtime V2 rollout must be zero');
requireMatch('render.dev.yaml', /^\s+- key: ARTIGEN_PUBLIC_SIGNUP_ENABLED\s*\n\s+value:\s*["']?false["']?\s*$/m, 'DEV public signup must remain closed');

const vercel = JSON.parse(read('vercel.json'));
const rewriteSources = new Set((vercel.rewrites || []).map((item) => item.source));
for (const source of ['/api/:path*', '/files/:path*', '/healthz', '/readyz']) {
  if (!rewriteSources.has(source)) failures.push(`vercel.json: missing rewrite for ${source}`);
}

if (failures.length) {
  console.error('Release configuration check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Release configuration check passed.');
