import { createServiceRoleClient } from '@/lib/supabase/server';

type Client = ReturnType<typeof createServiceRoleClient>;

export const SEEN_MIN_INTERVAL_MS = 60_000;

export type SeenResult =
  | { recorded: true }
  | { recorded: false; reason: 'throttled' | 'unsupported' | 'not-a-member' };

// 42703 = undefined column, 42P01 = undefined table, PGRST204/PGRST205 = PostgREST schema-cache misses.
const MISSING = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']);
const isMissing = (error: { code?: string } | null | undefined) => !!error?.code && MISSING.has(error.code);

/**
 * Stamps players.last_seen_at / last_seen_round_id for the caller. At most once per minute per player.
 * Best effort: if the S1 columns are not in the database yet, resolves `unsupported` instead of throwing.
 */
export async function recordSeen(
  supabase: Client,
  params: { campaignId: string; userId: string; now?: Date }
): Promise<SeenResult> {
  const now = params.now ?? new Date();
  const { data: player, error } = await supabase
    .from('players')
    .select('id, last_seen_at')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (isMissing(error)) return { recorded: false, reason: 'unsupported' };
  if (error) throw error;
  if (!player) return { recorded: false, reason: 'not-a-member' };

  const last = player.last_seen_at ? Date.parse(player.last_seen_at as string) : NaN;
  if (Number.isFinite(last) && now.getTime() - last < SEEN_MIN_INTERVAL_MS) {
    return { recorded: false, reason: 'throttled' };
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('current_round_id')
    .eq('id', params.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;

  const { error: updateError } = await supabase
    .from('players')
    .update({ last_seen_at: now.toISOString(), last_seen_round_id: campaign?.current_round_id ?? null })
    .eq('id', player.id);
  if (isMissing(updateError)) return { recorded: false, reason: 'unsupported' };
  if (updateError) throw updateError;
  return { recorded: true };
}
