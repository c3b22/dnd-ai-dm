import { giveItem, takeItem } from '@/lib/inventory/rules';
import type { InventoryItem } from '@/lib/inventory/types';
import type { ShopState } from './apply';
import { buyPrice, sellPrice } from './prices';

export type ShopFailure = 'closed' | 'not_sold' | 'no_gold' | 'full' | 'not_sellable' | 'not_owned';
export type ShopResult =
  | { ok: true; items: InventoryItem[]; goldDelta: number; label: string }
  | { ok: false; reason: ShopFailure };

export function buyFromShop(
  items: InventoryItem[],
  gold: number,
  shop: ShopState | null,
  itemId: string
): ShopResult {
  if (!shop) return { ok: false, reason: 'closed' };
  const price = buyPrice(itemId);
  if (price === null || !shop.itemIds.includes(itemId)) return { ok: false, reason: 'not_sold' };
  if (gold < price) return { ok: false, reason: 'no_gold' };
  const given = giveItem(items, itemId);
  if (given.result === 'full') return { ok: false, reason: 'full' };
  if (given.result === 'unknown') return { ok: false, reason: 'not_sold' };
  return { ok: true, items: given.items, goldDelta: -price, label: given.label };
}

export function sellToShop(
  items: InventoryItem[],
  shop: ShopState | null,
  itemId: string,
  customName = ''
): ShopResult {
  if (!shop) return { ok: false, reason: 'closed' };
  const price = sellPrice(itemId);
  if (price === null) return { ok: false, reason: 'not_sellable' };
  const taken = takeItem(items, itemId, customName);
  if (!taken.taken) return { ok: false, reason: 'not_owned' };
  return { ok: true, items: taken.items, goldDelta: price, label: taken.label };
}

/** The stored `campaigns.current_shop` jsonb, validated; anything unexpected means no shop. */
export function normalizeShop(raw: unknown): ShopState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { name, itemIds } = raw as { name?: unknown; itemIds?: unknown };
  if (typeof name !== 'string' || !name.trim() || !Array.isArray(itemIds)) return null;
  const ids = itemIds.filter((id): id is string => typeof id === 'string' && buyPrice(id) !== null);
  return ids.length > 0 ? { name: name.trim(), itemIds: ids } : null;
}
