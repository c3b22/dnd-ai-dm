import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordSeen } from '@/lib/campaign/seen';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  const result = await recordSeen(supabase, { campaignId: id, userId: authData.user.id });
  if (!result.recorded && result.reason === 'not-a-member') {
    return NextResponse.json({ error: 'not a member of this campaign' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, recorded: result.recorded });
}
