import { describe, expect, it } from 'vitest';
import { buildParty, mulberry32, simulateFight, simulateMany, STANDARD_FIGHTS } from './simulate';

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(8)()).not.toBe(mulberry32(7)());
  });
});

describe('buildParty', () => {
  it('makes one character per class with level-derived xp, HP and ability improvements', () => {
    const party = buildParty(8, 'class');
    expect(party.map((c) => c.classId)).toEqual(['warrior', 'archer', 'cleric', 'rogue']);
    for (const c of party) {
      expect(c.maxHp).toBe(20 + 5 * 7);
      expect(c.hp).toBe(c.maxHp);
      expect(c.status).toBe('active');
    }
    expect(party[0].abilities?.STR).toBe(19);
    expect(party[0].armorWeight).toBe(3);
    expect(buildParty(1, 'none')[0].armorReduction).toBeUndefined();
    expect(buildParty(3, 'none')[0].abilities?.STR).toBe(15);
  });
});

describe('simulateFight', () => {
  it('is reproducible for the same seed', () => {
    const run = () => simulateFight(buildParty(3, 'class'), STANDARD_FIGHTS.normal2, mulberry32(42));
    expect(run()).toEqual(run());
  });

  it('a level 8 party beats a single minion in one or two rounds with nobody downed', () => {
    const r = simulateFight(buildParty(8, 'class'), [{ name: 'Rat', tier: 'minion' }], mulberry32(1));
    expect(r.won).toBe(true);
    expect(r.rounds).toBeLessThanOrEqual(2);
    expect(r.downed).toBe(0);
    expect(r.hpFraction).toBeGreaterThan(0.5);
  });

  it('counts a wiped party as a loss', () => {
    const horde = Array.from({ length: 8 }, (_, i) => ({ name: `Boss${i}`, tier: 'boss' as const, traits: ['brute' as const] }));
    const r = simulateFight(buildParty(1, 'none'), horde, mulberry32(3));
    expect(r.won).toBe(false);
    expect(r.downed).toBe(4);
  });

  it('never runs past the round cap', () => {
    const r = simulateFight(buildParty(1, 'none'), STANDARD_FIGHTS.boss, mulberry32(5));
    expect(r.rounds).toBeGreaterThan(0);
    expect(r.rounds).toBeLessThanOrEqual(30);
  });
});

describe('simulateMany', () => {
  it('aggregates seeded fights and is reproducible', () => {
    const go = () => simulateMany(buildParty(5, 'class'), STANDARD_FIGHTS.strongNormal, 60, 100);
    const a = go();
    expect(a).toEqual(go());
    expect(a.fights).toBe(60);
    expect(a.winRate).toBeGreaterThanOrEqual(0);
    expect(a.winRate).toBeLessThanOrEqual(1);
    expect(a.avgRounds).toBeGreaterThan(0);
    expect(a.avgDowned).toBeGreaterThanOrEqual(0);
    expect(a.avgDowned).toBeLessThanOrEqual(4);
  });

  it('a higher level party does at least as well against the same boss', () => {
    const low = simulateMany(buildParty(1, 'class'), STANDARD_FIGHTS.boss, 200, 9);
    const high = simulateMany(buildParty(8, 'class'), STANDARD_FIGHTS.boss, 200, 9);
    expect(high.winRate).toBeGreaterThanOrEqual(low.winRate);
  });
});
