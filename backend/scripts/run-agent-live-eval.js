#!/usr/bin/env node

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const { readMacOsKeychainSecret } = require('../lib/local-keychain');
const { resolvePoolSsl } = require('../db/pool');
const {
  assertLiveEvalDatabaseReadiness,
  resolveLiveEvalPostgresMajor
} = require('../evaluation/harness/live-eval-database-readiness');

const KEYCHAIN_SERVICE = String(
  process.env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || 'artigen-agent-dev-worker'
).trim();
const secretNames = [
  'DATABASE_URL',
  'AGENT_PAYLOAD_ENCRYPTION_KEY',
  'SILICONFLOW_API_KEY',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'AGENT_LIVE_EVAL_GATE_KEY'
];
const optionalSecretNames = [
  'AGENT_WORKER_RELAY_SECRET',
  'AGENT_WORKER_RELAY_URL',
  'PG_SSL_CA_BASE64'
];
const LIVE_EVAL_DB_CONNECTION_TIMEOUT_MS = 15_000;
const LIVE_EVAL_DB_QUERY_TIMEOUT_MS = 30_000;
const LIVE_EVAL_DB_HEALTH_QUERY_TIMEOUT_MS = 10_000;
const LIVE_EVAL_DB_CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  '57P01',
  '57P02',
  '57P03'
]);

const liveEvalPoolOptions = ({ connectionString, env = process.env } = {}) => {
  const poolMax = Number(env.AGENT_LIVE_EVAL_PG_POOL_MAX || 3);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 3) {
    throw new TypeError('AGENT_LIVE_EVAL_PG_POOL_MAX_INVALID');
  }
  return {
    connectionString,
    max: poolMax,
    allowExitOnIdle: true,
    // A real DEV database can temporarily refuse a new connection while its
    // existing sessions remain healthy. Never let a signed campaign wait
    // forever for a pool checkout or a database response: fail closed so the
    // slot journal, cleanup evidence and Provider counters remain auditable.
    connectionTimeoutMillis: LIVE_EVAL_DB_CONNECTION_TIMEOUT_MS,
    query_timeout: LIVE_EVAL_DB_QUERY_TIMEOUT_MS,
    statement_timeout: LIVE_EVAL_DB_QUERY_TIMEOUT_MS,
    application_name: 'artigen-agent-live-eval',
    ssl: resolvePoolSsl(connectionString, env)
  };
};

const isLiveEvalDatabaseConnectionError = (input) => {
  let error = input;
  for (let depth = 0; error && depth < 4; depth += 1) {
    const code = String(error.code || '').trim().toUpperCase();
    if (LIVE_EVAL_DB_CONNECTION_CODES.has(code) || /^08[A-Z0-9]{3}$/.test(code)) return true;
    error = error.cause;
  }
  return false;
};

const positivePricingOrDefault = ({ value, fallback, name }) => {
  const raw = String(value ?? '').trim();
  if (!raw) return String(fallback);
  const parsed = Number(raw);
  // An explicit zero is a configuration failure, not a stale value to
  // replace. Silently substituting a rate would make the signed gate run with
  // a pricing profile different from the one the deployment advertised.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name}_INVALID`);
  }
  return raw;
};

const { AgentLiveEvalHarness } = require('../evaluation/harness/agent-live-eval-harness');
const {
  LIVE_EVAL_CASES,
  LIVE_EVAL_MATRIX_HASH
} = require('../evaluation/harness/agent-live-eval-matrix');
const { buildBlindReviewBundle } = require('../evaluation/harness/live-eval-blind-review');
const {
  keyFromMaterial,
  purgeExpiredEvidence
} = require('../evaluation/harness/live-eval-evidence');
const {
  parseVersionedKey,
  readAndVerifyGateManifest
} = require('../evaluation/harness/live-eval-gate');
const {
  applyAgentSmokeModelProfile,
  resolveAgentSmokeModelProfile
} = require('./lib/agent-dev-model-profile');

const loadLiveEvalSecrets = ({
  env = process.env,
  readSecret = readMacOsKeychainSecret,
  service = String(env.ARTIGEN_AGENT_KEYCHAIN_SERVICE || KEYCHAIN_SERVICE).trim()
} = {}) => {
  if (service !== 'artigen-agent-dev-worker') {
    throw new Error('AGENT_LIVE_EVAL_KEYCHAIN_SERVICE_INVALID');
  }
  const runtimeEnv = { ...env };
  // Local provider/database trust material must come from the dedicated DEV
  // Keychain service, never from an inherited shell environment.
  delete runtimeEnv.PG_SSL_CA;
  delete runtimeEnv.PG_SSL_CA_BASE64;
  const smokeModelProfile = resolveAgentSmokeModelProfile({ env: runtimeEnv, production: false });
  const modelProvider = smokeModelProfile.provider;
  const requiredSecretNames = [
    ...secretNames,
    ...(modelProvider === 'cloudflare'
      ? ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']
      : [])
  ];
  const missing = [];
  for (const name of [...requiredSecretNames, ...optionalSecretNames]) {
    const value = readSecret({ service, account: name });
    if (!value && requiredSecretNames.includes(name)) missing.push(name);
    else if (value) runtimeEnv[name] = value;
  }
  const evidenceKeyMaterial = readSecret({
    service,
    account: 'AGENT_LIVE_EVAL_EVIDENCE_KEY'
  });
  if (!evidenceKeyMaterial) missing.push('AGENT_LIVE_EVAL_EVIDENCE_KEY');
  if (missing.length) {
    throw new Error(`AGENT_LIVE_EVAL_KEYCHAIN_INCOMPLETE:${missing.join(',')}`);
  }
  keyFromMaterial(evidenceKeyMaterial);
  parseVersionedKey(runtimeEnv.AGENT_LIVE_EVAL_GATE_KEY);
  Object.assign(runtimeEnv, {
    NODE_ENV: 'test',
    APP_ENV: 'dev',
    AGENT_LIVE_EVAL_MODE: 'true',
    AGENT_LIVE_EVAL_ALLOW_REAL_PROVIDER: '1',
    AGENT_LIVE_EVAL_PG_POOL_MAX: '3',
    DEV_DATABASE_EXPECTED_MAJOR: '18',
    PG_POOL_MAX: '3',
    PGBOSS_POOL_MAX: '2',
    AGENT_PGBOSS_POOL_MAX: '2',
    PG_SSL_REQUIRED: '1',
    PG_SSL_REJECT_UNAUTHORIZED: '1',
    // The DEV object store uses a custom endpoint whose wildcard certificate
    // covers the endpoint host, not bucket.endpoint virtual-host requests.
    // Path-style requests preserve normal TLS verification; never disable it.
    S3_FORCE_PATH_STYLE: String(runtimeEnv.S3_FORCE_PATH_STYLE || '1'),
    CUA_PYTHON: path.resolve(__dirname, '../.venv-agent/bin/python'),
    AGENT_MODEL_PROVIDER: smokeModelProfile.provider,
    AGENT_MODEL_NAME: smokeModelProfile.model,
    AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION: positivePricingOrDefault({
      value: runtimeEnv.AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION,
      fallback: 20,
      name: 'AGENT_SILICONFLOW_INPUT_CREDITS_PER_MILLION'
    }),
    AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION: positivePricingOrDefault({
      value: runtimeEnv.AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION,
      fallback: 160,
      name: 'AGENT_SILICONFLOW_OUTPUT_CREDITS_PER_MILLION'
    }),
    AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION: positivePricingOrDefault({
      value: runtimeEnv.AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION,
      fallback: 0.35,
      name: 'AGENT_CLOUDFLARE_INPUT_CREDITS_PER_MILLION'
    }),
    AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION: positivePricingOrDefault({
      value: runtimeEnv.AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION,
      fallback: 0.75,
      name: 'AGENT_CLOUDFLARE_OUTPUT_CREDITS_PER_MILLION'
    })
  });
  applyAgentSmokeModelProfile(runtimeEnv, smokeModelProfile);
  if (
    modelProvider === 'cloudflare' &&
    (
      !/^(1|true|yes|on)$/i.test(String(runtimeEnv.AGENT_CLOUDFLARE_FREE_ACCOUNT_ATTESTED || '')) ||
      String(runtimeEnv.AGENT_CLOUDFLARE_FREE_ACCOUNT_ID || '').trim() !==
        String(runtimeEnv.CLOUDFLARE_ACCOUNT_ID || '').trim()
    )
  ) {
    throw new Error('AGENT_CLOUDFLARE_FREE_ACCOUNT_REQUIRED');
  }
  return { runtimeEnv, evidenceKeyMaterial };
};

const currentLiveTextModel = () => String(
  process.env.AGENT_MODEL_NAME || (
    String(process.env.AGENT_MODEL_PROVIDER || 'cloudflare').trim().toLowerCase() === 'siliconflow'
      ? 'Qwen/Qwen3-8B'
      : '@cf/openai/gpt-oss-120b'
  )
).trim();

const resolveCurrentCommitSha = ({ cwd = path.resolve(__dirname, '../..') } = {}) => {
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commitSha)) throw new Error('AGENT_LIVE_EVAL_GIT_SHA_INVALID');
  const trackedChanges = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=no'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  if (trackedChanges) throw new Error('AGENT_LIVE_EVAL_TRACKED_WORKTREE_DIRTY');
  return commitSha;
};

const resolveSelection = (env = process.env) => {
  const selectedCase = String(env.AGENT_LIVE_EVAL_CASE || '').trim();
  const selectedCohort = String(env.AGENT_LIVE_EVAL_COHORT || 'both').trim().toLowerCase();
  if (!['both', 'v1', 'v2'].includes(selectedCohort)) {
    throw new Error('AGENT_LIVE_EVAL_COHORT_INVALID');
  }
  const selected = LIVE_EVAL_CASES.filter((entry) => !selectedCase || entry.id === selectedCase);
  if (!selected.length) throw new Error(`AGENT_LIVE_EVAL_CASE_INVALID:${selectedCase}`);
  return { selectedCase, selectedCohort, selected };
};

const safeFailureCode = (error, fallback = 'AGENT_LIVE_EVAL_CASE_FAILED') => {
  const candidate = String(error?.code || '');
  return /^[A-Z][A-Z0-9_]{2,100}$/.test(candidate) ? candidate : fallback;
};

const failureFingerprint = (error) => crypto.createHash('sha256')
  .update(`${String(error?.name || 'Error')}\0${String(error?.code || '')}\0${String(error?.message || '')}`)
  .digest('hex');

const contentFreeFailure = ({ entry, cohort, error }) => ({
  scenarioId: entry.id,
  cohort,
  ok: false,
  code: safeFailureCode(error),
  diagnosticHash: failureFingerprint(error)
});

const median = (values) => {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

const summarize = (results) => {
  const safeResults = Array.isArray(results) ? results : [];
  const agentCases = safeResults.filter((entry) => entry.scenarioId !== 'consultation-route');
  const byCohort = (cohort) => agentCases.filter((entry) => entry.cohort === cohort);
  const cohortSummary = (cohort) => {
    const entries = byCohort(cohort);
    const passed = entries.filter((entry) => entry.ok);
    return {
      cases: entries.length,
      passed: passed.length,
      completionRate: entries.length ? passed.length / entries.length : null,
      medianModelCalls: median(passed.map((entry) => entry.modelCalls)),
      medianElapsedMs: median(passed.map((entry) => entry.elapsedMs)),
      medianTokens: median(passed.map((entry) => Number(entry.inputTokens || 0) + Number(entry.outputTokens || 0))),
      medianChargedCredits: median(passed.map((entry) => Number(entry.chargedCredits || 0))),
      totalChargedCredits: passed.reduce((sum, entry) => sum + Number(entry.chargedCredits || 0), 0),
      schemaChecks: passed.reduce((sum, entry) => sum + Number(entry.schemaChecks || 0), 0),
      schemaFirstValid: passed.reduce((sum, entry) => sum + Number(entry.schemaFirstValid || 0), 0)
    };
  };
  const v1 = cohortSummary('v1');
  const v2 = cohortSummary('v2');
  const ratioReduction = (baseline, candidate) => (
    Number.isFinite(baseline) && baseline > 0 && Number.isFinite(candidate)
      ? (baseline - candidate) / baseline
      : null
  );
  const candidateFailures = safeResults.filter((entry) => entry.cohort === 'v2' && !entry.ok).length;
  const expectedPairs = new Set(LIVE_EVAL_CASES.map((entry) => entry.id));
  const expectedSlots = new Set([...expectedPairs].flatMap((scenarioId) => (
    ['v1', 'v2'].map((cohort) => `${scenarioId}:${cohort}`)
  )));
  const actualSlots = safeResults.map((entry) => `${entry.scenarioId}:${entry.cohort}`);
  const fullMatrixComplete = safeResults.length === expectedSlots.size &&
    new Set(actualSlots).size === expectedSlots.size &&
    actualSlots.every((slot) => expectedSlots.has(slot)) &&
    // Terminal failure reports materialize untouched journal slots so the
    // signed evidence still contains the complete expected matrix. Those
    // placeholders have no elapsed time because no real slot execution ever
    // started. Do not mistake their presence for a completed paid matrix.
    safeResults.every((entry) => Number.isFinite(entry.elapsedMs) && entry.elapsedMs >= 0);
  const routeResults = safeResults.filter((entry) => entry.scenarioId === 'consultation-route');
  const routeAccuracy = routeResults.length
    ? routeResults.filter((entry) => entry.ok && entry.routeKind === 'reply').length / routeResults.length
    : null;
  const schemaChecks = v2.schemaChecks;
  const schemaFirstValidRate = schemaChecks > 0 ? v2.schemaFirstValid / schemaChecks : null;
  const modelCallReduction = ratioReduction(v1.medianModelCalls, v2.medianModelCalls);
  const tokenReduction = ratioReduction(v1.medianTokens, v2.medianTokens);
  const creditReduction = ratioReduction(v1.medianChargedCredits, v2.medianChargedCredits);
  const elapsedRegression = (
    Number.isFinite(v1.medianElapsedMs) && v1.medianElapsedMs > 0 &&
    Number.isFinite(v2.medianElapsedMs)
  ) ? (v2.medianElapsedMs - v1.medianElapsedMs) / v1.medianElapsedMs : null;
  const performanceComparable = [modelCallReduction, tokenReduction, elapsedRegression]
    .every(Number.isFinite);
  const automatedGatePassed = fullMatrixComplete &&
    candidateFailures === 0 &&
    Number(routeAccuracy) >= 0.95 &&
    Number(schemaFirstValidRate) >= 0.95 &&
    Number(v2.completionRate) >= 0.9 &&
    Number(v2.completionRate) >= Number(v1.completionRate) &&
    performanceComparable &&
    modelCallReduction >= 0.2 &&
    tokenReduction >= 0.1 &&
    elapsedRegression <= 0.1;
  const blindReviewPending = safeResults.some((entry) => (
    entry.ok && ['text-to-image', 'reference-image'].includes(entry.scenarioId)
  ));
  return {
    v1,
    v2,
    comparison: {
      modelCallReduction,
      tokenReduction,
      creditReduction,
      elapsedRegression
    },
    routeAccuracy,
    schemaFirstValidRate,
    fullMatrixComplete,
    automatedGatePassed,
    blindReviewPending,
    productionCanaryEligible: automatedGatePassed && !blindReviewPending
  };
};

const writeReport = async ({ report, reportDir, reportPath }) => {
  await fs.promises.mkdir(reportDir, { recursive: true, mode: 0o700 });
  const temporaryPath = `${reportPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  await fs.promises.rename(temporaryPath, reportPath);
};

const slotKey = (scenarioId, cohort) => `${scenarioId}:${cohort}`;

const createSlotJournal = ({ gate, selectedCase, selectedCohort, selected }) => ({
  version: 'agent-live-eval-slot-journal-v1',
  campaignId: gate.campaignId,
  commitSha: gate.commitSha,
  matrixHash: gate.matrixHash,
  selectedCase: selectedCase || 'all',
  selectedCohort,
  status: 'running',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  slots: Object.fromEntries(selected.flatMap((entry) => (
    (selectedCohort === 'both' ? ['v1', 'v2'] : [selectedCohort]).map((cohort) => [
      slotKey(entry.id, cohort),
      { scenarioId: entry.id, cohort, status: 'pending' }
    ])
  )))
});

const updateSlotJournal = (journal, { scenarioId, cohort, status, result = null, code = null }) => {
  const key = slotKey(scenarioId, cohort);
  if (!journal?.slots?.[key]) throw new Error(`AGENT_LIVE_EVAL_SLOT_UNKNOWN:${key}`);
  journal.slots[key] = {
    ...journal.slots[key],
    status,
    ...(result ? { result } : {}),
    ...(code ? { code } : {}),
    updatedAt: new Date().toISOString()
  };
  journal.updatedAt = new Date().toISOString();
  return journal;
};

const journalResults = (journal) => Object.values(journal?.slots || {})
  .map((slot) => slot.result)
  .filter(Boolean);

const failUnfinishedJournalSlots = (
  journal,
  { code = 'AGENT_LIVE_EVAL_PROCESS_INTERRUPTED', updatedAt = new Date().toISOString() } = {}
) => {
  const safeCode = /^[A-Z][A-Z0-9_]{2,100}$/.test(String(code || ''))
    ? String(code)
    : 'AGENT_LIVE_EVAL_CASE_FAILED';
  for (const slot of Object.values(journal?.slots || {})) {
    if (['succeeded', 'failed'].includes(slot.status)) continue;
    slot.status = 'failed';
    slot.code = safeCode;
    slot.result = {
      scenarioId: slot.scenarioId,
      cohort: slot.cohort,
      ok: false,
      code: safeCode
    };
    slot.updatedAt = updatedAt;
  }
  if (journal) journal.updatedAt = updatedAt;
  return journal;
};

const installLiveEvalSignalHandlers = ({
  journal,
  abort = () => {},
  persist = async () => {},
  onInterrupt = async () => {},
  processTarget = process,
  signals = ['SIGINT', 'SIGTERM']
} = {}) => {
  let interruptionError = null;
  let persistenceError = null;
  let resolveInterrupted;
  const interrupted = new Promise((resolve) => { resolveInterrupted = resolve; });
  const handlers = new Map(signals.map((signal) => {
    const handler = () => {
      if (interruptionError) return;
      interruptionError = Object.assign(new Error('AGENT_LIVE_EVAL_PROCESS_INTERRUPTED'), {
        code: 'AGENT_LIVE_EVAL_PROCESS_INTERRUPTED',
        signal
      });
      const interruptedAt = new Date().toISOString();
      failUnfinishedJournalSlots(journal, {
        code: 'AGENT_LIVE_EVAL_PROCESS_INTERRUPTED',
        updatedAt: interruptedAt
      });
      journal.status = 'interrupted';
      journal.interruption = { signal, detectedAt: interruptedAt };
      try {
        abort(interruptionError);
      } catch {}
      void Promise.resolve()
        .then(() => persist())
        .then(() => onInterrupt({ signal, error: interruptionError }))
        .then(() => persist())
        .catch((error) => { persistenceError = error; })
        .finally(() => resolveInterrupted(interruptionError));
    };
    // pnpm and an interactive terminal can both forward the same signal to the
    // child process group. Keep the handler installed until cleanup finishes;
    // a second SIGINT/SIGTERM must not restore Node's default immediate-exit
    // behavior while the journal, active Run and budget are being settled.
    processTarget.on(signal, handler);
    return [signal, handler];
  }));
  return {
    get error() { return interruptionError; },
    get persistenceError() { return persistenceError; },
    interrupted,
    dispose() {
      for (const [signal, handler] of handlers) {
        processTarget.removeListener(signal, handler);
      }
    }
  };
};

const installLiveEvalPoolErrorHandler = ({
  pool,
  abort = () => {}
} = {}) => {
  if (
    !pool ||
    typeof pool.on !== 'function' ||
    typeof pool.off !== 'function' ||
    typeof pool.query !== 'function'
  ) {
    throw new TypeError('AGENT_LIVE_EVAL_POOL_REQUIRED');
  }
  let connectionError = null;
  let idleDisconnectCount = 0;
  const checkedOutClients = new Set();
  const failClosed = () => {
    if (connectionError) return connectionError;
    connectionError = Object.assign(
      new Error('AGENT_LIVE_EVAL_DATABASE_CONNECTION_LOST'),
      { code: 'AGENT_LIVE_EVAL_DATABASE_CONNECTION_LOST' }
    );
    try {
      abort(connectionError);
    } catch {}
    return connectionError;
  };
  const handler = () => {
    // node-postgres emits Pool#error for an idle client that it has already
    // evicted. That is not proof that the database or campaign state was
    // lost. Consume the event without driver details, then require the next
    // boundary health probe to establish a fresh usable connection.
    idleDisconnectCount += 1;
  };
  // Pool#error only covers clients that are idle inside node-postgres. A
  // socket can also fail while a service owns Pool.connect()'s checked-out
  // Client; without a Client#error listener Node treats that as an uncaught
  // EventEmitter error and exits before the slot journal or billing cleanup.
  const decorateCheckedOutClient = (client) => {
    if (
      !client ||
      typeof client.on !== 'function' ||
      typeof client.off !== 'function' ||
      typeof client.release !== 'function'
    ) {
      return client;
    }
    let checkedOut = true;
    const originalRelease = client.release;
    const clientErrorHandler = () => {
      if (checkedOut) failClosed();
    };
    const record = { client, clientErrorHandler, originalRelease, wrappedRelease: null };
    const wrappedRelease = function liveEvalRelease(...releaseArgs) {
      if (checkedOut) {
        checkedOut = false;
        client.off('error', clientErrorHandler);
        checkedOutClients.delete(record);
      }
      if (client.release === wrappedRelease) client.release = originalRelease;
      return originalRelease.apply(client, releaseArgs);
    };
    record.wrappedRelease = wrappedRelease;
    checkedOutClients.add(record);
    client.on('error', clientErrorHandler);
    client.release = wrappedRelease;
    return client;
  };
  const originalConnect = typeof pool.connect === 'function' ? pool.connect : null;
  const wrappedConnect = originalConnect
    ? function liveEvalConnect(...args) {
        const callbackIndex = args.length - 1;
        const callback = args[callbackIndex];
        if (typeof callback === 'function') {
          args[callbackIndex] = (error, client) => {
            if (error) return callback(error, client);
            const checkedOut = decorateCheckedOutClient(client);
            return callback(null, checkedOut, checkedOut?.release);
          };
          return originalConnect.apply(pool, args);
        }
        return Promise.resolve(originalConnect.apply(pool, args))
          .then(decorateCheckedOutClient);
      }
    : null;
  if (wrappedConnect) pool.connect = wrappedConnect;
  pool.on('error', handler);
  return {
    get error() { return connectionError; },
    get idleDisconnectCount() { return idleDisconnectCount; },
    async assertHealthy() {
      if (connectionError) throw connectionError;
      try {
        await pool.query({
          text: 'SELECT 1 AS live_eval_database_health',
          query_timeout: LIVE_EVAL_DB_HEALTH_QUERY_TIMEOUT_MS
        });
      } catch {
        throw failClosed();
      }
      return true;
    },
    failClosed() {
      throw failClosed();
    },
    snapshot() {
      return Object.freeze({
        idleDisconnectsRecovered: idleDisconnectCount,
        fatalConnectionLoss: Boolean(connectionError)
      });
    },
    dispose() {
      if (wrappedConnect && pool.connect === wrappedConnect) pool.connect = originalConnect;
      for (const record of checkedOutClients) {
        record.client.off('error', record.clientErrorHandler);
        if (record.client.release === record.wrappedRelease) {
          record.client.release = record.originalRelease;
        }
      }
      checkedOutClients.clear();
      pool.off('error', handler);
    }
  };
};

const disposeLiveEvalPoolErrorHandlerAfterCleanup = ({ poolState, cleanup } = {}) => {
  if (!poolState || typeof poolState.dispose !== 'function') {
    throw new TypeError('AGENT_LIVE_EVAL_POOL_STATE_REQUIRED');
  }
  const postgres = Array.isArray(cleanup?.results)
    ? cleanup.results.find((entry) => entry?.label === 'postgres')
    : null;
  if (postgres?.ok !== true) return false;
  poolState.dispose();
  return true;
};

const findCampaignJournal = async ({ artifactRoot, gate, statuses = null }) => {
  const allowedStatuses = Array.isArray(statuses) && statuses.length
    ? new Set(statuses.map((status) => String(status || '').trim()))
    : null;
  const entries = await fs.promises.readdir(artifactRoot, { withFileTypes: true }).catch(() => []);
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('agent-live-eval-')) continue;
    const journalPath = path.join(artifactRoot, entry.name, 'slot-journal.json');
    try {
      const journal = JSON.parse(await fs.promises.readFile(journalPath, 'utf8'));
      if (
        journal?.version === 'agent-live-eval-slot-journal-v1' &&
        journal?.campaignId === gate.campaignId &&
        journal?.commitSha === gate.commitSha &&
        journal?.matrixHash === gate.matrixHash &&
        (!allowedStatuses || allowedStatuses.has(String(journal?.status || '')))
      ) {
        matches.push({
          journal,
          journalPath,
          reportPath: path.join(artifactRoot, entry.name, 'report.json')
        });
      }
    } catch {}
  }
  matches.sort((left, right) => String(right.journal.updatedAt || '')
    .localeCompare(String(left.journal.updatedAt || '')));
  return matches[0] || null;
};

const findInterruptedJournal = (options) => findCampaignJournal({
  ...options,
  statuses: ['running']
});

const markInterruptedJournal = async ({ found, signal = 'SIGKILL_OR_PROCESS_EXIT' }) => {
  const { journal, journalPath, reportPath } = found;
  failUnfinishedJournalSlots(journal, { code: 'AGENT_LIVE_EVAL_PROCESS_INTERRUPTED' });
  journal.status = 'interrupted';
  journal.interruption = { signal: String(signal).slice(0, 40), detectedAt: new Date().toISOString() };
  journal.updatedAt = new Date().toISOString();
  await writeReport({ report: journal, reportDir: path.dirname(journalPath), reportPath: journalPath });
  const error = Object.assign(new Error('AGENT_LIVE_EVAL_RESIDUAL_CAMPAIGN'), {
    code: 'AGENT_LIVE_EVAL_RESIDUAL_CAMPAIGN'
  });
  const report = buildTerminalFailureReport({
    gate: journal,
    selectedCase: journal.selectedCase === 'all' ? '' : journal.selectedCase,
    selectedCohort: journal.selectedCohort,
    results: journalResults(journal),
    error
  });
  await writeReport({ report, reportDir: path.dirname(reportPath), reportPath });
  return { journal, reportPath };
};

const settleCleanup = async ({ label, operation, timeoutMs = 15_000 }) => {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(operation).then(() => ({ ok: true, label })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, label, code: 'AGENT_LIVE_EVAL_CLEANUP_TIMEOUT' }), timeoutMs);
      })
    ]);
  } catch (error) {
    return {
      ok: false,
      label,
      code: safeFailureCode(error, 'AGENT_LIVE_EVAL_CLEANUP_FAILED'),
      diagnosticHash: failureFingerprint(error)
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const closeLiveEvalResources = async ({ harness = null, pool = null, timeoutMs = 15_000 } = {}) => {
  const results = [];
  if (harness) {
    results.push(await settleCleanup({
      label: 'harness',
      operation: () => harness.close(),
      timeoutMs
    }));
  }
  if (pool) {
    results.push(await settleCleanup({
      label: 'postgres',
      operation: () => pool.end(),
      timeoutMs
    }));
  }
  return {
    ok: results.every((entry) => entry.ok),
    results
  };
};

const attachCleanupEvidence = async ({ reportPath, cleanup }) => {
  const target = path.resolve(String(reportPath || ''));
  const parsed = JSON.parse(await fs.promises.readFile(target, 'utf8'));
  const next = {
    ...parsed,
    cleanup
  };
  if (!cleanup?.ok) {
    next.ok = false;
    if (next.summary && typeof next.summary === 'object') {
      next.summary = {
        ...next.summary,
        automatedGatePassed: false,
        productionCanaryEligible: false
      };
    }
  }
  await writeReport({ report: next, reportDir: path.dirname(target), reportPath: target });
  return next;
};

const flushStandardStreams = async () => {
  const flush = (stream) => new Promise((resolve) => {
    if (!stream || stream.destroyed || stream.writableEnded) return resolve();
    stream.write('', resolve);
  });
  await Promise.all([flush(process.stdout), flush(process.stderr)]);
};

const buildTerminalFailureReport = ({
  gate,
  selectedCase,
  selectedCohort,
  results,
  error,
  harness = null,
  databaseConnectivity = null
} = {}) => {
  const summary = {
    ...summarize(results),
    automatedGatePassed: false,
    productionCanaryEligible: false
  };
  return {
    version: 'agent-live-eval-v3.1',
    createdAt: new Date().toISOString(),
    campaignId: gate?.campaignId || null,
    gateManifestSha256: gate?.manifestSha256 || null,
    commitSha: gate?.commitSha || null,
    matrixHash: gate?.matrixHash || null,
    modelLocks: {
      text: currentLiveTextModel(),
      image: 'Kwai-Kolors/Kolors'
    },
    limits: {
      perRunCredits: 50,
      qwenCalls: 200,
      kolorsCalls: 16,
      wallClockHours: 8
    },
    selectedCase: selectedCase || 'all',
    selectedCohort,
    ok: false,
    code: safeFailureCode(error, 'AGENT_LIVE_EVAL_FAILED'),
    diagnosticHash: failureFingerprint(error),
    results,
    summary,
    blindReview: null,
    traceSha256: harness?.trace?.digest?.() || null,
    requestTotals: harness?.auditor
      ? {
          qwenCalls: Number(harness.auditor.qwenCalls || 0),
          kolorsCalls: Number(harness.auditor.kolorsCalls || 0)
        }
      : null,
    databaseConnectivity
  };
};

const main = async () => {
  const { runtimeEnv, evidenceKeyMaterial } = loadLiveEvalSecrets();
  Object.assign(process.env, runtimeEnv);
  const commitSha = resolveCurrentCommitSha();
  const gate = readAndVerifyGateManifest({
    manifestPath: runtimeEnv.AGENT_LIVE_EVAL_GATE_MANIFEST,
    keyMaterial: runtimeEnv.AGENT_LIVE_EVAL_GATE_KEY,
    expectedCommitSha: commitSha,
    expectedMatrixHash: LIVE_EVAL_MATRIX_HASH
  });
  const { selectedCase, selectedCohort, selected } = resolveSelection(runtimeEnv);
  const artifactRoot = path.resolve(__dirname, '../../.artifacts');
  const existingCampaign = await findCampaignJournal({ artifactRoot, gate });
  if (existingCampaign) {
    if (existingCampaign.journal.status === 'running') {
      const recovered = await markInterruptedJournal({ found: existingCampaign });
      const error = Object.assign(new Error('AGENT_LIVE_EVAL_RESIDUAL_CAMPAIGN'), {
        code: 'AGENT_LIVE_EVAL_RESIDUAL_CAMPAIGN',
        reportPath: recovered.reportPath
      });
      throw error;
    }
    // A signed campaign is single-use. A prior failed, interrupted, or
    // completed journal is terminal evidence, not a checkpoint to resume.
    // Starting again with the same campaign would repeat paid slots while the
    // durable Provider counter merely continued from its old value.
    const error = Object.assign(new Error('AGENT_LIVE_EVAL_CAMPAIGN_ALREADY_FINALIZED'), {
      code: 'AGENT_LIVE_EVAL_CAMPAIGN_ALREADY_FINALIZED',
      reportPath: existingCampaign.reportPath
    });
    throw error;
  }
  const reportId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const reportDir = path.join(artifactRoot, `agent-live-eval-${reportId}`);
  const reportPath = path.join(reportDir, 'report.json');
  const journalPath = path.join(reportDir, 'slot-journal.json');
  const journal = createSlotJournal({ gate, selectedCase, selectedCohort, selected });
  await writeReport({ report: journal, reportDir, reportPath: journalPath });
  await purgeExpiredEvidence({ rootDir: artifactRoot, retentionDays: 30 });
  const pool = new Pool(liveEvalPoolOptions({
    connectionString: runtimeEnv.DATABASE_URL,
    env: runtimeEnv
  }));
  let harness = null;
  const poolState = installLiveEvalPoolErrorHandler({
    pool,
    abort: (error) => harness?.campaignGuard?.abort(error)
  });
  const results = [];
  const signalState = installLiveEvalSignalHandlers({
    journal,
    abort: (error) => harness?.campaignGuard?.abort(error),
    persist: () => writeReport({ report: journal, reportDir, reportPath: journalPath }),
    onInterrupt: async () => {
      if (!harness) return;
      await harness.cancelActiveCohort('v1');
      await harness.cancelActiveCohort('v2');
    }
  });
  try {
    await poolState.assertHealthy();
    await assertLiveEvalDatabaseReadiness({
      pool,
      expectedPostgresMajor: resolveLiveEvalPostgresMajor(runtimeEnv)
    });
    harness = await AgentLiveEvalHarness.create({
      pool,
      env: process.env,
      evidenceRoot: reportDir,
      evidenceKeyMaterial,
      campaignId: gate.campaignId,
      commitSha: gate.commitSha,
      matrixHash: gate.matrixHash
    });
    await poolState.assertHealthy();
    const cohorts = selectedCohort === 'both' ? ['v1', 'v2'] : [selectedCohort];
    for (const entry of selected) {
      for (const cohort of cohorts) {
        if (signalState.error) throw signalState.error;
        await poolState.assertHealthy();
        const startedAt = Date.now();
        const qwenBefore = Number(harness.auditor?.qwenCalls || 0);
        const kolorsBefore = Number(harness.auditor?.kolorsCalls || 0);
        process.stdout.write(`${JSON.stringify({
          event: 'live_eval.case.started',
          scenarioId: entry.id,
          cohort
        })}\n`);
        updateSlotJournal(journal, {
          scenarioId: entry.id,
          cohort,
          status: 'running'
        });
        await writeReport({ report: journal, reportDir, reportPath: journalPath });
        await writeReport({
          reportDir,
          reportPath,
          report: buildTerminalFailureReport({
            gate,
            selectedCase,
            selectedCohort,
            results,
            error: Object.assign(new Error('AGENT_LIVE_EVAL_IN_PROGRESS'), {
              code: 'AGENT_LIVE_EVAL_IN_PROGRESS'
            }),
            harness,
            databaseConnectivity: poolState.snapshot()
          })
        });
        try {
          const result = await harness.runCase(entry, cohort);
          const passed = result.ok !== false;
          const completed = { ...result, ok: passed };
          results.push(completed);
          updateSlotJournal(journal, {
            scenarioId: entry.id,
            cohort,
            status: passed ? 'succeeded' : 'failed',
            result: completed,
            code: passed ? null : String(completed.code || 'AGENT_LIVE_EVAL_BASELINE_FAILED')
          });
          process.stdout.write(`${JSON.stringify({
            event: passed ? 'live_eval.case.succeeded' : 'live_eval.case.baseline_recorded',
            scenarioId: entry.id,
            cohort,
            runId: result.runId || null,
            elapsedMs: Date.now() - startedAt
          })}\n`);
        } catch (error) {
          const databaseConnectionLost = isLiveEvalDatabaseConnectionError(error);
          const failure = contentFreeFailure({ entry, cohort, error });
          await harness.cancelActiveCohort(cohort);
          const evidence = await harness.captureCaseFailure({
            entry,
            cohort,
            qwenBefore,
            kolorsBefore
          }).catch(() => null);
          const completed = {
            ...failure,
            ...(evidence || {}),
            ok: false,
            code: failure.code,
            diagnosticHash: failure.diagnosticHash,
            elapsedMs: Date.now() - startedAt
          };
          results.push(completed);
          updateSlotJournal(journal, {
            scenarioId: entry.id,
            cohort,
            status: 'failed',
            result: completed,
            code: failure.code
          });
          process.stdout.write(`${JSON.stringify({
            event: 'live_eval.case.failed',
            scenarioId: entry.id,
            cohort,
            code: failure.code
          })}\n`);
          if (databaseConnectionLost) poolState.failClosed();
        }
        await writeReport({ report: journal, reportDir, reportPath: journalPath });
        if (signalState.error) throw signalState.error;
        await poolState.assertHealthy();
        // Every slot boundary proves that a fresh PostgreSQL connection can
        // read state. A failed probe terminates the campaign before another
        // paid Provider dispatch; an evicted idle connection alone does not.
        harness.assertWallClock();
      }
      await harness.assertBatchDrained();
    }
    const summary = summarize(results);
    const blindReviewBundle = summary.blindReviewPending
      ? await buildBlindReviewBundle({
          results,
          reportDir,
          keyMaterial: evidenceKeyMaterial
        })
      : null;
    await poolState.assertHealthy();
    harness.assertWallClock();
    const report = {
      version: 'agent-live-eval-v3.1',
      createdAt: new Date().toISOString(),
      campaignId: gate.campaignId,
      gateManifestSha256: gate.manifestSha256,
      commitSha: gate.commitSha,
      matrixHash: gate.matrixHash,
      modelLocks: {
        text: currentLiveTextModel(),
        image: 'Kwai-Kolors/Kolors'
      },
      limits: {
        perRunCredits: 50,
        qwenCalls: 200,
        kolorsCalls: 16,
        wallClockHours: 8
      },
      selectedCase: selectedCase || 'all',
      selectedCohort,
      results,
      summary,
      blindReview: blindReviewBundle
        ? {
            publicFile: path.relative(reportDir, blindReviewBundle.publicPath),
            encryptedMappingFile: path.relative(reportDir, blindReviewBundle.encryptedMappingPath),
            caseCount: blindReviewBundle.caseCount,
            definitionSha256: blindReviewBundle.definitionSha256
          }
        : null,
      traceSha256: harness.trace.digest(),
      requestTotals: harness.auditor.snapshot()
        ? {
            qwenCalls: harness.auditor.qwenCalls,
            kolorsCalls: harness.auditor.kolorsCalls
          }
        : null,
      databaseConnectivity: poolState.snapshot()
    };
    await writeReport({ report, reportDir, reportPath });
    await poolState.assertHealthy();
    harness.assertWallClock();
    journal.status = 'completed';
    journal.updatedAt = new Date().toISOString();
    await writeReport({ report: journal, reportDir, reportPath: journalPath });
    await poolState.assertHealthy();
    harness.assertWallClock();
    process.stdout.write(`${JSON.stringify({
      event: 'live_eval.completed',
      ok: summary.automatedGatePassed,
      blindReviewPending: summary.blindReviewPending,
      reportPath
    })}\n`);
    if (!summary.automatedGatePassed) process.exitCode = 1;
  } catch (error) {
    const terminalError = signalState.error || error;
    failUnfinishedJournalSlots(journal, {
      code: safeFailureCode(terminalError, 'AGENT_LIVE_EVAL_RUNNER_FAILED')
    });
    journal.status = signalState.error ? 'interrupted' : 'failed';
    journal.updatedAt = new Date().toISOString();
    await writeReport({ report: journal, reportDir, reportPath: journalPath }).catch(() => {});
    await writeReport({
      reportDir,
      reportPath,
      report: buildTerminalFailureReport({
        gate,
        selectedCase,
        selectedCohort,
        results: journalResults(journal),
        error: terminalError,
        harness,
        databaseConnectivity: poolState.snapshot()
      })
    });
    terminalError.reportPath = reportPath;
    throw terminalError;
  } finally {
    const cleanup = await closeLiveEvalResources({ harness, pool });
    if (poolState.error) {
      cleanup.ok = false;
      cleanup.results.push({
        ok: false,
        label: 'postgres-connection',
        code: poolState.error.code
      });
    }
    await attachCleanupEvidence({ reportPath, cleanup }).catch(() => {
      process.exitCode = 1;
    });
    if (!cleanup.ok) {
      process.exitCode = 1;
      process.stderr.write(`${JSON.stringify({
        event: 'live_eval.cleanup_failed',
        results: cleanup.results
      })}\n`);
    }
    // A timed-out pool.end() continues closing sockets in the background. Keep
    // the listener until process exit in that case so a late pg socket error
    // cannot become an uncaught EventEmitter exception after cleanup evidence
    // has already been written.
    disposeLiveEvalPoolErrorHandlerAfterCleanup({ poolState, cleanup });
    signalState.dispose();
  }
};

if (require.main === module) {
  void (async () => {
    try {
      await main();
    } catch (error) {
      process.stderr.write(`${JSON.stringify({
        event: 'live_eval.failed',
        code: safeFailureCode(error, 'AGENT_LIVE_EVAL_FAILED'),
        diagnosticHash: failureFingerprint(error),
        reportPath: error?.reportPath || null
      })}\n`);
      process.exitCode = 1;
    }
    await flushStandardStreams();
    process.exit(process.exitCode || 0);
  })();
}

module.exports = {
  loadLiveEvalSecrets,
  closeLiveEvalResources,
  attachCleanupEvidence,
  flushStandardStreams,
  median,
  resolveSelection,
  resolveCurrentCommitSha,
  safeFailureCode,
  failureFingerprint,
  buildTerminalFailureReport,
  createSlotJournal,
  failUnfinishedJournalSlots,
  findCampaignJournal,
  findInterruptedJournal,
  journalResults,
  liveEvalPoolOptions,
  installLiveEvalSignalHandlers,
  installLiveEvalPoolErrorHandler,
  isLiveEvalDatabaseConnectionError,
  disposeLiveEvalPoolErrorHandlerAfterCleanup,
  markInterruptedJournal,
  summarize
};
