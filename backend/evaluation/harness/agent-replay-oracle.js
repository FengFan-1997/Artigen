const crypto = require('node:crypto');

const TERMINAL_EVENT_STATUS = Object.freeze({
  'run.cancelled': 'cancelled',
  'run.failed': 'failed',
  'run.succeeded': 'succeeded'
});

const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hex = (value) => Buffer.isBuffer(value) ? value.toString('hex') : String(value || '');

const publicDigest = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const summarizeTaskSpec = (taskSpec) => {
  if (!taskSpec || typeof taskSpec !== 'object') return null;
  return {
    version: number(taskSpec.version),
    goalSha256: publicDigest(String(taskSpec.goal || '')),
    plan: (Array.isArray(taskSpec.plan) ? taskSpec.plan : []).map((step) => ({
      id: String(step?.id || ''),
      phase: String(step?.phase || ''),
      status: String(step?.status || '')
    })),
    acceptanceIds: (Array.isArray(taskSpec.acceptanceRequirements)
      ? taskSpec.acceptanceRequirements
      : []).map((criterion) => String(criterion?.id || '')).filter(Boolean)
  };
};

const reconstructRuntimeState = (snapshot) => {
  const run = snapshot?.run || {};
  const events = [...(snapshot?.events || [])]
    .sort((left, right) => number(left.id) - number(right.id));
  const steps = [...(snapshot?.steps || [])]
    .sort((left, right) => number(left.sequence) - number(right.sequence));
  const reservations = [...(snapshot?.reservations || [])];
  const receipts = [...(snapshot?.receipts || [])];
  const toolReceipts = [...(snapshot?.toolReceipts || [])];
  const artifacts = [...(snapshot?.artifacts || [])];
  const subagents = [...(snapshot?.subagents || [])];
  const approvals = [...(snapshot?.approvals || [])];
  const modelCalls = [...(snapshot?.modelCalls || [])];
  const checkpointPlan = (Array.isArray(run.checkpoint?.plan) ? run.checkpoint.plan : [])
    .map((step) => ({
      id: String(step?.id || ''),
      phase: String(step?.phase || ''),
      status: String(step?.status || '')
    }));
  let runtimePlan = snapshot?.taskSpecSummary
    ? snapshot.taskSpecSummary.plan.map((step) => ({ ...step }))
    : checkpointPlan.map((step) => ({ ...step }));
  let planReplayInvalid = false;
  for (const recorded of steps.filter((step) => (
    step.tool_name === 'update_plan' && Array.isArray(step.sanitized_output?.plan)
  ))) {
    const updateById = new Map(recorded.sanitized_output.plan.map((step) => [
      String(step?.id || ''),
      String(step?.status || '')
    ]));
    if (
      updateById.size === runtimePlan.length &&
      runtimePlan.every((step) => updateById.has(step.id))
    ) {
      runtimePlan = runtimePlan.map((step) => ({
        ...step,
        status: updateById.get(step.id)
      }));
    } else planReplayInvalid = true;
  }
  const verifierCriteria = (Array.isArray(run.semantic_verification?.criteria)
    ? run.semantic_verification.criteria
    : []).map((criterion) => ({
      requirementId: String(criterion?.requirementId || ''),
      status: String(criterion?.status || '')
    }));
  const terminalEvents = events.filter((event) => TERMINAL_EVENT_STATUS[event.event_type]);
  const lastEvent = events.at(-1) || null;
  const latestTerminal = terminalEvents.at(-1) || null;
  if (latestTerminal?.event_type === 'run.succeeded') {
    runtimePlan = runtimePlan.map((step) => ({ ...step, status: 'completed' }));
  }
  const consumedCredits = reservations
    .filter((entry) => entry.state === 'consumed')
    .reduce((sum, entry) => sum + number(entry.actual_credits), 0);
  const reservedCredits = reservations
    .filter((entry) => entry.state === 'reserved')
    .reduce((sum, entry) => sum + number(entry.reserved_credits), 0);

  return Object.freeze({
    runId: String(run.id || ''),
    statusFromEvents: latestTerminal ? TERMINAL_EVENT_STATUS[latestTerminal.event_type] : null,
    phaseFromEvents: String(lastEvent?.phase || ''),
    eventCount: events.length,
    lastEventId: lastEvent ? String(lastEvent.id) : null,
    stepCount: steps.length,
    lastStepSequence: number(steps.at(-1)?.sequence),
    modelReceipts: Object.fromEntries(
      ['queued', 'dispatched', 'received', 'consumed', 'ambiguous'].map((state) => [
        state,
        receipts.filter((entry) => entry.state === state).length
      ])
    ),
    toolReceipts: Object.fromEntries(
      ['dispatched', 'consumed', 'ambiguous'].map((state) => [
        state,
        toolReceipts.filter((entry) => entry.state === state).length
      ])
    ),
    modelCalls: {
      count: modelCalls.length,
      byPhase: Object.fromEntries(
        ['router', 'planner', 'actor', 'verifier', 'subagent', 'evaluation'].map((phase) => [
          phase,
          modelCalls.filter((entry) => entry.phase === phase).length
        ])
      )
    },
    budget: {
      reservedCredits,
      consumedCredits,
      chargedCredits: number(run.charged_credits),
      maxCredits: number(run.max_credits),
      platformOverrunCredits: number(run.platform_overrun_credits)
    },
    artifacts: artifacts.map((artifact) => ({
      id: String(artifact.id || ''),
      role: String(artifact.role || ''),
      mimeType: String(artifact.mime_type || ''),
      verificationStatus: String(artifact.verification_status || ''),
      sha256: hex(artifact.sha256)
    })),
    subagents: subagents.map((subagent) => ({
      id: String(subagent.id || ''),
      status: String(subagent.status || ''),
      credits: number(subagent.estimated_credits_used)
    })),
    approvals: approvals.map((approval) => ({
      id: String(approval.id || ''),
      status: String(approval.status || ''),
      used: Boolean(approval.used_at)
    })),
    taskSpec: snapshot?.taskSpecSummary || null,
    runtimePlan,
    checkpointPlan,
    planReplayInvalid,
    verifierCriteria,
    checkpoint: snapshot?.checkpoint || null,
    digest: publicDigest({
      runtimeProfile: [
        number(run.runtime_version),
        number(run.lease_epoch),
        hex(run.runtime_profile_hash),
        hex(run.prompt_hash),
        run.prompt_profile || null,
        run.skill_versions || {},
        run.runtime_profile_summary || {}
      ],
      events: events.map((entry) => [String(entry.id), entry.event_type, entry.phase]),
      steps: steps.map((entry) => [entry.sequence, entry.role, entry.status, entry.tool_name]),
      receipts: receipts.map((entry) => [entry.id, entry.state, number(entry.lease_epoch)]),
      toolReceipts: toolReceipts.map((entry) => [
        entry.receipt_key,
        entry.kind,
        entry.state,
        number(entry.lease_epoch),
        hex(entry.request_sha256)
      ]),
      modelCalls: modelCalls.map((entry) => [
        entry.id,
        entry.phase,
        entry.model_name,
        entry.outcome,
        hex(entry.prompt_hash)
      ]),
      reservations: reservations.map((entry) => [
        entry.reservation_key,
        entry.state,
        number(entry.reserved_credits),
        number(entry.actual_credits)
      ]),
      artifacts: artifacts.map((entry) => [entry.id, entry.role, entry.verification_status, hex(entry.sha256)]),
      taskSpec: snapshot?.taskSpecSummary || null,
      runtimePlan,
      checkpointPlan,
      verifierCriteria
    })
  });
};

const runtimeInvariantErrors = (snapshot, reconstructed = reconstructRuntimeState(snapshot)) => {
  const errors = [];
  const run = snapshot?.run || {};
  const events = snapshot?.events || [];
  const steps = snapshot?.steps || [];
  const receipts = snapshot?.receipts || [];
  const toolReceipts = snapshot?.toolReceipts || [];
  const reservations = snapshot?.reservations || [];
  const artifacts = snapshot?.artifacts || [];
  const modelCalls = snapshot?.modelCalls || [];
  const taskSpec = snapshot?.taskSpecSummary || null;
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(String(run.status || ''));

  if (reconstructed.statusFromEvents && reconstructed.statusFromEvents !== run.status) {
    errors.push('status_event_drift');
  }
  if (terminal && !events.some((event) => TERMINAL_EVENT_STATUS[event.event_type] === run.status)) {
    errors.push('terminal_event_missing');
  }
  if (number(run.step_count) !== steps.length) errors.push('step_count_drift');
  if (new Set(steps.map((step) => number(step.sequence))).size !== steps.length) {
    errors.push('step_sequence_duplicate');
  }
  const reservationKeys = reservations.map((entry) => String(entry.reservation_key || ''));
  const reservationByKey = new Map(reservations.map((entry) => [
    String(entry.reservation_key || ''),
    entry
  ]));
  const reservationByModelCallId = new Map(reservations
    .filter((entry) => entry.model_call_id)
    .map((entry) => [String(entry.model_call_id), entry]));
  if (new Set(reservationKeys).size !== reservationKeys.length) {
    errors.push('budget_reservation_duplicate');
  }
  const reservationModelCallIds = reservations
    .map((entry) => String(entry.model_call_id || ''))
    .filter(Boolean);
  if (new Set(reservationModelCallIds).size !== reservationModelCallIds.length) {
    errors.push('model_call_budget_reservation_duplicate');
  }
  if (reservations.some((entry) => (
    number(entry.reserved_credits) < 0 || number(entry.actual_credits) < 0
  ))) errors.push('budget_negative');
  if (reconstructed.budget.chargedCredits > reconstructed.budget.maxCredits) {
    errors.push('charged_budget_exceeded');
  }
  if (
    reconstructed.budget.consumedCredits > reconstructed.budget.maxCredits &&
    reconstructed.budget.platformOverrunCredits + reconstructed.budget.maxCredits + 1e-6 <
      reconstructed.budget.consumedCredits
  ) errors.push('platform_overrun_unrecorded');
  if (terminal && reservations.some((entry) => entry.state === 'reserved')) {
    errors.push('terminal_budget_reservation_open');
  }
  const receiptIds = receipts.map((entry) => String(entry.id || ''));
  if (new Set(receiptIds).size !== receiptIds.length) errors.push('model_receipt_duplicate');
  if (receipts.some((entry) => number(entry.lease_epoch) > number(run.lease_epoch))) {
    errors.push('model_receipt_future_lease');
  }
  const modelCallIds = modelCalls.map((entry) => String(entry.id || ''));
  if (new Set(modelCallIds).size !== modelCallIds.length) errors.push('model_call_duplicate');
  const pinnedModelName = String(run.model_name || 'Qwen/Qwen3-8B');
  const pinnedModelProvider = String(run.model_provider || '');
  if (modelCalls.some((entry) => (
    entry.model_name !== pinnedModelName ||
    (pinnedModelProvider && entry.provider !== pinnedModelProvider)
  ))) {
    errors.push('model_lock_violated');
  }
  if (modelCalls.some((entry) => entry.prompt_hash && hex(entry.prompt_hash).length !== 64)) {
    errors.push('model_prompt_hash_invalid');
  }
  if (number(run.runtime_version) === 2 && (
    hex(run.runtime_profile_hash).length !== 64 ||
    hex(run.prompt_hash).length !== 64 ||
    !run.prompt_profile ||
    !run.runtime_profile_summary ||
    Object.keys(run.runtime_profile_summary).length === 0
  )) {
    errors.push('runtime_profile_incomplete');
  }
  const knownModelCalls = new Set(modelCallIds);
  if (receipts.some((entry) => !knownModelCalls.has(String(entry.id || '')))) {
    errors.push('model_receipt_call_missing');
  }
  if (receipts.some((entry) => (
    entry.state === 'consumed' &&
    reservationByModelCallId.get(String(entry.id || ''))?.state !== 'consumed'
  ))) errors.push('model_receipt_budget_not_consumed');
  if (
    run.status === 'cancelled' &&
    receipts.some((entry) => entry.state === 'received') &&
    !events.some((event) => event.event_type === 'model.call.receipt_unreadable')
  ) errors.push('cancelled_model_receipt_unaccounted');
  const toolReceiptKeys = toolReceipts.map((entry) => String(entry.receipt_key || ''));
  if (new Set(toolReceiptKeys).size !== toolReceiptKeys.length) {
    errors.push('tool_receipt_duplicate');
  }
  if (toolReceipts.some((entry) => number(entry.lease_epoch) > number(run.lease_epoch))) {
    errors.push('tool_receipt_future_lease');
  }
  if (toolReceipts.some((entry) => hex(entry.request_sha256).length !== 64)) {
    errors.push('tool_receipt_request_hash_invalid');
  }
  if (toolReceipts.some((entry) => (
    entry.state === 'consumed' &&
    (!entry.result_ciphertext || entry.actual_credits === null)
  ))) errors.push('tool_receipt_consumed_result_missing');
  if (toolReceipts.some((entry) => (
    entry.state !== 'consumed' &&
    (entry.result_ciphertext || entry.actual_credits !== null)
  ))) errors.push('tool_receipt_unconsumed_result_present');
  if (toolReceipts.some((entry) => (
    !reservationKeys.includes(String(entry.reservation_key || ''))
  ))) errors.push('tool_receipt_budget_reservation_missing');
  if (toolReceipts.some((entry) => (
    entry.state === 'consumed' &&
    reservationByKey.get(String(entry.reservation_key || ''))?.state !== 'consumed'
  ))) errors.push('tool_receipt_budget_not_consumed');
  if (
    toolReceipts.some((entry) => entry.state === 'ambiguous') &&
    !events.some((event) => ['image.call.ambiguous', 'tool.call.ambiguous'].includes(event.event_type))
  ) errors.push('tool_receipt_ambiguous_event_missing');
  if (run.status === 'waiting_user' && run.checkpoint?.retryRequired === true) {
    if (
      !toolReceipts.some((entry) => entry.state === 'ambiguous') &&
      !receipts.some((entry) => entry.state === 'ambiguous')
    ) {
      errors.push('ambiguous_receipt_missing');
    }
  }
  if (run.status === 'succeeded') {
    // Runtime V1 predates the semantic-verifier record for artifact runs. Its
    // baseline is still useful when at least one deterministic artifact and
    // terminal accounting pass. Zero-file text success always needs semantic
    // verification, regardless of runtime version.
    const requiresSemanticVerification = (
      Number(run.runtime_version || 2) >= 2 || artifacts.length === 0
    );
    if (requiresSemanticVerification && run.semantic_verification?.passed !== true) {
      errors.push('semantic_verification_missing');
    }
    if (artifacts.some((artifact) => artifact.verification_status !== 'passed')) {
      errors.push('artifact_verification_incomplete');
    }
    if (artifacts.length === 0 && !/^[a-f0-9]{64}$/.test(hex(run.final_text_sha256))) {
      errors.push('text_final_sha256_missing');
    }
    if (receipts.some((entry) => ['received', 'dispatched', 'queued'].includes(entry.state))) {
      errors.push('succeeded_model_receipt_unconsumed');
    }
    if (toolReceipts.some((entry) => entry.state === 'dispatched')) {
      errors.push('succeeded_tool_receipt_dispatched');
    }
    const releasedReservationKeys = new Set(reservations
      .filter((entry) => entry.state === 'released')
      .map((entry) => String(entry.reservation_key || '')));
    if (toolReceipts.some((entry) => (
      entry.state === 'ambiguous' &&
      !releasedReservationKeys.has(String(entry.reservation_key || ''))
    ))) {
      errors.push('succeeded_ambiguous_tool_budget_not_released');
    }
  }
  if (number(run.runtime_version) === 2 && taskSpec) {
    const currentPlan = reconstructed.runtimePlan;
    if (
      currentPlan.length !== taskSpec.plan.length ||
      currentPlan.some((step, index) => (
        step.id !== taskSpec.plan[index]?.id || step.phase !== taskSpec.plan[index]?.phase
      ))
    ) errors.push('task_spec_plan_drift');
    if (run.status === 'succeeded' && currentPlan.some((step) => step.status !== 'completed')) {
      errors.push('succeeded_plan_incomplete');
    }
    if (reconstructed.planReplayInvalid) errors.push('event_plan_replay_invalid');
    const planWasPersisted = reconstructed.checkpointPlan.length > 0 ||
      events.some((event) => event.event_type === 'plan.compiled');
    if (planWasPersisted && (
      reconstructed.checkpointPlan.length !== currentPlan.length ||
      reconstructed.checkpointPlan.some((step, index) => (
        step.id !== currentPlan[index]?.id ||
        step.phase !== currentPlan[index]?.phase ||
        step.status !== currentPlan[index]?.status
      ))
    )) errors.push('checkpoint_plan_drift');
    if (run.status === 'succeeded') {
      const verifiedIds = new Set(reconstructed.verifierCriteria.map((criterion) => criterion.requirementId));
      if (taskSpec.acceptanceIds.some((id) => !verifiedIds.has(id))) {
        errors.push('acceptance_verification_missing');
      }
    }
  }
  const readyToFinalizeEvent = events.find((event) => event.event_type === 'run.ready_to_finalize');
  if (snapshot?.checkpoint?.readyToFinalize && !readyToFinalizeEvent) {
    errors.push('ready_to_finalize_event_missing');
  }
  const readyModelCallCount = Number(readyToFinalizeEvent?.data?.modelCallCount);
  if (
    readyToFinalizeEvent &&
    (!Number.isSafeInteger(readyModelCallCount) || readyModelCallCount < 0)
  ) {
    errors.push('ready_to_finalize_model_boundary_missing');
  }
  if (number(snapshot?.modelCallsAfterReadyToFinalize) > 0) {
    errors.push('model_recalled_after_ready_to_finalize');
  }
  return errors;
};

const loadRuntimeSnapshot = async ({ pool, runId, runService = null } = {}) => {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('AGENT_REPLAY_ORACLE_POOL_REQUIRED');
  }
  const [
    run, events, steps, receipts, toolReceipts, reservations, subagents, approvals, artifacts,
    holds, modelCalls
  ] = await Promise.all([
    pool.query('SELECT * FROM agent_runs WHERE id=$1', [runId]),
    pool.query('SELECT * FROM agent_events WHERE run_id=$1 ORDER BY id', [runId]),
    pool.query('SELECT * FROM agent_steps WHERE run_id=$1 ORDER BY sequence', [runId]),
    pool.query('SELECT * FROM agent_model_call_receipts WHERE run_id=$1 ORDER BY created_at,id', [runId]),
    pool.query('SELECT * FROM agent_tool_call_receipts WHERE run_id=$1 ORDER BY created_at,id', [runId]),
    pool.query('SELECT * FROM agent_budget_reservations WHERE run_id=$1 ORDER BY created_at,id', [runId]),
    pool.query('SELECT * FROM agent_subagents WHERE run_id=$1 ORDER BY ordinal,id', [runId]),
    pool.query('SELECT * FROM agent_approvals WHERE run_id=$1 ORDER BY created_at,id', [runId]),
    pool.query('SELECT * FROM agent_artifacts WHERE run_id=$1 ORDER BY created_at,id', [runId]),
    pool.query('SELECT * FROM agent_budget_holds WHERE run_id=$1', [runId]),
    pool.query('SELECT * FROM agent_model_calls WHERE run_id=$1 ORDER BY created_at,id', [runId])
  ]);
  if (!run.rowCount) throw new Error(`AGENT_REPLAY_ORACLE_RUN_NOT_FOUND:${runId}`);
  let checkpoint = null;
  let taskSpecSummary = null;
  if (runService?.loadPrivateContext) {
    const context = await runService.loadPrivateContext({ runId });
    if (!['succeeded', 'failed', 'cancelled'].includes(run.rows[0].status)) {
      checkpoint = context.modelCheckpoint || null;
    }
    const objectivePayload = context.payloads.find((payload) => payload.kind === 'objective');
    taskSpecSummary = summarizeTaskSpec(objectivePayload?.value?.taskSpec);
  }
  return {
    run: run.rows[0],
    events: events.rows,
    steps: steps.rows,
    receipts: receipts.rows,
    toolReceipts: toolReceipts.rows,
    reservations: reservations.rows,
    subagents: subagents.rows,
    approvals: approvals.rows,
    artifacts: artifacts.rows,
    holds: holds.rows,
    modelCalls: modelCalls.rows,
    checkpoint,
    taskSpecSummary,
    modelCallsAfterReadyToFinalize: (() => {
      const event = events.rows.find((entry) => entry.event_type === 'run.ready_to_finalize');
      const boundary = Number(event?.data?.modelCallCount);
      if (!Number.isSafeInteger(boundary) || boundary < 0) return 0;
      return Math.max(0, modelCalls.rows.length - boundary);
    })()
  };
};

class AgentReplayOracle {
  constructor({ pool, runService = null } = {}) {
    this.pool = pool;
    this.runService = runService;
  }

  async snapshot(runId) {
    const persistent = await loadRuntimeSnapshot({
      pool: this.pool,
      runId,
      runService: this.runService
    });
    return {
      persistent,
      reconstructed: reconstructRuntimeState(persistent)
    };
  }

  async assertInvariants(runId) {
    const result = await this.snapshot(runId);
    const errors = runtimeInvariantErrors(result.persistent, result.reconstructed);
    if (errors.length) {
      const error = new Error(`AGENT_REPLAY_INVARIANT_FAILED:${errors.join(',')}`);
      error.codes = errors;
      error.snapshotDigest = result.reconstructed.digest;
      throw error;
    }
    return result;
  }
}

module.exports = {
  AgentReplayOracle,
  loadRuntimeSnapshot,
  reconstructRuntimeState,
  runtimeInvariantErrors,
  summarizeTaskSpec
};
