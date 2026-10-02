import { describe, it, expect } from 'vitest';
import { isGoldViolation, isInventoryConflict } from './errors';

describe('isGoldViolation', () => {
  it('matches only the Postgres check_violation code', () => {
    expect(isGoldViolation({ code: '23514' })).toBe(true);
    expect(isGoldViolation({ code: 'EC001' })).toBe(false);
    expect(isGoldViolation(null)).toBe(false);
  });
});

describe('isInventoryConflict', () => {
  it('matches only the apply_changes concurrency error code', () => {
    expect(isInventoryConflict({ code: 'EC001' })).toBe(true);
    expect(isInventoryConflict({ code: '23514' })).toBe(false);
    expect(isInventoryConflict(null)).toBe(false);
  });
});
