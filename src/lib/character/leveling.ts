import { HP_PER_LEVEL, LEVEL_XP_THRESHOLDS, MAX_LEVEL, MILESTONE_XP, XP_TIERS } from './constants';
import type { CharacterTag } from './tags';
import type { Character } from './types';

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

/**
 * Pays the round's XP to every active player. Only the first xp tag and the first milestone tag
 * count. Level is derived from xp, so a gain is capped just below the threshold after next:
 * a player gains at most one level per round.
 */
export function applyXpTags(
  characters: Character[],
  tags: CharacterTag[]
): { characters: Character[]; changes: string[] } {
  const xpTag = tags.find((t) => t.kind === 'xp');
  const hasMilestone = tags.some((t) => t.kind === 'milestone');
  const gain = (xpTag?.kind === 'xp' ? XP_TIERS[xpTag.tier] : 0) + (hasMilestone ? MILESTONE_XP : 0);
  if (gain === 0) return { characters, changes: [] };

  const skipped = characters.filter((c) => c.status !== 'active').map((c) => c.displayName);
  if (skipped.length === characters.length) return { characters, changes: [] };
  const changes = [`ทุกคนได้ +${gain} XP${skipped.length > 0 ? ` ยกเว้น ${skipped.join(', ')}` : ''}`];
  const next = characters.map((c) => {
    if (c.status !== 'active') return c;
    const before = c.xp ?? 0;
    const level = levelForXp(before);
    const cap = level + 1 < MAX_LEVEL ? LEVEL_XP_THRESHOLDS[level + 1] - 1 : Infinity;
    const xp = Math.min(before + gain, cap);
    const gained = levelForXp(xp) - level;
    const updated = { ...c, xp };
    if (gained > 0) {
      updated.maxHp += HP_PER_LEVEL;
      updated.hp += HP_PER_LEVEL;
      const damage = levelDamageBonus(level + 1) - levelDamageBonus(level);
      changes.push(
        `${c.displayName} ขึ้นเลเวล ${level + 1} (max HP +${HP_PER_LEVEL}${damage > 0 ? `, ดาเมจ +${damage}` : ''})`
      );
    }
    return updated;
  });
  return { characters: next, changes };
}
