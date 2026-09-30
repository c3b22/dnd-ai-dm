import type { Slot } from './catalog';

export interface InventoryItem {
  itemId: string;
  /** Story items only; '' for catalog items. */
  customName: string;
  quantity: number;
  slot: Slot | null;
  equipped: boolean;
}

/** One player's items, keyed by player id. */
export type Inventories = Record<string, InventoryItem[]>;
