import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_STALE_AFTER_MS = 30_000;

export async function claimRound(
  supabase: SupabaseClient,
  roundId: string,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();

  const { data, error } = await supabase
    .from('rounds')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    })
    .eq('id', roundId)
    .or(`status.eq.pending,and(status.eq.processing,processing_started_at.lt.${staleBefore})`)
    .select('id');

  if (error) throw error;
  return (data?.length ?? 0) === 1;
}
