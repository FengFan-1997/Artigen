const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildIngredientLabelPrompt,
  validateIngredientOutputTrace
} = require('../lib/ingredient-source-validator');

test('ingredient prompt prohibits invented facts', () => {
  const prompt = buildIngredientLabelPrompt({ userText: 'Water, glycerin', productType: 'Cosmetic' });
  assert.match(prompt, /copied verbatim/i);
  assert.match(prompt, /Never infer/i);
  assert.doesNotMatch(prompt, /generate realistic/i);
});

test('ingredient trace accepts source spans and rejects additions', () => {
  assert.equal(validateIngredientOutputTrace({
    layoutType: 'standard',
    sections: [{ title: 'INGREDIENTS', content: ['Water', 'glycerin'] }]
  }, 'Water, glycerin').ok, true);

  const invalid = validateIngredientOutputTrace({
    layoutType: 'standard',
    sections: [
      { title: 'INGREDIENTS', content: ['Water', 'glycerin', 'Tocopherol'] },
      { title: 'MANUFACTURER', content: 'Example Labs LLC' }
    ]
  }, 'Water, glycerin');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, 'INGREDIENT_SOURCE_MISMATCH');
  assert.deepEqual(invalid.invented, ['Tocopherol', 'Example Labs LLC']);
});
