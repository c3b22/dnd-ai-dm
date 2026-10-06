import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CustomAdventureError, disableSharing, enableSharing } from '@/lib/adventures/customAdventures';

async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  return { supabase, user: authData.user };
}

function errorResponse(error: unknown) {
  if (error instanceof CustomAdventureError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await authenticate(request);
  if (!user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }
  try {
    const shareCode = await enableSharing(supabase, id, user.id);
    return NextResponse.json({ shareCode });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await authenticate(request);
  if (!user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }
  try {
    await disableSharing(supabase, id, user.id);
    return NextResponse.json({ shareCode: null });
  } catch (error) {
    return errorResponse(error);
  }
}
