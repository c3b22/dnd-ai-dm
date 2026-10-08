import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEncounter } from '@/lib/combat/encounter';
import { SHORT_REST_MAX_PER_LONG_REST } from '@/lib/character/restConstants';
import { findOwnerId } from './turnOrder';
import { CAMPAIGN_ENDED_MESSAGE, isCampaignEnded } from './campaignEnd';
import {
  RestVoteError,
  agreeRest,
  cancelRest,
  normalizeRestVote,
  proposeRest,
  type RestKind,
  type RestVote,
} from './restVote';

export type RestAction = 'propose' | 'agree' | 'cancel';

interface PlayerRow {
  id: string;
  user_id: string;
  status: string | null;
  created_at: string;
  short_rests_used?: number | null;
}

/** Select with progressively fewer optional columns until the database accepts it (migration 0029 may be unapplied). */
async function selectTolerant<T>(
  run: (columns: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  variants: string[]
): Promise<T> {
  let lastError: { message?: string } | null = null;
  for (const columns of variants) {
    const { data, error } = await run(columns);
    if (!error) return data as T;
    lastError = error;
  }
  throw lastError;
}

/**
 * Proposes, agrees to or cancels the team's rest vote. The result is the stored vote (null once
 * cancelled). A passed vote stays in `campaigns.rest_vote` until its round closes, for J3 to apply.
 */
export async function handleRestAction(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; action: RestAction; kind?: RestKind }
): Promise<RestVote | null> {
  const campaign = await selectTolerant<{ current_round_id?: string | null; current_encounter?: unknown; rest_vote?: unknown } | null>(
    (cols) => supabase.from('campaigns').select(cols).eq('id', params.campaignId).maybeSingle(),
    ['current_round_id, current_encounter, rest_vote', 'current_round_id, current_encounter', 'current_round_id']
  );
  if (!campaign) throw new RestVoteError('not_found', 404, 'ไม่พบห้องนี้');

  const players = await selectTolerant<PlayerRow[]>(
    (cols) => supabase.from('players').select(cols).eq('campaign_id', params.campaignId),
    ['id, user_id, status, created_at, short_rests_used', 'id, user_id, status, created_at']
  );
  const me = (players ?? []).find((p) => p.user_id === params.userId);
  if (!me) throw new RestVoteError('not_member', 404, 'คุณไม่ได้อยู่ในห้องนี้');

  if (await isCampaignEnded(supabase, params.campaignId)) throw new RestVoteError('ended', 409, CAMPAIGN_ENDED_MESSAGE);

  const roundId = campaign.current_round_id ?? null;
  const existing = normalizeRestVote(campaign.rest_vote, roundId);
  const encounterActive = normalizeEncounter(campaign.current_encounter) !== null;
  const active = players.filter((p) => p.status === 'active');
  const activeIds = active.map((p) => p.id);

  let next: RestVote | null;
  if (params.action === 'propose') {
    if (params.kind !== 'short' && params.kind !== 'long') throw new RestVoteError('bad_kind', 400, 'kind ต้องเป็น short หรือ long');
    next = proposeRest(existing, {
      kind: params.kind,
      proposerId: me.id,
      roundId,
      activeIds,
      encounterActive,
      anyShortRestLeft: active.some((p) => (p.short_rests_used ?? 0) < SHORT_REST_MAX_PER_LONG_REST),
    });
  } else if (params.action === 'agree') {
    next = agreeRest(existing, { playerId: me.id, activeIds, encounterActive });
  } else {
    next = cancelRest(existing, {
      playerId: me.id,
      ownerId: findOwnerId(players.map((p) => ({ id: p.id, joinedAt: p.created_at }))),
    });
  }

  const { error } = await supabase.from('campaigns').update({ rest_vote: next }).eq('id', params.campaignId);
  if (error) {
    if (/rest_vote/i.test(error.message ?? '')) {
      throw new RestVoteError('unavailable', 503, 'ระบบพักยังไม่พร้อม (ฐานข้อมูลยังไม่ได้อัปเดต)');
    }
    throw error;
  }
  return next;
}
