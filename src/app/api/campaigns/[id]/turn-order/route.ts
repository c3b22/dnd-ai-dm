import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { setTurnOrder, TurnOrderError } from '@/lib/campaign/turnOrder';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (!body.playerId || !Array.isArray(body.orderedPlayerIds)) {
    return NextResponse.json(
      { error: 'playerId and orderedPlayerIds are required' },
      { status: 400 }
    );
  }

  // Identify the caller from their Supabase session instead of trusting ids in the body.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  try {
    await setTurnOrder(supabase, {
      campaignId: id,
      userId: authData.user.id,
      playerId: body.playerId,
      orderedPlayerIds: body.orderedPlayerIds,
    });
  } catch (error) {
    if (error instanceof TurnOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
