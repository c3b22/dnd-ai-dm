import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAdventureById } from '@/lib/adventures/adventures';
import { normalizeIdentityFields } from '@/lib/character/identity';
import { createCampaign } from '@/lib/campaign/createCampaign';

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name || !body.userId || !body.displayName) {
    return NextResponse.json(
      { error: 'name, userId, and displayName are required' },
      { status: 400 }
    );
  }
  const supabase = createServiceRoleClient();
  if (body.adventureId && !(await getAdventureById(supabase, body.adventureId))) {
    return NextResponse.json({ error: 'unknown adventureId' }, { status: 400 });
  }
  const result = await createCampaign(supabase, { ...body, ...normalizeIdentityFields(body) });
  return NextResponse.json(result, { status: 201 });
}
