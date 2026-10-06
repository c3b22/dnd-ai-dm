import { supabaseBrowserClient } from './client';

export async function submitAction(
  roundId: string,
  playerId: string,
  actionText: string,
  useItemId?: string,
  ability?: { targetId?: string | null }
): Promise<void> {
  const { error } = await supabaseBrowserClient
    .from('round_actions')
    .insert({
      round_id: roundId,
      player_id: playerId,
      action_text: actionText,
      ...(useItemId ? { use_item_id: useItemId } : {}),
      ...(ability ? { use_ability: true } : {}),
      ...(ability?.targetId ? { ability_target_id: ability.targetId } : {}),
    });
  if (error) throw error;
}
