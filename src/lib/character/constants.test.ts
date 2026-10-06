import { describe, it, expect } from 'vitest';
import { weaponFor, isStartingWeapon, diceLabel, TIERS, DEFAULT_WEAPON_ID } from './constants';

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

describe('isStartingWeapon', () => {
  it('accepts only the three starting weapons', () => {
    expect(isStartingWeapon('shortsword')).toBe(true);
    expect(isStartingWeapon('staff')).toBe(true);
    expect(isStartingWeapon('fists')).toBe(false);
    expect(isStartingWeapon(undefined)).toBe(false);
  });

  it('has a default that is itself a starting weapon', () => {
    expect(isStartingWeapon(DEFAULT_WEAPON_ID)).toBe(true);
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
