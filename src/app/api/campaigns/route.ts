import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function createCampaign(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { name: string; userId: string; displayName: string }
) {
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({ name: params.name })
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

  return { campaign, player, round };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name || !body.userId || !body.displayName) {
    return NextResponse.json(
      { error: 'name, userId, and displayName are required' },
      { status: 400 }
    );
  }
  const supabase = createServiceRoleClient();
  const result = await createCampaign(supabase, body);
  return NextResponse.json(result, { status: 201 });
}
