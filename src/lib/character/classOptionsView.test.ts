import { describe, it, expect } from 'vitest';
import { LEVEL_XP_THRESHOLDS } from './constants';
import { activePickAbilities, extraAbilities, pendingChoices, replacementAbility, subclassLabel } from './classOptionsView';

const xpFor = (level: number) => LEVEL_XP_THRESHOLDS[level - 1];

describe('pendingChoices', () => {
  it('offers nothing below level 3', () => {
    expect(pendingChoices({ classId: 'warrior', xp: xpFor(2), subclassId: null, abilityPicks: {} })).toEqual([]);
  });
  it('offers the two subclasses at level 3', () => {
    const [c] = pendingChoices({ classId: 'warrior', xp: xpFor(3), subclassId: null, abilityPicks: {} });
    expect(c.kind).toBe('subclass');
    expect(c.options.map((o) => o.id)).toEqual(['warrior_guardian', 'warrior_berserker']);
  });
  it('stops offering the subclass once chosen', () => {
    expect(pendingChoices({ classId: 'warrior', xp: xpFor(3), subclassId: 'warrior_guardian', abilityPicks: {} })).toEqual([]);
  });
  it('offers the level 6 pick and then level 9, skipping a level already picked', () => {
    const base = { classId: 'archer', xp: xpFor(9), subclassId: 'archer_hunter' };
    expect(pendingChoices({ ...base, abilityPicks: {} }).map((c) => c.level)).toEqual([6, 9]);
    expect(pendingChoices({ ...base, abilityPicks: { '6': 'archer_hawk_eye' } }).map((c) => c.level)).toEqual([9]);
  });
  it('offers nothing when the columns are not readable (undefined)', () => {
    expect(pendingChoices({ classId: 'warrior', xp: xpFor(9) })).toEqual([]);
  });
  it('offers nothing to a classless player', () => {
    expect(pendingChoices({ classId: null, xp: xpFor(9), subclassId: null, abilityPicks: {} })).toEqual([]);
  });
});

describe('pressable abilities', () => {
  it('lists the subclass replacement and active picks, each with its own cooldown; passives are left out', () => {
    const p = {
      classId: 'warrior', xp: xpFor(9), subclassId: 'warrior_berserker',
      abilityPicks: { '6': 'warrior_war_cry', '9': 'warrior_blood_rush' }, abilityCooldowns: { berserk_strike: 2 },
    };
    expect(extraAbilities(p).map((a) => [a.id, a.cooldown])).toEqual([['berserk_strike', 2], ['warrior_war_cry', 0]]);
    const q = { ...p, abilityPicks: { '6': 'warrior_war_cry', '9': 'warrior_sweep' }, abilityCooldowns: { warrior_sweep: 3 } };
    expect(activePickAbilities(q).map((a) => [a.id, a.cooldown])).toEqual([['warrior_war_cry', 0], ['warrior_sweep', 3]]);
  });
  it('has no replacement without one in the subclass', () => {
    expect(replacementAbility({ classId: 'warrior', subclassId: 'warrior_guardian' })).toBeNull();
  });
  it('ignores a pick that belongs to another class', () => {
    expect(activePickAbilities({ classId: 'warrior', abilityPicks: { '6': 'mage_recover' } })).toEqual([]);
  });
  it('names the subclass', () => {
    expect(subclassLabel({ classId: 'cleric', subclassId: 'cleric_life' })).toBe('สายชีวิต');
    expect(subclassLabel({ classId: 'cleric', subclassId: null })).toBeNull();
  });
});
