import { describe, it, expect } from 'vitest';
import { CLASSES, CLASS_IDS, DEFAULT_CLASS_ID, classForWeapon, classOf, isClassId } from './classes';
import { WEAPONS } from './constants';

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
