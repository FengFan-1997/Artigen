'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SKILLS,
  compileSkillManifest,
  renderSkillReference
} = require('../services/agent-skill-compiler');

test('canonical manifest compiles all production skills with stable hashes', () => {
  assert.ok(Object.keys(SKILLS).length >= 8);
  for (const skill of Object.values(SKILLS)) {
    assert.match(skill.id, /^[a-z][a-z0-9-]+$/);
    assert.match(skill.contentHash, /^[a-f0-9]{64}$/);
    assert.match(renderSkillReference(skill), new RegExp(`^# ${skill.id}@${skill.version}`));
  }
});

test('manifest compiler rejects duplicate and unknown fields', () => {
  const { contentHash: _hash, ...manifestSkill } = Object.values(SKILLS)[0];
  const source = {
    schemaVersion: 1,
    skills: [{
      ...manifestSkill,
      unexpected: true
    }]
  };
  assert.throws(() => compileSkillManifest(source), /AGENT_SKILL_MANIFEST_INVALID/);
  assert.throws(() => compileSkillManifest({
    schemaVersion: 1,
    skills: [manifestSkill, manifestSkill]
  }), /AGENT_SKILL_MANIFEST_DUPLICATE/);
});
