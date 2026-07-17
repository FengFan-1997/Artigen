import { describe, expect, it } from 'vitest';
import { validateIngredientSourceTrace } from './ingredientSourceTrace';

describe('validateIngredientSourceTrace', () => {
  it('rejects a single AI-added fact', () => {
    expect(
      validateIngredientSourceTrace(
        { sections: [{ title: 'INGREDIENTS', content: ['Water', 'Vitamin E'] }] },
        'Water'
      )
    ).toBe(false);
  });

  it('accepts reordered exact source spans', () => {
    expect(
      validateIngredientSourceTrace(
        { sections: [{ title: 'INGREDIENTS', content: ['glycerin', 'Water'] }] },
        'Water, glycerin'
      )
    ).toBe(true);
  });
});
