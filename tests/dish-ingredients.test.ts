import { describe, it, expect } from 'vitest';
import { validateIngredientRows } from '../src/modules/dishes/routes.js';

// Regression tests: invalid/duplicate ingredient rows must become 400 form
// errors instead of crashing the POST handler with a 500 (PK/FK violation).
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

describe('validateIngredientRows', () => {
  it('passes valid rows through unchanged', () => {
    const { rows, errors } = validateIngredientRows([
      { ingredientId: ID_A, quantity: 150, unit: 'g' },
      { ingredientId: ID_B, quantity: 2, unit: 'cai' },
    ]);
    expect(errors).toEqual({});
    expect(rows).toHaveLength(2);
  });

  it('accepts an empty recipe (no rows)', () => {
    const { rows, errors } = validateIngredientRows([]);
    expect(errors).toEqual({});
    expect(rows).toEqual([]);
  });

  it('rejects a duplicated ingredient instead of violating the PK', () => {
    const { rows, errors } = validateIngredientRows([
      { ingredientId: ID_A, quantity: 150, unit: 'g' },
      { ingredientId: ID_A, quantity: 50, unit: 'g' },
    ]);
    expect(errors['ingredients']).toMatch(/trùng/);
    expect(rows).toHaveLength(1);
  });

  it('rejects a non-UUID ingredient id', () => {
    const { rows, errors } = validateIngredientRows([
      { ingredientId: 'not-a-uuid', quantity: 100, unit: 'g' },
    ]);
    expect(errors['ingredients']).toBeDefined();
    expect(rows).toHaveLength(0);
  });

  it('rejects a quantity below the 0.01 minimum', () => {
    const { rows, errors } = validateIngredientRows([
      { ingredientId: ID_A, quantity: 0, unit: 'g' },
    ]);
    expect(errors['ingredients']).toBeDefined();
    expect(rows).toHaveLength(0);
  });

  it('rejects a unit longer than 30 characters', () => {
    const { rows, errors } = validateIngredientRows([
      { ingredientId: ID_A, quantity: 100, unit: 'x'.repeat(31) },
    ]);
    expect(errors['ingredients']).toBeDefined();
    expect(rows).toHaveLength(0);
  });

  it('accepts deterministic seeded UUIDs', () => {
    const seededId = '00000000-0000-0000-0000-000000000001';
    const { rows, errors } = validateIngredientRows([
      { ingredientId: seededId, quantity: 100, unit: 'g' },
    ]);
    expect(errors).toEqual({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ingredientId).toBe(seededId);
  });
});
