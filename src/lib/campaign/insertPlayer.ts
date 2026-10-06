import type { createServiceRoleClient } from '@/lib/supabase/server';
import type { AbilityScores } from '@/lib/character/constants';

/**
 * Inserts a player with its starting ability scores. Best effort: if `players.abilities` does not
 * exist yet (migration 0018 not applied), retries without it so joining still works.
 */
export async function insertPlayer(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: Record<string, unknown>,
  abilities: AbilityScores
) {
  const first = await supabase.from('players').insert({ ...row, abilities }).select().single();
  if (!first.error || !/abilities/i.test(first.error.message ?? '')) return first;
  return supabase.from('players').insert(row).select().single();
}
