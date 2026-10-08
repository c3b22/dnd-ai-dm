import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { chooseAbilityPick, AbilityPickError } from '@/lib/character/chooseAbilityPick';

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
  if (!body || typeof body.abilityId !== 'string') {
    return NextResponse.json({ error: 'abilityId is required' }, { status: 400 });
  }

  try {
    const result = await chooseAbilityPick(supabase, { campaignId: id, userId: authData.user.id, abilityId: body.abilityId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AbilityPickError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
