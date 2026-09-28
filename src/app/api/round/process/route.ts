import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { claimRound } from '@/lib/round/claimRound';
import { createSupabaseRoundRepository } from '@/lib/round/roundRepository';
import { processRound } from '@/lib/round/processRound';
import { generateNarration } from '@/lib/ai/geminiClient';
import { realGeminiDeps } from '@/lib/ai/vercelAiSdkAdapter';

// Explicit Vercel function timeout (seconds). Kept below claimRound's 90s stale-reclaim
// window so a timed-out attempt is only re-claimed after it has definitely stopped.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { roundId } = await request.json();
  if (!roundId) {
    return NextResponse.json({ error: 'roundId is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const result = await processRound(
    {
      claimRound: (id) => claimRound(supabase, id),
      repository: createSupabaseRoundRepository(supabase),
      generateNarration: (prompt) => generateNarration(prompt, realGeminiDeps),
    },
    roundId
  );

  return NextResponse.json(result, { status: result.processed ? 200 : 409 });
}
