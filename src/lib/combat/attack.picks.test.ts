import { describe, expect, it } from 'vitest';
import type { Character } from '@/lib/character/types';
import { emptyRoundEffects, type RoundEffects } from '@/lib/character/spells';
import type { AttackMods } from '@/lib/character/subclasses';
import { applyAttackOutcomes, applyBloodRush, applyEnemyAttackOutcomes, runAttacks, runEnemyAttacks, type AttackOutcome, type EnemyAttackOutcome } from './attack';
import type { Encounter } from './encounter';

const hero = (over: Partial<Character> = {}): Character =>
  ({ id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 10, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, gold: 0, xp: 0, classId: 'warrior', ...over }) as Character;
const enc = (...enemies: Encounter['enemies']): Encounter => ({ enemies });
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
const bear = { name: 'หมี', tier: 'strong' as const, pip: 3, maxPip: 3, fled: false };
const rat = { name: 'หนู', tier: 'minion' as const, pip: 1, maxPip: 1, fled: false };
const plan = (target: string) => [{ player: 'Prem', target, advantage: 'none' as const }];
const withMods = (mods: AttackMods, id = 'p1'): RoundEffects => ({ ...emptyRoundEffects(), attackMods: { [id]: mods } });
const low = () => 1;

describe('attack bonuses from passive picks (K6)', () => {
  it('archer_hawk_eye: +1 to the attack roll turns a near miss into a hit', () => {
    // level 1: proficiency +2, ability mod 0; strong enemy needs 15; die 12 -> 14 miss, 15 with the pick
    const archer = (picks?: Record<string, string>) => hero({ classId: 'archer', weaponId: 'shortbow', abilityPicks: picks });
    expect(runAttacks(plan('หมี'), [archer()], enc(bear), low, () => 12)[0]).toMatchObject({ hit: false, total: 14 });
    expect(runAttacks(plan('หมี'), [archer({ '6': 'archer_hawk_eye' })], enc(bear), low, () => 12)[0]).toMatchObject({ hit: true, total: 15, magic: 1 });
  });

  it('rogue_wound_reader: +2 only against an enemy that has already lost pips', () => {
    const rogue = hero({ classId: 'rogue', weaponId: 'dagger', abilityPicks: { '6': 'rogue_wound_reader' } });
    const hurt = { ...bear, pip: 2 };
    expect(runAttacks(plan('หมี'), [rogue], enc(hurt), low, () => 12)[0]).toMatchObject({ hit: true, total: 16 });
    expect(runAttacks(plan('หมี'), [rogue], enc(bear), low, () => 12)[0]).toMatchObject({ hit: false, total: 14 });
  });

  it('wound reader reads the pips earlier hits of the same round already took', () => {
    const rogue = hero({ classId: 'rogue', weaponId: 'dagger', abilityPicks: { '6': 'rogue_wound_reader' } });
    const other = hero({ id: 'p2', displayName: 'Suki' });
    const planned = [{ player: 'Suki', target: 'หมี', advantage: 'none' as const }, { player: 'Prem', target: 'หมี', advantage: 'none' as const }];
    const out = runAttacks(planned, [other, rogue], enc(bear), low, () => 15);
    expect(out.map((o) => o.total)).toEqual([17, 19]);
  });
});

describe('attack modifiers from picked abilities (K6)', () => {
  it('sweep: two swings with the weapon damage, the second at the next live enemy; one enemy means one swing', () => {
    const heavy = () => 8; // max damage of the shortsword: a heavy blow, 2 pips
    const out = runAttacks(plan('หมาป่า'), [hero()], enc(wolf, bear), heavy, () => 15, withMods({ spread: 2 }));
    expect(out.map((o) => [o.target, o.hit, o.pips, o.shot])).toEqual([['หมาป่า', true, 2, undefined], ['หมี', true, 2, 2]]);
    expect(applyAttackOutcomes(enc(wolf, bear), out)!.enemies.map((e) => e.pip)).toEqual([0, 1]);
    const alone = runAttacks(plan('หมาป่า'), [hero()], enc(wolf), low, () => 15, withMods({ spread: 2 }));
    expect(alone).toHaveLength(1);
  });

  it('sweep: a miss on one swing does not stop the other', () => {
    const dice = [15, 2];
    const out = runAttacks(plan('หมาป่า'), [hero()], enc(wolf, bear), low, () => dice.shift() ?? 15, withMods({ spread: 2 }));
    expect(out.map((o) => o.hit)).toEqual([true, false]);
  });

  it('piercing arrow: armored and nimble stop adding to the enemy AC', () => {
    const armored = { ...wolf, traits: ['armored' as const] };
    // normal needs 13, armored 15; die 12 + 2 = 14
    expect(runAttacks(plan('หมาป่า'), [hero()], enc(armored), low, () => 12)[0].hit).toBe(false);
    const out = runAttacks(plan('หมาป่า'), [hero()], enc(armored), low, () => 12, withMods({ ignoreTraitAc: true }));
    expect(out[0]).toMatchObject({ hit: true, dc: 13 });
  });

  it('smite: the roll uses the WIS modifier instead of the weapon ability', () => {
    const cleric = hero({ classId: 'cleric', weaponId: 'mace', abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 16, CHA: 10 } });
    expect(runAttacks(plan('หมาป่า'), [cleric], enc(wolf), low, () => 10)[0]).toMatchObject({ modifier: 0, total: 12 });
    const out = runAttacks(plan('หมาป่า'), [cleric], enc(wolf), low, () => 10, withMods({ attackAbility: 'WIS', minPips: 2, critPips: 3 }));
    expect(out[0]).toMatchObject({ modifier: 3, total: 15, hit: true, pips: 2 });
  });
});

describe('archer_chain_shot (K6)', () => {
  const archer = (picks?: Record<string, string>) => hero({ classId: 'archer', weaponId: 'shortbow', abilityPicks: picks });

  it('an arrow that takes the last pip sends one more at the enemy with the fewest pips left, once per round', () => {
    const out = runAttacks(plan('หนู'), [archer({ '9': 'archer_chain_shot' })], enc(rat, bear, wolf), low, () => 15);
    expect(out.map((o) => [o.target, o.hit, o.pips, o.shot, o.defeated])).toEqual([['หนู', true, 1, undefined, true], ['หมาป่า', true, 1, 2, false]]);
    expect(applyAttackOutcomes(enc(rat, bear, wolf), out)!.enemies.map((e) => e.pip)).toEqual([0, 3, 1]);
  });

  it('nothing extra without the pick, without a defeat, or with nobody left to shoot', () => {
    expect(runAttacks(plan('หนู'), [archer()], enc(rat, bear), low, () => 15)).toHaveLength(1);
    expect(runAttacks(plan('หมาป่า'), [archer({ '9': 'archer_chain_shot' })], enc(wolf, bear), low, () => 15)).toHaveLength(1);
    expect(runAttacks(plan('หนู'), [archer({ '9': 'archer_chain_shot' })], enc(rat), low, () => 15)).toHaveLength(1);
  });

  it('the bonus arrow only removes 1 pip even with a heavy weapon damage, and can miss', () => {
    const heavy = () => 6; // shortbow max damage
    const dice = [15, 2];
    const out = runAttacks(plan('หนู'), [archer({ '9': 'archer_chain_shot' })], enc(rat, bear), heavy, () => dice.shift() ?? 15);
    expect(out[1]).toMatchObject({ target: 'หมี', hit: false, pips: 0, shot: 2 });
  });
});

describe('warrior_blood_rush (K6)', () => {
  const outcome = (over: Partial<AttackOutcome> = {}): AttackOutcome => ({
    playerId: 'p1', playerDisplayName: 'Prem', target: 'หมาป่า', tier: 'normal', dc: 13, advantage: 'none', dice: [15], die: 15, modifier: 0, proficiency: 2,
    magic: 0, total: 17, hit: true, critical: null, pips: 1, defeated: false, damage: 1, maxDamage: 8, ...over,
  });

  it('heals 2 HP once per round when a hit really took a pip', () => {
    const warrior = hero({ abilityPicks: { '9': 'warrior_blood_rush' } });
    const r = applyBloodRush([warrior], enc(wolf), [outcome(), outcome()]);
    expect(r.characters[0].hp).toBe(12);
    expect(r.changes).toEqual(['Prem +2 HP กระแสเลือด']);
  });

  it('nothing without the pick, on a miss, at full HP, or when the pips were already gone', () => {
    expect(applyBloodRush([hero()], enc(wolf), [outcome()]).characters[0].hp).toBe(10);
    const warrior = hero({ abilityPicks: { '9': 'warrior_blood_rush' } });
    expect(applyBloodRush([warrior], enc(wolf), [outcome({ hit: false, pips: 0 })]).characters[0].hp).toBe(10);
    expect(applyBloodRush([{ ...warrior, hp: 20 }], enc(wolf), [outcome()]).characters[0].hp).toBe(20);
    expect(applyBloodRush([warrior], enc({ ...wolf, pip: 0 }), [outcome()]).characters[0].hp).toBe(10);
    expect(applyBloodRush([warrior], null, [outcome()]).characters[0].hp).toBe(10);
  });
});

describe('enemy attacks against picks (K6)', () => {
  const hit = (damage: number, over: Partial<EnemyAttackOutcome> = {}): EnemyAttackOutcome => ({
    enemy: 'หมาป่า', tier: 'normal', playerId: 'p1', playerDisplayName: 'Prem', die: 15, bonus: 4, total: 19, ac: 12, hit: true, critical: null, damage, ...over,
  });

  it('rogue_evasion: the first damaging hit of the round is halved (rounded up), later hits are not', () => {
    const rogue = hero({ classId: 'rogue', hp: 20, abilityPicks: { '9': 'rogue_evasion' } });
    const r = applyEnemyAttackOutcomes([rogue], [hit(5), hit(5)]);
    expect(r.characters[0].hp).toBe(20 - 3 - 5);
    expect(r.changes[0]).toContain('หลบเหลี่ยม');
    expect(r.changes[1]).not.toContain('หลบเหลี่ยม');
  });

  it('rogue_evasion: halves after ward, and a miss does not use it up', () => {
    const rogue = hero({ classId: 'rogue', hp: 20, abilityPicks: { '9': 'rogue_evasion' }, roundWard: 2 });
    const r = applyEnemyAttackOutcomes([rogue], [hit(0, { hit: false, damage: 0 }), hit(6)]);
    // ward 2 -> 4, halved -> 2
    expect(r.characters[0].hp).toBe(18);
    const plain = applyEnemyAttackOutcomes([hero({ hp: 20 })], [hit(5)]);
    expect(plain.characters[0].hp).toBe(15);
  });

  it('rogue_shadow_step: enemies skip a hidden target, and attack others normally', () => {
    const rogue = hero({ id: 'r1', displayName: 'Rin', classId: 'rogue' });
    const other = hero({ id: 'p2', displayName: 'Suki' });
    const effects = emptyRoundEffects();
    effects.hidden = new Set(['r1']);
    const planned = [{ enemy: 'หมาป่า', player: 'Rin' }, { enemy: 'หมี', player: 'Suki' }];
    const out = runEnemyAttacks(planned, [rogue, other], enc(wolf, bear), () => 15, () => 3, undefined, effects);
    expect(out.map((o) => o.playerDisplayName)).toEqual(['Suki']);
    expect(runEnemyAttacks(planned, [rogue, other], enc(wolf, bear), () => 15, () => 3)).toHaveLength(2);
  });
});
