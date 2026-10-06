import { describe, expect, it } from 'vitest';
import { WEAPONS, weaponFor } from '@/lib/character/constants';
import { buyPrice } from '@/lib/economy/prices';
import { buyFromShop, normalizeShop } from '@/lib/economy/shop';
import { CATALOG, catalogEntry } from './catalog';
import { MAGIC_ITEMS } from './magicItems';

const wired = MAGIC_ITEMS.filter((i) => ['weapon', 'armor', 'consumable'].includes(i.mechanic.kind));

describe('magic items wired into catalog / prices / weapons (F5c)', () => {
  it('has items of each wired kind', () => {
    for (const k of ['weapon', 'armor', 'consumable']) expect(wired.some((i) => i.mechanic.kind === k)).toBe(true);
  });

  it('every weapon/armor/consumable magic id is in CATALOG with matching kind and PRICES', () => {
    for (const item of wired) {
      expect(CATALOG, item.id).toHaveProperty(item.id);
      expect(catalogEntry(item.id)?.kind).toBe(item.mechanic.kind);
      expect(catalogEntry(item.id)?.weight).toBe(item.weight);
      expect(buyPrice(item.id), item.id).toBe(item.price);
    }
  });

  it('every magic weapon is in WEAPONS with base dice plus damage bonus', () => {
    for (const item of wired) {
      if (item.mechanic.kind !== 'weapon') continue;
      expect(WEAPONS, item.id).toHaveProperty(item.id);
      const base = WEAPONS[item.mechanic.weaponId];
      const w = weaponFor(item.id);
      expect(w.id).toBe(item.id);
      expect(w.dice).toEqual({ ...base.dice, bonus: base.dice.bonus + item.mechanic.damageBonus });
      expect(w.nameTh).toBe(item.nameTh);
    }
  });

  it('legendary items are filtered out of shops on the server side', () => {
    const legendary = wired.find((i) => i.rarity === 'legendary')!;
    const common = wired.find((i) => i.rarity === 'uncommon')!;
    expect(normalizeShop({ name: 'ร้าน', itemIds: [legendary.id, common.id] })?.itemIds).toEqual([common.id]);
    expect(normalizeShop({ name: 'ร้าน', itemIds: [legendary.id] })).toBeNull();
    const shop = { name: 'ร้าน', itemIds: [legendary.id] };
    expect(buyFromShop([], 99999, shop, legendary.id)).toEqual({ ok: false, reason: 'not_sold' });
  });
});
