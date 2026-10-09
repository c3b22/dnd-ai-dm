import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { RecapError, getRecap, supabaseRecapStore } from '@/lib/campaign/recap';
import { generateNarration } from '@/lib/ai/geminiClient';
import { realGeminiDeps } from '@/lib/ai/vercelAiSdkAdapter';

export const maxDuration = 60;

/**
 * GET /api/campaigns/[id]/recap[?force=1]
 * 200 { needed: false } when the player does not need a recap (auto mode only),
 * 200 { needed: true, text, cached, fromRoundId, toRoundId }, 401, 403 (not a member), 503 (AI failed: hide the box).
 */
export async function GET(
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

  const force = request.nextUrl.searchParams.get('force') === '1';

  try {
    const result = await getRecap(
      {
        store: supabaseRecapStore(supabase),
        generate: async (prompt) => {
          const stream = await generateNarration(prompt, realGeminiDeps, { purpose: 'summary', quality: 'fast' });
          let text = '';
          for await (const chunk of stream) text += chunk;
          return text;
        },
      },
      { campaignId: id, userId: authData.user.id, force }
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RecapError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
