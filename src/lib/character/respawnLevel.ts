import { levelForXp } from './leveling';

/** Level a respawned character starts at: average level of friends who are not dead, rounded down, min 1. */
export function respawnLevel(livingFriends: { xp?: number | null }[]): number {
  if (livingFriends.length === 0) return 1;
  const total = livingFriends.reduce((sum, p) => sum + levelForXp(Number(p.xp ?? 0)), 0);
  return Math.max(1, Math.floor(total / livingFriends.length));
}
