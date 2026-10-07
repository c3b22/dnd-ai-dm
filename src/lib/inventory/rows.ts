import { SLOTS, type Slot } from './catalog';
import type { Inventories, InventoryItem } from './types';

export interface InventoryRow {
  player_id: string;
  item_id: string;
  custom_name: string;
  quantity: number;
  slot: string | null;
  equipped: boolean;
}

export function rowsToItems(rows: InventoryRow[]): InventoryItem[] {
  return rows.map((r) => ({
    itemId: r.item_id,
    customName: r.custom_name ?? '',
    quantity: r.quantity,
    slot: (SLOTS as string[]).includes(r.slot ?? '') ? (r.slot as Slot) : null,
    equipped: Boolean(r.equipped),
  }));
}

export function rowsToInventories(rows: InventoryRow[]): Inventories {
  const grouped: Inventories = {};
  for (const row of rows) (grouped[row.player_id] ??= []).push(...rowsToItems([row]));
  return grouped;
}

export function itemsToRows(campaignId: string, playerId: string, items: InventoryItem[]) {
  return items.map((i) => ({
    campaign_id: campaignId,
    player_id: playerId,
    item_id: i.itemId,
    custom_name: i.customName,
    quantity: i.quantity,
    slot: i.slot,
    equipped: i.equipped,
  }));
}
