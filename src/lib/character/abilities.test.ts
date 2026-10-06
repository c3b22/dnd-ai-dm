import { describe, it, expect } from 'vitest';
import { ABILITY_UPGRADE_LEVEL, archerRolls, clericHealTier, guardDivisor, rogueBonusDice } from './abilities';

describe('ability numbers', () => {
  it('upgrades at level 5', () => {
    expect(ABILITY_UPGRADE_LEVEL).toBe(5);
    expect([guardDivisor(4), guardDivisor(5)]).toEqual([2, 3]);
    expect([archerRolls(4), archerRolls(5)]).toEqual([2, 3]);
    expect([clericHealTier(4), clericHealTier(5)]).toEqual(['medium', 'heavy']);
    expect(rogueBonusDice(1)).toEqual({ count: 2, sides: 6, bonus: 0 });
    expect(rogueBonusDice(10)).toEqual({ count: 3, sides: 6, bonus: 0 });
  });
});
