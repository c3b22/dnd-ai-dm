import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { parseSettingsPatch } from '@/lib/campaign/settings';
import { SettingsError, updateCampaignSettings } from '@/lib/campaign/updateSettings';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patch = parseSettingsPatch(await request.json().catch(() => null));
  if (!patch) {
    return NextResponse.json({ error: 'invalid settings' }, { status: 400 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  try {
    const settings = await updateCampaignSettings(supabase, {
      campaignId: id,
      userId: authData.user.id,
      patch,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof SettingsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
