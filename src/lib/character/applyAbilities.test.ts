import { describe, it, expect } from 'vitest';
import { applyAbilityActions, eventfulRound, tickCooldowns } from './applyAbilities';
import { SANCTUARY_CHANGE } from './applyTags';
import type { Character } from './types';

const four = () => 4;

function char(over: Partial<Character> = {}): Character {
  return { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, classId: 'warrior', abilityCooldown: 0, ...over };
}
const use = (playerId: string, target: string | null = null, extra: object = {}) => ({ playerId, useAbility: true, abilityTargetId: target, ...extra });

describe('applyAbilityActions', () => {
  it('lets a ready warrior guard an ally', () => {
    const party = [char(), char({ id: 'p2', displayName: 'Suki', classId: 'archer' })];
    const result = applyAbilityActions(party, [use('p1', 'p2')], four);
    expect(result.guards).toEqual({ p2: 'p1' });
    expect(result.used).toEqual(['p1']);
    expect(result.notes.p1).toContain('Suki');
    expect(result.changes).toEqual(['Prem ใช้ยืนบัง ปกป้อง Suki']);
  });

  it('refuses a guard on oneself', () => {
    const result = applyAbilityActions([char()], [use('p1', 'p1')], four);
    expect(result.guards).toEqual({});
    expect(result.used).toEqual([]);
    expect(result.notes.p1).toBe('tried to use ยืนบัง but it was not ready');
  });

  it('keeps the first guard, and the second warrior keeps their cooldown, when two warriors guard the same ally', () => {
    const party = [char(), char({ id: 'p3', displayName: 'Mila' }), char({ id: 'p2', displayName: 'Suki', classId: 'archer' })];
    const result = applyAbilityActions(party, [use('p1', 'p2'), use('p3', 'p2')], four);
    expect(result.guards).toEqual({ p2: 'p1' });
    expect(result.used).toEqual(['p1']);
    expect(result.notes.p3).toBe('tried to use ยืนบัง but Prem is already shielding Suki');
    expect(result.changes).toEqual(['Prem ใช้ยืนบัง ปกป้อง Suki']);
  });

  it('heals with the medium tier at level 1 (1d6+1) and caps at max HP', () => {
    const cleric = char({ classId: 'cleric', weaponId: 'staff' });
    const hurt = char({ id: 'p2', displayName: 'Suki', hp: 10 });
    const result = applyAbilityActions([cleric, hurt], [use('p1', 'p2')], four);
    expect(result.characters[1].hp).toBe(15);
    expect(result.notes.p1).toContain('5');
    expect(result.changes).toEqual(['Prem ใช้อวยพรรักษา ให้ Suki (+5 HP)']);

    const nearFull = char({ id: 'p2', displayName: 'Suki', hp: 18 });
    expect(applyAbilityActions([cleric, nearFull], [use('p1', 'p2')], four).characters[1].hp).toBe(20);
  });

  it('lets a cleric heal themselves, but never a downed ally', () => {
    const cleric = char({ classId: 'cleric', hp: 10 });
    const self = applyAbilityActions([cleric], [use('p1', 'p1')], four);
    expect(self.characters[0].hp).toBe(15);
    expect(self.changes).toEqual(['Prem ใช้อวยพรรักษา (+5 HP)']);

    const downed = char({ id: 'p2', displayName: 'Suki', hp: 0, status: 'downed' });
    const result = applyAbilityActions([cleric, downed], [use('p1', 'p2')], four);
    expect(result.characters[1].hp).toBe(0);
    expect(result.used).toEqual([]);
    expect(result.notes.p1).toContain('not ready');
  });

  it('does not spend the cleric ability on someone who is not hurt', () => {
    const cleric = char({ classId: 'cleric', weaponId: 'staff' });
    const healthy = char({ id: 'p2', displayName: 'Suki' });
    const other = applyAbilityActions([cleric, healthy], [use('p1', 'p2')], four);
    expect(other.used).toEqual([]);
    expect(other.notes.p1).toBe('tried to use อวยพรรักษา but Suki is not hurt');
    expect(other.changes).toEqual([]);

    const self = applyAbilityActions([char({ classId: 'cleric', hp: 20 })], [use('p1', 'p1')], four);
    expect(self.used).toEqual([]);
    expect(self.notes.p1).toContain('not hurt');
  });

  it('heals more at level 5 (2d6)', () => {
    const cleric = char({ classId: 'cleric', xp: 420 });
    const hurt = char({ id: 'p2', displayName: 'Suki', hp: 1, maxHp: 30 });
    expect(applyAbilityActions([cleric, hurt], [use('p1', 'p2')], four).characters[1].hp).toBe(9);
  });

  it('rolls the archer weapon dice twice at level 1 and three times at level 5, plus the level bonus', () => {
    const l1 = applyAbilityActions([char({ classId: 'archer', weaponId: 'shortbow' })], [use('p1')], four);
    expect(l1.damage.p1).toBe(8);
    expect(l1.notes.p1).toContain('damage roll 8');
    const l5 = applyAbilityActions([char({ classId: 'archer', weaponId: 'shortbow', xp: 420 })], [use('p1')], four);
    expect(l5.damage.p1).toBe(14);
  });

  it('adds 2d6 to the rogue weapon damage at level 1', () => {
    const result = applyAbilityActions([char({ classId: 'rogue', weaponId: 'dagger' })], [use('p1')], four);
    expect(result.damage.p1).toBe(12);
    expect(result.used).toEqual(['p1']);
  });

  it('does nothing but explain when the cooldown is not over', () => {
    const result = applyAbilityActions([char({ classId: 'archer', weaponId: 'shortbow', abilityCooldown: 2 })], [use('p1')], four);
    expect(result.damage).toEqual({});
    expect(result.used).toEqual([]);
    expect(result.notes.p1).toBe('tried to use ยิงแม่นยำ but it was not ready');
  });

  it('refuses a classless player and a downed user', () => {
    const classless = applyAbilityActions([char({ classId: null })], [use('p1')], four);
    expect(classless.used).toEqual([]);
    expect(classless.notes.p1).toContain('not ready');
    const downed = applyAbilityActions([char({ classId: 'rogue', weaponId: 'dagger', status: 'downed', hp: 0 })], [use('p1')], four);
    expect(downed.damage).toEqual({});
    expect(downed.used).toEqual([]);
  });

  it('refuses a target who is not in the campaign', () => {
    const result = applyAbilityActions([char()], [use('p1', 'stranger')], four);
    expect(result.guards).toEqual({});
    expect(result.used).toEqual([]);
  });

  it('ignores an action that also drinks a potion', () => {
    const result = applyAbilityActions([char({ classId: 'archer', weaponId: 'shortbow' })], [use('p1', null, { useItemId: 'potion_minor' })], four);
    expect(result.notes).toEqual({});
    expect(result.damage).toEqual({});
    expect(result.used).toEqual([]);
  });

  it('ignores actions that do not use an ability and never mutates its input', () => {
    const party = [char({ classId: 'cleric' }), char({ id: 'p2', displayName: 'Suki', hp: 10 })];
    const result = applyAbilityActions(party, [{ playerId: 'p1', useAbility: false }, use('p1', 'p2')], four);
    expect(party[1].hp).toBe(10);
    expect(result.characters[1].hp).toBe(15);
    expect(applyAbilityActions(party, [{ playerId: 'p1' }], four).used).toEqual([]);
  });
});

describe('eventfulRound', () => {
  const none = { character: [], inventory: [], economy: [], xp: [] };

  it('is true when any tag-driven system changed something', () => {
    expect(eventfulRound({ ...none, character: ['Prem −5 HP'] })).toBe(true);
    expect(eventfulRound({ ...none, inventory: ['Prem ได้รับ ยาฟื้นฟูเล็ก'] })).toBe(true);
    expect(eventfulRound({ ...none, economy: ['Prem ได้รับ 5 ทอง'] })).toBe(true);
    expect(eventfulRound({ ...none, xp: ['ทุกคนได้ +10 XP'] })).toBe(true);
  });

  it('is false for a silent round, and for a sanctuary on its own', () => {
    expect(eventfulRound(none)).toBe(false);
    expect(eventfulRound({ ...none, character: [SANCTUARY_CHANGE] })).toBe(false);
    expect(eventfulRound({ ...none, character: [SANCTUARY_CHANGE, 'Prem −5 HP'] })).toBe(true);
  });
});

describe('tickCooldowns', () => {
  it('lowers every cooldown by one on an eventful round, never below zero', () => {
    const result = tickCooldowns([char({ abilityCooldown: 2 }), char({ id: 'p2', abilityCooldown: 0 }), char({ id: 'p3' })], true, []);
    expect(result.map((c) => c.abilityCooldown)).toEqual([1, 0, 0]);
  });

  it('leaves cooldowns alone on a quiet round', () => {
    expect(tickCooldowns([char({ abilityCooldown: 2 })], false, [])[0].abilityCooldown).toBe(2);
  });

  it('gives a user the full cooldown, not the ticked one', () => {
    const party = [char({ classId: 'archer' }), char({ id: 'p2', classId: 'rogue' })];
    expect(tickCooldowns(party, true, ['p1', 'p2']).map((c) => c.abilityCooldown)).toEqual([3, 4]);
    expect(tickCooldowns(party, false, ['p1'])[0].abilityCooldown).toBe(3);
  });

  it('does not mutate its input', () => {
    const party = [char({ abilityCooldown: 2 })];
    tickCooldowns(party, true, []);
    expect(party[0].abilityCooldown).toBe(2);
  });
});
