import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowserClient } from './client';
import { loadFacts } from '@/lib/memory/facts';
import type { CampaignFact } from '@/lib/memory/types';

// Tolerant read: a database without the campaign_facts table just means an empty log.
export function fetchCampaignFacts(
  campaignId: string,
  client: SupabaseClient = supabaseBrowserClient
): Promise<CampaignFact[]> {
  return loadFacts(client, campaignId);
}

// Fires on any insert/update/delete of the campaign's facts; the caller re-fetches.
export function subscribeToFacts(
  campaignId: string,
  onChange: () => void,
  client: SupabaseClient = supabaseBrowserClient
): () => void {
  const channel = client
    .channel(`campaign_facts:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'campaign_facts', filter: `campaign_id=eq.${campaignId}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
