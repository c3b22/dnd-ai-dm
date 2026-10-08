import { describe, it, expect } from 'vitest';
import { applyAbilityActions, cooldownOf, tickCooldowns } from './applyAbilities';
import type { Character } from './types';
import type { Encounter } from '@/lib/combat/encounter';

const four = () => 4;
const char = (over: Partial<Character> = {}): Character => ({
  id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, classId: 'warrior', abilityCooldown: 0, xp: 0, ...over,
});
const friend = (over: Partial<Character> = {}) => char({ id: 'p2', displayName: 'Suki', classId: 'archer', weaponId: 'shortbow', ...over });
const use = (playerId: string, target: string | null = null, extra: object = {}) => ({ playerId, useAbility: true, abilityTargetId: target, ...extra });
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
const bear = { name: 'หมี', tier: 'strong' as const, pip: 3, maxPip: 3, fled: false };
const enc = (...enemies: Encounter['enemies']): Encounter => ({ enemies });
const LV5 = 600;

describe('warrior_guardian', () => {
  it('gives the warrior AC +2 while guarding and shortens the cooldown to 2', () => {
    const party = [char({ subclassId: 'warrior_guardian' }), friend()];
    const r = applyAbilityActions(party, [use('p1', 'p2')], four);
    expect(r.guards).toEqual({ p2: 'p1' });
    expect(r.effects.acBonus).toEqual({ p1: 2 });
    expect(tickCooldowns(r.characters, false, r.used)[0].abilityCooldown).toBe(2);
  });

  it('a warrior without a subclass keeps cooldown 3 and no AC bonus', () => {
    const r = applyAbilityActions([char(), friend()], [use('p1', 'p2')], four);
    expect(r.effects.acBonus).toEqual({});
    expect(tickCooldowns(r.characters, false, r.used)[0].abilityCooldown).toBe(3);
  });
});

describe('warrior_berserker (berserk_strike replaces the guard)', () => {
  const berserker = () => char({ subclassId: 'warrior_berserker' });

  it('sets the attack modifiers and AC -2, and keeps its cooldown in the per-ability map', () => {
    const r = applyAbilityActions([berserker(), friend()], [use('p1')], four);
    expect(r.guards).toEqual({});
    expect(r.effects.attackMods).toEqual({ p1: { advantage: true, minPips: 2, critPips: 3 } });
    expect(r.effects.acBonus).toEqual({ p1: -2 });
    expect(r.used).toEqual([]);
    expect(r.usedExtra).toEqual([{ playerId: 'p1', abilityId: 'berserk_strike', cooldown: 3 }]);
    expect(r.usedAbilities).toEqual([{ playerId: 'p1', abilityId: 'berserk_strike' }]);
    expect(r.changes).toEqual(['Prem ใช้ฟันคลั่ง']);

    const after = tickCooldowns(r.characters, false, r.used, r.usedExtra);
    expect(cooldownOf(after[0], 'berserk_strike')).toBe(3);
    const again = applyAbilityActions(after, [use('p1')], four);
    expect(again.usedExtra).toEqual([]);
    expect(again.notes.p1).toBe('tried to use ฟันคลั่ง but it was not ready');
  });

  it('also answers to the class id (clients that send the old main ability id) and refuses other abilities', () => {
    expect(applyAbilityActions([berserker()], [use('p1', null, { abilityId: 'warrior' })], four).usedExtra).toHaveLength(1);
    expect(applyAbilityActions([berserker()], [use('p1', null, { abilityId: 'volley' })], four).usedExtra).toHaveLength(0);
  });

  it('from level 5 a defeated enemy heals', () => {
    const r = applyAbilityActions([char({ subclassId: 'warrior_berserker', xp: LV5 })], [use('p1')], four);
    expect(r.effects.attackMods!.p1.healOnDefeat).toBe(2);
  });
});

describe('archer subclasses', () => {
  const archer = (over: Partial<Character> = {}) => char({ classId: 'archer', weaponId: 'shortbow', ...over });

  it('hunter: precise shot also removes a pip more from strong and boss enemies', () => {
    const r = applyAbilityActions([archer({ subclassId: 'archer_hunter' })], [use('p1')], four);
    expect(r.effects.attackMods).toEqual({ p1: { extraPipsVs: { tiers: ['strong', 'boss'], pips: 1 } } });
    expect(r.used).toEqual(['p1']);
    expect(r.damage.p1).toBeGreaterThan(0);
  });

  it('skirmisher: volley is 2 shots, 3 from level 5, with its own cooldown', () => {
    const r2 = applyAbilityActions([archer({ subclassId: 'archer_skirmisher' })], [use('p1')], four);
    expect(r2.effects.attackMods).toEqual({ p1: { shots: 2 } });
    expect(r2.usedExtra).toEqual([{ playerId: 'p1', abilityId: 'volley', cooldown: 3 }]);
    expect(r2.damage).toEqual({});
    const r3 = applyAbilityActions([archer({ subclassId: 'archer_skirmisher', xp: LV5 })], [use('p1')], four);
    expect(r3.effects.attackMods!.p1.shots).toBe(3);
  });

  it('an archer with no subclass gets no modifiers', () => {
    expect(applyAbilityActions([archer()], [use('p1')], four).effects.attackMods).toBeUndefined();
  });
});

describe('cleric subclasses', () => {
  const cleric = (over: Partial<Character> = {}) => char({ classId: 'cleric', weaponId: 'staff', ...over });

  it('life: heals 2 more and cools down in 2', () => {
    const r = applyAbilityActions([cleric({ subclassId: 'cleric_life' }), friend({ hp: 5 })], [use('p1', 'p2')], four);
    expect(r.characters[1].hp).toBe(5 + 4 + 1 + 2);
    expect(tickCooldowns(r.characters, false, r.used)[0].abilityCooldown).toBe(2);
  });

  it('radiant: heals one tier lower, and enemies that fail the WIS save are dazed', () => {
    // DC = 8 + 2 + 0 = 10; normal enemy save bonus +2. A 5 totals 7 (fails), a 12 totals 14 (saves).
    const rolls = [5, 12];
    let i = 0;
    const roll = (sides: number) => (sides === 20 ? rolls[i++] : 4);
    const r = applyAbilityActions([cleric({ subclassId: 'cleric_radiant' }), friend({ hp: 5 })], [use('p1', 'p2')], roll, enc(wolf, bear));
    expect(r.characters[1].hp).toBe(5 + 4); // light 1d4 (not medium 1d6+1)
    expect(r.effects.enemy).toEqual({ หมาป่า: ['dazed'] });
    expect(r.rolls).toEqual([
      expect.objectContaining({ kind: 'save', target: 'หมาป่า', die: 5, dc: 10, success: false, playerDisplayName: 'Prem' }),
      expect.objectContaining({ kind: 'save', target: 'หมี', die: 12, dc: 10, success: true }),
    ]);
    expect(r.notes.p1).toContain('หมาป่า');
    expect(r.used).toEqual(['p1']);
  });

  it('radiant: works on a full-HP target (no heal, the light still acts) and without a fight just heals', () => {
    const r = applyAbilityActions([cleric({ subclassId: 'cleric_radiant' }), friend()], [use('p1', 'p2')], () => 1, enc(wolf));
    expect(r.characters[1].hp).toBe(20);
    expect(r.effects.enemy).toEqual({ หมาป่า: ['dazed'] });
    const calm = applyAbilityActions([cleric({ subclassId: 'cleric_radiant' }), friend({ hp: 10 })], [use('p1', 'p2')], four);
    expect(calm.characters[1].hp).toBe(14);
    expect(calm.effects.enemy).toEqual({});
  });

  it('a plain cleric still refuses to heal someone who is not hurt', () => {
    const r = applyAbilityActions([cleric(), friend()], [use('p1', 'p2')], four);
    expect(r.used).toEqual([]);
  });
});

describe('rogue subclasses', () => {
  const rogue = (over: Partial<Character> = {}) => char({ classId: 'rogue', weaponId: 'dagger', ...over });

  it('assassin: backstab attacks with advantage and punishes a fresh enemy', () => {
    const r = applyAbilityActions([rogue({ subclassId: 'rogue_assassin' })], [use('p1')], four);
    expect(r.effects.attackMods).toEqual({ p1: { advantage: true, extraPipIfFull: 1 } });
    expect(r.used).toEqual(['p1']);
  });

  it('trickster: feint makes the enemy save; failing means dazed and exposed, passing still exposed; rogue AC +2', () => {
    // DC = 8 + 2 + DEX mod 0 = 10, normal enemy save +2
    const trickster = () => rogue({ subclassId: 'rogue_trickster' });
    const failed = applyAbilityActions([trickster()], [use('p1', null, { itemTarget: 'หมาป่า' })], (s) => (s === 20 ? 5 : 4), enc(wolf));
    expect(failed.effects.enemy).toEqual({ หมาป่า: ['exposed', 'dazed'] });
    expect(failed.effects.acBonus).toEqual({ p1: 2 });
    expect(failed.rolls[0]).toMatchObject({ kind: 'save', die: 5, total: 7, dc: 10, success: false, spellNameTh: 'หลอกล่อ' });
    expect(failed.usedExtra).toEqual([{ playerId: 'p1', abilityId: 'feint', cooldown: 3 }]);

    const saved = applyAbilityActions([trickster()], [use('p1', null, { itemTarget: 'หมาป่า' })], (s) => (s === 20 ? 12 : 4), enc(wolf));
    expect(saved.effects.enemy).toEqual({ หมาป่า: ['exposed'] });
    expect(saved.rolls[0].success).toBe(true);
  });

  it('trickster: feint needs a live enemy target, otherwise it is refused and costs nothing', () => {
    const trickster = rogue({ subclassId: 'rogue_trickster' });
    const none = applyAbilityActions([trickster], [use('p1')], four, null);
    expect(none.usedExtra).toEqual([]);
    expect(none.notes.p1).toBe('tried to use หลอกล่อ but there was no enemy of that name still standing');
    const wrong = applyAbilityActions([trickster], [use('p1', null, { itemTarget: 'มังกร' })], four, enc(wolf));
    expect(wrong.usedExtra).toEqual([]);
    expect(wrong.effects.acBonus).toEqual({});
  });
});
