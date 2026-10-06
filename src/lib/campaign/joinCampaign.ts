import { createServiceRoleClient } from '@/lib/supabase/server';
import { CLASSES, resolveClassId, startingAbilities } from '@/lib/character/classes';
import { insertPlayer } from './insertPlayer';
import { seedStartingKit } from '@/lib/inventory/startingKit';

export async function joinCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { campaignId: string; userId: string; displayName: string; classId?: string; weaponId?: string }
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

  const classId = resolveClassId(params);
  const weaponId = CLASSES[classId].weaponId;
  const { data, error } = await insertPlayer(
    supabase,
    {
      campaign_id: params.campaignId,
      user_id: params.userId,
      display_name: params.displayName,
      weapon_id: weaponId,
      class_id: classId,
    },
    startingAbilities(classId)
  );
  if (error) throw error;
  await seedStartingKit(supabase, { campaignId: params.campaignId, playerId: data.id, weaponId });
  return data;
}
