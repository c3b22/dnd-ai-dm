import { describe, it, expect } from 'vitest';
import { characterPrompt } from './prompt';
import { applyAbilityActions } from './applyAbilities';
import type { Character } from './types';

const mage = (over: Partial<Character> = {}): Character => ({
  id: 'm1', displayName: 'Mira', weaponId: 'wand', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0,
  classId: 'mage', xp: 0, abilityCooldown: 0, ...over,
});

describe('K4: mage in the prompt and the ability resolver', () => {
  it('tells the DM how many spell slots the mage has left, and nothing for other classes', () => {
    const lines = characterPrompt([mage({ spellSlotsUsed: 1 }), { ...mage({ id: 'w', displayName: 'Prem' }), classId: 'warrior' }], false, undefined);
    const mira = lines.find((l) => l.includes('Mira (Lv 1'))!;
    expect(mira).toContain('spell slots 1/2');
    expect(lines.find((l) => l.includes('Prem (Lv 1'))).not.toContain('spell slots');
  });

  it('shows the AC with a spell bonus of the round', () => {
    const lines = characterPrompt([mage({ roundAcBonus: 3 })], false, undefined);
    expect(lines.find((l) => l.includes('Mira (Lv 1'))).toContain('AC 13');
  });

  it('the mage\'s surge is not a damage ability: the ability resolver leaves it to the spell flow (no damage, no cooldown)', () => {
    const r = applyAbilityActions([mage()], [{ playerId: 'm1', useAbility: true, spellId: 'arcane_bolt' } as never], () => 3);
    expect(r.damage).toEqual({});
    expect(r.used).toEqual([]);
    expect(r.notes).toEqual({});
  });
});
