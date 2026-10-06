import type { createServiceRoleClient } from '@/lib/supabase/server';
import type { AbilityScores } from '@/lib/character/constants';

const OPTIONAL_COLUMNS = ['abilities', 'backstory', 'personality', 'goal'] as const;

/**
 * Inserts a player with its starting ability scores. Best effort: if an optional column
 * (`abilities`, `backstory`, `personality`, `goal`) does not exist yet (migrations 0018 / 0020 not
 * applied), retries without the column the error names so joining still works.
 */
export async function insertPlayer(
  supabase: ReturnType<typeof createServiceRoleClient>,
  row: Record<string, unknown>,
  abilities: AbilityScores
) {
  let payload: Record<string, unknown> = { ...row, abilities };
  let result = await supabase.from('players').insert(payload).select().single();
  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length && result.error; attempt++) {
    const message = result.error.message ?? '';
    const missing = OPTIONAL_COLUMNS.filter((c) => c in payload && new RegExp(c, 'i').test(message));
    if (missing.length === 0) break;
    payload = Object.fromEntries(Object.entries(payload).filter(([k]) => !missing.includes(k as (typeof OPTIONAL_COLUMNS)[number])));
    result = await supabase.from('players').insert(payload).select().single();
  }
  return result;
}
