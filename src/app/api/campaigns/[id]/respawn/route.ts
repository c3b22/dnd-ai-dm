import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeIdentityFields } from '@/lib/character/identity';
import { RespawnError, respawnPlayer } from '@/lib/campaign/respawn';

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
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName) {
    return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
  }

  try {
    const result = await respawnPlayer(supabase, {
      campaignId: id,
      userId: authData.user.id,
      displayName,
      classId: body.classId,
      weaponId: body.weaponId,
      ...normalizeIdentityFields(body),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RespawnError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
