import { describe, it, expect } from 'vitest';
import { applySpellActions, type SpellAction } from './applySpells';
import { emptyRoundEffects } from './spells';
import type { Character } from './types';
import type { Encounter } from '@/lib/combat/encounter';

const mage = (over: Partial<Character> = {}): Character => ({
  id: 'm1', displayName: 'Mira', weaponId: 'wand', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0,
  classId: 'mage', xp: 0, abilityCooldown: 0, abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 }, ...over,
});
const friend = (over: Partial<Character> = {}): Character => ({
  id: 'p2', displayName: 'Nok', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, classId: 'warrior', xp: 0, abilityCooldown: 0, ...over,
});
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
const enc = (...enemies: Encounter['enemies']): Encounter => ({ enemies });
const cast = (over: Partial<SpellAction>): SpellAction => ({ playerId: 'm1', spellId: 'arcane_bolt', itemTarget: 'หมาป่า', ...over });
const run = (characters: Character[], actions: SpellAction[], encounter: Encounter | null = enc(wolf), die = 15) =>
  applySpellActions({ characters, actions, encounter, rollDie: () => die });

describe('mage_evoker (K5)', () => {
  const evoker = (over: Partial<Character> = {}) => mage({ subclassId: 'mage_evoker', ...over });

  it('save DC is 1 higher', () => {
    // DC = 8 + 2 + INT +2 = 12, evoker 13
    const plain = run([mage()], [cast({ spellId: 'scatter_spark' })], enc(wolf), 10);
    const boosted = run([evoker()], [cast({ spellId: 'scatter_spark' })], enc(wolf), 10);
    expect(plain.rolls[0].dc).toBe(12);
    expect(boosted.rolls[0].dc).toBe(13);
  });

  it('the first spell of the round that took pips off takes one more', () => {
    const r = run([evoker()], [cast({})]);
    expect(r.encounter!.enemies[0].pip).toBe(0); // bolt 1 pip + 1 evoker pip
    expect(r.rolls[0].pips).toBe(2);
    expect(r.changes.join(' ')).toContain('สายทำลายล้าง');
    expect(run([mage()], [cast({})]).encounter!.enemies[0].pip).toBe(1);
  });

  it('only once per round, and nothing extra on a miss', () => {
    const twice = run([evoker()], [cast({}), cast({})], enc({ ...wolf, pip: 5, maxPip: 5, tier: 'boss' }), 20);
    // boss full-health rule aside: first cast 1 crit pip (2) + 1 evoker, second 2 pips only
    expect(twice.rolls.map((x) => x.pips)).toEqual([3, 2]);
    const miss = run([evoker()], [cast({})], enc(wolf), 2);
    expect(miss.encounter!.enemies[0].pip).toBe(2);
    expect(miss.changes.join(' ')).not.toContain('สายทำลายล้าง');
  });

  it('does not change the input encounter', () => {
    const encounter = enc(wolf);
    run([evoker()], [cast({})], encounter);
    expect(encounter.enemies[0].pip).toBe(2);
  });
});

describe('mage_warder (K5)', () => {
  const warder = (over: Partial<Character> = {}) => mage({ subclassId: 'mage_warder', ...over });

  it('arcane shield gives AC +4 and spell ward 5 (plain mage 3 and 3)', () => {
    const shield = run([warder(), friend()], [cast({ spellId: 'arcane_shield', abilityTargetId: 'p2', itemTarget: null })], null);
    expect(shield.effects.acBonus).toEqual({ p2: 4 });
    const ward = run([warder(), friend()], [cast({ spellId: 'spell_ward', abilityTargetId: 'p2', itemTarget: null })], null);
    expect(ward.effects.ward).toEqual({ p2: 5 });
    const plain = run([mage(), friend()], [cast({ spellId: 'arcane_shield', abilityTargetId: 'p2', itemTarget: null })], null);
    expect(plain.effects.acBonus).toEqual({ p2: 3 });
  });

  it('the stronger levels are 5 (shield, level 9) and 6 (ward, level 7)', () => {
    const r = run([warder({ xp: 1320 })], [cast({ spellId: 'arcane_shield', abilityTargetId: 'm1', itemTarget: null })], null);
    expect(r.effects.acBonus).toEqual({ m1: 5 });
    const w = run([warder({ xp: 1050 })], [cast({ spellId: 'spell_ward', abilityTargetId: 'm1', itemTarget: null })], null);
    expect(w.effects.ward).toEqual({ m1: 6 });
  });

  it('control spells have DC +2', () => {
    // 8 + 2 + 2 + 2 = 14 (plain 12)
    expect(run([warder()], [cast({ spellId: 'hold_foe' })], enc(wolf), 10).rolls[0].dc).toBe(14);
    expect(run([mage()], [cast({ spellId: 'hold_foe' })], enc(wolf), 10).rolls[0].dc).toBe(12);
    expect(run([warder()], [cast({ spellId: 'scatter_spark' })], enc(wolf), 10).rolls[0].dc).toBe(12);
  });

  it('a defense or support spell on oneself is free the first time in a round, never on a friend', () => {
    const self = run([warder()], [cast({ spellId: 'arcane_shield', abilityTargetId: 'm1', itemTarget: null })], null);
    expect(self.characters[0].spellSlotsUsed ?? 0).toBe(0);
    expect(self.changes.join(' ')).not.toContain('ใช้ช่องเวท');
    const byName = run([warder()], [cast({ spellId: 'valor_blessing', abilityTargetId: 'Mira', itemTarget: null })], null);
    expect(byName.characters[0].spellSlotsUsed ?? 0).toBe(0);
    const other = run([warder(), friend()], [cast({ spellId: 'arcane_shield', abilityTargetId: 'p2', itemTarget: null })], null);
    expect(other.characters[0].spellSlotsUsed).toBe(1);
    const second = run([warder()], [
      cast({ spellId: 'arcane_shield', abilityTargetId: 'm1', itemTarget: null }),
      cast({ spellId: 'spell_ward', abilityTargetId: 'm1', itemTarget: null }),
    ], null);
    expect(second.characters[0].spellSlotsUsed).toBe(1);
  });

  it('the free cast is not spent when the cast fails, and a plain mage never gets it', () => {
    const noSlots = run([warder({ spellSlotsUsed: 2 })], [cast({ spellId: 'arcane_shield', abilityTargetId: 'm1', itemTarget: null })], null);
    expect(noSlots.casters).toEqual(['m1']); // free, so it works with no slots left
    const plain = run([mage({ spellSlotsUsed: 2 })], [cast({ spellId: 'arcane_shield', abilityTargetId: 'm1', itemTarget: null })], null);
    expect(plain.casters).toEqual([]);
    const bad = run([warder()], [
      cast({ spellId: 'arcane_shield', abilityTargetId: 'nobody', itemTarget: null }),
      cast({ spellId: 'arcane_shield', abilityTargetId: 'm1', itemTarget: null }),
    ], null);
    expect(bad.characters[0].spellSlotsUsed ?? 0).toBe(0);
    expect(bad.casters).toEqual(['m1']);
  });
});

describe('abilities seed the round effects (K5)', () => {
  it('effects set by class abilities reach the characters as this round AC bonus', () => {
    const seed = emptyRoundEffects();
    seed.acBonus.p2 = -2;
    seed.attackMods = { p2: { advantage: true } };
    const r = applySpellActions({ characters: [mage(), friend()], actions: [], encounter: null, rollDie: () => 10, effects: seed });
    expect(r.characters.find((c) => c.id === 'p2')!.roundAcBonus).toBe(-2);
    expect(r.effects.attackMods).toEqual({ p2: { advantage: true } });
    expect(seed.acBonus).toEqual({ p2: -2 });
  });

  it('spell effects add to the ability ones', () => {
    const seed = emptyRoundEffects();
    seed.acBonus.p2 = 2;
    const r = applySpellActions({ characters: [mage(), friend()], actions: [cast({ spellId: 'arcane_shield', abilityTargetId: 'p2', itemTarget: null })], encounter: null, rollDie: () => 10, effects: seed });
    expect(r.effects.acBonus.p2).toBe(5);
  });
});
