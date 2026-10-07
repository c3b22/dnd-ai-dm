import { findOwnerId } from './turnOrder';
import { createServiceRoleClient } from '@/lib/supabase/server';

type Client = ReturnType<typeof createServiceRoleClient>;

export class RemoveCampaignError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 = 403
  ) {
    super(message);
  }
}

async function loadMembers(supabase: Client, campaignId: string, userId: string) {
  const { data, error } = await supabase
    .from('players')
    .select('id, user_id, created_at')
    .eq('campaign_id', campaignId);
  if (error) throw error;
  const rows = (data ?? []).map((p: any) => ({ id: p.id as string, userId: p.user_id as string, joinedAt: p.created_at as string }));
  return { requester: rows.find((p) => p.userId === userId), ownerId: findOwnerId(rows) };
}

/**
 * Only the table owner may delete the campaign. Every child row (players, rounds, messages,
 * inventory, trades...) goes with it via ON DELETE CASCADE (see supabase/migrations/README-fk-audit.md).
 */
export async function deleteCampaign(supabase: Client, params: { campaignId: string; userId: string }): Promise<void> {
  const { requester, ownerId } = await loadMembers(supabase, params.campaignId, params.userId);
  if (!requester || requester.id !== ownerId) {
    throw new RemoveCampaignError('only the table owner can delete the campaign', 403);
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('current_round_id')
    .eq('id', params.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;

  if (campaign?.current_round_id) {
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('status')
      .eq('id', campaign.current_round_id)
      .maybeSingle();
    if (roundError) throw roundError;
    if (round?.status === 'processing') {
      throw new RemoveCampaignError('the DM is resolving a round right now; try again in a moment', 409);
    }
  }

  const { error } = await supabase.from('campaigns').delete().eq('id', params.campaignId);
  if (error) throw error;
}

/**
 * A member leaves by deleting their own players row. Cascades remove their round actions, pack and
 * trades; the round no longer waits for them because the client counts remaining active players live.
 */
export async function leaveCampaign(supabase: Client, params: { campaignId: string; userId: string }): Promise<void> {
  const { requester, ownerId } = await loadMembers(supabase, params.campaignId, params.userId);
  if (!requester) throw new RemoveCampaignError('you are not in this campaign', 404);
  if (requester.id === ownerId) {
    throw new RemoveCampaignError('the table owner cannot leave; delete the campaign instead', 409);
  }

  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', requester.id)
    .eq('campaign_id', params.campaignId);
  if (error) throw error;
}
