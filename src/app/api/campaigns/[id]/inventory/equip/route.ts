import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EquipError, equipForUser } from '@/lib/inventory/equipItem';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (!body.itemId || (body.action !== 'equip' && body.action !== 'unequip')) {
    return NextResponse.json({ error: "itemId and action ('equip' | 'unequip') are required" }, { status: 400 });
  }

  // Identify the caller from their Supabase session instead of trusting ids in the body.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  try {
    const items = await equipForUser(supabase, {
      campaignId: id,
      userId: authData.user.id,
      itemId: body.itemId,
      action: body.action,
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof EquipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
