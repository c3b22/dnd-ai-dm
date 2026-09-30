import type { SupabaseClient } from '@supabase/supabase-js';
import { equipItem, unequipSlot } from './rules';
import { rowsToItems, type InventoryRow } from './rows';
import type { InventoryItem } from './types';

export class EquipError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 = 400
  ) {
    super(message);
  }
}

export async function equipForUser(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; itemId: string; action: 'equip' | 'unequip' }
): Promise<InventoryItem[]> {
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (!player) throw new EquipError('not a player in this campaign', 403);

  const { data: rows, error } = await supabase
    .from('inventory_items')
    .select('player_id, item_id, custom_name, quantity, slot, equipped')
    .eq('player_id', player.id);
  if (error) throw error;

  const before = rowsToItems((rows ?? []) as InventoryRow[]);
  let after: InventoryItem[];
  if (params.action === 'equip') {
    const result = equipItem(before, params.itemId);
    if (!result.ok) throw new EquipError('cannot equip that item');
    after = result.items;
  } else {
    const worn = before.find((i) => i.itemId === params.itemId && i.equipped && i.slot);
    if (!worn?.slot) throw new EquipError('that item is not equipped');
    after = unequipSlot(before, worn.slot);
  }

  const flips = after.filter((a) =>
    before.some((b) => b.itemId === a.itemId && b.customName === a.customName && b.equipped !== a.equipped)
  );
  // Unequip first: the one-equipped-per-slot index rejects two equipped rows at once.
  for (const flip of [...flips.filter((f) => !f.equipped), ...flips.filter((f) => f.equipped)]) {
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ equipped: flip.equipped })
      .eq('player_id', player.id)
      .eq('item_id', flip.itemId)
      .eq('custom_name', flip.customName);
    if (updateError) throw updateError;
  }
  return after;
}
