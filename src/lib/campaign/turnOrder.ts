import { createServiceRoleClient } from '@/lib/supabase/server';

interface OrderedPlayer {
  turnOrder: number | null;
  joinedAt: string;
}

/** Explicit turn order first (lowest number acts first); players never ordered fall back to join time. */
export function sortByTurnOrder<T extends OrderedPlayer>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = a.turnOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.turnOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.joinedAt.localeCompare(b.joinedAt);
  });
}

/** The campaign owner is whoever sat down first (the creator joins as its first player). */
export function findOwnerId<T extends { id: string; joinedAt: string }>(players: T[]): string | null {
  if (players.length === 0) return null;
  return [...players].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0].id;
}

export class TurnOrderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 = 400
  ) {
    super(message);
  }
}

/**
 * The owner may arrange everyone. Anyone else may only change where they themselves stand:
 * with them taken out, the order of the remaining players must be untouched.
 */
export function canReorder(params: {
  currentIds: string[];
  newIds: string[];
  requesterId: string;
  ownerId: string | null;
}): boolean {
  if (params.requesterId === params.ownerId) return true;
  const others = (ids: string[]) => ids.filter((id) => id !== params.requesterId).join('|');
  return others(params.currentIds) === others(params.newIds);
}

export async function setTurnOrder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    campaignId: string;
    userId: string;
    playerId: string;
    orderedPlayerIds: string[];
    /** 'owner': only the owner may reorder. 'self' (default): players may also move themselves. */
    policy?: 'owner' | 'self';
  }
): Promise<void> {
  const { data, error } = await supabase
    .from('players')
    .select('id, user_id, turn_order, created_at')
    .eq('campaign_id', params.campaignId);
  if (error) throw error;

  const players = sortByTurnOrder(
    (data ?? []).map((p: any) => ({
      id: p.id as string,
      userId: p.user_id as string,
      turnOrder: p.turn_order as number | null,
      joinedAt: p.created_at as string,
    }))
  );
  const requester = players.find((p) => p.id === params.playerId);
  if (!requester) throw new TurnOrderError('player is not in this campaign', 403);
  if (requester.userId !== params.userId) {
    throw new TurnOrderError('this player belongs to someone else', 403);
  }

  const ids = players.map((p) => p.id);
  const submitted = new Set(params.orderedPlayerIds);
  if (
    params.orderedPlayerIds.length !== ids.length ||
    submitted.size !== ids.length ||
    !ids.every((id) => submitted.has(id))
  ) {
    throw new TurnOrderError('orderedPlayerIds must list every player in the campaign exactly once');
  }

  if (params.policy === 'owner' && requester.id !== findOwnerId(players)) {
    throw new TurnOrderError('this table lets only the owner set the order', 403);
  }

  const allowed = canReorder({
    currentIds: ids,
    newIds: params.orderedPlayerIds,
    requesterId: requester.id,
    ownerId: findOwnerId(players),
  });
  if (!allowed) throw new TurnOrderError('only the campaign owner can move other players', 403);

  for (const [index, id] of params.orderedPlayerIds.entries()) {
    const { error: updateError } = await supabase
      .from('players')
      .update({ turn_order: index + 1 })
      .eq('id', id)
      .eq('campaign_id', params.campaignId);
    if (updateError) throw updateError;
  }
}
