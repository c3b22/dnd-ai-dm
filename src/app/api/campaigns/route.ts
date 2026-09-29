import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAdventure } from '@/lib/adventures/adventures';
import { createCampaign } from '@/lib/campaign/createCampaign';

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name || !body.userId || !body.displayName) {
    return NextResponse.json(
      { error: 'name, userId, and displayName are required' },
      { status: 400 }
    );
  }
  if (body.adventureId && !getAdventure(body.adventureId)) {
    return NextResponse.json({ error: 'unknown adventureId' }, { status: 400 });
  }
  const supabase = createServiceRoleClient();
  const result = await createCampaign(supabase, body);
  return NextResponse.json(result, { status: 201 });
}
