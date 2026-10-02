import { describe, it, expect } from 'vitest';
import { isGoldViolation, isInventoryConflict } from './errors';

describe('isGoldViolation', () => {
  it('matches the players.gold check constraint specifically', () => {
    expect(isGoldViolation({ code: '23514', message: 'new row for relation "players" violates check constraint "players_gold_check"' })).toBe(true);
  });

  it('does not match a different check constraint, even with the same code', () => {
    expect(isGoldViolation({ code: '23514', message: 'new row for relation "inventory_items" violates check constraint "inventory_items_quantity_check"' })).toBe(false);
  });

  it('does not match a different error code or no error', () => {
    expect(isGoldViolation({ code: 'EC001', message: 'players_gold_check' })).toBe(false);
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
