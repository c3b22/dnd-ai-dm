import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EconomyError } from '@/lib/economy/errors';
import { shopForUser } from '@/lib/economy/serverShop';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (!body.itemId || (body.action !== 'buy' && body.action !== 'sell')) {
    return NextResponse.json({ error: "itemId and action ('buy' | 'sell') are required" }, { status: 400 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  try {
    const result = await shopForUser(supabase, {
      campaignId: id,
      userId: authData.user.id,
      action: body.action,
      itemId: body.itemId,
      customName: typeof body.customName === 'string' ? body.customName : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EconomyError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}
