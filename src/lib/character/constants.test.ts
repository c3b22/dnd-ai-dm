import { describe, it, expect } from 'vitest';
import { weaponFor, diceLabel, TIERS, abilityModifier, normalizeAbilities } from './constants';

describe('weaponFor', () => {
  it('returns the named weapon', () => {
    expect(weaponFor('shortbow')).toMatchObject({ id: 'shortbow', nameTh: 'ธนูสั้น' });
  });

  it('falls back to bare hands for null, unknown and prototype-key ids', () => {
    expect(weaponFor(null).id).toBe('fists');
    expect(weaponFor('lightsaber').id).toBe('fists');
    expect(weaponFor('constructor').id).toBe('fists');
  });
});

describe('diceLabel', () => {
  it('prints count, sides and bonus', () => {
    expect(diceLabel(TIERS.light)).toBe('1d4');
    expect(diceLabel(TIERS.medium)).toBe('1d6+1');
    expect(diceLabel(TIERS.heavy)).toBe('2d6');
  });
});

describe('dagger', () => {
  it('is a 1d4 weapon', () => {
    expect(weaponFor('dagger')).toMatchObject({ id: 'dagger', nameTh: 'กริช', dice: { count: 1, sides: 4, bonus: 0 } });
  });
});

describe('abilityModifier', () => {
  it('is floor((score - 10) / 2)', () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(20)).toBe(5);
  });
});

describe('normalizeAbilities', () => {
  it('defaults every score to 10 for missing or invalid input', () => {
    const all10 = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    expect(normalizeAbilities(null)).toEqual(all10);
    expect(normalizeAbilities(undefined)).toEqual(all10);
    expect(normalizeAbilities('x')).toEqual(all10);
    expect(normalizeAbilities([])).toEqual(all10);
  });

  it('keeps valid scores and fills the rest with 10', () => {
    expect(normalizeAbilities({ STR: 16, DEX: 'high', CON: NaN, WIS: 7.6 })).toEqual({
      STR: 16, DEX: 10, CON: 10, INT: 10, WIS: 8, CHA: 10,
    });
  });
});
