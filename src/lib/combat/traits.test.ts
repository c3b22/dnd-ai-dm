import { describe, expect, it } from 'vitest';
import type { Character } from '@/lib/character/types';
import { parseCharacterTags } from '@/lib/character/tags';
import { applyEnemyAttackOutcomes, applyVenom, resolveAttack, runAttacks, runEnemyAttacks } from './attack';
import { ENEMY_TRAIT_IDS, ENEMY_TRAIT_LABELS, MAX_ENEMY_TRAITS } from './constants';
import { advanceEncounter, applyEnemyTags, normalizeEncounter, type Encounter, type EncounterEnemy } from './encounter';
import { combatPrompt } from './prompt';

const hero = (over: Partial<Character> = {}): Character =>
  ({ id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, gold: 0, xp: 0, ...over }) as Character;
const mk = (over: Partial<EncounterEnemy> = {}): EncounterEnemy => ({ name: 'X', tier: 'normal', pip: 2, maxPip: 2, fled: false, ...over });
const enc = (...enemies: EncounterEnemy[]): Encounter => ({ enemies });
const sides3 = () => 3;

describe('trait list (I4)', () => {
  it('has 9 traits, each with a Thai label', () => {
    expect(ENEMY_TRAIT_IDS).toHaveLength(9);
    for (const id of ENEMY_TRAIT_IDS) expect(ENEMY_TRAIT_LABELS[id]).toBeTruthy();
    expect(MAX_ENEMY_TRAITS).toBe(2);
  });
});

describe('[[enemy: name | tier | traits]] parsing', () => {
  it('parses the optional third part, ignores unknown names, dedupes and keeps at most 2', () => {
    const { tags } = parseCharacterTags('[[enemy: หมาป่า | normal | armored, pack]][[enemy: A | minion | foo, brute, brute, nimble]][[enemy: B | strong | nonsense]]');
    expect(tags).toEqual([
      { kind: 'enemy', name: 'หมาป่า', tier: 'normal', traits: ['armored', 'pack'] },
      { kind: 'enemy', name: 'A', tier: 'minion', traits: ['brute', 'nimble'] },
      { kind: 'enemy', name: 'B', tier: 'strong' },
    ]);
  });

  it('the old two-part tag still works and the tag is stripped from the narration', () => {
    const r = parseCharacterTags('เรื่อง\n[[enemy: Orc | strong]]\n[[enemy: Bat | minion | Nimble ]]');
    expect(r.tags).toEqual([{ kind: 'enemy', name: 'Orc', tier: 'strong' }, { kind: 'enemy', name: 'Bat', tier: 'minion', traits: ['nimble'] }]);
    expect(r.cleanText).not.toContain('[[');
  });
});

describe('encounter storage', () => {
  it('stores traits from the tag, drops boss_signature on non-bosses and starts at round 1', () => {
    const e = applyEnemyTags(null, [
      { kind: 'enemy', name: 'A', tier: 'normal', traits: ['armored', 'boss_signature'] },
      { kind: 'enemy', name: 'Dragon', tier: 'boss', traits: ['boss_signature'] },
    ])!;
    expect(e.enemies[0].traits).toEqual(['armored']);
    expect(e.enemies[1].traits).toEqual(['boss_signature']);
    expect(e.round).toBe(1);
    expect(applyEnemyTags(null, [{ kind: 'enemy', name: 'A', tier: 'normal', traits: ['armored'] }])?.round).toBeUndefined();
  });

  it('normalizes old encounters without traits and keeps valid new fields', () => {
    expect(normalizeEncounter({ enemies: [{ name: 'a', tier: 'normal', pip: 2, maxPip: 2, fled: false }] })).toEqual(enc(mk({ name: 'a' })));
    const full = { enemies: [{ ...mk({ name: 'a' }), traits: ['armored', 'bogus', 'pack', 'brute'], calm: 1 }], round: 3, poisoned: ['p1', 5] };
    expect(normalizeEncounter(full)).toEqual({ enemies: [mk({ name: 'a', traits: ['armored', 'pack'], calm: 1 })], round: 3, poisoned: ['p1'] });
  });
});

describe('advanceEncounter (round counter, regenerating, venom)', () => {
  it('counts the fight round only while a fearsome or boss_signature enemy lives: a new fight keeps round 1, an existing one counts up', () => {
    const f = (over: Partial<EncounterEnemy> = {}) => mk({ traits: ['fearsome'], ...over });
    expect(advanceEncounter(null, { enemies: [f()], round: 1 })?.round).toBe(1);
    expect(advanceEncounter({ enemies: [f()], round: 1 }, { enemies: [f()], round: 1 })?.round).toBe(2);
    expect(advanceEncounter({ enemies: [f()] }, { enemies: [f()] })?.round).toBe(2);
    expect(advanceEncounter({ enemies: [mk()], round: 4 }, { enemies: [mk()], round: 4 })).toEqual({ enemies: [mk()] });
    expect(advanceEncounter({ enemies: [f()] }, null)).toBeNull();
  });

  it('regenerating recovers 1 pip after 2 rounds without being hit, never above max', () => {
    const r = (pip: number, calm?: number) => mk({ traits: ['regenerating'], pip, calm });
    const one = advanceEncounter(enc(r(1)), enc(r(1)))!;
    expect(one.enemies[0]).toMatchObject({ pip: 1, calm: 1 });
    const two = advanceEncounter(one, enc(r(1, 1)))!;
    expect(two.enemies[0].pip).toBe(2);
    expect(two.enemies[0].calm ?? 0).toBe(0);
    expect(advanceEncounter(enc(r(2, 1)), enc(r(2, 1)))!.enemies[0].pip).toBe(2);
  });

  it('being hit resets the calm counter and a non-regenerating enemy never heals', () => {
    const hit = advanceEncounter(enc(mk({ traits: ['regenerating'], pip: 2, calm: 1 })), enc(mk({ traits: ['regenerating'], pip: 1, calm: 1 })))!;
    expect(hit.enemies[0].pip).toBe(1);
    expect(hit.enemies[0].calm ?? 0).toBe(0);
    const start = enc(mk({ pip: 1 }));
    const a = advanceEncounter(start, enc(mk({ pip: 1 })))!;
    const b = advanceEncounter(a, enc(mk({ pip: 1 })))!;
    const c = advanceEncounter(b, enc(mk({ pip: 1 })))!;
    expect(c.enemies[0].pip).toBe(1);
  });

  it('records the poisoned players for the next round', () => {
    expect(advanceEncounter(enc(mk()), enc(mk()), ['p1'])?.poisoned).toEqual(['p1']);
    expect(advanceEncounter(enc(mk()), enc(mk()))?.poisoned).toBeUndefined();
  });
});

describe('player attacks versus traits', () => {
  it('armored raises the AC by 2 and nimble by 1 (they stack), keen_eye still lowers it', () => {
    expect(resolveAttack({ d20s: [14], tier: 'normal', damage: 1, maxDamage: 8, acBonus: 2 })).toMatchObject({ hit: false, dc: 15 });
    expect(resolveAttack({ d20s: [15], tier: 'normal', damage: 1, maxDamage: 8, acBonus: 2 })).toMatchObject({ hit: true, dc: 15 });
    expect(resolveAttack({ d20s: [14], tier: 'normal', damage: 1, maxDamage: 8, acBonus: 1 })).toMatchObject({ hit: true, dc: 14 });
    expect(resolveAttack({ d20s: [14], tier: 'normal', damage: 1, maxDamage: 8, acBonus: 3, keenEye: 1 })).toMatchObject({ dc: 15, hit: false });
  });

  const plan = [{ player: 'Prem', target: 'X', advantage: 'none' as const }];
  it('runAttacks reads the traits of the target: armored normal (AC 15) needs total 15', () => {
    const e = enc(mk({ traits: ['armored'] }));
    // shortsword: STR/DEX 10 -> mod 0, proficiency +2
    const miss = runAttacks(plan, [hero()], e, () => 1, () => 12)[0];
    const hit = runAttacks(plan, [hero()], e, () => 1, () => 13)[0];
    expect(miss).toMatchObject({ hit: false, dc: 15 });
    expect(hit).toMatchObject({ hit: true, dc: 15 });
  });

  it('fearsome gives every player disadvantage on the first combat round only', () => {
    const fearsome = (round: number) => ({ ...enc(mk({ traits: ['fearsome'] })), round });
    const dice = [18, 2];
    let n = 0;
    const roll = () => dice[n++ % 2];
    const r1 = runAttacks(plan, [hero()], fearsome(1), () => 1, roll)[0];
    expect(r1).toMatchObject({ advantage: 'disadvantage', die: 2 });
    n = 0;
    const r2 = runAttacks(plan, [hero()], fearsome(2), () => 1, roll)[0];
    expect(r2).toMatchObject({ advantage: 'none', die: 18 });
  });

  it('fearsome cancels a planned advantage; an encounter without a round number counts as round 1', () => {
    const e = enc(mk({ traits: ['fearsome'] }));
    const r = runAttacks([{ player: 'Prem', target: 'X', advantage: 'advantage' }], [hero()], e, () => 1, () => 10)[0];
    expect(r.advantage).toBe('none');
    expect(r.dice).toHaveLength(1);
  });

  it('a fled fearsome enemy does not scare anyone', () => {
    const e = { ...enc(mk({ name: 'F', traits: ['fearsome'], fled: true }), mk()), round: 1 };
    expect(runAttacks(plan, [hero()], e, () => 1, () => 10)[0].advantage).toBe('none');
  });
});

describe('enemy attacks with traits', () => {
  const one = (over: Partial<EncounterEnemy> = {}, ...rest: EncounterEnemy[]): Encounter => enc(mk(over), ...rest);
  const attack = [{ enemy: 'X', player: 'Prem' }];

  it('brute adds 2 damage on a hit (not on a miss)', () => {
    const base = runEnemyAttacks(attack, [hero()], one(), () => 15, sides3)[0];
    const brute = runEnemyAttacks(attack, [hero()], one({ traits: ['brute'] }), () => 15, sides3)[0];
    expect(brute.damage).toBe(base.damage + 2);
    expect(runEnemyAttacks(attack, [hero()], one({ traits: ['brute'] }), () => 1, sides3)[0].damage).toBe(0);
  });

  it('pack rolls two dice and keeps the higher when another enemy is still standing', () => {
    const dice = [3, 17];
    let n = 0;
    const pack = one({ traits: ['pack'] }, mk({ name: 'Y' }));
    const o = runEnemyAttacks(attack, [hero()], pack, () => dice[n++], sides3)[0];
    expect(o).toMatchObject({ die: 17, advantage: true, hit: true });
  });

  it('pack has no advantage when it is the last one standing (others down or fled)', () => {
    const alone = one({ traits: ['pack'] }, mk({ name: 'Y', pip: 0 }), mk({ name: 'Z', fled: true }));
    const o = runEnemyAttacks(attack, [hero()], alone, () => 5, sides3)[0];
    expect(o.advantage).toBeFalsy();
  });

  it('pack counts mates that survive the players attacks of this round (survivors view)', () => {
    const pack = one({ traits: ['pack'] }, mk({ name: 'Y' }));
    const survivors = one({ traits: ['pack'] }, mk({ name: 'Y', pip: 0 }));
    const o = runEnemyAttacks(attack, [hero()], pack, () => 5, sides3, survivors)[0];
    expect(o.advantage).toBeFalsy();
  });

  it('venomous marks a hit and only a hit', () => {
    const v = one({ traits: ['venomous'] });
    expect(runEnemyAttacks(attack, [hero()], v, () => 15, sides3)[0].venomous).toBe(true);
    expect(runEnemyAttacks(attack, [hero()], v, () => 1, sides3)[0].venomous).toBe(false);
    expect(runEnemyAttacks(attack, [hero()], one(), () => 15, sides3)[0].venomous).toBe(false);
  });

  it('boss_signature lets a boss attack 2 different players every 3rd round, else only 1', () => {
    const heroes = [hero(), hero({ id: 'p2', displayName: 'Nok' })];
    const two = [{ enemy: 'X', player: 'Prem' }, { enemy: 'X', player: 'Nok' }, { enemy: 'X', player: 'Prem' }];
    const boss = (round: number): Encounter => ({ ...enc(mk({ tier: 'boss', pip: 5, maxPip: 5, traits: ['boss_signature'] })), round });
    expect(runEnemyAttacks(two, heroes, boss(3), () => 10, sides3).map((o) => o.playerDisplayName)).toEqual(['Prem', 'Nok']);
    expect(runEnemyAttacks(two, heroes, boss(6), () => 10, sides3)).toHaveLength(2);
    expect(runEnemyAttacks(two, heroes, boss(2), () => 10, sides3)).toHaveLength(1);
    expect(runEnemyAttacks(two, heroes, enc(mk({ tier: 'boss', pip: 5, maxPip: 5 })), () => 10, sides3)).toHaveLength(1);
  });

  it('an outcome still applies as before', () => {
    const o = runEnemyAttacks(attack, [hero()], one(), () => 15, sides3);
    expect(applyEnemyAttackOutcomes([hero()], o).characters[0].hp).toBeLessThan(20);
  });
});

describe('prompt lists traits', () => {
  it('explains the trait names and the third tag part, and shows each enemy traits', () => {
    const text = combatPrompt(enc(mk({ traits: ['armored', 'pack'] })), true).join('\n');
    expect(text).toContain('[[enemy: Name | minion/normal/strong/boss | trait1, trait2]]');
    for (const id of ENEMY_TRAIT_IDS) expect(text).toContain(id);
    expect(text).toContain('- X (normal) [armored, pack]: 2/2 pips');
  });
});

describe('applyVenom', () => {
  it('takes 1 HP from each poisoned active player but never below 1 HP', () => {
    const r = applyVenom([hero(), hero({ id: 'p2', displayName: 'Nok', hp: 1 }), hero({ id: 'p3', displayName: 'Ann', status: 'downed', hp: 0 })], ['p1', 'p2', 'p3', 'p1']);
    expect(r.characters.map((c) => c.hp)).toEqual([19, 1, 0]);
    expect(r.changes).toEqual(['Prem −1 HP จากพิษ']);
  });

  it('does nothing without a poisoned list', () => {
    expect(applyVenom([hero()], undefined)).toEqual({ characters: [hero()], changes: [] });
  });
});
