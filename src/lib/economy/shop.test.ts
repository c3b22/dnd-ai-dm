import { describe, it, expect } from 'vitest';
import { buyFromShop, normalizeShop, sellToShop } from './shop';
import type { InventoryItem } from '@/lib/inventory/types';

const shop = { name: 'Old Mara', itemIds: ['potion_minor', 'shortsword'] };
const item = (over: Partial<InventoryItem> & { itemId: string }): InventoryItem => ({
  customName: '', quantity: 1, slot: null, equipped: false, ...over,
});

describe('buyFromShop', () => {
  it('charges the base price, adds the item, and auto-equips a weapon into an empty slot', () => {
    const result = buyFromShop([], 50, shop, 'shortsword');
    expect(result).toMatchObject({ ok: true, goldDelta: -30, label: 'ดาบสั้น' });
    expect(result.ok && result.items[0]).toMatchObject({ itemId: 'shortsword', equipped: true });
  });

  it('stacks potions', () => {
    const result = buyFromShop([item({ itemId: 'potion_minor' })], 20, shop, 'potion_minor');
    expect(result.ok && result.items[0].quantity).toBe(2);
  });

  it('refuses when closed, not stocked, too poor, or too heavy', () => {
    expect(buyFromShop([], 50, null, 'shortsword')).toEqual({ ok: false, reason: 'closed' });
    expect(buyFromShop([], 50, shop, 'armor_heavy')).toEqual({ ok: false, reason: 'not_sold' });
    expect(buyFromShop([], 29, shop, 'shortsword')).toEqual({ ok: false, reason: 'no_gold' });
    const packed = [item({ itemId: 'potion_minor', quantity: 10 })];
    expect(buyFromShop(packed, 50, shop, 'shortsword')).toEqual({ ok: false, reason: 'full' });
  });

  it('never sells a story item or an id that is not in the price table, even if a shop lists it', () => {
    const odd = { name: 'X', itemIds: ['story', 'lightsaber'] };
    expect(buyFromShop([], 99, odd, 'story')).toEqual({ ok: false, reason: 'not_sold' });
    expect(buyFromShop([], 99, odd, 'lightsaber')).toEqual({ ok: false, reason: 'not_sold' });
  });
});

describe('sellToShop', () => {
  it('pays half price and removes one unit', () => {
    const result = sellToShop([item({ itemId: 'potion_minor', quantity: 2 })], shop, 'potion_minor');
    expect(result).toMatchObject({ ok: true, goldDelta: 5, label: 'ยาฟื้นฟูเล็ก' });
    expect(result.ok && result.items[0].quantity).toBe(1);
  });

  it('accepts any priced item even if this merchant does not stock it, and frees the equipped slot', () => {
    const worn = item({ itemId: 'armor_heavy', slot: 'armor', equipped: true });
    const result = sellToShop([worn], shop, 'armor_heavy');
    expect(result).toMatchObject({ ok: true, goldDelta: 45 });
    expect(result.ok && result.items).toEqual([]);
  });

  it('refuses when closed, for story items, and for items the player lacks', () => {
    expect(sellToShop([], null, 'potion_minor')).toEqual({ ok: false, reason: 'closed' });
    const key = item({ itemId: 'story', customName: 'Rusty Key' });
    expect(sellToShop([key], shop, 'story', 'Rusty Key')).toEqual({ ok: false, reason: 'not_sellable' });
    expect(sellToShop([], shop, 'potion_minor')).toEqual({ ok: false, reason: 'not_owned' });
  });
});

describe('normalizeShop', () => {
  it('accepts a well-formed shop and drops unbuyable ids', () => {
    expect(normalizeShop({ name: 'Mara', itemIds: ['staff', 'story', 7] })).toEqual({ name: 'Mara', itemIds: ['staff'] });
  });
  it('returns null for anything else', () => {
    expect(normalizeShop(null)).toBeNull();
    expect(normalizeShop({ name: '', itemIds: ['staff'] })).toBeNull();
    expect(normalizeShop({ name: 'Mara', itemIds: [] })).toBeNull();
    expect(normalizeShop('nope')).toBeNull();
  });
});
