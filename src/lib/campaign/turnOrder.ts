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

export class TurnOrderError extends Error {}

export async function setTurnOrder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: { campaignId: string; playerId: string; orderedPlayerIds: string[] }
): Promise<void> {
  const { data: players, error } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', params.campaignId);
  if (error) throw error;

  const ids = (players ?? []).map((p: { id: string }) => p.id);
  if (!ids.includes(params.playerId)) {
    throw new TurnOrderError('player is not in this campaign');
  }
  const submitted = new Set(params.orderedPlayerIds);
  if (
    params.orderedPlayerIds.length !== ids.length ||
    submitted.size !== ids.length ||
    !ids.every((id: string) => submitted.has(id))
  ) {
    throw new TurnOrderError('orderedPlayerIds must list every player in the campaign exactly once');
  }

  for (const [index, id] of params.orderedPlayerIds.entries()) {
    const { error: updateError } = await supabase
      .from('players')
      .update({ turn_order: index + 1 })
      .eq('id', id)
      .eq('campaign_id', params.campaignId);
    if (updateError) throw updateError;
  }
}
