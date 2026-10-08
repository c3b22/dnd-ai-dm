import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowserClient } from './client';
import { normalizeRestVote, type RestKind, type RestVote } from '@/lib/campaign/restVote';

// Tolerant read: a database without rest_vote / short_rests_used just means "no vote" / 0 used.
export async function fetchRestState(
  campaignId: string,
  playerId: string,
  client: SupabaseClient = supabaseBrowserClient
): Promise<{ vote: RestVote | null; shortRestsUsed: number }> {
  let vote: RestVote | null = null;
  let shortRestsUsed = 0;
  try {
    const { data, error } = await client
      .from('campaigns')
      .select('current_round_id, rest_vote')
      .eq('id', campaignId)
      .maybeSingle();
    if (!error && data) {
      const row = data as { current_round_id?: string | null; rest_vote?: unknown };
      vote = normalizeRestVote(row.rest_vote, row.current_round_id ?? null);
    }
  } catch {
    /* no vote */
  }
  try {
    if (playerId) {
      const { data, error } = await client.from('players').select('short_rests_used').eq('id', playerId).maybeSingle();
      if (!error && data) shortRestsUsed = Number((data as { short_rests_used?: unknown }).short_rests_used ?? 0) || 0;
    }
  } catch {
    /* 0 used */
  }
  return { vote, shortRestsUsed };
}

/** Fires on every campaign update (rest_vote or round changes); the caller refetches. */
export function subscribeToRestVote(
  campaignId: string,
  onChange: () => void,
  client: SupabaseClient = supabaseBrowserClient
): () => void {
  const channel = client
    .channel(`campaign_rest_vote:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      onChange
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

export async function requestRest(
  campaignId: string,
  action: 'propose' | 'agree' | 'cancel',
  kind?: RestKind,
  client: SupabaseClient = supabaseBrowserClient
): Promise<void> {
  const { data } = await client.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/rest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ action, kind }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.message === 'string' ? body.message : 'ทำรายการพักไม่สำเร็จ');
  }
}
