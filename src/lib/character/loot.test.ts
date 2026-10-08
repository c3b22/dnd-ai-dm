import { describe, it, expect } from 'vitest';
import { applyLootTags, corpsePrompt, type LootableCorpse } from './loot';
import type { Character } from './types';
import type { CharacterTag } from './tags';

const mk = (over: Partial<Character>): Character => ({ id: 'p1', displayName: 'Prem', weaponId: null, hp: 10, maxHp: 10, status: 'active', revivesSinceSanctuary: 0, gold: 0, ...over });
const item = (itemId: string, quantity = 1, over: Record<string, unknown> = {}) => ({ itemId, customName: '', quantity, slot: null, equipped: false, ...over });
const corpse = (over: Partial<LootableCorpse> = {}): LootableCorpse => ({ id: 'c1', name: 'Aria', items: [item('potion_minor', 2)], gold: 35, ...over });
const loot = (c: string, p: string): CharacterTag => ({ kind: 'loot', corpse: c, name: p });

describe('corpsePrompt (H3c)', () => {
  it('is empty with no corpses', () => {
    expect(corpsePrompt([])).toEqual([]);
  });

  it('lists each corpse with items and gold and explains the loot tag', () => {
    const text = corpsePrompt([corpse(), corpse({ id: 'c2', name: 'Bo', items: [], gold: 0 })]).join('\n');
    expect(text).toContain('Aria');
    expect(text).toContain('x2');
    expect(text).toContain('gold 35');
    expect(text).toContain('Bo: nothing');
    expect(text).toContain('[[loot: CorpseName | PlayerName]]');
  });
});

describe('applyLootTags (H3c)', () => {
  it('moves items and gold to the named player and empties the corpse', () => {
    const r = applyLootTags([mk({})], { p1: [] }, [corpse()], [loot('Aria', 'Prem')]);
    expect(r.inventories.p1).toEqual([expect.objectContaining({ itemId: 'potion_minor', quantity: 2 })]);
    expect(r.goldDeltas).toEqual({ p1: 35 });
    expect(r.changedPlayerIds).toEqual(['p1']);
    expect(r.corpseUpdates).toEqual([{ id: 'c1', items: [], gold: 0, empty: true }]);
    expect(r.changes[0]).toContain('Prem');
    expect(r.changes[0]).toContain('Aria');
  });

  it('ignores an unknown corpse name or an unknown player', () => {
    const r = applyLootTags([mk({})], { p1: [] }, [corpse()], [loot('Nobody', 'Prem'), loot('Aria', 'Ghost')]);
    expect(r.inventories.p1).toEqual([]);
    expect(r.goldDeltas).toEqual({});
    expect(r.corpseUpdates).toEqual([]);
    expect(r.changes).toEqual([]);
  });

  it('ignores a dead looter', () => {
    const r = applyLootTags([mk({ status: 'dead' })], { p1: [] }, [corpse()], [loot('Aria', 'Prem')]);
    expect(r.corpseUpdates).toEqual([]);
    expect(r.goldDeltas).toEqual({});
  });

  it('ignores a corpse name that matches two corpses', () => {
    const r = applyLootTags([mk({})], { p1: [] }, [corpse(), corpse({ id: 'c2' })], [loot('Aria', 'Prem')]);
    expect(r.corpseUpdates).toEqual([]);
  });

  it('moves what fits by weight, leaves the rest on the corpse and still moves the gold', () => {
    const r = applyLootTags([mk({})], { p1: [] }, [corpse({ items: [item('potion_minor', 40)], gold: 10 })], [loot('Aria', 'Prem')]);
    const taken = r.inventories.p1.reduce((s, i) => s + i.quantity, 0);
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(40);
    expect(r.corpseUpdates).toEqual([{ id: 'c1', items: [expect.objectContaining({ itemId: 'potion_minor', quantity: 40 - taken })], gold: 0, empty: false }]);
    expect(r.goldDeltas).toEqual({ p1: 10 });
  });

  it('keeps unknown catalog ids on the corpse', () => {
    const r = applyLootTags([mk({})], { p1: [] }, [corpse({ items: [item('mystery_thing')], gold: 0 })], [loot('Aria', 'Prem')]);
    expect(r.inventories.p1).toEqual([]);
    expect(r.corpseUpdates).toEqual([]);
  });

  it('a second loot tag on an already emptied corpse does nothing', () => {
    const r = applyLootTags([mk({}), mk({ id: 'p2', displayName: 'Suki' })], { p1: [], p2: [] }, [corpse()], [loot('Aria', 'Prem'), loot('Aria', 'Suki')]);
    expect(r.inventories.p2).toEqual([]);
    expect(r.goldDeltas).toEqual({ p1: 35 });
    expect(r.corpseUpdates).toHaveLength(1);
  });

  it('moves story objects too', () => {
    const r = applyLootTags([mk({})], { p1: [] }, [corpse({ items: [item('story', 1, { customName: 'กุญแจ' })], gold: 0 })], [loot('aria', 'prem')]);
    expect(r.inventories.p1).toEqual([expect.objectContaining({ itemId: 'story', customName: 'กุญแจ' })]);
  });
});
