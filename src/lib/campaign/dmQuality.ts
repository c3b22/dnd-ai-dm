import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSettings, type DmQuality } from './settings';

/** The room's "คุณภาพ DM" setting. Best effort: an unreadable row gives the default, never an error. */
export async function loadDmQuality(supabase: SupabaseClient, campaignId: string): Promise<DmQuality> {
  try {
    const { data } = await supabase.from('campaigns').select('settings').eq('id', campaignId).maybeSingle();
    return normalizeSettings((data as { settings?: unknown } | null)?.settings).dmQuality;
  } catch {
    return normalizeSettings(undefined).dmQuality;
  }
}
