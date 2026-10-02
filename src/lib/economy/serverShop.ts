import type { SupabaseClient } from '@supabase/supabase-js';
import { rowsToItems, type InventoryRow } from '@/lib/inventory/rows';
import { EconomyError, isGoldViolation, isInventoryConflict } from './errors';
import { buyFromShop, normalizeShop, sellToShop } from './shop';

export async function shopForUser(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; action: 'buy' | 'sell'; itemId: string; customName?: string }
): Promise<{ line: string }> {
  const { data: player } = await supabase
    .from('players')
    .select('id, display_name, gold')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (!player) throw new EconomyError('forbidden', 403);

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('current_shop')
    .eq('id', params.campaignId)
    .maybeSingle();
  const shop = normalizeShop(campaign?.current_shop);

  const { data: rows, error: rowsError } = await supabase
    .from('inventory_items')
    .select('player_id, item_id, custom_name, quantity, slot, equipped')
    .eq('player_id', player.id);
  if (rowsError) throw rowsError;
  const items = rowsToItems((rows ?? []) as InventoryRow[]);

  const result =
    params.action === 'buy'
      ? buyFromShop(items, Number(player.gold ?? 0), shop, params.itemId)
      : sellToShop(items, shop, params.itemId, params.customName ?? '');
  if (!result.ok) throw new EconomyError(result.reason, 409);

  const { error } = await supabase.rpc('apply_changes', {
    // baseItems is the pack as read above: apply_changes refuses the write if it no longer
    // matches, instead of silently overwriting a concurrent change (another buy/sell/trade/round).
    changes: [{ playerId: player.id, goldDelta: result.goldDelta, items: result.items, baseItems: items }],
  });
  if (error) {
    if (isGoldViolation(error)) throw new EconomyError('no_gold', 409);
    if (isInventoryConflict(error)) throw new EconomyError('conflict', 409);
    throw error;
  }

  const amount = Math.abs(result.goldDelta);
  const line =
    params.action === 'buy'
      ? `${player.display_name} ซื้อ ${result.label} (−${amount} ทอง)`
      : `${player.display_name} ขาย ${result.label} (+${amount} ทอง)`;
  await postLogLine(supabase, params.campaignId, [line]);
  return { line };
}

/** The game log line is a courtesy: a failure here must not undo a completed transaction. */
export async function postLogLine(supabase: SupabaseClient, campaignId: string, changes: string[]): Promise<void> {
  try {
    await supabase.from('messages').insert({
      campaign_id: campaignId,
      round_id: null,
      role: 'system',
      content: JSON.stringify({ type: 'stats', changes }),
    });
  } catch {
    /* best-effort */
  }
}
