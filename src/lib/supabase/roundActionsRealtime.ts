import { supabaseBrowserClient } from './client';

export function subscribeToRoundActionCount(
  roundId: string,
  onCountChange: (count: number) => void
): () => void {
  async function refreshCount() {
    const { count } = await supabaseBrowserClient
      .from('round_actions')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', roundId);
    onCountChange(count ?? 0);
  }

  const channel = supabaseBrowserClient
    .channel(`round_actions:${roundId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'round_actions',
        filter: `round_id=eq.${roundId}`,
      },
      refreshCount
    )
    .subscribe();

  refreshCount();

  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export async function getActivePlayerCount(campaignId: string): Promise<number> {
  const { count } = await supabaseBrowserClient
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);
  return count ?? 0;
}
