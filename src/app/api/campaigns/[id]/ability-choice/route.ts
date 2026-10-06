import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { AbilityChoiceError, spendAbilityChoice } from '@/lib/character/spendAbilityChoice';
import type { AbilityChoice } from '@/lib/character/leveling';

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
  if (!body || typeof body.choice !== 'object' || body.choice === null) {
    return NextResponse.json({ error: 'choice is required' }, { status: 400 });
  }

  try {
    const result = await spendAbilityChoice(supabase, {
      campaignId: id,
      userId: authData.user.id,
      choice: body.choice as AbilityChoice,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AbilityChoiceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
