import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { findCampaignByJoinCode } from '@/lib/campaign/findCampaignByJoinCode';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const joinCode = typeof body?.joinCode === 'string' ? body.joinCode.trim() : '';
  if (!joinCode) {
    return NextResponse.json({ error: 'joinCode is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const campaign = await findCampaignByJoinCode(supabase, joinCode);
  if (!campaign) {
    return NextResponse.json({ error: 'ไม่พบห้องนี้ ตรวจสอบรหัสอีกครั้ง' }, { status: 404 });
  }

  return NextResponse.json({ campaignId: campaign.id });
}
