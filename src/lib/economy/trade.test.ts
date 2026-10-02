import { describe, it, expect } from 'vitest';
import { executeTrade, normalizeTradeItems, type TradeTerms } from './trade';
import type { InventoryItem } from '@/lib/inventory/types';

const item = (over: Partial<InventoryItem> & { itemId: string }): InventoryItem => ({
  customName: '', quantity: 1, slot: null, equipped: false, ...over,
});
const t = (itemId: string, quantity = 1, customName = '') => ({ itemId, customName, quantity });
const terms = (over: Partial<TradeTerms> = {}): TradeTerms => ({ giveItems: [], giveGold: 0, wantItems: [], wantGold: 0, ...over });
const sword = item({ itemId: 'shortsword', slot: 'weapon', equipped: true });
const potion = (quantity = 1) => item({ itemId: 'potion_minor', quantity });

describe('executeTrade', () => {
  it('swaps items and gold both ways', () => {
    const result = executeTrade(
      terms({ giveItems: [t('shortsword')], giveGold: 5, wantItems: [t('potion_minor')], wantGold: 0 }),
      { items: [sword], gold: 20 },
      { items: [potion()], gold: 10 }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from.items).toEqual([expect.objectContaining({ itemId: 'potion_minor' })]);
    expect(result.to.items.map((i) => i.itemId)).toEqual(['shortsword']);
    expect(result.to.items[0].equipped).toBe(true); // empty slot on the receiving side
    expect(result.from.goldDelta).toBe(-5);
    expect(result.to.goldDelta).toBe(5);
  });

  it('treats an empty request as a gift', () => {
    const result = executeTrade(terms({ giveItems: [t('potion_minor')] }), { items: [potion()], gold: 0 }, { items: [], gold: 0 });
    expect(result.ok && result.to.items[0].itemId).toBe('potion_minor');
  });

  it('refuses an empty trade and malformed terms', () => {
    expect(executeTrade(terms(), { items: [], gold: 0 }, { items: [], gold: 0 })).toEqual({ ok: false, reason: 'empty' });
    expect(executeTrade(terms({ giveGold: -1 }), { items: [], gold: 5 }, { items: [], gold: 0 })).toEqual({ ok: false, reason: 'invalid' });
    expect(executeTrade(terms({ giveItems: [t('potion_minor', 0)] }), { items: [potion()], gold: 0 }, { items: [], gold: 0 })).toEqual({ ok: false, reason: 'invalid' });
    expect(executeTrade(terms({ giveItems: [t('lightsaber')] }), { items: [], gold: 0 }, { items: [], gold: 0 })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a gold amount too large for the database column, even if the player has it', () => {
    expect(executeTrade(terms({ giveGold: 1_000_001 }), { items: [], gold: 2_000_000 }, { items: [], gold: 0 })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses when either side lacks the items or the gold', () => {
    expect(executeTrade(terms({ giveItems: [t('potion_minor', 2)] }), { items: [potion(1)], gold: 0 }, { items: [], gold: 0 })).toEqual({ ok: false, reason: 'missing_items' });
    expect(executeTrade(terms({ wantItems: [t('shortsword')] }), { items: [], gold: 0 }, { items: [potion()], gold: 0 })).toEqual({ ok: false, reason: 'missing_items' });
    expect(executeTrade(terms({ giveGold: 10 }), { items: [], gold: 9 }, { items: [], gold: 0 })).toEqual({ ok: false, reason: 'no_gold' });
    expect(executeTrade(terms({ giveItems: [t('potion_minor')], wantGold: 7 }), { items: [potion()], gold: 0 }, { items: [], gold: 6 })).toEqual({ ok: false, reason: 'no_gold' });
  });

  it('checks weight on the final packs (remove before add), so an equal-weight swap at full capacity still works', () => {
    // Both packs sit at exactly weight 10. A naive check that adds the incoming item before
    // removing the outgoing one would see 12 and wrongly refuse; removing first keeps both at 10.
    const heavyA = [
      item({ itemId: 'armor_heavy', slot: 'armor', equipped: true }), // 3
      item({ itemId: 'shortbow', slot: 'weapon', equipped: true }), // 2
      item({ itemId: 'staff', slot: 'weapon' }), // 2
      item({ itemId: 'potion_minor', quantity: 3 }), // 3
    ]; // total 10
    const heavyB = [
      item({ itemId: 'armor_light', slot: 'armor', equipped: true }), // 1
      item({ itemId: 'shortsword', slot: 'weapon', equipped: true }), // 2
      item({ itemId: 'potion_major', quantity: 2 }), // 2
      item({ itemId: 'potion_minor', quantity: 5 }), // 5
    ]; // total 10
    const swap = executeTrade(terms({ giveItems: [t('staff')], wantItems: [t('shortsword')] }), { items: heavyA, gold: 0 }, { items: heavyB, gold: 0 });
    expect(swap.ok).toBe(true);
  });

  it('refuses when the receiving pack would exceed 10', () => {
    const full = [potion(10)];
    expect(executeTrade(terms({ giveItems: [t('shortsword')] }), { items: [sword], gold: 0 }, { items: full, gold: 0 })).toEqual({ ok: false, reason: 'full' });
  });

  it('moves story items by title', () => {
    const key = item({ itemId: 'story', customName: 'Rusty Key' });
    const result = executeTrade(terms({ giveItems: [t('story', 1, 'rusty key')] }), { items: [key], gold: 0 }, { items: [], gold: 0 });
    expect(result.ok && result.to.items[0].customName).toBe('Rusty Key');
  });

  it('does not mutate its inputs', () => {
    const fromItems = [potion(2)];
    executeTrade(terms({ giveItems: [t('potion_minor')] }), { items: fromItems, gold: 0 }, { items: [], gold: 0 });
    expect(fromItems[0].quantity).toBe(2);
  });
});

describe('normalizeTradeItems', () => {
  it('accepts well-formed entries and rejects everything else', () => {
    expect(normalizeTradeItems([{ itemId: 'staff', customName: '', quantity: 1 }])).toEqual([{ itemId: 'staff', customName: '', quantity: 1 }]);
    expect(normalizeTradeItems([{ itemId: 'staff', quantity: 2 }])).toEqual([{ itemId: 'staff', customName: '', quantity: 2 }]);
    expect(normalizeTradeItems('x')).toBeNull();
    expect(normalizeTradeItems([{ itemId: 'staff', quantity: 1.5 }])).toBeNull();
    expect(normalizeTradeItems([{ quantity: 1 }])).toBeNull();
    expect(normalizeTradeItems(Array.from({ length: 11 }, () => ({ itemId: 'staff', quantity: 1 })))).toBeNull();
  });
});
