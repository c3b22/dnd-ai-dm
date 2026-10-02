import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EconomyError } from '@/lib/economy/errors';
import { tradeForUser } from '@/lib/economy/serverTrades';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const action = body.action;
  const valid =
    (action === 'propose' && typeof body.toPlayerId === 'string' && typeof body.terms === 'object' && body.terms !== null) ||
    ((action === 'accept' || action === 'decline' || action === 'cancel') && typeof body.tradeId === 'string');
  if (!valid) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) return NextResponse.json({ error: 'sign in required' }, { status: 401 });

  try {
    const base = { campaignId: id, userId: authData.user.id };
    const result =
      action === 'propose'
        ? await tradeForUser(supabase, { ...base, action, toPlayerId: body.toPlayerId, terms: body.terms })
        : await tradeForUser(supabase, { ...base, action, tradeId: body.tradeId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EconomyError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}
