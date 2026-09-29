import { supabaseBrowserClient } from './client';
import { sortByTurnOrder } from '@/lib/campaign/turnOrder';

export interface RoundPlayer {
  id: string;
  displayName: string;
  acted: boolean;
}

export async function fetchRoundPlayers(
  campaignId: string,
  roundId: string | null
): Promise<RoundPlayer[]> {
  const { data: players, error } = await supabaseBrowserClient
    .from('players')
    .select('id, display_name, turn_order, created_at')
    .eq('campaign_id', campaignId);
  if (error) throw error;

  let actedIds = new Set<string>();
  if (roundId) {
    const { data: actions } = await supabaseBrowserClient
      .from('round_actions')
      .select('player_id')
      .eq('round_id', roundId);
    actedIds = new Set((actions ?? []).map((a: { player_id: string }) => a.player_id));
  }

  return sortByTurnOrder(
    (players ?? []).map((p: any) => ({
      id: p.id as string,
      displayName: p.display_name as string,
      turnOrder: p.turn_order as number | null,
      joinedAt: p.created_at as string,
    }))
  ).map((p) => ({ id: p.id, displayName: p.displayName, acted: actedIds.has(p.id) }));
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
  const response = await fetch(`/api/campaigns/${campaignId}/turn-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, orderedPlayerIds }),
  });
  if (!response.ok) throw new Error('could not save the turn order');
}
