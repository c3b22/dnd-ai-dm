import { supabaseBrowserClient } from './client';

export async function submitAction(
  roundId: string,
  playerId: string,
  actionText: string,
  useItemId?: string,
  ability?: { targetId?: string | null; abilityId?: string | null },
  /** Enemy a scroll is aimed at (F5e). */
  itemTarget?: string,
  /** K4: a spell cast. `enemy` is the enemy's name (stored in item_target like a scroll's), `targetId` a friend; `surge` = the mage's arcane surge. */
  spell?: { spellId: string; targetId?: string | null; enemy?: string | null; surge?: boolean }
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
      ...(spell
        ? {
            spell_id: spell.spellId,
            ...(spell.targetId ? { ability_target_id: spell.targetId } : {}),
            ...(spell.enemy ? { item_target: spell.enemy } : {}),
            ...(spell.surge ? { use_ability: true } : {}),
          }
        : {}),
    });
  if (error) throw error;
}
