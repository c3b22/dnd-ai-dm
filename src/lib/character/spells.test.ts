import { describe, it, expect } from 'vitest';
import {
  SPELLS, SPELL_IDS, isSpellId, mageSpellSlots, spellSlotsOf, withSpellSlots, spendSpellSlot, spellSaveDc, spellAttackBonus,
  rollEnemySave, resolveSpell, emptyRoundEffects,
} from './spells';
import { MAGE_SPELL_SLOTS } from './spellConstants';
import { LEVEL_XP_THRESHOLDS } from './constants';
import type { Character } from './types';
import type { Encounter } from '@/lib/combat/encounter';

const mage = (over: Partial<Character> = {}): Character => ({
  id: 'm1', displayName: 'Mira', weaponId: 'wand', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0,
  classId: 'mage', xp: 0, abilityCooldown: 0, abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 }, ...over,
});
const friend = (over: Partial<Character> = {}): Character => ({
  id: 'p2', displayName: 'Nok', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, classId: 'warrior', xp: 0, abilityCooldown: 0, ...over,
});
type Tier = 'minion' | 'normal' | 'strong' | 'boss';
const enc = (...specs: [string, Tier][]): Encounter => ({
  enemies: specs.map(([name, tier]) => {
    const maxPip = { minion: 1, normal: 2, strong: 3, boss: 5 }[tier];
    return { name, tier, pip: maxPip, maxPip, fled: false };
  }),
});
const seq = (...values: number[]) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
const xpFor = (level: number) => LEVEL_XP_THRESHOLDS[level - 1];

describe('spell data', () => {
  it('has 12 spells, 3 cantrips and 9 slot spells, all with Thai text', () => {
    expect(SPELL_IDS).toHaveLength(12);
    expect(SPELL_IDS.filter((id) => SPELLS[id].slots === 0)).toEqual(['arcane_bolt', 'scatter_spark', 'arcane_sight']);
    for (const id of SPELL_IDS) {
      expect(SPELLS[id].id).toBe(id);
      expect(SPELLS[id].nameTh).toBeTruthy();
      expect(SPELLS[id].descTh).toBeTruthy();
    }
    expect(isSpellId('fire_burst')).toBe(true);
    expect(isSpellId('toString')).toBe(false);
  });
  it('slot table runs 2 at level 1 to 6 at level 10', () => {
    expect(MAGE_SPELL_SLOTS).toEqual({ 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 5, 9: 6, 10: 6 });
    expect([1, 5, 10].map(mageSpellSlots)).toEqual([2, 4, 6]);
  });
  it('DC is 8 + proficiency + INT mod and attack bonus is proficiency + INT mod', () => {
    expect(spellSaveDc(mage())).toBe(12);
    expect(spellAttackBonus(mage())).toBe(4);
    expect(spellSaveDc(mage({ xp: xpFor(9), abilities: { STR: 8, DEX: 14, CON: 13, INT: 19, WIS: 12, CHA: 10 } }))).toBe(16);
  });
});

describe('slot accounting', () => {
  it('only mages have slots; remaining = max - used', () => {
    expect(spellSlotsOf(friend())).toBeNull();
    expect(spellSlotsOf(mage())).toEqual({ current: 2, max: 2 });
    expect(spellSlotsOf(mage({ spellSlotsUsed: 1 }))).toEqual({ current: 1, max: 2 });
    expect(spellSlotsOf(mage({ spellSlotsUsed: 9 }))).toEqual({ current: 0, max: 2 });
  });
  it('growing a level raises current by the same amount', () => {
    expect(spellSlotsOf(mage({ xp: xpFor(3), spellSlotsUsed: 2 }))).toEqual({ current: 1, max: 3 });
  });
  it('withSpellSlots and spendSpellSlot write spellSlotsUsed', () => {
    expect(withSpellSlots(mage(), { current: 0, max: 2 }).spellSlotsUsed).toBe(2);
    expect(spendSpellSlot(mage()).spellSlotsUsed).toBe(1);
  });
  it('enemy save: nat 20 always passes, nat 1 always fails', () => {
    expect(rollEnemySave({ tier: 'boss', dc: 30, die: 20 }).saved).toBe(true);
    expect(rollEnemySave({ tier: 'boss', dc: 5, die: 1 }).saved).toBe(false);
    expect(rollEnemySave({ tier: 'normal', dc: 12, die: 10 })).toMatchObject({ total: 12, saved: true });
    expect(rollEnemySave({ tier: 'minion', dc: 12, die: 11 })).toMatchObject({ total: 11, saved: false });
  });
});

describe('resolveSpell: refusals cost nothing', () => {
  const base = { caster: mage(), allies: [mage(), friend()], encounter: enc(['Wolf', 'normal']), d20: seq(15) };
  it('refuses non-mages, unknown spells, downed casters', () => {
    expect(resolveSpell({ ...base, caster: friend(), spellId: 'arcane_bolt', target: 'Wolf' })).toMatchObject({ ok: false, reason: 'not_mage' });
    expect(resolveSpell({ ...base, spellId: 'nope', target: 'Wolf' })).toMatchObject({ ok: false, reason: 'unknown_spell' });
    expect(resolveSpell({ ...base, caster: mage({ status: 'downed', hp: 0 }), spellId: 'arcane_bolt', target: 'Wolf' })).toMatchObject({ ok: false, reason: 'not_active' });
  });
  it('refuses with no slots but allows a cantrip', () => {
    const empty = mage({ spellSlotsUsed: 2 });
    const r = resolveSpell({ ...base, caster: empty, spellId: 'frost_lance', target: 'Wolf' });
    expect(r).toMatchObject({ ok: false, reason: 'no_slots', slotCost: 0 });
    expect(r.caster.spellSlotsUsed).toBe(2);
    expect(r.encounter).toEqual(base.encounter);
    expect(resolveSpell({ ...base, caster: empty, spellId: 'arcane_bolt', target: 'Wolf' }).ok).toBe(true);
  });
  it('refuses attack spells without an encounter or a live target', () => {
    expect(resolveSpell({ ...base, encounter: null, spellId: 'arcane_bolt', target: 'Wolf' })).toMatchObject({ ok: false, reason: 'no_encounter' });
    expect(resolveSpell({ ...base, spellId: 'arcane_bolt', target: 'Ghost' })).toMatchObject({ ok: false, reason: 'bad_target' });
    expect(resolveSpell({ ...base, spellId: 'arcane_bolt' })).toMatchObject({ ok: false, reason: 'bad_target' });
  });
  it('refuses ally spells aimed at a downed friend; quicken needs a friend, not self', () => {
    const downed = friend({ status: 'downed', hp: 0 });
    expect(resolveSpell({ ...base, allies: [mage(), downed], spellId: 'arcane_shield', target: 'p2' })).toMatchObject({ ok: false, reason: 'bad_target' });
    expect(resolveSpell({ ...base, spellId: 'quicken_rhythm', target: 'm1' })).toMatchObject({ ok: false, reason: 'bad_target' });
  });
  it('refuses quicken when the friend has no cooldown running (slot kept)', () => {
    const r = resolveSpell({ ...base, spellId: 'quicken_rhythm', target: 'p2' });
    expect(r).toMatchObject({ ok: false, reason: 'no_effect' });
    expect(r.caster.spellSlotsUsed ?? 0).toBe(0);
  });
});

describe('resolveSpell: attack spells', () => {
  it('arcane_bolt hits for 1 pip, costs no slot, and uses prof + INT against the enemy AC', () => {
    // Wolf normal AC 13; d20 9 + 4 = 13 hits.
    const r = resolveSpell({ caster: mage(), allies: [mage()], encounter: enc(['Wolf', 'normal']), spellId: 'arcane_bolt', target: 'Wolf', d20: seq(9) });
    expect(r.ok).toBe(true);
    expect(r.slotCost).toBe(0);
    expect(r.caster.spellSlotsUsed ?? 0).toBe(0);
    expect(r.rolls).toHaveLength(1);
    expect(r.rolls[0]).toMatchObject({ kind: 'attack', target: 'Wolf', die: 9, total: 13, dc: 13, success: true, pips: 1 });
    expect(r.encounter?.enemies[0].pip).toBe(1);
  });
  it('arcane_bolt misses below AC; nat 20 deals 2 pips', () => {
    const miss = resolveSpell({ caster: mage(), allies: [mage()], encounter: enc(['Wolf', 'normal']), spellId: 'arcane_bolt', target: 'Wolf', d20: seq(8) });
    expect(miss.rolls[0]).toMatchObject({ success: false, pips: 0 });
    expect(miss.encounter?.enemies[0].pip).toBe(2);
    const crit = resolveSpell({ caster: mage(), allies: [mage()], encounter: enc(['Ogre', 'strong']), spellId: 'arcane_bolt', target: 'Ogre', d20: seq(20) });
    expect(crit.rolls[0]).toMatchObject({ critical: 'success', pips: 2 });
    expect(crit.encounter?.enemies[0].pip).toBe(1);
  });
  it('arcane_bolt fires 2 bolts at level 5 and 3 at level 9, moving on when the target falls', () => {
    const l5 = resolveSpell({ caster: mage({ xp: xpFor(5) }), allies: [], encounter: enc(['A', 'minion'], ['B', 'normal']), spellId: 'arcane_bolt', target: 'A', d20: seq(18, 18) });
    expect(l5.rolls.map((x) => x.target)).toEqual(['A', 'B']);
    expect(l5.encounter?.enemies.map((e) => e.pip)).toEqual([0, 1]);
    const l9 = resolveSpell({ caster: mage({ xp: xpFor(9) }), allies: [], encounter: enc(['A', 'strong']), spellId: 'arcane_bolt', target: 'A', d20: seq(18) });
    expect(l9.rolls).toHaveLength(3);
    expect(l9.encounter?.enemies[0].pip).toBe(0);
  });
  it('frost_lance costs a slot, deals 2 pips (3 at level 7) and dazes the target', () => {
    const r = resolveSpell({ caster: mage(), allies: [mage()], encounter: enc(['Ogre', 'strong']), spellId: 'frost_lance', target: 'Ogre', d20: seq(15) });
    expect(r.slotCost).toBe(1);
    expect(r.caster.spellSlotsUsed).toBe(1);
    expect(r.encounter?.enemies[0].pip).toBe(1);
    expect(r.effects.enemy.Ogre).toEqual(['dazed']);
    const hi = resolveSpell({ caster: mage({ xp: xpFor(7) }), allies: [], encounter: enc(['Ogre', 'strong']), spellId: 'frost_lance', target: 'Ogre', d20: seq(15) });
    expect(hi.encounter?.enemies[0].pip).toBe(0);
  });
  it('a missed frost_lance still spends the slot but does not daze', () => {
    const r = resolveSpell({ caster: mage(), allies: [], encounter: enc(['Ogre', 'strong']), spellId: 'frost_lance', target: 'Ogre', d20: seq(2) });
    expect(r.ok).toBe(true);
    expect(r.caster.spellSlotsUsed).toBe(1);
    expect(r.effects.enemy.Ogre).toBeUndefined();
  });
  it('a boss at full pips cannot be killed by one lance', () => {
    const r = resolveSpell({ caster: mage({ xp: xpFor(9) }), allies: [], encounter: enc(['King', 'boss']), spellId: 'frost_lance', target: 'King', d20: seq(20) });
    expect(r.encounter?.enemies[0].pip).toBeGreaterThanOrEqual(1);
  });
  it('the surge makes the spell free and adds +2 to the attack at level 5+', () => {
    const l5 = mage({ xp: xpFor(5) }); // bonus +3 prof +2 INT = +5; AC 13
    const without = resolveSpell({ caster: l5, allies: [], encounter: enc(['Wolf', 'normal']), spellId: 'frost_lance', target: 'Wolf', d20: seq(6) });
    expect(without.rolls[0].success).toBe(false);
    const surged = resolveSpell({ caster: l5, allies: [], encounter: enc(['Wolf', 'normal']), spellId: 'frost_lance', target: 'Wolf', surge: true, d20: seq(6) });
    expect(surged.slotCost).toBe(0);
    expect(surged.caster.spellSlotsUsed ?? 0).toBe(0);
    expect(surged.rolls[0]).toMatchObject({ total: 13, success: true });
    const low = resolveSpell({ caster: mage(), allies: [], encounter: enc(['Wolf', 'normal']), spellId: 'frost_lance', target: 'Wolf', surge: true, d20: seq(8) });
    expect(low.rolls[0].total).toBe(12);
  });
  it('armored enemies are harder to hit and advantage rolls two dice', () => {
    const armored: Encounter = { enemies: [{ name: 'Knight', tier: 'normal', pip: 2, maxPip: 2, fled: false, traits: ['armored'] }] };
    const r = resolveSpell({ caster: mage(), allies: [], encounter: armored, spellId: 'arcane_bolt', target: 'Knight', d20: seq(9) });
    expect(r.rolls[0]).toMatchObject({ dc: 15, success: false });
    const adv = resolveSpell({ caster: mage(), allies: [], encounter: enc(['Wolf', 'normal']), spellId: 'arcane_bolt', target: 'Wolf', advantage: 'advantage', d20: seq(2, 12) });
    expect(adv.rolls[0]).toMatchObject({ die: 12, success: true });
  });
  it('does not mutate the input encounter', () => {
    const e = enc(['Wolf', 'normal']);
    resolveSpell({ caster: mage(), allies: [], encounter: e, spellId: 'arcane_bolt', target: 'Wolf', d20: seq(20) });
    expect(e.enemies[0].pip).toBe(2);
  });
});

describe('resolveSpell: save spells', () => {
  it('scatter_spark hits the target and the next enemy in the list; failing the save costs 1 pip', () => {
    // DC 12. Normal save bonus +2: d20 5 -> 7 fails; d20 10 -> 12 saves.
    const r = resolveSpell({ caster: mage(), allies: [], encounter: enc(['A', 'normal'], ['B', 'normal'], ['C', 'normal']), spellId: 'scatter_spark', target: 'B', d20: seq(5, 10) });
    expect(r.slotCost).toBe(0);
    expect(r.rolls.map((x) => [x.target, x.kind, x.dc, x.success])).toEqual([['B', 'save', 12, false], ['C', 'save', 12, true]]);
    expect(r.encounter?.enemies.map((e) => e.pip)).toEqual([2, 1, 2]);
  });
  it('scatter_spark reaches 3 targets at level 5', () => {
    const r = resolveSpell({ caster: mage({ xp: xpFor(5) }), allies: [], encounter: enc(['A', 'minion'], ['B', 'minion'], ['C', 'minion'], ['D', 'minion']), spellId: 'scatter_spark', target: 'A', d20: seq(1) });
    expect(r.rolls).toHaveLength(3);
  });
  it('fire_burst hits every live enemy up to 6, 2 pips from level 7', () => {
    const eight = enc(...Array.from({ length: 8 }, (_, i): [string, Tier] => [`E${i}`, 'normal']));
    const r = resolveSpell({ caster: mage(), allies: [], encounter: eight, spellId: 'fire_burst', d20: seq(1) });
    expect(r.ok).toBe(true);
    expect(r.rolls).toHaveLength(6);
    expect(r.encounter?.enemies.map((e) => e.pip)).toEqual([1, 1, 1, 1, 1, 1, 2, 2]);
    const hi = resolveSpell({ caster: mage({ xp: xpFor(7) }), allies: [], encounter: enc(['A', 'normal']), spellId: 'fire_burst', d20: seq(1) });
    expect(hi.encounter?.enemies[0].pip).toBe(0);
  });
  it('skips fled and defeated enemies', () => {
    const e: Encounter = { enemies: [
      { name: 'Gone', tier: 'normal', pip: 0, maxPip: 2, fled: false },
      { name: 'Ran', tier: 'normal', pip: 2, maxPip: 2, fled: true },
      { name: 'Here', tier: 'normal', pip: 2, maxPip: 2, fled: false },
    ] };
    const r = resolveSpell({ caster: mage(), allies: [], encounter: e, spellId: 'fire_burst', d20: seq(1) });
    expect(r.rolls.map((x) => x.target)).toEqual(['Here']);
  });
  it('the surge adds +2 to the DC at level 5+', () => {
    const r = resolveSpell({ caster: mage({ xp: xpFor(5) }), allies: [], encounter: enc(['A', 'normal']), spellId: 'fire_burst', surge: true, d20: seq(1) });
    expect(r.rolls[0].dc).toBe(15);
  });
  it('hold_foe stuns on a failed save, but a boss is only dazed; a save blocks it', () => {
    const stun = resolveSpell({ caster: mage(), allies: [], encounter: enc(['Wolf', 'normal']), spellId: 'hold_foe', target: 'Wolf', d20: seq(3) });
    expect(stun.effects.enemy.Wolf).toEqual(['stunned']);
    expect(stun.caster.spellSlotsUsed).toBe(1);
    const boss = resolveSpell({ caster: mage(), allies: [], encounter: enc(['King', 'boss']), spellId: 'hold_foe', target: 'King', d20: seq(3) });
    expect(boss.effects.enemy.King).toEqual(['dazed']);
    const saved = resolveSpell({ caster: mage(), allies: [], encounter: enc(['Wolf', 'normal']), spellId: 'hold_foe', target: 'Wolf', d20: seq(20) });
    expect(saved.ok).toBe(true);
    expect(saved.effects.enemy.Wolf).toBeUndefined();
    expect(saved.caster.spellSlotsUsed).toBe(1);
  });
  it('illusion_fog dazes every enemy that fails, bosses included', () => {
    const r = resolveSpell({ caster: mage(), allies: [], encounter: enc(['A', 'minion'], ['King', 'boss']), spellId: 'illusion_fog', d20: seq(2, 2) });
    expect(r.effects.enemy).toEqual({ A: ['dazed'], King: ['dazed'] });
  });
});

describe('resolveSpell: support spells', () => {
  const allies = [mage(), friend()];
  it('arcane_shield gives AC +3 (+4 at level 9)', () => {
    const r = resolveSpell({ caster: mage(), allies, encounter: null, spellId: 'arcane_shield', target: 'p2', d20: seq(1) });
    expect(r.ok).toBe(true);
    expect(r.effects.acBonus).toEqual({ p2: 3 });
    expect(r.caster.spellSlotsUsed).toBe(1);
    expect(resolveSpell({ caster: mage({ xp: xpFor(9) }), allies, encounter: null, spellId: 'arcane_shield', target: 'm1', d20: seq(1) }).effects.acBonus).toEqual({ m1: 4 });
  });
  it('spell_ward gives ward 3 (4 at level 7)', () => {
    expect(resolveSpell({ caster: mage(), allies, encounter: null, spellId: 'spell_ward', target: 'p2', d20: seq(1) }).effects.ward).toEqual({ p2: 3 });
    expect(resolveSpell({ caster: mage({ xp: xpFor(7) }), allies, encounter: null, spellId: 'spell_ward', target: 'p2', d20: seq(1) }).effects.ward).toEqual({ p2: 4 });
  });
  it('valor_blessing grants advantage, quicken cuts cooldowns by 2 when something is cooling down', () => {
    expect([...resolveSpell({ caster: mage(), allies, encounter: null, spellId: 'valor_blessing', target: 'm1', d20: seq(1) }).effects.advantage]).toEqual(['m1']);
    const hurried = [mage(), friend({ abilityCooldown: 3 })];
    const q = resolveSpell({ caster: mage(), allies: hurried, encounter: null, spellId: 'quicken_rhythm', target: 'p2', d20: seq(1) });
    expect(q.ok).toBe(true);
    expect(q.effects.cooldownCut).toEqual({ p2: 2 });
    const viaMap = [mage(), friend({ abilityCooldowns: { x: 1 } })];
    expect(resolveSpell({ caster: mage(), allies: viaMap, encounter: null, spellId: 'quicken_rhythm', target: 'p2', d20: seq(1) }).ok).toBe(true);
  });
  it('arcane_sight is a free self cantrip; all_tongues costs a slot and covers every active friend', () => {
    const sight = resolveSpell({ caster: mage(), allies, encounter: null, spellId: 'arcane_sight', d20: seq(1) });
    expect(sight.slotCost).toBe(0);
    expect(sight.effects.skillAdvantage.m1).toEqual(['perception', 'investigation', 'arcana', 'history', 'religion']);
    const down = [mage(), friend(), friend({ id: 'p3', displayName: 'Dee', status: 'downed', hp: 0 })];
    const tongues = resolveSpell({ caster: mage(), allies: down, encounter: null, spellId: 'all_tongues', d20: seq(1) });
    expect(tongues.caster.spellSlotsUsed).toBe(1);
    expect(Object.keys(tongues.effects.skillAdvantage).sort()).toEqual(['m1', 'p2']);
    expect(tongues.effects.skillAdvantage.p2).toEqual(['persuasion', 'deception', 'intimidation', 'performance']);
  });
  it('gives a Thai note for the DM on every success', () => {
    const r = resolveSpell({ caster: mage(), allies, encounter: null, spellId: 'arcane_shield', target: 'p2', d20: seq(1) });
    expect(r.notes.join(' ')).toMatch(/Mira/);
    expect(emptyRoundEffects().cooldownCut).toEqual({});
  });
});
