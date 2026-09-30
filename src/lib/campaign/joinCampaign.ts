import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_WEAPON_ID, isStartingWeapon } from '@/lib/character/constants';

export async function joinCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { campaignId: string; userId: string; displayName: string; weaponId?: string }
) {
  // A browser keeps one anonymous user across campaigns, so opening a friend's link twice
  // must land back on the same player instead of tripping the (campaign, user) unique key.
  const { data: existing } = await supabase
    .from('players')
    .select()
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('players')
    .insert({
      campaign_id: params.campaignId,
      user_id: params.userId,
      display_name: params.displayName,
      weapon_id: isStartingWeapon(params.weaponId) ? params.weaponId : DEFAULT_WEAPON_ID,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
