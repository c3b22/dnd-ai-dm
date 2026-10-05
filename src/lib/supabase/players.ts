import { supabaseBrowserClient } from './client';
import { findOwnerId, sortByTurnOrder } from '@/lib/campaign/turnOrder';
import { effectiveMaxHp } from '@/lib/character/leveling';
import { fetchCampaignInventories } from './inventory';
import type { Inventories, InventoryItem } from '@/lib/inventory/types';

export interface RoundPlayer {
  id: string;
  displayName: string;
  acted: boolean;
  /** The player who sat down first may arrange everyone. */
  isOwner: boolean;
  hp: number;
  maxHp: number;
  /** Experience points; level is derived from this. */
  xp?: number;
  items: InventoryItem[];
  status: 'active' | 'downed';
  gold: number;
}

export async function fetchRoundPlayers(
  campaignId: string,
  roundId: string | null
): Promise<RoundPlayer[]> {
  const { data: players, error } = await supabaseBrowserClient
    .from('players')
    .select('id, display_name, turn_order, created_at, hp, max_hp, status, gold, xp')
    .eq('campaign_id', campaignId);
  if (error) throw error;

  // A database without the inventory table (migration not applied yet) plays with empty packs.
  const inventories = await fetchCampaignInventories(campaignId).catch(() => ({}) as Inventories);

  let actedIds = new Set<string>();
  if (roundId) {
    const { data: actions } = await supabaseBrowserClient
      .from('round_actions')
      .select('player_id')
      .eq('round_id', roundId);
    actedIds = new Set((actions ?? []).map((a: { player_id: string }) => a.player_id));
  }

  const rows = (players ?? []).map((p: any) => ({
    id: p.id as string,
    displayName: p.display_name as string,
    turnOrder: p.turn_order as number | null,
    joinedAt: p.created_at as string,
    items: inventories[p.id] ?? [],
    hp: p.hp as number,
    maxHp: effectiveMaxHp(p.max_hp as number, Number(p.xp ?? 0)),
    xp: Number(p.xp ?? 0),
    status: p.status as 'active' | 'downed',
    gold: Number(p.gold ?? 0),
  }));
  const ownerId = findOwnerId(rows);
  return sortByTurnOrder(rows).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    acted: actedIds.has(p.id),
    isOwner: p.id === ownerId,
    hp: p.hp,
    maxHp: p.maxHp,
    xp: p.xp,
    items: p.items,
    status: p.status,
    gold: p.gold,
  }));
}

export function subscribeToPlayers(campaignId: string, onChange: () => void): () => void {
  const channel = supabaseBrowserClient
    .channel(`players:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `campaign_id=eq.${campaignId}` },
      onChange
    )
    .subscribe();
  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export async function saveTurnOrder(
  campaignId: string,
  playerId: string,
  orderedPlayerIds: string[]
): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/turn-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ playerId, orderedPlayerIds }),
  });
  if (!response.ok) throw new Error('could not save the turn order');
}
