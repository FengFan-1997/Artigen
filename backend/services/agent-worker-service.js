const crypto = require('crypto');
const { ApiError } = require('../lib/api-error');
const assets = require('./asset-storage');
const { getAgentConfig } = require('./agent-config');
const {
  createAgentArtifactService,
  inferRequiredDeliverables,
  quoteShell
} = require('./agent-artifact-service');
const {
  browserActionType,
  createAgentBrowserService
} = require('./agent-browser-service');
const {
  configuredImageCredits,
  createAgentImageService,
  normalizeAgentImageReferences
} = require('./agent-image-service');
const {
  AgentWaitingForUser,
  FUNCTION_TOOLS,
  createAgentModelProvider
} = require('./agent-model-provider');
const {
  assertAllowedOrigins,
  assertComputerOrigins,
  createAgentSandboxProvider
} = require('./agent-sandbox-provider');
const {
  createAgentIntegrationService
} = require('./agent-integration-service');
const { createCreativeProjectService } = require('./creative-project-service');
const {
  AgentDesktopRelayClient
} = require('./agent-desktop-relay-client');
const {
  connectorActionType,
  createAgentConnectorService
} = require('./agent-connector-service');
const {
  actionFingerprint,
  assertLoopBudget,
  classifyAction,
  TAKEOVER_ACTIONS
} = require('./agent-policy-service');
const {
  CHECKPOINT_VERSION,
  SKILLS,
  compileAgentPrompt,
  normalizeTaskSpec,
  normalizeArtifactEvidenceManifest,
  normalizeVerifierResult,
  renderSkillReference
} = require('./agent-runtime-v2');

class AgentPaused extends Error {
  constructor() {
    super('AGENT_PAUSED');
    this.code = 'AGENT_PAUSED';
  }
}

class AgentCancelled extends Error {
  constructor() {
    super('AGENT_CANCELLED');
    this.code = 'AGENT_CANCELLED';
  }
}

const normalizeLeaseCleanupRefs = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.freeze(Object.fromEntries(
    ['sandboxRef', 'browserSessionRef']
      .map((key) => [key, String(value[key] || '').trim().slice(0, 240)])
      .filter(([, reference]) => reference)
  ));
};

class LeaseLostDuringWorkError extends Error {
  constructor(cause, { cleanupRefs = {} } = {}) {
    super('AGENT_LEASE_LOST');
    this.name = 'LeaseLostDuringWorkError';
    this.code = 'AGENT_LEASE_LOST';
    this.status = 409;
    this.retryable = false;
    this.causeCode = String(cause?.code || cause?.name || 'AGENT_LEASE_UNPROVEN').slice(0, 100);
    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false
    });
    this.cleanupRefs = normalizeLeaseCleanupRefs(cleanupRefs);
  }
}

const isLeaseLostError = (error) => (
  error instanceof LeaseLostDuringWorkError || error?.code === 'AGENT_LEASE_LOST'
);

const firstPayload = (payloads, kind) => (
  payloads.find((payload) => payload.kind === kind)?.value || null
);

const resolveToolReceiptRequestSha256 = ({
  priorReceipt,
  computedRequestSha256,
  legacyReceipt = false
}) => {
  const computed = String(computedRequestSha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(computed)) {
    throw new ApiError(500, 'AGENT_TOOL_RECEIPT_REQUEST_HASH_INVALID');
  }
  const prior = String(priorReceipt?.requestSha256 || '').trim().toLowerCase();
  if (!prior) return computed;
  if (!/^[a-f0-9]{64}$/.test(prior)) {
    throw new ApiError(500, 'AGENT_TOOL_RECEIPT_REQUEST_HASH_INVALID');
  }
  if (!legacyReceipt && prior !== computed) {
    throw new ApiError(409, 'AGENT_TOOL_RECEIPT_CONFLICT', { retryable: false });
  }
  return prior;
};

const INPUT_EXTENSIONS = Object.freeze({
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'text/markdown': '.md',
  'text/plain': '.txt'
});

const readOpenedAsset = async (opened, maximumBytes = 100 * 1024 * 1024) => {
  if (Number(opened.contentLength || 0) > maximumBytes) {
    throw new ApiError(413, 'AGENT_INPUT_ASSET_TOO_LARGE');
  }
  if (typeof opened.body?.transformToByteArray === 'function') {
    const bytes = Buffer.from(await opened.body.transformToByteArray());
    if (bytes.length > maximumBytes) throw new ApiError(413, 'AGENT_INPUT_ASSET_TOO_LARGE');
    return bytes;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of opened.body) {
    size += chunk.length;
    if (size > maximumBytes) throw new ApiError(413, 'AGENT_INPUT_ASSET_TOO_LARGE');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const resolveStagedImageReferences = (value, stagedAssetsByPath) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 1) {
    throw new ApiError(400, 'AGENT_IMAGE_REFERENCES_INVALID');
  }
  const staged = stagedAssetsByPath instanceof Map ? stagedAssetsByPath : new Map();
  return normalizeAgentImageReferences(value.map((reference) => {
    const path = String(reference?.path || '').trim();
    const asset = staged.get(path);
    if (!asset) throw new ApiError(403, 'AGENT_IMAGE_REFERENCE_NOT_STAGED');
    return { path, role: reference?.role, mimeType: asset.mimeType, buffer: asset.buffer };
  }));
};

const restrictDelegatedTaskInputs = (tasks, allowedInputPaths = []) => {
  if (!Array.isArray(tasks)) return tasks;
  const allowed = new Set((Array.isArray(allowedInputPaths) ? allowedInputPaths : [])
    .map((path) => String(path || '').trim())
    .filter(Boolean));
  return tasks.map((task) => ({
    ...task,
    inputPaths: [...new Set((Array.isArray(task?.inputPaths) ? task.inputPaths : [])
      .map((path) => String(path || '').trim())
      .filter((path) => path && allowed.has(path)))]
  }));
};

const isSafeSubagentOutputPath = (value) => {
  const path = String(value || '').trim();
  return (
    /^\/workspace\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(path) &&
    !path.split('/').includes('..')
  );
};

const literalHeredocScript = (path, content) => {
  let delimiter = 'ARTIGEN_LITERAL_EOF';
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.includes(delimiter)) delimiter += '_SAFE';
  return [
    `cat > ${path} <<'${delimiter}'`,
    ...lines,
    delimiter
  ].join('\n');
};

const unwrapLiteralShellArgument = (value) => {
  const argument = String(value || '').trim();
  if (argument.length < 2) return null;
  const quote = argument[0];
  if (!['\'', '"'].includes(quote) || argument.at(-1) !== quote) return null;
  return argument.slice(1, -1);
};

const expectedSubagentOutputFilename = (expectedOutput) => {
  const filenames = [...new Set(
    [...String(expectedOutput || '').matchAll(
      /\b([A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(?:md|txt|json|csv|html|css|js|svg|ya?ml))\b/gi
    )].map((match) => match[1])
  )];
  return filenames.length === 1 ? filenames[0] : null;
};

const expectedSubagentTextOutputPath = ({ expectedOutput, purpose } = {}) => {
  const filename = expectedSubagentOutputFilename(expectedOutput);
  if (!filename) return null;
  if (!String(purpose || '').includes(filename)) return null;
  const path = `/workspace/${filename}`;
  return isSafeSubagentOutputPath(path) ? path : null;
};

const normalizeSubagentShellScript = (value, context = {}) => {
  const script = String(value || '');
  const multilineEcho = script.match(
    /^\s*echo\s+(['"])([\s\S]*)\1\s*>\s*(\/workspace\/[A-Za-z0-9._\/-]+)\s*$/
  );
  if (multilineEcho && isSafeSubagentOutputPath(multilineEcho[3])) {
    return {
      script: literalHeredocScript(multilineEcho[3], multilineEcho[2]),
      normalized: true,
      kind: 'literal_echo_write'
    };
  }

  const malformedHeredoc = script.match(
    /^\s*cat\s*>\s*(\/workspace\/[A-Za-z0-9._\/-]+)\s*<<\s*'([A-Za-z0-9_]+)'\s*&&\s*echo\s+([\s\S]+)$/
  );
  if (malformedHeredoc && isSafeSubagentOutputPath(malformedHeredoc[1])) {
    const delimiter = malformedHeredoc[2];
    const tail = malformedHeredoc[3].replace(
      new RegExp(`\\s+${delimiter}\\s*$`),
      ''
    );
    const lines = tail
      .split(/\s*&&\s*echo\s+/)
      .map(unwrapLiteralShellArgument);
    if (lines.length && lines.every((line) => line !== null)) {
      return {
        script: literalHeredocScript(malformedHeredoc[1], lines.join('\n')),
        normalized: true,
        kind: 'literal_heredoc_echo_chain'
      };
    }
  }

  const unterminatedEcho = script.match(/^\s*echo\s+(['"])([\s\S]*)$/);
  const inferredPath = expectedSubagentTextOutputPath(context);
  if (
    unterminatedEcho &&
    inferredPath &&
    unterminatedEcho[2].includes('\n') &&
    !unterminatedEcho[2].trimEnd().endsWith(unterminatedEcho[1])
  ) {
    return {
      script: literalHeredocScript(inferredPath, unterminatedEcho[2]),
      normalized: true,
      kind: 'literal_unterminated_echo_write'
    };
  }

  return { script, normalized: false, kind: null };
};

const inspectSubagentOutputFiles = async ({ sandbox, sandboxName, workspacePath }) => {
  const result = await sandbox.systemShell(
    sandboxName,
    [
      'set -eu',
      `root='${workspacePath}'`,
      'test -d "$root"',
      'clamscan --no-summary -r "$root" >/dev/null',
      'python3 - "$root" <<\'PY\'',
      'import hashlib, json, pathlib, sys',
      'root = pathlib.Path(sys.argv[1]).resolve()',
      'items = []',
      'for path in sorted(root.rglob("*")):',
      '    if path.is_symlink() or not path.is_file():',
      '        continue',
      '    resolved = path.resolve()',
      '    if root not in resolved.parents:',
      '        raise SystemExit("path escape")',
      '    size = resolved.stat().st_size',
      '    if size > 100 * 1024 * 1024:',
      '        raise SystemExit("file too large")',
      '    digest = hashlib.sha256(resolved.read_bytes()).hexdigest()',
      '    items.append({"path": str(resolved), "byteSize": size, "sha256": digest})',
      '    if len(items) > 100:',
      '        raise SystemExit("too many files")',
      'print(json.dumps(items, ensure_ascii=True))',
      'PY'
    ].join('\n'),
    120
  );
  if (!result.success) {
    throw new ApiError(422, 'AGENT_SUBAGENT_OUTPUT_SCAN_FAILED', {
      detail: String(result.stderr || '').slice(0, 200)
    });
  }
  try {
    const lines = String(result.stdout || '').trim().split('\n');
    const parsed = JSON.parse(lines[lines.length - 1] || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError(422, 'AGENT_SUBAGENT_OUTPUT_SCAN_FAILED');
  }
};

const assertExpectedSubagentOutputFiles = ({ expectedOutput, outputFiles }) => {
  const files = (Array.isArray(outputFiles) ? outputFiles : []).filter((file) => (
    Number(file?.byteSize || 0) > 0 && String(file?.sha256 || '').length === 64
  ));
  if (!files.length) {
    throw new ApiError(422, 'AGENT_SUBAGENT_OUTPUT_REQUIRED', { retryable: false });
  }
  const expectedFilename = expectedSubagentOutputFilename(expectedOutput);
  if (expectedFilename && !files.some((file) => (
    String(file.path || '').split('/').pop() === expectedFilename
  ))) {
    throw new ApiError(422, 'AGENT_SUBAGENT_EXPECTED_OUTPUT_MISSING', {
      retryable: false,
      expectedFilename
    });
  }
  return files;
};

const parentVerifiedSubagentFiles = async ({ sandbox, sandboxName, outputFiles }) => {
  let excerptBytesRemaining = 18_000;
  const results = [];
  for (const file of Array.isArray(outputFiles) ? outputFiles : []) {
    const verified = {
      path: String(file?.path || ''),
      byteSize: Math.max(0, Number(file?.byteSize || 0)),
      sha256: String(file?.sha256 || ''),
      verificationStatus: 'passed',
      untrustedContent: true
    };
    const canReadAsText = (
      excerptBytesRemaining > 0 &&
      verified.byteSize > 0 &&
      verified.byteSize <= 64 * 1024 &&
      /\.(?:md|txt|json|csv|html|css|js|svg|ya?ml)$/i.test(verified.path)
    );
    if (canReadAsText) {
      try {
        const read = await sandbox.readFile(sandboxName, verified.path);
        const buffer = Buffer.from(String(read?.base64 || ''), 'base64');
        const digest = crypto.createHash('sha256').update(buffer).digest('hex');
        if (
          buffer.length === verified.byteSize &&
          digest === verified.sha256 &&
          !buffer.includes(0)
        ) {
          const excerpt = buffer.subarray(0, excerptBytesRemaining).toString('utf8');
          verified.textExcerpt = excerpt;
          excerptBytesRemaining = Math.max(
            0,
            excerptBytesRemaining - Buffer.byteLength(excerpt, 'utf8')
          );
        }
      } catch {
        // The independent scan above remains authoritative; excerpts are optional context.
      }
    }
    results.push(verified);
  }
  return results;
};

const buildSubagentObjective = (task = {}) => [
  `Delegated role: ${task.role}`,
  `Objective: ${task.objective}`,
  `Expected output: ${task.expectedOutput}`,
  Array.isArray(task.inputPaths) && task.inputPaths.length
    ? `Read-only inputs: ${task.inputPaths.map((inputPath) => (
        `${inputPath} -> /inputs/${inputPath.split('/').pop()}`
      )).join(', ')}`
    : 'Read-only inputs: none',
  'Use a concise plan of 2-4 steps total. Combine related sections into one writing step instead of creating one step per subsection.',
  'Create the expected file in as few shell calls as practical, inspect it once, then mark every plan step completed.',
  'Inside your tools, write every result only under /workspace. The parent maps that isolated directory internally; never guess, inspect, mention, or use its host path.'
].join('\n\n');

const createAgentCostMeter = ({
  costs = {},
  sandboxCreditsPerMinute = 1,
  now = Date.now
} = {}) => {
  const rate = Math.max(0, Number(sandboxCreditsPerMinute || 0));
  const restoredActors = costs.modelByActor && typeof costs.modelByActor === 'object'
    ? Object.entries(costs.modelByActor)
    : [];
  const modelByActor = new Map(restoredActors.map(([actor, value]) => [
    String(actor),
    Math.max(0, Number(value || 0))
  ]));
  if (!modelByActor.size) modelByActor.set('parent', Math.max(0, Number(costs.model || 0)));
  let generation = Math.max(0, Number(costs.generation || 0));
  let sandbox = Math.max(0, Number(costs.sandbox || 0));
  let sandboxMeteredAt = now();
  const pendingSandbox = () => (
    sandbox + Math.max(0, now() - sandboxMeteredAt) / 60_000 * rate
  );
  const round = (value) => Number(Math.max(0, Number(value || 0)).toFixed(4));
  const modelTotal = () => [...modelByActor.values()].reduce((total, value) => total + value, 0);

  return {
    setModel(value) {
      modelByActor.set('parent', Math.max(
        Number(modelByActor.get('parent') || 0),
        Math.max(0, Number(value || 0))
      ));
    },
    setModelFor(actorId, value) {
      const actor = String(actorId || '').trim();
      if (!actor) throw new TypeError('AGENT_COST_ACTOR_REQUIRED');
      modelByActor.set(actor, Math.max(
        Number(modelByActor.get(actor) || 0),
        Math.max(0, Number(value || 0))
      ));
    },
    restoreModelForMinimum(actorId, value) {
      const actor = String(actorId || '').trim();
      if (!actor) throw new TypeError('AGENT_COST_ACTOR_REQUIRED');
      modelByActor.set(actor, Math.max(
        Number(modelByActor.get(actor) || 0),
        Math.max(0, Number(value || 0))
      ));
    },
    restoreModelMinimum(value) {
      modelByActor.set('parent', Math.max(
        Number(modelByActor.get('parent') || 0),
        Math.max(0, Number(value || 0))
      ));
    },
    addGeneration(value) {
      generation += Math.max(0, Number(value || 0));
    },
    restoreGenerationMinimum(value) {
      generation = Math.max(generation, Math.max(0, Number(value || 0)));
    },
    accrueSandbox() {
      sandbox = pendingSandbox();
      sandboxMeteredAt = now();
      return sandbox;
    },
    snapshot({ accrue = false, minimumSandboxSeconds = 0 } = {}) {
      if (accrue) {
        sandbox = pendingSandbox();
        sandboxMeteredAt = now();
      }
      const modelActors = Object.fromEntries(
        [...modelByActor.entries()].map(([actor, value]) => [actor, round(value)])
      );
      return {
        model: round(modelTotal()),
        ...(Object.keys(modelActors).some((actor) => actor !== 'parent')
          ? { modelByActor: modelActors }
          : {}),
        generation: round(generation),
        sandbox: round(Math.max(
          pendingSandbox(),
          rate * Math.max(0, Number(minimumSandboxSeconds || 0)) / 60
        ))
      };
    },
    total({ additional = 0 } = {}) {
      return modelTotal() + generation + pendingSandbox() + Math.max(0, Number(additional || 0));
    }
  };
};

const createSerializedCostPersister = ({
  costMeter,
  saveCheckpoint,
  recordUsage
}) => {
  if (
    !costMeter || typeof costMeter.snapshot !== 'function' ||
    typeof saveCheckpoint !== 'function' ||
    typeof recordUsage !== 'function'
  ) {
    throw new TypeError('AGENT_COST_PERSISTER_DEPENDENCY_REQUIRED');
  }
  let pending = Promise.resolve();
  return ({ usageItems = null } = {}) => {
    const operation = pending.then(async () => {
      const costs = costMeter.snapshot({ accrue: true });
      await saveCheckpoint(costs);
      if (usageItems) await recordUsage(costs, usageItems);
      return costs;
    });
    pending = operation.catch(() => {});
    return operation;
  };
};

const runWithLeaseHeartbeat = async ({
  refresh,
  work,
  intervalMs = 30_000,
  abortController = null,
  onLeaseLost = null,
  cleanupRefsFromResult = null
}) => {
  if (typeof refresh !== 'function' || typeof work !== 'function') {
    throw new TypeError('AGENT_LEASE_HEARTBEAT_DEPENDENCY_REQUIRED');
  }
  const delay = Math.max(100, Number(intervalMs || 0));
  let heartbeatPromise = null;
  let timer = null;
  let leaseError = null;

  const recordLeaseError = (error) => {
    if (leaseError) return;
    leaseError = error;
    abortController?.abort(error);
    onLeaseLost?.(error);
  };

  const heartbeat = () => {
    if (heartbeatPromise) return heartbeatPromise;
    heartbeatPromise = Promise.resolve()
      .then(refresh)
      .catch(recordLeaseError)
      .finally(() => {
        heartbeatPromise = null;
      });
    return heartbeatPromise;
  };

  try {
    await refresh();
  } catch (error) {
    recordLeaseError(error);
    throw new LeaseLostDuringWorkError(error);
  }
  timer = setInterval(heartbeat, delay);
  timer.unref?.();
  let result;
  let workError = null;
  try {
    result = await work();
  } catch (error) {
    workError = error;
  } finally {
    clearInterval(timer);
    if (heartbeatPromise) await heartbeatPromise;
  }
  const cleanupRefs = () => normalizeLeaseCleanupRefs(
    typeof cleanupRefsFromResult === 'function'
      ? cleanupRefsFromResult(result)
      : {}
  );
  try {
    await refresh();
  } catch (error) {
    recordLeaseError(error);
  }
  if (leaseError) {
    throw new LeaseLostDuringWorkError(leaseError, { cleanupRefs: cleanupRefs() });
  }
  if (workError) throw workError;
  return { value: result, leaseError };
};

const createAgentWorkerService = ({
  pool,
  runService,
  env = process.env,
  sandbox = createAgentSandboxProvider({ env }),
  model = createAgentModelProvider({ env }),
  modelCallService = null,
  integrationService = createAgentIntegrationService({ pool, env }),
  imageService = createAgentImageService({ env }),
  assetStorage = undefined,
  testController = null,
  runtimeReadiness = {}
} = {}) => {
  if (!pool || !runService) throw new TypeError('AGENT_WORKER_DEPENDENCY_REQUIRED');
  if (testController && String(env.NODE_ENV || '').trim() !== 'test') {
    throw new TypeError('AGENT_RUNTIME_TEST_CONTROLLER_FORBIDDEN');
  }
  const config = getAgentConfig(env);
  const artifactService = createAgentArtifactService({
    pool,
    sandbox,
    runService,
    ...(assetStorage ? { assetStorage } : {})
  });
  const browserService = createAgentBrowserService({ sandbox, env });
  const connectorService = createAgentConnectorService({ integrationService });
  const projectService = createCreativeProjectService({ pool, env });
  const workerId = config.workerId ||
    `agent-worker-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  const desktopRelay = new AgentDesktopRelayClient({
    pool,
    sandbox,
    workerId,
    env
  });
  const readiness = {
    browserReady: config.browserMode === 'full-approval-v1' &&
      runtimeReadiness.egressVerified === true,
    egressVerified: runtimeReadiness.egressVerified === true,
    desktopRelayReady: false,
    sandboxImageRef: config.sandboxImageRef || null
  };

  const processRun = async (runId) => {
    const claimed = await runService.claimRun({ runId, workerId });
    if (!claimed) return { claimed: false };
    const leaseEpoch = Number(claimed.lease_epoch || 0);
    if (!Number.isSafeInteger(leaseEpoch) || leaseEpoch <= 0) {
      throw new ApiError(409, 'AGENT_LEASE_EPOCH_INVALID');
    }
    const runLease = { runId, workerId, leaseEpoch };
    const verifierReserveCredits = typeof model.maximumCallCredits === 'function'
      ? model.maximumCallCredits(
          Math.max(1024, config.modelContextTokens - 5120),
          Number(config.stageMaxOutputTokens?.verifier || 2048)
        )
      : 0;
    const reserveRuntimeBudget = (reservation) => runService.reserveRuntimeBudget({
      ...runLease,
      ...reservation,
      preserveVerifierCredits: reservation.component === 'verifier' ? 0 : verifierReserveCredits
    });
    const consumeRuntimeBudget = (reservation) => runService.consumeRuntimeBudget({
      ...runLease,
      ...reservation
    });
    const releaseRuntimeBudget = (reservation) => runService.releaseRuntimeBudget({
      ...runLease,
      ...reservation
    });

    let sandboxName = claimed.sandbox_ref || null;
    const startedAt = Date.now();
    const runStartedAt = new Date(claimed.started_at || Date.now()).getTime();
    const sandboxCreditsPerMinute = Math.max(0, Number(
      env.AGENT_SANDBOX_CREDITS_PER_MINUTE || 1
    ));
    const costMeter = createAgentCostMeter({
      costs: claimed.checkpoint?.costs,
      sandboxCreditsPerMinute
    });
    let terminal = false;
    let browserInitialized = false;

    const persistCostCheckpoint = createSerializedCostPersister({
      costMeter,
      saveCheckpoint: (costs) => runService.saveCheckpoint({
        ...runLease,
        checkpoint: { costs }
      }),
      recordUsage: (costs, usageItems) => runService.recordUsage({
        ...runLease,
        estimatedCredits: costs.model + costs.generation + costs.sandbox,
        items: { ...costs, ...usageItems }
      })
    });

    const pauseIfRequested = async () => {
      if (Date.now() - runStartedAt >= config.maxMinutes * 60_000) {
        throw new ApiError(409, 'AGENT_TIME_LIMIT_REACHED');
      }
      const control = await runService.getControlState({ runId });
      if (control.status === 'cancelled' || control.cancel_requested) {
        throw new AgentCancelled();
      }
      assertLoopBudget({
        stepCount: control.step_count,
        maxSteps: config.maxSteps,
        replanCount: control.replan_count,
        consecutiveFailures: control.consecutive_failures,
        unchangedScreenshots: control.unchanged_screenshots
      });
      if (control.pause_requested) {
        await persistCostCheckpoint();
        if (sandboxName) await sandbox.suspend(sandboxName);
        await runService.transitionRun({
          ...runLease,
          toStatus: 'paused',
          eventType: 'run.paused',
          summary: '已在安全检查点暂停'
        });
        throw new AgentPaused();
      }
    };

    try {
      const context = await runService.loadPrivateContext({ runId });
      const legacyToolReceiptEntries = Object.entries(
        context.run.checkpoint?.toolReceipts && typeof context.run.checkpoint.toolReceipts === 'object'
          ? context.run.checkpoint.toolReceipts
          : {}
      );
      const durableToolReceipts = new Map(legacyToolReceiptEntries);
      const persistentToolReceipts = typeof runService.listToolReceipts === 'function'
        ? await runService.listToolReceipts(runLease)
        : [];
      for (const receipt of persistentToolReceipts) {
        durableToolReceipts.set(receipt.key, receipt);
      }
      const durableToolReceiptLedger = (
        typeof runService.persistToolReceipt === 'function' &&
        typeof runService.removeDispatchedToolReceipt === 'function'
      );
      const persistToolReceipt = async (key, value) => {
        if (durableToolReceiptLedger) {
          const persisted = await runService.persistToolReceipt({
            ...runLease,
            receiptKey: key,
            ...value
          });
          durableToolReceipts.set(key, persisted);
          return persisted;
        }
        durableToolReceipts.set(key, value);
        const bounded = [...durableToolReceipts.entries()].slice(-16);
        durableToolReceipts.clear();
        for (const [receiptKey, receiptValue] of bounded) {
          durableToolReceipts.set(receiptKey, receiptValue);
        }
        await runService.saveCheckpoint({
          ...runLease,
          checkpoint: { toolReceipts: Object.fromEntries(durableToolReceipts) }
        });
      };
      const removeToolReceipt = async (key, requestSha256) => {
        if (durableToolReceiptLedger) {
          await runService.removeDispatchedToolReceipt({
            ...runLease,
            receiptKey: key,
            requestSha256
          });
          durableToolReceipts.delete(key);
          return;
        }
        durableToolReceipts.delete(key);
        await runService.saveCheckpoint({
          ...runLease,
          checkpoint: { toolReceipts: Object.fromEntries(durableToolReceipts) }
        });
      };
      if (
        durableToolReceiptLedger &&
        legacyToolReceiptEntries.length > 0 &&
        typeof runService.clearLegacyToolReceiptCheckpoint === 'function'
      ) {
        for (const [key, receipt] of legacyToolReceiptEntries) {
          const kind = String(receipt?.kind || '');
          if (!['sandbox_shell', 'kolors'].includes(kind)) {
            throw new ApiError(500, 'AGENT_LEGACY_TOOL_RECEIPT_INVALID');
          }
          const inferredState = receipt?.state || (receipt?.result ? 'consumed' : 'dispatched');
          if (!['dispatched', 'consumed', 'ambiguous'].includes(inferredState)) {
            throw new ApiError(500, 'AGENT_LEGACY_TOOL_RECEIPT_INVALID');
          }
          const legacySubagentId = key.startsWith('subagent:')
            ? String(key.split(':')[1] || '')
            : null;
          const reservationKey = receipt?.reservationKey || (
            kind === 'kolors' ? `kolors:${key}` : `sandbox:${key}`
          );
          const imported = await runService.persistToolReceipt({
            ...runLease,
            subagentId: legacySubagentId,
            receiptKey: key,
            kind,
            state: inferredState,
            reservationKey,
            requestSha256: /^[a-f0-9]{64}$/i.test(String(receipt?.requestSha256 || ''))
              ? String(receipt.requestSha256).toLowerCase()
              : crypto.createHash('sha256').update(`legacy:${key}`).digest('hex'),
            actualCredits: inferredState === 'consumed'
              ? Number(receipt?.actualCredits || receipt?.result?.costCredits || 0)
              : null,
            result: inferredState === 'consumed' ? receipt.result : null,
            legacyImport: true
          });
          durableToolReceipts.set(key, imported);
        }
        await runService.clearLegacyToolReceiptCheckpoint(runLease);
      }
      costMeter.restoreGenerationMinimum(
        [...durableToolReceipts.values()]
          .filter((receipt) => receipt?.kind === 'kolors' && receipt?.state === 'consumed')
          .reduce((total, receipt) => (
            total + Number(receipt.actualCredits || receipt.result?.costCredits || 0)
          ), 0)
      );
      costMeter.restoreModelMinimum(context.modelCheckpoint?.totalCredits);
      const objectivePayload = firstPayload(context.payloads, 'objective');
      if (!objectivePayload?.objective) throw new ApiError(500, 'AGENT_OBJECTIVE_MISSING');
      const requiredDeliverables = Array.isArray(objectivePayload.deliverables) &&
          objectivePayload.deliverables.length
        ? objectivePayload.deliverables
        : inferRequiredDeliverables(objectivePayload.objective);
      const userInputs = context.payloads
        .filter((payload) => payload.kind === 'user_input')
        .map((payload) => payload.value)
        .slice(-20);
      const runtimeV2 = Number(context.run.runtime_version || 1) === 2;
      const parsedToolRetryEpoch = Number(context.run.checkpoint?.toolRetryEpoch || 0);
      const toolRetryEpoch = Number.isSafeInteger(parsedToolRetryEpoch) && parsedToolRetryEpoch >= 0
        ? parsedToolRetryEpoch
        : 0;
      let modelResumeState = context.modelCheckpoint;
      if (
        runtimeV2 &&
        modelCallService?.adoptLatestReceived &&
        typeof model.recoverReceivedModelCall === 'function'
      ) {
        const adopted = await modelCallService.adoptLatestReceived({
          ...runLease,
          subagentId: null
        });
        if (adopted) {
          const recovered = model.recoverReceivedModelCall(adopted);
          const recoveredUsage = typeof model.usageDetails === 'function'
            ? model.usageDetails(recovered)
            : { inputTokens: 0, outputTokens: 0, credits: 0 };
          if (adopted.intent?.phase === 'planner') {
            let plannedValue;
            try {
              plannedValue = JSON.parse(String(recovered.message?.content || ''));
            } catch {
              throw new ApiError(500, 'AGENT_MODEL_RECEIPT_INVALID', { retryable: false });
            }
            const plannedTaskSpec = normalizeTaskSpec(plannedValue, {
              objective: objectivePayload.objective,
              deliverables: requiredDeliverables,
              capabilities: context.run.capabilities,
              allowedOrigins: context.run.browser_config?.allowedOrigins || [],
              maxCredits: context.run.max_credits
            });
            modelResumeState = {
              ...(modelResumeState || {}),
              version: CHECKPOINT_VERSION,
              runtimeVersion: 2,
              provider: model.providerName || context.run.model_provider,
              taskSpec: plannedTaskSpec,
              plannerModelCallReceipt: adopted.call,
              plannerReservationKey: adopted.reservationKey,
              plannerReservationActualCredits: recoveredUsage.credits,
              totalCredits: Math.max(
                Number(modelResumeState?.totalCredits || 0),
                Number(recoveredUsage.credits || 0)
              )
            };
          } else if (adopted.intent?.phase === 'verifier') {
            let verifierValue;
            try {
              verifierValue = JSON.parse(String(recovered.message?.content || ''));
            } catch {
              throw new ApiError(500, 'AGENT_MODEL_RECEIPT_INVALID', { retryable: false });
            }
            const recoveredTaskSpec = modelResumeState?.taskSpec || objectivePayload.taskSpec;
            modelResumeState = {
              ...(modelResumeState || {}),
              version: CHECKPOINT_VERSION,
              runtimeVersion: 2,
              totalCredits: Number(modelResumeState?.totalCredits || 0) +
                Number(recoveredUsage.credits || 0),
              pendingVerifierResult: {
                result: normalizeVerifierResult(verifierValue, { taskSpec: recoveredTaskSpec }),
                usage: recoveredUsage,
                credits: recoveredUsage.credits,
                modelCallReceipt: adopted.call,
                reservationKey: adopted.reservationKey,
                reservationActualCredits: recoveredUsage.credits
              }
            };
          } else {
            modelResumeState = {
              ...(modelResumeState || {}),
              version: CHECKPOINT_VERSION,
              runtimeVersion: 2,
              pendingModelResponse: recovered
            };
          }
          await runService.saveModelCheckpoint({ ...runLease, value: modelResumeState });
        }
      }
      if (runtimeV2 && modelResumeState?.plannerModelCallReceipt) {
        await consumeRuntimeBudget({
          reservationKey: modelResumeState.plannerReservationKey,
          actualCredits: modelResumeState.plannerReservationActualCredits
        });
        if (modelCallService) {
          await modelCallService.consume(modelResumeState.plannerModelCallReceipt);
        }
        modelResumeState = {
          ...modelResumeState,
          plannerModelCallReceipt: null,
          plannerReservationKey: null,
          plannerReservationActualCredits: 0
        };
        await runService.saveModelCheckpoint({ ...runLease, value: modelResumeState });
      }
      let taskSpec = runtimeV2
        ? (modelResumeState?.taskSpec || objectivePayload.taskSpec || null)
        : null;
      let projectMemory = null;
      let latestSemanticVerification = modelResumeState?.semanticVerificationResult ||
        modelResumeState?.pendingVerifierResult?.result ||
        null;
      let semanticVerifierAttempts = Math.max(
        0,
        Number(modelResumeState?.semanticVerificationAttempts || 0)
      );
      if (runtimeV2 && config.projectMemoryEnabled && context.run.project_id) {
        const project = await projectService.getProject({
          userId: context.run.user_id,
          projectId: context.run.project_id
        });
        projectMemory = project.designMemory || null;
      }

      if (sandboxName) {
        await sandbox.ensureRunning(sandboxName);
        await runService.transitionRun({
          ...runLease,
          toStatus: 'running',
          eventType: 'sandbox.resumed',
          summary: '已恢复隔离云电脑',
          sandboxRef: sandboxName,
          checkpoint: { phase: 'running', sandboxReady: true }
        });
      } else {
        const provisioning = await runWithLeaseHeartbeat({
          intervalMs: Math.max(
            5_000,
            Math.min(30_000, Math.floor(config.leaseSeconds * 1_000 / 3))
          ),
          refresh: () => runService.saveCheckpoint({
            ...runLease,
            checkpoint: { phase: 'provisioning', sandboxReady: false }
          }),
          work: () => sandbox.provision({
            runId,
            browserEnabled: context.run.capabilities?.browser === true
          }),
          cleanupRefsFromResult: (value) => ({ sandboxRef: value?.name })
        });
        const provisioned = provisioning.value;
        sandboxName = provisioned.name;
        if (provisioning.leaseError) throw provisioning.leaseError;
        await runService.transitionRun({
          ...runLease,
          toStatus: 'running',
          eventType: 'sandbox.ready',
          summary: '隔离云电脑已就绪',
          sandboxRef: sandboxName,
          displayUrl: provisioned.displayUrl,
          checkpoint: { phase: 'running', sandboxReady: true }
        });
        const prerequisites = await sandbox.systemShell(
          sandboxName,
          [
            'set -eu',
            'umask 077',
            'test "$(id -u)" -ne 0',
            'mkdir -p /tmp/artigen-workspace /tmp/artigen-verify',
            'command -v chromium >/dev/null || command -v chromium-browser >/dev/null',
            'command -v bwrap >/dev/null',
            'bwrap --unshare-net --die-with-parent --bind / / /bin/true',
            'command -v libreoffice >/dev/null',
            'command -v python3 >/dev/null',
            'command -v node >/dev/null',
            'command -v ffmpeg >/dev/null',
            'command -v convert >/dev/null || command -v magick >/dev/null',
            'command -v clamscan >/dev/null',
            'command -v pdfinfo >/dev/null'
          ].join('\n'),
          30
        );
        if (!prerequisites.success) {
          throw new ApiError(503, 'AGENT_SANDBOX_IMAGE_INVALID', {
            retryable: false,
            missingTool: String(prerequisites.stderr || '').slice(0, 200)
          });
        }
        if (context.run.browser_config?.profileId) {
          const profile = await runService.loadBrowserProfile({
            userId: context.run.user_id,
            profileId: context.run.browser_config.profileId
          });
          const archive = Buffer.from(profile.archiveBase64, 'base64');
          await sandbox.writeFile(
            sandboxName,
            '/tmp/artigen-workspace/.artigen/browser-profile.zip',
            archive
          );
          const restored = await sandbox.systemShell(
            sandboxName,
            [
              'set -eu',
              "profile='/tmp/artigen-workspace/.artigen/browser-profile.zip'",
              'clamscan --no-summary "$profile" >/dev/null',
              'python3 - "$profile" <<\'PY\'',
              'import pathlib, sys, zipfile',
              'allowed = {"Local State", "Default/Cookies", "Default/Local Storage", "Default/Session Storage"}',
              'with zipfile.ZipFile(sys.argv[1]) as z:',
              '    entries = z.infolist()',
              '    assert len(entries) <= 1000',
              '    assert sum(i.file_size for i in entries) <= 20 * 1024 * 1024',
              '    for item in entries:',
              '        name = pathlib.PurePosixPath(item.filename)',
              '        assert not name.is_absolute() and ".." not in name.parts',
              '        assert any(str(name) == root or str(name).startswith(root + "/") for root in allowed)',
              'PY',
              'mkdir -p /tmp/artigen-chromium',
              'unzip -q "$profile" -d /tmp/artigen-chromium'
            ].join('\n'),
            120
          );
          if (!restored.success) throw new ApiError(422, 'AGENT_BROWSER_PROFILE_RESTORE_FAILED');
        }
      }

      if (context.run.capabilities?.browser === true) {
        await browserService.initialize({ sandboxName });
        browserInitialized = true;
      }
      await pauseIfRequested();
      const inputAssetPaths = [];
      const stagedAssetsByPath = new Map();
      for (const assetId of objectivePayload.assetIds || []) {
        const opened = await (assetStorage?.openAsset || assets.openAsset)({
          assetId,
          ownerUserId: context.run.user_id,
          pool
        });
        const bytes = await readOpenedAsset(opened);
        const extension = INPUT_EXTENSIONS[String(opened.record.mime_type || '').toLowerCase()] || '.bin';
        const inputPath = `/tmp/artigen-workspace/inputs/${assetId}${extension}`;
        await sandbox.writeFile(sandboxName, inputPath, bytes);
        const scan = await sandbox.systemShell(
          sandboxName,
          `clamscan --no-summary '${inputPath}' >/dev/null`,
          120
        );
        if (!scan.success) {
          throw new ApiError(422, 'AGENT_INPUT_ASSET_SCAN_FAILED', { assetId });
        }
        inputAssetPaths.push(inputPath);
        stagedAssetsByPath.set(inputPath, {
          mimeType: String(opened.record.mime_type || '').toLowerCase(),
          buffer: bytes
        });
      }
      const runtimeObjective = [
        objectivePayload.objective,
        userInputs.length
          ? `Subsequent user messages and decisions: ${JSON.stringify(userInputs)}`
          : '',
        inputAssetPaths.length
          ? `User-provided files are available at: ${inputAssetPaths.join(', ')}`
          : ''
      ].filter(Boolean).join('\n\n');
      if (runtimeV2 && !taskSpec) {
        const plannerAbortController = new AbortController();
        const planning = await runWithLeaseHeartbeat({
          intervalMs: Math.max(
            5_000,
            Math.min(30_000, Math.floor(config.leaseSeconds * 1_000 / 3))
          ),
          abortController: plannerAbortController,
          refresh: async () => {
            const control = await runService.getControlState({ runId });
            if (control.status === 'cancelled' || control.cancel_requested) {
              plannerAbortController.abort();
              throw new AgentCancelled();
            }
            return runService.saveCheckpoint({
              ...runLease,
              checkpoint: { phase: 'planning', sandboxReady: true }
            });
          },
          work: () => model.planTask({
            objective: runtimeObjective,
            deliverables: requiredDeliverables,
            capabilities: context.run.capabilities,
            allowedOrigins: context.run.browser_config?.allowedOrigins || [],
            maxCredits: context.run.max_credits,
            projectMemory,
            metadata: {
              ...runLease,
              userId: context.run.user_id,
              priority: context.modelCheckpoint ? 'resumed_parent' : 'planner',
              promptProfile: context.run.prompt_profile,
              promptHash: Buffer.isBuffer(context.run.prompt_hash)
                ? context.run.prompt_hash.toString('hex')
                : null,
              skillIds: Object.keys(context.run.skill_versions || {}),
              signal: plannerAbortController.signal,
              reserveBudget: reserveRuntimeBudget,
              consumeBudget: consumeRuntimeBudget,
              releaseBudget: releaseRuntimeBudget,
              checkpointResult: async (plannedResult) => {
                const plannedTaskSpec = plannedResult.taskSpec;
                modelResumeState = {
                  version: CHECKPOINT_VERSION,
                  provider: model.providerName || context.run.model_provider,
                  messages: [],
                  taskSpec: plannedTaskSpec,
                  workingState: {
                    version: 2,
                    taskSpec: plannedTaskSpec,
                    phase: plannedTaskSpec.plan[0]?.phase || 'production',
                    projectMemory,
                    sources: [],
                    files: [],
                    completedEvidence: [],
                    failures: [],
                    pendingApproval: null,
                    remainingBudget: Number(context.run.max_credits || 0)
                  },
                  totalCredits: plannedResult.credits,
                  plannerModelCallReceipt: plannedResult.modelCallReceipt || null,
                  plannerReservationKey: plannedResult.reservationKey || null,
                  plannerReservationActualCredits: plannedResult.reservationActualCredits || 0,
                  turns: 0,
                  planPublished: true
                };
                costMeter.setModel(plannedResult.credits);
                await runService.saveModelCheckpoint({
                  ...runLease,
                  value: modelResumeState
                });
                await persistCostCheckpoint({
                  usageItems: { source: 'runtime_v2_planner_checkpoint', ...plannedResult.usage }
                });
              }
            }
          })
        });
        if (planning.leaseError) throw planning.leaseError;
        const planned = planning.value;
        taskSpec = planned.taskSpec;
        if (modelResumeState?.plannerModelCallReceipt) {
          modelResumeState = {
            ...modelResumeState,
            plannerModelCallReceipt: null,
            plannerReservationKey: null,
            plannerReservationActualCredits: 0
          };
          await runService.saveModelCheckpoint({ ...runLease, value: modelResumeState });
        }
        if (!modelResumeState?.taskSpec) {
          modelResumeState = {
            version: CHECKPOINT_VERSION,
            provider: model.providerName || context.run.model_provider,
            messages: [],
            taskSpec,
            workingState: {
              version: 2,
              taskSpec,
              phase: taskSpec.plan[0]?.phase || 'production',
              projectMemory,
              sources: [],
              files: [],
              completedEvidence: [],
              failures: [],
              pendingApproval: null,
              remainingBudget: Number(context.run.max_credits || 0)
            },
            totalCredits: planned.credits,
            turns: 0,
            planPublished: true
          };
          costMeter.setModel(planned.credits);
          await runService.saveModelCheckpoint({ ...runLease, value: modelResumeState });
          await persistCostCheckpoint({
            usageItems: { source: 'runtime_v2_planner', ...planned.usage }
          });
        }
        await runService.savePlan({
          ...runLease,
          plan: taskSpec.plan.map((step) => ({
            id: step.id,
            label: step.label,
            phase: step.phase,
            status: step.status
          })),
          explanation: '已根据目标、约束和交付条件编译执行计划。'
        });
        await runService.appendRuntimeEvent({
          ...runLease,
          type: 'plan.compiled',
          phase: 'planning',
          summary: 'Runtime V2 已编译执行计划',
          data: {
            complexity: taskSpec.complexity,
            confidence: taskSpec.confidence,
            skillIds: taskSpec.skillIds,
            stepCount: taskSpec.plan.length
          }
        });
      }
      if (runtimeV2 && taskSpec && !modelResumeState) {
        modelResumeState = {
          version: CHECKPOINT_VERSION,
          provider: model.providerName || context.run.model_provider,
          messages: [],
          taskSpec,
          workingState: {
            version: 2,
            taskSpec,
            phase: taskSpec.plan[0]?.phase || 'production',
            projectMemory,
            sources: [],
            files: [],
            completedEvidence: [],
            failures: [],
            pendingApproval: null,
            remainingBudget: Number(context.run.max_credits || 0)
          },
          totalCredits: 0,
          turns: 0,
          planPublished: true
        };
        await runService.saveModelCheckpoint({ ...runLease, value: modelResumeState });
        await runService.savePlan({
          ...runLease,
          plan: taskSpec.plan.map((step) => ({
            id: step.id,
            label: step.label,
            phase: step.phase,
            status: step.status
          })),
          explanation: '已复用对话入口编译并经服务端校验的执行计划。'
        });
        await runService.appendRuntimeEvent({
          ...runLease,
          type: 'plan.compiled',
          phase: 'planning',
          summary: '已复用对话入口的 Runtime V2 任务规范',
          data: {
            source: 'design-router',
            complexity: taskSpec.complexity,
            confidence: taskSpec.confidence,
            skillIds: taskSpec.skillIds,
            stepCount: taskSpec.plan.length
          }
        });
      }
      if (runtimeV2) {
        const frozenRuntimePhase = objectivePayload.taskSpec?.plan?.[0]?.phase || (
          context.run.capabilities?.browser ? 'research' : 'production'
        );
        const frozenRuntimeProfile = compileAgentPrompt({
          objective: runtimeObjective,
          capabilities: context.run.capabilities,
          deliverables: requiredDeliverables,
          taskSpec: objectivePayload.taskSpec || null,
          phase: frozenRuntimePhase,
          toolSchemas: FUNCTION_TOOLS,
          modelConfig: {
            actorSamplingProfile: config.actorSamplingProfile,
            adaptiveReasoningEnabled: config.adaptiveReasoningEnabled,
            stageMaxOutputTokens: config.stageMaxOutputTokens
          }
        });
        await runService.pinRuntimeProfile({ ...runLease, profile: frozenRuntimeProfile });
        const runtimeProfile = compileAgentPrompt({
          objective: runtimeObjective,
          capabilities: context.run.capabilities,
          deliverables: requiredDeliverables,
          taskSpec,
          phase: taskSpec.plan[0]?.phase || 'production',
          toolSchemas: FUNCTION_TOOLS,
          modelConfig: {
            actorSamplingProfile: config.actorSamplingProfile,
            adaptiveReasoningEnabled: config.adaptiveReasoningEnabled,
            stageMaxOutputTokens: config.stageMaxOutputTokens
          }
        });
        const frozenSkillIds = new Set(frozenRuntimeProfile.skills.map((skill) => skill.id));
        const expandedSkill = runtimeProfile.skills.find((skill) => !frozenSkillIds.has(skill.id));
        if (expandedSkill) {
          throw new ApiError(409, 'AGENT_RUNTIME_SKILL_NOT_FROZEN', {
            retryable: false,
            skillId: expandedSkill.id
          });
        }
        context.run.prompt_profile = frozenRuntimeProfile.promptProfile;
        context.run.prompt_hash = Buffer.from(frozenRuntimeProfile.promptHash, 'hex');
        context.run.skill_versions = Object.fromEntries(
          frozenRuntimeProfile.skills.map((skill) => [skill.id, skill.version])
        );
        const selectedSkills = (Array.isArray(taskSpec?.skillIds) ? taskSpec.skillIds : [])
          .filter((skillId) => Boolean(SKILLS[skillId]));
        if (selectedSkills.length) {
          const prepared = await sandbox.systemShell(
            sandboxName,
            'mkdir -p /tmp/artigen-workspace/.artigen/skills && chmod u+w /tmp/artigen-workspace/.artigen/skills',
            30
          );
          if (!prepared.success) {
            throw new ApiError(500, 'AGENT_SKILL_REFERENCE_PREPARE_FAILED');
          }
        }
        for (const skillId of selectedSkills) {
          const reference = Buffer.from(renderSkillReference(SKILLS[skillId]), 'utf8');
          await sandbox.writeFile(
            sandboxName,
            `/tmp/artigen-workspace/.artigen/skills/${skillId}@${SKILLS[skillId].version}.md`,
            reference
          );
        }
        if (selectedSkills.length) {
          const locked = await sandbox.systemShell(
            sandboxName,
            "chmod -R a-w /tmp/artigen-workspace/.artigen/skills",
            30
          );
          if (!locked.success) {
            throw new ApiError(500, 'AGENT_SKILL_REFERENCE_LOCK_FAILED');
          }
        }
      }
      await runService.appendStep({
        ...runLease,
        role: 'planner',
        status: 'succeeded',
        toolName: 'update_plan',
        summary: runtimeV2 ? '执行计划与输入边界已就绪' : '已准备输入文件与交付物验证要求，等待模型发布具体计划',
        sanitizedInput: {
          runtimeVersion: runtimeV2 ? 2 : 1,
          assetCount: Array.isArray(objectivePayload.assetIds) ? objectivePayload.assetIds.length : 0,
          capabilityCount: Object.values(context.run.capabilities || {}).filter(Boolean).length,
          inputAssetPaths
        }
      });

      const runDelegatedSubagent = async (entry) => {
        const subagentId = entry.subagentId;
        const workspacePath = `/tmp/artigen-workspace/subagents/${subagentId}`;
        costMeter.restoreModelForMinimum(subagentId, Number(entry.usage?.credits || 0));
        const started = await runService.startSubagent({ ...runLease, subagentId });
        if (['succeeded', 'failed', 'cancelled'].includes(started.status)) {
          return {
            subagentId,
            status: started.status,
            summary: started.summary,
            files: started.status === 'succeeded'
              ? await parentVerifiedSubagentFiles({
                  sandbox,
                  sandboxName,
                  outputFiles: started.outputFiles
                })
              : started.outputFiles || [],
            errorCode: started.error?.code || null
          };
        }
        const privateContext = await runService.loadSubagentContext({
          ...runLease,
          subagentId,
        });
        let subagentResumeState = privateContext.checkpoint;
        if (
          runtimeV2 &&
          modelCallService?.adoptLatestReceived &&
          typeof model.recoverReceivedModelCall === 'function'
        ) {
          const adopted = await modelCallService.adoptLatestReceived({
            ...runLease,
            subagentId
          });
          if (adopted) {
            subagentResumeState = {
              ...(subagentResumeState || {}),
              version: CHECKPOINT_VERSION,
              runtimeVersion: 2,
              pendingModelResponse: model.recoverReceivedModelCall(adopted)
            };
            await runService.saveSubagentModelCheckpoint({
              ...runLease,
              subagentId,
              value: subagentResumeState
            });
          }
        }
        costMeter.restoreModelForMinimum(
          subagentId,
          Math.max(
            Number(entry.usage?.credits || 0),
            Number(subagentResumeState?.totalCredits || 0)
          )
        );
        const deadlineAt = Date.now() + config.subagentTimeoutMinutes * 60_000;

        const checkSubagentControl = async () => {
          await pauseIfRequested();
          const control = await runService.getSubagentControlState({ runId, subagentId });
          if (
            control.status === 'cancelled' ||
            control.cancel_requested ||
            control.run_status === 'cancelled' ||
            control.run_cancel_requested
          ) {
            throw new ApiError(409, 'AGENT_SUBAGENT_CANCELLED', { retryable: false });
          }
          if (Date.now() >= deadlineAt) {
            throw new ApiError(408, 'AGENT_SUBAGENT_TIMEOUT', { retryable: false });
          }
          assertLoopBudget({
            stepCount: control.step_count,
            maxSteps: config.subagentMaxSteps,
            replanCount: 0,
            consecutiveFailures: control.consecutive_failures,
            unchangedScreenshots: 0
          });
          return control;
        };

        try {
          const execution = await model.execute({
            objective: buildSubagentObjective(privateContext.task),
            capabilities: { files: true, shell: true },
            toolProfile: 'subagent',
            resumeState: subagentResumeState,
            runtimeContext: runtimeV2 ? {
              runtimeVersion: 2,
              runId,
              workerId,
              leaseEpoch,
              subagentId,
              userId: context.run.user_id,
              taskSpec: {
                goal: privateContext.task.objective,
                complexity: 'medium',
                confidence: 1,
                constraints: ['Offline-only depth-1 child; parent owns final delivery.'],
                assumptions: [],
                deliverables: [],
                allowedOrigins: [],
                acceptanceCriteria: [privateContext.task.expectedOutput],
                skillIds: [],
                plan: [
                  { id: 'produce', label: '完成委派输出', phase: 'production' },
                  { id: 'verify', label: '离线验证输出文件', phase: 'verification' }
                ],
                budget: { maxCredits: Number(context.run.max_credits || 0) }
              },
              maxCredits: Number(context.run.max_credits || 0),
              initialModelCredits: Number(subagentResumeState?.totalCredits || 0)
            } : null,
            safetyIdentifier: crypto.createHash('sha256')
              .update(`artigen-subagent:${context.run.user_id}:${subagentId}`)
              .digest('hex'),
            maxSteps: config.subagentMaxSteps,
            deadlineAt,
            signal: modelAbortController.signal,
            callbacks: {
              checkControl: checkSubagentControl,
              updatePlan: async ({ explanation, steps }) => {
                await checkSubagentControl();
                const normalized = (Array.isArray(steps) ? steps : []).map((step) => ({
                  id: String(step?.id || '').trim().slice(0, 80),
                  label: String(step?.label || '').trim().slice(0, 160),
                  status: String(step?.status || '')
                })).filter((step) => (
                  step.id && step.label && ['pending', 'in_progress', 'completed'].includes(step.status)
                ));
                if (
                  normalized.length < 2 ||
                  normalized.length > 4 ||
                  normalized.filter((step) => step.status === 'in_progress').length > 1
                ) {
                  throw new ApiError(400, 'AGENT_PLAN_INVALID');
                }
                await runService.appendStep({
                  ...runLease,
                  subagentId,
                  role: 'planner',
                  status: 'succeeded',
                  toolName: 'update_plan',
                  summary: String(explanation || '子 Agent 已更新计划').trim().slice(0, 500),
                  sanitizedOutput: { plan: normalized }
                });
                return { accepted: true, steps: normalized };
              },
              checkpoint: async () => checkSubagentControl(),
              saveModelState: async (value) => {
                await checkSubagentControl();
                await persistCostCheckpoint();
                await runService.saveSubagentModelCheckpoint({
                  ...runLease,
                  subagentId,
                  value
                });
              },
              clearModelState: async () => runService.clearSubagentModelCheckpoint({
                ...runLease,
                subagentId,
              }),
              reserveBudget: reserveRuntimeBudget,
              consumeBudget: consumeRuntimeBudget,
              releaseBudget: releaseRuntimeBudget,
              recordUsage: async (credits, usage) => {
                await checkSubagentControl();
                costMeter.setModelFor(subagentId, credits);
                await runService.recordSubagentUsage({
                  ...runLease,
                  subagentId,
                  estimatedCredits: credits,
                  usage
                });
                await persistCostCheckpoint({
                  usageItems: { source: 'subagent_model', subagentId }
                });
              },
              recordStep: async (step) => {
                await checkSubagentControl();
                return runService.appendStep({ ...runLease, subagentId, ...step });
              },
              toolCall: async (call) => {
                testController?.trace?.toolCall({
                  ...call,
                  role: 'subagent',
                  subagentId
                });
              },
              toolObservation: async (observation) => {
                testController?.trace?.toolObservation({
                  ...observation,
                  role: 'subagent',
                  subagentId
                });
              },
              shell: async (script, purpose, toolMetadata = {}) => {
                await checkSubagentControl();
                const receiptIdentity = crypto.createHash('sha256')
                  .update(String(toolMetadata.callId || script))
                  .digest('hex')
                  .slice(0, 32);
                const currentReceiptKey = `subagent:${subagentId}:shell:${receiptIdentity}:attempt:${toolRetryEpoch}`;
                const legacyReceiptIdentity = String(toolMetadata.callId || crypto
                  .createHash('sha256').update(String(script)).digest('hex').slice(0, 24));
                const legacyReceiptKey = `subagent:${subagentId}:shell:${legacyReceiptIdentity}`;
                const receiptKey = toolRetryEpoch === 0 && durableToolReceipts.has(legacyReceiptKey)
                  ? legacyReceiptKey
                  : currentReceiptKey;
                const usingLegacyReceipt = receiptKey === legacyReceiptKey;
                const normalizedShell = normalizeSubagentShellScript(script, {
                  expectedOutput: privateContext.task.expectedOutput,
                  purpose
                });
                const reservationKey = `sandbox:${receiptKey}`;
                const computedRequestSha256 = crypto.createHash('sha256')
                  .update(JSON.stringify({
                    subagentId,
                    script: normalizedShell.script,
                    inputPaths: privateContext.task.inputPaths
                  }))
                  .digest('hex');
                const priorReceipt = durableToolReceipts.get(receiptKey);
                const requestSha256 = resolveToolReceiptRequestSha256({
                  priorReceipt,
                  computedRequestSha256,
                  legacyReceipt: usingLegacyReceipt
                });
                if (
                  priorReceipt?.kind === 'sandbox_shell' &&
                  (priorReceipt.state === 'consumed' || (!priorReceipt.state && priorReceipt.result))
                ) {
                  await consumeRuntimeBudget({
                    reservationKey: priorReceipt.reservationKey || reservationKey,
                    actualCredits: Number(priorReceipt.actualCredits || 0)
                  });
                  return priorReceipt.result;
                }
                if (
                  priorReceipt?.kind === 'sandbox_shell' &&
                  ['dispatched', 'ambiguous'].includes(priorReceipt.state)
                ) {
                  if (priorReceipt.state === 'dispatched') {
                    await persistToolReceipt(receiptKey, {
                      subagentId,
                      kind: 'sandbox_shell',
                      state: 'ambiguous',
                      reservationKey,
                      requestSha256
                    });
                  }
                  await releaseRuntimeBudget({
                    reservationKey: priorReceipt.reservationKey || reservationKey
                  });
                  throw new ApiError(409, 'AGENT_TOOL_CALL_AMBIGUOUS', {
                    retryable: false,
                    callId: String(toolMetadata.callId || '')
                  });
                }
                await reserveRuntimeBudget({
                  component: 'sandbox',
                  subagentId,
                  reservationKey,
                  maximumCredits: sandboxCreditsPerMinute * 2
                });
                await persistToolReceipt(receiptKey, {
                  subagentId,
                  kind: 'sandbox_shell',
                  state: 'dispatched',
                  reservationKey,
                  requestSha256
                });
                await testController?.hit('after_tool_dispatch', {
                  runId,
                  subagentId,
                  toolName: 'sandbox_shell'
                });
                await checkSubagentControl();
                await runService.assertWorkerLeaseActive(runLease);
                const shellStartedAt = Date.now();
                let actualCredits = 0;
                let result;
                let receiptConsumed = false;
                try {
                  result = await sandbox.subagentShell(sandboxName, normalizedShell.script, {
                    workspacePath,
                    inputPaths: privateContext.task.inputPaths,
                    timeoutSeconds: 120
                  });
                  actualCredits = Math.min(
                    sandboxCreditsPerMinute * 2,
                    Math.max(0, Date.now() - shellStartedAt) / 60_000 * sandboxCreditsPerMinute
                  );
                  await persistToolReceipt(receiptKey, {
                    subagentId,
                    kind: 'sandbox_shell',
                    state: 'consumed',
                    reservationKey,
                    requestSha256,
                    actualCredits,
                    result: {
                      success: result.success,
                      returnCode: result.returnCode,
                      stdout: String(result.stdout || '').slice(0, 12_000),
                      stderr: String(result.stderr || '').slice(0, 4_000)
                    }
                  });
                  receiptConsumed = true;
                  await testController?.hit('after_tool_receipt', {
                    runId,
                    subagentId,
                    toolName: 'sandbox_shell'
                  });
                  await consumeRuntimeBudget({
                    reservationKey,
                    actualCredits
                  });
                } catch (error) {
                  if (
                    receiptConsumed ||
                    error?.name === 'RuntimeHarnessCrash' ||
                    isLeaseLostError(error)
                  ) {
                    throw error;
                  }
                  await persistToolReceipt(receiptKey, {
                    subagentId,
                    kind: 'sandbox_shell',
                    state: 'ambiguous',
                    reservationKey,
                    requestSha256
                  });
                  await releaseRuntimeBudget({ reservationKey });
                  throw new ApiError(409, 'AGENT_TOOL_CALL_AMBIGUOUS', {
                    retryable: false,
                    callId: String(toolMetadata.callId || '')
                  });
                }
                await runService.appendStep({
                  ...runLease,
                  subagentId,
                  role: 'executor',
                  status: result.success ? 'succeeded' : 'failed',
                  toolName: 'sandbox_shell',
                  summary: String(purpose || '子 Agent 运行离线命令').slice(0, 500),
                  actionFingerprint: actionFingerprint({
                    type: 'subagent_shell',
                    subagentId,
                    script: normalizedShell.script
                  }),
                  sanitizedInput: {
                    purpose: String(purpose || '').slice(0, 300),
                    scriptSha256: crypto.createHash('sha256')
                      .update(String(script))
                      .digest('hex'),
                    executedScriptSha256: crypto.createHash('sha256')
                      .update(normalizedShell.script)
                      .digest('hex'),
                    normalized: normalizedShell.normalized,
                    normalizationKind: normalizedShell.kind
                  },
                  sanitizedOutput: {
                    success: result.success,
                    returnCode: result.returnCode
                  }
                });
                return result;
              }
            }
          });
          costMeter.setModelFor(subagentId, execution.credits);
          await persistCostCheckpoint({
            usageItems: { source: 'subagent_complete', subagentId }
          });
          const outputFiles = assertExpectedSubagentOutputFiles({
            expectedOutput: privateContext.task.expectedOutput,
            outputFiles: await inspectSubagentOutputFiles({
              sandbox,
              sandboxName,
              workspacePath
            })
          });
          const finished = await runService.finishSubagent({
            ...runLease,
            subagentId,
            status: 'succeeded',
            summary: String(execution.text || '子 Agent 已完成').slice(0, 4000),
            outputFiles
          });
          await runService.clearSubagentModelCheckpoint({ ...runLease, subagentId });
          return {
            subagentId,
            status: finished.status,
            summary: finished.summary,
            files: await parentVerifiedSubagentFiles({
              sandbox,
              sandboxName,
              outputFiles: finished.outputFiles
            })
          };
        } catch (error) {
          if (
            error instanceof AgentPaused ||
            error instanceof AgentCancelled ||
            ['AGENT_PAUSED', 'AGENT_CANCELLED'].includes(error?.code)
          ) {
            throw error;
          }
          if (error?.code === 'AGENT_SUBAGENT_CANCELLED') {
            return {
              subagentId,
              status: 'cancelled',
              summary: '子 Agent 已取消',
              files: []
            };
          }
          const failed = await runService.finishSubagent({
            ...runLease,
            subagentId,
            status: error?.code === 'AGENT_SUBAGENT_CANCELLED' ? 'cancelled' : 'failed',
            summary: '子 Agent 未完成；父 Agent 可使用其余结果继续。',
            errorCode: String(error?.code || 'AGENT_SUBAGENT_FAILED').slice(0, 100)
          });
          await runService.clearSubagentModelCheckpoint({ ...runLease, subagentId });
          return {
            subagentId,
            status: failed.status,
            summary: failed.summary,
            files: failed.outputFiles,
            errorCode: failed.error?.code || null
          };
        }
      };

      const modelAbortController = new AbortController();
      const modelExecution = await runWithLeaseHeartbeat({
        intervalMs: Math.max(
          5_000,
          Math.min(30_000, Math.floor(config.leaseSeconds * 1_000 / 3))
        ),
        abortController: modelAbortController,
        refresh: async () => {
          const control = await runService.getControlState({ runId });
          if (control.status === 'cancelled' || control.cancel_requested) {
            modelAbortController.abort();
            throw new AgentCancelled();
          }
          return runService.saveCheckpoint({
            ...runLease,
            checkpoint: { phase: 'running', sandboxReady: true }
          });
        },
        work: () => model.execute({
        objective: runtimeObjective,
        capabilities: context.run.capabilities,
        deliverables: requiredDeliverables,
        resumeState: modelResumeState,
        runtimeContext: runtimeV2 ? {
          runtimeVersion: 2,
          runId,
          workerId,
          leaseEpoch,
          userId: context.run.user_id,
          taskSpec,
          workingState: modelResumeState?.workingState || null,
          projectMemory,
          allowedOrigins: context.run.browser_config?.allowedOrigins || [],
          maxCredits: Number(context.run.max_credits || 0),
          initialModelCredits: Number(modelResumeState?.totalCredits || 0),
          budgetRatio: costMeter.total() / Math.max(1, Number(context.run.max_credits || 0))
        } : null,
        safetyIdentifier: crypto.createHash('sha256')
          .update(`artigen-agent:${context.run.user_id}`)
          .digest('hex'),
        maxSteps: config.maxSteps,
        signal: modelAbortController.signal,
        callbacks: {
          updatePlan: async ({ explanation, steps }) => {
            await pauseIfRequested();
            const normalized = (Array.isArray(steps) ? steps : []).map((step) => ({
              id: String(step?.id || '').trim().slice(0, 80),
              label: String(step?.label || '').trim().slice(0, 160),
              status: String(step?.status || '')
            })).filter((step) => (
              step.id && step.label &&
              ['pending', 'in_progress', 'completed'].includes(step.status)
            ));
            if (
              normalized.length < 2 ||
              normalized.length > 12 ||
              normalized.filter((step) => step.status === 'in_progress').length > 1
            ) {
              throw new ApiError(400, 'AGENT_PLAN_INVALID');
            }
            const savedPlan = await runService.savePlan({
              ...runLease,
              plan: normalized,
              explanation: String(explanation || '').trim().slice(0, 500)
            });
            await runService.appendStep({
              ...runLease,
              role: 'planner',
              status: 'succeeded',
              toolName: 'update_plan',
              summary: String(explanation || '已更新执行计划').trim().slice(0, 500),
              sanitizedOutput: { plan: normalized }
            });
            return { accepted: true, steps: savedPlan.steps };
          },
          delegateTasks: async (tasks) => {
            await pauseIfRequested();
            if (context.run.capabilities?.subagents !== true) {
              throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
                capability: 'subagents'
              });
            }
            const created = await runService.createSubagents({
              ...runLease,
              tasks: restrictDelegatedTaskInputs(tasks, inputAssetPaths),
              allowedInputPaths: inputAssetPaths
            });
            const settled = await Promise.allSettled(created.map(runDelegatedSubagent));
            const parentControlError = settled.find((item) => (
              item.status === 'rejected' &&
              ['AGENT_PAUSED', 'AGENT_CANCELLED'].includes(item.reason?.code)
            ));
            if (parentControlError) throw parentControlError.reason;
            const subagents = settled.map((item, index) => item.status === 'fulfilled'
                ? item.value
                : {
                    subagentId: created[index].subagentId,
                    status: 'failed',
                    summary: '子 Agent 运行时失败；父 Agent 可继续。',
                    files: [],
                    errorCode: String(item.reason?.code || 'AGENT_SUBAGENT_FAILED')
                  });
            return {
              subagents,
              outputVerification: {
                allSucceededFilesPassed: subagents.every((subagent) => (
                  subagent.status !== 'succeeded' ||
                  (
                    subagent.files.length > 0 &&
                    subagent.files.every((file) => file.verificationStatus === 'passed')
                  )
                )),
                note: [
                  'Every returned file with verificationStatus=passed was independently scanned,',
                  'confirmed non-empty, and SHA-256 verified by the Worker.',
                  'Use textExcerpt or read the exact path to merge actual content;',
                  'do not require a guessed heading or phrase as proof that the file exists.'
                ].join(' ')
              }
            };
          },
          checkpoint: async (modelResponseId) => {
            await runService.saveCheckpoint({
              ...runLease,
              checkpoint: {
                phase: 'running',
                sandboxReady: true,
                modelResponseId
              }
            });
          },
          saveModelState: async (value) => {
            modelResumeState = value;
            if (value?.semanticVerificationResult) {
              latestSemanticVerification = value.semanticVerificationResult;
            }
            await runService.saveModelCheckpoint({
              ...runLease,
              value
            });
            await persistCostCheckpoint();
          },
          clearModelState: async () => {
            await runService.clearModelCheckpoint(runLease);
          },
          contextCompacted: async (metrics) => {
            await runService.appendRuntimeEvent({
              ...runLease,
              type: 'context.compacted',
              phase: 'running',
              summary: '已压缩旧工具观察，保留目标、证据与当前失败',
              data: metrics
            });
          },
          budgetThreshold: async ({ threshold, budgetRatio }) => {
            const lockdown = Number(threshold) >= 0.9;
            await runService.appendRuntimeEvent({
              ...runLease,
              type: lockdown ? 'budget.lockdown' : 'budget.warning',
              phase: lockdown ? 'verifying' : 'running',
              summary: lockdown
                ? '预算已进入验证与安全交付阶段'
                : '预算已收紧，停止可选探索并压缩计划',
              data: {
                threshold: Number(threshold),
                budgetRatio: Math.max(0, Math.min(1, Number(budgetRatio || 0)))
              }
            });
          },
          currentBudgetRatio: async () => (
            costMeter.total() / Math.max(1, Number(context.run.max_credits || 0))
          ),
          reserveBudget: reserveRuntimeBudget,
          consumeBudget: consumeRuntimeBudget,
          releaseBudget: releaseRuntimeBudget,
          recordUsage: async (credits, items) => {
            costMeter.setModel(credits);
            await persistCostCheckpoint({ usageItems: items });
          },
          recordStep: async (step) => {
            await pauseIfRequested();
            return runService.appendStep({ ...runLease, ...step });
          },
          toolCall: async (call) => {
            testController?.trace?.toolCall({
              ...call,
              role: 'parent'
            });
          },
          toolObservation: async (observation) => {
            testController?.trace?.toolObservation({
              ...observation,
              role: 'parent'
            });
          },
          verifyDraft: async ({ taskSpec: currentTaskSpec, artifacts, text }) => {
            await pauseIfRequested();
            semanticVerifierAttempts += 1;
            await runService.appendRuntimeEvent({
              ...runLease,
              type: 'verification.started',
              phase: 'verifying',
              summary: '正在核对目标、约束、来源和交付完整性',
              data: { attempt: semanticVerifierAttempts }
            });
            const registered = await runService.listArtifacts({
              userId: context.run.user_id,
              runId
            });
            const registeredByName = new Map(registered.map((artifact) => [artifact.filename, artifact]));
            const evidenceArtifacts = [];
            for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
              const workspacePath = String(artifact?.path || '');
              const mimeType = String(artifact?.mime_type || '');
              if (!workspacePath.startsWith('/tmp/artigen-workspace/')) continue;
              const target = quoteShell(workspacePath);
              let kind = 'other';
              let evidence = {};
              if (mimeType === 'text/markdown' || mimeType === 'text/plain') {
                kind = 'text';
                const file = await sandbox.readFile(sandboxName, workspacePath);
                evidence = {
                  text: Buffer.from(file.base64 || '', 'base64').toString('utf8').slice(0, 30_000)
                };
              } else if (mimeType === 'application/pdf') {
                kind = 'pdf';
                const inspected = await sandbox.systemShell(
                  sandboxName,
                  `set -eu\npdfinfo ${target} | head -c 8000\nprintf '\\n---TEXT---\\n'\npdftotext ${target} - | head -c 30000`,
                  60
                );
                evidence = { inspection: String(inspected.stdout || '').slice(0, 38_000) };
              } else if (mimeType.includes('spreadsheetml')) {
                kind = 'xlsx';
                const inspected = await sandbox.systemShell(
                  sandboxName,
                  `set -eu\nunzip -Z1 ${target} | grep -E '^xl/(workbook|worksheets/|charts/|sharedStrings)' | head -c 12000\nprintf '\\n---CONTENT---\\n'\nunzip -p ${target} 'xl/sharedStrings.xml' 'xl/worksheets/*.xml' 2>/dev/null | head -c 30000`,
                  60
                );
                evidence = {
                  inspection: String(inspected.stdout || '').slice(0, 42_000),
                  formulaAndErrorScanPassed: registeredByName.get(artifact.filename)?.verification?.formulasAndCharts === true
                };
              } else if (mimeType.includes('presentationml')) {
                kind = 'pptx';
                const inspected = await sandbox.systemShell(
                  sandboxName,
                  `set -eu\nunzip -Z1 ${target} | grep -E '^ppt/(slides|notesSlides)/' | head -c 12000\nprintf '\\n---CONTENT---\\n'\nunzip -p ${target} 'ppt/slides/*.xml' 'ppt/notesSlides/*.xml' 2>/dev/null | head -c 30000`,
                  60
                );
                evidence = {
                  inspection: String(inspected.stdout || '').slice(0, 42_000),
                  rendered: registeredByName.get(artifact.filename)?.verification?.rendered === true
                };
              } else if (mimeType === 'application/zip') {
                kind = artifact.role === 'website' ? 'website' : 'zip';
                const inspected = await sandbox.systemShell(
                  sandboxName,
                  `set -eu\nunzip -Z1 ${target} | head -c 16000\nprintf '\\n---HTML---\\n'\nunzip -p ${target} '*index.html' 2>/dev/null | head -c 30000`,
                  60
                );
                evidence = {
                  inspection: String(inspected.stdout || '').slice(0, 46_000),
                  desktopAndMobilePreview: registeredByName.get(artifact.filename)?.verification?.desktopAndMobilePreview === true
                };
              } else if (mimeType.startsWith('image/')) {
                kind = 'image';
                const inspected = await sandbox.systemShell(
                  sandboxName,
                  `identify -format '%m %w %h %[colorspace]' ${target}`,
                  30
                );
                evidence = {
                  technicalInspection: String(inspected.stdout || '').slice(0, 1000),
                  aestheticAssessment: 'not_assessable',
                  model: 'Kwai-Kolors/Kolors',
                  referenceLineage: registeredByName.get(artifact.filename)?.verification?.referenceLineage || []
                };
              }
              const stored = registeredByName.get(artifact.filename) || {};
              evidenceArtifacts.push({
                artifactId: stored.artifactId || artifact.artifact_id || null,
                filename: artifact.filename,
                kind,
                mimeType,
                sha256: stored.sha256 || null,
                verificationStatus: stored.verificationStatus || artifact.verification_status,
                evidence,
                sources: (Array.isArray(artifact.sources) ? artifact.sources : []).map((source) => source?.url).filter(Boolean)
              });
            }
            const sources = [...new Map(
              (Array.isArray(artifacts) ? artifacts : [])
                .flatMap((artifact) => Array.isArray(artifact?.sources) ? artifact.sources : [])
                .filter((source) => source?.url)
                .map((source) => [source.url, source])
            ).values()];
            const evidenceManifest = normalizeArtifactEvidenceManifest({
              artifacts: evidenceArtifacts,
              sourceRefs: sources.map((source) => source.url),
              deterministicPassed: evidenceArtifacts.every((artifact) => artifact.verificationStatus === 'passed')
            });
            const verification = await model.verifyTask({
              taskSpec: currentTaskSpec,
              evidenceManifest,
              finalText: String(text || '').slice(0, 20_000),
              metadata: {
                ...runLease,
                userId: context.run.user_id,
                priority: 'verifier',
                promptProfile: context.run.prompt_profile,
                promptHash: Buffer.isBuffer(context.run.prompt_hash)
                  ? context.run.prompt_hash.toString('hex')
                  : null,
                skillIds: Object.keys(context.run.skill_versions || {}),
                signal: modelAbortController.signal,
                reserveBudget: reserveRuntimeBudget,
                consumeBudget: consumeRuntimeBudget,
                releaseBudget: releaseRuntimeBudget
              }
            });
            const verifierModelCredits = Math.max(
              0,
              Number(modelResumeState?.totalCredits || 0) + Number(verification.credits || 0)
            );
            costMeter.setModel(verifierModelCredits);
            modelResumeState = {
              ...modelResumeState,
              totalCredits: verifierModelCredits,
              semanticVerificationAttempts: semanticVerifierAttempts,
              pendingVerifierResult: verification
            };
            await runService.saveModelCheckpoint({
              ...runLease,
              value: modelResumeState
            });
            await persistCostCheckpoint({
              usageItems: { source: 'runtime_v2_verifier_checkpoint', ...(verification.usage || {}) }
            });
            await consumeRuntimeBudget({
              reservationKey: verification.reservationKey,
              actualCredits: verification.reservationActualCredits
            });
            if (verification.modelCallReceipt && modelCallService) {
              await modelCallService.consume(verification.modelCallReceipt);
              delete verification.modelCallReceipt;
              modelResumeState = {
                ...modelResumeState,
                pendingVerifierResult: verification
              };
              await runService.saveModelCheckpoint({ ...runLease, value: modelResumeState });
            }
            latestSemanticVerification = verification.result;
            if (modelCallService) {
              await modelCallService.recordQualityCheck({
                runId,
                checkKind: 'semantic-verifier-v1',
                status: verification.result.passed ? 'passed' : 'failed',
                score: verification.result.score,
                codes: verification.result.issues.map((_, index) => `issue-${index + 1}`),
                metrics: {
                  attempt: semanticVerifierAttempts,
                  unsupportedVisualJudgment: verification.result.unsupportedVisualJudgment
                }
              }).catch(() => {});
            }
            await runService.appendRuntimeEvent({
              ...runLease,
              type: verification.result.passed
                ? 'verification.passed'
                : semanticVerifierAttempts >= 2
                  ? 'verification.failed'
                  : 'verification.repair_requested',
              phase: 'verifying',
              summary: verification.result.passed
                ? '目标与交付物语义核对通过'
                : semanticVerifierAttempts >= 2
                  ? '定向返修后仍未通过语义核对'
                  : '已请求一次定向返修',
              data: {
                attempt: semanticVerifierAttempts,
                score: verification.result.score,
                issueCount: verification.result.issues.length,
                unsupportedVisualJudgment: verification.result.unsupportedVisualJudgment
              }
            });
            await testController?.hit('after_verifier', {
              runId,
              status: verification.result.passed ? 'passed' : 'failed'
            });
            return verification;
          },
          computerActions: async (actions) => {
            await pauseIfRequested();
            assertComputerOrigins(
              actions,
              context.run.browser_config?.allowedOrigins || []
            );
            return sandbox.actions(sandboxName, actions);
          },
          screenshot: async () => {
            await pauseIfRequested();
            const result = await sandbox.screenshot(sandboxName);
            const unchanged = await runService.recordScreenshot({
              ...runLease,
              sha256: crypto.createHash('sha256').update(String(result.base64 || '')).digest('hex')
            });
            if (unchanged >= 3) throw new ApiError(409, 'AGENT_SCREEN_STALLED');
            return result.base64;
          },
          browserDom: async (request) => {
            await pauseIfRequested();
            if (context.run.capabilities?.browser !== true) {
              throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
                capability: 'browser'
              });
            }
            const description = ['click', 'fill'].includes(request.action)
              ? await browserService.describe({
                  sandboxName,
                  selector: request.selector,
                  allowedOrigins: context.run.browser_config?.allowedOrigins || []
                })
              : null;
            const actionType = browserActionType({
              ...request,
              tagName: description?.tagName,
              inputType: description?.inputType,
              autocomplete: description?.autocomplete,
              isSubmit: description?.isSubmit,
              sensitive: description?.sensitive,
              injectionSuspected: description?.injectionSuspected,
              href: description?.href,
              selector: [
                request.selector,
                description?.elementText,
                description?.href
              ].filter(Boolean).join(' ')
            });
            const classification = classifyAction({ type: actionType });
            if (classification.decision === 'blocked') {
              throw new ApiError(403, 'AGENT_ACTION_FORBIDDEN', { actionType });
            }
            if (classification.decision === 'approval' ||
                classification.decision === 'takeover') {
              const fingerprint = actionFingerprint({
                type: actionType,
                selector: request.selector,
                url: request.url,
                textHash: request.text
                  ? crypto.createHash('sha256').update(request.text).digest('hex')
                  : null
              });
              let decision = await runService.consumeApproval({ ...runLease, fingerprint });
              if (
                !decision &&
                classification.decision === 'approval' &&
                typeof runService.consumeSessionAuthorization === 'function'
              ) {
                decision = await runService.consumeSessionAuthorization({
                  ...runLease,
                  actionType,
                  recipient: description?.url || request.url || ''
                });
              }
              if (decision?.status === 'denied') {
                await runService.appendStep({
                  ...runLease,
                  role: 'executor',
                  status: 'skipped',
                  toolName: 'browser_dom',
                  riskLevel: 'high',
                  summary: `用户拒绝了 ${actionType}`,
                  actionFingerprint: fingerprint
                });
                return { ok: false, denied: true, actionType };
              }
              if (decision?.status === 'approved' && classification.decision === 'takeover') {
                const current = await browserService.execute({
                  sandboxName,
                  request: {
                    action: 'snapshot',
                    selector: '',
                    url: '',
                    text: ''
                  },
                  allowedOrigins: context.run.browser_config?.allowedOrigins || []
                });
                await runService.appendStep({
                  ...runLease,
                  role: 'executor',
                  status: 'succeeded',
                  toolName: 'browser_dom',
                  riskLevel: 'high',
                  summary: `用户接管并完成了 ${actionType}`,
                  actionFingerprint: fingerprint
                });
                return { ...current, takeoverCompleted: true };
              }
              if (!decision) {
                await persistCostCheckpoint();
                const approval = await runService.requestApproval({
                  ...runLease,
                  actionType,
                  recipient: description?.url ||
                    request.url ||
                    context.run.browser_config?.allowedOrigins?.[0] ||
                    '',
                  riskLevel: classification.decision === 'takeover' ? 'blocked' : 'high',
                  changeSummary: request.purpose,
                  evidenceSummary: [
                    description?.elementText,
                    description?.href
                  ].filter(Boolean).join(' · ') || `DOM 目标：${request.selector}`,
                  impactSummary: `将在网页中执行 ${actionType}；目标站点为 ${
                    request.url || context.run.browser_config?.allowedOrigins?.[0] || '当前页面'
                  }。`,
                  rollbackSummary: actionType === 'delete'
                    ? '删除可能不可恢复；拒绝后不会执行。'
                    : '如需撤销，必须通过一次新的、单独审批的反向操作完成。',
                  fingerprint
                });
                throw new AgentWaitingForUser(approval);
              }
            }
            const result = await browserService.execute({
              sandboxName,
              request,
              allowedOrigins: context.run.browser_config?.allowedOrigins || []
            });
            await runService.appendStep({
              ...runLease,
              role: 'executor',
              status: 'succeeded',
              toolName: 'browser_dom',
              riskLevel: classification.riskLevel,
              summary: String(request.purpose || '浏览网页').slice(0, 500),
              actionFingerprint: classification.riskLevel === 'high'
                ? actionFingerprint({
                    type: actionType,
                    selector: request.selector,
                    url: request.url,
                    textHash: request.text
                      ? crypto.createHash('sha256').update(request.text).digest('hex')
                      : null
                  })
                : null,
              sanitizedInput: {
                action: request.action,
                urlOrigin: request.url ? new URL(request.url).origin : undefined,
                selectorHash: request.selector
                  ? crypto.createHash('sha256').update(request.selector).digest('hex')
                  : undefined
              },
              sanitizedOutput: {
                url: result.url,
                untrusted: true,
                injectionSuspected: result.injectionSuspected,
                injectionSignals: result.injectionSignals,
                contentHash: result.contentHash
              }
            });
            return result;
          },
          shell: async (script, purpose, toolMetadata = {}) => {
            await pauseIfRequested();
            assertAllowedOrigins(
              script,
              context.run.browser_config?.allowedOrigins || []
            );
            const receiptIdentity = crypto.createHash('sha256')
              .update(String(toolMetadata.callId || script))
              .digest('hex')
              .slice(0, 32);
            const currentReceiptKey = `parent:shell:${receiptIdentity}:attempt:${toolRetryEpoch}`;
            const legacyReceiptIdentity = String(toolMetadata.callId || crypto
              .createHash('sha256').update(String(script)).digest('hex').slice(0, 24));
            const legacyReceiptKey = `parent:shell:${legacyReceiptIdentity}`;
            const receiptKey = toolRetryEpoch === 0 && durableToolReceipts.has(legacyReceiptKey)
              ? legacyReceiptKey
              : currentReceiptKey;
            const usingLegacyReceipt = receiptKey === legacyReceiptKey;
            const priorReceipt = durableToolReceipts.get(receiptKey);
            const reservationKey = `sandbox:${receiptKey}`;
            const computedRequestSha256 = crypto.createHash('sha256')
              .update(JSON.stringify({ script: String(script) }))
              .digest('hex');
            const requestSha256 = resolveToolReceiptRequestSha256({
              priorReceipt,
              computedRequestSha256,
              legacyReceipt: usingLegacyReceipt
            });
            if (
              priorReceipt?.kind === 'sandbox_shell' &&
              (priorReceipt.state === 'consumed' || (!priorReceipt.state && priorReceipt.result))
            ) {
              await consumeRuntimeBudget({
                reservationKey: priorReceipt.reservationKey || reservationKey,
                actualCredits: Number(priorReceipt.actualCredits || 0)
              });
              return priorReceipt.result;
            }
            if (
              priorReceipt?.kind === 'sandbox_shell' &&
              ['dispatched', 'ambiguous'].includes(priorReceipt.state)
            ) {
              if (priorReceipt.state === 'dispatched') {
                await persistToolReceipt(receiptKey, {
                  kind: 'sandbox_shell',
                  state: 'ambiguous',
                  reservationKey,
                  requestSha256
                });
              }
              await releaseRuntimeBudget({
                reservationKey: priorReceipt.reservationKey || reservationKey
              });
              throw new ApiError(409, 'AGENT_TOOL_CALL_AMBIGUOUS', {
                retryable: false,
                callId: String(toolMetadata.callId || '')
              });
            }
            await reserveRuntimeBudget({
              component: 'sandbox',
              reservationKey,
              maximumCredits: sandboxCreditsPerMinute * 2
            });
            await persistToolReceipt(receiptKey, {
              kind: 'sandbox_shell',
              state: 'dispatched',
              reservationKey,
              requestSha256
            });
            await testController?.hit('after_tool_dispatch', {
              runId,
              toolName: 'sandbox_shell'
            });
            await runService.assertWorkerLeaseActive(runLease);
            const shellStartedAt = Date.now();
            let actualCredits = 0;
            let result;
            let receiptConsumed = false;
            try {
              result = await sandbox.shell(sandboxName, script, 120);
              actualCredits = Math.min(
                sandboxCreditsPerMinute * 2,
                Math.max(0, Date.now() - shellStartedAt) / 60_000 * sandboxCreditsPerMinute
              );
              await persistToolReceipt(receiptKey, {
                kind: 'sandbox_shell',
                state: 'consumed',
                reservationKey,
                requestSha256,
                actualCredits,
                result: {
                  success: result.success,
                  returnCode: result.returnCode,
                  stdout: String(result.stdout || '').slice(0, 12_000),
                  stderr: String(result.stderr || '').slice(0, 4_000)
                }
              });
              receiptConsumed = true;
              await testController?.hit('after_tool_receipt', {
                runId,
                toolName: 'sandbox_shell'
              });
              await consumeRuntimeBudget({
                reservationKey,
                actualCredits
              });
            } catch (error) {
              if (
                receiptConsumed ||
                error?.name === 'RuntimeHarnessCrash' ||
                isLeaseLostError(error)
              ) {
                throw error;
              }
              await persistToolReceipt(receiptKey, {
                kind: 'sandbox_shell',
                state: 'ambiguous',
                reservationKey,
                requestSha256
              });
              await releaseRuntimeBudget({ reservationKey });
              throw new ApiError(409, 'AGENT_TOOL_CALL_AMBIGUOUS', {
                retryable: false,
                callId: String(toolMetadata.callId || '')
              });
            }
            await runService.appendStep({
              ...runLease,
              role: 'executor',
              status: result.success ? 'succeeded' : 'failed',
              toolName: 'sandbox_shell',
              summary: String(purpose || '运行沙箱命令').slice(0, 500),
              actionFingerprint: actionFingerprint({ type: 'shell', script }),
              sanitizedInput: {
                purpose: String(purpose || '').slice(0, 300),
                scriptSha256: crypto.createHash('sha256').update(String(script)).digest('hex')
              },
              sanitizedOutput: {
                success: result.success,
                returnCode: result.returnCode
              }
            });
            return result;
          },
          generateImage: async (request, toolMetadata = {}) => {
            await pauseIfRequested();
            if (context.run.capabilities?.generate_images !== true) {
              throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
                capability: 'generate_images'
              });
            }
            const references = resolveStagedImageReferences(request?.references, stagedAssetsByPath);
            const nextImageCredits = references.length
              ? configuredImageCredits(env.AGENT_IMAGE_REFERENCE_CREDITS, 12)
              : configuredImageCredits(env.AGENT_IMAGE_CREDITS, 8);
            const receiptIdentity = crypto.createHash('sha256')
              .update(String(toolMetadata.callId || JSON.stringify({ request, references })))
              .digest('hex')
              .slice(0, 32);
            const currentReceiptKey = `parent:kolors:${receiptIdentity}:attempt:${toolRetryEpoch}`;
            const legacyReceiptIdentity = String(toolMetadata.callId || crypto
              .createHash('sha256')
              .update(JSON.stringify({ request, references }))
              .digest('hex')
              .slice(0, 24));
            const legacyReceiptKey = `parent:kolors:${legacyReceiptIdentity}:attempt:${toolRetryEpoch}`;
            const receiptKey = durableToolReceipts.has(legacyReceiptKey)
              ? legacyReceiptKey
              : currentReceiptKey;
            const usingLegacyReceipt = receiptKey === legacyReceiptKey;
            const priorReceipt = durableToolReceipts.get(receiptKey);
            const reservationKey = `kolors:${receiptKey}`;
            const computedRequestSha256 = crypto.createHash('sha256')
              .update(JSON.stringify({
                prompt: String(request.prompt || ''),
                aspectRatio: request.aspectRatio,
                filename: request.filename,
                references: references.map((reference) => ({
                  path: reference.path,
                  role: reference.role
                }))
              }))
              .digest('hex');
            const requestSha256 = resolveToolReceiptRequestSha256({
              priorReceipt,
              computedRequestSha256,
              legacyReceipt: usingLegacyReceipt
            });
            if (priorReceipt?.kind === 'kolors' && priorReceipt.state === 'consumed') {
              const durableResult = priorReceipt.result;
              if (durableResult?.assetId) {
                const opened = await (assetStorage?.openAsset || assets.openAsset)({
                  assetId: durableResult.assetId,
                  ownerUserId: context.run.user_id,
                  pool
                });
                const buffer = await readOpenedAsset(opened, 100 * 1024 * 1024);
                const digest = crypto.createHash('sha256').update(buffer).digest('hex');
                if (
                  digest !== durableResult.sha256 ||
                  buffer.length !== Number(durableResult.byteSize || 0) ||
                  String(opened.record?.mime_type || '') !== durableResult.mimeType ||
                  !/^\/tmp\/artigen-workspace\/[A-Za-z0-9._@+ -]{1,200}$/.test(
                    String(durableResult.path || '')
                  )
                ) {
                  throw new ApiError(500, 'AGENT_IMAGE_DURABLE_RESULT_INVALID', {
                    retryable: false
                  });
                }
                await sandbox.writeFile(sandboxName, durableResult.path, buffer);
              }
              await consumeRuntimeBudget({
                reservationKey: priorReceipt.reservationKey || reservationKey,
                actualCredits: Number(priorReceipt.actualCredits || durableResult?.costCredits || 0)
              });
              return durableResult;
            }
            if (
              priorReceipt?.kind === 'kolors' &&
              ['dispatched', 'ambiguous'].includes(priorReceipt.state)
            ) {
              if (priorReceipt.state === 'dispatched') {
                await persistToolReceipt(receiptKey, {
                  kind: 'kolors',
                  state: 'ambiguous',
                  reservationKey,
                  requestSha256
                });
              }
              await releaseRuntimeBudget({
                reservationKey: priorReceipt.reservationKey || reservationKey
              });
              throw new ApiError(409, 'AGENT_IMAGE_CALL_AMBIGUOUS', {
                retryable: false,
                callId: String(toolMetadata.callId || '')
              });
            }
            await reserveRuntimeBudget({
              component: 'kolors',
              reservationKey,
              maximumCredits: nextImageCredits
            });
            await persistToolReceipt(receiptKey, {
              kind: 'kolors',
              state: 'dispatched',
              reservationKey,
              requestSha256
            });
            await testController?.hit('after_tool_dispatch', {
              runId,
              toolName: 'generate_image'
            });
            await runService.assertWorkerLeaseActive(runLease);
            let generated;
            let providerReturned = false;
            let receiptConsumed = false;
            try {
              generated = await imageService.generate({
                ...request,
                references,
                signal: modelAbortController.signal,
                runId
              });
              providerReturned = true;
              const outputPath = `/tmp/artigen-workspace/${generated.filename}`;
              await runService.assertWorkerLeaseActive(runLease);
              const sha256 = crypto.createHash('sha256').update(generated.buffer).digest('hex');
              const stored = await (assetStorage?.storeAsset || assets.storeAsset)({
                pool,
                ownerUserId: context.run.user_id,
                buffer: generated.buffer,
                declaredMime: generated.mimeType,
                allowedMimeTypes: [generated.mimeType],
                maxBytes: 100 * 1024 * 1024,
                maxPixels: 64 * 1000 * 1000,
                retentionClass: 'generated-output',
                expiresAt: context.run.expires_at,
                metadata: {
                  source: 'agent-kolors-receipt',
                  runId
                }
              });
              const durableResult = {
                path: outputPath,
                mimeType: generated.mimeType,
                model: generated.model,
                costCredits: generated.costCredits,
                assetId: stored.assetId,
                byteSize: generated.buffer.length,
                sha256
              };
              await persistToolReceipt(receiptKey, {
                kind: 'kolors',
                state: 'consumed',
                reservationKey,
                requestSha256,
                actualCredits: generated.costCredits,
                result: durableResult
              });
              receiptConsumed = true;
              await testController?.hit('after_image_provider_response', {
                runId,
                toolName: 'generate_image',
                assetId: stored.assetId
              });
              await testController?.hit('after_tool_receipt', {
                runId,
                toolName: 'generate_image'
              });
              await consumeRuntimeBudget({
                reservationKey,
                actualCredits: generated.costCredits
              });
              await sandbox.writeFile(sandboxName, outputPath, generated.buffer);
              costMeter.addGeneration(generated.costCredits);
              await runService.appendStep({
                ...runLease,
                role: 'executor',
                status: 'succeeded',
                toolName: 'artigen_image_generation',
                summary: `生成图片 ${generated.filename}`,
                sanitizedInput: {
                  promptSha256: crypto.createHash('sha256')
                    .update(String(request.prompt || ''))
                    .digest('hex'),
                  aspectRatio: request.aspectRatio,
                  referenceCount: references.length,
                  referenceRoles: references.map((reference) => reference.role),
                  referencePathSha256: references.map((reference) => crypto
                    .createHash('sha256')
                    .update(reference.path)
                    .digest('hex'))
                },
                sanitizedOutput: {
                  path: outputPath,
                  mimeType: generated.mimeType,
                  byteSize: generated.buffer.length,
                  model: generated.model,
                  costCredits: generated.costCredits
                }
              });
              await persistCostCheckpoint({ usageItems: { source: 'image_generation' } });
              return durableResult;
            } catch (error) {
              if (
                receiptConsumed ||
                error?.name === 'RuntimeHarnessCrash' ||
                isLeaseLostError(error)
              ) {
                throw error;
              }
              if (providerReturned) {
                await persistToolReceipt(receiptKey, {
                  kind: 'kolors',
                  state: 'ambiguous',
                  reservationKey,
                  requestSha256
                });
                await releaseRuntimeBudget({ reservationKey });
                throw new ApiError(409, 'AGENT_IMAGE_CALL_AMBIGUOUS', {
                  retryable: false,
                  callId: String(toolMetadata.callId || '')
                });
              }
              const providerStatus = Number(error?.status);
              const knownRejectedRequest = (
                Number.isInteger(providerStatus) &&
                providerStatus >= 400 &&
                providerStatus < 500 &&
                ![408, 409, 425, 429].includes(providerStatus)
              );
              if (knownRejectedRequest) {
                await removeToolReceipt(receiptKey, requestSha256);
                await releaseRuntimeBudget({ reservationKey });
                throw error;
              }
              await persistToolReceipt(receiptKey, {
                kind: 'kolors',
                state: 'ambiguous',
                reservationKey,
                requestSha256
              });
              await releaseRuntimeBudget({ reservationKey });
              throw new ApiError(409, 'AGENT_IMAGE_CALL_AMBIGUOUS', {
                retryable: false,
                callId: String(toolMetadata.callId || '')
              });
            }
          },
          connectorRequest: async (request) => {
            await pauseIfRequested();
            if (context.run.capabilities?.[request.provider] !== true) {
              throw new ApiError(403, 'AGENT_CAPABILITY_NOT_GRANTED', {
                capability: request.provider
              });
            }
            const connectorAction = connectorActionType(request);
            const fingerprint = actionFingerprint({
              type: 'connector_request',
              provider: request.provider,
              method: request.method,
              path: request.path,
              body: request.body
            });
            if (connectorAction !== 'read') {
              let decision = await runService.consumeApproval({ ...runLease, fingerprint });
              if (!decision && typeof runService.consumeSessionAuthorization === 'function') {
                const providerOrigin = request.provider === 'github'
                  ? 'https://api.github.com'
                  : request.provider === 'google_drive'
                    ? 'https://www.googleapis.com'
                    : '';
                decision = await runService.consumeSessionAuthorization({
                  ...runLease,
                  actionType: connectorAction,
                  recipient: providerOrigin
                });
              }
              if (decision?.status === 'denied') {
                await runService.appendStep({
                  ...runLease,
                  role: 'executor',
                  status: 'skipped',
                  toolName: `${request.provider}_api`,
                  riskLevel: 'high',
                  summary: `用户拒绝了 ${connectorAction}`,
                  actionFingerprint: fingerprint
                });
                return { ok: false, denied: true, actionType: connectorAction };
              }
              if (!decision) {
                await persistCostCheckpoint();
                const approval = await runService.requestApproval({
                  ...runLease,
                  actionType: connectorAction,
                  recipient: request.provider === 'github'
                    ? `https://api.github.com${request.path}`
                    : `https://www.googleapis.com${request.path}`,
                  riskLevel: 'high',
                  changeSummary: request.purpose,
                  evidenceSummary: `${request.method} ${request.path}`,
                  impactSummary: `将通过 ${request.provider} API 修改外部数据。`,
                  rollbackSummary: connectorAction === 'delete'
                    ? '删除可能不可恢复；拒绝后不会调用 API。'
                    : '撤销需要一次新的、单独审批的反向 API 操作。',
                  fingerprint
                });
                throw new AgentWaitingForUser(approval);
              }
            }
            const result = await connectorService.request({
              userId: context.run.user_id,
              provider: request.provider,
              method: request.method,
              path: request.path,
              body: request.body
            });
            await runService.appendStep({
              ...runLease,
              role: 'executor',
              status: 'succeeded',
              toolName: `${request.provider}_api`,
              riskLevel: connectorAction === 'read' ? 'low' : 'high',
              summary: request.purpose,
              actionFingerprint: fingerprint,
              sanitizedInput: {
                provider: request.provider,
                method: request.method,
                path: request.path
              },
              sanitizedOutput: {
                status: result.status,
                url: result.sourceUrl,
                untrusted: true,
                injectionSuspected: result.injectionSuspected,
                injectionSignals: result.injectionSignals,
                contentHash: result.contentHash
              }
            });
            return result;
          },
          declareArtifact: async (declaration) => {
            await pauseIfRequested();
            const artifact = await artifactService.ingest({
              run: context.run,
              sandboxName,
              declaration,
              workerLease: runLease
            });
            if (!artifact.alreadyRegistered) {
              await runService.appendStep({
                ...runLease,
                role: 'verifier',
                status: artifact.verificationStatus === 'passed' ? 'succeeded' : 'failed',
                toolName: 'artifact_verifier',
                summary: `验证 ${artifact.filename}`,
                sanitizedInput: {
                  role: artifact.role,
                  mimeType: artifact.mimeType
                },
                sanitizedOutput: {
                  verificationStatus: artifact.verificationStatus,
                  byteSize: artifact.byteSize
                }
              });
            }
            return artifact;
          },
          requestApproval: async (request) => {
            await pauseIfRequested();
            const fingerprint = actionFingerprint({
              type: request.actionType,
              recipient: request.recipient,
              changeSummary: request.changeSummary,
              evidenceSummary: request.evidenceSummary,
              impactSummary: request.impactSummary,
              rollbackSummary: request.rollbackSummary
            });
            let approved = await runService.consumeApproval({ ...runLease, fingerprint });
            const classification = classifyAction({ type: request.actionType });
            if (
              !approved &&
              classification.decision === 'approval' &&
              typeof runService.consumeSessionAuthorization === 'function'
            ) {
              approved = await runService.consumeSessionAuthorization({
                ...runLease,
                actionType: request.actionType,
                recipient: request.recipient
              });
            }
            if (approved) {
              return {
                ...approved,
                consumed: true,
                approved: approved.status === 'approved'
              };
            }
            await persistCostCheckpoint();
            const approval = await runService.requestApproval({
              ...runLease,
              actionType: request.actionType,
              recipient: request.recipient,
              riskLevel: request.takeover || TAKEOVER_ACTIONS.has(request.actionType)
                ? 'blocked'
                : 'high',
              changeSummary: request.changeSummary,
              evidenceSummary: request.evidenceSummary,
              impactSummary: request.impactSummary,
              rollbackSummary: request.rollbackSummary,
              fingerprint
            });
            return { ...approval, consumed: false };
          }
        }
        })
      });
      const execution = modelExecution.value;
      if (modelExecution.leaseError) throw modelExecution.leaseError;
      costMeter.setModel(execution.credits);
      await persistCostCheckpoint({ usageItems: { source: 'model_complete' } });

      if (
        browserInitialized &&
        context.run.browser_config?.persistSession === true &&
        context.run.browser_config?.allowedOrigins?.length === 1
      ) {
        await runService.assertWorkerLeaseActive(runLease);
        const captured = await sandbox.systemShell(
          sandboxName,
          [
            'set -eu',
            'browser_pid="$(cat /tmp/artigen-chromium/browser.pid 2>/dev/null || true)"',
            'case "$browser_pid" in (*[!0-9]*|"") browser_pid="" ;; esac',
            'test -z "$browser_pid" || kill -TERM "$browser_pid" >/dev/null 2>&1 || true',
            'for attempt in 1 2 3 4 5; do',
            '  test -z "$browser_pid" || ! kill -0 "$browser_pid" >/dev/null 2>&1 && break',
            '  sleep 1',
            'done',
            'cd /tmp/artigen-chromium',
            'rm -f /tmp/artigen-workspace/.artigen/browser-profile.zip',
            'include=""',
            'for path in "Local State" "Default/Cookies" "Default/Local Storage" "Default/Session Storage"; do',
            '  test -e "$path" && include="$include \\"$path\\""',
            'done',
            'test -n "$include"',
            'eval "zip -qr /tmp/artigen-workspace/.artigen/browser-profile.zip $include"',
            'test "$(wc -c </tmp/artigen-workspace/.artigen/browser-profile.zip)" -le 1433600'
          ].join('\n'),
          120
        );
        await runService.assertWorkerLeaseActive(runLease);
        if (captured.success) {
          const storedProfile = await sandbox.readFile(
            sandboxName,
            '/tmp/artigen-workspace/.artigen/browser-profile.zip'
          );
          await runService.assertWorkerLeaseActive(runLease);
          await runService.saveBrowserProfile({
            ...runLease,
            userId: context.run.user_id,
            siteOrigin: context.run.browser_config.allowedOrigins[0],
            archiveBase64: storedProfile.base64
          });
          await runService.appendStep({
            ...runLease,
            role: 'packager',
            status: 'succeeded',
            toolName: 'browser_profile',
            summary: '已加密保存站点会话 30 天',
            sanitizedInput: {
              siteOrigin: context.run.browser_config.allowedOrigins[0]
            }
          });
        } else {
          await runService.appendStep({
            ...runLease,
            role: 'packager',
            status: 'failed',
            toolName: 'browser_profile',
            summary: '浏览器会话过大或不可用，未保存',
            sanitizedOutput: { saved: false }
          });
        }
      }

      await runService.appendRuntimeEvent({
        ...runLease,
        type: 'run.ready_to_finalize',
        phase: 'verifying',
        summary: '模型阶段已结束，后续只允许确定性验证与原子结算',
        data: {
          semanticVerificationPassed: latestSemanticVerification?.passed === true
        }
      });
      await testController?.hit('after_ready_to_finalize_event', { runId });
      await runService.transitionRun({
        ...runLease,
        toStatus: 'verifying',
        eventType: 'run.verifying',
        summary: '正在执行独立交付物验证',
        checkpoint: {
          phase: 'verifying',
          modelResponseId: execution.responseId
        }
      });

      const artifacts = await runService.listArtifacts({
        userId: context.run.user_id,
        runId
      });
      const minimumArtifactCounts = {
        report: 2,
        spreadsheet: 1,
        presentation: 2,
        website: 1,
        image: 1
      };
      const finalCosts = costMeter.snapshot({
        accrue: true,
        minimumSandboxSeconds: 1
      });
      await runService.finishRun({
        ...runLease,
        actualCredits: finalCosts.model + finalCosts.generation + finalCosts.sandbox,
        checklist: {
          requiredArtifactCount: Math.max(
            0,
            requiredDeliverables.reduce(
              (total, type) => total + minimumArtifactCounts[type],
              0
            )
          ),
          requiredDeliverables,
          artifactCount: artifacts.length,
          allArtifactsPassed: requiredDeliverables.length === 0 || (
            artifacts.length > 0 && artifacts.every((artifact) => artifact.verificationStatus === 'passed')
          ),
          editableSourcePresent: artifacts.some((artifact) => (
            artifact.role === 'editable' || artifact.role === 'source'
          )),
          primaryArtifactPresent: artifacts.some((artifact) => (
            ['editable', 'source', 'website', 'package', 'image'].includes(artifact.role)
          )),
          ...(runtimeV2 ? {
            semanticVerificationPassed: latestSemanticVerification?.passed === true,
            semanticVerificationScore: Number(latestSemanticVerification?.score || 0),
            visualAestheticReviewAutomated: false
          } : {}),
          modelClaimIgnoredUntilVerified: true
        }
      });
      terminal = true;
      return { claimed: true, status: 'succeeded' };
    } catch (error) {
      if (testController && error?.name === 'RuntimeHarnessCrash') throw error;
      if (isLeaseLostError(error)) {
        return { claimed: true, status: 'lease_lost' };
      }
      if ([
        'AGENT_MODEL_CALL_AMBIGUOUS',
        'AGENT_IMAGE_CALL_AMBIGUOUS',
        'AGENT_TOOL_CALL_AMBIGUOUS'
      ].includes(error?.code)) {
        const imageCall = error.code === 'AGENT_IMAGE_CALL_AMBIGUOUS';
        const toolCall = error.code === 'AGENT_TOOL_CALL_AMBIGUOUS';
        await runService.appendRuntimeEvent({
          ...runLease,
          type: imageCall
            ? 'image.call.ambiguous'
            : toolCall
              ? 'tool.call.ambiguous'
              : 'model.call.ambiguous',
          phase: 'waiting_user',
          summary: imageCall
            ? '本次图片生成状态不确定，系统没有自动重试或计费'
            : toolCall
              ? '本次工具执行结果不确定，系统没有自动重试或计费'
            : '本次模型调用状态不确定，系统没有自动重试或计费',
          data: { callId: error?.details?.callId || null }
        });
        await runService.transitionRun({
          ...runLease,
          toStatus: 'waiting_user',
          eventType: 'run.retry_required',
          summary: '需要你确认后再安全重试',
          checkpoint: {
            phase: 'waiting_user',
            retryRequired: true,
            retryReason: imageCall
              ? 'image_call_ambiguous'
              : toolCall
                ? 'tool_call_ambiguous'
                : 'model_call_ambiguous'
          }
        });
        if (sandboxName) await sandbox.suspend(sandboxName).catch(() => {});
        return { claimed: true, status: 'waiting_user' };
      }
      if (error instanceof AgentWaitingForUser || error?.code === 'AGENT_WAITING_FOR_USER') {
        const takeover = error?.approval?.risk_level === 'blocked';
        if (sandboxName && !takeover) await sandbox.suspend(sandboxName).catch(() => {});
        return { claimed: true, status: 'waiting_user' };
      }
      if (['AGENT_CONTEXT_FIXED_BUDGET_EXCEEDED', 'AGENT_TASK_SPEC_CONTEXT_EXCEEDED'].includes(error?.code)) {
        await runService.appendRuntimeEvent({
          ...runLease,
          type: 'run.input_required',
          phase: 'waiting_user',
          summary: '关键目标与验收条件超出安全上下文，请缩小范围后继续',
          data: {
            field: error?.details?.field || null,
            estimatedInputTokens: error?.details?.estimatedInputTokens || null,
            contextBudgetTokens: error?.details?.contextBudgetTokens || null
          }
        });
        await runService.transitionRun({
          ...runLease,
          toStatus: 'waiting_user',
          eventType: 'run.clarification_required',
          summary: '任务没有删减你的关键要求，正在等待你缩小本次范围',
          checkpoint: {
            phase: 'waiting_user',
            clarificationRequired: true,
            clarificationReason: 'immutable_context_budget'
          }
        });
        if (sandboxName) await sandbox.suspend(sandboxName).catch(() => {});
        return { claimed: true, status: 'waiting_user' };
      }
      if (error instanceof AgentPaused || error?.code === 'AGENT_PAUSED') {
        return { claimed: true, status: 'paused' };
      }
      if (error instanceof AgentCancelled || error?.code === 'AGENT_CANCELLED') {
        terminal = true;
        return { claimed: true, status: 'cancelled' };
      }
      const failureCosts = costMeter.snapshot({ accrue: true });
      const failureDetail = [
        error?.details?.detail,
        error?.details?.command ? `command=${error.details.command}` : '',
        error?.details?.timeoutMs ? `timeoutMs=${error.details.timeoutMs}` : ''
      ].filter(Boolean).join(' ').trim().slice(0, 300);
      console.error(
        'Agent run failed',
        runId,
        String(error?.code || 'AGENT_RUNTIME_FAILED').slice(0, 100),
        failureDetail
      );
      try {
        await runService.failRun({
          ...runLease,
          errorCode: String(error?.code || 'AGENT_RUNTIME_FAILED').slice(0, 100),
          refundable: failureCosts.generation <= 0,
          actualCredits: failureCosts.generation
        });
        terminal = true;
      } catch (failure) {
        if (isLeaseLostError(failure)) {
          return { claimed: true, status: 'lease_lost' };
        }
        // A failed terminal transaction leaves ownership and settlement unknown.
        // Keep the sandbox for the next fenced Worker or terminal reconciler.
        console.error('Agent failure settlement failed', runId, failure?.code || failure?.message);
      }
      throw error;
    } finally {
      if (terminal && sandboxName) {
        try {
          await sandbox.destroy(sandboxName);
          await runService.markSandboxDestroyed?.({
            runId,
            sandboxRef: sandboxName
          });
        } catch (error) {
          console.error('Agent sandbox cleanup failed', runId, error?.code || error?.message);
        }
      }
    }
  };

  const cleanupTerminalSandboxes = async ({ limit = 100 } = {}) => {
    if (
      typeof runService.listTerminalSandboxes !== 'function' ||
      typeof runService.markSandboxDestroyed !== 'function'
    ) {
      return { destroyed: 0, failed: 0 };
    }
    const pending = await runService.listTerminalSandboxes({ limit });
    let destroyed = 0;
    let failed = 0;
    for (const entry of pending) {
      try {
        const sandboxRef = entry.sandboxRef || sandbox.referenceForRun?.(entry.runId);
        if (!sandboxRef) throw new ApiError(500, 'AGENT_SANDBOX_REFERENCE_UNAVAILABLE');
        await sandbox.destroy(sandboxRef);
        await runService.markSandboxDestroyed({ ...entry, sandboxRef });
        destroyed += 1;
      } catch (error) {
        failed += 1;
        console.error(
          'Agent terminal sandbox cleanup failed',
          entry.runId,
          error?.code || error?.message
        );
      }
    }
    return { destroyed, failed };
  };

  return {
    processRun,
    workerId,
    readiness,
    startInfrastructure: async () => {
      readiness.desktopRelayReady = await desktopRelay.start();
      return readiness;
    },
    stopInfrastructure: async () => {
      readiness.desktopRelayReady = false;
      await desktopRelay.stop();
    },
    expireStaleRuns: async (input) => {
      const expiredRuns = await runService.expireStaleRuns(input);
      const sandboxCleanup = await cleanupTerminalSandboxes(input);
      const privateData = await runService.purgeExpiredPrivateData?.(input);
      return { expiredRuns, sandboxCleanup, privateData };
    }
  };
};

module.exports = {
  AgentCancelled,
  AgentPaused,
  LeaseLostDuringWorkError,
  assertExpectedSubagentOutputFiles,
  buildSubagentObjective,
  createAgentCostMeter,
  createSerializedCostPersister,
  createAgentWorkerService,
  parentVerifiedSubagentFiles,
  firstPayload,
  normalizeSubagentShellScript,
  resolveToolReceiptRequestSha256,
  restrictDelegatedTaskInputs,
  runWithLeaseHeartbeat,
  resolveStagedImageReferences
};
