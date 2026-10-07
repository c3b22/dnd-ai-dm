import { describe, it, expect } from 'vitest';
import { SKILL_ABILITIES, SKILL_IDS, proficiencyBonus, skillModifier, startingAbilities, CLASSES, CLASS_IDS, DEFAULT_CLASS_ID, classForWeapon, classOf, isClassId, resolveClassId } from './classes';
import { ABILITY_KEYS, WEAPONS } from './constants';

describe('CLASSES', () => {
  it('defines the four classes with a Thai name, an existing weapon and an ability', () => {
    expect([...CLASS_IDS]).toEqual(['warrior', 'archer', 'cleric', 'rogue']);
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
    ]);
    expect(DEFAULT_CLASS_ID).toBe('warrior');
  });
});

describe('isClassId / classOf', () => {
  it('recognises only the four ids', () => {
    expect(isClassId('archer')).toBe(true);
    expect(isClassId('mage')).toBe(false);
    expect(isClassId(null)).toBe(false);
    expect(isClassId('constructor')).toBe(false);
  });

  it('looks a class up or returns null', () => {
    expect(classOf('rogue')?.weaponId).toBe('dagger');
    expect(classOf(null)).toBeNull();
    expect(classOf('mage')).toBeNull();
  });
});

describe('classForWeapon', () => {
  it('maps a legacy starting weapon to its class', () => {
    expect(classForWeapon('shortbow')).toBe('archer');
    expect(classForWeapon('staff')).toBe('cleric');
    expect(classForWeapon('dagger')).toBe('rogue');
    expect(classForWeapon('shortsword')).toBe('warrior');
    expect(classForWeapon('lightsaber')).toBe('warrior');
    expect(classForWeapon(undefined)).toBe('warrior');
  });
});

describe('resolveClassId', () => {
  it('prefers a valid classId, then a legacy weaponId, then the default', () => {
    expect(resolveClassId({ classId: 'rogue' })).toBe('rogue');
    expect(resolveClassId({ classId: 'rogue', weaponId: 'staff' })).toBe('rogue');
    expect(resolveClassId({ weaponId: 'shortbow' })).toBe('archer');
    expect(resolveClassId({ classId: 'mage', weaponId: 'staff' })).toBe('cleric');
    expect(resolveClassId({ classId: 'mage' })).toBe('warrior');
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
    expect(seen.size).toBe(4);
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
