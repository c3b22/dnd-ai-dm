import { describe, expect, it } from 'vitest';
import type { Character } from '@/lib/character/types';
import { emptyRoundEffects } from '@/lib/character/spells';
import { shiftAdvantage } from '@/lib/character/check';
import { runChecks } from '@/lib/character/checkPlan';
import { applyEnemyAttackOutcomes, applyEnemyAttackTags, runAttacks, runEnemyAttacks } from './attack';
import { armorClass } from './armorClass';
import { takeWard } from '@/lib/inventory/effects';
import { tickCooldowns } from '@/lib/character/applyAbilities';
import type { Encounter } from './encounter';

// K4: how a spell's one-round effects change the dice of the rest of the round.
const hero = (over: Partial<Character> = {}): Character =>
  ({ id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, gold: 0, xp: 0, classId: 'warrior', abilities: { STR: 14, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 }, ...over }) as Character;
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 4, maxPip: 4, fled: false };
const enc = (...enemies: Encounter['enemies']): Encounter => ({ enemies });
const seq = (...values: number[]) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

describe('shiftAdvantage', () => {
  it('opposite sources cancel, equal ones do not stack', () => {
    expect(shiftAdvantage('none', 'up')).toBe('advantage');
    expect(shiftAdvantage('disadvantage', 'up')).toBe('none');
    expect(shiftAdvantage('advantage', 'up')).toBe('advantage');
    expect(shiftAdvantage('none', 'down')).toBe('disadvantage');
    expect(shiftAdvantage('advantage', 'down')).toBe('none');
  });
});

describe('round effects on player attacks', () => {
  const plan = [{ player: 'Prem', target: 'หมาป่า', advantage: 'none' as const }];
  it('a blessing gives advantage: two dice are rolled and the higher counts', () => {
    const effects = emptyRoundEffects();
    effects.advantage.add('p1');
    const [o] = runAttacks(plan, [hero()], enc(wolf), () => 1, seq(3, 17), effects);
    expect(o).toMatchObject({ advantage: 'advantage', die: 17, dice: [3, 17] });
  });
  it('an exposed enemy gives advantage to everyone, and a blessing on top does not stack', () => {
    const effects = emptyRoundEffects();
    effects.enemy['หมาป่า'] = ['exposed'];
    effects.advantage.add('p1');
    const [o] = runAttacks(plan, [hero()], enc(wolf), () => 1, seq(3, 17), effects);
    expect(o.advantage).toBe('advantage');
    expect(o.dice).toHaveLength(2);
  });
  it('a planned disadvantage and a blessing cancel out', () => {
    const effects = emptyRoundEffects();
    effects.advantage.add('p1');
    const [o] = runAttacks([{ ...plan[0], advantage: 'disadvantage' }], [hero()], enc(wolf), () => 1, seq(12), effects);
    expect(o.advantage).toBe('none');
    expect(o.dice).toEqual([12]);
  });
  it('without effects nothing changes', () => {
    const [o] = runAttacks(plan, [hero()], enc(wolf), () => 1, seq(12));
    expect(o.advantage).toBe('none');
  });
});

describe('round effects on skill checks', () => {
  it('a spell that gave advantage on a skill makes that check roll two dice', () => {
    const planned = [{ player: 'Prem', skill: 'arcana' as const, dc: 12, advantage: 'none' as const }];
    const [o] = runChecks(planned, [hero()], seq(4, 15), { p1: ['arcana', 'history'] });
    expect(o).toMatchObject({ advantage: 'advantage', dice: [4, 15], die: 15 });
    const [other] = runChecks([{ ...planned[0], skill: 'stealth' }], [hero()], seq(4, 15), { p1: ['arcana'] });
    expect(other).toMatchObject({ advantage: 'none', dice: [4] });
  });
});

describe('round effects on enemy attacks', () => {
  const plan = [{ enemy: 'หมาป่า', player: 'Prem' }];
  const roll = (effects: ReturnType<typeof emptyRoundEffects> | undefined, die = seq(15), c = hero()) =>
    runEnemyAttacks(plan, [c], enc(wolf), die, () => 3, undefined, effects);

  it('a stunned enemy does not attack at all', () => {
    const effects = emptyRoundEffects();
    effects.enemy['หมาป่า'] = ['stunned'];
    expect(roll(effects)).toEqual([]);
  });
  it('a dazed enemy attacks with disadvantage: two dice, the lower counts', () => {
    const effects = emptyRoundEffects();
    effects.enemy['หมาป่า'] = ['dazed'];
    const [o] = roll(effects, seq(18, 4));
    expect(o).toMatchObject({ die: 4, disadvantage: true });
    expect(o.advantage).toBeUndefined();
  });
  it('dazed and pack cancel into one ordinary roll', () => {
    const effects = emptyRoundEffects();
    effects.enemy['หมาป่า'] = ['dazed'];
    const pack = { ...wolf, traits: ['pack' as const] };
    const [o] = runEnemyAttacks(plan, [hero()], enc(pack, { ...wolf, name: 'หมาป่า 2' }), seq(18, 4), () => 3, undefined, effects);
    expect(o.die).toBe(18);
    expect(o.advantage).toBeUndefined();
    expect(o.disadvantage).toBeUndefined();
  });
  it('the narration fallback ([[enemy_attack]] tag) obeys the same statuses', () => {
    const effects = emptyRoundEffects();
    effects.enemy['หมาป่า'] = ['stunned'];
    const r = applyEnemyAttackTags([hero()], enc(wolf), [{ kind: 'enemy_attack', enemy: 'หมาป่า', player: 'Prem' }], seq(15), () => 3, new Set(), {}, effects);
    expect(r.outcomes).toEqual([]);
    expect(r.characters[0].hp).toBe(20);
  });
  it('a spell AC bonus raises the AC the enemy rolls against (12 + 3 = 15: a 9 + 5 hits only without it)', () => {
    // hero AC = 10 + DEX +2 = 12; wolf bonus +5
    expect(armorClass(hero())).toBe(12);
    expect(armorClass(hero({ roundAcBonus: 3 }))).toBe(15);
    expect(roll(undefined, seq(11))[0]).toMatchObject({ ac: 12, hit: true });
    expect(roll(undefined, seq(9), hero({ roundAcBonus: 3 }))[0]).toMatchObject({ ac: 15, hit: false });
  });
  it('a ward spell lowers the first hit by its value and is spent', () => {
    const warded = hero({ roundWard: 3 });
    const used = new Set<string>();
    const outcomes = [
      { enemy: 'หมาป่า', tier: 'normal' as const, playerId: 'p1', playerDisplayName: 'Prem', die: 15, bonus: 4, total: 19, ac: 12, hit: true, critical: null, damage: 6 },
      { enemy: 'หมาป่า 2', tier: 'normal' as const, playerId: 'p1', playerDisplayName: 'Prem', die: 15, bonus: 4, total: 19, ac: 12, hit: true, critical: null, damage: 6 },
    ];
    const r = applyEnemyAttackOutcomes([warded], outcomes, used);
    expect(r.characters[0].hp).toBe(20 - 3 - 6);
    expect(takeWard(warded, used)).toBe(0);
  });
  it('a ward spell stacks with a worn ward on the same first hit', () => {
    const both = hero({ roundWard: 3, itemEffects: { effects: ['ward'], setTheme: null, setSkillBonus: 0, ward: 2 } });
    expect(takeWard(both, new Set())).toBe(5);
  });
});

describe('cooldown cut (quicken_rhythm)', () => {
  it('takes rounds off every running cooldown after the tick, floor 0, only for the named player', () => {
    const a = hero({ id: 'a', abilityCooldown: 3, abilityCooldowns: { warrior_war_cry: 4 } });
    const b = hero({ id: 'b', abilityCooldown: 3 });
    const [ra, rb] = tickCooldowns([a, b], false, [], [], { a: 2 });
    expect(ra.abilityCooldown).toBe(1);
    expect(ra.abilityCooldowns).toEqual({ warrior_war_cry: 2 });
    expect(rb.abilityCooldown).toBe(3);
    const [floored] = tickCooldowns([hero({ id: 'a', abilityCooldown: 1, abilityCooldowns: { x: 2 } })], false, [], [], { a: 2 });
    expect(floored.abilityCooldown).toBe(0);
    expect(floored.abilityCooldowns).toEqual({});
  });
  it('is applied after a fresh cooldown starts this round', () => {
    const [r] = tickCooldowns([hero({ id: 'a', abilityCooldown: 0 })], true, ['a'], [], { a: 2 });
    expect(r.abilityCooldown).toBe(1); // warrior 3 - 2
  });
});
