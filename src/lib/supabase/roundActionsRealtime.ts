import { supabaseBrowserClient } from './client';

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
        .eq('campaign_id', campaignId),
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
    .subscribe();

  refreshCounts();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}
