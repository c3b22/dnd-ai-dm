import { describe, it, expect } from 'vitest';
import {
  armorReduction, equipItem, equippedArmorId, equippedSkillBonuses, equippedWeaponId, giveItem, itemLabel,
  takeItem, unequipSlot, useConsumable, weightOf,
} from './rules';
import type { InventoryItem } from './types';

const item = (over: Partial<InventoryItem> & { itemId: string }): InventoryItem => ({
  customName: '', quantity: 1, slot: null, equipped: false, ...over,
});
const sword = item({ itemId: 'shortsword', slot: 'weapon', equipped: true });

describe('weightOf', () => {
  it('sums catalog weight times quantity and counts story items as 0', () => {
    const items = [sword, item({ itemId: 'potion_minor', quantity: 3 }), item({ itemId: 'story', customName: 'Rusty Key' })];
    expect(weightOf(items)).toBe(2 + 3);
  });
});

describe('giveItem', () => {
  it('adds a new item and stacks a repeat', () => {
    const once = giveItem([], 'potion_minor');
    expect(once).toMatchObject({ result: 'added', label: 'ยาฟื้นฟูเล็ก' });
    const twice = giveItem(once.items, 'potion_minor');
    expect(twice.items).toEqual([item({ itemId: 'potion_minor', quantity: 2 })]);
  });

  it('auto-equips a weapon or armor into an empty slot but not into a taken one', () => {
    const first = giveItem([], 'armor_light').items;
    expect(first[0]).toMatchObject({ slot: 'armor', equipped: true });
    const second = giveItem(first, 'armor_heavy').items;
    expect(second.find((i) => i.itemId === 'armor_heavy')).toMatchObject({ equipped: false });
  });

  it('refuses an item that would push weight past 10 and leaves the pack untouched', () => {
    const packed = [item({ itemId: 'potion_minor', quantity: 8 }), sword]; // weight 10
    const result = giveItem(packed, 'potion_minor');
    expect(result).toMatchObject({ result: 'full', label: 'ยาฟื้นฟูเล็ก' });
    expect(result.items).toBe(packed);
  });

  it('ignores unknown catalog ids', () => {
    expect(giveItem([], 'lightsaber').result).toBe('unknown');
  });

  it('adds story items by title, trims and shortens the title, merges case-insensitively, caps at 5 units', () => {
    const a = giveItem([], 'story', '  Rusty Key  ');
    expect(a.items[0]).toMatchObject({ itemId: 'story', customName: 'Rusty Key', slot: null });
    const b = giveItem(a.items, 'story', 'rusty key');
    expect(b.items).toHaveLength(1);
    expect(b.items[0].quantity).toBe(2);
    expect(giveItem([], 'story', 'x'.repeat(60)).items[0].customName).toHaveLength(40);
    expect(giveItem([], 'story', '   ').result).toBe('unknown');
    const five = item({ itemId: 'story', customName: 'Coin', quantity: 5 });
    expect(giveItem([five], 'story', 'Map').result).toBe('full');
  });
});

describe('takeItem', () => {
  it('removes one unit and deletes the row at zero, dropping the equipped flag with it', () => {
    const two = [item({ itemId: 'potion_minor', quantity: 2 })];
    expect(takeItem(two, 'potion_minor').items[0].quantity).toBe(1);
    const gone = takeItem([sword], 'shortsword');
    expect(gone).toMatchObject({ taken: true, label: 'ดาบสั้น', items: [] });
    expect(equippedWeaponId(gone.items)).toBeNull();
  });

  it('matches story titles ignoring case and stray spaces, and ignores a different title', () => {
    const items = [item({ itemId: 'story', customName: 'Rusty Key' })];
    expect(takeItem(items, 'story', ' rusty KEY ').taken).toBe(true);
    const other = takeItem(items, 'story', 'Golden Key');
    expect(other.taken).toBe(false);
    expect(other.items).toBe(items);
  });

  it('matches a story title even when the take tag repeats it beyond the 40-character limit it was stored at', () => {
    const longTitle = 'A'.repeat(60);
    const stored = [item({ itemId: 'story', customName: longTitle.slice(0, 40) })];
    expect(takeItem(stored, 'story', longTitle).taken).toBe(true);
  });

  it('ignores an item the player does not have', () => {
    expect(takeItem([sword], 'potion_minor').taken).toBe(false);
  });
});

describe('equipping', () => {
  const bow = item({ itemId: 'shortbow', slot: 'weapon' });

  it('equips into a slot and unequips whatever was there', () => {
    const result = equipItem([sword, bow], 'shortbow');
    expect(result.ok).toBe(true);
    expect(equippedWeaponId(result.items)).toBe('shortbow');
    expect(result.items.filter((i) => i.equipped)).toHaveLength(1);
  });

  it('refuses items without a slot or that are not owned', () => {
    expect(equipItem([item({ itemId: 'potion_minor' })], 'potion_minor').ok).toBe(false);
    expect(equipItem([sword], 'shortbow').ok).toBe(false);
  });

  it('unequips a slot', () => {
    expect(equippedWeaponId(unequipSlot([sword], 'weapon'))).toBeNull();
  });
});

describe('armor and consumables', () => {
  it('reads armor reduction from the equipped armor only', () => {
    const worn = item({ itemId: 'armor_medium', slot: 'armor', equipped: true });
    const spare = item({ itemId: 'armor_heavy', slot: 'armor' });
    expect(armorReduction([worn, spare])).toBe(2);
    expect(equippedArmorId([worn, spare])).toBe('armor_medium');
    expect(armorReduction([spare])).toBe(0);
  });

  it('consumes one potion and returns its heal dice; refuses non-consumables and missing potions', () => {
    const used = useConsumable([item({ itemId: 'potion_major', quantity: 2 })], 'potion_major');
    expect(used).toMatchObject({ heal: { count: 2, sides: 6, bonus: 0 }, label: 'ยาฟื้นฟูใหญ่' });
    expect(used!.items[0].quantity).toBe(1);
    expect(useConsumable([sword], 'shortsword')).toBeNull();
    expect(useConsumable([], 'potion_minor')).toBeNull();
  });
});

describe('itemLabel', () => {
  it('uses the Thai catalog name or the story title', () => {
    expect(itemLabel(item({ itemId: 'staff' }))).toBe('ไม้เท้า');
    expect(itemLabel(item({ itemId: 'story', customName: 'Rusty Key' }))).toBe('Rusty Key');
  });
});

describe('accessory slot (F5d)', () => {
  const ring = item({ itemId: 'acc_acrobat', slot: 'accessory', equipped: true });
  const shawl = item({ itemId: 'acc_silentshawl', slot: 'accessory' });
  const anklet = item({ itemId: 'acc_soundlessanklet', slot: 'accessory' });

  it('auto-equips a first accessory but leaves a second in the pack', () => {
    const first = giveItem([], 'acc_acrobat').items;
    expect(first[0]).toMatchObject({ slot: 'accessory', equipped: true });
    expect(giveItem(first, 'acc_silentshawl').items[1]).toMatchObject({ slot: 'accessory', equipped: false });
  });

  it('wears only 1 accessory: equipping another swaps, and weapon/armor are untouched', () => {
    const next = equipItem([sword, ring, shawl], 'acc_silentshawl').items;
    expect(next.map((i) => i.equipped)).toEqual([true, false, true]);
  });

  it('unequips the accessory slot', () => {
    expect(unequipSlot([sword, ring], 'accessory').map((i) => i.equipped)).toEqual([true, false]);
  });

  it('equippedSkillBonuses counts only worn accessories', () => {
    expect(equippedSkillBonuses([sword, ring, shawl])).toEqual({ acrobatics: 1 });
    expect(equippedSkillBonuses([sword, shawl, anklet])).toEqual({});
    expect(equippedSkillBonuses([{ ...anklet, equipped: true }])).toEqual({ stealth: 2 });
    expect(equippedSkillBonuses([])).toEqual({});
  });
});

describe('equippedItemEffects (F5j0)', () => {
  it('ignores unequipped items and items without effect data', async () => {
    const { equippedItemEffects } = await import('./rules');
    const items = [
      { itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon' as const, equipped: true },
      { itemId: 'armor_light', customName: '', quantity: 1, slot: 'armor' as const, equipped: false },
    ];
    expect(equippedItemEffects(items)).toEqual({ effects: [], setTheme: null, setSkillBonus: 0 });
  });
});
