'use strict';

const { SKILLS } = require('../services/agent-skill-compiler');

const skills = Object.values(SKILLS);
if (!skills.length || new Set(skills.map((skill) => skill.id)).size !== skills.length) {
  throw new Error('AGENT_SKILL_MANIFEST_EMPTY_OR_DUPLICATE');
}
for (const skill of skills) {
  if (!/^[a-f0-9]{64}$/.test(skill.contentHash)) {
    throw new Error(`AGENT_SKILL_HASH_INVALID:${skill.id}`);
  }
}
process.stdout.write(JSON.stringify({
  ok: true,
  schemaVersion: 1,
  skills: skills.map(({ id, version, contentHash }) => ({ id, version, contentHash }))
}, null, 2) + '\n');
