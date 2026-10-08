import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { RestVoteError } from '@/lib/campaign/restVote';
import { handleRestAction } from '@/lib/campaign/restVoteService';

const ACTIONS = ['propose', 'agree', 'cancel'] as const;

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
  const action = ACTIONS.find((a) => a === body?.action);
  if (!action) {
    return NextResponse.json({ error: 'action must be propose, agree or cancel' }, { status: 400 });
  }
  if (action === 'propose' && body.kind !== 'short' && body.kind !== 'long') {
    return NextResponse.json({ error: 'kind must be short or long' }, { status: 400 });
  }

  try {
    const vote = await handleRestAction(supabase, { campaignId: id, userId: authData.user.id, action, kind: body.kind });
    return NextResponse.json({ vote });
  } catch (error) {
    if (error instanceof RestVoteError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
