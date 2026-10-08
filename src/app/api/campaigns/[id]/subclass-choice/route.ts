import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { chooseSubclass, SubclassChoiceError } from '@/lib/character/chooseSubclass';

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
  if (!body || typeof body.subclassId !== 'string') {
    return NextResponse.json({ error: 'subclassId is required' }, { status: 400 });
  }

  try {
    const result = await chooseSubclass(supabase, { campaignId: id, userId: authData.user.id, subclassId: body.subclassId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SubclassChoiceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
