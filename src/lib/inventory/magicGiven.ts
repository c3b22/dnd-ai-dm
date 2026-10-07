import type { SupabaseClient } from '@supabase/supabase-js';

/** Item ids already handed out in this campaign, or null when the table is missing/unreadable (then [[magic]] is ignored). */
export async function loadMagicGiven(supabase: SupabaseClient, campaignId: string): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.from('campaign_magic_given').select('item_id').eq('campaign_id', campaignId);
    if (error || !data) return null;
    return (data as { item_id: string }[]).map((r) => r.item_id);
  } catch {
    return null;
  }
}

export async function persistMagicGiven(supabase: SupabaseClient, campaignId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await supabase
    .from('campaign_magic_given')
    .insert(itemIds.map((item_id) => ({ campaign_id: campaignId, item_id })));
  if (error) throw error;
}
