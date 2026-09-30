import { createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_WEAPON_ID, isStartingWeapon } from '@/lib/character/constants';
import { seedStartingKit } from '@/lib/inventory/startingKit';

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

  const weaponId = isStartingWeapon(params.weaponId) ? params.weaponId : DEFAULT_WEAPON_ID;
  const { data, error } = await supabase
    .from('players')
    .insert({
      campaign_id: params.campaignId,
      user_id: params.userId,
      display_name: params.displayName,
      weapon_id: weaponId,
    })
    .select()
    .single();
  if (error) throw error;
  await seedStartingKit(supabase, { campaignId: params.campaignId, playerId: data.id, weaponId });
  return data;
}
