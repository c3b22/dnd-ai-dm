import { createServiceRoleClient } from '@/lib/supabase/server';

export async function joinCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { campaignId: string; userId: string; displayName: string }
) {
  const { data, error } = await supabase
    .from('players')
    .insert({
      campaign_id: params.campaignId,
      user_id: params.userId,
      display_name: params.displayName,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
