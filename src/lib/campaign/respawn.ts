import type { SupabaseClient } from '@supabase/supabase-js';
import { CLASSES, resolveClassId, startingAbilities } from '@/lib/character/classes';
import { BASE_MAX_HP, LEVEL_XP_THRESHOLDS } from '@/lib/character/constants';
import { levelHpBonus } from '@/lib/character/leveling';
import { respawnLevel } from '@/lib/character/respawnLevel';
import { normalizeIdentityFields, type IdentityFields } from '@/lib/character/identity';
import { seedStartingKit } from '@/lib/inventory/startingKit';

export class RespawnError extends Error {
  constructor(
    readonly code: string,
    readonly status: 403 | 404 | 409,
    message?: string
  ) {
    super(message ?? code);
  }
}

export { respawnLevel };

// Columns that may not exist in production yet (migrations 0018, 0020, 0022, 0026); dropped when the error names them.
const OPTIONAL_COLUMNS = ['abilities', 'backstory', 'personality', 'goal', 'ability_choices_used', 'death_saves'];

/**
 * Replaces the caller's permanently dead character with a fresh one in the same room. The players
 * row is overwritten in place (unique (campaign, user)), so `created_at` (room ownership) and
 * `turn_order` stay. Items and gold of the old character already went to the corpse (H3a); whatever
 * pack is left is cleared and the class starting kit is seeded.
 */
export async function respawnPlayer(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; displayName: string; classId?: string; weaponId?: string } & IdentityFields
): Promise<{ playerId: string; level: number }> {
  const { data: me, error: meError } = await supabase
    .from('players')
    .select('id, status')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (meError) throw meError;
  if (!me) throw new RespawnError('not_found', 404, 'ไม่พบผู้เล่นในห้องนี้');
  if (me.status !== 'dead') throw new RespawnError('not_dead', 403, 'ตัวละครของคุณยังไม่ตาย');

  const { data: all, error: allError } = await supabase
    .from('players')
    .select('id, xp, status')
    .eq('campaign_id', params.campaignId);
  if (allError) throw allError;
  const living = (all ?? []).filter((p: any) => p.id !== me.id && p.status !== 'dead');
  const level = respawnLevel(living as { xp: number | null }[]);
  const classId = resolveClassId(params);
  const weaponId = CLASSES[classId].weaponId;
  const identity = normalizeIdentityFields(params);

  let payload: Record<string, unknown> = {
    display_name: params.displayName,
    class_id: classId,
    weapon_id: weaponId,
    status: 'active',
    xp: LEVEL_XP_THRESHOLDS[level - 1],
    gold: 0,
    max_hp: BASE_MAX_HP,
    hp: BASE_MAX_HP + levelHpBonus(level),
    revives_since_sanctuary: 0,
    ability_cooldown: 0,
    abilities: startingAbilities(classId),
    // a new character has spent no improvements: abilityChoicesAvailable(level, 0) are all unspent
    ability_choices_used: 0,
    death_saves: null,
    backstory: identity.backstory ?? null,
    personality: identity.personality ?? null,
    goal: identity.goal ?? null,
  };

  let result: { data: unknown[] | null; error: { message?: string } | null } | undefined;
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    result = await supabase.from('players').update(payload).eq('id', me.id).eq('status', 'dead').select('id');
    if (!result.error) break;
    const message = result.error.message ?? '';
    const missing = OPTIONAL_COLUMNS.filter((c) => c in payload && new RegExp(c, 'i').test(message));
    if (missing.length === 0) break;
    payload = Object.fromEntries(Object.entries(payload).filter(([k]) => !missing.includes(k)));
  }
  if (result?.error) throw result.error;
  if (!result?.data || result.data.length === 0) {
    throw new RespawnError('conflict', 409, 'ตัวละครนี้ถูกสร้างใหม่ไปแล้ว');
  }

  const { error: clearError } = await supabase.from('inventory_items').delete().eq('player_id', me.id);
  if (clearError) throw clearError;
  await seedStartingKit(supabase, { campaignId: params.campaignId, playerId: me.id, weaponId });

  return { playerId: me.id, level };
}
