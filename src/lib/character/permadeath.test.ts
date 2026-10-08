import { describe, it, expect } from 'vitest';
import { applyPermadeath } from './permadeath';
import { applyCharacterTags } from './applyTags';
import type { Character } from './types';

const mk = (over: Partial<Character>): Character => ({ id: 'p1', displayName: 'Aria', weaponId: null, hp: 0, maxHp: 10, status: 'downed', revivesSinceSanctuary: 0, gold: 40, ...over });
const sword = { itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon' as const, equipped: true };

describe('applyPermadeath (H3a)', () => {
  it('marks the dead character dead and turns their pack and gold into a corpse', () => {
    const r = applyPermadeath([mk({}), mk({ id: 'p2', displayName: 'Prem', hp: 9, status: 'active' })], { p1: [sword], p2: [] }, ['p1']);
    expect(r.characters[0]).toMatchObject({ id: 'p1', status: 'dead', hp: 0, gold: 0 });
    expect(r.characters[1].status).toBe('active');
    expect(r.corpses).toEqual([{ playerId: 'p1', name: 'Aria', items: [sword], gold: 40 }]);
    expect(r.inventories.p1).toEqual([]);
    expect(r.changedPlayerIds).toEqual(['p1']);
    expect(r.changes[0]).toContain('Aria');
  });

  it('does nothing when nobody died', () => {
    const chars = [mk({})];
    const r = applyPermadeath(chars, { p1: [sword] }, []);
    expect(r.characters).toEqual(chars);
    expect(r.corpses).toEqual([]);
    expect(r.changedPlayerIds).toEqual([]);
  });

  it('skips an empty corpse record but still marks the character dead', () => {
    const r = applyPermadeath([mk({ gold: 0 })], { p1: [] }, ['p1']);
    expect(r.characters[0].status).toBe('dead');
    expect(r.corpses).toEqual([{ playerId: 'p1', name: 'Aria', items: [], gold: 0 }]);
    expect(r.changedPlayerIds).toEqual([]);
  });
});

describe('dead characters in applyCharacterTags (H3a)', () => {
  const dead = mk({ status: 'dead', hp: 0 });
  const alive = mk({ id: 'p2', displayName: 'Prem', hp: 3, status: 'active' });

  it('ignores [[revive]] aimed at a dead character, without error', () => {
    const r = applyCharacterTags([dead, alive], [{ kind: 'revive', name: 'Aria' }], () => 1);
    expect(r.characters[0]).toMatchObject({ status: 'dead', hp: 0 });
    expect(r.changes).toEqual([]);
  });

  it('does not heal or hurt a dead character', () => {
    const r = applyCharacterTags([dead, alive], [{ kind: 'heal', name: 'Aria', tier: 'full' }, { kind: 'hurt', name: 'Aria', tier: 'heavy' }], () => 1);
    expect(r.characters[0]).toMatchObject({ status: 'dead', hp: 0 });
  });

  it('sanctuary still restores the living and leaves the dead alone', () => {
    const r = applyCharacterTags([dead, { ...alive, maxHp: 12, revivesSinceSanctuary: 2 }], [{ kind: 'sanctuary' }], () => 1);
    expect(r.characters[1].revivesSinceSanctuary).toBe(0);
    expect(r.characters[0]).toMatchObject({ status: 'dead', maxHp: 10 });
  });

  it('a wipe ignores the dead: the downed survivors stand back up and the dead stay dead', () => {
    const r = applyCharacterTags([dead, { ...alive, hp: 0, status: 'downed' }], [], () => 1);
    expect(r.wiped).toBe(true);
    expect(r.characters[0].status).toBe('dead');
    expect(r.characters[1].status).toBe('active');
  });

  it('a party of only dead characters is not a wipe', () => {
    const r = applyCharacterTags([dead], [], () => 1);
    expect(r.wiped).toBe(false);
    expect(r.characters[0].status).toBe('dead');
  });

  it('non-permadeath rooms behave as before: all downed is still a wipe', () => {
    const r = applyCharacterTags([mk({}), mk({ id: 'p2', displayName: 'Prem', status: 'downed' })], [], () => 1);
    expect(r.wiped).toBe(true);
  });
});
