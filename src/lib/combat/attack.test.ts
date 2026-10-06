import { describe, expect, it } from 'vitest';
import type { CharacterTag } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { applyAttackOutcomes, applyEnemyAttacks, resolveAttack, runAttacks } from './attack';
import type { Encounter } from './encounter';

const tiers = ['minion', 'normal', 'strong', 'boss'] as const;
const thresholds = { minion: 6, normal: 9, strong: 12, boss: 15 };
const maxPips = { minion: 1, normal: 2, strong: 3, boss: 5 };

describe('resolveAttack hit threshold', () => {
  for (const tier of tiers) {
    const dc = thresholds[tier];
    it(`${tier}: ${dc - 1} misses, ${dc} hits for 1 pip (low damage)`, () => {
      expect(resolveAttack({ d20s: [dc - 1], tier, damage: 1, maxDamage: 8 })).toMatchObject({ hit: false, pips: 0, dc });
      expect(resolveAttack({ d20s: [dc], tier, damage: 1, maxDamage: 8 })).toMatchObject({ hit: true, pips: 1, dc });
    });
  }

  it('natural 1 always misses and natural 20 always hits for 2 pips', () => {
    expect(resolveAttack({ d20s: [1], tier: 'minion', damage: 8, maxDamage: 8 })).toMatchObject({ hit: false, pips: 0, critical: 'failure' });
    expect(resolveAttack({ d20s: [20], tier: 'boss', damage: 1, maxDamage: 8 })).toMatchObject({ hit: true, pips: 2, critical: 'success' });
  });

  it('a heavy blow is damage at 75% of the weapon max: 6 of 8 yes, 5 of 8 no', () => {
    expect(resolveAttack({ d20s: [10], tier: 'normal', damage: 6, maxDamage: 8 }).pips).toBe(2);
    expect(resolveAttack({ d20s: [10], tier: 'normal', damage: 5, maxDamage: 8 }).pips).toBe(1);
  });

  it('level bonus counts toward the heavy blow (d4 weapon: 3 of 4 yes, 2 of 4 no)', () => {
    expect(resolveAttack({ d20s: [10], tier: 'normal', damage: 3, maxDamage: 4 }).pips).toBe(2);
    expect(resolveAttack({ d20s: [10], tier: 'normal', damage: 2, maxDamage: 4 }).pips).toBe(1);
  });

  it('advantage takes the higher die and disadvantage the lower', () => {
    expect(resolveAttack({ d20s: [3, 12], advantage: 'advantage', tier: 'strong', damage: 1, maxDamage: 8 })).toMatchObject({ die: 12, hit: true });
    expect(resolveAttack({ d20s: [3, 12], advantage: 'disadvantage', tier: 'strong', damage: 1, maxDamage: 8 })).toMatchObject({ die: 3, hit: false });
  });
});

const hero = (over: Partial<Character> = {}): Character =>
  ({ id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, gold: 0, xp: 0, ...over }) as Character;
const enc = (...enemies: Encounter['enemies']): Encounter => ({ enemies });
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
const boss = { name: 'มังกร', tier: 'boss' as const, pip: 5, maxPip: 5, fled: false };

describe('runAttacks', () => {
  const plan = (target: string) => [{ player: 'Prem', target, advantage: 'none' as const }];

  it('rolls against the enemy tier and keeps damage and max damage', () => {
    const [o] = runAttacks(plan('หมาป่า'), [hero()], enc(wolf), () => 7, () => 9);
    expect(o).toMatchObject({ target: 'หมาป่า', dc: 9, die: 9, hit: true, pips: 2, damage: 7, maxDamage: 8, defeated: true });
  });

  it('a miss removes nothing', () => {
    const [o] = runAttacks(plan('หมาป่า'), [hero()], enc(wolf), () => 7, () => 8);
    expect(o).toMatchObject({ hit: false, pips: 0, defeated: false });
    expect(applyAttackOutcomes(enc(wolf), [o])).toEqual(enc(wolf));
  });

  it('ignores unknown targets, downed attackers, no encounter and a second attack by the same player', () => {
    expect(runAttacks(plan('ผี'), [hero()], enc(wolf), () => 1, () => 15)).toEqual([]);
    expect(runAttacks(plan('หมาป่า'), [hero({ status: 'downed' })], enc(wolf), () => 1, () => 15)).toEqual([]);
    expect(runAttacks(plan('หมาป่า'), [hero()], null, () => 1, () => 15)).toEqual([]);
    expect(runAttacks([...plan('หมาป่า'), ...plan('หมาป่า')], [hero()], enc(wolf), () => 1, () => 15)).toHaveLength(1);
  });

  it('a heavy hit on a full-pip boss removes 2 pips and does not defeat it', () => {
    const [o] = runAttacks(plan('มังกร'), [hero()], enc(boss), () => 8, () => 20);
    expect(o).toMatchObject({ hit: true, pips: 2, defeated: false });
    expect(applyAttackOutcomes(enc(boss), [o])).toEqual(enc({ ...boss, pip: 3 }));
  });

  it('a boss at full pips keeps at least 1 pip from a single blow (original rule)', () => {
    const smallBoss = { ...boss, pip: 1, maxPip: 1 } as unknown as Encounter['enemies'][number];
    // pip === maxPip means "full": one blow cannot finish it
    const out = applyAttackOutcomes(enc(smallBoss), [
      { playerId: 'p1', playerDisplayName: 'Prem', target: 'มังกร', tier: 'boss', dc: 15, advantage: 'none', dice: [20], die: 20, hit: true, critical: 'success', pips: 2, defeated: false, damage: 8, maxDamage: 8 },
    ]);
    expect(out?.enemies[0].pip).toBe(1);
  });

  it('resolves duplicate-named enemies to the living one and sequences pips between attackers', () => {
    const wolves = enc(wolf, { ...wolf, name: 'หมาป่า 2' });
    const heroes = [hero(), hero({ id: 'p2', displayName: 'Nok' })];
    const outs = runAttacks(
      [{ player: 'Prem', target: 'หมาป่า', advantage: 'none' }, { player: 'Nok', target: 'หมาป่า', advantage: 'none' }],
      heroes, wolves, () => 8, () => 20
    );
    expect(outs.map((o) => o.target)).toEqual(['หมาป่า', 'หมาป่า 2']);
    expect(applyAttackOutcomes(wolves, outs)?.enemies.map((e) => e.pip)).toEqual([0, 0]);
  });
});

describe('applyEnemyAttacks', () => {
  const tag = (enemy: string, player: string): CharacterTag => ({ kind: 'enemy_attack', enemy, player });
  const one = (tier: (typeof tiers)[number]): Encounter => enc({ name: 'X', tier, pip: 1, maxPip: maxPips[tier], fled: false });

  it('deals fixed damage by tier: 2 / 4 / 6 / 8 with no armor', () => {
    for (const [tier, dmg] of [['minion', 2], ['normal', 4], ['strong', 6], ['boss', 8]] as const) {
      expect(applyEnemyAttacks([hero()], one(tier), [tag('X', 'Prem')]).characters[0].hp).toBe(20 - dmg);
    }
  });

  it('subtracts armor reduction, never below 1', () => {
    expect(applyEnemyAttacks([hero({ armorReduction: 1 })], one('minion'), [tag('X', 'Prem')]).characters[0].hp).toBe(19);
    expect(applyEnemyAttacks([hero({ armorReduction: 3 })], one('minion'), [tag('X', 'Prem')]).characters[0].hp).toBe(19);
    const r = applyEnemyAttacks([hero({ armorReduction: 3 })], one('boss'), [tag('X', 'Prem')]);
    expect(r.characters[0].hp).toBe(15);
    expect(r.changes[0]).toContain('เกราะกัน 3');
  });

  it('downs a player at 0 hp and ignores unknown enemies, unknown or downed players', () => {
    const r = applyEnemyAttacks([hero({ hp: 5 })], one('strong'), [tag('X', 'Prem')]);
    expect(r.characters[0]).toMatchObject({ hp: 0, status: 'downed' });
    expect(r.changes).toContain('Prem ล้มลง');
    expect(applyEnemyAttacks([hero()], one('strong'), [tag('Y', 'Prem'), tag('X', 'Ghost')]).characters[0].hp).toBe(20);
    expect(applyEnemyAttacks([hero({ status: 'downed', hp: 0 })], one('strong'), [tag('X', 'Prem')]).characters[0].hp).toBe(0);
    expect(applyEnemyAttacks([hero()], null, [tag('X', 'Prem')]).characters[0].hp).toBe(20);
  });

  it('does not mutate its input', () => {
    const input = [hero()];
    applyEnemyAttacks(input, one('boss'), [tag('X', 'Prem')]);
    expect(input[0].hp).toBe(20);
  });
});
