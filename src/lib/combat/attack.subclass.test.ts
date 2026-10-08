import { describe, expect, it } from 'vitest';
import type { Character } from '@/lib/character/types';
import { emptyRoundEffects, type RoundEffects } from '@/lib/character/spells';
import type { AttackMods } from '@/lib/character/subclasses';
import { applyAttackOutcomes, applyDefeatHeals, runAttacks } from './attack';
import type { Encounter } from './encounter';

const hero = (over: Partial<Character> = {}): Character =>
  ({ id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 10, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, gold: 0, xp: 0, ...over }) as Character;
const enc = (...enemies: Encounter['enemies']): Encounter => ({ enemies });
const wolf = { name: 'หมาป่า', tier: 'normal' as const, pip: 2, maxPip: 2, fled: false };
const bear = { name: 'หมี', tier: 'strong' as const, pip: 3, maxPip: 3, fled: false };
const rat = { name: 'หนู', tier: 'minion' as const, pip: 1, maxPip: 1, fled: false };
const plan = (target: string) => [{ player: 'Prem', target, advantage: 'none' as const }];
const withMods = (mods: AttackMods, id = 'p1'): RoundEffects => ({ ...emptyRoundEffects(), attackMods: { [id]: mods } });
// the player's weapon damage is low (1 of max 8), so a plain hit is 1 pip
const low = () => 1;

describe('attack modifiers from abilities and subclasses (K5)', () => {
  it('berserk strike: advantage (two dice), at least 2 pips, 3 on a natural 20', () => {
    const mods = { advantage: true, minPips: 2, critPips: 3 };
    const [hit] = runAttacks(plan('หมี'), [hero()], enc(bear), low, () => 15, withMods(mods));
    expect(hit).toMatchObject({ advantage: 'advantage', hit: true, pips: 2 });
    expect(hit.dice).toHaveLength(2);
    const [crit] = runAttacks(plan('หมี'), [hero()], enc(bear), low, () => 20, withMods(mods));
    expect(crit.pips).toBe(3);
    const [miss] = runAttacks(plan('หมี'), [hero()], enc(bear), low, () => 2, withMods(mods));
    expect(miss).toMatchObject({ hit: false, pips: 0 });
    // without the modifiers it is a plain 1 pip hit
    expect(runAttacks(plan('หมี'), [hero()], enc(bear), low, () => 15)[0].pips).toBe(1);
  });

  it('an ability advantage does not stack with a blessing, and fearsome takes one step back', () => {
    const effects = withMods({ advantage: true });
    effects.advantage.add('p1');
    const [o] = runAttacks(plan('หมาป่า'), [hero()], enc(wolf), low, () => 15, effects);
    expect(o.advantage).toBe('advantage');
    const fearsome = enc({ ...wolf, traits: ['fearsome'] });
    expect(runAttacks(plan('หมาป่า'), [hero()], fearsome, low, () => 15, withMods({ advantage: true }))[0].advantage).toBe('none');
  });

  it('volley: separate rolls, first at the chosen enemy and the next at the following live enemy, 1 pip each', () => {
    const out = runAttacks(plan('หมาป่า'), [hero({ classId: 'archer', weaponId: 'shortbow' })], enc(wolf, bear), low, () => 15, withMods({ shots: 2 }));
    expect(out.map((o) => [o.target, o.hit, o.pips, o.shot])).toEqual([['หมาป่า', true, 1, undefined], ['หมี', true, 1, 2]]);
    expect(applyAttackOutcomes(enc(wolf, bear), out)!.enemies.map((e) => e.pip)).toEqual([1, 2]);
  });

  it('volley: with no other enemy standing the extra shots go to the same one, and a defeated one stops them', () => {
    const three = runAttacks(plan('หมาป่า'), [hero({ classId: 'archer', weaponId: 'shortbow' })], enc(wolf), low, () => 15, withMods({ shots: 3 }));
    expect(three.map((o) => [o.target, o.pips, o.defeated])).toEqual([['หมาป่า', 1, false], ['หมาป่า', 1, true]]);
    const dead = runAttacks(plan('หนู'), [hero({ classId: 'archer', weaponId: 'shortbow' })], enc(rat), low, () => 15, withMods({ shots: 2 }));
    expect(dead).toHaveLength(1);
    expect(dead[0].defeated).toBe(true);
  });

  it('volley shots roll their own dice and a natural 20 on one is a heavy 2 pips', () => {
    const dice = [20, 15];
    let i = 0;
    const out = runAttacks(plan('หมี'), [hero({ classId: 'archer', weaponId: 'shortbow' })], enc(bear), () => 8, () => dice[i++], withMods({ shots: 2 }));
    expect(out.map((o) => [o.die, o.pips])).toEqual([[20, 2], [15, 1]]);
  });

  it('hunter: strong and boss enemies have AC 2 lower; the plus pip applies only to the precise shot', () => {
    const hunter = hero({ classId: 'archer', weaponId: 'shortbow', subclassId: 'archer_hunter' });
    const plain = hero({ classId: 'archer', weaponId: 'shortbow' });
    // strong AC 15: a 13 + proficiency 2 = 15 hits either way; an 11 + 2 = 13 hits only for the hunter (AC 13)
    const [h] = runAttacks(plan('หมี'), [hunter], enc(bear), low, () => 11);
    expect(h).toMatchObject({ hit: true, dc: 13 });
    expect(runAttacks(plan('หมี'), [plain], enc(bear), low, () => 11)[0]).toMatchObject({ hit: false, dc: 15 });
    // a normal enemy is not affected
    expect(runAttacks(plan('หมาป่า'), [hunter], enc(wolf), low, () => 11)[0].dc).toBe(13);
    expect(runAttacks(plan('หมี'), [hunter], enc(bear), low, () => 15)[0].pips).toBe(1);
    const precise = withMods({ extraPipsVs: { tiers: ['strong', 'boss'], pips: 1 } });
    expect(runAttacks(plan('หมี'), [hunter], enc(bear), low, () => 15, precise)[0].pips).toBe(2);
    expect(runAttacks(plan('หมาป่า'), [hunter], enc(wolf), low, () => 15, precise)[0].pips).toBe(1);
  });

  it('assassin: one pip more against an enemy that still has all its pips, not against a wounded one', () => {
    const effects = () => withMods({ advantage: true, extraPipIfFull: 1 });
    const rogue = hero({ classId: 'rogue', weaponId: 'dagger' });
    expect(runAttacks(plan('หมาป่า'), [rogue], enc(wolf), low, () => 15, effects())[0]).toMatchObject({ advantage: 'advantage', pips: 2 });
    expect(runAttacks(plan('หมาป่า'), [rogue], enc({ ...wolf, pip: 1 }), low, () => 15, effects())[0].pips).toBe(1);
  });

  it('modifiers belong to one player only', () => {
    const out = runAttacks(
      [{ player: 'Prem', target: 'หมี', advantage: 'none' }, { player: 'Suki', target: 'หมี', advantage: 'none' }],
      [hero(), hero({ id: 'p2', displayName: 'Suki' })],
      enc(bear), low, () => 15, withMods({ minPips: 2 })
    );
    expect(out.map((o) => o.pips)).toEqual([2, 1]);
  });
});

describe('applyDefeatHeals (berserk strike, level 5+)', () => {
  const effects = withMods({ healOnDefeat: 2 });
  it('heals the attacker when the hit defeated an enemy, capped at max HP', () => {
    const outcomes = runAttacks(plan('หนู'), [hero()], enc(rat), low, () => 15, effects);
    const r = applyDefeatHeals([hero()], outcomes, effects);
    expect(r.characters[0].hp).toBe(12);
    expect(r.changes).toHaveLength(1);
    expect(applyDefeatHeals([hero({ hp: 19 })], outcomes, effects).characters[0].hp).toBe(20);
  });

  it('heals nothing when the enemy survived, without the modifier, or for a downed attacker', () => {
    const survived = runAttacks(plan('หมาป่า'), [hero()], enc(wolf), low, () => 15, effects);
    expect(applyDefeatHeals([hero()], survived, effects).characters[0].hp).toBe(10);
    const killed = runAttacks(plan('หนู'), [hero()], enc(rat), low, () => 15);
    expect(applyDefeatHeals([hero()], killed, undefined).characters[0].hp).toBe(10);
    expect(applyDefeatHeals([hero({ status: 'downed', hp: 0 })], runAttacks(plan('หนู'), [hero()], enc(rat), low, () => 15, effects), effects).characters[0].hp).toBe(0);
  });
});
