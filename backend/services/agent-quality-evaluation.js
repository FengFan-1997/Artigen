const fs = require('fs');
const path = require('path');
const {
  compileAgentPrompt,
  normalizeTaskSpec,
  selectAgentSkills
} = require('./agent-runtime-v2');

const capabilityObject = (values) => Object.fromEntries(
  (Array.isArray(values) ? values : []).map((value) => [String(value), true])
);

const unique = (values) => [...new Set(values.filter(Boolean))];

const compileQualityCase = ({ manifest, task, evaluationDir }) => {
  const defaults = manifest?.defaults || {};
  const deliverableRule = manifest?.deliverableRules?.[task?.deliverable];
  if (!deliverableRule) throw new Error(`${task?.id || '<unknown>'}: deliverable rule missing`);
  const capabilityRules = (Array.isArray(task.capabilities) ? task.capabilities : [])
    .map((capability) => manifest?.capabilityRules?.[capability])
    .filter(Boolean);
  const expectedSkillIds = unique([
    ...(deliverableRule.skillIds || []),
    ...capabilityRules.flatMap((rule) => rule.skillIds || [])
  ]);
  const expectedTools = unique([
    ...(deliverableRule.expectedTools || []),
    ...capabilityRules.flatMap((rule) => rule.expectedTools || [])
  ]);
  const fixedInputs = unique((task.acceptance || []).flatMap(
    (criterion) => manifest?.fixtureRules?.[criterion] || []
  ));
  const capabilities = capabilityObject(task.capabilities);
  const selectedSkills = selectAgentSkills({
    objective: task.objective,
    deliverables: [task.deliverable],
    capabilities,
    requestedSkillIds: expectedSkillIds
  });
  const selectedSkillIds = selectedSkills.map((skill) => skill.id);
  const toolsByPhase = Object.fromEntries(
    ['research', 'production', 'verification', 'completion'].map((phase) => [
      phase,
      compileAgentPrompt({
        objective: task.objective,
        deliverables: [task.deliverable],
        capabilities,
        taskSpec: { skillIds: expectedSkillIds },
        phase
      }).allowedToolNames
    ])
  );
  const availableTools = unique(Object.values(toolsByPhase).flat());
  const taskSpec = normalizeTaskSpec({
    goal: task.objective,
    complexity: 'high',
    confidence: 1,
    constraints: [],
    assumptions: [],
    deliverables: [task.deliverable],
    acceptanceCriteria: task.acceptance,
    allowedOrigins: [],
    skillIds: expectedSkillIds,
    budget: { maxCredits: task.maxCredits || defaults.maxCredits },
    plan: [
      { id: 'produce', label: 'Produce requested output', phase: 'production', status: 'pending' },
      { id: 'verify', label: 'Run deterministic verification', phase: 'verification', status: 'pending' }
    ]
  }, {
    objective: task.objective,
    deliverables: [task.deliverable],
    capabilities,
    maxCredits: task.maxCredits || defaults.maxCredits
  });
  return {
    ...task,
    expectedRoute: task.expectedRoute || defaults.expectedRoute,
    expectedSkillIds,
    expectedTools,
    forbiddenTools: unique([...(defaults.forbiddenTools || []), ...(task.forbiddenTools || [])]),
    deterministicValidators: unique([
      ...(deliverableRule.deterministicValidators || []),
      ...(task.deterministicValidators || [])
    ]),
    semanticRubric: task.semanticRubric || defaults.semanticRubric || [],
    maxModelTurns: Number(task.maxModelTurns || defaults.maxModelTurns),
    maxDurationMs: Number(task.maxDurationMs || defaults.maxDurationMs),
    maxCredits: Number(task.maxCredits || defaults.maxCredits),
    fixedInputs: fixedInputs.map((relativePath) => ({
      relativePath,
      absolutePath: path.resolve(evaluationDir, relativePath),
      exists: fs.existsSync(path.resolve(evaluationDir, relativePath))
    })),
    selectedSkillIds,
    toolsByPhase,
    availableTools,
    taskSpec
  };
};

const validateCompiledQualityCase = (entry) => {
  const errors = [];
  for (const skillId of entry.expectedSkillIds) {
    if (!entry.selectedSkillIds.includes(skillId)) errors.push(`missing expected skill ${skillId}`);
  }
  for (const tool of entry.expectedTools) {
    if (!entry.availableTools.includes(tool)) errors.push(`missing expected tool ${tool}`);
  }
  for (const tool of entry.forbiddenTools) {
    if (entry.availableTools.includes(tool)) errors.push(`forbidden tool exposed ${tool}`);
  }
  for (const input of entry.fixedInputs) {
    if (!input.exists) errors.push(`fixture missing ${input.relativePath}`);
  }
  if (entry.expectedRoute !== 'agent_run') errors.push(`unexpected route ${entry.expectedRoute}`);
  if (!entry.deterministicValidators.length) errors.push('deterministic validators missing');
  if (entry.semanticRubric.length < 3) errors.push('semantic rubric incomplete');
  if (!Number.isFinite(entry.maxModelTurns) || entry.maxModelTurns < 1) errors.push('max model turns invalid');
  if (!Number.isFinite(entry.maxDurationMs) || entry.maxDurationMs < 1000) errors.push('max duration invalid');
  if (!Number.isFinite(entry.maxCredits) || entry.maxCredits < 1) errors.push('max credits invalid');
  return errors;
};

module.exports = {
  capabilityObject,
  compileQualityCase,
  validateCompiledQualityCase
};
