import { describe, it, expect } from 'vitest';
import { applySpellActions, type SpellAction } from './applySpells';
import { cooldownOf } from './applyAbilities';
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
const seq = (...values: number[]) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
const cast = (over: Partial<SpellAction>): SpellAction => ({ playerId: 'm1', spellId: 'arcane_bolt', itemTarget: 'หมาป่า', ...over });

describe('applySpellActions (K4)', () => {
  it('an enemy spell takes its pips from the encounter, rolls a summary line and marks the caster', () => {
    // attack bonus 4 (prof 2 + INT +2) vs normal AC 13: a 10 totals 14 and hits for 1 pip
    const r = applySpellActions({ characters: [mage(), friend()], actions: [cast({})], encounter: enc(wolf), rollDie: seq(10) });
    expect(r.encounter!.enemies[0].pip).toBe(1);
    expect(r.rolls).toEqual([expect.objectContaining({ playerDisplayName: 'Mira', spellNameTh: 'แสงเวทพุ่ง', kind: 'attack', target: 'หมาป่า', die: 10, total: 14, dc: 13, success: true, pips: 1 })]);
    expect(r.casters).toEqual(['m1']);
    expect(r.notes.m1).toContain('แสงเวทพุ่ง');
    expect(r.characters.find((c) => c.id === 'm1')!.spellSlotsUsed ?? 0).toBe(0); // cantrip
    expect(r.surgeUsed).toEqual([]);
  });

  it('does not change the input encounter or characters', () => {
    const encounter = enc(wolf);
    const caster = mage();
    applySpellActions({ characters: [caster], actions: [cast({ spellId: 'frost_lance' })], encounter, rollDie: seq(15) });
    expect(encounter.enemies[0].pip).toBe(2);
    expect(caster.spellSlotsUsed).toBeUndefined();
  });

  it('a slot spell spends a slot only when it works; a refusal (no slots) changes nothing and starts nothing', () => {
    const ok = applySpellActions({ characters: [mage()], actions: [cast({ spellId: 'frost_lance' })], encounter: enc(wolf), rollDie: seq(15) });
    expect(ok.characters[0].spellSlotsUsed).toBe(1);
    expect(ok.changes.join(' ')).toContain('เหลือ 1/2');
    const refused = applySpellActions({ characters: [mage({ spellSlotsUsed: 2 })], actions: [cast({ spellId: 'frost_lance' })], encounter: enc(wolf), rollDie: seq(15) });
    expect(refused.casters).toEqual([]);
    expect(refused.encounter!.enemies[0].pip).toBe(2);
    expect(refused.rolls).toEqual([]);
    expect(refused.notes.m1).toContain('failed');
    expect(refused.surgeUsed).toEqual([]);
    // the surge is free, so with it the cast still works with no slots left
    const dry = applySpellActions({ characters: [mage({ spellSlotsUsed: 2 })], actions: [cast({ spellId: 'frost_lance', useAbility: true })], encounter: enc(wolf), rollDie: seq(15) });
    expect(dry.casters).toEqual(['m1']);
    expect(dry.surgeUsed).toEqual(['m1']);
  });

  it('the arcane surge is spent only on a working cast, and is refused while cooling down', () => {
    const free = applySpellActions({ characters: [mage()], actions: [cast({ spellId: 'frost_lance', useAbility: true })], encounter: enc(wolf), rollDie: seq(15) });
    expect(free.characters[0].spellSlotsUsed ?? 0).toBe(0);
    expect(free.surgeUsed).toEqual(['m1']);
    const badTarget = applySpellActions({ characters: [mage()], actions: [cast({ spellId: 'frost_lance', useAbility: true, itemTarget: 'ไม่มี' })], encounter: enc(wolf), rollDie: seq(15) });
    expect(badTarget.surgeUsed).toEqual([]);
    const cooling = applySpellActions({ characters: [mage({ abilityCooldown: 2 })], actions: [cast({ spellId: 'frost_lance', useAbility: true })], encounter: enc(wolf), rollDie: seq(15) });
    expect(cooling.surgeUsed).toEqual([]);
    expect(cooling.characters[0].spellSlotsUsed).toBe(1); // cast the ordinary way
    expect(cooling.notes.m1).toContain('ใช้เวทไหลล้นไม่ได้');
    expect(cooldownOf(cooling.characters[0], 'mage')).toBe(2);
  });

  it('at level 5 the surge adds +2 to the spell attack', () => {
    const lvl5 = mage({ xp: 1500 });
    const withSurge = applySpellActions({ characters: [lvl5], actions: [cast({ spellId: 'frost_lance', useAbility: true })], encounter: enc(wolf), rollDie: seq(5) });
    const without = applySpellActions({ characters: [lvl5], actions: [cast({ spellId: 'frost_lance' })], encounter: enc(wolf), rollDie: seq(5) });
    expect(withSurge.rolls[0].total - without.rolls[0].total).toBe(2);
  });

  it('a surge without a spell does nothing, and an unknown spell is a note only', () => {
    const none = applySpellActions({ characters: [mage()], actions: [{ playerId: 'm1', useAbility: true }], encounter: enc(wolf), rollDie: seq(15) });
    expect(none.surgeUsed).toEqual([]);
    expect(none.notes.m1).toContain('without choosing a spell');
    const unknown = applySpellActions({ characters: [mage()], actions: [cast({ spellId: 'wish' })], encounter: enc(wolf), rollDie: seq(15) });
    expect(unknown.casters).toEqual([]);
    expect(unknown.notes.m1).toContain('unknown');
  });

  it('non-mages and potion actions are ignored', () => {
    const r = applySpellActions({ characters: [friend()], actions: [{ playerId: 'p2', spellId: 'arcane_bolt', itemTarget: 'หมาป่า' }], encounter: enc(wolf), rollDie: seq(15) });
    expect(r.casters).toEqual([]);
    expect(r.notes).toEqual({});
    const potion = applySpellActions({ characters: [mage()], actions: [cast({ useItemId: 'potion' })], encounter: enc(wolf), rollDie: seq(15) });
    expect(potion.casters).toEqual([]);
  });

  it('a friend spell reads the friend from abilityTargetId and puts the round bonus on them', () => {
    const r = applySpellActions({ characters: [mage(), friend()], actions: [cast({ spellId: 'arcane_shield', itemTarget: null, abilityTargetId: 'p2' })], encounter: enc(wolf), rollDie: seq(10) });
    expect(r.effects.acBonus).toEqual({ p2: 3 });
    expect(r.characters.find((c) => c.id === 'p2')!.roundAcBonus).toBe(3);
    const ward = applySpellActions({ characters: [mage(), friend()], actions: [cast({ spellId: 'spell_ward', itemTarget: null, abilityTargetId: 'm1' })], encounter: null, rollDie: seq(10) });
    expect(ward.characters.find((c) => c.id === 'm1')!.roundWard).toBe(3);
  });

  it('control spells record enemy statuses for the round', () => {
    const r = applySpellActions({ characters: [mage()], actions: [cast({ spellId: 'illusion_fog', itemTarget: null })], encounter: enc(wolf), rollDie: seq(2) });
    expect(r.effects.enemy['หมาป่า']).toEqual(['dazed']);
  });

  it('a blessing cast earlier in the round gives the next mage advantage (two dice are rolled)', () => {
    const second = mage({ id: 'm2', displayName: 'Zed' });
    let rolled = 0;
    applySpellActions({
      characters: [mage(), second],
      actions: [
        { playerId: 'm1', spellId: 'valor_blessing', abilityTargetId: 'm2' },
        { playerId: 'm2', spellId: 'arcane_bolt', itemTarget: 'หมาป่า' },
      ],
      encounter: enc(wolf),
      rollDie: () => { rolled++; return 10; },
    });
    expect(rolled).toBe(2);
  });

  it('a fearsome enemy in the first fight round gives disadvantage (two dice, the lower kept)', () => {
    const scary = { ...wolf, traits: ['fearsome' as const] };
    const r = applySpellActions({ characters: [mage()], actions: [cast({})], encounter: { enemies: [scary] }, rollDie: seq(18, 3) });
    expect(r.rolls[0].die).toBe(3);
    expect(r.rolls[0].success).toBe(false);
  });

  it('spells chain on the working encounter: a second bolt sees the pips the first took', () => {
    const second = mage({ id: 'm2', displayName: 'Zed' });
    const r = applySpellActions({
      characters: [mage(), second],
      actions: [cast({}), { playerId: 'm2', spellId: 'arcane_bolt', itemTarget: 'หมาป่า' }],
      encounter: enc(wolf),
      rollDie: seq(18),
    });
    expect(r.encounter!.enemies[0].pip).toBe(0);
    expect(r.rolls).toHaveLength(2);
  });

  it('merges quicken_rhythm into a cooldown cut for the friend', () => {
    const r = applySpellActions({ characters: [mage(), friend({ abilityCooldown: 3 })], actions: [cast({ spellId: 'quicken_rhythm', itemTarget: null, abilityTargetId: 'p2' })], encounter: null, rollDie: seq(10) });
    expect(r.effects.cooldownCut).toEqual({ p2: 2 });
  });
});
