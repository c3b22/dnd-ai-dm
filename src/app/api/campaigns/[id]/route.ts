import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { RemoveCampaignError, deleteCampaign } from '@/lib/campaign/removeCampaign';

export async function DELETE(
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

  try {
    await deleteCampaign(supabase, { campaignId: id, userId: authData.user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RemoveCampaignError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
