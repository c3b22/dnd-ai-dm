import { describe, it, expect } from 'vitest';
import {
  baseMaxHp,
  effectiveMaxHp,
  levelDamageBonus,
  levelForXp,
  levelHpBonus,
  xpProgress,
} from './leveling';

describe('levelForXp', () => {
  it('maps XP to levels at the thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(59)).toBe(1);
    expect(levelForXp(60)).toBe(2);
    expect(levelForXp(149)).toBe(2);
    expect(levelForXp(150)).toBe(3);
    expect(levelForXp(1619)).toBe(9);
    expect(levelForXp(1620)).toBe(10);
    expect(levelForXp(99999)).toBe(10);
  });
});

describe('level bonuses', () => {
  it('gives +5 max HP per level above 1', () => {
    expect(levelHpBonus(1)).toBe(0);
    expect(levelHpBonus(2)).toBe(5);
    expect(levelHpBonus(10)).toBe(45);
  });

  it('gives +1 damage every second level starting at 3', () => {
    expect([1, 2, 3, 4, 5, 9, 10].map(levelDamageBonus)).toEqual([0, 0, 1, 1, 2, 4, 4]);
  });
});

describe('effective and base max HP', () => {
  it('adds and removes the level bonus', () => {
    expect(effectiveMaxHp(20, 150)).toBe(30);
    expect(baseMaxHp(30, 150)).toBe(20);
  });

  it('round-trips at several XP values', () => {
    for (const xp of [0, 60, 1620]) expect(baseMaxHp(effectiveMaxHp(17, xp), xp)).toBe(17);
  });
});

describe('xpProgress', () => {
  it('reports progress toward the next level', () => {
    expect(xpProgress(0)).toEqual({ level: 1, into: 0, span: 60 });
    expect(xpProgress(100)).toEqual({ level: 2, into: 40, span: 90 });
  });

  it('is null at the max level', () => {
    expect(xpProgress(1620)).toBeNull();
  });
});
