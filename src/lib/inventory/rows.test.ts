import { describe, it, expect } from 'vitest';
import { itemsToRows, rowsToInventories, rowsToItems } from './rows';

const rows = [
  { player_id: 'p1', item_id: 'shortsword', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
  { player_id: 'p1', item_id: 'story', custom_name: 'Rusty Key', quantity: 1, slot: null, equipped: false },
  { player_id: 'p2', item_id: 'potion_minor', custom_name: '', quantity: 2, slot: null, equipped: false },
];

describe('inventory rows', () => {
  it('maps rows to items and groups them by player', () => {
    expect(rowsToItems(rows.slice(0, 1))).toEqual([{ itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true }]);
    const grouped = rowsToInventories(rows);
    expect(Object.keys(grouped).sort()).toEqual(['p1', 'p2']);
    expect(grouped.p1).toHaveLength(2);
    expect(grouped.p2[0].quantity).toBe(2);
  });

  it('treats an unknown slot value as no slot', () => {
    expect(rowsToItems([{ ...rows[0], slot: 'hat' }])[0].slot).toBeNull();
  });

  it('maps items back to rows for saving', () => {
    expect(itemsToRows('c1', 'p1', rowsToItems(rows.slice(0, 1)))).toEqual([
      { campaign_id: 'c1', player_id: 'p1', item_id: 'shortsword', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
    ]);
  });
});

describe('rowsToItems accessory slot (F5d)', () => {
  it('reads the accessory slot and ignores unknown slots', () => {
    const row = { player_id: 'p', item_id: 'acc_acrobat', custom_name: '', quantity: 1, slot: 'accessory', equipped: true };
    expect(rowsToItems([row])[0].slot).toBe('accessory');
    expect(rowsToItems([{ ...row, slot: 'hat' }])[0].slot).toBeNull();
  });
});
