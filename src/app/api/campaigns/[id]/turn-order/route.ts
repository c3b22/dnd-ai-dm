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
  try {
    await setTurnOrder(createServiceRoleClient(), {
      campaignId: id,
      playerId: body.playerId,
      orderedPlayerIds: body.orderedPlayerIds,
    });
  } catch (error) {
    if (error instanceof TurnOrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
