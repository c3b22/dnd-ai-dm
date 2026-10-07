import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';
import { importSharedAdventure } from '@/lib/adventures/sharedAdventures';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  try {
    const adventure = await importSharedAdventure(supabase, code, authData.user.id);
    return NextResponse.json(adventure, { status: 201 });
  } catch (error) {
    if (error instanceof CustomAdventureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
