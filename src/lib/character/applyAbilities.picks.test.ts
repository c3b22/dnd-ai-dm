import { describe, it, expect } from 'vitest';
import { applyAbilityActions, cooldownOf, tickCooldowns } from './applyAbilities';
import { applySpellActions } from './applySpells';
import { spellSlotsOf } from './spells';
import type { Character } from './types';
import type { Encounter } from '@/lib/combat/encounter';

const char = (over: Partial<Character> = {}): Character => ({
  id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0,
  classId: 'warrior', abilityCooldown: 0, xp: 600, abilityPicks: { '6': 'warrior_war_cry' }, ...over,
});
const friend = (over: Partial<Character> = {}) => char({ id: 'p2', displayName: 'Suki', classId: 'archer', weaponId: 'shortbow', abilityPicks: undefined, ...over });
const use = (playerId: string, abilityId: string, extra: object = {}) => ({ playerId, useAbility: true, abilityId, ...extra });
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
const bear = { name: 'หมี', tier: 'strong' as const, pip: 3, maxPip: 3, fled: false };
const boss = { name: 'มังกร', tier: 'boss' as const, pip: 5, maxPip: 5, fled: false };
const enc = (...enemies: Encounter['enemies']): Encounter => ({ enemies });
const always = (n: number) => () => n;

describe('picked active abilities: gating and cooldowns (K6)', () => {
  it('works only for a character that picked it; each ability keeps its own cooldown in the map', () => {
    const r = applyAbilityActions([char(), friend()], [use('p1', 'warrior_war_cry')], always(1), enc(wolf));
    expect(r.usedExtra).toEqual([{ playerId: 'p1', abilityId: 'warrior_war_cry', cooldown: 4 }]);
    expect(r.usedAbilities).toEqual([{ playerId: 'p1', abilityId: 'warrior_war_cry' }]);
    expect(r.used).toEqual([]);

    const after = tickCooldowns(r.characters, false, r.used, r.usedExtra);
    expect(cooldownOf(after[0], 'warrior_war_cry')).toBe(4);
    expect(cooldownOf(after[0], 'warrior')).toBe(0);
    const again = applyAbilityActions(after, [use('p1', 'warrior_war_cry')], always(1), enc(wolf));
    expect(again.usedExtra).toEqual([]);
    expect(again.notes.p1).toBe('tried to use เสียงคำราม but it was not ready');
    // it ticks down one per eventful round
    expect(cooldownOf(tickCooldowns(after, true, []).find((c) => c.id === 'p1')!, 'warrior_war_cry')).toBe(3);
  });

  it('refuses an ability the character did not pick, another class ability, a passive and a downed user', () => {
    const none = applyAbilityActions([char({ abilityPicks: undefined })], [use('p1', 'warrior_war_cry')], always(1), enc(wolf));
    expect(none.usedExtra).toEqual([]);
    const otherClass = applyAbilityActions([char({ abilityPicks: { '6': 'archer_snare' } })], [use('p1', 'archer_snare', { itemTarget: 'หมาป่า' })], always(1), enc(wolf));
    expect(otherClass.usedExtra).toEqual([]);
    const passive = applyAbilityActions([char({ abilityPicks: { '6': 'warrior_stone_skin' } })], [use('p1', 'warrior_stone_skin')], always(1), enc(wolf));
    expect(passive.usedExtra).toEqual([]);
    const downed = applyAbilityActions([char({ status: 'downed' })], [use('p1', 'warrior_war_cry')], always(1), enc(wolf));
    expect(downed.usedExtra).toEqual([]);
  });

  it('the main class ability still works next to a pick', () => {
    const r = applyAbilityActions([char(), friend()], [{ playerId: 'p1', useAbility: true, abilityTargetId: 'p2' }], always(1), enc(wolf));
    expect(r.guards).toEqual({ p2: 'p1' });
    expect(r.used).toEqual(['p1']);
  });
});

describe('warrior picks', () => {
  it('war cry: every standing enemy saves against STR DC; a failed save daze them, a passed one does not; the cooldown starts either way', () => {
    // DC = 8 + prof 3 + STR mod 0 = 11; normal +2, strong +4: die 1 always fails, die 20 always passes
    const fail = applyAbilityActions([char()], [use('p1', 'warrior_war_cry')], always(1), enc(wolf, bear));
    expect(fail.effects.enemy).toEqual({ หมาป่า: ['dazed'], หมี: ['dazed'] });
    expect(fail.rolls.map((r) => [r.target, r.dc, r.success])).toEqual([['หมาป่า', 11, false], ['หมี', 11, false]]);
    const pass = applyAbilityActions([char()], [use('p1', 'warrior_war_cry')], always(20), enc(wolf, bear));
    expect(pass.effects.enemy).toEqual({});
    expect(pass.usedExtra).toHaveLength(1);
  });

  it('war cry: refused with no fight, and does not touch the input encounter', () => {
    expect(applyAbilityActions([char()], [use('p1', 'warrior_war_cry')], always(1), null).usedExtra).toEqual([]);
    const fight = enc(wolf);
    applyAbilityActions([char()], [use('p1', 'warrior_war_cry')], always(1), fight);
    expect(fight.enemies[0].pip).toBe(2);
  });

  it('sweep: sets two swings for this round and starts cooldown 4', () => {
    const r = applyAbilityActions([char({ abilityPicks: { '9': 'warrior_sweep' } })], [use('p1', 'warrior_sweep')], always(1), enc(wolf, bear));
    expect(r.effects.attackMods).toEqual({ p1: { spread: 2 } });
    expect(r.usedExtra).toEqual([{ playerId: 'p1', abilityId: 'warrior_sweep', cooldown: 4 }]);
  });
});

describe('archer picks', () => {
  const archer = (picks: Record<string, string>) => char({ classId: 'archer', weaponId: 'shortbow', abilityPicks: picks });

  it('snare: the named enemy saves against DEX DC; a failed save stuns it (a boss is only dazed)', () => {
    const r = applyAbilityActions([archer({ '6': 'archer_snare' })], [use('p1', 'archer_snare', { itemTarget: 'หมี' })], always(1), enc(wolf, bear));
    expect(r.effects.enemy).toEqual({ หมี: ['stunned'] });
    expect(r.rolls[0]).toMatchObject({ target: 'หมี', dc: 11, success: false });
    const big = applyAbilityActions([archer({ '6': 'archer_snare' })], [use('p1', 'archer_snare', { itemTarget: 'มังกร' })], always(1), enc(boss));
    expect(big.effects.enemy).toEqual({ มังกร: ['dazed'] });
    const saved = applyAbilityActions([archer({ '6': 'archer_snare' })], [use('p1', 'archer_snare', { itemTarget: 'หมี' })], always(20), enc(bear));
    expect(saved.effects.enemy).toEqual({});
    expect(saved.usedExtra).toHaveLength(1);
  });

  it('snare: needs a standing enemy of that name, otherwise nothing starts a cooldown', () => {
    const r = applyAbilityActions([archer({ '6': 'archer_snare' })], [use('p1', 'archer_snare', { itemTarget: 'ผี' })], always(1), enc(wolf));
    expect(r.usedExtra).toEqual([]);
    expect(r.notes.p1).toContain('no enemy of that name');
  });

  it('piercing arrow: advantage, at least 2 pips, 3 on a natural 20, ignores trait armor class', () => {
    const r = applyAbilityActions([archer({ '9': 'archer_piercing_arrow' })], [use('p1', 'archer_piercing_arrow')], always(1), enc(wolf));
    expect(r.effects.attackMods).toEqual({ p1: { advantage: true, minPips: 2, critPips: 3, ignoreTraitAc: true } });
    expect(r.usedExtra[0].cooldown).toBe(3);
  });
});

describe('cleric picks', () => {
  const cleric = (picks: Record<string, string>, over: Partial<Character> = {}) =>
    char({ classId: 'cleric', weaponId: 'mace', abilityPicks: picks, ...over });

  it('ward prayer: every standing friend gets AC +2, a downed one does not', () => {
    const party = [cleric({ '6': 'cleric_ward_prayer' }), friend(), friend({ id: 'p3', displayName: 'Nok', status: 'downed' })];
    const r = applyAbilityActions(party, [use('p1', 'cleric_ward_prayer')], always(4), null);
    expect(r.effects.acBonus).toEqual({ p1: 2, p2: 2 });
    expect(r.usedExtra[0].cooldown).toBe(4);
  });

  it('mass heal: each hurt friend recovers a medium heal, the cleric does not, and it needs somebody hurt', () => {
    const party = [cleric({ '9': 'cleric_mass_heal' }, { hp: 5 }), friend({ hp: 10 }), friend({ id: 'p3', displayName: 'Nok', hp: 19 }), friend({ id: 'p4', displayName: 'Fon' })];
    const r = applyAbilityActions(party, [use('p1', 'cleric_mass_heal')], always(4), null);
    // 1d6+1 with every die 4 = 5, capped by missing HP
    expect(r.characters.map((c) => c.hp)).toEqual([5, 15, 20, 20]);
    expect(r.usedExtra[0]).toMatchObject({ abilityId: 'cleric_mass_heal', cooldown: 5 });
    const nobody = applyAbilityActions([cleric({ '9': 'cleric_mass_heal' }, { hp: 5 }), friend()], [use('p1', 'cleric_mass_heal')], always(4), null);
    expect(nobody.usedExtra).toEqual([]);
  });

  it('smite: the attack uses WIS and removes at least 2 pips', () => {
    const r = applyAbilityActions([cleric({ '9': 'cleric_smite' })], [use('p1', 'cleric_smite')], always(1), enc(wolf));
    expect(r.effects.attackMods).toEqual({ p1: { attackAbility: 'WIS', minPips: 2, critPips: 3 } });
    expect(r.usedExtra[0].cooldown).toBe(3);
  });

  it('twin spark: healing a friend also heals the most hurt other friend for half, never the cleric or the first target', () => {
    const party = [
      cleric({ '6': 'cleric_twin_spark' }, { hp: 3 }),
      friend({ hp: 10 }),
      friend({ id: 'p3', displayName: 'Nok', hp: 6 }),
      friend({ id: 'p4', displayName: 'Fon', hp: 12 }),
    ];
    // main ability heals the target (medium tier before level 5? the cleric is level 6 so heavy 2d6) with every die 4 = 8
    const r = applyAbilityActions(party, [{ playerId: 'p1', useAbility: true, abilityTargetId: 'p2' }], always(4), null);
    expect(r.characters.find((c) => c.id === 'p2')!.hp).toBe(18);
    expect(r.characters.find((c) => c.id === 'p3')!.hp).toBe(10); // +4 (half of 8)
    expect(r.characters.find((c) => c.id === 'p4')!.hp).toBe(12);
    expect(r.characters.find((c) => c.id === 'p1')!.hp).toBe(3);
    expect(r.notes.p1).toContain('twin spark');
    // without the pick only the target heals
    const plain = applyAbilityActions(party.map((c) => ({ ...c, abilityPicks: undefined })), [{ playerId: 'p1', useAbility: true, abilityTargetId: 'p2' }], always(4), null);
    expect(plain.characters.find((c) => c.id === 'p3')!.hp).toBe(6);
  });

  it('twin spark: healing yourself does not trigger it', () => {
    const party = [cleric({ '6': 'cleric_twin_spark' }, { hp: 3 }), friend({ hp: 10 })];
    const r = applyAbilityActions(party, [{ playerId: 'p1', useAbility: true, abilityTargetId: 'p1' }], always(4), null);
    expect(r.characters.find((c) => c.id === 'p2')!.hp).toBe(10);
  });
});

describe('rogue picks', () => {
  const rogue = (picks: Record<string, string>) => char({ classId: 'rogue', weaponId: 'dagger', abilityPicks: picks });

  it('smoke veil: every standing enemy is dazed with no save', () => {
    const r = applyAbilityActions([rogue({ '6': 'rogue_smoke_veil' })], [use('p1', 'rogue_smoke_veil')], always(1), enc(wolf, bear, { ...wolf, name: 'หนี', fled: true }));
    expect(r.effects.enemy).toEqual({ หมาป่า: ['dazed'], หมี: ['dazed'] });
    expect(r.rolls).toEqual([]);
    expect(r.usedExtra[0].cooldown).toBe(5);
  });

  it('shadow step: the rogue is hidden this round', () => {
    const r = applyAbilityActions([rogue({ '9': 'rogue_shadow_step' })], [use('p1', 'rogue_shadow_step')], always(1), null);
    expect([...r.effects.hidden!]).toEqual(['p1']);
    expect(r.usedExtra[0].cooldown).toBe(5);
  });
});

describe('mage picks', () => {
  const mage = (picks: Record<string, string>, over: Partial<Character> = {}): Character =>
    char({ id: 'm1', displayName: 'Mira', classId: 'mage', weaponId: 'wand', abilityPicks: picks, abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 }, ...over });

  it('recover: gives back 2 spell slots (not above the max), takes the whole action and starts cooldown 6', () => {
    const r = applyAbilityActions([mage({ '6': 'mage_recover' }, { spellSlotsUsed: 3 })], [use('m1', 'mage_recover')], always(1), null);
    expect(spellSlotsOf(r.characters[0])).toEqual({ current: 3, max: 4 });
    expect(r.actionSpent).toEqual(['m1']);
    expect(r.usedExtra).toEqual([{ playerId: 'm1', abilityId: 'mage_recover', cooldown: 6 }]);
    const one = applyAbilityActions([mage({ '6': 'mage_recover' }, { spellSlotsUsed: 1 })], [use('m1', 'mage_recover')], always(1), null);
    expect(spellSlotsOf(one.characters[0])).toEqual({ current: 4, max: 4 });
  });

  it('recover: refused when the slots are full', () => {
    const r = applyAbilityActions([mage({ '6': 'mage_recover' })], [use('m1', 'mage_recover')], always(1), null);
    expect(r.usedExtra).toEqual([]);
    expect(r.actionSpent).toEqual([]);
  });

  it('a mage that spent the action on recover casts nothing; a refused recover still lets the spell go', () => {
    const casting = { playerId: 'm1', useAbility: true, abilityId: 'mage_recover', spellId: 'arcane_bolt', itemTarget: 'หมาป่า' };
    const m = mage({ '6': 'mage_recover' }, { spellSlotsUsed: 3 });
    const spent = applyAbilityActions([m], [casting], always(1), enc(wolf));
    const noCast = applySpellActions({ characters: spent.characters, actions: [casting], encounter: enc(wolf), rollDie: () => 15, actionSpent: spent.actionSpent });
    expect(noCast.casters).toEqual([]);
    expect(noCast.encounter!.enemies[0].pip).toBe(2);
    const refused = applyAbilityActions([mage({ '6': 'mage_recover' })], [casting], always(1), enc(wolf));
    const cast = applySpellActions({ characters: refused.characters, actions: [casting], encounter: enc(wolf), rollDie: () => 15, actionSpent: refused.actionSpent });
    expect(cast.casters).toEqual(['m1']);
  });

  it('meteor: every standing enemy that fails the spell DC save loses 2 pips, no slot is spent and the action is taken', () => {
    // DC = 8 + prof 4 (level 9) + INT +2 = 14; die 1 fails
    const fight = enc(wolf, bear);
    const r = applyAbilityActions([mage({ '9': 'mage_meteor' }, { xp: 1320 })], [use('m1', 'mage_meteor')], always(1), fight);
    expect(r.encounter!.enemies.map((e) => e.pip)).toEqual([0, 1]);
    expect(r.rolls.map((x) => [x.dc, x.success, x.pips])).toEqual([[14, false, 2], [14, false, 2]]);
    expect(r.characters[0].spellSlotsUsed ?? 0).toBe(0);
    expect(r.actionSpent).toEqual(['m1']);
    expect(r.usedExtra[0]).toMatchObject({ abilityId: 'mage_meteor', cooldown: 5 });
    expect(fight.enemies.map((e) => e.pip)).toEqual([2, 3]); // the input is untouched
  });

  it('meteor: enemies that pass lose nothing, and without a fight it is refused', () => {
    const r = applyAbilityActions([mage({ '9': 'mage_meteor' }, { xp: 1320 })], [use('m1', 'mage_meteor')], always(20), enc(wolf));
    expect(r.encounter!.enemies[0].pip).toBe(2);
    expect(r.usedExtra).toHaveLength(1);
    expect(applyAbilityActions([mage({ '9': 'mage_meteor' }, { xp: 1320 })], [use('m1', 'mage_meteor')], always(1), null).usedExtra).toEqual([]);
  });

  it('the evoker subclass adds its DC bonus to the meteor', () => {
    const r = applyAbilityActions([mage({ '9': 'mage_meteor' }, { xp: 1320, subclassId: 'mage_evoker' })], [use('m1', 'mage_meteor')], always(1), enc(wolf));
    expect(r.rolls[0].dc).toBe(15);
  });
});
