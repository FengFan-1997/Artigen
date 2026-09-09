'use strict';

const crypto = require('node:crypto');
const { TEXT_MODEL, IMAGE_MODEL } = require('../lib/agent-models');

const MAX_CANDIDATES = 8;
const DEFAULT_VALIDATION_RATIO = 0.2;
const KNOWN_FAILURE_HINTS = Object.freeze({
  AGENT_MODEL_TOOL_ARGUMENTS_INVALID: 'Match the published tool schema exactly and emit one legal JSON object.',
  AGENT_BROWSER_URL_FORBIDDEN: 'Use only observed HTTPS URLs from the server allowlist; never invent a source.',
  AGENT_REPEATED_ACTION_FAILED: 'Stop repeated actions when the state fingerprint is unchanged and report the blocker.',
  AGENT_TASK_SPEC_INVALID: 'Preserve every authoritative requirement and ask for clarification instead of truncating it.'
});

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

const sha256 = (value) => crypto.createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(canonicalize(value)))
  .digest('hex');

const normalizePrompt = (prompt) => {
  const value = String(prompt || '').replace(/\0/g, '').trim();
  if (!value) throw new Error('AGENT_PROMPT_OPTIMIZER_PROMPT_REQUIRED');
  if (value.length > 20000) throw new Error('AGENT_PROMPT_OPTIMIZER_PROMPT_TOO_LONG');
  return value;
};

const createPromptCandidate = ({ prompt, version = 1, parentVersion = null, summary = '' } = {}) => {
  const normalizedPrompt = normalizePrompt(prompt);
  const candidate = {
    version: Number.isInteger(version) && version > 0 ? version : 1,
    parentVersion: parentVersion === null ? null : Number(parentVersion),
    summary: String(summary || '').trim().slice(0, 240),
    prompt: normalizedPrompt,
    contentHash: sha256(normalizedPrompt)
  };
  if (candidate.parentVersion !== null && (!Number.isInteger(candidate.parentVersion) || candidate.parentVersion < 1)) {
    throw new Error('AGENT_PROMPT_OPTIMIZER_PARENT_VERSION_INVALID');
  }
  return Object.freeze(candidate);
};

const normalizeEvalCase = (entry, index) => {
  const id = String(entry?.id || `case-${index + 1}`).trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(id)) throw new Error(`AGENT_PROMPT_EVAL_CASE_INVALID:${id}`);
  const input = String(entry?.input || '').trim();
  if (!input) throw new Error(`AGENT_PROMPT_EVAL_CASE_INPUT_REQUIRED:${id}`);
  const expectedRoute = String(entry?.expectedRoute || '').trim();
  const allowedTools = [...new Set((Array.isArray(entry?.allowedTools) ? entry.allowedTools : [])
    .map((tool) => String(tool || '').trim()).filter(Boolean))];
  const forbiddenTools = [...new Set((Array.isArray(entry?.forbiddenTools) ? entry.forbiddenTools : [])
    .map((tool) => String(tool || '').trim()).filter(Boolean))];
  if (allowedTools.some((tool) => forbiddenTools.includes(tool))) {
    throw new Error(`AGENT_PROMPT_EVAL_CASE_TOOL_CONFLICT:${id}`);
  }
  return Object.freeze({
    id,
    input,
    expectedRoute,
    allowedTools,
    forbiddenTools,
    acceptanceCriteria: [...new Set((Array.isArray(entry?.acceptanceCriteria) ? entry.acceptanceCriteria : [])
      .map((criterion) => String(criterion || '').trim()).filter(Boolean))]
  });
};

const splitEvalCases = (entries, { validationRatio = DEFAULT_VALIDATION_RATIO, seed = 'artigen-prompt-v1' } = {}) => {
  if (!Array.isArray(entries) || entries.length < 2) throw new Error('AGENT_PROMPT_EVAL_CASES_REQUIRED');
  const ratio = Number(validationRatio);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 0.5) throw new Error('AGENT_PROMPT_VALIDATION_RATIO_INVALID');
  const cases = entries.map(normalizeEvalCase);
  const ranked = cases.map((entry) => ({
    entry,
    key: sha256(`${seed}:${entry.id}`)
  })).sort((a, b) => a.key.localeCompare(b.key));
  const validationCount = Math.max(1, Math.min(cases.length - 1, Math.round(cases.length * ratio)));
  const validationIds = new Set(ranked.slice(0, validationCount).map(({ entry }) => entry.id));
  return Object.freeze({
    train: cases.filter((entry) => !validationIds.has(entry.id)),
    validation: cases.filter((entry) => validationIds.has(entry.id)),
    seed,
    validationRatio: ratio
  });
};

const safetyContract = ({ textModel = TEXT_MODEL, imageModel = IMAGE_MODEL } = {}) => ({
  textModel,
  imageModel,
  requiredMarkers: ['authoritative', 'untrusted', 'server-granted tools'],
  forbiddenMarkers: ['reveal chain of thought', 'ignore server permissions', 'use another image model']
});

const validatePromptCandidate = (candidate, { contract = safetyContract() } = {}) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return Object.freeze({ ok: false, code: 'AGENT_PROMPT_CANDIDATE_SCHEMA_INVALID', reason: 'object_required' });
  }
  const allowedFields = new Set(['version', 'parentVersion', 'summary', 'prompt', 'contentHash']);
  const unknown = Object.keys(candidate).filter((key) => !allowedFields.has(key));
  if (unknown.length) {
    return Object.freeze({ ok: false, code: 'AGENT_PROMPT_CANDIDATE_SCHEMA_INVALID', reason: `unknown_field:${unknown[0]}` });
  }
  if (!Number.isInteger(candidate.version) || candidate.version < 1 ||
    (candidate.parentVersion !== null && candidate.parentVersion !== undefined &&
      (!Number.isInteger(candidate.parentVersion) || candidate.parentVersion < 1)) ||
    (candidate.summary !== undefined && String(candidate.summary).length > 240)) {
    return Object.freeze({ ok: false, code: 'AGENT_PROMPT_CANDIDATE_SCHEMA_INVALID', reason: 'metadata_invalid' });
  }
  const prompt = normalizePrompt(candidate?.prompt);
  if (candidate.contentHash && candidate.contentHash !== sha256(prompt)) {
    return Object.freeze({ ok: false, code: 'AGENT_PROMPT_CANDIDATE_SCHEMA_INVALID', reason: 'content_hash_mismatch' });
  }
  const lower = prompt.toLowerCase();
  const missing = contract.requiredMarkers.filter((marker) => !lower.includes(String(marker).toLowerCase()));
  const forbidden = contract.forbiddenMarkers.filter((marker) => lower.includes(String(marker).toLowerCase()));
  if (missing.length || forbidden.length) {
    return Object.freeze({ ok: false, code: 'AGENT_PROMPT_CANDIDATE_SAFETY_FAILED', missing, forbidden });
  }
  return Object.freeze({ ok: true, contentHash: sha256(prompt), model: contract.textModel });
};

const buildCandidatesFromFailures = ({ baseline, failures = [] } = {}) => {
  const base = createPromptCandidate({ ...baseline, version: 1, parentVersion: null });
  const seen = new Set([base.contentHash]);
  const candidates = [];
  for (const failure of failures) {
    const code = String(failure?.code || '').trim();
    const hint = KNOWN_FAILURE_HINTS[code];
    if (!hint) continue;
    const prompt = `${base.prompt}\nFailure guard (${code}): ${hint}`;
    const candidate = createPromptCandidate({
      prompt,
      version: candidates.length + 2,
      parentVersion: 1,
      summary: `Guard ${code}`
    });
    if (!seen.has(candidate.contentHash)) {
      candidates.push(candidate);
      seen.add(candidate.contentHash);
    }
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
};

const aggregateScores = (scores) => {
  const values = scores.filter((score) => Number.isFinite(score?.quality));
  if (!values.length) return { quality: 0, safety: 0, cost: 0, latencyMs: 0, cases: 0 };
  const sum = (field) => values.reduce((total, value) => total + (Number(value[field]) || 0), 0);
  return {
    quality: sum('quality') / values.length,
    safety: sum('safety') / values.length,
    cost: sum('cost') / values.length,
    latencyMs: sum('latencyMs') / values.length,
    cases: values.length
  };
};

const runPromptOptimization = async ({
  baseline,
  candidates = [],
  cases,
  evaluate,
  budget = 50,
  validationRatio = DEFAULT_VALIDATION_RATIO,
  seed = 'artigen-prompt-v1',
  contract = safetyContract()
} = {}) => {
  if (typeof evaluate !== 'function') throw new TypeError('AGENT_PROMPT_EVALUATOR_REQUIRED');
  const base = createPromptCandidate({ ...baseline, version: 1, parentVersion: null });
  const candidateList = candidates.slice(0, MAX_CANDIDATES).map((entry, index) => createPromptCandidate({
    ...entry,
    version: Number(entry.version || index + 2),
    parentVersion: entry.parentVersion ?? 1
  }));
  const split = splitEvalCases(cases, { validationRatio, seed });
  const allCandidates = [base, ...candidateList];
  const evaluations = [];
  let calls = 0;
  for (const candidate of allCandidates) {
    const safety = validatePromptCandidate(candidate, { contract });
    if (!safety.ok) {
      evaluations.push({ candidate, safety, train: null, validation: null, accepted: false });
      continue;
    }
    const trainScores = [];
    for (const entry of split.train) {
      if (++calls > budget) throw new Error('AGENT_PROMPT_OPTIMIZER_BUDGET_EXCEEDED');
      trainScores.push(await evaluate(candidate, entry, { split: 'train' }));
    }
    const validationScores = [];
    for (const entry of split.validation) {
      if (++calls > budget) throw new Error('AGENT_PROMPT_OPTIMIZER_BUDGET_EXCEEDED');
      validationScores.push(await evaluate(candidate, entry, { split: 'validation' }));
    }
    evaluations.push({
      candidate,
      safety,
      train: aggregateScores(trainScores),
      validation: aggregateScores(validationScores),
      accepted: false
    });
  }
  const baseResult = evaluations[0];
  if (!baseResult?.train || !baseResult?.validation) throw new Error('AGENT_PROMPT_BASELINE_INVALID');
  const accepted = evaluations.slice(1).filter((result) => (
    result.train && result.validation &&
    result.train.safety >= 1 && result.validation.safety >= 1 &&
    result.validation.quality > baseResult.validation.quality &&
    result.validation.cost <= baseResult.validation.cost
  )).sort((a, b) => b.validation.quality - a.validation.quality);
  if (accepted[0]) accepted[0].accepted = true;
  const winner = accepted[0] || baseResult;
  return Object.freeze({
    status: accepted[0] ? 'candidate_selected' : 'baseline_retained',
    winner: winner.candidate,
    baseline: baseResult,
    evaluations,
    budget: { maxCalls: budget, usedCalls: calls },
    split: { train: split.train.map((entry) => entry.id), validation: split.validation.map((entry) => entry.id) },
    reportHash: sha256({ winner: winner.candidate.contentHash, evaluations, split })
  });
};

module.exports = {
  DEFAULT_VALIDATION_RATIO,
  IMAGE_MODEL,
  MAX_CANDIDATES,
  TEXT_MODEL,
  aggregateScores,
  buildCandidatesFromFailures,
  createPromptCandidate,
  runPromptOptimization,
  safetyContract,
  sha256,
  splitEvalCases,
  validatePromptCandidate
};
