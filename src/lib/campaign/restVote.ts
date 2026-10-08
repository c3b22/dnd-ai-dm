import { SHORT_REST_MAX_PER_LONG_REST } from '@/lib/character/restConstants';

export type RestKind = 'short' | 'long';

/**
 * J2 rest vote stored in `campaigns.rest_vote`. `roundId` is the round it was raised in; once that round
 * closes (current_round_id moves on) the vote no longer matches and reads as null (expired).
 * `status: 'passed'` is the state J3 consumes while processing the round.
 */
export interface RestVote {
  kind: RestKind;
  proposerId: string;
  agree: string[];
  roundId: string;
  status: 'open' | 'passed';
}

export class RestVoteError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
    message?: string
  ) {
    super(message ?? code);
  }
}

export function normalizeRestVote(raw: unknown, currentRoundId: string | null): RestVote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'short' && r.kind !== 'long') return null;
  if (r.status !== 'open' && r.status !== 'passed') return null;
  if (typeof r.proposerId !== 'string' || typeof r.roundId !== 'string') return null;
  if (!Array.isArray(r.agree) || !r.agree.every((x) => typeof x === 'string')) return null;
  if (!currentRoundId || r.roundId !== currentRoundId) return null;
  return {
    kind: r.kind,
    proposerId: r.proposerId,
    agree: [...new Set(r.agree as string[])],
    roundId: r.roundId,
    status: r.status,
  };
}

/** Strictly more than half of the players who can still play (only their votes count). */
export function hasMajority(agree: string[], activeIds: string[]): boolean {
  const active = new Set(activeIds);
  const yes = new Set(agree.filter((id) => active.has(id))).size;
  return yes * 2 > active.size;
}

const notActive = () => new RestVoteError('not_active', 403, 'ตัวละครของคุณพักหรือโหวตไม่ได้ในสภาพนี้');
const inEncounter = () => new RestVoteError('in_encounter', 409, 'กำลังต่อสู้อยู่ พักไม่ได้');

export function proposeRest(
  existing: RestVote | null,
  p: { kind: RestKind; proposerId: string; roundId: string | null; activeIds: string[]; encounterActive: boolean; anyShortRestLeft?: boolean }
): RestVote {
  if (!p.activeIds.includes(p.proposerId)) throw notActive();
  if (!p.roundId) throw new RestVoteError('no_round', 409, 'ยังไม่มีรอบที่เปิดอยู่');
  if (p.encounterActive) throw inEncounter();
  if (existing) throw new RestVoteError('vote_exists', 409, 'มีการโหวตพักอยู่แล้ว');
  if (p.kind === 'short' && p.anyShortRestLeft === false) {
    throw new RestVoteError('no_short_rests_left', 409, `ทุกคนพักสั้นครบ ${SHORT_REST_MAX_PER_LONG_REST} ครั้งแล้ว ต้องพักยาวก่อน`);
  }
  const agree = [p.proposerId];
  return {
    kind: p.kind,
    proposerId: p.proposerId,
    agree,
    roundId: p.roundId,
    status: hasMajority(agree, p.activeIds) ? 'passed' : 'open',
  };
}

export function agreeRest(
  existing: RestVote | null,
  p: { playerId: string; activeIds: string[]; encounterActive: boolean }
): RestVote {
  if (!existing) throw new RestVoteError('no_vote', 409, 'ยังไม่มีการโหวตพัก');
  if (!p.activeIds.includes(p.playerId)) throw notActive();
  if (existing.status === 'passed') return existing;
  if (p.encounterActive) throw inEncounter();
  const agree = existing.agree.includes(p.playerId) ? existing.agree : [...existing.agree, p.playerId];
  return { ...existing, agree, status: hasMajority(agree, p.activeIds) ? 'passed' : 'open' };
}

/** Only the proposer or the room owner can withdraw a vote (open or passed). Returns null = cleared. */
export function cancelRest(existing: RestVote | null, p: { playerId: string; ownerId: string | null }): null {
  if (!existing) throw new RestVoteError('no_vote', 409, 'ไม่มีการโหวตพักให้ยกเลิก');
  if (p.playerId !== existing.proposerId && p.playerId !== p.ownerId) {
    throw new RestVoteError('forbidden', 403, 'เฉพาะผู้เสนอหรือเจ้าของห้องที่ยกเลิกได้');
  }
  return null;
}
