import type { SupabaseClient } from '@supabase/supabase-js';
import { findOwnerId } from './turnOrder';

export interface MyCampaignSummary {
  id: string;
  playerId: string;
  name: string;
  adventureId: string | null;
  started: boolean;
  /** L4: the campaign has ended (status = 'ended'); false when the column is not readable yet. */
  ended: boolean;
  /** True when this user is the table owner (earliest-joined player). */
  isOwner: boolean;
}

interface PlayerRow {
  id: string;
  campaign_id: string;
  campaigns: {
    name: string;
    adventure_id: string | null;
    started_at: string | null;
    status?: string | null;
    created_at: string;
    players?: { id: string; created_at: string }[] | null;
  } | null;
}

export async function fetchMyCampaigns(
  supabase: SupabaseClient,
  userId: string
): Promise<MyCampaignSummary[]> {
  const load = (campaignColumns: string) =>
    supabase.from('players').select(`id, campaign_id, campaigns(${campaignColumns}, created_at, players(id, created_at))`).eq('user_id', userId);
  // campaigns.status may not exist yet (migration not applied): retry without it, treating every room as not ended.
  let { data, error } = await load('name, adventure_id, started_at, status');
  if (error) ({ data, error } = await load('name, adventure_id, started_at'));
  if (error) throw error;

  return (data as unknown as PlayerRow[])
    .filter((row): row is PlayerRow & { campaigns: NonNullable<PlayerRow['campaigns']> } =>
      Boolean(row.campaigns)
    )
    .sort((a, b) => (a.campaigns.created_at < b.campaigns.created_at ? 1 : -1))
    .map((row) => ({
      id: row.campaign_id,
      playerId: row.id,
      name: row.campaigns.name,
      adventureId: row.campaigns.adventure_id,
      started: Boolean(row.campaigns.started_at),
      ended: row.campaigns.status === 'ended',
      isOwner:
        findOwnerId((row.campaigns.players ?? []).map((p) => ({ id: p.id, joinedAt: p.created_at }))) === row.id,
    }));
}
