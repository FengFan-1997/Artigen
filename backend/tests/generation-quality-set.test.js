const assert = require('node:assert/strict');
const test = require('node:test');

const qualitySet = require('../evaluation/ai-design-quality-set.json');

test('fixed generation quality set contains 30 balanced bilingual ecommerce cases', () => {
  assert.equal(qualitySet.version, 1);
  assert.equal(qualitySet.cases.length, 30);
  assert.equal(new Set(qualitySet.cases.map((entry) => entry.id)).size, 30);
  assert.equal(qualitySet.cases.filter((entry) => entry.locale === 'zh').length, 15);
  assert.equal(qualitySet.cases.filter((entry) => entry.locale === 'en').length, 15);
});

test('quality cases use only stable product profiles, ratios and semantic reference slots', () => {
  const allowedRatios = new Set(['1:1', '4:5', '3:4', '16:9', '9:16']);
  const allowedRoles = new Set(['product', 'style', 'scene']);
  for (const entry of qualitySet.cases) {
    assert.equal(entry.profileId, 'standard-v1', entry.id);
    assert.ok(allowedRatios.has(entry.aspectRatio), entry.id);
    assert.ok(entry.referenceRoles.length <= 1, entry.id);
    assert.equal(new Set(entry.referenceRoles).size, entry.referenceRoles.length, entry.id);
    assert.ok(entry.referenceRoles.every((role) => allowedRoles.has(role)), entry.id);
    assert.ok(entry.hardConstraints.length >= 3, entry.id);
    assert.ok(entry.manualCriteria.length >= 3, entry.id);
    assert.ok(entry.prompt.length >= 20, entry.id);
  }
});

test('quality set covers references, logo/text, material, hand-held product and all ratios', () => {
  const categories = new Set(qualitySet.cases.map((entry) => entry.category));
  for (const category of [
    'no-reference', 'single-reference', 'logo-text', 'material', 'person-hold'
  ]) {
    assert.ok(categories.has(category), category);
  }
  const ratios = new Set(qualitySet.cases.map((entry) => entry.aspectRatio));
  assert.deepEqual([...ratios].sort(), ['16:9', '1:1', '3:4', '4:5', '9:16']);
});
