import { supabaseBrowserClient } from './client';
import { normalizeShop } from '@/lib/economy/shop';
import type { ShopState } from '@/lib/economy/apply';

export function subscribeToCurrentShop(
  campaignId: string,
  onShop: (shop: ShopState | null) => void
): () => void {
  const channel = supabaseBrowserClient
    .channel(`campaign_shop:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      (payload) => onShop(normalizeShop((payload.new as { current_shop?: unknown }).current_shop))
    )
    .subscribe();
  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export function subscribeToCurrentRound(
  campaignId: string,
  onRoundChange: (roundId: string | null) => void
): () => void {
  const channel = supabaseBrowserClient
    .channel(`campaigns:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      (payload) => onRoundChange((payload.new as { current_round_id: string | null }).current_round_id)
    )
    .subscribe();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export function subscribeToCurrentScene(
  campaignId: string,
  onSceneChange: (sceneId: string | null) => void
): () => void {
  const channel = supabaseBrowserClient
    .channel(`campaign_scene:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      (payload) =>
        onSceneChange((payload.new as { current_scene_id?: string | null }).current_scene_id ?? null)
    )
    .subscribe();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export function subscribeToCampaignStarted(
  campaignId: string,
  onStartedChange: (startedAt: string | null) => void
): () => void {
  const channel = supabaseBrowserClient
    .channel(`campaign_started:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      (payload) => onStartedChange((payload.new as { started_at?: string | null }).started_at ?? null)
    )
    .subscribe();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export function subscribeToRoundActionCount(
  campaignId: string,
  roundId: string,
  onCountChange: (actionCount: number, playerCount: number) => void
): () => void {
  async function refreshCounts() {
    const [{ count: actionCount }, { count: playerCount }] = await Promise.all([
      supabaseBrowserClient
        .from('round_actions')
        .select('*', { count: 'exact', head: true })
        .eq('round_id', roundId),
      supabaseBrowserClient
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'active'),
    ]);
    onCountChange(actionCount ?? 0, playerCount ?? 0);
  }

  const channel = supabaseBrowserClient
    .channel(`round_actions:${roundId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'round_actions', filter: `round_id=eq.${roundId}` },
      refreshCounts
    )
    // Realtime cannot filter DELETEs by campaign; an extra recount for another table is cheap.
    // Without it, when the last player who had not acted leaves, nobody triggers the round.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players' }, refreshCounts)
    .subscribe();

  refreshCounts();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}
