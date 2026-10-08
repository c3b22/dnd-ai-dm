import { describe, expect, it, vi } from 'vitest';
import type { CharacterTag } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { attackBonuses, applyAttackOutcomes, applyEnemyAttackOutcomes, applyEnemyAttackTags, applyLifesteal, resolveAttack, resolveEnemyAttack, runAttacks, runEnemyAttacks } from './attack';
import type { Encounter } from './encounter';
import { MAGIC_ITEMS } from '@/lib/inventory/magicItems';
import { TIER_PIPS } from './constants';

const tiers = ['minion', 'normal', 'strong', 'boss'] as const;
const thresholds = { minion: 11, normal: 13, strong: 15, boss: 17 };
const maxPips = TIER_PIPS;

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
    expect(resolveAttack({ d20s: [13], tier: 'normal', damage: 6, maxDamage: 8 }).pips).toBe(2);
    expect(resolveAttack({ d20s: [13], tier: 'normal', damage: 5, maxDamage: 8 }).pips).toBe(1);
  });

  it('level bonus counts toward the heavy blow (d4 weapon: 3 of 4 yes, 2 of 4 no)', () => {
    expect(resolveAttack({ d20s: [13], tier: 'normal', damage: 3, maxDamage: 4 }).pips).toBe(2);
    expect(resolveAttack({ d20s: [13], tier: 'normal', damage: 2, maxDamage: 4 }).pips).toBe(1);
  });

  it('advantage takes the higher die and disadvantage the lower', () => {
    expect(resolveAttack({ d20s: [3, 16], advantage: 'advantage', tier: 'strong', damage: 1, maxDamage: 8 })).toMatchObject({ die: 16, hit: true });
    expect(resolveAttack({ d20s: [3, 16], advantage: 'disadvantage', tier: 'strong', damage: 1, maxDamage: 8 })).toMatchObject({ die: 3, hit: false });
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
    expect(resolveAttack({ d20s: [13], tier: 'normal', damage: 6, maxDamage: 8, critSurge: true }).pips).toBe(2);
    expect(resolveAttack({ d20s: [13], tier: 'normal', damage: 1, maxDamage: 8, critSurge: true }).pips).toBe(1);
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
    const [o] = runAttacks(plan('หมาป่า'), [hero()], enc(wolf), () => 7, () => 11);
    expect(o).toMatchObject({ target: 'หมาป่า', dc: 13, die: 11, total: 13, hit: true, pips: 2, damage: 7, maxDamage: 8, defeated: true });
  });

  it('a miss removes nothing', () => {
    const [o] = runAttacks(plan('หมาป่า'), [hero()], enc(wolf), () => 7, () => 10);
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
      { playerId: 'p1', playerDisplayName: 'Prem', target: 'มังกร', tier: 'boss', dc: 17, advantage: 'none', dice: [20], die: 20, modifier: 0, proficiency: 2, magic: 0, total: 22, hit: true, critical: 'success', pips: 2, defeated: false, damage: 8, maxDamage: 8 },
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

describe('enemy attacks against AC (I2)', () => {
  const one = (tier: (typeof tiers)[number]): Encounter => enc({ name: 'X', tier, pip: 1, maxPip: maxPips[tier], fled: false });
  const plan = [{ enemy: 'X', player: 'Prem' }];
  // Prem has no armor and default abilities: AC 10.
  const roll = (c: Character, tier: (typeof tiers)[number], die: number, sides: (n: number) => number = () => 3) =>
    runEnemyAttacks(plan, [c], one(tier), () => die, sides);

  it('attack bonus by tier: minion +3, normal +5, strong +6, boss +9', () => {
    for (const [tier, bonus] of [['minion', 3], ['normal', 5], ['strong', 6], ['boss', 9]] as const) {
      expect(resolveEnemyAttack({ die: 10, tier, ac: 99 })).toMatchObject({ bonus, total: 10 + bonus });
    }
  });

  it('hits when d20 + bonus reaches AC and misses one below', () => {
    expect(resolveEnemyAttack({ die: 8, tier: 'normal', ac: 14 })).toMatchObject({ hit: false, total: 13, critical: null });
    expect(resolveEnemyAttack({ die: 9, tier: 'normal', ac: 14 })).toMatchObject({ hit: true, total: 14, critical: null });
  });

  it('nat 1 always misses (even against AC 1) and nat 20 always hits (even against AC 99)', () => {
    expect(resolveEnemyAttack({ die: 1, tier: 'boss', ac: 1 })).toMatchObject({ hit: false, critical: 'failure' });
    expect(resolveEnemyAttack({ die: 20, tier: 'minion', ac: 99 })).toMatchObject({ hit: true, critical: 'success' });
  });

  it('compares against the target AC: armor makes the same roll miss', () => {
    expect(roll(hero(), 'minion', 7)[0]).toMatchObject({ ac: 10, total: 10, hit: true });
    expect(roll(hero({ armorReduction: 1, armorWeight: 1 }), 'minion', 7)[0]).toMatchObject({ ac: 12, hit: false, damage: 0 });
  });

  it('damage dice by tier: 1d4, 1d8+2, 2d6+3, 3d6+4 (every die rolls 3)', () => {
    for (const [tier, dmg] of [['minion', 3], ['normal', 5], ['strong', 9], ['boss', 13]] as const) {
      expect(roll(hero(), tier, 19)[0].damage).toBe(dmg);
    }
  });

  it('nat 20 doubles the damage dice but not the flat bonus: boss 6d6+4, minion 2d4', () => {
    expect(roll(hero(), 'boss', 20)[0]).toMatchObject({ critical: 'success', damage: 22 });
    expect(roll(hero(), 'minion', 20)[0].damage).toBe(6);
  });

  it('a miss rolls no damage dice', () => {
    const sides = vi.fn(() => 3);
    expect(roll(hero(), 'minion', 1, sides)[0]).toMatchObject({ hit: false, damage: 0 });
    expect(sides).not.toHaveBeenCalled();
  });

  it('one attack per enemy; ignores unknown enemies, unknown or downed players and no encounter', () => {
    expect(runEnemyAttacks([...plan, ...plan], [hero()], one('boss'), () => 15, () => 1)).toHaveLength(1);
    expect(runEnemyAttacks([{ enemy: 'Y', player: 'Prem' }, { enemy: 'X', player: 'Ghost' }], [hero()], one('boss'), () => 15, () => 1)).toEqual([]);
    expect(runEnemyAttacks(plan, [hero({ status: 'downed', hp: 0 })], one('boss'), () => 15, () => 1)).toEqual([]);
    expect(runEnemyAttacks(plan, [hero()], null, () => 15, () => 1)).toEqual([]);
  });

  it('applies a hit with no armor reduction, reports it and downs a player at 0 hp', () => {
    const heavy = hero({ armorReduction: 3, armorWeight: 3 }); // AC 16
    const r = applyEnemyAttackOutcomes([heavy], roll(heavy, 'boss', 18)); // 18 + 9 hits, 3d6+4 = 13
    expect(r.characters[0].hp).toBe(7);
    expect(r.changes[0]).toContain('X โจมตี Prem: ทอย 18+9 = 27 เทียบ AC 16 โดน −13 HP');
    const low = applyEnemyAttackOutcomes([hero({ hp: 5 })], roll(hero(), 'boss', 15));
    expect(low.characters[0]).toMatchObject({ hp: 0, status: 'downed' });
    expect(low.changes).toContain('Prem ล้มลง');
  });

  it('a miss reports it and leaves HP alone', () => {
    const r = applyEnemyAttackOutcomes([hero()], roll(hero(), 'minion', 1));
    expect(r.characters[0].hp).toBe(20);
    expect(r.changes[0]).toContain('พลาด');
  });

  it('a critical hit is labelled in the report', () => {
    expect(applyEnemyAttackOutcomes([hero()], roll(hero(), 'normal', 20)).changes[0]).toContain('คริติคอล');
  });

  it('does not mutate its input', () => {
    const input = [hero()];
    applyEnemyAttackOutcomes(input, roll(hero(), 'boss', 15));
    expect(input[0].hp).toBe(20);
  });

  describe('ยืนบัง (guard)', () => {
    const warrior = hero({ id: 'w1', displayName: 'Bram', hp: 30, maxHp: 30 });
    const guards = { p1: 'w1' };

    it('the warrior takes the hit instead, halved (rounded up), and Prem is untouched', () => {
      const r = applyEnemyAttackOutcomes([hero(), warrior], roll(hero(), 'boss', 15), new Set(), guards); // 13 damage
      expect(r.characters[0].hp).toBe(20);
      expect(r.characters[1].hp).toBe(23);
      expect(r.changes[0]).toContain('Bram รับดาเมจแทน Prem −7 HP');
    });

    it('a miss costs the warrior nothing', () => {
      const r = applyEnemyAttackOutcomes([hero(), warrior], roll(hero(), 'boss', 1), new Set(), guards);
      expect(r.characters.map((c) => c.hp)).toEqual([20, 30]);
    });

    it('a downed warrior no longer guards', () => {
      const down = { ...warrior, status: 'downed' as const, hp: 0 };
      const r = applyEnemyAttackOutcomes([hero(), down], roll(hero(), 'boss', 15), new Set(), guards);
      expect(r.characters[0].hp).toBe(7);
    });
  });

  describe('narration fallback for [[enemy_attack]] tags', () => {
    const tag = { kind: 'enemy_attack' as const, enemy: 'X', player: 'Prem' };

    it('rolls the same formula and reports it', () => {
      const r = applyEnemyAttackTags([hero()], one('normal'), [tag], () => 15, () => 3);
      expect(r.outcomes).toHaveLength(1);
      expect(r.characters[0].hp).toBe(15);
      expect(r.changes[0]).toContain('X โจมตี Prem');
    });

    it('ignores other tags, unknown enemies and downed players', () => {
      expect(applyEnemyAttackTags([hero()], one('normal'), [{ kind: 'hurt', name: 'Prem', tier: 'light' }], () => 15, () => 3).outcomes).toEqual([]);
      expect(applyEnemyAttackTags([hero()], one('normal'), [{ ...tag, enemy: 'Y' }], () => 15, () => 3).outcomes).toEqual([]);
      expect(applyEnemyAttackTags([hero({ status: 'downed', hp: 0 })], one('normal'), [tag], () => 15, () => 3).outcomes).toEqual([]);
    });
  });
});

describe('keen_eye (F5j3)', () => {
  const eye = (keenEye?: number) => ({ effects: ['keen_eye' as const], setTheme: null, setSkillBonus: 0, ...(keenEye ? { keenEye } : {}) });
  const plan = [{ player: 'Prem', target: 'มังกร', advantage: 'none' as const }];

  it('lowers the threshold by 1 or 2: boss 17 -> 16 / 15', () => {
    expect(resolveAttack({ d20s: [16], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 1 })).toMatchObject({ hit: true, dc: 16 });
    expect(resolveAttack({ d20s: [15], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 1 })).toMatchObject({ hit: false });
    expect(resolveAttack({ d20s: [15], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 2 })).toMatchObject({ hit: true, dc: 15 });
    expect(resolveAttack({ d20s: [14], tier: 'boss', damage: 1, maxDamage: 8, keenEye: 2 })).toMatchObject({ hit: false });
  });

  it('nat 1 still always misses and the threshold never drops below 2', () => {
    expect(resolveAttack({ d20s: [1], tier: 'minion', damage: 8, maxDamage: 8, keenEye: 99 })).toMatchObject({ hit: false, critical: 'failure', dc: 2 });
    expect(resolveAttack({ d20s: [2], tier: 'minion', damage: 1, maxDamage: 8, keenEye: 99 })).toMatchObject({ hit: true, dc: 2 });
  });

  it('runAttacks uses the wearer value, defaults to 1 and ignores non-wearers', () => {
    const at = (c: Character, die: number) => runAttacks(plan, [c], enc(boss), () => 1, () => die)[0];
    // the hero adds +2 proficiency at level 1, so total = die + 2
    expect(at(hero({ itemEffects: eye(2) }), 13)).toMatchObject({ hit: true, dc: 15 });
    expect(at(hero({ itemEffects: eye() }), 14)).toMatchObject({ hit: true, dc: 16 });
    expect(at(hero({ itemEffects: eye() }), 13).hit).toBe(false);
    expect(at(hero(), 14)).toMatchObject({ hit: false, dc: 17 });
  });
});

describe('ward (F5j4) on enemy attacks', () => {
  const boss: Encounter = enc({ name: 'X', tier: 'boss', pip: 1, maxPip: maxPips.boss, fled: false });
  const plan = [{ enemy: 'X', player: 'Prem' }];
  const ward = (n?: number) => ({ effects: ['ward' as const], setTheme: null, setSkillBonus: 0, ...(n ? { ward: n } : {}) });
  const hits = (c: Character, encounter: Encounter = boss, die = 15) => runEnemyAttacks(plan, [c], encounter, () => die, () => 3); // boss damage 13

  it('default ward takes 2 off, only for the first hit of the round', () => {
    const w = hero({ itemEffects: ward(), hp: 40, maxHp: 40 });
    const r = applyEnemyAttackOutcomes([w], [...hits(w), ...hits(w)]);
    expect(r.characters[0].hp).toBe(40 - (13 - 2) - 13);
    expect(r.changes[0]).toContain('เกราะวิเศษกัน 2');
  });

  it('ward 3 takes 3 off', () => {
    const w = hero({ itemEffects: ward(3) });
    expect(applyEnemyAttackOutcomes([w], hits(w)).characters[0].hp).toBe(10);
  });

  it('never cuts a hit below 1 and still spends the ward', () => {
    const minion: Encounter = enc({ name: 'X', tier: 'minion', pip: 1, maxPip: 1, fled: false });
    const w = hero({ itemEffects: ward(3) });
    const used = new Set<string>();
    expect(applyEnemyAttackOutcomes([w], runEnemyAttacks(plan, [w], minion, () => 15, () => 1), used).characters[0].hp).toBe(19);
    expect(used.has('p1')).toBe(true);
  });

  it('a miss does not spend the ward; without the item the set stays empty', () => {
    const w = hero({ itemEffects: ward() });
    const used = new Set<string>();
    applyEnemyAttackOutcomes([w], hits(w, boss, 1), used);
    expect(used.size).toBe(0);
    applyEnemyAttackOutcomes([hero()], hits(hero()), used);
    expect(used.size).toBe(0);
  });

  it('ward also lowers the warrior guard hit', () => {
    const warrior = hero({ id: 'w1', displayName: 'Bram', hp: 30, maxHp: 30, itemEffects: ward() });
    const r = applyEnemyAttackOutcomes([hero(), warrior], hits(hero()), new Set(), { p1: 'w1' });
    expect(r.characters[1].hp).toBe(30 - Math.ceil((13 - 2) / 2));
  });
});

describe('I3 attack bonus: ability modifier + proficiency + magic weapon', () => {
  const abil = (over: Partial<Record<'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA', number>>) => ({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, ...over });
  const xpFor = (level: number) => [0, 60, 150, 270, 420, 600, 810, 1050, 1320, 1620][level - 1];

  it('shortsword and dagger use the higher of STR and DEX, shortbow DEX, staff WIS, fists STR', () => {
    const a = abil({ STR: 8, DEX: 16, WIS: 14 });
    expect(attackBonuses(hero({ weaponId: 'shortsword', abilities: a })).modifier).toBe(3);
    expect(attackBonuses(hero({ weaponId: 'dagger', abilities: abil({ STR: 18, DEX: 12 }) })).modifier).toBe(4);
    expect(attackBonuses(hero({ weaponId: 'shortbow', abilities: a })).modifier).toBe(3);
    expect(attackBonuses(hero({ weaponId: 'shortbow', abilities: abil({ STR: 20, DEX: 8 }) })).modifier).toBe(-1);
    expect(attackBonuses(hero({ weaponId: 'staff', abilities: a })).modifier).toBe(2);
    expect(attackBonuses(hero({ weaponId: 'fists', abilities: abil({ STR: 14, DEX: 18 }) })).modifier).toBe(2);
    expect(attackBonuses(hero({ weaponId: null, abilities: abil({ STR: 14 }) })).modifier).toBe(2);
  });

  it('proficiency follows the level: +2 at 1, +3 at 5, +4 at 9', () => {
    expect(attackBonuses(hero({ xp: xpFor(1) })).proficiency).toBe(2);
    expect(attackBonuses(hero({ xp: xpFor(4) })).proficiency).toBe(2);
    expect(attackBonuses(hero({ xp: xpFor(5) })).proficiency).toBe(3);
    expect(attackBonuses(hero({ xp: xpFor(9) })).proficiency).toBe(4);
  });

  it('a magic weapon adds its bonus and attacks with its base weapon ability', () => {
    const magicStaff = MAGIC_ITEMS.find((i) => i.mechanic.kind === 'weapon' && i.mechanic.weaponId === 'staff')!;
    const bonus = (magicStaff.mechanic as { damageBonus: number }).damageBonus;
    expect(bonus).toBeGreaterThan(0);
    expect(attackBonuses(hero({ weaponId: magicStaff.id, abilities: abil({ STR: 18, WIS: 14 }) }))).toEqual({ modifier: 2, proficiency: 2, magic: bonus });
    expect(attackBonuses(hero({ weaponId: 'staff' })).magic).toBe(0);
  });

  it('boundary: d20 + mod + proficiency must reach the AC (normal 13): 8 + 3 + 2 hits, 7 misses', () => {
    const plan = [{ player: 'Prem', target: 'หมาป่า', advantage: 'none' as const }];
    const r = (die: number) => runAttacks(plan, [hero({ abilities: abil({ DEX: 16 }) })], enc(wolf), () => 1, () => die)[0];
    expect(r(8)).toMatchObject({ hit: true, modifier: 3, proficiency: 2, magic: 0, total: 13, dc: 13 });
    expect(r(7)).toMatchObject({ hit: false, total: 12 });
  });

  it('the modifier does not rescue a natural 1 and a natural 20 hits even with a negative total', () => {
    expect(resolveAttack({ d20s: [1], tier: 'minion', damage: 1, maxDamage: 8, modifier: 5, proficiency: 3 })).toMatchObject({ hit: false, critical: 'failure' });
    expect(resolveAttack({ d20s: [20], tier: 'boss', damage: 1, maxDamage: 8, modifier: -5 })).toMatchObject({ hit: true, critical: 'success' });
  });

  it('magic bonus and keen_eye stack: boss AC 17 - 1, d20 11 + 3 + 2 + 1 = 17 hits', () => {
    expect(resolveAttack({ d20s: [11], tier: 'boss', damage: 1, maxDamage: 8, modifier: 3, proficiency: 2, magic: 1, keenEye: 1 })).toMatchObject({ hit: true, total: 17, dc: 16 });
    expect(resolveAttack({ d20s: [10], tier: 'boss', damage: 1, maxDamage: 8, modifier: 3, proficiency: 2, magic: 1 })).toMatchObject({ hit: false, total: 16, dc: 17 });
  });
});
