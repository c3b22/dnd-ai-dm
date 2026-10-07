import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowserClient } from './client';
import { normalizeEncounter, type Encounter } from '@/lib/combat/encounter';

// Tolerant read: a database without the current_encounter column just means "no encounter".
export async function fetchEncounter(
  campaignId: string,
  client: SupabaseClient = supabaseBrowserClient
): Promise<Encounter | null> {
  try {
    const { data, error } = await client
      .from('campaigns')
      .select('current_encounter')
      .eq('id', campaignId)
      .maybeSingle();
    if (error) return null;
    return normalizeEncounter((data as { current_encounter?: unknown } | null)?.current_encounter);
  } catch {
    return null;
  }
}

export function subscribeToEncounter(
  campaignId: string,
  onEncounter: (encounter: Encounter | null) => void,
  client: SupabaseClient = supabaseBrowserClient
): () => void {
  const channel = client
    .channel(`campaign_encounter:${campaignId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
      (payload) => onEncounter(normalizeEncounter((payload.new as { current_encounter?: unknown }).current_encounter))
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
