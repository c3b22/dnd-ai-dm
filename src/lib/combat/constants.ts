// C8: every number of the automatic combat formula lives here so it can be tuned in one place.
// These are starting values that have not been play-tested yet.
import type { EnemyTier } from '@/lib/character/tags';

/** A player's attack hits when the d20 is at least this (nat 1 always misses, nat 20 always hits). */
export const HIT_THRESHOLD: Record<EnemyTier, number> = { minion: 6, normal: 9, strong: 12, boss: 15 };

/** Pips a normal hit removes. */
export const HIT_PIPS = 1;
/** Pips a heavy blow (big damage roll or natural 20) removes. */
export const HEAVY_PIPS = 2;
/** A damage roll at or above this share of the weapon's maximum dice damage is a heavy blow. */
export const HEAVY_DAMAGE_RATIO = 0.75;

/** Fixed damage an enemy deals to a player before armor; no enemy-side roll. */
export const ENEMY_DAMAGE: Record<EnemyTier, number> = { minion: 2, normal: 4, strong: 6, boss: 8 };
/** Armor can never reduce an enemy hit below this. */
export const MIN_ENEMY_DAMAGE = 1;
