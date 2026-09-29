import { getAdventure } from '@/lib/adventures/adventures';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function createCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { name: string; userId: string; displayName: string; adventureId?: string | null }
) {
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({ name: params.name, adventure_id: params.adventureId ?? null })
    .select()
    .single();
  if (campaignError) throw campaignError;

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaign.id,
      user_id: params.userId,
      display_name: params.displayName,
    })
    .select()
    .single();
  if (playerError) throw playerError;

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

  // Open the story right away so players have a scene to react to before the first round.
  const adventure = getAdventure(params.adventureId);
  if (adventure) {
    const { error: openingError } = await supabase.from('messages').insert({
      campaign_id: campaign.id,
      round_id: round.id,
      role: 'dm',
      content: `${adventure.title}

${adventure.openingTh}

พวกคุณจะทำอะไร?`,
    });
    if (openingError) throw openingError;
  }

  return { campaign, player, round };
}
