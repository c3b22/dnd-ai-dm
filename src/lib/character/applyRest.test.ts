import { describe, it, expect } from 'vitest';
import { applyTeamRest } from './applyRest';
import type { Character } from './types';

const c = (over: Partial<Character>): Character => ({
  id: 'p1', displayName: 'Prem', weaponId: null, hp: 5, maxHp: 20, status: 'active', revivesSinceSanctuary: 0,
  xp: 0, abilityCooldown: 2, ...over,
});

describe('applyTeamRest', () => {
  it('short rest heals and resets cooldown for active characters only, counts the rest', () => {
    const r = applyTeamRest([c({}), c({ id: 'p2', displayName: 'Nok', status: 'downed', hp: 0 })], 'short', () => 4);
    expect(r.characters[0]).toMatchObject({ hp: 9, abilityCooldown: 0, shortRestsUsed: 1 });
    expect(r.characters[1]).toMatchObject({ hp: 0, status: 'downed', abilityCooldown: 2 });
    expect(r.shortRestChanged.map((x) => x.id)).toEqual(['p1']);
    expect(r.changes.length).toBe(2);
  });
  it('long rest fills HP, clears cooldown, short rests and death saves for active characters only', () => {
    const r = applyTeamRest(
      [c({ shortRestsUsed: 2 }), c({ id: 'p2', status: 'dead', hp: 0, deathSaves: { successes: 0, failures: 3, stable: false, dead: true } })],
      'long',
      () => 1
    );
    expect(r.characters[0]).toMatchObject({ hp: 20, abilityCooldown: 0, shortRestsUsed: 0, deathSaves: null });
    expect(r.characters[1]).toMatchObject({ hp: 0, status: 'dead', deathSaves: { successes: 0, failures: 3, stable: false, dead: true } });
    expect(r.shortRestChanged.map((x) => x.id)).toEqual(['p1']);
  });
  it('short rest refuses a character who used both', () => {
    const r = applyTeamRest([c({ shortRestsUsed: 2 })], 'short', () => 8);
    expect(r.characters[0].hp).toBe(5);
    expect(r.shortRestChanged).toEqual([]);
  });
});
