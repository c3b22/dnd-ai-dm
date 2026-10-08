import { describe, it, expect } from 'vitest';
import { hasPick, isPickAbilityId, PICK_ABILITIES, PICK_ABILITY_IDS, picksFor, picksOf } from './abilityPicks';
import { CLASS_IDS } from './classes';
import { mainCooldownFor } from './subclasses';
import { mageSpellSlots, spellSlotsOf } from './spells';
import { armorClass } from '@/lib/combat/armorClass';
import type { Character } from './types';

const mage = (over: Partial<Character> = {}): Character =>
  ({ id: 'm1', displayName: 'Mira', weaponId: 'wand', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, classId: 'mage', xp: 600, abilityCooldown: 0, ...over }) as Character;

describe('level 6 / 9 ability data (K6)', () => {
  it('has 20 abilities: two choices at level 6 and two at level 9 for each of the 5 classes', () => {
    expect(PICK_ABILITY_IDS).toHaveLength(20);
    for (const classId of CLASS_IDS) {
      expect(picksFor(classId, 6)).toHaveLength(2);
      expect(picksFor(classId, 9)).toHaveLength(2);
    }
    for (const id of PICK_ABILITY_IDS) expect(PICK_ABILITIES[id].id).toBe(id);
  });

  it('active abilities have a cooldown and passives do not; only snare targets an enemy', () => {
    for (const p of Object.values(PICK_ABILITIES)) {
      expect(p.kind === 'active' ? p.cooldown > 0 : p.cooldown === 0).toBe(true);
      expect(p.nameTh.length).toBeGreaterThan(0);
      expect(p.descTh.length).toBeGreaterThan(0);
    }
    expect(Object.values(PICK_ABILITIES).filter((p) => p.target === 'enemy').map((p) => p.id)).toEqual(['archer_snare']);
    expect(PICK_ABILITIES.mage_recover.cooldown).toBe(6);
    expect(PICK_ABILITIES.cleric_mass_heal.cooldown).toBe(5);
  });

  it('isPickAbilityId and picksOf only accept real picks of the character own class and level', () => {
    expect(isPickAbilityId('warrior_sweep')).toBe(true);
    expect(isPickAbilityId('warrior')).toBe(false);
    expect(isPickAbilityId(undefined)).toBe(false);
    expect(picksOf({ classId: 'warrior', abilityPicks: { '6': 'warrior_war_cry', '9': 'warrior_sweep' } }).map((p) => p.id)).toEqual(['warrior_war_cry', 'warrior_sweep']);
    // wrong class, wrong level slot, unknown id, no picks
    expect(picksOf({ classId: 'archer', abilityPicks: { '6': 'warrior_war_cry' } })).toEqual([]);
    expect(picksOf({ classId: 'warrior', abilityPicks: { '9': 'warrior_war_cry' } })).toEqual([]);
    expect(picksOf({ classId: 'warrior', abilityPicks: { '6': 'nope' } })).toEqual([]);
    expect(picksOf({ classId: 'warrior' })).toEqual([]);
    expect(hasPick({ classId: 'warrior', abilityPicks: { '6': 'warrior_stone_skin' } }, 'warrior_stone_skin')).toBe(true);
  });
});

describe('passive picks outside combat (K6)', () => {
  it('warrior_stone_skin: AC +1', () => {
    const base = { abilities: { STR: 15, DEX: 14, CON: 13, INT: 8, WIS: 12, CHA: 10 } };
    expect(armorClass({ ...base, classId: 'warrior', abilityPicks: { '6': 'warrior_stone_skin' } })).toBe(armorClass(base) + 1);
    expect(armorClass({ ...base, classId: 'warrior', abilityPicks: { '6': 'warrior_war_cry' } })).toBe(armorClass(base));
  });

  it('mage_deep_reserve: one more spell slot from level 6, spending follows the new max', () => {
    expect(spellSlotsOf(mage())).toEqual({ current: mageSpellSlots(6), max: mageSpellSlots(6) });
    const reserve = mage({ abilityPicks: { '6': 'mage_deep_reserve' }, spellSlotsUsed: 2 });
    expect(spellSlotsOf(reserve)).toEqual({ current: mageSpellSlots(6) + 1 - 2, max: mageSpellSlots(6) + 1 });
    // below level 6 the pick gives nothing
    expect(spellSlotsOf(mage({ xp: 420, abilityPicks: { '6': 'mage_deep_reserve' } }))!.max).toBe(mageSpellSlots(5));
  });

  it('mage_frequent_surge: the arcane surge cooldown is 2 instead of 4', () => {
    expect(mainCooldownFor(mage(), 4)).toBe(4);
    expect(mainCooldownFor(mage({ abilityPicks: { '9': 'mage_frequent_surge' }, xp: 1320 }), 4)).toBe(2);
  });
});
