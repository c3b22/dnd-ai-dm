import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  CustomAdventureError,
  deleteCustomAdventure,
  updateCustomAdventure,
  validateCustomAdventureInput,
} from '@/lib/adventures/customAdventures';

async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  return { supabase, user: authData.user };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await authenticate(request);
  if (!user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const validationError = validateCustomAdventureInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const adventure = await updateCustomAdventure(supabase, id, user.id, body);
    return NextResponse.json(adventure);
  } catch (error) {
    if (error instanceof CustomAdventureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
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
    await deleteCustomAdventure(supabase, id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CustomAdventureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
