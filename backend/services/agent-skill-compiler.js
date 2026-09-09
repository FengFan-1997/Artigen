'use strict';

const crypto = require('node:crypto');
const manifest = require('../agent-skills/manifest.json');

const REQUIRED_FIELDS = [
  'id', 'version', 'description', 'triggers', 'requiredCapabilities',
  'allowedTools', 'phases', 'outputContract', 'validators', 'retryRule',
  'stopRule', 'positiveExample', 'negativeExample'
];
const ID_RE = /^[a-z][a-z0-9-]{1,79}$/;
const KNOWN_PHASES = new Set(['research', 'production', 'verification', 'completion']);
const KNOWN_TOOLS = new Set([
  'update_plan', 'delegate_tasks', 'sandbox_shell', 'declare_artifact',
  'request_user_approval', 'browser_dom', 'connector_request', 'generate_image'
]);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

const contentHash = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

const normalizeList = (value, field, id) => {
  if (!Array.isArray(value) || value.length === 0 && field !== 'requiredCapabilities') {
    throw new Error(`AGENT_SKILL_MANIFEST_INVALID:${id}:${field}`);
  }
  const values = value.map((entry) => String(entry || '').trim()).filter(Boolean);
  if (values.length !== value.length || new Set(values).size !== values.length) {
    throw new Error(`AGENT_SKILL_MANIFEST_INVALID:${id}:${field}`);
  }
  return values;
};

const normalizeSkill = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('AGENT_SKILL_MANIFEST_INVALID:entry');
  }
  const id = String(raw.id || '').trim();
  if (!ID_RE.test(id) || !Number.isInteger(raw.version) || raw.version < 1) {
    throw new Error(`AGENT_SKILL_MANIFEST_INVALID:${id || 'entry'}:identity`);
  }
  const unknown = Object.keys(raw).filter((key) => !REQUIRED_FIELDS.includes(key) && key !== 'requiredAnyCapabilities');
  if (unknown.length) throw new Error(`AGENT_SKILL_MANIFEST_INVALID:${id}:${unknown[0]}`);
  const strings = ['description', 'outputContract', 'retryRule', 'stopRule', 'positiveExample', 'negativeExample'];
  for (const field of strings) {
    if (typeof raw[field] !== 'string' || !raw[field].trim()) {
      throw new Error(`AGENT_SKILL_MANIFEST_INVALID:${id}:${field}`);
    }
  }
  const skill = {
    id,
    version: raw.version,
    description: raw.description.trim(),
    triggers: normalizeList(raw.triggers, 'triggers', id),
    requiredCapabilities: normalizeList(raw.requiredCapabilities, 'requiredCapabilities', id),
    ...(raw.requiredAnyCapabilities ? {
      requiredAnyCapabilities: normalizeList(raw.requiredAnyCapabilities, 'requiredAnyCapabilities', id)
    } : {}),
    allowedTools: normalizeList(raw.allowedTools, 'allowedTools', id),
    phases: normalizeList(raw.phases, 'phases', id),
    outputContract: raw.outputContract.trim(),
    validators: normalizeList(raw.validators, 'validators', id),
    retryRule: raw.retryRule.trim(),
    stopRule: raw.stopRule.trim(),
    positiveExample: raw.positiveExample.trim(),
    negativeExample: raw.negativeExample.trim()
  };
  if (skill.phases.some((phase) => !KNOWN_PHASES.has(phase))) {
    throw new Error(`AGENT_SKILL_MANIFEST_INVALID:${id}:phases`);
  }
  if (skill.allowedTools.some((tool) => !KNOWN_TOOLS.has(tool))) {
    throw new Error(`AGENT_SKILL_MANIFEST_INVALID:${id}:allowedTools`);
  }
  return Object.freeze({ ...skill, contentHash: contentHash(skill) });
};

const compileSkillManifest = (source = manifest) => {
  if (!source || source.schemaVersion !== 1 || !Array.isArray(source.skills)) {
    throw new Error('AGENT_SKILL_MANIFEST_INVALID:root');
  }
  const compiled = source.skills.map(normalizeSkill);
  const ids = new Set();
  for (const skill of compiled) {
    if (ids.has(skill.id)) throw new Error(`AGENT_SKILL_MANIFEST_DUPLICATE:${skill.id}`);
    ids.add(skill.id);
  }
  return Object.freeze(Object.fromEntries(compiled.map((skill) => [skill.id, skill])));
};

const renderSkillReference = (skill) => [
  `# ${skill.id}@${skill.version}`,
  '',
  skill.description,
  '',
  `## Triggers\n\n${skill.triggers.join(', ')}`,
  `## Output contract\n\n${skill.outputContract}`,
  `## Validators\n\n${skill.validators.map((entry) => `- ${entry}`).join('\n')}`,
  `## Retry rule\n\n${skill.retryRule}`,
  `## Stop rule\n\n${skill.stopRule}`,
  `## Example\n\n${skill.positiveExample}`,
  `## Anti-example\n\n${skill.negativeExample}`
].join('\n');

const SKILLS = compileSkillManifest();

module.exports = {
  SKILLS,
  compileSkillManifest,
  contentHash,
  renderSkillReference
};
