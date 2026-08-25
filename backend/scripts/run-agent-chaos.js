const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for Harness V3 chaos tests');
  process.exit(1);
}

const repeats = Math.max(1, Math.min(20, Number(process.env.AGENT_CHAOS_REPEATS || 1)));
const testFile = path.resolve(__dirname, '../tests/agent-harness-v3-pg.integration.test.js');
const reportDir = path.resolve(
  process.env.AGENT_HARNESS_REPORT_DIR || path.join(__dirname, '../../.artifacts/agent-harness-v3')
);
const reportPath = path.join(reportDir, 'chaos.json');
const pattern = [
  'zero-file text',
  'long Chinese',
  'resumes',
  'ambiguous',
  'after a Shell effect',
  'encrypted Shell receipt',
  'more than sixteen',
  'migrates a legacy',
  'cancellation fences',
  'cancellation after',
  'cancellation survives',
  'interrupted Kolors',
  'persisted Kolors',
  'explicit Kolors 4xx',
  'hides runs',
  'lease takeover',
  'three real subagents'
].join('|');

const parseTapMetric = (output, name, { numeric = true } = {}) => {
  const match = String(output || '').match(new RegExp(`^# ${name} (.+?)\\s*$`, 'm'));
  if (!match) return null;
  return numeric ? Number(match[1]) : match[1];
};

const parseTapSummary = (output) => {
  const summary = {
    tests: parseTapMetric(output, 'tests'),
    passed: parseTapMetric(output, 'pass'),
    failed: parseTapMetric(output, 'fail'),
    cancelled: parseTapMetric(output, 'cancelled'),
    skipped: parseTapMetric(output, 'skipped'),
    todo: parseTapMetric(output, 'todo'),
    durationMs: parseTapMetric(output, 'duration_ms')
  };
  const counts = [
    summary.tests,
    summary.passed,
    summary.failed,
    summary.cancelled,
    summary.skipped,
    summary.todo
  ];
  if (counts.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  if (!Number.isFinite(summary.durationMs) || summary.durationMs < 0) return null;
  if (
    summary.passed + summary.failed + summary.cancelled + summary.skipped + summary.todo !==
    summary.tests
  ) return null;
  return summary;
};

const iterationSummaries = [];

for (let iteration = 1; iteration <= repeats; iteration += 1) {
  const result = spawnSync(process.execPath, [
    '--test',
    '--test-reporter=tap',
    `--test-name-pattern=${pattern}`,
    testFile
  ], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, RUN_POSTGRES_INTEGRATION: '1' },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  const combinedOutput = `${result.stdout || ''}${result.stderr || ''}`;
  const summary = parseTapSummary(combinedOutput);
  if (
    result.status !== 0 ||
    !summary ||
    summary.tests <= 0 ||
    summary.failed !== 0 ||
    summary.cancelled !== 0 ||
    summary.skipped !== 0 ||
    summary.todo !== 0 ||
    summary.passed !== summary.tests
  ) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({
      ok: false,
      repeats,
      failedIteration: iteration,
      exitCode: result.status || 1,
      summary
    }, null, 2)}\n`);
    console.error(`Harness V3 chaos iteration ${iteration}/${repeats} failed`);
    process.exit(result.status || 1);
  }
  iterationSummaries.push({ iteration, ...summary });
  console.log(
    `Harness V3 chaos iteration ${iteration}/${repeats}: ` +
    `${summary.passed}/${summary.tests} passed in ${summary.durationMs.toFixed(1)}ms`
  );
}

const scenarioCounts = new Set(iterationSummaries.map((entry) => entry.tests));
if (scenarioCounts.size !== 1) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({
    ok: false,
    repeats,
    code: 'AGENT_CHAOS_SCENARIO_COUNT_DRIFT',
    iterations: iterationSummaries
  }, null, 2)}\n`);
  console.error('Harness V3 chaos scenario count changed between iterations');
  process.exit(1);
}
const scenariosPerIteration = iterationSummaries[0].tests;
const report = {
  ok: true,
  repeats,
  scenariosPerIteration,
  executions: iterationSummaries.reduce((total, entry) => total + entry.tests, 0),
  passed: iterationSummaries.reduce((total, entry) => total + entry.passed, 0),
  failed: 0,
  cancelled: 0,
  skipped: 0,
  todo: 0,
  durationMs: iterationSummaries.reduce((total, entry) => total + entry.durationMs, 0),
  iterations: iterationSummaries
};
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, iterations: undefined, reportPath }, null, 2));
