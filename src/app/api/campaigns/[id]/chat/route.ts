import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { TeamChatError, postTeamChat } from '@/lib/campaign/teamChat';

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

  const body = await request.json().catch(() => null);

  try {
    await postTeamChat(supabase, { campaignId: id, userId: authData.user.id, content: body?.content });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TeamChatError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
