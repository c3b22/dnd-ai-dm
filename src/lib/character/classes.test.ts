import { describe, it, expect } from 'vitest';
import { SKILL_ABILITIES, SKILL_IDS, proficiencyBonus, skillModifier, startingAbilities, CLASSES, CLASS_IDS, DEFAULT_CLASS_ID, classForWeapon, classOf, isClassId, resolveClassId } from './classes';
import { ABILITY_KEYS, WEAPONS, weaponFor } from './constants';
import { catalogEntry } from '@/lib/inventory/catalog';
import { WEAPON_ATTACK_ABILITIES } from '@/lib/combat/constants';
import { attackBonuses } from '@/lib/combat/attack';
import { buyPrice } from '@/lib/economy/prices';

describe('CLASSES', () => {
  it('defines the five classes with a Thai name, an existing weapon and an ability', () => {
    expect([...CLASS_IDS]).toEqual(['warrior', 'archer', 'cleric', 'rogue', 'mage']);
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      expect(c.id).toBe(id);
      expect(c.nameTh).toBeTruthy();
      expect(WEAPONS).toHaveProperty(c.weaponId);
      expect(c.ability.nameTh).toBeTruthy();
      expect(c.ability.descTh).toBeTruthy();
    }
  });

  it('pins the starting weapons, targets and cooldowns', () => {
    expect(CLASS_IDS.map((id) => [CLASSES[id].weaponId, CLASSES[id].ability.target, CLASSES[id].ability.cooldown])).toEqual([
      ['shortsword', 'ally', 3],
      ['shortbow', null, 3],
      ['staff', 'ally_or_self', 3],
      ['dagger', null, 4],
      ['wand', null, 4],
    ]);
    expect(DEFAULT_CLASS_ID).toBe('warrior');
  });
});

describe('isClassId / classOf', () => {
  it('recognises only the five ids', () => {
    expect(isClassId('archer')).toBe(true);
    expect(isClassId('mage')).toBe(true);
    expect(isClassId('paladin')).toBe(false);
    expect(isClassId(null)).toBe(false);
    expect(isClassId('constructor')).toBe(false);
  });

  it('looks a class up or returns null', () => {
    expect(classOf('rogue')?.weaponId).toBe('dagger');
    expect(classOf(null)).toBeNull();
    expect(classOf('mage')?.weaponId).toBe('wand');
    expect(classOf('paladin')).toBeNull();
  });
});

describe('classForWeapon', () => {
  it('maps a legacy starting weapon to its class', () => {
    expect(classForWeapon('shortbow')).toBe('archer');
    expect(classForWeapon('staff')).toBe('cleric');
    expect(classForWeapon('dagger')).toBe('rogue');
    expect(classForWeapon('shortsword')).toBe('warrior');
    expect(classForWeapon('wand')).toBe('mage');
    expect(classForWeapon('lightsaber')).toBe('warrior');
    expect(classForWeapon(undefined)).toBe('warrior');
  });
});

describe('resolveClassId', () => {
  it('prefers a valid classId, then a legacy weaponId, then the default', () => {
    expect(resolveClassId({ classId: 'rogue' })).toBe('rogue');
    expect(resolveClassId({ classId: 'rogue', weaponId: 'staff' })).toBe('rogue');
    expect(resolveClassId({ weaponId: 'shortbow' })).toBe('archer');
    expect(resolveClassId({ classId: 'paladin', weaponId: 'staff' })).toBe('cleric');
    expect(resolveClassId({ classId: 'paladin' })).toBe('warrior');
    expect(resolveClassId({})).toBe('warrior');
  });
});

describe('class starting abilities and skills', () => {
  it('gives every class the standard array, arranged differently', () => {
    const seen = new Set<string>();
    for (const id of CLASS_IDS) {
      const scores = ABILITY_KEYS.map((k) => CLASSES[id].abilities[k]);
      expect([...scores].sort((a, b) => b - a)).toEqual([15, 14, 13, 12, 10, 8]);
      seen.add(scores.join('/'));
    }
    expect(seen.size).toBe(5);
  });

  it('puts each class best score where it leans', () => {
    expect(CLASSES.warrior.abilities.STR).toBe(15);
    expect(CLASSES.archer.abilities.DEX).toBe(15);
    expect(CLASSES.cleric.abilities.WIS).toBe(15);
    expect(CLASSES.rogue.abilities.DEX).toBe(15);
  });

  it('maps all 18 skills to an ability, and class skills are real skills', () => {
    expect(SKILL_IDS).toHaveLength(18);
    expect(SKILL_ABILITIES.athletics).toBe('STR');
    expect(SKILL_ABILITIES.stealth).toBe('DEX');
    for (const id of CLASS_IDS) {
      expect(CLASSES[id].skills.length).toBeGreaterThan(0);
      for (const s of CLASSES[id].skills) expect(SKILL_IDS).toContain(s);
    }
  });

  it('startingAbilities returns a copy', () => {
    const a = startingAbilities('rogue');
    a.DEX = 1;
    expect(CLASSES.rogue.abilities.DEX).toBe(15);
  });

  it('proficiency bonus follows 5e by level', () => {
    expect([1, 4, 5, 8, 9, 10, 12, 13, 17].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 4, 5, 6]);
    expect(proficiencyBonus(0)).toBe(2);
    expect(proficiencyBonus(NaN)).toBe(2);
  });

  it('skill modifier adds proficiency only for class skills', () => {
    const base = { abilities: CLASSES.rogue.abilities, classId: 'rogue' as const, level: 5 };
    expect(skillModifier({ ...base, skill: 'stealth' })).toBe(2 + 3);
    expect(skillModifier({ ...base, skill: 'athletics' })).toBe(-1);
    expect(skillModifier({ ...base, skill: 'athletics', setSkillBonus: 1 })).toBe(0);
    expect(skillModifier({ ...base, skill: 'stealth', skillBonuses: { stealth: 2 }, setSkillBonus: 1 })).toBe(2 + 3 + 2 + 1);
  });
});

describe('skillModifier with accessory bonuses (F5d)', () => {
  const base = { abilities: CLASSES.rogue.abilities, classId: 'rogue' as const, level: 5 };
  it('adds the bonus only to its own skill', () => {
    expect(skillModifier({ ...base, skill: 'stealth', skillBonuses: { stealth: 2 } })).toBe(2 + 3 + 2);
    expect(skillModifier({ ...base, skill: 'athletics', skillBonuses: { stealth: 2 } })).toBe(-1);
  });
});

describe('mage (K3)', () => {
  it('starts with INT as the highest score, DEX second, and arcane skills', () => {
    const m = CLASSES.mage;
    expect(m.abilities).toEqual({ STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 });
    expect([...m.skills]).toEqual(['arcana', 'history', 'investigation', 'insight']);
    expect(m.ability).toMatchObject({ target: null, cooldown: 4 });
  });
  it('carries a wand: d4, attacks with INT, in the catalog and the shop price list', () => {
    expect(weaponFor('wand')).toMatchObject({ id: 'wand', nameTh: 'ไม้กายสิทธิ์', dice: { count: 1, sides: 4, bonus: 0 } });
    expect(catalogEntry('wand')).toMatchObject({ kind: 'weapon', weight: 1 });
    expect(WEAPON_ATTACK_ABILITIES.wand).toEqual(['INT']);
    expect(buyPrice('wand')).toBe(20);
  });
  it('uses INT + proficiency for its weapon attack', () => {
    const c = { id: 'm', displayName: 'M', weaponId: 'wand', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0, classId: 'mage', xp: 0, abilities: startingAbilities('mage') };
    expect(attackBonuses(c)).toEqual({ modifier: 2, proficiency: 2, magic: 0 });
  });
});
