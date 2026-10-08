import { describe, it, expect } from 'vitest';
import { magicPool, pickMagicItem } from './magicGrant';
import { MAGIC_ITEMS } from './magicItems';

const first = () => 0;
const last = () => 0.999999;

describe('magicPool', () => {
  it('filters by rarity and type, and leaves out charms', () => {
    expect(magicPool('rare', 'potion').every((i) => i.rarity === 'rare' && i.mechanic.kind === 'consumable')).toBe(true);
    expect(magicPool('uncommon', null).some((i) => i.mechanic.kind === 'charm')).toBe(false);
    expect(magicPool('uncommon', 'weapon').length).toBeGreaterThan(0);
  });
});

describe('pickMagicItem', () => {
  it('never repeats an item until the pool is used up, then starts repeating', () => {
    const pool = magicPool('uncommon', 'scroll');
    expect(pool.length).toBeGreaterThan(1);
    const given = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      const pick = pickMagicItem('uncommon', 'scroll', given, i % 2 ? first : last);
      expect(pick.item).not.toBeNull();
      expect(given.has(pick.item!.id)).toBe(false);
      given.add(pick.item!.id);
    }
    expect(given.size).toBe(pool.length);
    const again = pickMagicItem('uncommon', 'scroll', given, first);
    expect(again.item && given.has(again.item.id)).toBe(true);
  });

  it('skips items the room already received even when rand points at them', () => {
    const pool = magicPool('rare', 'armor');
    const given = new Set([pool[0].id]);
    expect(pickMagicItem('rare', 'armor', given, first).item?.id).toBe(pool[1].id);
  });

  it('gives at most one legendary per campaign', () => {
    const one = pickMagicItem('legendary', null, new Set(), first);
    expect(one.item?.rarity).toBe('legendary');
    const another = pickMagicItem('legendary', 'weapon', new Set([one.item!.id]), first);
    expect(another).toEqual({ item: null, reason: 'legendary_limit' });
    const anyLegendary = MAGIC_ITEMS.find((i) => i.rarity === 'legendary' && i.id !== one.item!.id)!;
    expect(pickMagicItem('legendary', null, new Set([anyLegendary.id]), first).item).toBeNull();
  });

  it('returns an empty-pool result when nothing matches', () => {
    expect(pickMagicItem('mythic' as never, null, new Set(), first)).toEqual({ item: null, reason: 'empty_pool' });
  });

  it('draws deep_pack accessories from the legendary pool and still caps legendaries at one per campaign', () => {
    const pool = magicPool('legendary', 'accessory');
    expect(pool.length).toBeGreaterThanOrEqual(1);
    expect(pool.every((i) => i.effect === 'deep_pack')).toBe(true);
    const pick = pickMagicItem('legendary', 'accessory', new Set(), first);
    expect(pick.item?.effect).toBe('deep_pack');
    expect(pickMagicItem('legendary', 'accessory', new Set([pick.item!.id]), first)).toEqual({ item: null, reason: 'legendary_limit' });
    expect(pickMagicItem('legendary', null, new Set([pick.item!.id]), first)).toEqual({ item: null, reason: 'legendary_limit' });
  });
});
