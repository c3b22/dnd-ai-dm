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

  describe('mage spell slots (K3)', () => {
    const mage = (over: Partial<Character> = {}) => c({ classId: 'mage', weaponId: 'wand', ...over });
    it('short rest returns one spent slot and reports the change', () => {
      const r = applyTeamRest([mage({ spellSlotsUsed: 2 })], 'short', () => 4);
      expect(r.characters[0].spellSlotsUsed).toBe(1);
      expect(r.characters[0]).not.toHaveProperty('spellSlots');
      expect(r.spellSlotsChanged.map((x) => x.id)).toEqual(['p1']);
    });
    it('long rest returns every slot', () => {
      const r = applyTeamRest([mage({ spellSlotsUsed: 2 })], 'long', () => 1);
      expect(r.characters[0].spellSlotsUsed).toBe(0);
      expect(r.spellSlotsChanged).toHaveLength(1);
    });
    it('does nothing for a mage with full slots, other classes, or a downed mage', () => {
      const r = applyTeamRest(
        [mage({ spellSlotsUsed: 0 }), c({ id: 'p2', classId: 'warrior' }), mage({ id: 'p3', status: 'downed', hp: 0, spellSlotsUsed: 2 })],
        'long',
        () => 1
      );
      expect(r.spellSlotsChanged).toEqual([]);
      expect(r.characters[2].spellSlotsUsed).toBe(2);
      expect(r.characters[1]).not.toHaveProperty('spellSlotsUsed');
    });
    it('a refused short rest (both used) leaves the slots alone', () => {
      const r = applyTeamRest([mage({ spellSlotsUsed: 2, shortRestsUsed: 2 })], 'short', () => 4);
      expect(r.characters[0].spellSlotsUsed).toBe(2);
      expect(r.spellSlotsChanged).toEqual([]);
    });
  });
});
