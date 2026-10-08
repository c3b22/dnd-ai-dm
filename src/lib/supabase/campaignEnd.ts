import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowserClient } from './client';
import { normalizeStats, type CampaignStats } from '@/lib/campaign/stats';
import { EPILOGUE_MARKER } from '@/lib/campaign/epilogue';

export interface CampaignEndState {
  ended: boolean;
  stats: CampaignStats | null;
}

/**
 * L4: whether the room has ended, plus its stats. Tolerant: a database without campaigns.status / campaigns.stats
 * (migrations not applied) or any read failure counts as "not ended" / no stats.
 */
export async function fetchCampaignEnd(
  campaignId: string,
  client: SupabaseClient = supabaseBrowserClient
): Promise<CampaignEndState> {
  let ended = false;
  let stats: CampaignStats | null = null;
  try {
    const { data, error } = await client.from('campaigns').select('status').eq('id', campaignId).maybeSingle();
    if (!error) ended = (data as { status?: unknown } | null)?.status === 'ended';
  } catch {
    /* unreadable means not ended */
  }
  if (!ended) return { ended, stats };
  try {
    const { data, error } = await client.from('campaigns').select('stats').eq('id', campaignId).maybeSingle();
    if (!error && data && (data as { stats?: unknown }).stats != null) {
      stats = normalizeStats((data as { stats?: unknown }).stats);
    }
  } catch {
    /* no stats to show */
  }
  return { ended, stats };
}

/** The epilogue DM message text (L3), or null when it has not been written (yet). */
export async function fetchEpilogue(
  campaignId: string,
  client: SupabaseClient = supabaseBrowserClient
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('messages')
      .select('content')
      .eq('campaign_id', campaignId)
      .eq('role', 'dm')
      .like('content', `${EPILOGUE_MARKER}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return null;
    const content = (data as { content?: unknown }[] | null)?.[0]?.content;
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

// Fires when the campaign row changes (status flips to ended) or a message arrives (the epilogue); the caller re-fetches.
export function subscribeToCampaignEnd(
  campaignId: string,
  onChange: () => void,
  client: SupabaseClient = supabaseBrowserClient
): () => void {
  const channel = client
    .channel(`campaign_end:${campaignId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` }, () => onChange())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `campaign_id=eq.${campaignId}` }, () => onChange())
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
