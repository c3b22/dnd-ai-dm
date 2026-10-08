import { describe, expect, it } from 'vitest';
import { LEVEL_XP_THRESHOLDS } from '@/lib/character/constants';
import type { Character } from '@/lib/character/types';
import { enemyLevelBonus, maxScaledPips, scaledPips, teamLevel } from './scaling';

const at = (level: number, status: Character['status'] = 'active'): Character =>
  ({ id: `p${level}${status}`, displayName: 'P', status, xp: LEVEL_XP_THRESHOLDS[level - 1], hp: 10, maxHp: 20 }) as Character;

describe('Q2 teamLevel', () => {
  it('is the rounded average level of the party, at least 1', () => {
    expect(teamLevel([at(1)])).toBe(1);
    expect(teamLevel([at(3), at(5)])).toBe(4);
    expect(teamLevel([at(1), at(2)])).toBe(2); // 1.5 rounds up
    expect(teamLevel([])).toBe(1);
  });
  it('ignores dead characters (unless nobody is alive) and counts downed ones', () => {
    expect(teamLevel([at(5), at(1, 'dead')])).toBe(5);
    expect(teamLevel([at(5), at(3, 'downed')])).toBe(4);
    expect(teamLevel([at(4, 'dead')])).toBe(4);
  });
  it('treats missing xp as level 1', () => {
    expect(teamLevel([{ id: 'x', displayName: 'X', status: 'active', hp: 1, maxHp: 1 } as Character])).toBe(1);
  });
});

describe('Q2 enemyLevelBonus', () => {
  it('is zero at level 1 so low-level fights keep the I6 numbers', () => {
    expect(enemyLevelBonus(1)).toEqual({ attack: 0, damage: 0 });
  });
  it('grows with the level and never goes negative', () => {
    expect(enemyLevelBonus(0)).toEqual({ attack: 0, damage: 0 });
    const a = enemyLevelBonus(3);
    const b = enemyLevelBonus(8);
    expect(b.attack).toBeGreaterThan(a.attack);
    expect(b.damage).toBeGreaterThan(a.damage);
  });
});

describe('Q2 scaledPips', () => {
  it('is the I6 base value at level 1', () => {
    expect([scaledPips('minion', 1), scaledPips('normal', 1), scaledPips('strong', 1), scaledPips('boss', 1)]).toEqual([2, 4, 6, 10]);
  });
  it('adds 35% of the base per level above 1, rounded', () => {
    expect(scaledPips('boss', 3)).toBe(17);
    expect(scaledPips('boss', 8)).toBe(35);
    expect(scaledPips('normal', 5)).toBe(10);
    expect(scaledPips('minion', 8)).toBe(7);
  });
  it('maxScaledPips is the level 10 value and a level below 1 never goes under the base', () => {
    expect(scaledPips('boss', 99)).toBeGreaterThan(maxScaledPips('boss'));
    expect(scaledPips('boss', 0)).toBe(10);
    expect(maxScaledPips('boss')).toBe(scaledPips('boss', 10));
  });
});
