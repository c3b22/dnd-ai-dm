import { getAdventure } from '@/lib/adventures/adventures';
import { findOwnerId } from './turnOrder';
import { createServiceRoleClient } from '@/lib/supabase/server';

export class StartCampaignError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 = 403
  ) {
    super(message);
  }
}

/** Only the table owner may start the game, once, moving it out of the lobby. */
export async function startCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { campaignId: string; userId: string }
): Promise<void> {
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, user_id, created_at')
    .eq('campaign_id', params.campaignId);
  if (playersError) throw playersError;

  const rows = (players ?? []).map((p: any) => ({ id: p.id as string, userId: p.user_id as string, joinedAt: p.created_at as string }));
  const ownerId = findOwnerId(rows);
  const requester = rows.find((p) => p.userId === params.userId);
  if (!requester || requester.id !== ownerId) {
    throw new StartCampaignError('only the table owner can start the game');
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('current_round_id, adventure_id, started_at')
    .eq('id', params.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) throw new StartCampaignError('campaign not found', 404);

  // Already started: no-op, so a double-click (or two players racing to start) never reposts the scene.
  if (campaign.started_at) return;

  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ started_at: new Date().toISOString() })
    .eq('id', params.campaignId);
  if (updateError) throw updateError;

  const adventure = getAdventure(campaign.adventure_id);
  if (adventure) {
    const { error: openingError } = await supabase.from('messages').insert({
      campaign_id: params.campaignId,
      round_id: campaign.current_round_id,
      role: 'dm',
      content: `${adventure.titleTh}

${adventure.openingTh}

พวกคุณจะทำอะไร?`,
    });
    if (openingError) throw openingError;
  }
}
