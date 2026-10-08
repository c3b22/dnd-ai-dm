import type { SupabaseClient } from '@supabase/supabase-js';
import { levelForXp } from './leveling';
import { isPickAbilityId, PICK_ABILITIES, type PickAbilityId, type PickLevel } from './abilityPicks';

export class AbilityPickError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409,
    message?: string
  ) {
    super(message ?? code);
  }
}

/**
 * K6: picks the caller's own character's ability for level 6 or 9 (the level comes from the ability itself),
 * once per level, from that level on. Never blocks a round and can be done any time after reaching the level
 * (like K5 / F4b). Reads players.ability_picks, adds the level's entry and writes it back; when the column is
 * empty the write is guarded by `ability_picks is null`, so a concurrent first pick makes the update match no
 * row -> conflict. If `ability_picks` does not exist yet (migration 0030 not applied) nothing is written.
 */
export async function chooseAbilityPick(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; abilityId: unknown }
): Promise<{ abilityId: PickAbilityId; level: PickLevel; abilityPicks: Record<string, string> }> {
  const find = (columns: string) =>
    supabase
      .from('players')
      .select(columns)
      .eq('campaign_id', params.campaignId)
      .eq('user_id', params.userId)
      .maybeSingle();

  const first = await find('id, xp, class_id, ability_picks');
  if (first.error) {
    const retry = await find('id, xp, class_id');
    if (retry.error) throw retry.error;
    if (!retry.data) throw new AbilityPickError('forbidden', 403);
    throw new AbilityPickError('unavailable', 409, 'ยังเลือกท่าใหม่ไม่ได้ (ระบบยังไม่พร้อม)');
  }
  const player = first.data as unknown as { id: string; xp: number | null; class_id: string | null; ability_picks: Record<string, unknown> | null } | null;
  if (!player) throw new AbilityPickError('forbidden', 403);

  if (!isPickAbilityId(params.abilityId)) throw new AbilityPickError('invalid_ability', 400, 'ไม่รู้จักท่านี้');
  const def = PICK_ABILITIES[params.abilityId];
  if (def.classId !== player.class_id) throw new AbilityPickError('wrong_class', 400, 'ท่านี้ไม่ใช่ของอาชีพตัวละครนี้');
  if (levelForXp(Number(player.xp ?? 0)) < def.level) {
    throw new AbilityPickError('level_too_low', 409, `ต้องถึงเลเวล ${def.level} ก่อนจึงเลือกท่านี้ได้`);
  }
  const existing: Record<string, string> = {};
  if (player.ability_picks && typeof player.ability_picks === 'object') {
    for (const [key, value] of Object.entries(player.ability_picks)) if (typeof value === 'string' && value) existing[key] = value;
  }
  if (existing[String(def.level)]) throw new AbilityPickError('already_chosen', 409, `เลือกท่าของเลเวล ${def.level} ไปแล้ว เปลี่ยนไม่ได้`);

  const abilityPicks = { ...existing, [String(def.level)]: def.id };
  const update = supabase.from('players').update({ ability_picks: abilityPicks }).eq('id', player.id);
  // First pick: guard on the column still being empty. Later picks only add a different level's key.
  const { data, error } = await (Object.keys(existing).length === 0 ? update.is('ability_picks', null) : update).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new AbilityPickError('conflict', 409, 'ข้อมูลเปลี่ยนไประหว่างเลือก ลองใหม่อีกครั้ง');

  return { abilityId: def.id, level: def.level, abilityPicks };
}
