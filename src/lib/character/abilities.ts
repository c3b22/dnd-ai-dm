import type { DiceSpec, HealTier } from './constants';

/** From this level on every class ability is stronger. */
export const ABILITY_UPGRADE_LEVEL = 5;

const upgraded = (level: number): boolean => level >= ABILITY_UPGRADE_LEVEL;

/** Guard: the warrior takes the redirected damage divided by this (rounded up). */
export const guardDivisor = (level: number): number => (upgraded(level) ? 3 : 2);

/** Precise Shot: how many times the weapon dice are rolled and summed. */
export const archerRolls = (level: number): number => (upgraded(level) ? 3 : 2);

export const clericHealTier = (level: number): Exclude<HealTier, 'light' | 'full'> =>
  upgraded(level) ? 'heavy' : 'medium';

/** Backstab: dice added on top of the weapon damage. */
export const rogueBonusDice = (level: number): DiceSpec => ({ count: upgraded(level) ? 3 : 2, sides: 6, bonus: 0 });
