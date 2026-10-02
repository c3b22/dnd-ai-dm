import type { SupabaseClient } from '@supabase/supabase-js';
import { rowsToItems, type InventoryRow } from '@/lib/inventory/rows';
import { itemLabel } from '@/lib/inventory/rules';
import type { InventoryItem } from '@/lib/inventory/types';
import { EconomyError, isGoldViolation, isInventoryConflict } from './errors';
import { postLogLine } from './serverShop';
import { MAX_TRADE_GOLD, TRADE_TTL_MS, executeTrade, normalizeTradeItems, type TradeItem, type TradeTerms } from './trade';

export const MAX_PENDING_PER_PLAYER = 3;
export { TRADE_TTL_MS };

type Params = { campaignId: string; userId: string } & (
  | { action: 'propose'; toPlayerId: string; terms: TradeTerms }
  | { action: 'accept' | 'decline' | 'cancel'; tradeId: string }
);

interface PlayerRow {
  id: string;
  display_name: string;
  gold: number;
}

async function loadPack(supabase: SupabaseClient, playerId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('player_id, item_id, custom_name, quantity, slot, equipped')
    .eq('player_id', playerId);
  if (error) throw error;
  return rowsToItems((data ?? []) as InventoryRow[]);
}

async function loadPlayer(supabase: SupabaseClient, campaignId: string, playerId: string): Promise<PlayerRow | null> {
  const { data } = await supabase
    .from('players')
    .select('id, display_name, gold')
    .eq('campaign_id', campaignId)
    .eq('id', playerId)
    .maybeSingle();
  return (data as PlayerRow | null) ?? null;
}

const describeSide = (items: TradeItem[], gold: number): string => {
  const parts = [
    ...items.map((i) => `${itemLabel(i)}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`),
    ...(gold > 0 ? [`${gold} ทอง`] : []),
  ];
  return parts.length ? parts.join(', ') : 'ไม่มีอะไร';
};

export async function tradeForUser(
  supabase: SupabaseClient,
  params: Params
): Promise<{ tradeId?: string; line?: string }> {
  const { data: me } = await supabase
    .from('players')
    .select('id, display_name, gold')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (!me) throw new EconomyError('forbidden', 403);
  const caller = me as PlayerRow;

  if (params.action === 'propose') {
    if (params.toPlayerId === caller.id) throw new EconomyError('self', 400);
    const other = await loadPlayer(supabase, params.campaignId, params.toPlayerId);
    if (!other) throw new EconomyError('not_found', 400);
    const giveItems = normalizeTradeItems(params.terms.giveItems);
    const wantItems = normalizeTradeItems(params.terms.wantItems);
    if (!giveItems || !wantItems) throw new EconomyError('invalid', 400);
    const terms: TradeTerms = { giveItems, wantItems, giveGold: params.terms.giveGold, wantGold: params.terms.wantGold };

    // Checked unconditionally, before any branch that only validates giveGold: an oversized
    // wantGold with nothing given would otherwise reach the insert and overflow the int column.
    if (![terms.giveGold, terms.wantGold].every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_TRADE_GOLD)) {
      throw new EconomyError('invalid', 400);
    }
    if (terms.giveItems.length > 0 || terms.giveGold > 0) {
      // The proposer must be able to deliver what they give; the recipient is only checked on accept.
      const check = executeTrade(
        { ...terms, wantItems: [], wantGold: 0 },
        { items: await loadPack(supabase, caller.id), gold: Number(caller.gold) },
        { items: [], gold: 0 }
      );
      if (!check.ok && check.reason !== 'full') throw new EconomyError(check.reason, 400);
    } else if (terms.wantItems.length === 0 && terms.wantGold === 0) {
      throw new EconomyError('empty', 400);
    }

    const { count } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('from_player_id', caller.id)
      .eq('status', 'pending')
      // An expired proposal can no longer be accepted; it should not sit in the way of new ones.
      .gt('created_at', new Date(Date.now() - TRADE_TTL_MS).toISOString());
    if ((count ?? 0) >= MAX_PENDING_PER_PLAYER) throw new EconomyError('too_many', 409);

    const { data: created, error } = await supabase
      .from('trades')
      .insert({
        campaign_id: params.campaignId,
        from_player_id: caller.id,
        to_player_id: other.id,
        give_items: terms.giveItems,
        give_gold: terms.giveGold,
        want_items: terms.wantItems,
        want_gold: terms.wantGold,
      })
      .select('id')
      .single();
    if (error) throw error;
    return { tradeId: created.id as string };
  }

  const { data: row } = await supabase
    .from('trades')
    .select('*')
    .eq('id', params.tradeId)
    .eq('campaign_id', params.campaignId)
    .maybeSingle();
  if (!row) throw new EconomyError('not_found', 400);
  if (row.status !== 'pending') throw new EconomyError('not_pending', 409);

  if (params.action === 'cancel' || params.action === 'decline') {
    const allowed = params.action === 'cancel' ? row.from_player_id : row.to_player_id;
    if (caller.id !== allowed) throw new EconomyError('forbidden', 403);
    const { data: affected, error } = await supabase
      .from('trades')
      .update({ status: params.action === 'cancel' ? 'cancelled' : 'declined', resolved_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id');
    if (error) throw error;
    // The status=pending condition above means zero rows matched: someone else (an accept)
    // changed it between our read and this write. Report that instead of a false success.
    if ((affected ?? []).length === 0) throw new EconomyError('not_pending', 409);
    return {};
  }

  // accept
  if (caller.id !== row.to_player_id) throw new EconomyError('forbidden', 403);
  if (Date.now() - new Date(row.created_at).getTime() > TRADE_TTL_MS) throw new EconomyError('expired', 409);

  const proposer = await loadPlayer(supabase, params.campaignId, row.from_player_id);
  if (!proposer) throw new EconomyError('not_found', 400);
  const terms: TradeTerms = {
    giveItems: row.give_items, giveGold: row.give_gold, wantItems: row.want_items, wantGold: row.want_gold,
  };
  const proposerPack = await loadPack(supabase, proposer.id);
  const callerPack = await loadPack(supabase, caller.id);
  const result = executeTrade(
    terms,
    { items: proposerPack, gold: Number(proposer.gold) },
    { items: callerPack, gold: Number(caller.gold) }
  );
  if (!result.ok) throw new EconomyError(result.reason, 409);

  const { error } = await supabase.rpc('apply_changes', {
    changes: [
      // baseItems is each side's pack as just read: apply_changes refuses the write if either
      // has changed since (a concurrent shop purchase, another trade, or a round), instead of
      // silently overwriting it and duplicating or losing items.
      { playerId: proposer.id, goldDelta: result.from.goldDelta, items: result.from.items, baseItems: proposerPack },
      { playerId: caller.id, goldDelta: result.to.goldDelta, items: result.to.items, baseItems: callerPack },
    ],
    trade_id: row.id,
  });
  if (error) {
    if (isGoldViolation(error)) throw new EconomyError('no_gold', 409);
    if (isInventoryConflict(error)) throw new EconomyError('conflict', 409);
    if (/not pending/i.test(error.message ?? '')) throw new EconomyError('not_pending', 409);
    throw error;
  }

  const line = `${proposer.display_name} แลกกับ ${caller.display_name}: ให้ ${describeSide(terms.giveItems, terms.giveGold)} ได้ ${describeSide(terms.wantItems, terms.wantGold)}`;
  await postLogLine(supabase, params.campaignId, [line]);
  return { tradeId: row.id as string, line };
}
