import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogEntry, slotOf } from './catalog';
import { itemsToRows } from './rows';
import type { InventoryItem } from './types';

/** Server-side only (service role): players never write their own inventory. */
export async function seedStartingKit(
  supabase: SupabaseClient,
  params: { campaignId: string; playerId: string; weaponId: string }
): Promise<void> {
  const weapon = catalogEntry(params.weaponId);
  const items: InventoryItem[] = [
    { itemId: params.weaponId, customName: '', quantity: 1, slot: weapon ? slotOf(weapon) : 'weapon', equipped: true },
    { itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false },
  ];
  const { error } = await supabase.from('inventory_items').insert(itemsToRows(params.campaignId, params.playerId, items));
  if (error) throw error;
}
