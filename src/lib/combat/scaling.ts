// Q2: enemies grow with the party. The server scales every enemy attack by the average level of the team,
// so a boss at level 5-8 is no longer a pushover: to-hit and flat damage scale at attack time, and a new enemy
// starts with more pips (the scaled maxPip is stored in the encounter). Formula and reasons: docs/combat-balance.md.
import { levelForXp } from '@/lib/character/leveling';
import type { Character } from '@/lib/character/types';
import type { EnemyTier } from '@/lib/character/tags';
import { MAX_LEVEL } from '@/lib/character/constants';
import { ENEMY_LEVEL_ATTACK_EVERY, ENEMY_LEVEL_DAMAGE_EVERY, ENEMY_LEVEL_PIP_PERCENT, TIER_PIPS } from './constants';

/** Average level of the party, rounded, at least 1. Dead characters do not count (unless nobody is alive); downed ones do. */
export function teamLevel(characters: readonly Character[]): number {
  const alive = characters.filter((c) => c.status !== 'dead');
  const list = alive.length > 0 ? alive : characters;
  if (list.length === 0) return 1;
  const sum = list.reduce((n, c) => n + levelForXp(c.xp ?? 0), 0);
  return Math.max(1, Math.round(sum / list.length));
}

/** Extra attack bonus and flat damage every enemy gets against a team of this level (0 at level 1). */
export function enemyLevelBonus(level: number): { attack: number; damage: number } {
  const steps = Math.max(0, level - 1);
  return { attack: Math.floor(steps / ENEMY_LEVEL_ATTACK_EVERY), damage: Math.floor(steps / ENEMY_LEVEL_DAMAGE_EVERY) };
}

/** Pips a new enemy of this tier starts with against a team of this level (the I6 base value at level 1). */
export function scaledPips(tier: EnemyTier, level: number): number {
  const base = TIER_PIPS[tier];
  return base + Math.round((base * Math.max(0, level - 1) * ENEMY_LEVEL_PIP_PERCENT) / 100);
}

/** The most pips an enemy of this tier can ever have (used to validate a stored encounter). */
export const maxScaledPips = (tier: EnemyTier): number => scaledPips(tier, MAX_LEVEL);
