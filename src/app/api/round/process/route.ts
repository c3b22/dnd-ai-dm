import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { claimRound } from '@/lib/round/claimRound';
import { createSupabaseRoundRepository } from '@/lib/round/roundRepository';
import { processRound } from '@/lib/round/processRound';
import { generateNarration } from '@/lib/ai/geminiClient';
import { realGeminiDeps } from '@/lib/ai/vercelAiSdkAdapter';
import { CAMPAIGN_ENDED_MESSAGE, isCampaignEnded } from '@/lib/campaign/campaignEnd';

// Explicit Vercel function timeout (seconds). Kept below claimRound's 90s stale-reclaim
// window so a timed-out attempt is only re-claimed after it has definitely stopped.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // R4: the time budget counts from the start of this request, against maxDuration.
  const deadlineAt = Date.now() + maxDuration * 1000;
  const { roundId } = await request.json();
  if (!roundId) {
    return NextResponse.json({ error: 'roundId is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  // L2: an ended campaign takes no new action, so its leftover pending round is never processed.
  const { data: roundRow } = await supabase.from('rounds').select('campaign_id').eq('id', roundId).maybeSingle();
  const roundCampaignId = (roundRow as { campaign_id?: string } | null)?.campaign_id;
  if (roundCampaignId && (await isCampaignEnded(supabase, roundCampaignId))) {
    return NextResponse.json({ error: CAMPAIGN_ENDED_MESSAGE }, { status: 409 });
  }
  // R5: remember if the big model was skipped or failed for the plan/narration of this round.
  let fellBack = false;
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
        generateNarration: (prompt, call) =>
          generateNarration(prompt, realGeminiDeps, call, {
            deadlineAt,
            onUsed: (info) => {
              if (info.fellBack && (info.purpose === 'plan' || info.purpose === 'narration')) fellBack = true;
            },
          }),
        usedFallback: () => fellBack,
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
