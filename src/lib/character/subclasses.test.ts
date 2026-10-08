import { describe, it, expect } from 'vitest';
import { CLASS_IDS, CLASSES, skillModifier } from './classes';
import { runChecks } from './checkPlan';
import { characterPrompt } from './prompt';
import {
  abilitySaveDc, hasExpertise, isReplacementAbilityId, isSubclassId, mainCooldownFor, REPLACEMENT_ABILITIES, replacementOf,
  SUBCLASS_IDS, SUBCLASSES, subclassesFor, subclassOf,
} from './subclasses';
import type { Character } from './types';

const char = (over: Partial<Character> = {}): Character => ({
  id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, classId: 'warrior', xp: 0, ...over,
});

describe('subclass data (K5)', () => {
  it('has 10 subclasses, exactly 2 for each of the 5 classes, ids prefixed with their class', () => {
    expect(SUBCLASS_IDS).toHaveLength(10);
    for (const classId of CLASS_IDS) {
      const subs = subclassesFor(classId);
      expect(subs).toHaveLength(2);
      for (const s of subs) expect(s.id.startsWith(`${classId}_`)).toBe(true);
    }
    for (const id of SUBCLASS_IDS) {
      expect(SUBCLASSES[id].nameTh).not.toBe('');
      expect(SUBCLASSES[id].descTh).not.toBe('');
    }
  });

  it('three subclasses replace the main ability with a replacement that has its own cooldown', () => {
    const replacing = SUBCLASS_IDS.filter((id) => SUBCLASSES[id].replacesMain);
    expect(replacing.map((id) => SUBCLASSES[id].replacesMain)).toEqual(['berserk_strike', 'volley', 'feint']);
    expect(REPLACEMENT_ABILITIES.berserk_strike.cooldown).toBe(3);
    expect(REPLACEMENT_ABILITIES.volley.cooldown).toBe(3);
    expect(REPLACEMENT_ABILITIES.feint).toMatchObject({ cooldown: 3, target: 'enemy' });
    expect(isReplacementAbilityId('feint')).toBe(true);
    expect(isReplacementAbilityId('warrior')).toBe(false);
  });

  it('subclassOf only accepts a known subclass of the character class', () => {
    expect(subclassOf(char({ subclassId: 'warrior_guardian' }))?.id).toBe('warrior_guardian');
    expect(subclassOf(char({ subclassId: 'archer_hunter' }))).toBeNull();
    expect(subclassOf(char({ subclassId: 'nope' }))).toBeNull();
    expect(subclassOf(char())).toBeNull();
    expect(isSubclassId('mage_warder')).toBe(true);
    expect(isSubclassId('mage')).toBe(false);
  });

  it('replacementOf and mainCooldownFor', () => {
    expect(replacementOf(char({ subclassId: 'warrior_berserker' }))?.id).toBe('berserk_strike');
    expect(replacementOf(char({ subclassId: 'warrior_guardian' }))).toBeNull();
    expect(mainCooldownFor(char({ subclassId: 'warrior_guardian' }), CLASSES.warrior.ability.cooldown)).toBe(2);
    expect(mainCooldownFor(char({ classId: 'cleric', subclassId: 'cleric_life' }), 3)).toBe(2);
    expect(mainCooldownFor(char({ classId: 'cleric', subclassId: 'cleric_radiant' }), 3)).toBe(3);
    expect(mainCooldownFor(char(), 3)).toBe(3);
  });

  it('abilitySaveDc = 8 + proficiency + ability modifier', () => {
    expect(abilitySaveDc(char({ abilities: { STR: 10, DEX: 16, CON: 10, INT: 10, WIS: 10, CHA: 10 } }), 'DEX')).toBe(8 + 2 + 3);
  });
});

describe('rogue_trickster expertise', () => {
  const trickster = char({ classId: 'rogue', weaponId: 'dagger', subclassId: 'rogue_trickster', displayName: 'Mook' });
  const plain = char({ classId: 'rogue', weaponId: 'dagger', displayName: 'Mook' });
  const abilities = { STR: 8, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 14 };

  it('doubles the proficiency bonus on stealth, deception and sleight_of_hand only', () => {
    const mod = (skill: 'stealth' | 'investigation', subclassId?: string) =>
      skillModifier({ skill, abilities, classId: 'rogue', level: 1, subclassId });
    expect(mod('stealth')).toBe(2 + 2);
    expect(mod('stealth', 'rogue_trickster')).toBe(2 + 4);
    expect(mod('investigation', 'rogue_trickster')).toBe(mod('investigation'));
    expect(hasExpertise(trickster, 'deception')).toBe(true);
    expect(hasExpertise(trickster, 'investigation')).toBe(false);
    expect(hasExpertise(plain, 'stealth')).toBe(false);
  });

  it('runChecks adds the second proficiency bonus', () => {
    const plan = [{ player: 'Mook', skill: 'stealth' as const, dc: 10, advantage: 'none' as const }];
    const [a] = runChecks(plan, [{ ...trickster, abilities }], () => 10);
    const [b] = runChecks(plan, [{ ...plain, abilities }], () => 10);
    expect(a.total - b.total).toBe(2);
    expect(a.proficiency).toBe(4);
    expect(b.proficiency).toBe(2);
  });
});

describe('prompt (K5)', () => {
  it('tells the DM who follows which subclass, and says nothing when nobody has one', () => {
    const lines = characterPrompt([char({ subclassId: 'warrior_berserker' }), char({ id: 'p2', displayName: 'Suki', classId: 'archer' })], false, undefined);
    const row = lines.find((l) => l.includes('Prem (นักรบ)') && l.includes('นักรบคลั่ง'));
    expect(row).toContain('Their main class ability is now ฟันคลั่ง');
    expect(lines.some((l) => l.startsWith('Subclasses'))).toBe(true);
    expect(lines.filter((l) => l.includes('Suki (')).every((l) => !l.includes('Subclass'))).toBe(true);
    expect(characterPrompt([char()], false, undefined).some((l) => l.startsWith('Subclasses'))).toBe(false);
  });
});
