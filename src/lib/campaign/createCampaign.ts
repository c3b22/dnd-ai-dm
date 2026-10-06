import { openingSceneIdAsync } from '@/lib/scenes/scenes';
import { generateJoinCode } from './joinCode';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CLASSES, resolveClassId } from '@/lib/character/classes';
import { seedStartingKit } from '@/lib/inventory/startingKit';

export async function createCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { name: string; userId: string; displayName: string; adventureId?: string | null; classId?: string; weaponId?: string }
) {
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({ name: params.name, adventure_id: params.adventureId ?? null, join_code: generateJoinCode() })
    .select()
    .single();
  if (campaignError) throw campaignError;

  const classId = resolveClassId(params);
  const weaponId = CLASSES[classId].weaponId;
  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaign.id,
      user_id: params.userId,
      display_name: params.displayName,
      weapon_id: weaponId,
      class_id: classId,
    })
    .select()
    .single();
  if (playerError) throw playerError;
  await seedStartingKit(supabase, { campaignId: campaign.id, playerId: player.id, weaponId });

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({ campaign_id: campaign.id, status: 'pending' })
    .select()
    .single();
  if (roundError) throw roundError;

  const { error: campaignUpdateError } = await supabase
    .from('campaigns')
    .update({ current_round_id: round.id })
    .eq('id', campaign.id);
  if (campaignUpdateError) throw campaignUpdateError;

  // Show the opening scene. Best effort: campaigns created before the scene column exists still work.
  const sceneId = await openingSceneIdAsync(supabase, params.adventureId);
  if (sceneId) {
    try {
      await supabase.from('campaigns').update({ current_scene_id: sceneId }).eq('id', campaign.id);
    } catch {
      /* banner is optional */
    }
  }

  // The opening scene posts when the owner starts the game (see startCampaign), not here —
  // this campaign sits in the lobby first so the table can fill up before anyone sees it.

  return { campaign, player, round };
}
