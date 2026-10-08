import type { SupabaseClient } from '@supabase/supabase-js';
import { levelForXp } from './leveling';
import { SUBCLASS_LEVEL } from './subclassConstants';
import { isSubclassId, SUBCLASSES, type SubclassId } from './subclasses';

export class SubclassChoiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409,
    message?: string
  ) {
    super(message ?? code);
  }
}

/**
 * K5: picks the caller's own character's subclass, once, from level 3 on. Never blocks a round and can be done
 * any time after reaching the level (like the F4b ability choice). The write is guarded by `subclass_id is null`,
 * so a concurrent pick makes the update match no row -> conflict. If `subclass_id` does not exist yet
 * (migration 0030 not applied) nothing is written.
 */
export async function chooseSubclass(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; subclassId: unknown }
): Promise<{ subclassId: SubclassId }> {
  const find = (columns: string) =>
    supabase
      .from('players')
      .select(columns)
      .eq('campaign_id', params.campaignId)
      .eq('user_id', params.userId)
      .maybeSingle();

  const first = await find('id, xp, class_id, subclass_id');
  if (first.error) {
    const retry = await find('id, xp, class_id');
    if (retry.error) throw retry.error;
    if (!retry.data) throw new SubclassChoiceError('forbidden', 403);
    throw new SubclassChoiceError('unavailable', 409, 'ยังเลือกสายอาชีพไม่ได้ (ระบบยังไม่พร้อม)');
  }
  const player = first.data as unknown as { id: string; xp: number | null; class_id: string | null; subclass_id: string | null } | null;
  if (!player) throw new SubclassChoiceError('forbidden', 403);

  if (!isSubclassId(params.subclassId)) throw new SubclassChoiceError('invalid_subclass', 400, 'ไม่รู้จักสายอาชีพนี้');
  if (SUBCLASSES[params.subclassId].classId !== player.class_id) {
    throw new SubclassChoiceError('wrong_class', 400, 'สายอาชีพนี้ไม่ใช่ของอาชีพตัวละครนี้');
  }
  if (levelForXp(Number(player.xp ?? 0)) < SUBCLASS_LEVEL) {
    throw new SubclassChoiceError('level_too_low', 409, `ต้องถึงเลเวล ${SUBCLASS_LEVEL} ก่อนจึงเลือกสายอาชีพได้`);
  }
  if (player.subclass_id) throw new SubclassChoiceError('already_chosen', 409, 'เลือกสายอาชีพไปแล้ว เปลี่ยนไม่ได้');

  const { data, error } = await supabase
    .from('players')
    .update({ subclass_id: params.subclassId })
    .eq('id', player.id)
    .is('subclass_id', null)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new SubclassChoiceError('conflict', 409, 'ข้อมูลเปลี่ยนไประหว่างเลือก ลองใหม่อีกครั้ง');

  return { subclassId: params.subclassId };
}
