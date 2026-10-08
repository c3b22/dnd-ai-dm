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
  try {
    const result = await processRound(
      {
        claimRound: (id) => claimRound(supabase, id),
        releaseRound: async (id) => {
          await supabase
            .from('rounds')
            .update({ status: 'pending', processing_started_at: null })
            .eq('id', id)
            .eq('status', 'processing');
        },
        repository: createSupabaseRoundRepository(supabase),
        generateNarration: (prompt) => generateNarration(prompt, realGeminiDeps),
      },
      roundId
    );

    return NextResponse.json(result, { status: result.processed ? 200 : 409 });
  } catch (error) {
    console.error('round process failed', roundId, error);
    // processRound already released the round claim before rethrowing, so the client's
    // automatic retry (or the manual "ให้ DM ตัดสินตอนนี้" button) can attempt it fresh.
    return NextResponse.json({ error: 'DM ตอบไม่สำเร็จ ลองอีกครั้ง' }, { status: 500 });
  }
}
