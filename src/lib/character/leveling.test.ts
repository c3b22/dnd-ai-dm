import { describe, it, expect } from 'vitest';
import type { Character } from './types';
import {
  abilityChoicesAvailable,
  applyAbilityChoice,
  applyXpTags,
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

function char(over: Partial<Character> = {}): Character {
  return { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, ...over };
}

describe('applyXpTags', () => {
  it('gives the tier XP to an active player and reports it', () => {
    const result = applyXpTags([char({ xp: 0 })], [{ kind: 'xp', tier: 'small' }]);
    expect(result.characters[0].xp).toBe(10);
    expect(result.changes).toEqual(['ทุกคนได้ +10 XP']);
  });

  it('counts only the first xp tag and the first milestone tag', () => {
    const result = applyXpTags(
      [char()],
      [
        { kind: 'xp', tier: 'small' },
        { kind: 'xp', tier: 'large' },
        { kind: 'milestone' },
        { kind: 'milestone' },
      ]
    );
    expect(result.characters[0].xp).toBe(110);
  });

  it('does nothing without xp tags', () => {
    const input = [char()];
    const result = applyXpTags(input, [{ kind: 'sanctuary' }]);
    expect(result.characters).toEqual(input);
    expect(result.changes).toEqual([]);
  });

  it('caps a gain at one level, raising max HP and HP by the bonus', () => {
    const result = applyXpTags([char({ xp: 50, hp: 15, maxHp: 20 })], [{ kind: 'milestone' }]);
    const c = result.characters[0];
    expect(c.xp).toBe(149);
    expect(levelForXp(c.xp!)).toBe(2);
    expect(c.maxHp).toBe(25);
    expect(c.hp).toBe(20);
    expect(result.changes.some((line) => line.includes('ขึ้นเลเวล 2'))).toBe(true);
    const next = applyXpTags(result.characters, [{ kind: 'xp', tier: 'small' }]);
    expect(next.characters[0].xp).toBe(159);
    expect(next.characters[0].maxHp).toBe(30);
  });

  it('names the downed players it skipped in the log line', () => {
    const party = [
      char({ status: 'downed', hp: 0 }),
      char({ id: 'p2', displayName: 'Suki' }),
      char({ id: 'p3', displayName: 'Mila', status: 'downed', hp: 0 }),
    ];
    const result = applyXpTags(party, [{ kind: 'xp', tier: 'medium' }]);
    expect(result.changes).toEqual(['ทุกคนได้ +25 XP ยกเว้น Prem, Mila']);
  });

  it('tells a player whose XP was held back by the one-level-per-round cap how much they really got', () => {
    const party = [char({ xp: 50 }), char({ id: 'p2', displayName: 'Suki', xp: 0 })];
    const result = applyXpTags(party, [{ kind: 'milestone' }]);
    expect(result.characters[0].xp).toBe(149);
    expect(result.changes).toContain('Prem ได้ XP เพียง +99 (ขึ้นเลเวลได้ครั้งละหนึ่งขั้นต่อรอบ)');
    expect(result.changes.some((line) => line.startsWith('Suki ได้ XP เพียง'))).toBe(false);
  });

  it('gives nothing and logs nothing when nobody is active', () => {
    const party = [char({ status: 'downed', hp: 0 })];
    const result = applyXpTags(party, [{ kind: 'milestone' }]);
    expect(result.characters).toEqual(party);
    expect(result.changes).toEqual([]);
  });

  it('gives a downed player nothing but still pays the active ones', () => {
    const result = applyXpTags(
      [char({ status: 'downed', hp: 0 }), char({ id: 'p2', displayName: 'Suki' })],
      [{ kind: 'xp', tier: 'medium' }]
    );
    expect(result.characters[0].xp ?? 0).toBe(0);
    expect(result.characters[0].hp).toBe(0);
    expect(result.characters[1].xp).toBe(25);
  });

  it('lets a level 9 player reach level 10 without a NaN cap', () => {
    const result = applyXpTags([char({ xp: 1400, maxHp: 60, hp: 50 })], [{ kind: 'milestone' }]);
    const c = result.characters[0];
    expect(c.xp).toBe(1500);
    expect(c.xp).not.toBeNaN();
    expect(c.maxHp).toBe(60);
    const again = applyXpTags([char({ xp: 1319, maxHp: 55, hp: 55 })], [{ kind: 'xp', tier: 'small' }]);
    expect(levelForXp(again.characters[0].xp!)).toBe(9);
    expect(again.characters[0].maxHp).toBe(60);
  });

  it('keeps adding XP at the max level without changing HP', () => {
    const result = applyXpTags([char({ xp: 1620, maxHp: 65, hp: 40 })], [{ kind: 'xp', tier: 'large' }]);
    expect(result.characters[0]).toMatchObject({ xp: 1670, maxHp: 65, hp: 40 });
  });

  it('does not mutate its input', () => {
    const input = [char()];
    applyXpTags(input, [{ kind: 'xp', tier: 'small' }]);
    expect(input[0].xp).toBeUndefined();
  });
});

describe('abilityChoicesAvailable', () => {
  it('earns one at level 4 and one at level 8', () => {
    expect(abilityChoicesAvailable(1, 0)).toBe(0);
    expect(abilityChoicesAvailable(3, 0)).toBe(0);
    expect(abilityChoicesAvailable(4, 0)).toBe(1);
    expect(abilityChoicesAvailable(7, 0)).toBe(1);
    expect(abilityChoicesAvailable(8, 0)).toBe(2);
    expect(abilityChoicesAvailable(10, 0)).toBe(2);
  });
  it('subtracts used and never goes negative', () => {
    expect(abilityChoicesAvailable(8, 1)).toBe(1);
    expect(abilityChoicesAvailable(8, 2)).toBe(0);
    expect(abilityChoicesAvailable(4, 5)).toBe(0);
    expect(abilityChoicesAvailable(8, -1)).toBe(2);
  });
});

describe('applyAbilityChoice', () => {
  const base = { STR: 10, DEX: 12, CON: 14, INT: 8, WIS: 19, CHA: 20 };
  it('adds +2 to a single ability without mutating', () => {
    const r = applyAbilityChoice(base, { kind: 'double', ability: 'STR' });
    expect(r).toEqual({ ok: true, abilities: { ...base, STR: 12 } });
    expect(base.STR).toBe(10);
  });
  it('adds +1 to two different abilities', () => {
    const r = applyAbilityChoice(base, { kind: 'split', abilities: ['DEX', 'INT'] });
    expect(r).toEqual({ ok: true, abilities: { ...base, DEX: 13, INT: 9 } });
  });
  it('rejects the same ability twice in a split', () => {
    expect(applyAbilityChoice(base, { kind: 'split', abilities: ['DEX', 'DEX'] }).ok).toBe(false);
  });
  it('rejects going above 20', () => {
    expect(applyAbilityChoice(base, { kind: 'double', ability: 'WIS' }).ok).toBe(false);
    expect(applyAbilityChoice(base, { kind: 'split', abilities: ['STR', 'CHA'] }).ok).toBe(false);
  });
  it('allows reaching exactly 20', () => {
    const r = applyAbilityChoice(base, { kind: 'split', abilities: ['WIS', 'STR'] });
    expect(r.ok && r.abilities.WIS).toBe(20);
  });
  it('rejects unknown abilities and shapes', () => {
    expect(applyAbilityChoice(base, { kind: 'double', ability: 'LUCK' as never }).ok).toBe(false);
    expect(applyAbilityChoice(base, { kind: 'triple' } as never).ok).toBe(false);
  });
});
