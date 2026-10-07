import { describe, expect, it } from 'vitest';
import type { CharacterTag } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { applyAttackOutcomes, applyEnemyAttacks, applyLifesteal, resolveAttack, runAttacks } from './attack';
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

describe('crit_surge (F5j1)', () => {
  const surge = { effects: ['crit_surge' as const], setTheme: null, setSkillBonus: 0 };
  const plan = [{ player: 'Prem', target: 'มังกร', advantage: 'none' as const }];

  it('nat 20 with crit_surge removes 3 pips; without it still 2', () => {
    expect(resolveAttack({ d20s: [20], tier: 'normal', damage: 1, maxDamage: 8, critSurge: true }).pips).toBe(3);
    expect(resolveAttack({ d20s: [20], tier: 'normal', damage: 1, maxDamage: 8 }).pips).toBe(2);
    expect(resolveAttack({ d20s: [20], tier: 'normal', damage: 1, maxDamage: 8, critSurge: false }).pips).toBe(2);
  });

  it('crit_surge does not change non-crit hits, heavy blows or misses', () => {
    expect(resolveAttack({ d20s: [10], tier: 'normal', damage: 6, maxDamage: 8, critSurge: true }).pips).toBe(2);
    expect(resolveAttack({ d20s: [10], tier: 'normal', damage: 1, maxDamage: 8, critSurge: true }).pips).toBe(1);
    expect(resolveAttack({ d20s: [1], tier: 'normal', damage: 8, maxDamage: 8, critSurge: true }).pips).toBe(0);
  });

  it('runAttacks reads itemEffects of the attacker', () => {
    const [a] = runAttacks(plan, [hero({ itemEffects: surge })], enc(boss), () => 1, () => 20);
    const [b] = runAttacks(plan, [hero()], enc(boss), () => 1, () => 20);
    expect(a.pips).toBe(3);
    expect(b.pips).toBe(2);
  });

  it('a full-pip boss keeps at least 1 pip even from 3 pips', () => {
    const small = { ...boss, pip: 3, maxPip: 3 } as Encounter['enemies'][number];
    const [o] = runAttacks(plan, [hero({ itemEffects: surge })], enc(small), () => 1, () => 20);
    expect(o).toMatchObject({ pips: 3, defeated: false });
    expect(applyAttackOutcomes(enc(small), [o])?.enemies[0].pip).toBe(1);
  });
});

describe('lifesteal (F5j2)', () => {
  const ls = { effects: ['lifesteal' as const], setTheme: null, setSkillBonus: 0 };
  const plan = [{ player: 'Prem', target: 'หมาป่า', advantage: 'none' as const }];
  const hit = (c: Character, e = enc(wolf)) => runAttacks(plan, [c], e, () => 1, () => 15);

  it('heals 1 HP when a hit removes a pip, without lifesteal nothing', () => {
    const w = hero({ hp: 3, maxHp: 10, itemEffects: ls });
    const r = applyLifesteal([w], enc(wolf), hit(w));
    expect(r.characters[0].hp).toBe(4);
    expect(r.changes).toHaveLength(1);
    const plain = hero({ hp: 3, maxHp: 10 });
    expect(applyLifesteal([plain], enc(wolf), hit(plain)).characters[0].hp).toBe(3);
  });

  it('a miss heals nothing', () => {
    const w = hero({ hp: 3, maxHp: 10, itemEffects: ls });
    const o = runAttacks(plan, [w], enc(wolf), () => 1, () => 2);
    expect(applyLifesteal([w], enc(wolf), o).characters[0].hp).toBe(3);
  });

  it('never exceeds max HP', () => {
    const w = hero({ hp: 10, maxHp: 10, itemEffects: ls });
    expect(applyLifesteal([w], enc(wolf), hit(w)).characters[0].hp).toBe(10);
  });

  it('a downed wearer is not revived', () => {
    const w = hero({ hp: 0, maxHp: 10, status: 'downed', itemEffects: ls });
    expect(applyLifesteal([w], enc(wolf), hit(w)).characters[0]).toMatchObject({ hp: 0, status: 'downed' });
  });

  it('at most once per round per wearer', () => {
    const w = hero({ hp: 3, maxHp: 10, itemEffects: ls });
    const [o] = hit(w, enc({ ...wolf, pip: 5, maxPip: 5 }));
    expect(applyLifesteal([w], enc({ ...wolf, pip: 5, maxPip: 5 }), [o, o]).characters[0].hp).toBe(4);
  });

  it('a boss held at 1 pip by the full-health rule gives no heal', () => {
    const w = hero({ hp: 3, maxHp: 10, itemEffects: ls });
    const small = { ...boss, pip: 1, maxPip: 1 } as Encounter['enemies'][number];
    const o = { ...hit(w, enc(wolf))[0], target: 'มังกร', pips: 2 };
    expect(applyLifesteal([w], enc(small), [o]).characters[0].hp).toBe(3);
  });

  it('does not mutate inputs', () => {
    const w = hero({ hp: 3, maxHp: 10, itemEffects: ls });
    applyLifesteal([w], enc(wolf), hit(w));
    expect(w.hp).toBe(3);
  });
});

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

describe('keen_eye (F5j3)', () => {
  const eye = (keenEye?: number) => ({ effects: ['keen_eye' as const], setTheme: null, setSkillBonus: 0, ...(keenEye ? { keenEye } : {}) });
  const plan = [{ player: 'Prem', target: 'มังกร', advantage: 'none' as const }];

  it('lowers the threshold by 1 or 2: boss 15 -> 14 / 13', () => {
    expect(resolveAttack({ d20s: [14], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 1 })).toMatchObject({ hit: true, dc: 14 });
    expect(resolveAttack({ d20s: [13], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 1 })).toMatchObject({ hit: false });
    expect(resolveAttack({ d20s: [13], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 2 })).toMatchObject({ hit: true, dc: 13 });
    expect(resolveAttack({ d20s: [12], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 2 })).toMatchObject({ hit: false });
  });

  it('nat 1 still always misses and the threshold never drops below 2', () => {
    expect(resolveAttack({ d20s: [1], tier: 'minion', damage: 8, maxDamage: 8, keenEye: 99 })).toMatchObject({ hit: false, critical: 'failure', dc: 2 });
    expect(resolveAttack({ d20s: [2], tier: 'minion', damage: 1, maxDamage: 8, keenEye: 99 })).toMatchObject({ hit: true, dc: 2 });
  });

  it('runAttacks uses the wearer value, defaults to 1 and ignores non-wearers', () => {
    const at = (c: Character, die: number) => runAttacks(plan, [c], enc(boss), () => 1, () => die)[0];
    expect(at(hero({ itemEffects: eye(2) }), 13)).toMatchObject({ hit: true, dc: 13 });
    expect(at(hero({ itemEffects: eye() }), 14)).toMatchObject({ hit: true, dc: 14 });
    expect(at(hero({ itemEffects: eye() }), 13).hit).toBe(false);
    expect(at(hero(), 14)).toMatchObject({ hit: false, dc: 15 });
  });
});

describe('ward (F5j4) on enemy_attack', () => {
  const tag = (enemy: string, player: string): CharacterTag => ({ kind: 'enemy_attack', enemy, player });
  const boss: Encounter = enc({ name: 'X', tier: 'boss', pip: 1, maxPip: maxPips.boss, fled: false });
  const ward = (n?: number) => ({ effects: ['ward' as const], setTheme: null, setSkillBonus: 0, ...(n ? { ward: n } : {}) });

  it('extra 2 (default) or 3 on top of armor, only for the first hit of the round', () => {
    const r = applyEnemyAttacks([hero({ armorReduction: 1, itemEffects: ward() })], boss, [tag('X', 'Prem'), tag('X', 'Prem')]);
    expect(r.characters[0].hp).toBe(20 - (8 - 3) - (8 - 1));
    expect(r.changes[0]).toContain('เกราะกัน 3');
    expect(applyEnemyAttacks([hero({ itemEffects: ward(3) })], boss, [tag('X', 'Prem')]).characters[0].hp).toBe(15);
  });

  it('never cuts a hit below 1 and still spends the ward', () => {
    const minion: Encounter = enc({ name: 'X', tier: 'minion', pip: 1, maxPip: maxPips.minion, fled: false });
    const used = new Set<string>();
    expect(applyEnemyAttacks([hero({ armorReduction: 3, itemEffects: ward(3) })], minion, [tag('X', 'Prem')], used).characters[0].hp).toBe(19);
    expect(used.has('p1')).toBe(true);
  });

  it('without the item nothing changes and the set stays empty', () => {
    const used = new Set<string>();
    expect(applyEnemyAttacks([hero()], boss, [tag('X', 'Prem')], used).characters[0].hp).toBe(12);
    expect(used.size).toBe(0);
  });
});
