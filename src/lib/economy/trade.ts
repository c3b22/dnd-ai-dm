import { STORY_ITEM_ID, catalogEntry } from '@/lib/inventory/catalog';
import { giveItem, takeItem } from '@/lib/inventory/rules';
import type { InventoryItem } from '@/lib/inventory/types';

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface TradeItem {
  itemId: string;
  customName: string;
  quantity: number;
}

export interface TradeTerms {
  giveItems: TradeItem[];
  giveGold: number;
  wantItems: TradeItem[];
  wantGold: number;
}

export type TradeFailure = 'invalid' | 'empty' | 'missing_items' | 'no_gold' | 'full';
export type TradeResult =
  | { ok: true; from: { items: InventoryItem[]; goldDelta: number }; to: { items: InventoryItem[]; goldDelta: number } }
  | { ok: false; reason: TradeFailure };

/** How long a proposal stays acceptable before it is treated as expired. Shared with the client
 * so it can stop offering Accept on a proposal that the server would refuse anyway. */
export const TRADE_TTL_MS = 30 * 60 * 1000;

const MAX_TRADE_ITEM_ROWS = 10;
// Comfortably below Postgres' int range; the game's economy never approaches this, so it only
// exists to keep a malformed or malicious amount from overflowing the trades.give_gold column.
export const MAX_TRADE_GOLD = 1_000_000;
const validGold = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_TRADE_GOLD;

export function normalizeTradeItems(raw: unknown): TradeItem[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_TRADE_ITEM_ROWS) return null;
  const out: TradeItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { itemId, customName, quantity } = entry as Record<string, unknown>;
    if (typeof itemId !== 'string' || !itemId) return null;
    if (itemId !== STORY_ITEM_ID && catalogEntry(itemId) === null) return null;
    if (customName !== undefined && typeof customName !== 'string') return null;
    if (!Number.isInteger(quantity) || (quantity as number) < 1) return null;
    out.push({ itemId, customName: (customName as string | undefined) ?? '', quantity: quantity as number });
  }
  return out;
}

/** A story item's real stored title (the trade terms may spell it differently). Catalog items have none. */
function resolveTitle(items: InventoryItem[], w: TradeItem): string {
  if (w.itemId !== STORY_ITEM_ID) return '';
  return items.find((i) => i.itemId === STORY_ITEM_ID && sameTitle(i.customName, w.customName))?.customName ?? w.customName;
}

function removeAll(
  items: InventoryItem[],
  wanted: TradeItem[]
): { items: InventoryItem[]; resolved: TradeItem[] } | null {
  let next = items;
  const resolved: TradeItem[] = [];
  for (const w of wanted) {
    const customName = resolveTitle(next, w);
    for (let i = 0; i < w.quantity; i++) {
      const taken = takeItem(next, w.itemId, customName);
      if (!taken.taken) return null;
      next = taken.items;
    }
    resolved.push({ itemId: w.itemId, customName, quantity: w.quantity });
  }
  return { items: next, resolved };
}

function addAll(items: InventoryItem[], incoming: TradeItem[]): { items: InventoryItem[]; result: 'ok' | 'full' | 'invalid' } {
  let next = items;
  for (const w of incoming) {
    for (let i = 0; i < w.quantity; i++) {
      const given = giveItem(next, w.itemId, w.customName);
      if (given.result === 'full') return { items, result: 'full' };
      if (given.result === 'unknown') return { items, result: 'invalid' };
      next = given.items;
    }
  }
  return { items: next, result: 'ok' };
}

export function executeTrade(
  terms: TradeTerms,
  from: { items: InventoryItem[]; gold: number },
  to: { items: InventoryItem[]; gold: number }
): TradeResult {
  if (!validGold(terms.giveGold) || !validGold(terms.wantGold)) return { ok: false, reason: 'invalid' };
  if (normalizeTradeItems(terms.giveItems) === null || normalizeTradeItems(terms.wantItems) === null) {
    return { ok: false, reason: 'invalid' };
  }
  if (terms.giveItems.length + terms.wantItems.length === 0 && terms.giveGold === 0 && terms.wantGold === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (from.gold < terms.giveGold || to.gold < terms.wantGold) return { ok: false, reason: 'no_gold' };

  // Remove first on both sides, then add: a swap can free the room the other side needs, and it
  // lets each side's items carry over their real stored name rather than what the proposal typed.
  const fromRemoved = removeAll(from.items, terms.giveItems);
  const toRemoved = removeAll(to.items, terms.wantItems);
  if (!fromRemoved || !toRemoved) return { ok: false, reason: 'missing_items' };

  const toFinal = addAll(toRemoved.items, fromRemoved.resolved);
  const fromFinal = addAll(fromRemoved.items, toRemoved.resolved);
  if (toFinal.result === 'invalid' || fromFinal.result === 'invalid') return { ok: false, reason: 'invalid' };
  if (toFinal.result === 'full' || fromFinal.result === 'full') return { ok: false, reason: 'full' };

  return {
    ok: true,
    from: { items: fromFinal.items, goldDelta: terms.wantGold - terms.giveGold },
    to: { items: toFinal.items, goldDelta: terms.giveGold - terms.wantGold },
  };
}
