import { describe, it, expect } from 'vitest';
import { applyCharacterTags } from './applyTags';
import type { Character } from './types';

const four = () => 4; // light 1d4 = 4, medium 1d6+1 = 5, heavy 2d6 = 8

function char(over: Partial<Character> = {}): Character {
  return { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, ...over };
}
const byName = (result: { characters: Character[] }, name: string) =>
  result.characters.find((c) => c.displayName === name)!;

describe('applyCharacterTags', () => {
  it('hurts by the rolled tier, reports it, and does not mutate the input', () => {
    const input = [char()];
    const result = applyCharacterTags(input, [{ kind: 'hurt', name: 'prem', tier: 'medium' }], four);
    expect(byName(result, 'Prem').hp).toBe(15);
    expect(result.changes).toEqual(['Prem −5 HP']);
    expect(input[0].hp).toBe(20);
  });

  it('matches a name that was saved with stray spaces (phone keyboards add them)', () => {
    const party = [char({ displayName: 'Prem ' })];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'light' }], four);
    expect(result.characters[0].hp).toBe(16);
  });

  it('downs a player who reaches 0 and never goes below 0', () => {
    const party = [char({ hp: 5 }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ hp: 0, status: 'downed' });
    expect(result.changes).toEqual(['Prem −8 HP', 'Prem ล้มลง']);
  });

  it('ignores hurt and heal on a downed player', () => {
    const party = [char({ hp: 0, status: 'downed' }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(
      party,
      [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }, { kind: 'heal', name: 'Prem', tier: 'heavy' }],
      four
    );
    expect(byName(result, 'Prem')).toMatchObject({ hp: 0, status: 'downed' });
    expect(result.changes).toEqual([]);
  });

  it('heals up to max HP and reports only what was actually gained', () => {
    const result = applyCharacterTags([char({ hp: 18 })], [{ kind: 'heal', name: 'Prem', tier: 'heavy' }], four);
    expect(byName(result, 'Prem').hp).toBe(20);
    expect(result.changes).toEqual(['Prem +2 HP']);
  });

  it('a full heal restores straight to max HP with no roll involved', () => {
    const result = applyCharacterTags([char({ hp: 7 })], [{ kind: 'heal', name: 'Prem', tier: 'full' }], () => {
      throw new Error('full heal must not roll dice');
    });
    expect(byName(result, 'Prem').hp).toBe(20);
    expect(result.changes).toEqual(['Prem +13 HP (รักษาจนเต็ม)']);
  });

  it('a full heal at full HP does nothing', () => {
    const result = applyCharacterTags([char({ hp: 20 })], [{ kind: 'heal', name: 'Prem', tier: 'full' }], four);
    expect(byName(result, 'Prem').hp).toBe(20);
    expect(result.changes).toEqual([]);
  });

  it('revives a downed player at 5 HP and escalates the max HP cost: −2, −4, −6', () => {
    const party = [char({ hp: 0, status: 'downed' }), char({ id: 'p2', displayName: 'Suki' })];
    const first = applyCharacterTags(party, [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(first, 'Prem')).toMatchObject({ hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 });
    expect(first.changes).toEqual(['Prem ฟื้นขึ้นมา (max HP −2)']);

    const downedAgain = first.characters.map((c) => (c.displayName === 'Prem' ? { ...c, hp: 0, status: 'downed' as const } : c));
    const second = applyCharacterTags(downedAgain, [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(second, 'Prem')).toMatchObject({ hp: 5, maxHp: 14, revivesSinceSanctuary: 2 });
  });

  it('never lets max HP fall below 10', () => {
    const party = [char({ hp: 0, status: 'downed', maxHp: 11, revivesSinceSanctuary: 2 }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(party, [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 10, hp: 5 });
  });

  it('ignores revive on a player who is standing', () => {
    const result = applyCharacterTags([char()], [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 20, revivesSinceSanctuary: 0 });
    expect(result.changes).toEqual([]);
  });

  it('sanctuary restores max HP and the revive counter for everyone but does not revive the downed', () => {
    const party = [
      char({ maxHp: 14, hp: 9, revivesSinceSanctuary: 2 }),
      char({ id: 'p2', displayName: 'Suki', maxHp: 18, hp: 0, status: 'downed', revivesSinceSanctuary: 1 }),
    ];
    const result = applyCharacterTags(party, [{ kind: 'sanctuary' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 20, revivesSinceSanctuary: 0, hp: 9 });
    expect(byName(result, 'Suki')).toMatchObject({ maxHp: 20, revivesSinceSanctuary: 0, status: 'downed', hp: 0 });
  });

  it('ignores unknown names and ambiguous names (two players with the same name)', () => {
    const party = [char({ id: 'p1' }), char({ id: 'p2' })];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }, { kind: 'hurt', name: 'Nobody', tier: 'heavy' }], four);
    expect(result.characters.map((c) => c.hp)).toEqual([20, 20]);
    expect(result.changes).toEqual([]);
  });

  it('does not wipe while anyone is still standing', () => {
    const party = [char({ hp: 5 }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }], four);
    expect(result.wiped).toBe(false);
    expect(byName(result, 'Prem').status).toBe('downed');
  });

  it('wipes when everyone is downed: half of the reduced max HP, cost 2n+2 counted per player', () => {
    const party = [
      char({ hp: 5 }),
      char({ id: 'p2', displayName: 'Suki', hp: 0, status: 'downed', revivesSinceSanctuary: 1, maxHp: 18 }),
    ];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }], four);
    expect(result.wiped).toBe(true);
    // Prem: counter 0→1, cost 4 → max 16, hp 8. Suki: counter 1→2, cost 6 → max 12, hp 6.
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 16, hp: 8, status: 'active', revivesSinceSanctuary: 1 });
    expect(byName(result, 'Suki')).toMatchObject({ maxHp: 12, hp: 6, status: 'active', revivesSinceSanctuary: 2 });
    expect(result.changes[result.changes.length - 1]).toContain('ล้มทั้งกลุ่ม');
  });

  it('lets armor absorb damage and says how much', () => {
    const result = applyCharacterTags([char({ armorReduction: 2 })], [{ kind: 'hurt', name: 'Prem', tier: 'medium' }], four);
    expect(byName(result, 'Prem').hp).toBe(17); // medium = 5, armor 2 -> 3
    expect(result.changes).toEqual(['Prem −3 HP (เกราะกัน 2)']);
  });

  it('never lets armor cut a hit below 1', () => {
    const one = () => 1;
    const result = applyCharacterTags([char({ armorReduction: 3 })], [{ kind: 'hurt', name: 'Prem', tier: 'light' }], one);
    expect(byName(result, 'Prem').hp).toBe(19);
    expect(result.changes).toEqual(['Prem −1 HP']);
  });

  it('never wipes an empty party', () => {
    expect(applyCharacterTags([], [], four)).toEqual({ characters: [], changes: [], wiped: false });
  });
});
