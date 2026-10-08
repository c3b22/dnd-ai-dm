import { createServiceRoleClient } from '@/lib/supabase/server';
import { findOwnerId } from './turnOrder';
import { normalizeSettings, type CampaignSettings } from './settings';

export class SettingsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
  }
}

/** Only the table owner (the first player) may change the rules. */
export async function updateCampaignSettings(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { campaignId: string; userId: string; patch: Partial<CampaignSettings> }
): Promise<CampaignSettings> {
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, user_id, created_at')
    .eq('campaign_id', params.campaignId);
  if (playersError) throw playersError;

  const rows = (players ?? []).map((p: any) => ({
    id: p.id as string,
    userId: p.user_id as string,
    joinedAt: p.created_at as string,
  }));
  const ownerId = findOwnerId(rows);
  const requester = rows.find((p) => p.userId === params.userId);
  if (!requester || requester.id !== ownerId) {
    throw new SettingsError('only the table owner can change the settings', 403);
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('settings, started_at')
    .eq('id', params.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) throw new SettingsError('campaign not found', 404);

  const current = normalizeSettings(campaign.settings);
  // Permadeath is a rule of the whole game: it can only be flipped while still in the lobby.
  if (campaign.started_at && params.patch.permadeath !== undefined && params.patch.permadeath !== current.permadeath) {
    throw new SettingsError('permadeath cannot be changed after the game has started', 409);
  }

  const merged = normalizeSettings({ ...current, ...params.patch });
  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ settings: merged })
    .eq('id', params.campaignId);
  if (updateError) throw updateError;
  return merged;
}
