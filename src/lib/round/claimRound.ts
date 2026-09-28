import type { SupabaseClient } from '@supabase/supabase-js';

// Must exceed the route's maxDuration (60s) so a still-running attempt is never re-claimed.
const DEFAULT_STALE_AFTER_MS = 90_000;

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
