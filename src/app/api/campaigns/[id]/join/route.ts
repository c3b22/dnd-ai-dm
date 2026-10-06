import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { joinCampaign } from '@/lib/campaign/joinCampaign';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (!body.userId || !body.displayName) {
    return NextResponse.json(
      { error: 'userId and displayName are required' },
      { status: 400 }
    );
  }
  const supabase = createServiceRoleClient();
  const player = await joinCampaign(supabase, {
    campaignId: id,
    userId: body.userId,
    displayName: body.displayName,
    classId: body.classId,
    weaponId: body.weaponId,
  });
  return NextResponse.json(player, { status: 201 });
}
