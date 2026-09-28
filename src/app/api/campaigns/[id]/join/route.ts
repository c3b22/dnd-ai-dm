import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  if (!body.userId || !body.displayName) {
    return NextResponse.json(
      { error: 'userId and displayName are required' },
      { status: 400 }
    );
  }
  const supabase = createServiceRoleClient();
  const player = await joinCampaign(supabase, {
    campaignId: params.id,
    userId: body.userId,
    displayName: body.displayName,
  });
  return NextResponse.json(player, { status: 201 });
}
