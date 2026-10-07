import { supabaseBrowserClient } from './client';

export async function submitAction(
  roundId: string,
  playerId: string,
  actionText: string,
  useItemId?: string,
  ability?: { targetId?: string | null; abilityId?: string | null },
  /** Enemy a scroll is aimed at (F5e). */
  itemTarget?: string
): Promise<void> {
  const { error } = await supabaseBrowserClient
    .from('round_actions')
    .insert({
      round_id: roundId,
      player_id: playerId,
      action_text: actionText,
      ...(useItemId ? { use_item_id: useItemId } : {}),
      ...(itemTarget ? { item_target: itemTarget } : {}),
      ...(ability ? { use_ability: true } : {}),
      ...(ability?.targetId ? { ability_target_id: ability.targetId } : {}),
      // K2: only sent when a non-default ability is picked, so a database without the column keeps working.
      ...(ability?.abilityId ? { ability_id: ability.abilityId } : {}),
    });
  if (error) throw error;
}
