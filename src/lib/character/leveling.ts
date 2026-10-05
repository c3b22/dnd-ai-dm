import { HP_PER_LEVEL, LEVEL_XP_THRESHOLDS, MAX_LEVEL } from './constants';

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < MAX_LEVEL; i++) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

export function levelHpBonus(level: number): number {
  return (level - 1) * HP_PER_LEVEL;
}

export function levelDamageBonus(level: number): number {
  return Math.floor((level - 1) / 2);
}

/** players.max_hp is the base (revive-adjusted) value; this is what the character really has. */
export function effectiveMaxHp(baseMax: number, xp: number): number {
  return baseMax + levelHpBonus(levelForXp(xp));
}

export function baseMaxHp(effectiveMax: number, xp: number): number {
  return effectiveMax - levelHpBonus(levelForXp(xp));
}

/** XP earned toward, and needed for, the next level; null at the max level. */
export function xpProgress(xp: number): { level: number; into: number; span: number } | null {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return null;
  const start = LEVEL_XP_THRESHOLDS[level - 1];
  const next = LEVEL_XP_THRESHOLDS[level];
  return { level, into: xp - start, span: next - start };
}
