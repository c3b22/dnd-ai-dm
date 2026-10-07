import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAbilities, type AbilityScores } from './constants';
import { abilityChoicesAvailable, applyAbilityChoice, levelForXp, type AbilityChoice } from './leveling';

export class AbilityChoiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409,
    message?: string
  ) {
    super(message ?? code);
  }
}

/**
 * Spends one earned ability score improvement for the caller's own player: checks that one is
 * really left, then writes `abilities` and `ability_choices_used` in a single update guarded by
 * the used count we read (a concurrent spend makes the update match no row -> conflict).
 * If `ability_choices_used` does not exist yet (migration 0022 not applied) nothing is written.
 */
export async function spendAbilityChoice(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; choice: AbilityChoice }
): Promise<{ abilities: AbilityScores; remaining: number }> {
  const find = (columns: string) =>
    supabase
      .from('players')
      .select(columns)
      .eq('campaign_id', params.campaignId)
      .eq('user_id', params.userId)
      .maybeSingle();

  const first = await find('id, xp, abilities, ability_choices_used');
  if (first.error) {
    const retry = await find('id, xp, abilities');
    if (retry.error) throw retry.error;
    if (!retry.data) throw new AbilityChoiceError('forbidden', 403);
    throw new AbilityChoiceError('unavailable', 409, 'ยังเลือกแต้มเพิ่มค่าไม่ได้ (ระบบยังไม่พร้อม)');
  }
  const player = first.data as unknown as {
    id: string;
    xp: number | null;
    abilities: unknown;
    ability_choices_used: number | null;
  } | null;
  if (!player) throw new AbilityChoiceError('forbidden', 403);

  const level = levelForXp(Number(player.xp ?? 0));
  const used = Math.max(0, Number(player.ability_choices_used ?? 0));
  const available = abilityChoicesAvailable(level, used);
  if (available <= 0) throw new AbilityChoiceError('no_choice_available', 409, 'ไม่มีแต้มเพิ่มค่าเหลือ');

  const applied = applyAbilityChoice(normalizeAbilities(player.abilities), params.choice);
  if (!applied.ok) throw new AbilityChoiceError('invalid_choice', 400, applied.error);

  const { data, error } = await supabase
    .from('players')
    .update({ abilities: applied.abilities, ability_choices_used: used + 1 })
    .eq('id', player.id)
    .eq('ability_choices_used', used)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new AbilityChoiceError('conflict', 409, 'ข้อมูลเปลี่ยนไประหว่างเลือก ลองใหม่อีกครั้ง');

  return { abilities: applied.abilities, remaining: available - 1 };
}
